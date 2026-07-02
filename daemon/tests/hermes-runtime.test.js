const test = require("node:test");
const assert = require("node:assert");
const {
  hermesExecArgs,
  hermesInteractiveSpawnSpec,
  hermesSpawnSpec,
  hermesVersionSpawnSpec,
  parseHermesJsonLine,
  hermesProgressLabel,
  hermesTextFromEvent,
  mapWindowsPathToWsl,
  parseHermesTextOutput,
  parseVersionOutput,
} = require("../runtimes/hermes");

test("hermesExecArgs sends a quiet single query", () => {
  assert.deepStrictEqual(hermesExecArgs({ prompt: "hello" }), [
    "chat", "-q", "hello", "-Q", "--source", "tool",
  ]);
});

test("hermesExecArgs can resume a thread id", () => {
  assert.deepStrictEqual(hermesExecArgs({ prompt: "hello", threadId: "tid-1" }), [
    "chat", "-q", "hello", "-Q", "--source", "tool", "--resume", "tid-1",
  ]);
});

test("parseHermesTextOutput extracts session id and final text", () => {
  assert.deepStrictEqual(parseHermesTextOutput("session_id: sid-1\nOK\n"), {
    sessionId: "sid-1",
    text: "OK",
  });
});

test("parseHermesJsonLine returns null for non-json lines", () => {
  assert.strictEqual(parseHermesJsonLine("not json"), null);
  assert.strictEqual(parseHermesJsonLine(""), null);
});

test("parseHermesJsonLine parses valid JSON events", () => {
  assert.deepStrictEqual(parseHermesJsonLine('{"type":"turn.started"}'), { type: "turn.started" });
});

test("hermesProgressLabel describes command execution", () => {
  const ev = {
    type: "item.started",
    item: { type: "command_execution", command: "/usr/bin/zsh -lc pwd" },
  };
  assert.strictEqual(hermesProgressLabel(ev), "hermes: /usr/bin/zsh -lc pwd");
});

test("hermesProgressLabel describes tool use", () => {
  const ev = {
    type: "item.started",
    item: { type: "tool_use", name: "read_file" },
  };
  assert.strictEqual(hermesProgressLabel(ev), "hermes: read_file");
});

test("hermesTextFromEvent extracts final agent messages", () => {
  const ev = { type: "item.completed", item: { type: "agent_message", text: "ok" } };
  assert.strictEqual(hermesTextFromEvent(ev), "ok");
});

test("hermesTextFromEvent accepts assistant message aliases", () => {
  const ev = { type: "item.completed", item: { type: "assistant_message", text: "ok" } };
  assert.strictEqual(hermesTextFromEvent(ev), "ok");
});

test("mapWindowsPathToWsl maps drive-letter paths", () => {
  assert.strictEqual(mapWindowsPathToWsl("F:\\BagIdeaOffice\\app"), "/mnt/f/BagIdeaOffice/app");
  assert.strictEqual(mapWindowsPathToWsl("C:\\Users\\yangz\\repo"), "/mnt/c/Users/yangz/repo");
});

test("hermesSpawnSpec runs direct hermes on non-Windows platforms", () => {
  assert.deepStrictEqual(hermesSpawnSpec({
    platform: "linux",
    cwd: "/home/aslen/repo",
    prompt: "hello",
  }), {
    command: "hermes",
    args: ["chat", "-q", "hello", "-Q", "--source", "tool"],
    cwd: "/home/aslen/repo",
    shell: false,
  });
});

test("hermesSpawnSpec runs through the WSL user shell on Windows when requested", () => {
  const spec = hermesSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    prompt: "hello",
    useWsl: true,
    distro: "Ubuntu-24.04",
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[5], /hermes/);
  assert.match(spec.args[5], /chat/);
  assert.match(spec.args[5], /hello/);
  assert.match(spec.args[5], /\/mnt\/f\/repo/);
  assert.match(spec.args[5], /HOME\/\.local\/bin/);
  assert.doesNotMatch(spec.args[5], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.strictEqual(spec.cwd, "F:\\repo");
  assert.strictEqual(spec.shell, false);
});

test("hermesSpawnSpec reads WSL prompts from a UTF-8 file instead of argv", () => {
  const spec = hermesSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    prompt: "调研这家公司",
    promptFile: "F:\\repo\\.bagidea-hermes\\prompt.txt",
    useWsl: true,
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 3), ["--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[3], /prompt=\$\(cat '\/mnt\/f\/repo\/\.bagidea-hermes\/prompt\.txt'\)/);
  assert.match(spec.args[3], /"\$prompt"/);
  assert.doesNotMatch(spec.args[3], /调研这家公司/);
});

test("hermesInteractiveSpawnSpec opens sessions through the WSL user shell", () => {
  const spec = hermesInteractiveSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    threadId: "tid-1",
    useWsl: true,
    distro: "Ubuntu-24.04",
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[5], /\/mnt\/f\/repo/);
  assert.match(spec.args[5], /hermes/);
  assert.match(spec.args[5], /resume/);
  assert.match(spec.args[5], /tid-1/);
  assert.doesNotMatch(spec.args[5], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.doesNotMatch(spec.args[5], /exec\s+'\/bin\/sh'\s+'-lc'/);
  assert.strictEqual(spec.cwd, "F:\\repo");
  assert.strictEqual(spec.shell, false);
});

test("hermesVersionSpawnSpec uses the same WSL shell bridge", () => {
  const spec = hermesVersionSpawnSpec({ platform: "win32", useWsl: true });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 3), ["--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[3], /hermes/);
  assert.match(spec.args[3], /--version/);
  assert.doesNotMatch(spec.args[3], /~\/\.zshrc|~\/\.profile|getent passwd/);
  assert.strictEqual(spec.shell, false);
});

test("parseVersionOutput trims a version string", () => {
  assert.strictEqual(parseVersionOutput("hermes 1.2.3\n"), "hermes 1.2.3");
});

test("parseVersionOutput skips WSL warning noise", () => {
  assert.strictEqual(parseVersionOutput("w\u0000s\u0000l\u0000 warning\n\u0000hermes 1.2.3\n"), "hermes 1.2.3");
});
