"use strict";

function codexExecArgs({ cwd, threadId }) {
  const args = ["exec", "--json", "-C", String(cwd || ".")];
  if (threadId) args.push("resume", String(threadId), "-");
  else args.push("-");
  return args;
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function shellJoin(args) {
  return args.map(shellQuote).join(" ");
}

function parseCodexJsonLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function codexProgressLabel(ev) {
  const item = ev && ev.item;
  if (!item) return "";
  if (item.type === "command_execution") {
    const cmd = String(item.command || "").replace(/\s+/g, " ").trim();
    return "codex: " + (cmd || "command");
  }
  return item.type ? "codex: " + item.type : "";
}

function codexTextFromEvent(ev) {
  const item = ev && ev.item;
  if (ev && ev.type === "item.completed" && item && item.type === "agent_message")
    return String(item.text || "");
  return "";
}

function mapWindowsPathToWsl(input) {
  const p = String(input || "");
  if (!p) return "";
  const unc = p.match(/^\\\\wsl\.localhost\\[^\\]+\\(.+)$/i);
  if (unc) return "/" + unc[1].replace(/\\/g, "/").replace(/^\/+/, "");
  const drive = p.match(/^([a-zA-Z]):\\(.*)$/);
  if (drive) return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
  return p;
}

function wslUserShellArgs(commandArgs, distro) {
  const commandLine = shellJoin(commandArgs);
  const inner = "if [ -f ~/.zshrc ]; then . ~/.zshrc >/dev/null 2>&1 || true; fi; " +
    "if [ -f ~/.profile ]; then . ~/.profile >/dev/null 2>&1 || true; fi; " +
    "exec " + commandLine;
  const script = "shell=\"${SHELL:-}\"; " +
    "if [ -z \"$shell\" ] || [ ! -x \"$shell\" ]; then shell=$(getent passwd \"$(id -un)\" | cut -d: -f7 2>/dev/null || true); fi; " +
    "if [ -z \"$shell\" ] || [ ! -x \"$shell\" ]; then shell=/bin/sh; fi; " +
    "exec \"$shell\" -lc " + shellQuote(inner);
  const args = [];
  if (distro) args.push("-d", String(distro));
  args.push("--exec", "/bin/sh", "-lc", script);
  return args;
}

function codexSpawnSpec({ platform = process.platform, cwd, threadId, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = wslUserShellArgs(["codex", ...codexExecArgs({ cwd: wslCwd, threadId })], distro);
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return {
    command: "codex",
    args: codexExecArgs({ cwd: localCwd, threadId }),
    cwd: localCwd,
    shell: false,
  };
}

function codexVersionSpawnSpec({ platform = process.platform, useWsl, distro }) {
  if (platform === "win32" && useWsl) {
    return {
      command: "wsl.exe",
      args: wslUserShellArgs(["codex", "--version"], distro),
      shell: false,
    };
  }
  return { command: "codex", args: ["--version"], shell: false };
}

function parseVersionOutput(out) {
  const lines = String(out || "").replace(/\0/g, "").split(/\r?\n/)
    .map((s) => s.trim()).filter(Boolean);
  return lines.find((s) => /^codex(?:-cli)?\b/i.test(s) || /\bcodex\b/i.test(s)) || lines[0] || "";
}

module.exports = {
  codexExecArgs,
  codexSpawnSpec,
  codexVersionSpawnSpec,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
  parseVersionOutput,
};
