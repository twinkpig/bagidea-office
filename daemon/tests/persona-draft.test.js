const test = require("node:test");
const assert = require("node:assert");

const { buildPersonaDraftPrompt, personaDraftLanguageName } = require("../persona-draft");

test("personaDraftLanguageName maps UI language codes", () => {
  assert.strictEqual(personaDraftLanguageName("zh"), "Simplified Chinese");
  assert.strictEqual(personaDraftLanguageName("en"), "English");
  assert.strictEqual(personaDraftLanguageName("th"), "Thai");
  assert.strictEqual(personaDraftLanguageName("bad"), "the same language as the owner's brief");
});

test("buildPersonaDraftPrompt explicitly asks for Chinese text fields", () => {
  const prompt = buildPersonaDraftPrompt({
    name: "小研",
    role: "Researcher",
    brief: "擅长查资料，回复简洁",
    lang: "zh",
    skillMenu: "  web: web research",
    toolMenu: "  WebSearch: search web",
  });

  assert.match(prompt, /Write these JSON string fields in Simplified Chinese/);
  assert.match(prompt, /Agent name: 小研/);
  assert.match(prompt, /Owner's brief: 擅长查资料，回复简洁/);
  assert.doesNotMatch(prompt, /ไทย \/ English \/ ตามผู้ใช้/);
  assert.match(prompt, /\"language\":\"primary reply language in Simplified Chinese/);
});
