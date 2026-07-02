"use strict";

const cliOutput = require("./cli-output");
const wslLite = require("./wsl-lite");

function hermesExecArgs({ prompt, threadId }) {
  const args = ["chat", "-q", String(prompt || ""), "-Q", "--source", "tool"];
  if (threadId) args.push("--resume", String(threadId));
  return args;
}

function hermesExecShellLine({ promptFile, threadId }) {
  const args = ["hermes", "chat", "-q", "$prompt", "-Q", "--source", "tool"];
  if (threadId) args.push("--resume", String(threadId));
  return "prompt=$(cat " + wslLite.shellQuote(mapWindowsPathToWsl(promptFile)) + "); exec " +
    args.map((arg) => arg === "$prompt" ? "\"$prompt\"" : wslLite.shellQuote(arg)).join(" ");
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function shellJoin(args) {
  return args.map(shellQuote).join(" ");
}

function parseHermesJsonLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function hermesProgressLabel(ev) {
  const item = ev && ev.item;
  if (!item) return "";
  if (item.type === "command_execution") {
    const cmd = String(item.command || "").replace(/\s+/g, " ").trim();
    return "hermes: " + (cmd || "command");
  }
  if (item.type === "tool_use") {
    const name = String(item.name || item.tool || "").replace(/\s+/g, " ").trim();
    return "hermes: " + (name || "tool_use");
  }
  return item.type ? "hermes: " + item.type : "";
}

function hermesTextFromEvent(ev) {
  const item = ev && ev.item;
  if (ev && ev.type === "item.completed" && item &&
      (item.type === "agent_message" || item.type === "assistant_message"))
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

function parseHermesTextOutput(out) {
  const lines = String(out || "").replace(/\0/g, "").split(/\r?\n/);
  let sessionId = "";
  const body = [];
  for (const line of lines) {
    const m = line.match(/^session_id:\s*(\S+)\s*$/i);
    if (m) {
      sessionId = m[1];
      continue;
    }
    body.push(line);
  }
  return { sessionId, text: body.join("\n").trim() };
}

function hermesSpawnSpec({ platform = process.platform, cwd, threadId, prompt, promptFile, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = promptFile
      ? wslLite.wslLiteShellArgs([], distro, {
          cwd: wslCwd,
          commandLine: hermesExecShellLine({ promptFile, threadId }),
        })
      : wslUserShellArgs(["hermes", ...hermesExecArgs({ prompt, threadId })], distro, { cwd: wslCwd });
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return {
    command: "hermes",
    args: hermesExecArgs({ prompt, threadId }),
    cwd: localCwd,
    shell: false,
  };
}

function hermesVersionSpawnSpec({ platform = process.platform, useWsl, distro }) {
  if (platform === "win32" && useWsl) {
    return {
      command: "wsl.exe",
      args: wslUserShellArgs(["hermes", "--version"], distro),
      shell: false,
    };
  }
  return { command: "hermes", args: ["--version"], shell: false };
}

function hermesInteractiveArgs({ threadId }) {
  return threadId ? ["resume", String(threadId)] : [];
}

function hermesInteractiveSpawnSpec({ platform = process.platform, cwd, threadId, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = wslUserShellArgs(["hermes", ...hermesInteractiveArgs({ threadId })], distro, { cwd: wslCwd });
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return {
    command: "hermes",
    args: hermesInteractiveArgs({ threadId }),
    cwd: localCwd,
    shell: false,
  };
}

function parseVersionOutput(out) {
  return cliOutput.parseVersionOutput(out, [/^hermes\b/i, /\bhermes\b/i]);
}

module.exports = {
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
  cleanCliDiagnostic: cliOutput.cleanCliDiagnostic,
};
