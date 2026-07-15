# Local dashboard

Start the dashboard from the Git repository that contains `loop-engineer.yml`:

```bash
loopeng gui
```

The browser opens `http://127.0.0.1:4317`. Use `--no-open` on a headless machine or `--port <number>` when the default port is occupied.

The dashboard lets you select Claude Code or Codex CLI and a model for each agent role, workflow limits, quality gates, blocking severities and the predefined local build, test, lint and typecheck commands. The tester remains local. Read-only and workspace-write permission profiles cannot be changed in the browser.

Dry run is enabled by default. A real run uses the same isolated worktree, command policy, context firewall, secret redaction and report store as `loopeng run`.

## Local security boundary

The HTTP server accepts only a loopback bind address. Mutating requests require a per-process CSRF token, the exact local origin and JSON content type. Responses use a restrictive Content Security Policy and do not enable cross-origin access. The UI never exposes controls for package installation, network tools, commits or pushes.

Press `Ctrl+C` in the terminal that started the dashboard to stop the server.
