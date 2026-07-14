import pc from 'picocolors';
import type { DoctorCheck } from '../commands/doctor.js';
import type { RunReport } from '../../reports/types.js';

export function renderDoctor(checks: DoctorCheck[]): string {
  return [
    'Loop Engineer Doctor',
    '',
    ...checks.map((check) => {
      const symbol =
        check.status === 'pass'
          ? pc.green('✓')
          : check.status === 'warn'
            ? pc.yellow('!')
            : pc.red('✗');
      return `${symbol} ${check.label}: ${check.detail}`;
    }),
  ].join('\n');
}

export function renderRunSummary(report: RunReport, reportPath?: string): string {
  const status =
    report.worktreePath === 'not-created (dry-run)'
      ? 'DRY RUN'
      : report.status.replaceAll('-', ' ').toUpperCase();
  return [
    `Status: ${status}`,
    `Tests: ${report.tests.passed ? 'passed' : 'failed'}`,
    `Changed files: ${report.diff.filesChanged}`,
    `Worktree: ${report.worktreePath}`,
    reportPath ? `Report: ${reportPath}` : '',
    '',
    'No commit or push was performed.',
  ]
    .filter((line, index) => line !== '' || index === 5)
    .join('\n');
}
