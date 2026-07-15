# Local dashboard

Start the dashboard from the Git repository that contains `loop-engineer.yml`:

```bash
loopeng gui
```

The browser opens `http://127.0.0.1:4317`. Use `--no-open` on a headless machine or `--port <number>` when the default port is occupied.

The dashboard lets you connect Claude Code or OpenAI Codex, then select a provider, provider-specific model and intelligence level for each agent role. Codex includes the locally supported Sol, Terra and Luna choices. Claude exposes its stable CLI aliases such as Opus, Sonnet and Haiku. Model availability can still vary by account and workspace policy.

The **Current run** card shows both provider connection states, the active role, provider, model, intelligence level and elapsed thinking time. It displays safe progress metadata rather than private chain-of-thought. When a provider reports a session or usage limit, the card identifies the affected provider and role, shows the reset time when supplied by the CLI and suggests switching that role to the other provider.

You can also configure workflow limits, quality gates, blocking severities and the predefined local build, test, lint and typecheck commands. The tester remains local. Read-only and workspace-write permission profiles cannot be changed in the browser.

## Provider connections

Select **Sign in with Claude** or **Sign in with OpenAI** to start the installed official CLI's browser login. Finish the flow in the browser opened by the CLI; the dashboard refreshes the connection state automatically. A green connection state confirms installation and authentication, not remaining subscription quota. Quota is verified only when the provider serves a real role request.

Loop Engineer does not implement vendor OAuth, receive a callback, inspect credential files or store tokens. If browser login cannot complete, run `claude auth login --claudeai` or `codex login` directly in a terminal so the official CLI can present interactive recovery options.

Dry run is enabled by default. A real run uses the same isolated worktree, command policy, context firewall, secret redaction and report store as `loopeng run`.

## Local security boundary

The HTTP server accepts only a loopback bind address. Mutating requests require a per-process CSRF token, the exact local origin and JSON content type. Provider IDs are allowlisted and login commands are fixed argument arrays executed without a shell. Responses use a restrictive Content Security Policy and do not enable cross-origin access. The UI never exposes controls for credentials, package installation, network tools, commits or pushes.

Press `Ctrl+C` in the terminal that started the dashboard to stop the server.
