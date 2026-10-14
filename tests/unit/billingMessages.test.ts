import { describe, it, expect } from 'vitest';
import { billingErrorMessage } from '../../utils/billingMessages';

/**
 * What a customer reads when a billing request fails. The rule under test is
 * that a payment screen never shows an operator's sentence (environment
 * variable names, "misconfigured") and always says what happened to the money
 * or the plan.
 */

const OPERATOR_WORDS = /STRIPE_|VITE_|misconfigured|environment|hosting|Supabase|service role/i;

describe('billingErrorMessage', () => {
  it('replaces a misconfiguration paragraph with a sentence a customer can act on', () => {
    // api/_lib/stripe.ts STRIPE_MISCONFIGURED_ERROR, as the server returns it.
    const serverParagraph =
      'Billing is misconfigured on this deployment: plan prices are published to the app ' +
      '(VITE_STRIPE_*_PRICE_ID) but the server has no STRIPE_SECRET_KEY, so no payment can be taken.';

    const message = billingErrorMessage('checkout', { error: serverParagraph, status: 503 });

    expect(message).not.toMatch(OPERATOR_WORDS);
    expect(message).toMatch(/you have not been charged/i);
  });

  it('never passes an operator sentence through, whatever the status', () => {
    const operatorError = 'Billing backend not configured (Supabase service role missing).';
    for (const status of [500, 502, 503, 403, 405]) {
      for (const action of ['checkout', 'school-checkout', 'portal'] as const) {
        const message = billingErrorMessage(action, { error: operatorError, status });
        expect(message, `${action} ${status}`).not.toMatch(OPERATOR_WORDS);
      }
    }
  });

  it('says a checkout that never started did not charge anyone', () => {
    expect(
      billingErrorMessage('checkout', { error: 'Could not start checkout.', status: 500 })
    ).toMatch(/have not been charged/i);
  });

  it('tells a school buyer that no seats were bought', () => {
    expect(billingErrorMessage('school-checkout', { error: null, status: null })).toMatch(
      /no seats have been bought/i
    );
  });

  it('tells a portal user that their plan has not changed', () => {
    expect(billingErrorMessage('portal', { error: null, status: 500 })).toMatch(
      /nothing about your plan has changed/i
    );
    expect(billingErrorMessage('portal', { error: null, status: null })).toMatch(
      /nothing about your plan has changed/i
    );
  });

  it('says what to do when the request never reached the server', () => {
    const message = billingErrorMessage('checkout', {
      error: 'Could not start checkout.',
      status: null,
    });
    expect(message).toMatch(/could not reach billing/i);
    expect(message).toMatch(/check your connection/i);
  });

  it('asks a signed-out user to sign in again, not to contact support', () => {
    expect(
      billingErrorMessage('checkout', { error: 'Authentication required.', status: 401 })
    ).toMatch(/sign in again/i);
  });

  it('keeps a customer-readable server sentence where the server gave one', () => {
    expect(
      billingErrorMessage('checkout', {
        error: 'No plans are available for purchase yet.',
        status: 501,
      })
    ).toBe('No plans are available for purchase yet.');
    expect(
      billingErrorMessage('portal', {
        error: 'No billing account found. Please subscribe first.',
        status: 404,
      })
    ).toBe('No billing account found. Please subscribe first.');
  });

  it('never ends a message with an exclamation mark', () => {
    const cases = [
      billingErrorMessage('checkout', { error: null, status: null }),
      billingErrorMessage('checkout', { error: null, status: 500 }),
      billingErrorMessage('school-checkout', { error: null, status: 500 }),
      billingErrorMessage('portal', { error: null, status: 500 }),
      billingErrorMessage('portal', { error: null, status: null }),
      billingErrorMessage('checkout', { error: null, status: 401 }),
    ];
    for (const message of cases) expect(message).not.toMatch(/!/);
  });
});
