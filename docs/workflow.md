# Workflow

1. The analyst returns `RepositoryAnalysis`.
2. The planner returns `ImplementationPlan` with acceptance criteria.
3. Loop Engineer creates a detached worktree from the current commit.
4. The implementer edits that worktree and returns `ImplementationSummary`.
5. The local provider runs configured commands.
6. The reviewer evaluates the plan, diff and test evidence.
7. The fixer handles recorded failures when gates fail and budget remains.
8. The final judge returns `FinalDecision`; the orchestrator enforces objective gates.

Progress uses four signals: diff hash, failed command count, blocking finding count and satisfied criterion count. The MVP does not ask an LLM to judge progress.

Exit codes:

| Code | Meaning                |
| ---- | ---------------------- |
| 0    | Ready for human review |
| 1    | Quality gates not met  |
| 2    | Configuration error    |
| 3    | Provider unavailable   |
| 4    | Security abort         |
| 5    | Internal error         |
| 130  | User abort             |

The report confirms that Loop Engineer made no commit or push.
