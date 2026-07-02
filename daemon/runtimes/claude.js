"use strict";

const cliOutput = require("./cli-output");

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function powerShellQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function shellJoin(args) {
  return args.map(shellQuote).join(" ");
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

function mapArgPathsToWsl(args) {
  const pathFlags = new Set(["--settings", "--mcp-config", "--add-dir", "-C"]);
  const out = [];
  for (let i = 0; i < (args || []).length; i++) {
    const arg = String(args[i]);
    out.push(arg);
    if (pathFlags.has(arg) && i + 1 < args.length) {
      out.push(mapWindowsPathToWsl(args[++i]));
    }
  }
  return out;
}

function wslUserShellArgs(commandArgs, distro, options = {}) {
  const cd = options.cwd ? "cd " + shellQuote(mapWindowsPathToWsl(options.cwd)) + " && " : "";
  const commandLine = shellJoin(commandArgs);
  const inner = "if [ -f ~/.zshrc ]; then . ~/.zshrc >/dev/null 2>&1 || true; fi; " +
    "if [ -f ~/.profile ]; then . ~/.profile >/dev/null 2>&1 || true; fi; " +
    cd + "exec " + commandLine;
  const script = "shell=\"${SHELL:-}\"; " +
    "if [ -z \"$shell\" ] || [ ! -x \"$shell\" ]; then shell=$(getent passwd \"$(id -un)\" | cut -d: -f7 2>/dev/null || true); fi; " +
    "if [ -z \"$shell\" ] || [ ! -x \"$shell\" ]; then shell=/bin/sh; fi; " +
    "exec \"$shell\" -lc " + shellQuote(inner);
  const args = [];
  if (distro) args.push("-d", String(distro));
  args.push("--exec", "/bin/sh", "-lc", script);
  return args;
}

function wslCommandLine(commandArgs, distro, options = {}) {
  const args = wslUserShellArgs(commandArgs, distro, options);
  const psArgs = args.map(powerShellQuote).join(" ");
  return "wsl.exe " + psArgs;
}

function claudeSpawnSpec({ platform = process.platform, cwd, args = [], useWsl, distro }) {
  const localCwd = String(cwd || ".");
  if (platform === "win32" && useWsl) {
    const mappedArgs = mapArgPathsToWsl(args);
    return {
      command: "wsl.exe",
      args: wslUserShellArgs(["claude", ...mappedArgs], distro, { cwd: localCwd }),
      cwd: localCwd,
      shell: false,
    };
  }
  return { command: "claude", args: args.slice(), cwd: localCwd, shell: true };
}

function defaultUseWsl({ platform = process.platform, configured } = {}) {
  if (configured !== undefined) return !!configured;
  return platform === "win32";
}

function claudeVersionSpawnSpec({ platform = process.platform, useWsl, distro }) {
  if (platform === "win32" && useWsl) {
    return {
      command: "wsl.exe",
      args: wslUserShellArgs(["claude", "--version"], distro),
      shell: false,
    };
  }
  return { command: "claude", args: ["--version"], shell: false };
}

function claudeLoginCommand({ platform = process.platform, useWsl, distro } = {}) {
  if (platform === "win32" && useWsl) return wslCommandLine(["claude"], distro);
  return "claude";
}

function claudeResumeCommand({ platform = process.platform, cwd, sid, useWsl, distro } = {}) {
  const args = sid ? ["claude", "--resume", String(sid)] : ["claude"];
  if (platform === "win32" && useWsl) return wslCommandLine(args, distro, { cwd });
  return sid ? "claude --resume " + shellQuote(sid) : "claude";
}

function claudeContinueCommand({ platform = process.platform, cwd, useWsl, distro } = {}) {
  if (platform === "win32" && useWsl) return wslCommandLine(["claude", "-c"], distro, { cwd });
  return "claude -c";
}

function claudeSessionProjectKey({ platform = process.platform, cwd, useWsl } = {}) {
  const p = platform === "win32" && useWsl ? mapWindowsPathToWsl(cwd) : String(cwd || "");
  return p.replace(/[^a-zA-Z0-9]/g, "-");
}

function claudeAuthCheckSpawnSpec({ platform = process.platform, useWsl, distro } = {}) {
  if (platform === "win32" && useWsl) {
    const script = "if [ -f ~/.claude/.credentials.json ] || " +
      "node -e 'const fs=require(\"fs\");try{const j=JSON.parse(fs.readFileSync(process.env.HOME+\"/.claude.json\",\"utf8\"));process.exit(j&&(j.oauthAccount||j.userID)?0:1)}catch{process.exit(1)}'; " +
      "then printf logged-in; else printf logged-out; fi";
    return {
      command: "wsl.exe",
      args: wslUserShellArgs(["/bin/sh", "-lc", script], distro),
      shell: false,
    };
  }
  return null;
}

function parseVersionOutput(out) {
  return cliOutput.parseVersionOutput(out, [/^claude(?:\s+code)?\b/i, /\bclaude\b/i]);
}

module.exports = {
  shellQuote,
  mapWindowsPathToWsl,
  mapArgPathsToWsl,
  wslUserShellArgs,
  claudeSpawnSpec,
  defaultUseWsl,
  claudeVersionSpawnSpec,
  claudeLoginCommand,
  claudeResumeCommand,
  claudeContinueCommand,
  claudeSessionProjectKey,
  claudeAuthCheckSpawnSpec,
  parseVersionOutput,
  cleanCliDiagnostic: cliOutput.cleanCliDiagnostic,
};
