/**
 * A parent or guardian buying Plus for a linked student (schema §31).
 *
 * The parent is the Stripe customer, so the card is theirs. The plan lands on the
 * student, and every entitlement check reads it there. This module answers the one
 * question create-checkout must settle before any money moves: may this caller buy this
 * plan for this student? The checks run in a fixed order, and each refusal has its own
 * code, so the client can say what to do next:
 *
 *   1. the caller is a parent                       else 403 not_a_guardian
 *   2. the caller is linked to the student          else 403 not_a_guardian
 *   3. the price is a Plus price (not School)       else 400 guardian_plus_only
 *   4. the student holds no live plan               else 409 beneficiary_has_plan
 *
 * Step 4 is the student's own guard. The parent's own subscriptions are NOT checked: a
 * parent may pay for several children.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLiveStatus, LIVE_STATUSES } from './openCheckout';

export const NOT_A_GUARDIAN_MESSAGE = 'You can only buy Plus for a student you are linked to.';

export const GUARDIAN_PLUS_ONLY_MESSAGE =
  'A parent or guardian can buy Plus for a linked student, not a School licence.';

export const GUARDIAN_NEEDS_BENEFICIARY_MESSAGE =
  'Choose the student this subscription is for, then try again.';

export const BENEFICIARY_HAS_PLAN_MESSAGE =
  'This student already has a Plus plan, or a purchase for them is still waiting for payment.';

export const SCHOOL_PROVIDES_PLUS_MESSAGE = "This student's school already provides Band 6 Plus.";

export interface GuardianRefusal {
  status: number;
  code: string;
  error: string;
}

/** The plans that hold a student's purchase, as profiles.stripe_plan names them. */
const PLANS_THAT_HOLD = ['plus', 'school'];

/**
 * The refusal for this purchase, or null when it may go ahead.
 *
 * Throws when a lookup fails. The caller answers 503 then: nothing can be said about the
 * link either way, and a guess here would sell a plan to a stranger's child.
 */
export async function guardianPurchaseRefusal(
  supabase: SupabaseClient,
  input: {
    guardianId: string;
    beneficiaryId: string;
    guardianRole: unknown;
    isPlusPrice: boolean;
  }
): Promise<GuardianRefusal | null> {
  if (input.guardianRole !== 'parent') {
    return { status: 403, code: 'not_a_guardian', error: NOT_A_GUARDIAN_MESSAGE };
  }

  const { data: link, error: linkError } = await supabase
    .from('guardian_links')
    .select('student_id')
    .eq('guardian_id', input.guardianId)
    .eq('student_id', input.beneficiaryId)
    .maybeSingle();
  if (linkError) throw new Error(`guardian link lookup failed: ${linkError.message}`);
  if (!link) {
    return { status: 403, code: 'not_a_guardian', error: NOT_A_GUARDIAN_MESSAGE };
  }

  if (!input.isPlusPrice) {
    return { status: 400, code: 'guardian_plus_only', error: GUARDIAN_PLUS_ONLY_MESSAGE };
  }

  const { data: student, error: studentError } = await supabase
    .from('profiles')
    .select('stripe_plan, school_id')
    .eq('id', input.beneficiaryId)
    .maybeSingle();
  if (studentError) throw new Error(`student plan lookup failed: ${studentError.message}`);
  if (PLANS_THAT_HOLD.includes(student?.stripe_plan as string)) {
    return { status: 409, code: 'beneficiary_has_plan', error: BENEFICIARY_HAS_PLAN_MESSAGE };
  }

  // A student whose school holds a live licence already has the School plan through it,
  // which caller_plan() (§17) grants before any personal plan. Nobody is sold what they
  // already hold, so the parent is refused the same way.
  const schoolId = student?.school_id as string | null | undefined;
  if (schoolId) {
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('plan_status')
      .eq('id', schoolId)
      .maybeSingle();
    if (schoolError) throw new Error(`student school lookup failed: ${schoolError.message}`);
    if (school && isLiveStatus(school.plan_status)) {
      return { status: 409, code: 'beneficiary_has_plan', error: SCHOOL_PROVIDES_PLUS_MESSAGE };
    }
  }

  const { data: live, error: liveError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', input.beneficiaryId)
    .in('status', [...LIVE_STATUSES])
    .limit(1);
  if (liveError) throw new Error(`student subscription lookup failed: ${liveError.message}`);
  if ((live ?? []).length > 0) {
    return { status: 409, code: 'beneficiary_has_plan', error: BENEFICIARY_HAS_PLAN_MESSAGE };
  }

  return null;
}
