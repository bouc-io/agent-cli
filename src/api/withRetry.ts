const RETRYABLE_HTTP = new Set([429, 503, 529]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

function isRetryable(err: unknown): boolean {
  // ApiError with a retryable HTTP status (duck-typed — avoids circular import)
  if (err instanceof Error && "status" in err) {
    return RETRYABLE_HTTP.has((err as { status: number }).status);
  }
  // Network-level transient errors
  if (err instanceof Error && "code" in err) {
    return RETRYABLE_CODES.has((err as NodeJS.ErrnoException).code ?? "");
  }
  return false;
}

/**
 * Retry an async operation with exponential backoff.
 * Retries on HTTP 429/503/529 and transient network errors (ECONNRESET, etc.).
 * Non-retryable errors (4xx auth errors, validation errors) are rethrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
