const test = require("node:test");
const assert = require("node:assert");
const {
  cleanCliDiagnostic,
  isWslWarningLine,
  normalizeCliText,
  parseVersionOutput,
} = require("../runtimes/cli-output");

test("normalizeCliText removes UTF-16 NUL bytes from WSL output", () => {
  assert.strictEqual(normalizeCliText("w\u0000s\u0000l\u0000:\u0000 warning"), "wsl: warning");
});

test("isWslWarningLine detects localhost proxy warnings", () => {
  assert.strictEqual(isWslWarningLine("wsl: detected localhost proxy configuration"), true);
  assert.strictEqual(isWslWarningLine("检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理。"), true);
  assert.strictEqual(isWslWarningLine("zsh:1: command not found: codex"), false);
});

test("cleanCliDiagnostic drops WSL proxy and shell-init noise", () => {
  const input = [
    "w\u0000s\u0000l\u0000:\u0000 检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理。",
    "/bin/sh: 1: eval: source: not found",
    "zsh:1: command not found: codex",
  ].join("\n");
  assert.strictEqual(cleanCliDiagnostic(input), "zsh:1: command not found: codex");
});

test("parseVersionOutput skips warning lines before matching versions", () => {
  const input = "w\u0000s\u0000l\u0000:\u0000 localhost proxy WSL NAT\ncodex-cli 0.142.4\n";
  assert.strictEqual(parseVersionOutput(input, [/^codex(?:-cli)?\b/i]), "codex-cli 0.142.4");
});
