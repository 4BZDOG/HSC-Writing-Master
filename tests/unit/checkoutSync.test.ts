import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The checkout return asks the server to confirm the purchase before it polls.
 * These pin the client half of that: the session id is read from the URL before
 * the params are cleared, only a 200 that says `active` counts as confirmed, and
 * a failure of any kind leaves the poll to run.
 */

vi.mock('../../services/authService', () => ({
  authService: { getCurrentUser: () => null },
}));

vi.mock('../../services/supabaseClient', () => ({
  supabase: null,
}));

import {
  checkoutSessionIdFrom,
  parseCheckoutSync,
  syncCheckoutSession,
} from '../../services/entitlements';

const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7';

describe('checkoutSessionIdFrom', () => {
  it('reads the session id Stripe appends to the success URL', () => {
    const params = new URLSearchParams(`?checkout=success&session_id=${SESSION_ID}`);
    expect(checkoutSessionIdFrom(params)).toBe(SESSION_ID);
  });

  it('is null when the return carries no session id', () => {
    expect(checkoutSessionIdFrom(new URLSearchParams('?checkout=success'))).toBeNull();
  });

  it('is null for a value that is not shaped like a Checkout Session id', () => {
    for (const bad of [
      'pi_test_a1B2c3D4e5F6g7',
      'cs_short',
      'cs_test_has spaces_here',
      'cs_test_a1B2c3D4e5F6g7;drop',
      '',
    ]) {
      const params = new URLSearchParams({ checkout: 'success', session_id: bad });
      expect(checkoutSessionIdFrom(params), bad).toBeNull();
    }
  });
});

describe('parseCheckoutSync', () => {
  it('confirms the purchase only on a 200 that says active', () => {
    expect(parseCheckoutSync(200, { status: 'active', plan: 'plus' })).toEqual({
      status: 'active',
    });
  });

  it('treats pending as not yet confirmed, so the poll runs', () => {
    expect(parseCheckoutSync(200, { status: 'pending' })).toEqual({ status: 'pending' });
  });

  it('treats any non-200 as not confirmed, even if its body claims active', () => {
    expect(parseCheckoutSync(500, { status: 'active' })).toEqual({ status: 'pending' });
    expect(parseCheckoutSync(403, { status: 'active' })).toEqual({ status: 'pending' });
  });

  it('treats an older deployment (404) or an unreadable body as not confirmed', () => {
    expect(parseCheckoutSync(404, null)).toEqual({ status: 'pending' });
    expect(parseCheckoutSync(200, 'not json')).toEqual({ status: 'pending' });
    expect(parseCheckoutSync(200, {})).toEqual({ status: 'pending' });
  });

  it('treats a request that never reached the server as not confirmed', () => {
    expect(parseCheckoutSync(null, null)).toEqual({ status: 'pending' });
  });
});

describe('syncCheckoutSession', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts the session id, and nothing else, to /api/sync-checkout', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: 'active', plan: 'plus' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncCheckoutSession(SESSION_ID);

    expect(result).toEqual({ status: 'active' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/api/sync-checkout')).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: SESSION_ID });
  });

  it('reads any network failure as pending rather than rejecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(syncCheckoutSession(SESSION_ID)).resolves.toEqual({ status: 'pending' });
  });

  it('gives up after 15 seconds and reads the wait as pending, so the poll is not held back', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
    );

    const pending = syncCheckoutSession(SESSION_ID);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toEqual({ status: 'pending' });
  });
});
