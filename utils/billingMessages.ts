/**
 * What a customer reads when a billing request fails.
 *
 * The server's sentence is kept where it is one a customer can act on ("Please
 * sign in again", "Unknown plan. Please refresh and try again."). It is replaced
 * where it is an operator's sentence. A misconfigured deployment answers 503
 * with a paragraph naming STRIPE_SECRET_KEY and the VITE_STRIPE_* variables,
 * and that paragraph used to reach the toast verbatim, on the one screen where
 * someone is trying to pay.
 *
 * Every line says what happened to the money or the plan, because that is the
 * question a person has at the moment a payment fails. Checkout cannot have
 * taken a payment when no session URL came back, so "you have not been
 * charged" is a fact here, not a reassurance.
 *
 * Pure, with no imports, so it can be tested without mounting a modal.
 */
export type BillingAction = 'checkout' | 'school-checkout' | 'portal';

export interface BillingFailure {
  error: string | null;
  /** The HTTP status, or null when the request never reached the server. */
  status: number | null;
}

const UNAVAILABLE: Record<BillingAction, string> = {
  checkout:
    'Checkout is unavailable right now, so you have not been charged. Please try again in a few minutes.',
  'school-checkout':
    'The school licence checkout is unavailable right now, so you have not been charged. Please try again in a few minutes.',
  portal:
    'The billing portal is unavailable right now. Nothing about your plan has changed. Please try again in a few minutes.',
};

const UNREACHABLE: Record<BillingAction, string> = {
  checkout:
    'We could not reach billing, so you have not been charged. Check your connection and try again.',
  'school-checkout':
    'We could not reach billing, so no seats have been bought. Check your connection and try again.',
  portal:
    'We could not reach billing. Nothing about your plan has changed. Check your connection and try again.',
};

export const billingErrorMessage = (action: BillingAction, failure: BillingFailure): string => {
  const { status, error } = failure;
  if (status === null) return UNREACHABLE[action];
  if (status === 401) return 'Please sign in again, then try once more.';
  // 501 is the server saying nothing is for sale yet, and its sentence is
  // written for a customer ("No plans are available for purchase yet.").
  if (status === 501 && error) return error;
  // 5xx is the server or its configuration. 403 and 405 are a request the app
  // should never send. Neither has a sentence a customer can act on.
  if (status >= 500 || status === 403 || status === 405) return UNAVAILABLE[action];
  return error || UNAVAILABLE[action];
};
