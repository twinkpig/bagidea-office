# Codex Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-configurable Codex runtime to BagIdea Office while preserving the current Claude Code runtime and existing office event/UI behavior.

**Architecture:** Keep `runClaude(agent, prompt, opts)` as the compatibility entry point, but turn it into a runtime dispatcher. Existing Claude behavior moves behind `runClaudeRuntime`; Codex is added as a parallel runtime adapter that normalizes Codex JSONL into the same OEP events consumed by overlay and Godot. Roles become runtime templates through `roleProfiles`, while each agent can inherit or override the role runtime.

**Tech Stack:** Node.js built-ins (`node:test`, `assert`, `child_process`, `fs`, `path`), current daemon HTTP server, inline overlay HTML/JS, Codex CLI `codex exec --json`, existing Wry/Godot event stream.

---

## File Structure

- Create `daemon/runtime-config.js`
  - Owns runtime constants and pure registry resolution helpers.
  - Exports `VALID_RUNTIMES`, `normalizeRuntime`, `roleProfileFor`, `resolveAgentRuntime`, `effectiveAgentRuntime`, `runtimeLabel`.

- Create `daemon/runtimes/codex.js`
  - Owns Codex command construction, WSL path mapping, CLI availability helpers, and JSONL event parsing helpers.
  - Does not import `server.js`.

- Create `daemon/tests/runtime-config.test.js`
  - Pure unit tests for role/agent/default runtime precedence and compatibility.

- Create `daemon/tests/codex-runtime.test.js`
  - Pure unit tests for Codex JSONL parsing, event mapping, command args, and WSL path mapping.

- Modify `daemon/server.js`
  - Import runtime helpers.
  - Normalize `reg.roleProfiles` and `reg.defaultRuntime`.
  - Add runtime fields to `/registry`, `rosterEvt()`, and `/registry/agent`.
  - Expand `/registry/role` to save profile fields while remaining compatible with old `{ name, remove }`.
  - Rename current `runClaude` body to `runClaudeRuntime`.
  - Add dispatcher `runClaude()` / `runAgent()` and new `runCodexRuntime()`.
  - Add `/codex/status` diagnostic endpoint.
  - Keep plugin `ctx.runClaude` as compatibility alias and add `ctx.runAgent`.

- Modify `daemon/overlay.html`
  - Upgrade ROLES tab from name-only rows to role template rows.
  - Add role editor for runtime defaults.
  - Add AGENTS list runtime badge.
  - Add agent editor runtime inheritance/override selector.
  - Hide or dim Claude brain provider/model controls when effective runtime is Codex.
  - Add Codex diagnostic card to CONNECT tab.

- Modify `docs/guide/agents.md`
  - Document role runtime defaults and agent override.

- Modify `docs/guide/getting-started.md`
  - Add short note that Codex runtime uses the user's Codex CLI config and does not require BagIdea provider keys.

---

### Task 1: Runtime Resolution Helpers

**Files:**
- Create: `daemon/runtime-config.js`
- Test: `daemon/tests/runtime-config.test.js`

- [ ] **Step 1: Write failing tests for runtime precedence**

Create `daemon/tests/runtime-config.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert");
const {
  normalizeRuntime,
  roleProfileFor,
  resolveAgentRuntime,
  effectiveAgentRuntime,
  runtimeLabel,
} = require("../runtime-config");

test("normalizeRuntime accepts only known runtimes", () => {
  assert.strictEqual(normalizeRuntime("codex"), "codex");
  assert.strictEqual(normalizeRuntime("claude"), "claude");
  assert.strictEqual(normalizeRuntime("Claude Code"), "claude");
  assert.strictEqual(normalizeRuntime("CODEX"), "codex");
  assert.strictEqual(normalizeRuntime("bad"), "");
  assert.strictEqual(normalizeRuntime(""), "");
  assert.strictEqual(normalizeRuntime(null), "");
});

test("roleProfileFor returns empty object for old string-only roles", () => {
  const reg = { roles: ["Engineer"] };
  assert.deepStrictEqual(roleProfileFor(reg, "Engineer"), {});
});

test("roleProfileFor returns the configured profile", () => {
  const reg = { roleProfiles: { Engineer: { runtime: "codex", tier: 2 } } };
  assert.deepStrictEqual(roleProfileFor(reg, "Engineer"), { runtime: "codex", tier: 2 });
});

test("resolveAgentRuntime precedence is agent > role > default > claude", () => {
  const reg = {
    defaultRuntime: "claude",
    roleProfiles: {
      Engineer: { runtime: "codex" },
      Researcher: { runtime: "claude" },
    },
    agents: {
      kai: { role: "Engineer" },
      mika: { role: "Researcher", runtime: "codex" },
      nora: { role: "Reviewer" },
    },
  };

  assert.deepStrictEqual(resolveAgentRuntime(reg, "kai"), {
    runtime: "codex",
    source: "role",
    role: "Engineer",
  });
  assert.deepStrictEqual(resolveAgentRuntime(reg, "mika"), {
    runtime: "codex",
    source: "agent",
    role: "Researcher",
  });
  assert.deepStrictEqual(resolveAgentRuntime(reg, "nora"), {
    runtime: "claude",
    source: "default",
    role: "Reviewer",
  });
  assert.deepStrictEqual(resolveAgentRuntime(reg, "missing"), {
    runtime: "claude",
    source: "default",
    role: "",
  });
});

test("effectiveAgentRuntime returns only the runtime string", () => {
  const reg = { defaultRuntime: "codex", agents: { kai: { role: "Engineer" } } };
  assert.strictEqual(effectiveAgentRuntime(reg, "kai"), "codex");
});

test("runtimeLabel is stable for UI badges", () => {
  assert.strictEqual(runtimeLabel("claude"), "Claude Code");
  assert.strictEqual(runtimeLabel("codex"), "Codex");
  assert.strictEqual(runtimeLabel("bad"), "Claude Code");
});
```

- [ ] **Step 2: Run the failing runtime-config test**

Run:

```bash
node --test daemon/tests/runtime-config.test.js
```

Expected:

```text
not ok 1 - daemon/tests/runtime-config.test.js
Cannot find module '../runtime-config'
```

- [ ] **Step 3: Implement `daemon/runtime-config.js`**

Create `daemon/runtime-config.js`:

```javascript
"use strict";

const VALID_RUNTIMES = new Set(["claude", "codex"]);

function normalizeRuntime(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "claude code") return "claude";
  return VALID_RUNTIMES.has(v) ? v : "";
}

function roleProfileFor(reg, role) {
  const name = String(role || "");
  const profiles = (reg && reg.roleProfiles) || {};
  const p = profiles[name];
  return p && typeof p === "object" ? p : {};
}

function resolveAgentRuntime(reg, agentId) {
  const agents = (reg && reg.agents) || {};
  const a = agents[agentId] || {};
  const role = String(a.role || "");
  const agentRuntime = normalizeRuntime(a.runtime);
  if (agentRuntime) return { runtime: agentRuntime, source: "agent", role };

  const rp = roleProfileFor(reg, role);
  const roleRuntime = normalizeRuntime(rp.runtime);
  if (roleRuntime) return { runtime: roleRuntime, source: "role", role };

  const def = normalizeRuntime(reg && reg.defaultRuntime) || "claude";
  return { runtime: def, source: "default", role };
}

function effectiveAgentRuntime(reg, agentId) {
  return resolveAgentRuntime(reg, agentId).runtime;
}

function runtimeLabel(runtime) {
  return normalizeRuntime(runtime) === "codex" ? "Codex" : "Claude Code";
}

module.exports = {
  VALID_RUNTIMES,
  normalizeRuntime,
  roleProfileFor,
  resolveAgentRuntime,
  effectiveAgentRuntime,
  runtimeLabel,
};
```

- [ ] **Step 4: Run the runtime-config test**

Run:

```bash
node --test daemon/tests/runtime-config.test.js
```

Expected:

```text
# pass 6
# fail 0
```

- [ ] **Step 5: Commit runtime-config helpers**

Run:

```bash
git add daemon/runtime-config.js daemon/tests/runtime-config.test.js
git commit -m "feat: add agent runtime resolver"
```

---

### Task 2: Codex Runtime Pure Helpers

**Files:**
- Create: `daemon/runtimes/codex.js`
- Test: `daemon/tests/codex-runtime.test.js`

- [ ] **Step 1: Write failing tests for Codex helpers**

Create directory and test:

```bash
mkdir -p daemon/runtimes
```

Create `daemon/tests/codex-runtime.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert");
const {
  codexExecArgs,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
} = require("../runtimes/codex");

test("codexExecArgs reads the prompt from stdin", () => {
  assert.deepStrictEqual(codexExecArgs({ cwd: "/home/a/project" }), [
    "exec", "--json", "-C", "/home/a/project", "-",
  ]);
});

test("codexExecArgs can resume a thread id", () => {
  assert.deepStrictEqual(codexExecArgs({ cwd: "/home/a/project", threadId: "tid-1" }), [
    "exec", "--json", "-C", "/home/a/project", "resume", "tid-1",
  ]);
});

test("parseCodexJsonLine returns null for non-json lines", () => {
  assert.strictEqual(parseCodexJsonLine("not json"), null);
  assert.strictEqual(parseCodexJsonLine(""), null);
});

test("parseCodexJsonLine parses valid JSON events", () => {
  assert.deepStrictEqual(parseCodexJsonLine('{"type":"turn.started"}'), { type: "turn.started" });
});

test("codexProgressLabel describes command execution", () => {
  const ev = {
    type: "item.started",
    item: { type: "command_execution", command: "/usr/bin/zsh -lc pwd" },
  };
  assert.strictEqual(codexProgressLabel(ev), "codex: /usr/bin/zsh -lc pwd");
});

test("codexTextFromEvent extracts final agent messages", () => {
  const ev = { type: "item.completed", item: { type: "agent_message", text: "ok" } };
  assert.strictEqual(codexTextFromEvent(ev), "ok");
});

test("codexTextFromEvent ignores command output", () => {
  const ev = { type: "item.completed", item: { type: "command_execution", aggregated_output: "noise" } };
  assert.strictEqual(codexTextFromEvent(ev), "");
});

test("mapWindowsPathToWsl maps drive-letter paths", () => {
  assert.strictEqual(mapWindowsPathToWsl("F:\\BagIdeaOffice\\app"), "/mnt/f/BagIdeaOffice/app");
  assert.strictEqual(mapWindowsPathToWsl("C:\\Users\\yangz\\repo"), "/mnt/c/Users/yangz/repo");
});

test("mapWindowsPathToWsl maps wsl localhost UNC paths", () => {
  assert.strictEqual(
    mapWindowsPathToWsl("\\\\wsl.localhost\\Ubuntu-24.04\\home\\aslen\\repo"),
    "/home/aslen/repo"
  );
});

test("mapWindowsPathToWsl leaves posix paths unchanged", () => {
  assert.strictEqual(mapWindowsPathToWsl("/home/aslen/repo"), "/home/aslen/repo");
});
```

- [ ] **Step 2: Run the failing Codex helper test**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js
```

Expected:

```text
not ok 1 - daemon/tests/codex-runtime.test.js
Cannot find module '../runtimes/codex'
```

- [ ] **Step 3: Implement `daemon/runtimes/codex.js`**

Create `daemon/runtimes/codex.js`:

```javascript
"use strict";

function codexExecArgs({ cwd, threadId }) {
  const args = ["exec", "--json", "-C", String(cwd || ".")];
  if (threadId) args.push("resume", String(threadId));
  else args.push("-");
  return args;
}

function parseCodexJsonLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function codexProgressLabel(ev) {
  const item = ev && ev.item;
  if (!item) return "";
  if (item.type === "command_execution") {
    const cmd = String(item.command || "").replace(/\s+/g, " ").trim();
    return "codex: " + (cmd || "command");
  }
  return item.type ? "codex: " + item.type : "";
}

function codexTextFromEvent(ev) {
  const item = ev && ev.item;
  if (ev && ev.type === "item.completed" && item && item.type === "agent_message")
    return String(item.text || "");
  return "";
}

function mapWindowsPathToWsl(input) {
  const p = String(input || "");
  if (!p) return "";
  const unc = p.match(/^\\\\wsl\.localhost\\[^\\]+\\(.+)$/i);
  if (unc) return "/" + unc[1].replace(/\\/g, "/").replace(/^\/+/, "");
  const drive = p.match(/^([a-zA-Z]):\\(.*)$/);
  if (drive) return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
  return p;
}

module.exports = {
  codexExecArgs,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
};
```

- [ ] **Step 4: Run Codex helper tests**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js
```

Expected:

```text
# pass 10
# fail 0
```

- [ ] **Step 5: Commit Codex helper module**

Run:

```bash
git add daemon/runtimes/codex.js daemon/tests/codex-runtime.test.js
git commit -m "feat: add codex runtime helpers"
```

---

### Task 3: Registry Runtime Fields

**Files:**
- Modify: `daemon/server.js`
- Modify: `daemon/tests/api.test.js`
- Test: `daemon/tests/runtime-config.test.js`

- [ ] **Step 1: Add pure tests for registry compatibility**

Append to `daemon/tests/runtime-config.test.js`:

```javascript
test("role profile runtime works with legacy roles array", () => {
  const reg = {
    roles: ["Engineer"],
    roleProfiles: { Engineer: { runtime: "codex" } },
    agents: { kai: { role: "Engineer" } },
  };
  assert.strictEqual(effectiveAgentRuntime(reg, "kai"), "codex");
});

test("blank agent runtime means inherit instead of force Claude", () => {
  const reg = {
    defaultRuntime: "claude",
    roleProfiles: { Engineer: { runtime: "codex" } },
    agents: { kai: { role: "Engineer", runtime: "" } },
  };
  assert.deepStrictEqual(resolveAgentRuntime(reg, "kai"), {
    runtime: "codex",
    source: "role",
    role: "Engineer",
  });
});
```

- [ ] **Step 2: Run runtime-config tests**

Run:

```bash
node --test daemon/tests/runtime-config.test.js
```

Expected:

```text
# pass 8
# fail 0
```

- [ ] **Step 3: Import runtime helpers in `daemon/server.js`**

Near the other top-level `require()` calls in `daemon/server.js`, add:

```javascript
const runtimeConfig = require("./runtime-config");
```

- [ ] **Step 4: Normalize registry runtime fields at startup**

In the registry normalization block near the existing `reg.agents = reg.agents || {};` and `reg.providerConfig = reg.providerConfig || {};`, add:

```javascript
reg.roles = Array.isArray(reg.roles) ? reg.roles : [];
reg.roleProfiles = reg.roleProfiles && typeof reg.roleProfiles === "object" ? reg.roleProfiles : {};
reg.defaultRuntime = runtimeConfig.normalizeRuntime(reg.defaultRuntime) || "claude";
for (const r of reg.roles) {
  if (!reg.roleProfiles[r]) reg.roleProfiles[r] = {};
}
```

Keep the existing default `main` and `ceo` setup untouched.

- [ ] **Step 5: Include runtime data in `rosterEvt()`**

Find `rosterEvt()` in `daemon/server.js`. Extend the returned object with:

```javascript
roleProfiles: reg.roleProfiles || {},
defaultRuntime: reg.defaultRuntime || "claude",
runtimes: ["claude", "codex"],
```

Do not remove existing fields.

- [ ] **Step 6: Store `runtime` in `/registry/agent`**

In the `POST /registry/agent` save object, after `model`, add:

```javascript
runtime: runtimeConfig.normalizeRuntime(p.runtime) || "",
```

The empty string is intentional: it means “inherit from role”.

- [ ] **Step 7: Extend `/registry/role` without breaking old calls**

Replace the current `POST /registry/role` body handling with logic equivalent to:

```javascript
const { name, remove, profile } = JSON.parse(body);
const n = String(name || "").trim().slice(0, 40);
if (!n) throw new Error("no name");
reg.roleProfiles = reg.roleProfiles || {};
if (remove) {
  reg.roles = reg.roles.filter((r) => r !== n);
  delete reg.roleProfiles[n];
} else {
  if (!reg.roles.includes(n)) reg.roles.push(n);
  const cur = reg.roleProfiles[n] || {};
  const incoming = profile && typeof profile === "object" ? profile : {};
  reg.roleProfiles[n] = {
    ...cur,
    runtime: runtimeConfig.normalizeRuntime(incoming.runtime !== undefined ? incoming.runtime : cur.runtime) || "",
    tier: incoming.tier !== undefined ? Math.min(Math.max(Number(incoming.tier) || 3, 1), 3) : cur.tier,
    skills: Array.isArray(incoming.skills) ? incoming.skills.filter((s) => reg.skills[s]) : (cur.skills || []),
    tools: Array.isArray(incoming.tools) ? incoming.tools : (cur.tools || []),
    personaSeed: String(incoming.personaSeed !== undefined ? incoming.personaSeed : (cur.personaSeed || "")).slice(0, 2000),
  };
}
saveReg();
pushRoster();
```

When `profile` is omitted, this still creates a role like the old endpoint.

- [ ] **Step 8: Add API shape assertion**

Append to `daemon/tests/api.test.js` inside `Roster API Check`, after existing assertions:

```javascript
assert.ok(res.data.hasOwnProperty('roleProfiles'));
assert.ok(res.data.hasOwnProperty('defaultRuntime'));
```

This test skips when the daemon is not running, matching the existing style.

- [ ] **Step 9: Run focused tests**

Run:

```bash
node --test daemon/tests/runtime-config.test.js daemon/tests/api.test.js
```

Expected without daemon:

```text
# pass 8
# skipped 1 or more API tests with "Daemon not running at 127.0.0.1:8787"
# fail 0
```

Expected with daemon:

```text
# fail 0
```

- [ ] **Step 10: Commit registry runtime fields**

Run:

```bash
git add daemon/server.js daemon/tests/api.test.js daemon/tests/runtime-config.test.js
git commit -m "feat: store role runtime profiles"
```

---

### Task 4: Runtime Dispatcher Without Behavior Change

**Files:**
- Modify: `daemon/server.js`
- Test: existing daemon tests

- [ ] **Step 1: Rename the current implementation function**

In `daemon/server.js`, change:

```javascript
function runClaude(agent, prompt, opts = {}) {
```

to:

```javascript
function runClaudeRuntime(agent, prompt, opts = {}) {
```

Do not change the body in this step.

- [ ] **Step 2: Add `runAgent` and compatibility wrapper**

Immediately before `runClaudeRuntime`, add:

```javascript
function runAgent(agent, prompt, opts = {}) {
  const runtime = runtimeConfig.effectiveAgentRuntime(reg, agent);
  if (runtime === "codex") return runCodexRuntime(agent, prompt, opts);
  return runClaudeRuntime(agent, prompt, opts);
}

function runClaude(agent, prompt, opts = {}) {
  return runAgent(agent, prompt, opts);
}
```

`runCodexRuntime` is added in Task 5. For this task, temporarily add this stub above `runAgent`:

```javascript
function runCodexRuntime(agent, prompt, opts = {}) {
  const task = "t" + ++taskCounter;
  broadcast({ type: "task.failed", agent, task, reason: "codex runtime not installed yet" });
  broadcast({ type: "chat.message", agent, task, text: "Codex runtime is configured for this agent, but this build has not installed the Codex adapter yet." });
  if (opts.onDone) try { opts.onDone("", false); } catch {}
  return task;
}
```

This stub is removed in Task 5.

- [ ] **Step 3: Add `ctx.runAgent` while keeping plugin compatibility**

Find the plugin init context near:

```javascript
broadcast, reg, saveReg, workspace: WORKSPACE, daemonDir: __dirname,
```

Make sure the context includes both:

```javascript
runClaude,
runAgent,
```

Existing plugins that call `ctx.runClaude` continue to work; new plugins can use `ctx.runAgent`.

- [ ] **Step 4: Run existing tests**

Run:

```bash
node --test daemon/tests/providers.test.js daemon/tests/watchdog.test.js daemon/tests/runtime-config.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: Smoke check syntax**

Run:

```bash
node --check daemon/server.js
```

Expected:

```text

```

`node --check` prints no output on success.

- [ ] **Step 6: Commit runtime dispatcher**

Run:

```bash
git add daemon/server.js
git commit -m "feat: dispatch agent runtime"
```

---

### Task 5: Codex Runtime Adapter In Server

**Files:**
- Modify: `daemon/server.js`
- Modify: `daemon/runtimes/codex.js`
- Test: `daemon/tests/codex-runtime.test.js`

- [ ] **Step 1: Add CLI command resolution helpers to Codex tests**

Append to `daemon/tests/codex-runtime.test.js`:

```javascript
const { codexSpawnSpec } = require("../runtimes/codex");

test("codexSpawnSpec runs direct codex on non-Windows platforms", () => {
  assert.deepStrictEqual(codexSpawnSpec({
    platform: "linux",
    cwd: "/home/aslen/repo",
  }), {
    command: "codex",
    args: ["exec", "--json", "-C", "/home/aslen/repo", "-"],
    cwd: "/home/aslen/repo",
    shell: false,
  });
});

test("codexSpawnSpec runs through wsl.exe on Windows when requested", () => {
  assert.deepStrictEqual(codexSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    useWsl: true,
    distro: "Ubuntu-24.04",
  }), {
    command: "wsl.exe",
    args: ["-d", "Ubuntu-24.04", "--", "codex", "exec", "--json", "-C", "/mnt/f/repo", "-"],
    cwd: "F:\\repo",
    shell: false,
  });
});
```

- [ ] **Step 2: Run failing Codex helper tests**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js
```

Expected:

```text
codexSpawnSpec is not a function
```

- [ ] **Step 3: Implement `codexSpawnSpec`**

In `daemon/runtimes/codex.js`, add:

```javascript
function codexSpawnSpec({ platform = process.platform, cwd, threadId, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = [];
    if (distro) args.push("-d", String(distro));
    args.push("--", "codex", ...codexExecArgs({ cwd: wslCwd, threadId }));
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return { command: "codex", args: codexExecArgs({ cwd: localCwd, threadId }), cwd: localCwd, shell: false };
}
```

Update `module.exports` to include `codexSpawnSpec`.

- [ ] **Step 4: Run Codex helper tests**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: Import Codex helper in `daemon/server.js`**

Near existing imports:

```javascript
const codexRuntime = require("./runtimes/codex");
```

- [ ] **Step 6: Replace the temporary `runCodexRuntime` stub**

Replace the stub from Task 4 with:

```javascript
function runCodexRuntime(agent, prompt, opts = {}) {
  const task = "t" + ++taskCounter;
  let entry = null;
  let isNew = false;
  if (opts.session && opts.session !== "new")
    entry = (sess[agent] || []).find((e) => e.key === opts.session);
  else if (!opts.session) entry = latestSession(agent);
  if (!entry) {
    entry = { key: "s" + Date.now(), sid: null, codexThread: null, ts: Date.now(),
      title: String(opts.logPrompt || prompt).replace(/\s+/g, " ").slice(0, 48), log: [] };
    sess[agent] = sess[agent] || [];
    sess[agent].push(entry);
    isNew = true;
  }
  if (entry.proj && !projectDir(entry.proj)) entry.proj = null;
  if (!isNew && opts.project && projectDir(opts.project) && entry.proj && entry.proj !== opts.project) {
    entry = { key: "s" + Date.now(), sid: null, codexThread: null, ts: Date.now(),
      title: String(opts.logPrompt || prompt).replace(/\s+/g, " ").slice(0, 48), log: [] };
    sess[agent].push(entry);
    isNew = true;
  }
  if (opts.project && projectDir(opts.project) && (isNew || !entry.proj))
    entry.proj = opts.project;
  const projId = entry.proj && projectDir(entry.proj) ? entry.proj : null;
  const cwd = projId ? projectDir(projId) : WORKSPACE;
  if (projId) ensureTrusted(cwd);

  if (projId) {
    projRuns[projId] = (projRuns[projId] || 0) + 1;
    projAgents[projId] = projAgents[projId] || {};
    projAgents[projId][agent] = (projAgents[projId][agent] || 0) + 1;
    broadcast({ type: "projects.changed" }, false);
  }

  entry.log = entry.log || [];
  if (isNew && opts._notice) entry.log.push({ who: "agent", text: opts._notice, ts: Date.now() });
  entry.log.push({ who: "you", text: String(opts.logPrompt || prompt).slice(0, 4000), ts: Date.now() });
  while (entry.log.length > 200) entry.log.shift();
  saveSess();
  if (opts.onEntry) try { opts.onEntry(entry.key); } catch {}

  broadcast({ type: "task.started", agent, task, session: entry.key,
    title: String(opts.logPrompt || prompt).replace(/\s+/g, " ").slice(0, 90), runtime: "codex" });
  statBump("runs", agent);
  if (opts.resumable) pauseActive(agent, opts.resumePrompt || prompt, projId, entry.key, opts._tries);

  const a = reg.agents[agent] || {};
  let preamble = "";
  if (isNew && a && (a.prompt || a.persona || (a.skills || []).length)) {
    preamble = `<persona>\nYou are "${a.name}" (${a.role}).\n${personaText(a)}\n`;
    for (const sid of a.skills || []) {
      const sk = reg.skills[sid];
      if (sk) preamble += `\n<skill name="${sk.name}">\n${sk.content}\n</skill>\n`;
    }
    preamble += `\nCentral office notes live in workspace/notes.md. Read them when useful and append "- text" lines to leave notes for the CEO.\n`;
    preamble += memoryNote(agent, String(opts.logPrompt || prompt), projId);
    preamble += "</persona>\n\n";
  }
  if (isNew && agent === "main") {
    if (!preamble) preamble = `<persona>\nYou are the office Director ("main").\n</persona>\n\n`;
    preamble += `<role-lock>\nYou are this office's Director. Managing the team and delegating work is your primary job.\n</role-lock>\n\n`;
  }

  const spec = codexRuntime.codexSpawnSpec({
    cwd,
    threadId: "",
    useWsl: process.platform === "win32" && !!reg.codexUseWsl,
    distro: reg.codexWslDistro || "",
  });
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    shell: spec.shell,
    env: { ...process.env, ...(reg.apiKeys || {}), OFFICE_ADAPTER: "1", OFFICE_AGENT: agent, OFFICE_TASK: task },
  });

  if (projId) {
    (projChildren[projId] = projChildren[projId] || new Set()).add(child);
    child.on("close", () => {
      const s = projChildren[projId];
      if (s) { s.delete(child); if (!s.size) delete projChildren[projId]; }
    });
  }
  runChildren.set(task, { child, agent });

  const watchdog = new RunWatchdog({
    totalMs: RUN_TOTAL_MS, idleMs: RUN_IDLE_MS,
    onKill: (reason) => {
      console.error(`[codex] watchdog: ${agent}/${task} killed — ${reason}`);
      killTree(child);
      broadcast({ type: "task.failed", agent, task, session: entry.key, reason: `watchdog: ${reason}`, runtime: "codex" });
      fireDone(`(watchdog: ${reason})`, false);
    },
  });
  watchdog.start();

  const canSplit = !opts.noSub && !agent.includes("#");
  const mediaNote = agent.includes("#") ? "" : MEDIA_NOTE;
  const runtimeNote = `\n<runtime-identity>\nThis turn is running on Codex CLI. Use your configured Codex model and tools. If asked what runtime you are using, answer Codex.\n</runtime-identity>\n`;
  child.stdin.write(preamble + prompt + (canSplit ? SUB_NOTE : "") + mediaNote + runtimeNote + projectNote());
  child.stdin.end();

  let buf = "";
  const subTasks = [];
  let lastText = "";
  let errText = "";
  let doneFired = false;
  const releaseProj = () => {
    if (!projId) return;
    projRuns[projId] = Math.max(0, (projRuns[projId] || 1) - 1);
    const pa = projAgents[projId] || {};
    pa[agent] = Math.max(0, (pa[agent] || 1) - 1);
    if (!pa[agent]) delete pa[agent];
    broadcast({ type: "projects.changed" }, false);
  };
  const fireDone = (text, ok) => {
    if (doneFired) return;
    doneFired = true;
    watchdog.clear();
    runChildren.delete(task);
    releaseProj();
    if (opts.resumable) {
      if (ok) pauseClear(entry.key);
      else pauseClear(entry.key);
    }
    if (opts.onDone) try { opts.onDone(text, ok); } catch (e) { console.error("[codex onDone]", e); }
  };

  child.stdout.on("data", (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const ev = codexRuntime.parseCodexJsonLine(line);
      if (!ev) continue;
      if (ev.type === "thread.started" && ev.thread_id) {
        entry.codexThread = ev.thread_id;
        entry.ts = Date.now();
        saveSess();
      }
      const label = codexRuntime.codexProgressLabel(ev);
      if (label) {
        entry.log.push({ who: "tool", text: label, ts: Date.now() });
        while (entry.log.length > 200) entry.log.shift();
        saveSess();
        broadcast({ type: "task.progress", agent, task, tool: label, session: entry.key, runtime: "codex" });
        watchdog.touch();
      }
      let out = codexRuntime.codexTextFromEvent(ev);
      if (out) {
        watchdog.touch();
        if (canSplit && /(^|\n)\s*SUB:/.test(out)) {
          const kept = [], found = [];
          for (const ln of out.split("\n")) {
            const sm = ln.match(/^\s*SUB:\s*(.+)$/);
            if (sm && sm[1].trim()) found.push(sm[1].trim());
            else kept.push(ln);
          }
          if (found.length) {
            subTasks.push(...found);
            out = (kept.join("\n").trim() + `\n\n👻 Split into ${found.length} sub-agents:\n` +
              found.map((t, i) => `${i + 1}. ${t.slice(0, 80)}`).join("\n")).trim();
          }
        }
        lastText = out;
        entry.log.push({ who: "agent", text: String(out).slice(0, 8000), ts: Date.now(), model: "codex" });
        while (entry.log.length > 200) entry.log.shift();
        saveSess();
        broadcast({ type: "chat.message", agent, task, text: out, session: entry.key, model: "codex", runtime: "codex" });
      }
      if (ev.type === "turn.completed") {
        broadcast({ type: "task.completed", agent, task, session: entry.key, model: "codex", runtime: "codex", usage: ev.usage || {} });
        statBump("done", null, 0);
        if (subTasks.length) {
          doneFired = true;
          watchdog.clear();
          runChildren.delete(task);
          releaseProj();
          runSubAgents(agent, entry, subTasks.slice(0, 4), opts.onDone);
        } else {
          fireDone(lastText, true);
        }
      }
    }
  });
  child.stderr.on("data", (c) => {
    const s = c.toString();
    errText += s;
    if (errText.length > 8000) errText = errText.slice(-8000);
    console.error("[codex]", s.trim());
  });
  child.on("error", (e) => {
    broadcast({ type: "task.failed", agent, task, session: entry.key, reason: e.message, runtime: "codex" });
    broadcast({ type: "chat.message", agent, task, text: "Codex adapter error: " + e.message, session: entry.key, runtime: "codex" });
    fireDone("", false);
  });
  child.on("close", (code) => {
    if (!doneFired && code !== 0) {
      const msg = (errText || `codex exited with code ${code}`).trim().slice(0, 1200);
      broadcast({ type: "task.failed", agent, task, session: entry.key, reason: msg, runtime: "codex" });
      broadcast({ type: "chat.message", agent, task, text: "Codex failed: " + msg, session: entry.key, runtime: "codex" });
      fireDone(lastText, false);
    } else if (!doneFired) {
      broadcast({ type: "task.completed", agent, task, session: entry.key, model: "codex", runtime: "codex" });
      fireDone(lastText, !!lastText);
    }
  });
  return task;
}
```

Important implementation note: `MEDIA_NOTE` is currently local to `runClaudeRuntime`. Before using it in `runCodexRuntime`, move the media note string to a top-level constant `MEDIA_NOTE` near `SUB_NOTE`, and remove the duplicate local `const MEDIA_NOTE` from `runClaudeRuntime`.

- [ ] **Step 7: Run syntax check**

Run:

```bash
node --check daemon/server.js
```

Expected:

```text

```

- [ ] **Step 8: Run focused tests**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js daemon/tests/runtime-config.test.js daemon/tests/watchdog.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 9: Commit Codex server adapter**

Run:

```bash
git add daemon/server.js daemon/runtimes/codex.js daemon/tests/codex-runtime.test.js
git commit -m "feat: run agents with codex runtime"
```

---

### Task 6: Codex Diagnostic Endpoint

**Files:**
- Modify: `daemon/server.js`
- Test: `daemon/tests/codex-runtime.test.js`

- [ ] **Step 1: Add CLI status helper tests**

Append to `daemon/tests/codex-runtime.test.js`:

```javascript
const { parseVersionOutput } = require("../runtimes/codex");

test("parseVersionOutput trims a version string", () => {
  assert.strictEqual(parseVersionOutput("codex-cli 1.2.3\n"), "codex-cli 1.2.3");
});
```

- [ ] **Step 2: Implement `parseVersionOutput`**

In `daemon/runtimes/codex.js`, add:

```javascript
function parseVersionOutput(out) {
  return String(out || "").trim().split(/\r?\n/)[0] || "";
}
```

Export it.

- [ ] **Step 3: Add `/codex/status` endpoint**

In `daemon/server.js`, before the final 404 branch, add:

```javascript
  } else if (req.method === "GET" && req.url === "/codex/status") {
    const useWsl = process.platform === "win32" && !!reg.codexUseWsl;
    const distro = reg.codexWslDistro || "";
    const cmd = useWsl
      ? ["wsl.exe", ...(distro ? ["-d", distro] : []), "--", "codex", "--version"]
      : ["codex", "--version"];
    const c = spawn(cmd[0], cmd.slice(1), { shell: false });
    let out = "", err = "";
    c.stdout.on("data", (d) => out += d);
    c.stderr.on("data", (d) => err += d);
    c.on("error", (e) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, mode: useWsl ? "wsl" : "direct", error: e.message }));
    });
    c.on("close", (code) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: code === 0,
        mode: useWsl ? "wsl" : "direct",
        distro,
        version: codexRuntime.parseVersionOutput(out),
        error: code === 0 ? "" : String(err || out).trim().slice(0, 500),
      }));
    });
```

- [ ] **Step 4: Run checks**

Run:

```bash
node --test daemon/tests/codex-runtime.test.js
node --check daemon/server.js
```

Expected:

```text
# fail 0
```

and no `node --check` output.

- [ ] **Step 5: Commit Codex status endpoint**

Run:

```bash
git add daemon/server.js daemon/runtimes/codex.js daemon/tests/codex-runtime.test.js
git commit -m "feat: report codex cli status"
```

---

### Task 7: ROLES Template UI

**Files:**
- Modify: `daemon/overlay.html`

- [ ] **Step 1: Add client-side runtime globals**

Near the existing globals:

```javascript
let ROSTER = {}, REGROLES = [], REGSKILLS = {}, REGTOOLS = [], AUTOSKILLS = true, VERIFY = false;
```

Change to:

```javascript
let ROSTER = {}, REGROLES = [], REGROLEPROFILES = {}, REGSKILLS = {}, REGTOOLS = [], AUTOSKILLS = true, VERIFY = false;
let DEFAULT_RUNTIME = "claude", RUNTIMES = ["claude", "codex"];
```

- [ ] **Step 2: Add runtime helper functions in overlay**

Near `roleOf(id)`, add:

```javascript
function normRuntime(v) {
  v = String(v || "").toLowerCase();
  return v === "codex" ? "codex" : v === "claude" || v === "claude code" ? "claude" : "";
}
function runtimeName(v) {
  return normRuntime(v) === "codex" ? "Codex" : "Claude Code";
}
function roleProfile(role) {
  return (REGROLEPROFILES && REGROLEPROFILES[role]) || {};
}
function effectiveRuntimeForAgent(a) {
  const own = normRuntime(a && a.runtime);
  if (own) return own;
  const rp = roleProfile((a && a.role) || "");
  return normRuntime(rp.runtime) || normRuntime(DEFAULT_RUNTIME) || "claude";
}
```

- [ ] **Step 3: Store role profiles from roster sync**

In the WebSocket event handler branch that processes `roster.sync`, add assignments:

```javascript
REGROLEPROFILES = ev.roleProfiles || {};
DEFAULT_RUNTIME = ev.defaultRuntime || "claude";
RUNTIMES = ev.runtimes || ["claude", "codex"];
```

Keep the existing assignments for agents, roles, skills and tools.

- [ ] **Step 4: Replace ROLES list rendering**

Replace the current ROLES tab loop:

```javascript
for (const r of REGROLES) {
  const row = document.createElement("div");
  row.className = "arow";
  row.style.cursor = "default";
  row.innerHTML = `<div class="meta"><b>${r}</b></div>` +
    `<div class="winbtn hide" title="Remove role">✕</div>`;
  ...
}
```

with:

```javascript
for (const r of REGROLES) {
  const rp = roleProfile(r);
  const row = document.createElement("div");
  row.className = "arow";
  const rt = normRuntime(rp.runtime) || normRuntime(DEFAULT_RUNTIME) || "claude";
  row.innerHTML = `<div class="meta"><b>${esc(r)}</b>
    <span>Runtime: ${runtimeName(rt)} · 🎯${(rp.skills || []).length} · 🔧${(rp.tools || []).length}${rp.tier ? " · Tier " + rp.tier : ""}</span></div>
    <div class="winbtn" data-a="edit" title="Edit role defaults">✏</div>
    <div class="winbtn hide" data-a="del" title="Remove role">✕</div>`;
  row.querySelector('[data-a="edit"]').onclick = () => openRoleEditor(r);
  row.querySelector('[data-a="del"]').onclick = async () => {
    if (!await confirmDanger(`${t("ลบ role")}: ${r}`,
        t("role นี้จะถูกลบออกจากรายการ — agents ที่ตั้ง role นี้ไว้จะยังอยู่ แต่ role จะหายไป"), t("ลบ role"))) return;
    api("/registry/role", { name: r, remove: true }).then(() => openSettings("roles"));
  };
  list.appendChild(row);
}
```

- [ ] **Step 5: Add role editor**

Add this function before `openSkillEditor(id)`:

```javascript
function openRoleEditor(name) {
  modal.classList.add("open");
  const rp = roleProfile(name);
  const skills = new Set(rp.skills || []);
  const tools = new Set(rp.tools || []);
  modalCard.innerHTML = hdr("🧩 ROLE TEMPLATE") +
    `<div class="field"><label>ROLE NAME</label><input id="rName" maxlength="40"></div>
     <div class="field"><label>RUNTIME DEFAULT</label>
       <select id="rRuntime">
         <option value="">Office default (${runtimeName(DEFAULT_RUNTIME)})</option>
         <option value="claude">Claude Code</option>
         <option value="codex">Codex</option>
       </select>
       <div class="hint" style="font-size:10.5px;color:var(--dim);margin-top:4px">Agents can inherit this or force their own runtime.</div>
     </div>
     <div class="field"><label>DEFAULT TIER</label><select id="rTier">
       <option value="">No default</option>
       <option value="2">Lead</option>
       <option value="3">Staff</option>
     </select></div>
     <div class="field"><label>PERSONA SEED</label><textarea id="rSeed" style="min-height:70px"></textarea></div>
     <div class="field"><label>DEFAULT SKILLS</label><div class="checks" id="rSkills"></div></div>
     <div class="field"><label>DEFAULT TOOLS</label><div class="checks" id="rTools"></div></div>
     <div class="btnrow">
       <button id="rCancel">Cancel</button>
       <button class="primary" id="rSave">💾 Save</button>
     </div>`;
  modalCard.querySelector("#rName").value = name || "";
  modalCard.querySelector("#rRuntime").value = normRuntime(rp.runtime);
  modalCard.querySelector("#rTier").value = rp.tier ? String(rp.tier) : "";
  modalCard.querySelector("#rSeed").value = rp.personaSeed || "";
  buildChipPicker(modalCard.querySelector("#rSkills"), Object.keys(REGSKILLS).map((sid) =>
    ({ val: sid, label: REGSKILLS[sid].name, tip: REGSKILLS[sid].description || "" })), skills);
  buildChipPicker(modalCard.querySelector("#rTools"),
    REGTOOLS.map((t) => ({ val: t, label: t, tip: BUILTIN_DESC[t] || "" }))
      .concat(Object.keys(REGMCP).map((n) => ({ val: "mcp:" + n, label: "🔌 " + n, tip: (REGMCP[n] || {}).command || "" }))),
    tools);
  modalCard.querySelector("#rCancel").onclick = () => openSettings("roles");
  modalCard.querySelector("#rSave").onclick = async () => {
    const nextName = modalCard.querySelector("#rName").value.trim();
    if (!nextName) return modalCard.querySelector("#rName").focus();
    await api("/registry/role", {
      name: nextName,
      profile: {
        runtime: modalCard.querySelector("#rRuntime").value,
        tier: modalCard.querySelector("#rTier").value,
        personaSeed: modalCard.querySelector("#rSeed").value,
        skills: [...skills],
        tools: [...tools],
      },
    });
    openSettings("roles");
  };
}
```

Implementation note: `buildChipPicker` currently lives inside `openEditor`. Move it unchanged to top-level before `openRoleEditor`, then remove the nested copy from `openEditor`. This is necessary so role editor and agent editor share the same picker.

- [ ] **Step 6: Change Add Role button to open the role editor**

Replace:

```javascript
if (v) api("/registry/role", { name: v }).then(() => openSettings("roles"));
```

with:

```javascript
if (v) openRoleEditor(v);
```

- [ ] **Step 7: Run overlay syntax sanity check**

Run:

```bash
node - <<'NODE'
const fs = require("fs");
const s = fs.readFileSync("daemon/overlay.html", "utf8");
for (const needle of ["function openRoleEditor", "REGROLEPROFILES", "Runtime:"]) {
  if (!s.includes(needle)) throw new Error("missing " + needle);
}
console.log("overlay role runtime markers found");
NODE
```

Expected:

```text
overlay role runtime markers found
```

- [ ] **Step 8: Commit ROLES template UI**

Run:

```bash
git add daemon/overlay.html
git commit -m "feat: configure runtime defaults by role"
```

---

### Task 8: AGENTS Runtime Inheritance UI

**Files:**
- Modify: `daemon/overlay.html`
- Modify: `daemon/server.js`

- [ ] **Step 1: Update AGENTS list badge**

In the AGENTS list row rendering, replace the current brain-only display:

```javascript
const _prov = a.provider || "claude";
const _brain = a.model ? a.model : (_prov === "claude" ? "Claude" : _prov);
const _brainTitle = `${_prov}${a.model ? " / " + a.model : ""}`;
_brainHtml = `<span class="brain" title="${_brainTitle}">🧠 ${_brain}</span>`;
```

with:

```javascript
const _rt = effectiveRuntimeForAgent(a);
const _prov = a.provider || "claude";
const _brain = _rt === "codex" ? "Codex" : (a.model ? a.model : (_prov === "claude" ? "Claude" : _prov));
const _brainTitle = _rt === "codex" ? "Codex CLI runtime" : `${_prov}${a.model ? " / " + a.model : ""}`;
_brainHtml = `<span class="brain" title="${_brainTitle}">⚙ ${runtimeName(_rt)}${_rt === "claude" ? " · 🧠 " + esc(_brain) : ""}</span>`;
```

- [ ] **Step 2: Add runtime selector to agent editor**

In `aiFields`, immediately after the JOB TITLE field, add:

```html
<div class="field"><label>⚙ RUNTIME</label>
  <select id="eRuntime"></select>
  <div id="eRuntimeHint" style="font-size:10.5px;color:var(--dim);margin-top:4px"></div>
</div>
```

- [ ] **Step 3: Wire runtime selector options**

After `roleSel.value = a.role;`, add:

```javascript
const runtimeSel = modalCard.querySelector("#eRuntime");
const runtimeHint = modalCard.querySelector("#eRuntimeHint");
const updateRuntimeUI = () => {
  const rp = roleProfile(roleSel.value);
  const inherited = normRuntime(rp.runtime) || normRuntime(DEFAULT_RUNTIME) || "claude";
  runtimeSel.innerHTML =
    `<option value="">Inherit from role: ${runtimeName(inherited)}</option>
     <option value="claude">Force Claude Code</option>
     <option value="codex">Force Codex</option>`;
  runtimeSel.value = normRuntime(a.runtime);
  const effective = runtimeSel.value || inherited;
  runtimeHint.textContent = effective === "codex"
    ? "Codex uses its own CLI config; BagIdea provider/model settings are ignored."
    : "Claude Code uses the provider/model selected below.";
  const brainField = modalCard.querySelector("#eProvider") && modalCard.querySelector("#eProvider").closest(".field");
  if (brainField) brainField.style.opacity = effective === "codex" ? ".45" : "1";
};
roleSel.onchange = updateRuntimeUI;
runtimeSel.onchange = updateRuntimeUI;
updateRuntimeUI();
```

If `roleSel.onchange` already exists after later edits, merge the behavior instead of overwriting it.

- [ ] **Step 4: Save agent runtime override**

In the `/registry/agent` payload inside `#eSave`, add:

```javascript
runtime: (modalCard.querySelector("#eRuntime") || {}).value || "",
```

Keep `provider` and `model` in the payload so switching back to Claude preserves old settings.

- [ ] **Step 5: Reject invalid runtime server-side**

In `POST /registry/agent`, confirm the implementation from Task 3 uses:

```javascript
runtime: runtimeConfig.normalizeRuntime(p.runtime) || "",
```

No other validation is needed.

- [ ] **Step 6: Run checks**

Run:

```bash
node --check daemon/server.js
node - <<'NODE'
const fs = require("fs");
const s = fs.readFileSync("daemon/overlay.html", "utf8");
for (const needle of ["id=\"eRuntime\"", "Force Codex", "runtime: (modalCard.querySelector"]) {
  if (!s.includes(needle)) throw new Error("missing " + needle);
}
console.log("overlay agent runtime markers found");
NODE
```

Expected:

```text
overlay agent runtime markers found
```

and no `node --check` output.

- [ ] **Step 7: Commit AGENTS runtime UI**

Run:

```bash
git add daemon/overlay.html daemon/server.js
git commit -m "feat: override runtime per agent"
```

---

### Task 9: CONNECT Codex Status Card

**Files:**
- Modify: `daemon/overlay.html`

- [ ] **Step 1: Add Codex card container to CONNECT HTML**

In CONNECT tab `bodyHtml`, after the providers field:

```html
<div class="field"><label>⚙ CODEX CLI — runtime status only</label>
  <div id="codexStatus">loading…</div>
</div>
```

- [ ] **Step 2: Render Codex status in `renderConnectTab()`**

At the end of `renderConnectTab()`, add:

```javascript
const codexBox = modalCard.querySelector("#codexStatus");
if (codexBox) {
  codexBox.innerHTML = `<div class="arow" style="cursor:default"><div class="meta"><b>⚙ Codex CLI</b><span>Checking…</span></div></div>`;
  fetch("/codex/status").then((x) => x.json()).then((s) => {
    codexBox.innerHTML = `<div class="arow" style="cursor:default">
      <div class="meta"><b>${s.ok ? "✅" : "⚠"} Codex CLI</b>
      <span>${s.ok ? esc(s.version || "Detected") : esc(s.error || "Not detected")} · ${esc(s.mode || "direct")}${s.distro ? " · " + esc(s.distro) : ""}</span></div>
    </div>`;
  }).catch((e) => {
    codexBox.innerHTML = `<div class="arow" style="cursor:default"><div class="meta"><b>⚠ Codex CLI</b><span>${esc(e.message || "status unavailable")}</span></div></div>`;
  });
}
```

- [ ] **Step 3: Run marker check**

Run:

```bash
node - <<'NODE'
const fs = require("fs");
const s = fs.readFileSync("daemon/overlay.html", "utf8");
for (const needle of ["CODEX CLI", "codexStatus", "/codex/status"]) {
  if (!s.includes(needle)) throw new Error("missing " + needle);
}
console.log("codex connect markers found");
NODE
```

Expected:

```text
codex connect markers found
```

- [ ] **Step 4: Commit CONNECT Codex card**

Run:

```bash
git add daemon/overlay.html
git commit -m "feat: show codex cli status"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/guide/agents.md`
- Modify: `docs/guide/getting-started.md`

- [ ] **Step 1: Update agents guide**

In `docs/guide/agents.md`, after the “Hire a new employee” field table, add:

```markdown
## Runtime defaults by role

Roles are templates. In ⚙ Settings → ROLES, each role can choose a default runtime:

| Runtime | What it means |
|---|---|
| Claude Code | Uses the existing Claude Code runtime, including the provider/model brain picker |
| Codex | Uses your installed Codex CLI and its own `$CODEX_HOME` config |

Each agent can inherit the role runtime or override it in the agent editor. Codex does not use BagIdea's provider keys; log in and configure Codex separately.
```

- [ ] **Step 2: Update getting started guide**

In `docs/guide/getting-started.md`, after the first Claude login instruction, add:

```markdown
Optional Codex runtime: if you assign a role or agent to Codex, BagIdea launches your local `codex` CLI. Configure Codex with its normal login/config flow; BagIdea only supplies the agent persona, working folder and office event display.
```

- [ ] **Step 3: Run docs marker check**

Run:

```bash
rg -n "Runtime defaults by role|Optional Codex runtime" docs/guide/agents.md docs/guide/getting-started.md
```

Expected:

```text
docs/guide/agents.md:...
docs/guide/getting-started.md:...
```

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/guide/agents.md docs/guide/getting-started.md
git commit -m "docs: explain role runtime selection"
```

---

### Task 11: Verification Pass

**Files:**
- Verify only

- [ ] **Step 1: Run all daemon unit tests**

Run:

```bash
node --test daemon/tests/*.test.js
```

Expected:

```text
# fail 0
```

Some API tests may skip when the daemon is not running.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check daemon/server.js
node --check daemon/runtime-config.js
node --check daemon/runtimes/codex.js
```

Expected:

```text

```

No output means success.

- [ ] **Step 3: Start the daemon locally if no instance is running**

Run:

```bash
node daemon/server.js
```

Expected:

```text
daemon listening on 127.0.0.1:8787
```

Leave it running for the next steps. If another daemon is already running, keep the existing one and skip starting a second instance.

- [ ] **Step 4: Verify registry includes runtime fields**

Run:

```bash
curl -s http://127.0.0.1:8787/registry | node -e '
let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => {
  const r = JSON.parse(s);
  if (!r.roleProfiles) throw new Error("missing roleProfiles");
  if (!r.defaultRuntime) throw new Error("missing defaultRuntime");
  console.log(r.defaultRuntime);
});
'
```

Expected:

```text
claude
```

or another configured runtime value.

- [ ] **Step 5: Verify Codex status endpoint**

Run:

```bash
curl -s http://127.0.0.1:8787/codex/status
```

Expected when Codex is available:

```json
{"ok":true,"mode":"direct","distro":"","version":"...","error":""}
```

Expected when unavailable:

```json
{"ok":false,"mode":"direct","error":"..."}
```

Both are acceptable; the endpoint must return JSON instead of hanging.

- [ ] **Step 6: Manual UI verification**

Use the desktop UI:

1. Open ⚙ Settings → ROLES.
2. Edit `Engineer`.
3. Set Runtime Default to `Codex`.
4. Save.
5. Open ⚙ Settings → AGENTS.
6. Open an Engineer agent.
7. Confirm Runtime shows `Inherit from role: Codex`.
8. Force runtime to `Claude Code`, save, reopen, confirm override persists.
9. Clear override back to inherit, save, reopen, confirm inherit returns.

Expected:

```text
Role runtime controls persist.
Agent runtime override persists.
AGENTS list shows Codex/Claude badges.
CONNECT shows Codex CLI diagnostic card.
```

- [ ] **Step 7: Manual runtime verification**

With a Codex-configured agent, send a small direct prompt:

```text
Say "codex online" and do not run any commands.
```

Expected events in daemon log:

```text
task.started
chat.message
task.completed
```

Expected UI:

```text
The configured agent enters WORKING state, displays a Codex response, then returns to IDLE.
```

- [ ] **Step 8: Manual multi-agent verification**

Start three tasks on three Codex-configured agents.

Expected:

```text
Three distinct task ids appear.
The live work strip shows separate active rows.
Each agent's chat/session receives its own message.
Godot shows all three agents working independently.
```

- [ ] **Step 9: Final status check**

Run:

```bash
git status --short
```

Expected:

```text
```

Only unrelated pre-existing files may remain. In this workspace, `workspace/.claude/settings.json` and `.codegraph/` may appear if they were already present before implementation; do not include them in feature commits unless the user explicitly asks.

---

## Spec Coverage Self-Review

- Runtime separate from provider: Tasks 1, 4, 5.
- ROLES as templates: Tasks 3 and 7.
- Agent override: Tasks 3 and 8.
- Codex no provider/key UI: Tasks 7, 8, 9.
- Codex JSONL to OEP events: Tasks 2 and 5.
- Windows/WSL launcher path: Tasks 2 and 5.
- Session traceability: Task 5 stores `entry.codexThread`.
- Error handling: Tasks 5 and 6.
- Tests: Tasks 1, 2, 3, 5, 6, 11.
- Documentation: Task 10.

No implementation task covers full Codex permission broker integration or Hermes integration because those are explicit non-goals in the design spec.
