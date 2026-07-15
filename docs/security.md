# Security model

## Trust boundaries

Loop Engineer trusts its code, validated configuration, the explicit user task and versioned role prompts. It treats source files, documentation, test output and diffs as untrusted data.

The context firewall wraps repository-derived context in markers and tells each provider to ignore embedded instructions. The wrapper neutralizes a matching end marker inside the content.

## Process and command controls

The process runner calls `spawn` with `shell: false`, caps captured output, supports cancellation and terminates timed-out children. The tester requires an exact configured command and rejects `;`, `&&`, `||`, pipes, redirection, command substitution, `curl`, `wget`, `sudo`, shells and destructive Git subcommands.

Command parsing in the MVP splits on whitespace. Keep allowed commands simple. Put complex logic in a reviewed package script and allowlist `npm run <name>`.

## Provider authentication

The local dashboard delegates authentication to the installed official Claude Code and OpenAI Codex CLIs. It accepts only the fixed provider IDs `claude` and `codex`, starts fixed login argument arrays with `shell: false`, caps captured output and applies a timeout. CLI output is discarded and is never returned to the browser or written to the run store.

The dashboard never accepts passwords, API keys, OAuth codes or access tokens. It does not read vendor credential files or implement an OAuth callback. The provider CLI owns browser authentication and credential storage. Users who need API-key, SSO, device-code or enterprise automation flows must configure those through the official CLI outside Loop Engineer.

## Files and Git

Writing providers receive the managed worktree as their current directory. Loop Engineer creates no commit and sends no push. Cleanup checks marker metadata, refuses paths outside `.loop-engineer/worktrees`, and preserves dirty worktrees unless the user supplies `--force`.

## Secrets

The run store redacts common API keys, bearer tokens, authorization headers, private keys and secret assignments before writing text or JSON. Pattern matching can miss custom formats. Do not include secrets in tasks, source fixtures or agent prompts. Protect `.loop-engineer/` with the same care as build logs.

## Reporting a vulnerability

Follow [SECURITY.md](../SECURITY.md). Do not place exploit details or credentials in a public issue.
