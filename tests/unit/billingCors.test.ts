import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Opt-in CORS + preflight handling for the two billing endpoints.
 *
 * The client posts checkout/portal to `${VITE_API_BASE_URL}${path}`, so on a
 * split-host deployment (static frontend on one origin, API on another) a
 * cross-origin POST carrying Authorization + Content-Type triggers an OPTIONS
 * preflight. Before this change both endpoints 405'd that preflight and the
 * browser blocked payment before it ran. Mirrors the AI proxy's behaviour and
 * reuses api/_lib/cors.ts unchanged — so the default (no ALLOWED_ORIGIN) stays
 * same-origin only, emitting no CORS headers at all.
 */

import createCheckout from '../../api/create-checkout';
import customerPortal from '../../api/customer-portal';

const ALLOWED = 'https://app.example.com';

const makeRes = () => ({
  statusCode: 0,
  ended: false,
  body: undefined as { error?: string } | undefined,
  headers: {} as Record<string, string>,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as { error?: string };
  },
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  },
  end() {
    this.ended = true;
  },
});

const preflight = (origin?: string) => ({
  method: 'OPTIONS',
  headers: origin ? { origin } : {},
});

let savedAllowedOrigin: string | undefined;

beforeEach(() => {
  savedAllowedOrigin = process.env.ALLOWED_ORIGIN;
});

afterEach(() => {
  if (savedAllowedOrigin === undefined) delete process.env.ALLOWED_ORIGIN;
  else process.env.ALLOWED_ORIGIN = savedAllowedOrigin;
});

// Both billing endpoints share the exact same CORS/OPTIONS preamble, so the
// contract is asserted against each in turn.
const endpoints: Array<{ name: string; handler: typeof createCheckout }> = [
  { name: 'create-checkout', handler: createCheckout },
  { name: 'customer-portal', handler: customerPortal },
];

for (const { name, handler } of endpoints) {
  describe(`${name}: CORS preflight`, () => {
    it('answers OPTIONS with 204 and an allow-origin header when the Origin matches ALLOWED_ORIGIN', async () => {
      process.env.ALLOWED_ORIGIN = ALLOWED;
      const res = makeRes();
      await handler(preflight(ALLOWED), res);

      expect(res.statusCode).toBe(204);
      expect(res.ended).toBe(true);
      expect(res.headers['Access-Control-Allow-Origin']).toBe(ALLOWED);
      // No body on a 204 preflight — the header is the whole answer.
      expect(res.body).toBeUndefined();
    });

    it('answers OPTIONS with 403 and no allow-origin header when the Origin is not allowed', async () => {
      process.env.ALLOWED_ORIGIN = ALLOWED;
      const res = makeRes();
      await handler(preflight('https://evil.example.com'), res);

      expect(res.statusCode).toBe(403);
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('is unchanged with no ALLOWED_ORIGIN set: no CORS headers, preflight refused', async () => {
      delete process.env.ALLOWED_ORIGIN;
      const res = makeRes();
      await handler(preflight(ALLOWED), res);

      // Same-origin only: the endpoint emits nothing that would let a browser
      // read it cross-origin, and the unexpected preflight is refused.
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(res.statusCode).toBe(403);
    });
  });
}
