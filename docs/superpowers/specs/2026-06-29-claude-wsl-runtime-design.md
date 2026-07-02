# Claude WSL Runtime Design

## Goal

On Windows, BagIdea Office must run every Claude Code runtime path through WSL's `claude` command when the Claude WSL bridge is enabled. Codex keeps its existing WSL bridge.

## Scope

- Main Claude agent runs.
- One-shot Claude text calls.
- Claude sub-agent runs.
- Claude login/status checks.
- Session resume/open-terminal commands.
- Session file lookup used for resume and context-size monitoring.
- CONNECT UI controls for saving Claude WSL bridge settings.

## Design

Add `daemon/runtimes/claude.js` as the single place that builds Claude CLI spawn specs and terminal commands. The helper maps Windows paths such as `F:\repo` to WSL paths such as `/mnt/f/repo`, runs `wsl.exe --exec /bin/sh -lc ...`, loads the user's shell startup files, and executes WSL `claude`.

`daemon/server.js` routes Claude calls through `spawnClaude()`, which delegates to the runtime helper. Registry state adds `claudeUseWsl` and `claudeWslDistro`; the command name is fixed to `claude`.

When Claude WSL mode is enabled, session lookup and size checks query WSL `~/.claude/projects` instead of the Windows home directory. This keeps resume and over-budget monitoring aligned with the actual WSL Claude session files.

## Testing

Add `daemon/tests/claude-runtime.test.js` covering direct non-Windows calls, Windows WSL spawn specs, version checks, login commands, resume commands, session key generation, and version parsing.
