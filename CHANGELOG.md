# Changelog

All notable changes will appear in this file. The project follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

- Repeatable npm package verification and a maintainer publishing guide.

## [0.1.0] - 2026-07-15

First public release.

### Added

- Local-first Claude Code, Codex CLI and predefined-command providers.
- Structured role handoffs, bounded correction loops and objective quality gates.
- Detached Git worktrees, redacted run reports and safe cleanup.
- `init`, `doctor`, `run`, `status`, `report` and `clean` commands.
- `gui` command: local-only dashboard (loopback bind, CSRF token, strict CSP) to configure, start, watch and cancel runs.
- Provider-signaled subscription/session limits are classified as "provider unavailable" (exit 3) instead of an internal error.
