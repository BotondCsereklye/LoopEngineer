/** Deadline helper for the overall run budget (workflow.max_runtime_minutes). */
export class Deadline {
  private readonly endAt: number;

  constructor(startedAt: Date, maxRuntimeMinutes: number) {
    this.endAt = startedAt.getTime() + maxRuntimeMinutes * 60_000;
  }

  exceeded(now: Date): boolean {
    return now.getTime() >= this.endAt;
  }

  remainingMs(now: Date): number {
    return Math.max(0, this.endAt - now.getTime());
  }
}
