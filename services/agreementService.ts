import type { User, UserAgreement, UserRole } from '../types';
import { authService } from './authService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { safeSetItem, STORAGE_KEYS } from '../utils/storageUtils';
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

/**
 * Why the user is being asked. Drives the wording of the dialog — "here is the
 * agreement" and "we have changed the agreement" and "your account changed, so
 * the other charter applies to you now" are three different messages, and
 * showing the wrong one reads as a bug.
 */
export type AgreementPromptReason = 'none' | 'first' | 'updated' | 'roleChanged';

export const agreementPromptReason = (user: User | null | undefined): AgreementPromptReason => {
  if (!user) return 'none';
  const accepted = user.agreement;
  if (!accepted) return 'first';
  if (accepted.version !== AGREEMENT_VERSION) return 'updated';
  // A student promoted to teacher accepted a charter that says nothing about
  // seeing other people's work or about moderation. Records written before the
  // audience was tracked carry no audience and are left alone.
  if (accepted.audience && accepted.audience !== audienceForRole(user.role)) return 'roleChanged';
  return 'none';
};

/** True when the user has not accepted the agreement that currently applies. */
export const needsAgreement = (user: User | null | undefined): boolean =>
  agreementPromptReason(user) !== 'none';

/**
 * Guests are not blocked. They get the same charter as a courtesy notice they
 * can dismiss — a read-only trial that persists nothing server-side is not the
 * moment to demand a signature, and a hard gate there just loses the visitor.
 */
export const isAgreementBlocking = (user: User | null | undefined): boolean =>
  !!user && user.role !== 'guest';

/** True when the user has accepted before, but an older version. */
export const isReAcceptance = (user: User | null | undefined): boolean =>
  agreementPromptReason(user) === 'updated';

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
    agreement_audience: agreement.audience ?? null,
  });

/**
 * Record that this user accepts the current agreement. Returns the updated
 * user so the caller can push it into React state immediately.
 */
export const acceptAgreement = async (user: User): Promise<User> => {
  const agreement: UserAgreement = {
    version: AGREEMENT_VERSION,
    acceptedAt: Date.now(),
    audience: audienceForRole(user.role),
  };
  const updated: User = { ...user, agreement };

  // Synchronous localStorage write FIRST, before anything that awaits.
  // `authService.updateUser` only reaches localStorage after an IndexedDB
  // round trip, which leaves a window — small, but real on a slow device —
  // where a user who clicks Agree and immediately reloads or closes the tab
  // is asked all over again. This closes it: the cached user carries the
  // acceptance the instant the button is pressed.
  safeSetItem(STORAGE_KEYS.AUTH_USER, updated);

  // Then the durable copies. Local before remote: the local record is what
  // unblocks the gate, and it must not depend on a network round trip.
  await authService.updateUser(updated).catch(() => {
    /* IndexedDB unavailable — the localStorage record above still stands. */
  });
  await persistAgreementRemotely(agreement);

  return updated;
};

// ---------------------------------------------------------------------------
// Compliance reporting (admin)
// ---------------------------------------------------------------------------

export interface AcceptanceRow {
  username: string;
  role: string;
  accepted: boolean;
  acceptedAt: string | null;
}

/**
 * Who has accepted the current agreement, for an administrator. Backed by
 * `agreement_acceptance_report()` (schema §15), which is admin-gated in SQL —
 * this client call is a convenience, not the access control.
 *
 * Returns null when the RPC is unavailable (mock mode, or a database that
 * pre-dates the migration) so the caller can hide the panel rather than show
 * an empty table that reads as "nobody has accepted".
 */
export const fetchAcceptanceReport = async (): Promise<AcceptanceRow[] | null> => {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc('agreement_acceptance_report', {
      p_version: AGREEMENT_VERSION,
    });
    if (error || !Array.isArray(data)) return null;
    return data.map((row: Record<string, unknown>) => ({
      username: String(row.username ?? ''),
      role: String(row.role ?? ''),
      accepted: row.accepted === true,
      acceptedAt: (row.accepted_at as string | null) ?? null,
    }));
  } catch {
    return null;
  }
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
