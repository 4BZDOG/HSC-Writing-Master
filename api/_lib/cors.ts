/**
 * Opt-in CORS for the AI proxy, for split hosting: a static frontend (e.g.
 * GitHub Pages) on one origin calling the proxy (e.g. Vercel) on another.
 *
 * Disabled by default — with no `ALLOWED_ORIGIN` configured the proxy stays
 * same-origin only, exactly as before. Set `ALLOWED_ORIGIN` on the API server
 * to the frontend's exact origin (scheme + host, no trailing slash), e.g.
 * `https://myname.github.io`. Multiple origins may be comma-separated.
 * The wildcard `*` is deliberately rejected: this endpoint spends the
 * provider budget, so it must never be open to every website.
 */

/** Parses the ALLOWED_ORIGIN env var into a list of exact origins. */
export const parseAllowedOrigins = (raw: string | undefined): string[] =>
  (raw || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0 && o !== '*');

/**
 * Returns the CORS headers to attach for this request's Origin, or null when
 * CORS is not enabled / the origin is not allowed (attach nothing — the
 * browser then blocks the cross-origin read, which is the intent).
 */
export const corsHeadersFor = (
  requestOrigin: string | undefined,
  allowedOriginEnv: string | undefined
): Record<string, string> | null => {
  const allowed = parseAllowedOrigins(allowedOriginEnv);
  if (!requestOrigin || allowed.length === 0) return null;
  if (!allowed.includes(requestOrigin.replace(/\/+$/, ''))) return null;
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    // The allow-origin varies with the request, so caches must key on Origin.
    Vary: 'Origin',
  };
};
