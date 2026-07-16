export type BackoffState = {
  attempt: number;
  nextDelayMs: number;
};

export function createBackoff(options?: {
  initialMs?: number;
  maxMs?: number;
  factor?: number;
}): BackoffState {
  const initialMs = options?.initialMs ?? 1_000;
  return {
    attempt: 0,
    nextDelayMs: initialMs,
  };
}

export function nextBackoffDelay(
  state: BackoffState,
  options?: { initialMs?: number; maxMs?: number; factor?: number },
): number {
  const initialMs = options?.initialMs ?? 1_000;
  const maxMs = options?.maxMs ?? 5 * 60 * 1_000;
  const factor = options?.factor ?? 2;

  const delay = state.nextDelayMs;
  state.attempt += 1;
  state.nextDelayMs = Math.min(
    maxMs,
    Math.max(initialMs, Math.floor(delay * factor)),
  );
  return delay;
}

export function resetBackoff(
  state: BackoffState,
  options?: { initialMs?: number },
): void {
  state.attempt = 0;
  state.nextDelayMs = options?.initialMs ?? 1_000;
}
