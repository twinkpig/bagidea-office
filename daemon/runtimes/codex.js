"use strict";

const cliOutput = require("./cli-output");
const wslLite = require("./wsl-lite");

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

function wslUserShellArgs(commandArgs, distro, options = {}) {
  return wslLite.wslLiteShellArgs(commandArgs, distro, options);
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

function codexInteractiveArgs({ threadId }) {
  return threadId ? ["resume", String(threadId)] : [];
}

function codexInteractiveSpawnSpec({ platform = process.platform, cwd, threadId, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = wslUserShellArgs(["codex", ...codexInteractiveArgs({ threadId })], distro, { cwd: wslCwd });
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return {
    command: "codex",
    args: codexInteractiveArgs({ threadId }),
    cwd: localCwd,
    shell: false,
  };
}

function parseVersionOutput(out) {
  return cliOutput.parseVersionOutput(out, [/^codex(?:-cli)?\b/i, /\bcodex\b/i]);
}

module.exports = {
  codexExecArgs,
  codexInteractiveSpawnSpec,
  codexSpawnSpec,
  codexVersionSpawnSpec,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
  parseVersionOutput,
  cleanCliDiagnostic: cliOutput.cleanCliDiagnostic,
};
