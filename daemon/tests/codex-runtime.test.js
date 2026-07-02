const test = require("node:test");
const assert = require("node:assert");
const {
  codexExecArgs,
  codexInteractiveSpawnSpec,
  codexSpawnSpec,
  codexVersionSpawnSpec,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
  parseVersionOutput,
} = require("../runtimes/codex");

test("codexExecArgs reads the prompt from stdin", () => {
  assert.deepStrictEqual(codexExecArgs({ cwd: "/home/a/project" }), [
    "exec", "--json", "-C", "/home/a/project", "-",
  ]);
});

test("codexExecArgs can resume a thread id", () => {
  assert.deepStrictEqual(codexExecArgs({ cwd: "/home/a/project", threadId: "tid-1" }), [
    "exec", "--json", "-C", "/home/a/project", "resume", "tid-1", "-",
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

test("codexSpawnSpec runs through the WSL user shell on Windows when requested", () => {
  const spec = codexSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    useWsl: true,
    distro: "Ubuntu-24.04",
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[5], /codex/);
  assert.match(spec.args[5], /exec/);
  assert.match(spec.args[5], /\/mnt\/f\/repo/);
  assert.match(spec.args[5], /npx --yes @openai\/codex/);
  assert.match(spec.args[5], /HOME\/\.nvm\/versions\/node\/v25\.5\.0\/bin/);
  assert.doesNotMatch(spec.args[5], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.strictEqual(spec.cwd, "F:\\repo");
  assert.strictEqual(spec.shell, false);
});

test("codexInteractiveSpawnSpec opens sessions through the WSL user shell", () => {
  const spec = codexInteractiveSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    threadId: "tid-1",
    useWsl: true,
    distro: "Ubuntu-24.04",
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[5], /\/mnt\/f\/repo/);
  assert.match(spec.args[5], /codex/);
  assert.match(spec.args[5], /resume/);
  assert.match(spec.args[5], /tid-1/);
  assert.match(spec.args[5], /npx --yes @openai\/codex/);
  assert.doesNotMatch(spec.args[5], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.doesNotMatch(spec.args[5], /exec\s+'\/bin\/sh'\s+'-lc'/);
  assert.strictEqual(spec.cwd, "F:\\repo");
  assert.strictEqual(spec.shell, false);
});

test("codexVersionSpawnSpec uses the same WSL shell bridge", () => {
  const spec = codexVersionSpawnSpec({ platform: "win32", useWsl: true });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 3), ["--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[3], /codex/);
  assert.match(spec.args[3], /--version/);
  assert.match(spec.args[3], /npx --yes @openai\/codex/);
  assert.doesNotMatch(spec.args[3], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.strictEqual(spec.shell, false);
});

test("parseVersionOutput trims a version string", () => {
  assert.strictEqual(parseVersionOutput("codex-cli 1.2.3\n"), "codex-cli 1.2.3");
});

test("parseVersionOutput skips WSL warning noise", () => {
  assert.strictEqual(parseVersionOutput("w\u0000s\u0000l\u0000 warning\n\u0000codex-cli 1.2.3\n"), "codex-cli 1.2.3");
});
