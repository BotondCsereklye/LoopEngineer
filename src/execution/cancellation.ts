/**
 * Cooperative cancellation wired to SIGINT/SIGTERM.
 * The orchestrator checks the signal between phases; the process runner
 * terminates children when it fires.
 */
export class CancellationController {
  private readonly controller = new AbortController();
  private readonly onSigint = () => this.abort('SIGINT');
  private readonly onSigterm = () => this.abort('SIGTERM');
  private installed = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  abort(reason?: string): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort(reason ?? 'aborted');
    }
  }

  /** Installs process signal handlers. Call detach() when the run finishes. */
  attachToProcess(): void {
    if (this.installed) return;
    this.installed = true;
    process.once('SIGINT', this.onSigint);
    process.once('SIGTERM', this.onSigterm);
  }

  detach(): void {
    if (!this.installed) return;
    this.installed = false;
    process.removeListener('SIGINT', this.onSigint);
    process.removeListener('SIGTERM', this.onSigterm);
  }
}
