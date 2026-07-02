# ADR 0002: Runtime Registry Is Authoritative

## Status

Accepted.

## Context

BagIdea Office has two relevant copies of registry data during local development:

- source repo: `daemon/registry.json`
- running Windows app: `F:\BagIdeaOffice\app\daemon\registry.json`

The running app registry may contain user-created agents, renamed agents,
provider choices, model settings, role assignments, and session-linked state
that do not exist in the source repo yet.

Copying the source registry over the running app registry can silently delete or
hide user-created agents. This happened once when investment agents were synced:
the new investment agents were kept, but previously created runtime agents such
as `goo` / `Tester`, `coder`, and `operator` disappeared from the UI until they
were recovered from runtime workspace and session traces.

## Decision

The running app registry is the authoritative source for user configuration.

Any future sync into `F:\BagIdeaOffice\app` must merge registry content instead
of replacing the whole file.

Required process:

1. Back up both registry files before editing or syncing.
2. Read the current runtime registry first.
3. Add new agents, roles, skills, tools, or provider definitions by key.
4. Preserve existing runtime agents and their provider/model/runtime settings.
5. Preserve existing runtime role profiles, skills, tools, MCP servers, and UI
   settings unless the user explicitly asks to remove them.
6. Validate JSON and skill references after the merge.
7. Restart only after the merged runtime registry is in place.

## What Not To Use

Do not use full-file copy for registry sync:

```text
cp daemon/registry.json /mnt/f/BagIdeaOffice/app/daemon/registry.json
```

Do not treat the source repo registry as the only truth when the user has been
creating or editing agents in the running app.

Do not delete runtime-only agent folders under `workspace/agents/*` just because
their ids are missing from the source repo registry. Those folders can be useful
for recovery because they preserve synced skills and session traces.

Do not commit recovery backups such as:

```text
daemon/registry.backup-restore-agents-*.json
```

They are local safety snapshots, not product data.

## Recovery Notes

If an overwrite happens again, inspect these runtime locations before making new
changes:

- `F:\BagIdeaOffice\app\daemon\sessions.json`
- `F:\BagIdeaOffice\app\workspace\agents\`
- `F:\BagIdeaOffice\app\workspace\agents\<agent-id>\.claude\skills\.synced.json`

These files can help reconstruct missing agents, names, runtimes, models, and
skill assignments.
