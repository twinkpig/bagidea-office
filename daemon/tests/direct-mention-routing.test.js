const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const overlay = fs.readFileSync(path.join(root, "daemon", "overlay.html"), "utf8");
const server = fs.readFileSync(path.join(root, "daemon", "server.js"), "utf8");

test("@ mention stays in the current chat route instead of forcing Director", () => {
  assert.doesNotMatch(overlay, /routeAgent\s*=\s*prompt\.trim\(\)\.startsWith\("@"/);
  assert.doesNotMatch(overlay, /agent:\s*routeAgent/);
});

test("mentionShortcutFlow calls target agent directly without Director report pass", () => {
  const m = server.match(/function mentionShortcutFlow[\s\S]*?\n}\n\n\/\/ ---------------------------------------------------------------- report-back/);
  assert.ok(m, "mentionShortcutFlow block not found");
  const body = m[0];
  assert.doesNotMatch(body, /task\.delegated/);
  assert.doesNotMatch(body, /ceo\.summon/);
  assert.doesNotMatch(body, /verifyThenReport/);
  assert.match(body, /runClaude\(target,\s*inst/);
});

test("/chat parses leading @ mentions from any current pane", () => {
  assert.doesNotMatch(server, /\(agent === "ceo" \|\| agent === "main"\)\s*\?\s*parseAgentMentionShortcut/);
  assert.match(server, /const mention = parseAgentMentionShortcut\(origPrompt,\s*reg\.agents\)/);
});
