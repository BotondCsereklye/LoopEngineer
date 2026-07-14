# Providers

## Claude Code

The Claude adapter calls the official `claude` binary in print mode with JSON output. Read-only roles receive read tools. Writing roles receive edit tools and `acceptEdits`; the adapter does not grant Bash. Claude Code does not expose a stable non-interactive authentication probe across supported versions, so `doctor` may report the state as unknown.

## Codex CLI

The Codex adapter calls `codex exec --json` and sends the prompt through stdin. It maps permissions to `read-only` or `workspace-write` sandbox modes. `doctor` uses the official `codex login status` command when available.

## Local runner

The local runner handles the tester role. It executes exact commands from `commands.build`, `commands.test`, `commands.lint` and `commands.typecheck`. It never executes provider-generated commands.

## Manual smoke test

```bash
claude --version
codex --version
codex login status
loopeng doctor
loopeng run --dry-run --task "Describe the configured workflow"
```

Use a disposable Git repository for the first real run. Provider commands and event formats can change, so record the CLI versions when you report an adapter bug.
