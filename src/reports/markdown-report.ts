import type { RunReport } from './types.js';

function statusLabel(status: RunReport['status']): string {
  return status.replaceAll('-', ' ').toUpperCase();
}

export function renderMarkdownReport(report: RunReport): string {
  const findings = report.reviews.flatMap((review) => review.findings);
  const files =
    report.diff.changedFiles.length > 0
      ? report.diff.changedFiles.map((file) => `- \`${file}\``).join('\n')
      : '- None';
  const issues =
    report.remainingIssues.length > 0
      ? report.remainingIssues.map((issue) => `- ${issue}`).join('\n')
      : '- None';
  return `# Loop Engineer Report

## Summary

- Run: \`${report.runId}\`
- Status: **${statusLabel(report.status)}**
- Task: ${report.task}
- Base commit: \`${report.baseCommit}\`
- Worktree: \`${report.worktreePath}\`
- Duration: ${report.durationMs} ms
- Cycles: ${report.cycles}
- Tests passed: ${report.tests.passed ? 'yes' : 'no'}
- Review findings: ${findings.length}
- Diff: ${report.diff.filesChanged} files, +${report.diff.insertions}/-${report.diff.deletions}

## Changed files

${files}

## Acceptance criteria

${report.acceptanceCriteria.map((criterion) => `- ${report.acceptanceCriteriaSatisfied.includes(criterion) ? '[x]' : '[ ]'} ${criterion}`).join('\n')}

## Remaining issues

${issues}

## Next action

${report.recommendedNextAction}

## Safety confirmation

- No commit was performed.
- No push was performed.
- Review the isolated worktree diff before applying changes.
`;
}
