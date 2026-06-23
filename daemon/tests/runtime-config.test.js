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
