import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import { BILLING_CODE, createCheckoutUrl } from '../../services/entitlements';
import { billingErrorMessage } from '../../utils/billingMessages';

/**
 * The server says WHY it refused in a machine `code`, and the client must not
 * guess from a status. Three refusals carry a sentence written for the
 * customer, and a 409 with `school_licence_held` must never become the portal
 * route, because the portal belongs to whoever bought the licence.
 */

const serverSource = readFileSync(resolve(__dirname, '../../api/create-checkout.ts'), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the codes the client reads are the codes the server sends', () => {
  it.each(Object.values(BILLING_CODE))('%s is sent by api/create-checkout.ts', (code) => {
    expect(serverSource).toContain(`'${code}'`);
  });

  it('keeps the 409 for a live subscription without a code, so the portal route still applies to it', () => {
    // The live-subscription refusal is answered with its sentence and no `code`.
    expect(serverSource).toMatch(
      /res\.status\(409\)\.json\(\{\s*error:\s*live \? ALREADY_SUBSCRIBED/
    );
    expect(serverSource).toMatch(
      /const ALREADY_SUBSCRIBED =\s*\n?\s*'You already have an active subscription/
    );
  });
});

describe('billingErrorMessage: the server sentence for the three coded refusals', () => {
  const sentence = 'Your school already has a School licence. Ask whoever bought it.';

  it('shows the held-licence sentence, whatever the status', () => {
    expect(
      billingErrorMessage('school-checkout', {
        status: 409,
        error: sentence,
        code: BILLING_CODE.schoolLicenceHeld,
      })
    ).toBe(sentence);
  });

  it('shows a student the role sentence, not an outage, for a school purchase', () => {
    const role = 'School licences are purchased by a teacher or admin account.';
    expect(
      billingErrorMessage('school-checkout', {
        status: 403,
        error: role,
        code: BILLING_CODE.schoolRoleRequired,
      })
    ).toBe(role);
  });

  it('shows the lookup sentence as a retryable error, not the generic outage', () => {
    const lookup = 'We could not check your account just now, so no purchase was started.';
    expect(
      billingErrorMessage('checkout', {
        status: 503,
        error: lookup,
        code: BILLING_CODE.accountLookupFailed,
      })
    ).toBe(lookup);
  });

  it('still maps an uncoded 403 to the outage sentence, so the old behaviour holds', () => {
    expect(billingErrorMessage('checkout', { status: 403, error: 'Forbidden' })).toMatch(
      /unavailable right now, so you have not been charged/
    );
  });
});

describe('createCheckoutUrl carries the server code through', () => {
  it('returns the code of a refusal, with no URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'school_licence_held',
            error: 'Your school already has a School licence.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    const result = await createCheckoutUrl('price_school', 30);
    expect(result).toEqual({
      url: null,
      error: 'Your school already has a School licence.',
      status: 409,
      code: 'school_licence_held',
    });
  });

  it('returns no code for a plain 409 (a live subscription), so the portal route applies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'You already have an active subscription.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const result = await createCheckoutUrl('price_plus');
    expect(result.status).toBe(409);
    expect(result.code).toBeNull();
  });

  it('returns a URL and no code on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: 'https://checkout.example/session' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const result = await createCheckoutUrl('price_plus');
    expect(result).toEqual({
      url: 'https://checkout.example/session',
      error: null,
      status: 200,
      code: null,
    });
  });
});
