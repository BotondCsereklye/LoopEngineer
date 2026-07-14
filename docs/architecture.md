# Architecture

Loop Engineer separates policy, provider adapters and workflow state.

The CLI validates configuration before it resolves a repository. The orchestrator then creates a run store and detached worktree. Read-only roles use the repository root; writing roles use the worktree path. Provider adapters translate Loop Engineer permissions into provider CLI flags. The local provider accepts an argument list produced by the command policy and starts processes with `shell: false`.

Zod schemas form the boundary between phases. A phase cannot consume free-form chat history. The validator accepts valid JSON or performs one mechanical repair pass for fences, trailing commas and surrounding text. It does not fill missing values.

Reports derive from validated handoffs, Git numstat output and process results. The final judge cannot override failed objective gates because the orchestrator clamps its decision.

The MVP keeps files on disk under `.loop-engineer/`. Loop Engineer runs no database, daemon or service of its own. Provider CLIs may use their vendor networks under their own sessions and policies.
