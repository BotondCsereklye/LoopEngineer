import type { LoopEngineerConfig } from '../config/schema.js';
import type { ReviewResult, TestResult } from '../handoff/schemas.js';

export interface QualityGateResult {
  passed: boolean;
  blockingFindings: number;
  failures: string[];
}

export function evaluateQualityGates(
  config: LoopEngineerConfig,
  tests: TestResult,
  review: ReviewResult,
): QualityGateResult {
  const blockingFindings = review.findings.filter((finding) =>
    config.quality_gates.block_severities.includes(finding.severity),
  ).length;
  const failures: string[] = [];
  if (config.quality_gates.require_tests_pass && !tests.passed) failures.push('tests-failed');
  if (blockingFindings > 0) failures.push('blocking-review-findings');
  if (config.quality_gates.require_clean_review && !review.approved)
    failures.push('review-not-approved');
  return { passed: failures.length === 0, blockingFindings, failures };
}
