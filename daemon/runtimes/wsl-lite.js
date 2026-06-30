"use strict";

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

function shellJoin(args) {
  return args.map(shellQuote).join(" ");
}

function defaultPathExpr() {
  return [
    "$HOME/.local/bin",
    "$HOME/.npm/_npx/c8ab89660c602c20/node_modules/.bin",
    "$HOME/.nvm/versions/node/v25.5.0/bin",
    "$HOME/.npm-global/bin",
    "$HOME/.bun/bin",
    "$HOME/.cargo/bin",
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
    "$PATH",
  ].join(":");
}

function commandLineWithFallback(commandArgs) {
  const commandName = String(commandArgs && commandArgs[0] || "");
  const commandLine = shellJoin(commandArgs);
  if (commandName === "codex") {
    return "if command -v codex >/dev/null 2>&1; then " + commandLine + "; " +
      "else exec npx --yes @openai/codex " + shellJoin(commandArgs.slice(1)) + "; fi";
  }
  return "exec " + commandLine;
}

function wslLiteShellArgs(commandArgs, distro, options = {}) {
  const parts = [
    "export PATH=\"" + defaultPathExpr().replace(/"/g, "\\\"") + "\"",
  ];
  if (options.cwd) parts.push("cd " + shellQuote(options.cwd) + " || exit 1");
  parts.push(options.commandLine || commandLineWithFallback(commandArgs));
  const args = [];
  if (distro) args.push("-d", String(distro));
  args.push("--exec", "/bin/sh", "-lc", parts.join("; "));
  return args;
}

module.exports = {
  commandLineWithFallback,
  defaultPathExpr,
  shellQuote,
  shellJoin,
  wslLiteShellArgs,
};
