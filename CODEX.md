# CODEX.md

This file documents how Codex (the terminal coding assistant) should operate in this repository. It lets us manage permissions and expectations without polluting other agent guidelines.

## Purpose
- Centralize Codex-specific preferences: when to run commands, when to ask, and how to communicate.
- These rules are binding for Codex. They do not change the IDE/harness sandbox itself, but Codex will adhere to them.

## Permissions Profile

```yaml
permissions:
  run_shell: true                 # Codex may run shell commands by default
  ask_before_shell: false         # Do NOT ask for approval before normal commands
  escalate_without_ask: false     # Do NOT auto‑request elevated/unsandboxed runs; ask if absolutely needed
  run_network: false              # Avoid network unless explicitly requested in a task
  write_workspace: true           # May edit files inside the workspace
  write_outside_workspace: false  # Never write outside workspace
  destructive_ops_require_approval: true  # rm -rf, git reset --hard, large deletes need explicit approval
  create_delete_files: true       # File creation/deletion allowed when scoped to task
```

To change a preference, edit this section. Codex will read and follow it next run.

## Command Execution Policy
- Group related actions and run them without extra prompts.
- Use `rg` for searches and chunked file reads (≤250 lines) to keep output readable.
- Use `apply_patch` for all file edits; do not write files via shell redirections.
- Only request escalation if the sandbox blocks essential work; otherwise, adapt.

## Network Usage
- Default: disabled. Do not install packages or fetch remote resources unless a task explicitly requests it.

## Source Control
- Do not create branches or commit unless asked. Provide patches; the user commits.

## Destructive Actions
- Require explicit approval for:
  - Deleting or overwriting large directories/files not clearly in scope
  - Resets (`git reset --hard`, force push)
  - Mass refactors not requested

## Testing and Validation
- If tests or builds exist, run them proactively to validate changes (no approval prompts).
- Prefer targeted checks related to changed areas first; broaden as confidence grows.

## Communication
- Keep messages concise. Provide a one‑line preamble when running grouped commands.
- Maintain a lightweight plan with `update_plan` for multi‑step or ambiguous work.
- Report only key milestones for long tasks (start, major checkpoint, completion).

## UI/Styling Consistency
- Follow existing design system and component patterns. Avoid introducing new styling approaches unless requested.

## Notes
- This document complements `CLAUDE.md` (higher‑level process). Codex follows CODEX.md when executing work.

