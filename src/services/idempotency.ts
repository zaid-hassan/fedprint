const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** In-flight or recently completed operations keyed by a client request id. */
const inFlight = new Map<string, Promise<unknown>>();

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

/**
 * Runs `task` at most once per key within the TTL window. If a previous
 * attempt for the same key is still running, its result is reused; if it
 * failed, the caller runs its own attempt. This makes a client retry (after a
 * dropped connection) safe: an already-submitted job returns its original id
 * instead of printing twice.
 */
export async function runOnce<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      return await existing;
    } catch {
      // Previous attempt failed before submitting; fall through and retry.
    }
  }

  const promise = task();
  inFlight.set(key, promise);

  void promise
    .finally(() => {
      const timer = setTimeout(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      }, TTL_MS);
      timer.unref?.();
    })
    .catch(() => undefined);

  if (inFlight.size > MAX_ENTRIES) {
    const oldest = inFlight.keys().next().value;
    if (oldest !== undefined && oldest !== key) inFlight.delete(oldest);
  }

  return promise;
}

export function clearIdempotency(): void {
  inFlight.clear();
}
