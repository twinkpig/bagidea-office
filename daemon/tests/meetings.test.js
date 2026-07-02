// Issue #31 — agent meeting enhancement.
// End-to-end test of the new meeting flow: structured phases, owner
// participation, live controls (pause/resume/end), and durable action items.
//
// We can't import server.js (it's a listen-on-require entrypoint, and WORKSPACE
// is hardcoded as __dirname/../workspace), so this is an integration test that
// boots an ISOLATED copy of the daemon in a temp dir:
//   - the whole daemon/ tree is copied (so __dirname resolves under the temp),
//   - workspace/ is created fresh with a stub registry (main + ceo + 2 staff),
//   - a fake `claude` is put first on PATH so meetings run with no API key and
//     no cost, producing deterministic output.
// The real daemon module code is exercised verbatim — only the environment is
// faked. Each test boots its own daemon on a random port and tears it down.
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const DAEMON_DIR = path.join(__dirname, "..");   // the real daemon/ we're testing

// ---- fake `claude` CLI -----------------------------------------------------
// Reads the prompt on stdin; emits a canned contribution, or — for the summary
// secretary prompt (detected by the word "secretary") — markdown minutes plus a
// fenced JSON actionItems array. This is what makes the test deterministic and
// free: no model, no network.
const CLAUDE_STUB = `#!/usr/bin/env node
let s = ""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => {
  const reply = () => {
    if (/secretary/i.test(s)) {
      if (/中文总结语言检查/.test(s)) {
        const chinese = /meeting's primary language|primary language/i.test(s);
        process.stdout.write(
          (chinese
            ? "## Summary\\n团队使用中文完成了讨论。\\n## Decisions\\n继续按中文会议结论推进。\\n## Conclusion\\n结论明确，没有阻塞。\\n## Open Questions\\n无。\\n\\n"
            : "## Summary\\nThe team discussed in English despite a Chinese transcript.\\n\\n") +
          "\`\`\`json\\n[]\\n\`\`\`\\n");
        return;
      }
      process.stdout.write(
        "## Summary\\nThe team aligned on the plan.\\n" +
        "## Decisions\\nShip the meeting enhancement.\\n" +
        "## Open Questions\\nNone.\\n\\n" +
        "\`\`\`json\\n" +
        "[{\\"owner\\":\\"nida\\",\\"text\\":\\"write the action-item tests\\",\\"due\\":\\"\\"}," +
        " {\\"owner\\":\\"bogus\\",\\"text\\":\\"should be dropped (unknown owner)\\",\\"due\\":\\"\\"}]" +
        "\\n\`\`\`\\n");
    } else {
      if (/long transcript/i.test(s)) {
        process.stdout.write("Long transcript line: " + "detail ".repeat(180));
      } else if (/historical context check/i.test(s)) {
        process.stdout.write(/Relevant prior meeting summaries selected by the owner:/i.test(s)
          ? "I can see selected prior meeting summaries."
          : "No selected prior meeting summaries.");
      } else if (/prompt language guard/i.test(s)) {
        const clean = !/[ก-๛]/.test(s);
        const expected = /中文/.test(s) ? "Simplified Chinese" : "English";
        const locked = new RegExp("reply only in " + expected, "i").test(s) &&
          /Do not switch to Thai, Japanese, English, or any other language/i.test(s);
        process.stdout.write(clean && locked
          ? "Meeting prompt locked " + expected + "."
          : "Meeting prompt leaked multilingual control text.");
      } else {
        process.stdout.write("Opening: my take on the topic, grounded in context.");
      }
    }
  };
  // Optional artificial delay so tests can exercise End-during-a-turn.
  const delay = Number(process.env.OFFICE_TEST_SLOW_MS || 0);
  if (delay) setTimeout(reply, delay); else reply();
});
`;

// A minimal roster: the director + two staff agents (meetings need ≥2). ceo is
// the owner and never a meeting participant.
function stubRegistry() {
  return {
    agents: {
      main: { name: "Main", role: "Director", prompt: "", provider: "claude" },
      ceo: { name: "CEO", role: "Owner", prompt: "" },
      nida: { name: "Nida", role: "Engineer", prompt: "thorough" },
      ton: { name: "Ton", role: "Engineer", prompt: "pragmatic" }
    },
    apiKeys: {}, providerConfig: {}, roles: ["Director", "Engineer"], skills: {},
    tools: [], mcpServers: {}, places: {}, heartbeatMin: 0, socialMin: 0, proposalMin: 0
  };
}

// Boot an isolated daemon. Returns { url, stop, tmp }.
// opts.slowMs: artificial claude-call delay (for the End-during-a-turn race).
async function bootIsolated(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-test-"));
  // Copy the daemon source so __dirname (and thus WORKSPACE) lives under tmp.
  await fs.promises.cp(DAEMON_DIR, path.join(tmp, "daemon"), { recursive: true });
  // Fresh, isolated workspace with just enough registry to run a meeting.
  const ws = path.join(tmp, "workspace");
  fs.mkdirSync(path.join(ws, "memory"), { recursive: true });
  fs.mkdirSync(path.join(ws, "meetings"), { recursive: true });
  // Private memory for nida only — proves memory injection is per-agent.
  fs.writeFileSync(path.join(ws, "memory", "nida.md"), "Nida remembers: prefer tests.");
  // The daemon reads registry.json from its OWN dir (daemon/registry.json).
  fs.writeFileSync(path.join(tmp, "daemon", "registry.json"), JSON.stringify(stubRegistry()));
  if (opts.backfillFixture) {
    const meetDir = path.join(ws, "meetings");
    const now = Date.now();
    const session = opts.backfillFixture.session || "legacy-meeting";
    const title = opts.backfillFixture.title || "legacy meeting";
    const summary = opts.backfillFixture.summary || "## Summary\nLegacy summary only.\n";
    const actions = opts.backfillFixture.actions || [];
    const groupLog = [{ who: "main", text: summary, ts: now - 2000, phase: "summary", isSummary: true }];
    const groupEntry = { key: session, sid: null, ts: now - 3000, title, agents: ["nida", "ton"], task: "disc-legacy", rounds: 1, expectedTurns: 2, log: groupLog };
    const participantNote = (agent) => ({
      who: "main",
      text: `🗣 Meeting trace: ${title}\n\nSummary:\n${summary}`,
      ts: now - 1000,
      phase: "meeting-summary",
      isSummary: true,
      meeting: session,
      meetingTitle: title,
      agents: ["nida", "ton"],
    });
    const legacy = {
      "@group": [groupEntry],
      nida: [{ key: "nida-thread", sid: null, ts: now - 500, title: "Nida thread", log: [participantNote("nida")] }],
      ton: [{ key: "ton-thread", sid: null, ts: now - 400, title: "Ton thread", log: [participantNote("ton")] }],
    };
    fs.writeFileSync(path.join(tmp, "daemon", "sessions.json"), JSON.stringify(legacy, null, 2));
    fs.writeFileSync(path.join(meetDir, `${session}.actions.json`), JSON.stringify(actions, null, 2));
  }
  // Fake claude on a PATH that wins.
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "claude"), CLAUDE_STUB);
  fs.chmodSync(path.join(bin, "claude"), 0o755);

  const port = 19000 + Math.floor(Math.random() * 999);
  const child = spawn(process.execPath, [path.join(tmp, "daemon", "server.js")], {
    env: { ...process.env, OEP_PORT: String(port),
      PATH: `${bin}:${process.env.PATH}`,
      ...(opts.slowMs ? { OFFICE_TEST_SLOW_MS: String(opts.slowMs) } : {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push(c.toString()));
  child.stderr.on("data", (c) => logs.push(c.toString()));
  // Wait for the listening line (boot builds the retrieval index etc.).
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("daemon did not boot: " + logs.join(""))), 20000);
    const check = (c) => { if (/listening/.test(c.toString())) { clearTimeout(t); resolve(); } };
    child.stdout.on("data", check);
    child.stderr.on("data", check);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    tmp,
    stop: () => { try { child.kill("SIGTERM"); } catch {} }
  };
}

function req(base, method, pathStr, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(`${base}${pathStr}`, {
      method, headers: body ? { "content-type": "application/json" } : {}
    }, (res) => {
      let d = ""; res.on("data", (c) => d += c); res.on("end", () => {
        let j = null; try { j = JSON.parse(d); } catch {}
        resolve({ status: res.statusCode, data: j, text: d });
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// Start a 2-agent, 1-round meeting and resolve with its session key + a poller.
async function startMeeting(base) {
  const r = await req(base, "POST", "/discuss",
    { agents: ["nida", "ton"], topic: "ship the meeting feature", rounds: 1 });
  assert.strictEqual(r.status, 200, "start meeting should be 200");
  assert.ok(r.data && r.data.session, "/discuss must return the session key");
  return r.data.session;
}

// Poll /sessions/log until the meeting has ≥N messages or timeout.
async function waitForMessages(base, session, n, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req(base, "GET",
      `/sessions/log?agent=${encodeURIComponent("@group")}&key=${encodeURIComponent(session)}`);
    if (r.data && r.data.log && r.data.log.length >= n) return r.data;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`timed out waiting for ${n} messages in ${session}`);
}

// Wait until a meeting is no longer live (the .actions.json + .md are written
// in the finally block, after the meeting ends).
async function waitForEnd(base, session, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req(base, "GET",
      `/sessions/log?agent=${encodeURIComponent("@group")}&key=${encodeURIComponent(session)}`);
    if (r.data && r.data.live === false) return r.data;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`meeting ${session} did not end in time`);
}

test("POST /discuss rejects an unknown agent id (validated against roster)", async () => {
  const d = await bootIsolated();
  try {
    const r = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ghost"], topic: "x", rounds: 1 });
    assert.strictEqual(r.status, 400, "unknown agent must be rejected");
    assert.match(r.text, /unknown agent: ghost/);
  } finally { d.stop(); }
});

test("a meeting tags transcript lines with phases and stays live while running", async () => {
  const d = await bootIsolated();
  try {
    const session = await startMeeting(d.url);
    // While running: live flag true.
    const mid = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("@group")}&key=${encodeURIComponent(session)}`);
    assert.strictEqual(mid.data.live, true, "meeting must be live while running");
    // ≥2 opening lines (one per agent), each tagged with a phase.
    const ended = await waitForMessages(d.url, session, 2);
    assert.ok(ended.log.every((m) => typeof m.phase === "string"),
      "every transcript line must carry a phase");
    assert.ok(ended.log.some((m) => m.phase === "opening"),
      "opening phase must appear (no decision/action phase)");
  } finally { d.stop(); }
});

test("POST /discuss/message injects a CEO line (phase:user); 404 when not live", async () => {
  const d = await bootIsolated();
  try {
    const session = await startMeeting(d.url);
    const r = await req(d.url, "POST", "/discuss/message",
      { session, text: "Owner weighs in." });
    assert.strictEqual(r.status, 200, "owner message to a live meeting is accepted");
    const log = await waitForMessages(d.url, session, 3);
    const ceo = log.log.find((m) => m.who === "ceo");
    assert.ok(ceo, "CEO line must be in the transcript");
    assert.strictEqual(ceo.phase, "user", "CEO line must be tagged phase:user");
  } finally { d.stop(); }
});

test("live controls: pause holds, resume continues, end exits cleanly", async () => {
  const d = await bootIsolated();
  try {
    const session = await startMeeting(d.url);
    // Pause: the next turn must not start. We assert by sending a control and
    // checking the response echoes paused state.
    const p = await req(d.url, "POST", "/discuss/control", { session, action: "pause" });
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.data.paused, true, "control must report paused:true");
    // Resumed.
    const rs = await req(d.url, "POST", "/discuss/control", { session, action: "resume" });
    assert.strictEqual(rs.data.paused, false, "control must report paused:false after resume");
    // End: the meeting must terminate (live flips to false).
    const end = await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    assert.strictEqual(end.data.ended, true);
    await waitForEnd(d.url, session);
  } finally { d.stop(); }
});

test("on end the meeting writes summary minutes + a validated .actions.json", async () => {
  const d = await bootIsolated();
  let session;
  try {
    session = await startMeeting(d.url);
    // Let it produce opening lines, then end so the summary secretary runs.
    await waitForMessages(d.url, session, 2);
    await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    await waitForEnd(d.url, session);
    const finalLog = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("@group")}&key=${encodeURIComponent(session)}`);
    assert.ok(finalLog.data.log.some((m) => m.isSummary && m.phase === "summary"),
      "meeting log must include the final summary/conclusion entry");
    const nidaSessions = await req(d.url, "GET", `/sessions?agent=${encodeURIComponent("nida")}`);
    assert.ok(nidaSessions.data.sessions.length, "participant should have a visible thread");
    const nidaKey = nidaSessions.data.sessions[0].key;
    const nidaLog = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("nida")}&key=${encodeURIComponent(nidaKey)}`);
    const trace = nidaLog.data.log.find((m) => m.phase === "meeting-summary" && m.meeting === session);
    assert.ok(trace, "participant thread must retain a meeting trace linked to the group meeting");
    assert.match(trace.text, /Meeting trace:/);
    assert.match(trace.text, /Your contributions:/);
  } finally { d.stop(); }
  // The daemon is stopped, but the meeting artifacts live on disk under tmp.
  const meetDir = path.join(d.tmp, "workspace", "meetings");
  const md = fs.readFileSync(path.join(meetDir, `${session}.md`), "utf8");
  assert.match(md, /## Summary/, "minutes must embed the secretary's summary");
  // Action items persist to their own store (NOT jobs.json) per ADR-0001.
  const actionsPath = path.join(meetDir, `${session}.actions.json`);
  assert.ok(fs.existsSync(actionsPath), ".actions.json must be written");
  const actions = JSON.parse(fs.readFileSync(actionsPath, "utf8"));
  assert.ok(Array.isArray(actions) && actions.length >= 1, "at least one action item");
  // Unknown owners are dropped by generateMeetingSummary's roster validation;
  // only the nida item survives (the bogus one is filtered out).
  assert.ok(actions.every((a) => a.owner === "nida"),
    "unknown owners must be rejected: " + JSON.stringify(actions));
  assert.ok(actions.every((a) => a.meeting === session && a.status === "open"),
    "every action item must reference the meeting + be open");
});

test("meeting transcript stores full long lines instead of truncating them", async () => {
  const d = await bootIsolated();
  try {
    const r = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "long transcript preservation", rounds: 1 });
    assert.strictEqual(r.status, 200);
    const session = r.data.session;
    const log = await waitForMessages(d.url, session, 2);
    const longLine = log.log.find((m) => String(m.text || "").startsWith("Long transcript line:"));
    assert.ok(longLine, "long meeting line must be present");
    assert.ok(longLine.text.length > 1000,
      `long meeting line should not be storage-truncated, got ${longLine.text.length}`);
  } finally { d.stop(); }
});

test("meeting summary uses the meeting's primary language", async () => {
  const d = await bootIsolated();
  try {
    const r = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "中文总结语言检查", rounds: 1 });
    assert.strictEqual(r.status, 200);
    const session = r.data.session;
    await waitForMessages(d.url, session, 2);
    await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    const final = await waitForEnd(d.url, session);
    const summary = final.log.find((m) => m.isSummary && m.phase === "summary");
    assert.ok(summary, "summary must be present");
    assert.match(summary.text, /团队使用中文完成了讨论/);
    assert.doesNotMatch(summary.text, /discussed in English/);
  } finally { d.stop(); }
});

test("meeting summary keeps follow-up drafts under the summary", async () => {
  const d = await bootIsolated();
  try {
    const r = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "follow-up draft summary check", rounds: 1 });
    assert.strictEqual(r.status, 200);
    const session = r.data.session;
    await waitForMessages(d.url, session, 2);
    await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    const final = await waitForEnd(d.url, session);
    const summary = final.log.find((m) => m.isSummary && m.phase === "summary");
    assert.ok(summary, "summary must be present");
    assert.match(summary.text, /Follow-up Drafts|会议跟进项草案/);
    assert.match(summary.text, /write the action-item tests/);
    const nidaSessions = await req(d.url, "GET", `/sessions?agent=${encodeURIComponent("nida")}`);
    const nidaLog = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("nida")}&key=${encodeURIComponent(nidaSessions.data.sessions[0].key)}`);
    const note = nidaLog.data.log.find((m) => m.phase === "meeting-summary" && m.meeting === session);
    assert.ok(note, "participant trace must exist");
    assert.match(note.text, /Follow-up Drafts|会议跟进项草案/);
  } finally { d.stop(); }
});

test("legacy meeting backfill merges historical follow-up drafts into summary notes", async () => {
  const d = await bootIsolated({ backfillFixture: {
    session: "legacy-meeting",
    title: "legacy follow-up check",
    summary: "## Summary\nLegacy summary only.\n",
    actions: [{ owner: "nida", text: "write the backfill test", due: "" }],
  } });
  try {
    const group = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("@group")}&key=${encodeURIComponent("legacy-meeting")}`);
    const groupSummary = group.data.log.find((m) => m.isSummary && m.phase === "summary");
    assert.ok(groupSummary, "group summary must be present");
    assert.match(groupSummary.text, /Follow-up Drafts|会议跟进项草案/);
    assert.match(groupSummary.text, /write the backfill test/);

    const nida = await req(d.url, "GET",
      `/sessions/log?agent=${encodeURIComponent("nida")}&key=${encodeURIComponent("nida-thread")}`);
    const note = nida.data.log.find((m) => m.phase === "meeting-summary" && m.meeting === "legacy-meeting");
    assert.ok(note, "participant trace must be backfilled");
    assert.match(note.text, /Follow-up Drafts|会议跟进项草案/);
    assert.match(note.text, /write the backfill test/);
  } finally { d.stop(); }
});

test("meeting turn prompts lock one language and avoid Thai control text", async () => {
  const d = await bootIsolated();
  try {
    const r = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "prompt language guard", rounds: 1 });
    assert.strictEqual(r.status, 200);
    const log = await waitForMessages(d.url, r.data.session, 2);
    assert.ok(log.log.some((m) => /Meeting prompt locked English/.test(m.text)),
      "ordinary English meeting prompts should lock English");
    const zh = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "中文 prompt language guard", rounds: 1 });
    assert.strictEqual(zh.status, 200);
    const zhLog = await waitForMessages(d.url, zh.data.session, 2);
    assert.ok(zhLog.log.some((m) => /Meeting prompt locked Simplified Chinese/.test(m.text)),
      "Chinese meeting prompts should lock Simplified Chinese");
    assert.ok(!log.log.some((m) => /Meeting prompt leaked multilingual control text/.test(m.text)),
      "multilingual control instructions must not leak into ordinary meeting prompts");
  } finally { d.stop(); }
});

test("meeting history search returns summaries and /discuss only injects selected meetings", async () => {
  const d = await bootIsolated();
  try {
    const oldSession = await startMeeting(d.url);
    await waitForMessages(d.url, oldSession, 2);
    await req(d.url, "POST", "/discuss/control", { session: oldSession, action: "end" });
    await waitForEnd(d.url, oldSession);

    const search = await req(d.url, "GET", "/meetings/search?q=ship");
    assert.strictEqual(search.status, 200);
    assert.ok(search.data.meetings.some((m) => m.key === oldSession),
      "search should return the finished meeting");
    const found = search.data.meetings.find((m) => m.key === oldSession);
    assert.match(found.summary, /The team aligned on the plan/);
    assert.deepStrictEqual(found.agents, ["nida", "ton"]);

    const plain = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "historical context check plain", rounds: 1 });
    assert.strictEqual(plain.status, 200);
    const plainLog = await waitForMessages(d.url, plain.data.session, 2);
    assert.ok(plainLog.log.some((m) => /No selected prior meeting summaries/.test(m.text)),
      "default meetings must not inject historical summaries");

    const selected = await req(d.url, "POST", "/discuss",
      { agents: ["nida", "ton"], topic: "historical context check selected", rounds: 1,
        historyMeetings: [oldSession] });
    assert.strictEqual(selected.status, 200);
    const selectedLog = await waitForMessages(d.url, selected.data.session, 2);
    assert.ok(selectedLog.log.some((m) => /I can see selected prior meeting summaries/.test(m.text)),
      "selected meeting summaries must be injected into the opening prompt");
  } finally { d.stop(); }
});

test("POST /discuss/message on a finished meeting returns 404", async () => {
  const d = await bootIsolated();
  try {
    const session = await startMeeting(d.url);
    await waitForMessages(d.url, session, 2);
    await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    await waitForEnd(d.url, session);
    const r = await req(d.url, "POST", "/discuss/message", { session, text: "late" });
    assert.strictEqual(r.status, 404, "message to a non-live meeting must 404");
  } finally { d.stop(); }
});

test("End pressed mid-turn drops the lagging reply (no ghost message after close)", async () => {
  // Slow claude so we can fire End while a turn is in flight, then assert the
  // minutes transcript stays small — the lagging reply must NOT be appended
  // after the meeting has closed. We wait on the FILE, not the live flag,
  // because the daemon flips live=false before writing minutes (the summary
  // call runs in between); keep the daemon alive until the file lands.
  const d = await bootIsolated({ slowMs: 700 });
  const meetDir = path.join(d.tmp, "workspace", "meetings");
  try {
    const session = await startMeeting(d.url);
    const mdPath = path.join(meetDir, `${session}.md`);
    await new Promise((r) => setTimeout(r, 150));
    await req(d.url, "POST", "/discuss/control", { session, action: "end" });
    for (let i = 0; i < 60 && !fs.existsSync(mdPath); i++)
      await new Promise((r) => setTimeout(r, 250));
    assert.ok(fs.existsSync(mdPath), "minutes must be written even after a quick End");
    const md = fs.readFileSync(mdPath, "utf8");
    const after = md.split(/## Transcript\n\n/)[1] || md;
    const transcriptLineCount = (after.match(/^\*\*\[/gm) || []).length;
    assert.ok(transcriptLineCount <= 2,
      `transcript should have ≤2 lines after a quick End, got ${transcriptLineCount} ` +
      "(lagging reply leaked past the End guard)");
  } finally { d.stop(); }
});
