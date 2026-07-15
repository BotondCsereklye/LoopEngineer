# Providers

## Claude Code

The Claude adapter calls the official `claude` binary in print mode with JSON output. The selected model is passed through `--model` and the selected intelligence level through `--effort`. Read-only roles receive read tools. Writing roles receive edit tools and `acceptEdits`; the adapter does not grant Bash. Authentication status is checked with `claude auth status --json` using only its exit code. The dashboard starts subscription login with `claude auth login --claudeai`.

## Codex CLI

The Codex adapter calls `codex exec --json` and sends the prompt through stdin. The selected model is passed through `--model`; intelligence is passed through the `model_reasoning_effort` configuration override. It maps permissions to `read-only` or `workspace-write` sandbox modes. Authentication status is checked with `codex login status`; the dashboard starts browser login with `codex login`.

The GUI catalog is provider-specific. Codex offers Sol, Terra and Luna plus compatible reasoning levels; Ultra is only offered for models whose local Codex catalog supports delegation. Claude offers Automatic, Best, Opus, Sonnet, Haiku and Opus-plan aliases with only compatible effort choices. The server validates every model and intelligence combination again before starting a run.

An authenticated CLI can still have no remaining subscription quota. If a real request reports a session, usage or rate limit, the run fails closed and the dashboard shows the provider, role and vendor-provided reset time. Loop Engineer never estimates quota itself.

## Dashboard sign-in

The **Provider connections** panel delegates sign-in to the installed official CLI. The CLI opens and owns the vendor browser flow, callback and credential storage. Loop Engineer starts a fixed allowlisted command without a shell, discards its output and exposes only installed, connecting and authenticated status.

The dashboard deliberately has no password, API-key, access-token, email or OAuth-code input. For API-key or enterprise automation authentication, configure the official CLI outside Loop Engineer and use its documented credential store.

## Local runner

The local runner handles the tester role. It executes exact commands from `commands.build`, `commands.test`, `commands.lint` and `commands.typecheck`. It never executes provider-generated commands.

## Manual smoke test

```bash
claude --version
claude auth status
codex --version
codex login status
loopeng doctor
loopeng run --dry-run --task "Describe the configured workflow"
```

Use a disposable Git repository for the first real run. Provider commands and event formats can change, so record the CLI versions when you report an adapter bug.
