const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const overlay = fs.readFileSync(path.join(root, "daemon", "overlay.html"), "utf8");
const server = fs.readFileSync(path.join(root, "daemon", "server.js"), "utf8");
const shellMain = fs.readFileSync(path.join(root, "shell", "src", "main.rs"), "utf8");

test("@ mention menu shows effective runtime/provider tag", () => {
  assert.match(overlay, /function mentionRuntimeTag\(id\)/);
  assert.match(overlay, /runtimeTag:\s*mentionRuntimeTag\(id\)/);
  assert.match(overlay, /<span class="mrun">\$\{esc\(a\.runtimeTag\)\}<\/span>/);
});

test("chat chrome keeps only the hide window control", () => {
  assert.doesNotMatch(overlay, /id="fullBtn"/);
  assert.match(overlay, /id="hideBtn"/);
  assert.doesNotMatch(overlay, /id="miniBtn"/);
  assert.doesNotMatch(overlay, /shellPost\("mini"\)/);
  assert.doesNotMatch(overlay, /shellPost\("fullscreen"\)/);
});

test("office feed window is slightly larger", () => {
  assert.match(shellMain, /const FEED_W:\s*f64\s*=\s*360\.0;/);
  assert.match(shellMain, /logical_h \* 0\.56\)\.clamp\(360\.0,\s*620\.0\)/);
});

test("main chat is a normal non-topmost taskbar window by default", () => {
  assert.doesNotMatch(shellMain, /overlay_fullscreen/);
  assert.match(shellMain, /normal chat window: taskbar-visible and not always-on-top/);
  assert.match(shellMain, /with_always_on_top\(false\)/);
  assert.match(overlay, /document\.documentElement\.classList\.add\("native-window"\)/);
  assert.doesNotMatch(shellMain, /window\.setFullscreenMode && setFullscreenMode\(true\)/);
  assert.doesNotMatch(shellMain, /platform::region_round\(&overlay/);
});

test("chat bubbles show roster display names instead of uppercased ids", () => {
  assert.doesNotMatch(overlay, /document\.createTextNode\(who\.toUpperCase\(\)\)/);
  assert.match(overlay, /document\.createTextNode\(nameOf\(String\(who\)\.split\("#"\)\[0\]\)\)/);
});

test("Chinese UI has deterministic fallback for settings Thai chrome", () => {
  assert.match(overlay, /const PHRASE_ZH = \{/);
  assert.match(overlay, /function phraseFallback\(s\)/);
  assert.match(overlay, /phraseFallback\(key\)/);
  [
    "🔍 搜索 agent…",
    "🧠 MODELS / PROVIDERS — agent 的大脑",
    "⚙ DEFAULT RUNTIME — role/agent 未单独设置时使用这里",
    "✨ PERSONA COPILOT — 简短描述想要什么样的 agent",
    "🔧 TOOLS（留空 = 只读工具集 Read/Glob/Grep）",
    "偏 minimal、说话幽默的 UI 设计师",
  ].forEach((text) => assert.match(overlay, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("i18n observer also translates text mutations", () => {
  assert.match(overlay, /characterData:\s*true/);
  assert.match(overlay, /m\.type === "characterData"/);
});

test("live tool and progress labels have deterministic Chinese translations", () => {
  [
    ['"กำลังใช้": { en: "Using", zh: "正在使用"'],
    ['"กำลังใช้ปลั๊กอิน": { en: "Using plugin", zh: "正在使用插件"'],
    ['"กำลังทำงาน…": { en: "Working…", zh: "工作中…"'],
    ['"กำลังรับคำสั่ง…": { en: "Receiving the instruction…", zh: "正在接收指令…"'],
    ['"กำลังทำ %n งาน": { en: "Running %n task(s)", zh: "正在执行 %n 个任务"'],
    ['"🔴 LIVE meeting — พิมพ์เข้าวงประชุม": { en: "🔴 LIVE meeting — type into the meeting", zh: "🔴 会议直播中 — 输入内容加入会议"'],
    ['"🔴 กำลังทำงานนี้อยู่…": { en: "🔴 Running this job…", zh: "🔴 正在执行这个任务…"'],
  ].forEach(([text]) => assert.match(overlay, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(overlay, /return tr\("กำลังใช้"\) \+ " " \+ tool;/);
  assert.match(overlay, /ptt\.textContent = tr\("กำลังฟัง…"\)/);
  assert.match(overlay, /dot\.textContent = ev\.paused \? tr\("⏸ พักวงประชุม"\) : tr\("🔴 LIVE meeting — พิมพ์เข้าวงประชุม"\)/);
  assert.match(overlay, /const desc = j\.running \? tr\("🔴 กำลังทำงานนี้อยู่…"\)/);
});

test("participant threads render meeting traces with a group-log link", () => {
  assert.match(overlay, /function addMeetingTrace\(m\)/);
  assert.match(overlay, /m\.phase === "meeting-summary" \|\| m\.meeting/);
  assert.match(overlay, /查看完整会议记录/);
  assert.match(overlay, /openGroupLog\(key,\s*title,\s*"@group"\)/);
});

test("discussion launcher can search and select prior meeting summaries", () => {
  assert.match(overlay, /const selectedHistory = new Set\(\);/);
  assert.match(overlay, /id="dHistoryQ"/);
  assert.match(overlay, /id="dHistoryList"/);
  assert.match(overlay, /\/meetings\/search\?q=\$\{encodeURIComponent\(q\)\}&limit=12/);
  assert.match(overlay, /historyMeetings:\s*\[\.{3}selectedHistory\]/);
});

test("connect tab renders WSL bridge controls in provider-card style", () => {
  assert.match(overlay, /\.wslcfg/);
  assert.match(overlay, /const wslConfigRow = \(\{/);
  assert.match(overlay, /runtime: "Claude Code"/);
  assert.match(overlay, /checkboxClass: "cliUseWsl"/);
  assert.match(overlay, /cc\.querySelector\("\.cliUseWsl"\)\.checked/);
  assert.doesNotMatch(overlay, /<label class="chk"[^>]*>[^<]*<input[^>]*(?:id="claudeUseWsl"|class="cliUseWsl")[\s\S]*?WSL bridge<\/label>/);
});

test("meeting follow-up drafts stay labeled as drafts and merge into summaries", () => {
  assert.match(server, /const summaryWithDrafts = combineSummaryAndDrafts\(summary, stamped\);/);
  assert.match(server, /Summary:\\n\$\{summaryWithDrafts\}/);
  assert.match(overlay, /📝 会议跟进项草案 ·/);
  assert.match(overlay, /不会自动创建待办/);
  assert.doesNotMatch(overlay, /addChip\(`✅ <b>\$\{nameOf\(ev\.action\.owner\)\}/);
});

test("brains panel reports runtime-aware model tags", () => {
  assert.match(server, /const rt = runtimeConfig\.effectiveAgentRuntime\(reg, agent\);/);
  assert.match(server, /if \(rt !== "claude"\) return rt;/);
  assert.match(server, /runtime: runtimeConfig\.effectiveAgentRuntime\(reg, id\)/);
});

test("settings threads groups are collapsible and default collapsed", () => {
  assert.match(overlay, /const threadGroupsOpen = new Set\(\);/);
  assert.match(overlay, /const open = threadGroupsOpen\.has\(groupKey\);/);
  assert.match(overlay, /rows\.style\.display = open \? "" : "none";/);
  assert.match(overlay, /head\.onclick = \(\) => \{/);
  assert.match(overlay, /threadGroupsOpen\.delete\(groupKey\)/);
  assert.match(overlay, /threadGroupsOpen\.add\(groupKey\)/);
});

test("send locks onto the persisted session returned by /chat", () => {
  assert.match(server, /let entryKey = "";/);
  assert.match(server, /const captureEntry = \(key\) => \{ entryKey = key \|\| entryKey; \};/);
  assert.match(server, /JSON\.stringify\(\{ task,\s*session:\s*entryKey \}\)/);
  assert.match(overlay, /if \(j\.session\) \{ SESS\[target\] = j\.session; CUR\[target\] = j\.session; \}/);
  assert.match(overlay, /refreshThreadBar\(true\);\s*\/\/ reload the exact persisted thread for this send/);
});

test("chat rail avatars can be drag-reordered and persist to registry", () => {
  assert.match(overlay, /let railOrder = \[\];/);
  assert.match(overlay, /function syncRailOrder\(\)/);
  assert.match(overlay, /function moveRailAgent\(from,\s*to,\s*after = false\)/);
  assert.match(overlay, /seat\.draggable = canDrag;/);
  assert.match(overlay, /addEventListener\("dragstart"/);
  assert.match(overlay, /addEventListener\("drop"/);
  assert.match(overlay, /api\("\/registry\/agent\/order",\s*\{ ids: railOrder/);
  assert.match(server, /req\.method === "POST" && req\.url === "\/registry\/agent\/order"/);
  assert.match(server, /agentOrder: reg\.agentOrder \|\| Object\.keys\(reg\.agents \|\| \{\}\)/);
});
