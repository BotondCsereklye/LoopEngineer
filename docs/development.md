# Development

Use Node.js 20 or newer.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run format:check
```

Tests use fake providers and temporary Git repositories. They do not call real Claude or Codex sessions. Keep provider smoke tests manual and use a disposable repository.

Add a failing test before you change workflow, security or report behavior. Coverage thresholds require 80 percent for statements, branches, functions and lines. The coverage configuration excludes the CLI composition entrypoint; smoke tests cover the built executable.

Run a local CLI smoke test after building:

```bash
node dist/index.js --help
node dist/index.js doctor
node dist/index.js run --dry-run --task "Smoke test"
```
