const test = require("node:test");
const assert = require("node:assert");

const { parseAgentMentionShortcut } = require("../agent-mention");

const agents = {
  ceo: { name: "CEO" },
  main: { name: "Shino" },
  goo: { name: "Goo" },
  shino2: { name: "Shino Assistant" },
};

test("@id at the beginning targets a staff agent", () => {
  assert.deepStrictEqual(parseAgentMentionShortcut("@goo 查一下今天深圳天气", agents), {
    agent: "goo",
    instruction: "查一下今天深圳天气",
  });
});

test("@display name is case-insensitive", () => {
  assert.deepStrictEqual(parseAgentMentionShortcut("@gOo 查天气", agents), {
    agent: "goo",
    instruction: "查天气",
  });
});

test("@renamed display name resolves to the original agent id", () => {
  assert.deepStrictEqual(parseAgentMentionShortcut("@Tester 跑一下测试", {
    ...agents,
    goo: { name: "Tester" },
  }), {
    agent: "goo",
    instruction: "跑一下测试",
  });
});

test("does not target CEO or Director", () => {
  assert.strictEqual(parseAgentMentionShortcut("@main 查天气", agents), null);
  assert.strictEqual(parseAgentMentionShortcut("@Shino 查天气", agents), null);
  assert.strictEqual(parseAgentMentionShortcut("@ceo 查天气", agents), null);
});

test("invalid or mid-sentence mentions are ordinary text", () => {
  assert.strictEqual(parseAgentMentionShortcut("让 @goo 查天气", agents), null);
  assert.strictEqual(parseAgentMentionShortcut("@missing 查天气", agents), null);
  assert.strictEqual(parseAgentMentionShortcut("@goo", agents), null);
});

test("legacy DELEGATE protocol is not parsed as an @ shortcut", () => {
  assert.strictEqual(parseAgentMentionShortcut("DELEGATE: goo :: 查天气", agents), null);
});
