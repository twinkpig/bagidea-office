const test = require("node:test");
const assert = require("node:assert");
const {
  claudeSpawnSpec,
  defaultUseWsl,
  claudeVersionSpawnSpec,
  claudeLoginCommand,
  claudeResumeCommand,
  claudeSessionProjectKey,
  parseVersionOutput,
} = require("../runtimes/claude");

test("claudeSpawnSpec runs direct claude on non-Windows platforms", () => {
  assert.deepStrictEqual(claudeSpawnSpec({
    platform: "linux",
    cwd: "/home/aslen/repo",
    args: ["-p", "--output-format", "stream-json"],
  }), {
    command: "claude",
    args: ["-p", "--output-format", "stream-json"],
    cwd: "/home/aslen/repo",
    shell: true,
  });
});

test("claudeSpawnSpec runs through the WSL user shell on Windows when requested", () => {
  const spec = claudeSpawnSpec({
    platform: "win32",
    cwd: "F:\\repo",
    args: ["-p", "--settings", "F:\\BagIdeaOffice\\workspace\\.claude\\settings.json"],
    useWsl: true,
    distro: "Ubuntu-24.04",
  });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[5], /\/mnt\/f\/repo/);
  assert.match(spec.args[5], /claude/);
  assert.match(spec.args[5], /-p/);
  assert.match(spec.args[5], /\/mnt\/f\/BagIdeaOffice\/workspace\/\.claude\/settings\.json/);
  assert.strictEqual(spec.cwd, "F:\\repo");
  assert.strictEqual(spec.shell, false);
});

test("claudeVersionSpawnSpec uses the same WSL shell bridge", () => {
  const spec = claudeVersionSpawnSpec({ platform: "win32", useWsl: true });
  assert.strictEqual(spec.command, "wsl.exe");
  assert.deepStrictEqual(spec.args.slice(0, 3), ["--exec", "/bin/sh", "-lc"]);
  assert.match(spec.args[3], /claude/);
  assert.match(spec.args[3], /--version/);
  assert.strictEqual(spec.shell, false);
});

test("claudeLoginCommand opens WSL claude on Windows", () => {
  const command = claudeLoginCommand({ platform: "win32", useWsl: true, distro: "Ubuntu-24.04" });
  assert.match(command, /^wsl\.exe /);
  assert.match(command, /Ubuntu-24\.04/);
  assert.match(command, /claude/);
});

test("claudeResumeCommand maps cwd and resumes in WSL", () => {
  const command = claudeResumeCommand({
    platform: "win32",
    cwd: "C:\\Users\\aslen\\repo",
    sid: "abc123",
    useWsl: true,
  });
  assert.match(command, /^wsl\.exe /);
  assert.match(command, /\/mnt\/c\/Users\/aslen\/repo/);
  assert.match(command, /claude/);
  assert.match(command, /--resume/);
  assert.match(command, /abc123/);
});

test("claudeResumeCommand starts a fresh interactive claude when no sid exists", () => {
  assert.strictEqual(claudeResumeCommand({
    platform: "linux",
    cwd: "/home/aslen/repo",
  }), "claude");
});

test("claudeSessionProjectKey maps WSL cwd for Windows bridge", () => {
  assert.strictEqual(
    claudeSessionProjectKey({ platform: "win32", cwd: "F:\\repo", useWsl: true }),
    "-mnt-f-repo"
  );
});

test("parseVersionOutput trims Claude version output", () => {
  assert.strictEqual(parseVersionOutput("Claude Code 1.0.0\n"), "Claude Code 1.0.0");
});

test("defaultUseWsl enables the Claude WSL bridge by default on Windows only", () => {
  assert.strictEqual(defaultUseWsl({ platform: "win32" }), true);
  assert.strictEqual(defaultUseWsl({ platform: "linux" }), false);
  assert.strictEqual(defaultUseWsl({ platform: "win32", configured: false }), false);
  assert.strictEqual(defaultUseWsl({ platform: "win32", configured: true }), true);
});
