# Changelog

All notable changes will appear in this file. The project follows Keep a Changelog and plans to use Semantic Versioning after the first public release.

## [Unreleased]

### Added

- Local-first Claude Code, Codex CLI and predefined-command providers.
- Structured role handoffs, bounded correction loops and objective quality gates.
- Detached Git worktrees, redacted run reports and safe cleanup.
- `init`, `doctor`, `run`, `status`, `report` and `clean` commands.
- `gui` command: local-only dashboard (loopback bind, CSRF token, strict CSP) to configure, start, watch and cancel runs.
- Provider-signaled subscription/session limits are classified as "provider unavailable" (exit 3) instead of an internal error.
