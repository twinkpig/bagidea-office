# BagIdea Codex Runtime Integration Design

## Goal

让 BagIdea Office 可以把员工运行时从 Claude Code 切到 Codex，同时继续使用现有办公室 UI、员工名牌、任务进度、聊天记录、项目目录、委派和 sub-agent 展示。

第一版目标是“可见、可用、可回退”：在 UI 中按角色批量配置 Codex，任务仍然是一次任务一个 CLI 子进程，事件继续进入 `task.started`、`task.progress`、`chat.message`、`task.completed`、`task.failed`。

## Current System Facts

- `daemon/server.js` 的 `runClaude(agent, prompt, opts)` 是所有真实工作的入口。
- CodeGraph 显示 `runClaude` 影响 `dispatchJob`、`heartbeat`、`resumePausedTick`、`ceoFlow`、`makeDelegateFilter`、`verifyThenReport`、`runSubAgents`、`synthesize`、`restartOnFreshThread` 等流程。
- `/chat` 不应该直接硬插 Codex，否则 CEO 委派、定时任务、审核、自动恢复和 sub-agent 会走不到同一套行为。
- 当前 `ROLES` 只是职位名称列表，适合升级成“角色模板入口”。
- 当前 provider/key 系统是 Claude Code runtime 的“换后端脑子”能力，不适合作为 Codex 入口。Codex 是另一个 runtime，不是 provider。

## Product Model

### Runtime Is Separate From Provider

系统新增 `runtime` 概念：

- `claude`: 使用现有 Claude Code CLI 运行时。
- `codex`: 使用 Codex CLI 运行时。

Claude 的 `provider` / `model` 继续保留，只在 `runtime = "claude"` 时生效。Codex 不读取 BagIdea 的 LLM provider/key 配置，也不复制 CONNECT 页的模型供应商体系。

### ROLES Become Templates

`ROLES` 页从“职位名称列表”升级为“角色模板”：

- role name
- default runtime
- default Claude provider/model, only when runtime is Claude
- default skills
- default tools
- default tier
- optional persona seed

用户可以配置：

```text
Director  -> Claude Code
Engineer  -> Codex
Researcher -> Codex
Reviewer  -> Codex
```

新建员工选择角色时，自动继承角色模板。已有员工默认继续保持原行为，除非角色模板或员工覆盖被修改。

### Agent Can Override Role Defaults

员工仍是最终执行实例。运行时解析优先级：

```text
agent.runtime
  > roleProfiles[agent.role].runtime
  > reg.defaultRuntime
  > "claude"
```

同理，技能、工具和 tier 可以从 role template 继承，也可以在 agent editor 覆盖。第一版只要求 runtime 继承必须完成；技能、工具、tier 继承可以在 UI 中以“Apply role defaults”动作落地，避免一次性重写现有 agent 数据模型。

## Registry Design

保持旧字段兼容：

```json
{
  "roles": ["Director", "Engineer", "Researcher"],
  "roleProfiles": {
    "Engineer": {
      "runtime": "codex",
      "skills": ["code-review", "debug-detective"],
      "tools": ["Read", "Grep", "Bash"],
      "tier": 2
    }
  },
  "defaultRuntime": "claude",
  "agents": {
    "kai": {
      "name": "Kai",
      "role": "Engineer",
      "runtime": "",
      "provider": "claude",
      "model": ""
    }
  }
}
```

Compatibility rules:

- Missing `roleProfiles` means every role inherits `claude`.
- Missing `agent.runtime` means inherit from role.
- Existing `reg.roles` remains the display/order source.
- Existing agent `provider` and `model` remain untouched for Claude runtime.
- If an agent is changed from Codex back to Claude, its old provider/model settings still work.

## UI Design

### ROLES Tab

Each role row should show:

```text
Engineer
Runtime: Codex
Defaults: 2 skills · 3 tools · Tier 2
```

Clicking a role opens an editor:

- role name
- runtime segmented control: `Claude Code` / `Codex`
- if Claude: provider/model fields or a shortcut to existing brain picker
- skills checklist
- tools checklist
- tier selector
- persona seed textarea
- action: `Apply defaults to existing agents with this role`

The apply action should be explicit. Editing a role profile updates inheritance immediately for agents that have no explicit override, but should not silently overwrite explicit agent settings.

### AGENTS Tab

Agent list should show the effective runtime:

```text
Kai
Engineer · kai · Runtime: Codex · 2 skills · 3 tools
```

Agent editor should include:

- Role selector.
- Runtime selector with three states:
  - `Inherit from role: Codex`
  - `Force Claude Code`
  - `Force Codex`
- If runtime is Codex, hide or dim Claude provider/model controls with text: `Codex uses its own CLI config`.
- If runtime is Claude, keep the current brain/provider UI.

### CONNECT Tab

CONNECT should not gain Codex keys. It can show a read-only status card:

```text
Codex CLI
Detected: yes
Mode: WSL / direct
Config: managed by Codex
```

The card is diagnostic only. It should not ask for OpenAI keys or model names.

## Runtime Architecture

### New Runtime Dispatcher

Introduce a runtime boundary behind the current `runClaude` call path:

```text
runAgent(agent, prompt, opts)
  -> resolveAgentRuntime(agent)
  -> runtimes.claude.run(...) or runtimes.codex.run(...)
```

`runClaude` can remain as a compatibility wrapper during migration:

```text
function runClaude(agent, prompt, opts) {
  return runAgent(agent, prompt, opts);
}
```

This keeps all existing call sites working while the internals split into adapters.

### Claude Runtime

Move current spawn/parser logic into a Claude adapter without changing behavior:

- `claude -p --output-format stream-json --verbose`
- existing `--allowedTools`, `--settings`, `--mcp-config`, `--resume`
- existing provider/model env routing
- existing permission broker hook
- existing skill sync via Claude Code native skills

This move should be behavior-preserving.

### Codex Runtime

Use Codex as a one-shot CLI runtime:

```bash
codex exec --json -C <cwd> -
```

The adapter writes the full BagIdea preamble and user prompt to stdin, then ends stdin. Passing prompt via argv should be avoided because Codex may also read stdin and wait for extra input.

Codex uses its own installed configuration:

- `$CODEX_HOME/config.toml`
- Codex auth/login state
- Codex profiles and model defaults
- Codex sandbox/approval defaults

BagIdea should not inject provider keys or model routing for Codex in the first version.

### Codex Event Mapping

Observed Codex JSONL events include:

```json
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started"}
{"type":"item.started","item":{"type":"command_execution","command":"..."}}
{"type":"item.completed","item":{"type":"command_execution","aggregated_output":"...","exit_code":0}}
{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}
{"type":"turn.completed","usage":{"input_tokens":0,"output_tokens":0}}
```

Map them to existing OEP events:

| Codex event | BagIdea event |
|---|---|
| adapter starts child | `task.started` |
| `thread.started` | save runtime session id on thread entry |
| `item.started` command execution | `task.progress` with tool/command label |
| `item.completed` command execution | append tool log entry, optional progress detail |
| `item.completed` agent message | `chat.message` and update `lastText` |
| `turn.completed` | `task.completed` |
| process error or nonzero close before turn completed | `task.failed` |

The UI and Godot should not need new event types for first version.

### Codex Skills and Tools Boundary

Claude runtime keeps BagIdea's current native skill and MCP behavior.

Codex runtime first version uses prompt injection for BagIdea persona and assigned skills. It does not try to install BagIdea skills into `$CODEX_HOME`, and it does not translate BagIdea MCP/tool allowlists into Codex config.

Reason: Codex has its own config, sandbox and tool approval model. Rewriting BagIdea's Security Center to mediate Codex tools is a separate project. The first version should show Codex work clearly in the office and let Codex use its own trusted configuration.

## Windows / WSL Design

BagIdea GUI and daemon can run on Windows while Codex is installed in WSL.

Runtime launcher resolution:

1. If `codex` is available to the daemon process, run it directly.
2. If on Windows and Codex is not available directly, use `wsl.exe` to run Codex in the configured default distro.
3. If neither path works, emit `task.failed` with a clear setup message.

Path mapping for WSL:

- `C:\Users\name\repo` -> `/mnt/c/Users/name/repo`
- `F:\repo` -> `/mnt/f/repo`
- `\\wsl.localhost\<distro>\home\name\repo` -> `/home/name/repo`

If a project path cannot be mapped to WSL, the runtime should fail fast instead of starting Codex in the wrong directory.

Manual WSL Codex sessions are a separate mode. A plain `codex exec` launched manually in WSL will not appear in BagIdea. To make three manual Codex CLIs show as three office tasks, each must be launched through a `bagidea-codex` wrapper or equivalent bridge that posts normalized events to the Windows daemon.

## Sessions and Resume

Claude already persists session ids per working directory.

Codex first version should persist `thread_id` when `thread.started` appears, but it does not need full resume support before MVP. Behavior:

- New BagIdea thread starts a new Codex `exec`.
- The Codex `thread_id` is stored for traceability.
- Phase 4 adds resume support with `codex exec resume <thread_id> --json`.

This keeps first implementation low risk while preserving a path to resumable Codex threads.

## Error Handling

The adapter should handle:

- Codex CLI missing.
- WSL missing or distro missing.
- Working directory path mapping failure.
- JSONL parse errors on individual lines.
- Child process close before `turn.completed`.
- Watchdog timeout through the existing `RunWatchdog`.

Failures should emit both:

- `task.failed` for UI state.
- `chat.message` with a short human-readable reason.

## Rollout Plan

### Phase 1: Runtime and Role MVP

- Add runtime resolver and adapter boundary.
- Add `roleProfiles` and `defaultRuntime`.
- Upgrade ROLES UI to configure runtime defaults.
- Add AGENTS runtime inheritance/override UI.
- Add Codex runtime adapter using `codex exec --json`.
- Preserve current Claude behavior.

### Phase 2: WSL Launcher

- Add direct-vs-WSL Codex detection.
- Add path mapping.
- Add CONNECT diagnostic card for Codex CLI status.

### Phase 3: Manual Wrapper

- Add `bagidea-codex` wrapper for manually launched WSL Codex tasks.
- Each wrapper invocation creates one BagIdea task id.
- Three wrapper-launched Codex CLIs become three visible office task streams.

### Phase 4: Resume and Permission Integration

- Add Codex resume support.
- Decide whether Codex approvals stay entirely in Codex or get bridged into BagIdea Security Center.

## Testing Strategy

Unit tests:

- Runtime resolver precedence: agent > role > office default > claude.
- Registry migration from `roles` string array to `roleProfiles`.
- Codex JSONL parser maps fixture events to normalized task events.
- Missing CLI and path mapping failures produce `task.failed`.

Integration tests:

- Existing Claude `/chat` still emits the same core events.
- Agent with role default Codex emits `task.started`, `task.progress`, `chat.message`, `task.completed`.
- Agent override beats role default.
- Role edit affects only inheriting agents.

Manual verification:

- Configure `Engineer -> Codex`.
- Hire or edit three engineers.
- Start three tasks.
- Confirm three separate tasks appear in live work strip, feed, chat sessions and Godot agent status.

## Non-goals For First Version

- No Codex provider/key UI.
- No copying BagIdea model providers into Codex.
- No automatic mutation of `$CODEX_HOME`.
- No full Codex permission broker integration.
- No mandatory Hermes integration.
- No redesign of Godot world logic.

## Design Decision

Use ROLES as the human-friendly configuration entry and agent records as the execution truth. Add a runtime dispatcher under the existing `runClaude` call graph so every existing office workflow can run either Claude or Codex without duplicating orchestration logic.
