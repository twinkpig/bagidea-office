"use strict";

function codexExecArgs({ cwd, threadId }) {
  const args = ["exec", "--json", "-C", String(cwd || ".")];
  if (threadId) args.push("resume", String(threadId), "-");
  else args.push("-");
  return args;
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

function codexSpawnSpec({ platform = process.platform, cwd, threadId, useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const wslCwd = mapWindowsPathToWsl(localCwd);
    const args = [];
    if (distro) args.push("-d", String(distro));
    args.push("--", "codex", ...codexExecArgs({ cwd: wslCwd, threadId }));
    return { command: "wsl.exe", args, cwd: localCwd, shell: false };
  }
  return {
    command: "codex",
    args: codexExecArgs({ cwd: localCwd, threadId }),
    cwd: localCwd,
    shell: false,
  };
}

function parseVersionOutput(out) {
  return String(out || "").trim().split(/\r?\n/)[0] || "";
}

module.exports = {
  codexExecArgs,
  codexSpawnSpec,
  parseCodexJsonLine,
  codexProgressLabel,
  codexTextFromEvent,
  mapWindowsPathToWsl,
  parseVersionOutput,
};
