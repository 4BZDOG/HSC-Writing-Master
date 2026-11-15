/**
 * Shared timeout for upstream AI provider calls.
 *
 * Vercel kills a serverless function at its maxDuration (60s, vercel.json)
 * and returns a non-JSON 504, which the client cannot read. Every provider
 * adapter therefore aborts its upstream fetch at PROVIDER_TIMEOUT_MS, a few
 * seconds inside that limit, and maps the abort to a JSON 504 the client's
 * existing error handling understands.
 */
export const PROVIDER_TIMEOUT_MS = 55_000;

export const PROVIDER_TIMEOUT_MESSAGE =
  'The AI provider took too long to respond. Please try again.';

/**
 * True when an error came from `AbortSignal.timeout()` (name `TimeoutError`)
 * or an abort (name `AbortError`). Checked by name rather than `instanceof`,
 * because the runtime's DOMException is not always an `Error` subclass.
 */
export const isProviderTimeout = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  const { name } = error as { name: unknown };
  return name === 'TimeoutError' || name === 'AbortError';
};
