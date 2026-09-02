/** Tiny in-process circuit breaker for bank HTTP calls. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly coolDownMs = 30_000,
  ) {}

  assertClosed() {
    if (this.openedAt == null) return;
    if (Date.now() - this.openedAt >= this.coolDownMs) {
      this.openedAt = null;
      this.failures = 0;
      return;
    }
    throw new Error('CIRCUIT_OPEN');
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = Date.now();
    }
  }
}
