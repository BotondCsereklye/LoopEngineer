# Loop Engineer

Assign Claude, Codex and local tools to different software-engineering roles and run a controlled development loop in an isolated Git worktree.

Use your existing authenticated coding-agent CLIs. No API keys, cloud account or automatic push required.

> [!WARNING]
> Loop Engineer is an unofficial open-source project. It has no affiliation with OpenAI or Anthropic. Review agent output and the generated diff before you copy changes into your branch.

## Problem

Coding agents can edit quickly, but a long unstructured chat mixes planning, implementation and approval. It can also expose a repository to prompt injection or let a test command exceed the authority you intended to grant.

Loop Engineer assigns one role per step. Each role receives a bounded prompt, a permission profile and a Zod-validated JSON handoff. Writing roles work in a detached Git worktree. The tester runs commands from an exact allowlist.

## Workflow

```text
ANALYZE -> PLAN -> IMPLEMENT -> TEST -> REVIEW -> DECIDE
                                  ^        |
                                  |        v
                                  +------ FIX
```

The orchestrator stops when tests and review gates pass, the cycle limit expires, runtime expires, progress stops, a provider fails, or the user cancels.

## Installation

Requirements: Node.js 20+, Git, and at least one supported official agent CLI.

```bash
git clone <your-fork-or-clone-url>
cd loop-engineer
npm install
npm run build
npm link
```

Loop Engineer uses the sessions managed by `claude` and `codex`. Sign in through those CLIs. Do not paste provider passwords or browser tokens into Loop Engineer.

## 30-second quickstart

Run these commands inside a Git repository with at least one commit:

```bash
loopeng init
loopeng doctor
loopeng gui
```

The dashboard opens at `http://127.0.0.1:4317`. Configure the task, role providers, models, quality gates and test commands, then start with a dry run. Loop Engineer does not commit or push.

Prefer the terminal? Run `loopeng run --task "Add input validation to the settings parser"` instead.

## Commands

```text
loopeng init
loopeng doctor
loopeng gui
loopeng gui --no-open --port 4318
loopeng run --task "Add password reset"
loopeng run --task-file task.md
loopeng run --config loop-engineer.yml --task "Fix the parser"
loopeng run --dry-run --task "Preview this workflow"
loopeng status
loopeng report <run-id>
loopeng clean [--force]
```

`gui` starts a local-only dashboard bound to `127.0.0.1`. It reads the same `loop-engineer.yml` as the CLI and keeps the role permission boundaries fixed. Stop it with `Ctrl+C`.

`doctor` checks Node, Git, repository state, worktree support, provider installation, command detection, instruction files and write access. It reports an unknown authentication state when an official CLI offers no dependable probe.

## Configuration

`loopeng init` writes `loop-engineer.yml` and detects common build commands. Zod rejects unknown keys, invalid role permissions and unsafe tester assignments.

```yaml
version: 1
project:
  root: .
  default_branch: main
workflow:
  name: feature-development
  max_cycles: 3
  max_runtime_minutes: 60
  stop_on_no_progress: true
  require_human_approval_before_apply: false
roles:
  analyst: { provider: codex, model: default, permissions: read-only }
  planner: { provider: claude, model: default, permissions: read-only }
  implementer: { provider: codex, model: default, permissions: workspace-write }
  reviewer: { provider: claude, model: default, permissions: read-only }
  tester: { provider: local, permissions: predefined-commands }
  fixer: { provider: codex, model: default, permissions: workspace-write }
  final_judge: { provider: claude, model: default, permissions: read-only }
quality_gates:
  require_tests_pass: true
  require_clean_review: true
  block_severities: [critical, high]
commands:
  install: ''
  build: 'npm run build'
  test: 'npm test'
  lint: 'npm run lint'
  typecheck: 'npm run typecheck'
security:
  network_access: false
  allow_package_install: false
  allow_commit: false
  allow_push: false
  redact_secrets: true
```

See [configuration](docs/configuration.md) for validation rules.

## Roles and providers

The MVP includes `analyst`, `planner`, `implementer`, `reviewer`, `tester`, `fixer` and `final_judge`. Claude Code and Codex CLI handle agent roles. The local provider runs test commands without a shell.

Provider flags can change between CLI releases. Run `loopeng doctor` after you upgrade a provider. See [providers](docs/providers.md).

## Security model

- Repository text enters prompts inside untrusted-data fences.
- Read-only roles receive read-only provider permissions.
- Implementer and fixer receive workspace write access inside the isolated worktree.
- The tester rejects shell chaining, pipes, redirection, command substitution and denied binaries.
- Logs and reports redact common token, key and password patterns before storage.
- Loop Engineer issues no commit, push, force reset or destructive clean command.

Redaction catches common patterns, not every secret format. Run reports can contain sensitive source context. Keep `.loop-engineer/` local and review [the security model](docs/security.md).

## Worktrees and reports

Loop Engineer creates `.loop-engineer/worktrees/<run-id>` from the current commit. Existing modifications in your main checkout stay untouched. `clean` removes worktrees with Loop Engineer marker files and refuses dirty worktrees unless you pass `--force`.

Each completed run writes Markdown and JSON under `.loop-engineer/runs/<run-id>/`, together with configuration, task, handoffs, provider events, tests and review results.

## Limitations

- The MVP supports Claude Code, Codex CLI and a local command runner.
- Provider CLI output formats may change.
- The context firewall and redactor reduce risk but cannot prove that a provider will behave safely.
- Loop Engineer leaves the worktree for human inspection and does not apply its diff to your branch.
- Windows support depends on Git worktree behavior and provider CLI support on the host.

## Roadmap

Planned work includes Gemini support, optional MCP integration, richer progress evidence and opt-in packaging as a single executable. Cloud accounts, browser automation, automatic pull requests and automatic pushes remain outside the MVP. See [roadmap](docs/roadmap.md).

## Development and contributing

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [development notes](docs/development.md). Suggested GitHub topics: `ai-agents`, `claude-code`, `codex-cli`, `developer-tools`, `git-worktree`, `local-first`, `typescript`.

## Disclaimer

You control the provider sessions and repository. Check provider terms, usage limits, generated code, licenses and security impact before adopting a change. Loop Engineer does not bypass provider authentication or usage limits.

## License

[MIT](LICENSE)
