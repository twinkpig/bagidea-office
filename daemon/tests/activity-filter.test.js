const test = require("node:test");
const assert = require("node:assert");

const {
  shouldShowInOfficeFeed,
  shouldShowInThreadLog,
} = require("../activity-filter");

test("office feed hides plain chat and random social chatter", () => {
  assert.strictEqual(shouldShowInOfficeFeed({ type: "chat.message", text: "hello" }), false);
  assert.strictEqual(shouldShowInOfficeFeed({ type: "chat.message", social: true, text: "coffee?" }), false);
  assert.strictEqual(shouldShowInOfficeFeed({ type: "chat.message", ambient: true, text: "nice day" }), false);
});

test("office feed keeps user-readable task lifecycle events", () => {
  for (const ev of [
    { type: "task.started", agent: "goo" },
    { type: "task.completed", agent: "goo", model: "codex" },
    { type: "task.failed", agent: "goo", reason: "spawn hermes ENOENT" },
    { type: "task.delegated", agent: "main", target: "goo" },
    { type: "subagent.spawned", sub: "goo#1" },
    { type: "perm.requested", agent: "goo", tool: "Bash" },
    { type: "proposal.created", agent: "main" },
    { type: "memory.learned", agent: "main" },
    { type: "channel.message", channel: "telegram" },
    { type: "voice.say", agent: "main" },
  ]) {
    assert.strictEqual(shouldShowInOfficeFeed(ev), true, ev.type);
  }
});

test("office feed hides noisy progress and internal report tasks", () => {
  assert.strictEqual(shouldShowInOfficeFeed({ type: "task.progress", agent: "goo", tool: "Read" }), false);
  assert.strictEqual(shouldShowInOfficeFeed({ type: "task.started", title: "📨 Report from Researcher" }), false);
});

test("thread log hides social history rows but keeps real conversation and tool rows", () => {
  assert.strictEqual(shouldShowInThreadLog({ who: "agent", text: "random", social: true }), false);
  assert.strictEqual(shouldShowInThreadLog({ who: "agent", text: "mood", ambient: true }), false);
  assert.strictEqual(shouldShowInThreadLog({ who: "tool", text: "Read" }), true);
  assert.strictEqual(shouldShowInThreadLog({ who: "you", text: "please work" }), true);
  assert.strictEqual(shouldShowInThreadLog({ who: "agent", text: "done", model: "claude" }), true);
});
