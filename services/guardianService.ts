import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  PLAN_LABELS,
  STRIPE_PRICE_IDS,
  checkoutReturnUrl,
  createPortalUrl,
  postBillingJson,
} from './entitlements';
import type { StudentProgress } from './responseService';
import { billingErrorMessage } from '../utils/billingMessages';

/**
 * Parent and guardian accounts: the client half of the contract in
 * supabase/schema.sql (the guardian RPCs) and api/create-checkout.ts.
 *
 * Every RPC is a thin typed wrapper. The server's own checks decide who may
 * do what; nothing here is a gate. Errors are turned into one sentence a
 * person can act on, and a parent with no online account gets a clear
 * "needs an online account" state rather than a failed call.
 *
 * No module-scope reads of imports: everything reads the environment or the
 * client inside a function (see the chunk-init guard in package.json).
 */

export type GuardianInterval = 'monthly' | 'yearly';
export type GuardianPlan = 'free' | 'plus' | 'school';

export interface GuardianInvite {
  code: string;
  expiresAt: string;
}

export interface RedeemedInvite {
  studentId: string;
  displayName: string;
}

/** A parent's view of a linked child (`list_my_students`). */
export interface LinkedStudent {
  studentId: string;
  displayName: string;
  username: string;
  plan: GuardianPlan;
  planPeriodEnd: string | null;
  /** True when this parent is the payer of the child's live subscription. */
  paidByMe: boolean;
  cancelAtPeriodEnd: boolean;
  linkedAt: string;
}

/** A child's view of a linked parent (`list_my_guardians`). */
export interface LinkedGuardian {
  guardianId: string;
  displayName: string;
  linkedAt: string;
}

/** `get_guardian_student_progress`: the student progress shape, plus a name. */
export type GuardianStudentProgress = StudentProgress & { displayName: string };

/**
 * Codes a guardian call can fail with. The HTTP ones come from the server's
 * `code` field. The RPC ones are matched from the English message the database
 * raises, because those raise without a code.
 */
export type GuardianErrorCode =
  | 'unavailable'
  | 'invite_not_found'
  | 'invite_expired'
  | 'invite_used'
  | 'own_invite'
  | 'link_limit'
  | 'not_a_guardian'
  | 'guardian_plus_only'
  | 'guardian_needs_beneficiary'
  | 'beneficiary_has_plan'
  | 'managed_by_guardian'
  | 'unknown';

export class GuardianError extends Error {
  readonly code: GuardianErrorCode;

  constructor(code: GuardianErrorCode, message: string) {
    super(message);
    this.name = 'GuardianError';
    this.code = code;
  }
}

/**
 * The sentence for a code, with `{name}` filled in where the code is about a
 * particular child. A function, not a table: the plan's name is read at call
 * time, never at module scope.
 */
export const guardianErrorMessage = (code: GuardianErrorCode, name = 'Your child'): string => {
  const plus = PLAN_LABELS.plus;
  switch (code) {
    case 'unavailable':
      return 'Parent accounts need an online account. This copy of the app is not connected to one, so linking and billing are not available here.';
    case 'invite_not_found':
      return 'That code does not match a child’s account. Check it with your child and try again.';
    case 'invite_expired':
      return 'That code has expired. Ask your child to create a new one.';
    case 'invite_used':
      return 'That code has already been used. Ask your child for a new one.';
    case 'own_invite':
      return 'You cannot link to your own account.';
    case 'link_limit':
      return 'You already have six children linked. Remove one before adding another.';
    case 'not_a_guardian':
      return 'You are not linked to this child.';
    case 'guardian_plus_only':
      return `A parent can only buy ${plus} for a child.`;
    case 'guardian_needs_beneficiary':
      return 'Choose the child this plan is for.';
    case 'beneficiary_has_plan':
      return `${name} already has ${plus}.`;
    case 'managed_by_guardian':
      return 'Your parent or guardian manages this subscription.';
    case 'unknown':
      return 'That did not work. Try again in a moment.';
  }
};

/**
 * Message patterns for the RPC errors. Order matters: the first match wins, so
 * the more specific phrasings come first. The backend's raise messages are the
 * source of truth; a message that matches none falls through to `unknown`.
 */
const RPC_MESSAGE_CODES: ReadonlyArray<readonly [RegExp, GuardianErrorCode]> = [
  [/expired/i, 'invite_expired'],
  [/already (been )?(redeemed|used)/i, 'invite_used'],
  [/itself|yourself|own (code|invite|account)|caller is the student/i, 'own_invite'],
  [/up to 6|linked to up to|limit|six|6 linked|too many/i, 'link_limit'],
  [
    /you are linked to|can only view the progress|not a guardian|not linked|not authori[sz]ed|permission denied/i,
    'not_a_guardian',
  ],
  [/no guardian code matches|not found|invalid code|no such|does not match/i, 'invite_not_found'],
];

/**
 * The end-user sentence the server raised, when it is one the client does not
 * map to a code. The database's P0001 messages are written for people, in UK
 * English, so they are shown as they are rather than replaced by a generic line.
 */
const serverSentence = (error: { code?: string; message?: string }): string | null =>
  error.code === 'P0001' && error.message ? error.message : null;

/** Which code an RPC's raised message stands for. Pure, so the mapping is tested. */
export const guardianCodeForRpcMessage = (message: string): GuardianErrorCode => {
  for (const [pattern, code] of RPC_MESSAGE_CODES) {
    if (pattern.test(message)) return code;
  }
  return 'unknown';
};

/** Is the online guardian path available in this build? */
export const guardianAvailable = (): boolean => isSupabaseConfigured && supabase !== null;

const requireClient = (): SupabaseClient => {
  if (!isSupabaseConfigured || !supabase) {
    throw new GuardianError('unavailable', guardianErrorMessage('unavailable'));
  }
  return supabase;
};

const callRpc = async <T>(fn: string, params: Record<string, unknown> = {}): Promise<T> => {
  const client = requireClient();
  const { data, error } = await client.rpc(fn, params);
  if (error) {
    const code = guardianCodeForRpcMessage(error.message ?? '');
    if (code === 'unknown') {
      const sentence = serverSentence(error);
      if (sentence) throw new GuardianError('unknown', sentence);
    }
    throw new GuardianError(code, guardianErrorMessage(code));
  }
  return data as T;
};

/** A live subscription this parent pays for (`subscriptions.payer_id`). */
export interface PaidSubscription {
  /** The student the plan is for (`subscriptions.user_id`). */
  userId: string;
  status: string;
}

const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * Every live subscription the caller pays for, including ones whose child is no
 * longer linked. The RLS policy "Payers read subscriptions they pay for" allows
 * this read. It is how billing stays reachable after a link is removed.
 */
export const listPaidSubscriptions = async (): Promise<PaidSubscription[]> => {
  const client = requireClient();
  const { data: session } = await client.auth.getSession();
  const payerId = session.session?.user?.id;
  if (!payerId) return [];
  const { data, error } = await client
    .from('subscriptions')
    .select('id, status, user_id')
    .eq('payer_id', payerId)
    .in('status', LIVE_STATUSES);
  if (error) throw new GuardianError('unknown', guardianErrorMessage('unknown'));
  return (data ?? []).map((row) => ({
    userId: String((row as { user_id: unknown }).user_id),
    status: String((row as { status: unknown }).status),
  }));
};

/** A student creates a one-time link code (7-day expiry; replaces the last unredeemed one). */
export const createGuardianInvite = async (): Promise<GuardianInvite> => {
  const data = await callRpc<Partial<GuardianInvite> | null>('create_guardian_invite');
  if (!data?.code || !data.expiresAt) {
    throw new GuardianError('unknown', guardianErrorMessage('unknown'));
  }
  return { code: data.code, expiresAt: data.expiresAt };
};

/** A parent redeems a child's code. The code is matched ignoring case, spaces and hyphens. */
export const redeemGuardianInvite = async (code: string): Promise<RedeemedInvite> => {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new GuardianError('invite_not_found', 'Enter the code your child shows you.');
  }
  const data = await callRpc<Partial<RedeemedInvite> | null>('redeem_guardian_invite', {
    p_code: trimmed,
  });
  if (!data?.studentId) throw new GuardianError('unknown', guardianErrorMessage('unknown'));
  return { studentId: data.studentId, displayName: data.displayName ?? 'Your child' };
};

/** A student's linked parents and guardians. */
export const listMyGuardians = async (): Promise<LinkedGuardian[]> => {
  const rows = await callRpc<LinkedGuardian[] | null>('list_my_guardians');
  return Array.isArray(rows) ? rows : [];
};

/** A parent's linked children, with each one's plan and who pays for it. */
export const listMyStudents = async (): Promise<LinkedStudent[]> => {
  const rows = await callRpc<LinkedStudent[] | null>('list_my_students');
  return Array.isArray(rows) ? rows : [];
};

/**
 * Remove a link from either side. Does NOT cancel a subscription: a parent who
 * pays keeps billing access through the portal.
 */
export const removeGuardianLink = async (otherUserId: string): Promise<boolean> => {
  const data = await callRpc<{ removed?: boolean } | null>('remove_guardian_link', {
    p_other: otherUserId,
  });
  return data?.removed === true;
};

/** Whether the caller is a guardian of this student. */
export const isGuardianOf = async (studentId: string): Promise<boolean> =>
  (await callRpc<boolean | null>('is_guardian_of', { p_student: studentId })) === true;

/**
 * A linked child's progress, read-only. `days` is 30 or 90 in the UI.
 * Normalised so `trend` and `byVerb` are always arrays, as on the student path.
 */
export const fetchGuardianStudentProgress = async (
  studentId: string,
  days = 30
): Promise<GuardianStudentProgress> => {
  const data = await callRpc<Partial<GuardianStudentProgress> | null>(
    'get_guardian_student_progress',
    { p_student_id: studentId, p_days: days }
  );
  if (!data?.totals) throw new GuardianError('unknown', guardianErrorMessage('unknown'));
  return {
    username: data.username ?? '',
    displayName: data.displayName ?? data.username ?? 'Your child',
    byVerb: Array.isArray(data.byVerb) ? data.byVerb : [],
    totals: data.totals,
    trend: Array.isArray(data.trend) ? data.trend : [],
  };
};

/**
 * The HTTP failure of a guardian checkout, as one sentence and, where there is
 * one, its code. `studentName` is only used for the child-specific refusal.
 * Pure, so every refusal is tested without a network.
 */
export const mapGuardianCheckoutFailure = (
  failure: { status: number | null; code?: string | null; error?: string | null },
  studentName = 'Your child'
): { code: GuardianErrorCode | null; message: string } => {
  const { status, code, error } = failure;
  switch (code) {
    case 'not_a_guardian':
      return { code: 'not_a_guardian', message: guardianErrorMessage('not_a_guardian') };
    case 'guardian_plus_only':
      return { code: 'guardian_plus_only', message: guardianErrorMessage('guardian_plus_only') };
    case 'guardian_needs_beneficiary':
      return {
        code: 'guardian_needs_beneficiary',
        message: guardianErrorMessage('guardian_needs_beneficiary'),
      };
    case 'beneficiary_has_plan':
      return {
        code: 'beneficiary_has_plan',
        message: guardianErrorMessage('beneficiary_has_plan', studentName),
      };
    default:
      return {
        code: null,
        message: billingErrorMessage('checkout', {
          status,
          error: error ?? null,
          code: code ?? null,
        }),
      };
  }
};

export interface GuardianCheckoutResult {
  url: string | null;
  error: string | null;
  code: GuardianErrorCode | null;
}

/**
 * Start a Band 6 Plus checkout for a linked child. The PARENT is the Stripe
 * customer and pays; the plan lands on the child (`beneficiaryUserId`).
 *
 * The price is the same Plus price the upgrade prompt sells, chosen by the
 * interval. Returns the Checkout URL for the caller to redirect to.
 */
export const startGuardianCheckout = async (
  studentId: string,
  interval: GuardianInterval,
  studentName = 'Your child'
): Promise<GuardianCheckoutResult> => {
  if (!guardianAvailable()) {
    return { url: null, error: guardianErrorMessage('unavailable'), code: 'unavailable' };
  }
  const priceId =
    interval === 'yearly' ? STRIPE_PRICE_IDS.plus_yearly : STRIPE_PRICE_IDS.plus_monthly;
  if (!priceId) {
    return {
      url: null,
      error: `${PLAN_LABELS.plus} is not on sale yet, so there is nothing to buy.`,
      code: null,
    };
  }
  const { data, error, status, code } = await postBillingJson<{ url?: string }>(
    '/api/create-checkout',
    { priceId, returnUrl: checkoutReturnUrl(), beneficiaryUserId: studentId },
    'Could not start checkout. Please try again.'
  );
  if (data?.url) return { url: data.url, error: null, code: null };
  const failure = mapGuardianCheckoutFailure({ status, code, error }, studentName);
  return { url: null, error: failure.message, code: failure.code };
};

/**
 * The toast a parent sees when they return from a Plus checkout. The payment is
 * theirs, and the plan shows on the child's card, so the parent's own plan is not
 * mentioned. A function, so the plan's name is read at call time.
 */
export const guardianCheckoutSuccessMessage = (): string =>
  `Payment received. ${PLAN_LABELS.plus} will show on your child's card in a moment.`;

export interface GuardianPortalResult {
  url: string | null;
  error: string | null;
}

/**
 * The Stripe billing portal for the parent, who is the customer. It lists the
 * subscriptions they pay for, including ones whose child link has since gone.
 */
export const openGuardianBillingPortal = async (): Promise<GuardianPortalResult> => {
  if (!guardianAvailable()) return { url: null, error: guardianErrorMessage('unavailable') };
  const result = await createPortalUrl();
  if (result.url) return { url: result.url, error: null };
  return {
    url: null,
    error: billingErrorMessage('portal', {
      error: result.error,
      status: result.status,
      code: result.code,
    }),
  };
};
