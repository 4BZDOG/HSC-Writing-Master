import type { User, UserAgreement, UserRole } from '../types';
import { authService } from './authService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  AGREEMENT_VERSION,
  AGREEMENT_CHANGELOG,
  CHARTERS,
  type AgreementChange,
  type Charter,
  type CharterAudience,
} from '../data/legalContent';
import { QUICK_START_VERSION } from '../data/quickStartContent';

/**
 * Agreement acceptance and first-run onboarding state.
 *
 * The acceptance record lives on the User object (`user.agreement`), which is
 * mirrored in three places by design:
 *
 *   1. Supabase `profiles.agreement_version` / `agreement_accepted_at` — the
 *      durable record, and the only copy that survives clearing site data.
 *   2. The cached `AUTH_USER` in localStorage / the IndexedDB profile, written
 *      by `authService.updateUser` — what the gate reads on the next load.
 *   3. React state, so the gate closes immediately on accept.
 *
 * A failed server write must never trap a user behind the gate: acceptance is
 * recorded locally first and the remote write is best-effort. The worst case
 * is that a user re-accepts on another device, which is harmless.
 */

// ---------------------------------------------------------------------------
// Who reads which charter
// ---------------------------------------------------------------------------

/**
 * Students and guests read the student charter — a guest is almost always a
 * student or a teacher having a look, and the student charter is the one that
 * explains what the marker is. Teachers and admins read the teacher charter,
 * which additionally covers student visibility and moderation.
 */
export const audienceForRole = (role: UserRole): CharterAudience =>
  role === 'admin' || role === 'teacher' ? 'teacher' : 'student';

export const charterForRole = (role: UserRole): Charter => CHARTERS[audienceForRole(role)];

// ---------------------------------------------------------------------------
// Does this user need to accept?
// ---------------------------------------------------------------------------

/** True when the user has not accepted the CURRENT agreement version. */
export const needsAgreement = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.agreement?.version !== AGREEMENT_VERSION;
};

/**
 * Guests are not blocked. They get the same charter as a courtesy notice they
 * can dismiss — a read-only trial that persists nothing server-side is not the
 * moment to demand a signature, and a hard gate there just loses the visitor.
 */
export const isAgreementBlocking = (user: User | null | undefined): boolean =>
  !!user && user.role !== 'guest';

/** True when the user has accepted before, but an older version. */
export const isReAcceptance = (user: User | null | undefined): boolean =>
  !!user?.agreement && user.agreement.version !== AGREEMENT_VERSION;

/**
 * What changed since the version the user last accepted, newest first. Used to
 * show a re-accepting user why they are being asked again — being re-prompted
 * with no explanation reads as a bug.
 *
 * An unknown or absent previous version yields an empty list: we cannot say
 * what changed relative to something we have no record of, and inventing a
 * summary would be worse than showing none.
 */
export const changesSince = (previousVersion: string | undefined): AgreementChange[] => {
  if (!previousVersion) return [];
  const previousIndex = AGREEMENT_CHANGELOG.findIndex((c) => c.version === previousVersion);
  if (previousIndex === -1) return [];
  return AGREEMENT_CHANGELOG.slice(0, previousIndex);
};

// ---------------------------------------------------------------------------
// Recording acceptance
// ---------------------------------------------------------------------------

/**
 * Best-effort durable write of onboarding columns. Never throws, and is kept
 * SEPARATE from `authService.updateUser` on purpose: a database that predates
 * the agreement migration would reject the whole update statement, taking
 * display name, preferences and stats down with it. Here, a rejection costs
 * nothing but the durable copy.
 */
const patchProfileSoft = async (fields: Record<string, string | null>): Promise<void> => {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('profiles').update(fields).eq('id', data.user.id);
  } catch {
    /* Column not migrated yet, offline, or RLS refused — the local record
       stands and the user is not blocked. */
  }
};

const persistAgreementRemotely = (agreement: UserAgreement): Promise<void> =>
  patchProfileSoft({
    agreement_version: agreement.version,
    agreement_accepted_at: new Date(agreement.acceptedAt).toISOString(),
  });

/**
 * Record that this user accepts the current agreement. Returns the updated
 * user so the caller can push it into React state immediately.
 */
export const acceptAgreement = async (user: User): Promise<User> => {
  const agreement: UserAgreement = { version: AGREEMENT_VERSION, acceptedAt: Date.now() };
  const updated: User = { ...user, agreement };

  // Local first: this is what unblocks the gate, and it must not depend on a
  // network round trip succeeding.
  await authService.updateUser(updated).catch(() => {
    /* IndexedDB unavailable — the in-memory user still carries acceptance for
       this session, and the user will simply be asked again next visit. */
  });
  await persistAgreementRemotely(agreement);

  return updated;
};

// ---------------------------------------------------------------------------
// Quick start
// ---------------------------------------------------------------------------

/**
 * True when the quick-start guide should open by itself. Deliberately narrow:
 * it fires on a genuinely new account, and again if the guide is re-versioned.
 * Everyone else opens it themselves from the header or their profile.
 */
export const needsQuickStart = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.quickStartSeenVersion !== QUICK_START_VERSION;
};

/** Mark the guide as seen so it stops opening on its own. */
export const markQuickStartSeen = async (user: User): Promise<User> => {
  const updated: User = { ...user, quickStartSeenVersion: QUICK_START_VERSION };
  await authService.updateUser(updated).catch(() => {
    /* Non-critical: at worst the guide greets them once more. */
  });
  await patchProfileSoft({ quick_start_seen_version: QUICK_START_VERSION });
  return updated;
};
