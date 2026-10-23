import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * services/guardianService.ts: the RPC wrappers, the checkout request body, and
 * the mapping of every refusal to one sentence a parent can act on.
 *
 * The backend is not here. The RPC and HTTP shapes come from the guardian
 * contract, and these tests hold the client to it: the names, the parameter
 * keys, and the `beneficiaryUserId` the checkout sends.
 */

const rpcMock = vi.fn();
const clientState = { configured: true };

vi.mock('../../services/supabaseClient', () => ({
  get isSupabaseConfigured() {
    return clientState.configured;
  },
  get supabase() {
    return clientState.configured ? { rpc: (...args: unknown[]) => rpcMock(...args) } : null;
  },
  fetchAllRows: vi.fn(),
}));

// Fixed price IDs so the interval-to-price mapping can be asserted.
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    STRIPE_PRICE_IDS: { plus_monthly: 'price_monthly', plus_yearly: 'price_yearly', school: '' },
  };
});

import {
  GuardianError,
  fetchGuardianStudentProgress,
  guardianAvailable,
  guardianCodeForRpcMessage,
  guardianErrorMessage,
  listMyStudents,
  mapGuardianCheckoutFailure,
  openGuardianBillingPortal,
  redeemGuardianInvite,
  removeGuardianLink,
  startGuardianCheckout,
} from '../../services/guardianService';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  clientState.configured = true;
  rpcMock.mockResolvedValue({ data: null, error: null });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('RPC error messages become codes', () => {
  it.each([
    ['Invite has expired', 'invite_expired'],
    ['That code has already been redeemed', 'invite_used'],
    ['You cannot link to yourself', 'own_invite'],
    ['Guardian already has 6 linked students', 'link_limit'],
    ['Not a guardian of this student', 'not_a_guardian'],
    ['Invite not found', 'invite_not_found'],
    ['Something unexpected happened', 'unknown'],
  ])('%s is %s', (message, code) => {
    expect(guardianCodeForRpcMessage(message)).toBe(code);
  });

  it('gives each code a friendly sentence in UK English', () => {
    expect(guardianErrorMessage('invite_expired')).toBe(
      'That code has expired. Ask your child to create a new one.'
    );
    expect(guardianErrorMessage('link_limit')).toMatch(/six children linked/);
  });

  it('names the child in beneficiary_has_plan', () => {
    expect(guardianErrorMessage('beneficiary_has_plan', 'Sam')).toBe(
      'Sam already has Band 6 Plus.'
    );
  });
});

describe('checkout refusals', () => {
  it('names the child when they already hold a plan', () => {
    expect(
      mapGuardianCheckoutFailure({ status: 409, code: 'beneficiary_has_plan' }, 'Sam')
    ).toEqual({ code: 'beneficiary_has_plan', message: 'Sam already has Band 6 Plus.' });
  });

  it('says the parent is not linked, and that they are not charged by it', () => {
    const result = mapGuardianCheckoutFailure({ status: 403, code: 'not_a_guardian' });
    expect(result.code).toBe('not_a_guardian');
    expect(result.message).toBe('You are not linked to this child.');
  });

  it('refuses a non-Plus price and a missing child with their own sentences', () => {
    expect(mapGuardianCheckoutFailure({ status: 400, code: 'guardian_plus_only' }).message).toBe(
      'A parent can only buy Band 6 Plus for a child.'
    );
    expect(
      mapGuardianCheckoutFailure({ status: 400, code: 'guardian_needs_beneficiary' }).code
    ).toBe('guardian_needs_beneficiary');
  });

  it('falls back to the billing wording for an outage, with no charge implied', () => {
    const outage = mapGuardianCheckoutFailure({ status: 503, code: null, error: 'stripe down' });
    expect(outage.code).toBeNull();
    expect(outage.message).toMatch(/you have not been charged/i);
  });

  it('says it could not reach billing when the request never arrived', () => {
    expect(mapGuardianCheckoutFailure({ status: null }).message).toMatch(
      /could not reach billing/i
    );
  });
});

describe('RPC wrappers', () => {
  it('redeems a code with the trimmed value and the contract parameter name', async () => {
    rpcMock.mockResolvedValue({
      data: { studentId: 'child-1', displayName: 'Sam' },
      error: null,
    });

    const result = await redeemGuardianInvite('  K7QM-4PXR ');

    expect(rpcMock).toHaveBeenCalledWith('redeem_guardian_invite', { p_code: 'K7QM-4PXR' });
    expect(result).toEqual({ studentId: 'child-1', displayName: 'Sam' });
  });

  it('refuses an empty code without calling the database', async () => {
    await expect(redeemGuardianInvite('   ')).rejects.toMatchObject({
      code: 'invite_not_found',
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('turns a raised RPC error into a GuardianError with the mapped code', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Invite has expired' } });

    const failure = await redeemGuardianInvite('K7QM-4PXR').catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(GuardianError);
    expect((failure as GuardianError).code).toBe('invite_expired');
    expect((failure as GuardianError).message).toBe(
      'That code has expired. Ask your child to create a new one.'
    );
  });

  it('lists children as an empty array when the database returns nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(listMyStudents()).resolves.toEqual([]);
    expect(rpcMock).toHaveBeenCalledWith('list_my_students', {});
  });

  it('reports a removed link from the RPC result', async () => {
    rpcMock.mockResolvedValue({ data: { removed: true }, error: null });
    await expect(removeGuardianLink('child-1')).resolves.toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('remove_guardian_link', { p_other: 'child-1' });
  });

  it('reads a child’s progress with the contract names and fills in missing arrays', async () => {
    rpcMock.mockResolvedValue({
      data: {
        username: 'sam',
        displayName: 'Sam',
        totals: { total_attempts: 3, active_students: 1, avg_band: 4 },
      },
      error: null,
    });

    const progress = await fetchGuardianStudentProgress('child-1', 90);

    expect(rpcMock).toHaveBeenCalledWith('get_guardian_student_progress', {
      p_student_id: 'child-1',
      p_days: 90,
    });
    expect(progress.trend).toEqual([]);
    expect(progress.byVerb).toEqual([]);
    expect(progress.displayName).toBe('Sam');
  });

  it('says so, rather than failing, when there is no online account', async () => {
    clientState.configured = false;

    expect(guardianAvailable()).toBe(false);
    const failure = await listMyStudents().catch((err: unknown) => err);
    expect((failure as GuardianError).code).toBe('unavailable');
    expect((failure as GuardianError).message).toMatch(/need an online account/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('startGuardianCheckout', () => {
  it('posts the yearly Plus price and names the child as the beneficiary', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://checkout.stripe.test/session' }));

    const result = await startGuardianCheckout('child-1', 'yearly', 'Sam');

    expect(result).toEqual({
      url: 'https://checkout.stripe.test/session',
      error: null,
      code: null,
    });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/create-checkout');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.priceId).toBe('price_yearly');
    expect(body.beneficiaryUserId).toBe('child-1');
    expect(body.returnUrl).toBe(`${window.location.origin}/`);
  });

  it('uses the monthly price when monthly is chosen', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://checkout.stripe.test/m' }));

    await startGuardianCheckout('child-1', 'monthly', 'Sam');

    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).priceId).toBe('price_monthly');
  });

  it('returns the child-specific refusal for a child who already has a plan', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: 'Already has a plan', code: 'beneficiary_has_plan' })
    );

    const result = await startGuardianCheckout('child-1', 'monthly', 'Sam');

    expect(result.url).toBeNull();
    expect(result.code).toBe('beneficiary_has_plan');
    expect(result.error).toBe('Sam already has Band 6 Plus.');
  });

  it('does not call the server without an online account', async () => {
    clientState.configured = false;

    const result = await startGuardianCheckout('child-1', 'yearly', 'Sam');

    expect(result.code).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('openGuardianBillingPortal', () => {
  it('opens the portal for the parent, who is the customer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://billing.stripe.test/p' }));

    const result = await openGuardianBillingPortal();

    expect(result).toEqual({ url: 'https://billing.stripe.test/p', error: null });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/customer-portal');
  });

  it('gives a friendly failure when the portal cannot be opened', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: 'Stripe key missing' }));

    const result = await openGuardianBillingPortal();

    expect(result.url).toBeNull();
    expect(result.error).toMatch(/billing portal is unavailable right now/i);
  });
});
