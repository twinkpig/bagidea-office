const test = require("node:test");
const assert = require("node:assert");
const {
  commandLineWithFallback,
  defaultPathExpr,
  wslLiteShellArgs,
} = require("../runtimes/wsl-lite");

test("defaultPathExpr includes stable CLI locations", () => {
  const p = defaultPathExpr();
  assert.match(p, /\$HOME\/\.local\/bin/);
  assert.match(p, /\$HOME\/\.npm\/_npx\/c8ab89660c602c20\/node_modules\/\.bin/);
  assert.match(p, /\$HOME\/\.nvm\/versions\/node\/v25\.5\.0\/bin/);
});

test("codex command line falls back to npx", () => {
  const line = commandLineWithFallback(["codex", "--version"]);
  assert.match(line, /command -v codex/);
  assert.match(line, /npx --yes @openai\/codex '--version'/);
});

test("wslLiteShellArgs expands HOME instead of single-quoting PATH", () => {
  const args = wslLiteShellArgs(["hermes", "--version"], "Ubuntu-24.04");
  assert.deepStrictEqual(args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(args[5], /export PATH="\$HOME\/\.local\/bin:/);
  assert.doesNotMatch(args[5], /export PATH='\$HOME/);
  assert.doesNotMatch(args[5], /~\/\.zshrc|~\/\.profile|getent passwd/);
});
