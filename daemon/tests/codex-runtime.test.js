const test = require("node:test");
const assert = require("node:assert");
const {
  codexExecArgs,
  codexSpawnSpec,
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

test("parseVersionOutput trims a version string", () => {
  assert.strictEqual(parseVersionOutput("codex-cli 1.2.3\n"), "codex-cli 1.2.3");
});
