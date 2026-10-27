/**
 * The parent choice made on the sign-up form, kept across an OAuth redirect.
 *
 * Email sign-up sends the account type in its metadata, but `signInWithOAuth`
 * cannot carry metadata. A Google, Microsoft or GitHub sign-up therefore needs
 * the choice written down in the browser before the redirect leaves the app,
 * and read back when the callback arrives. Only a parent choice is stored: a
 * student is the default and needs no marker.
 *
 * It expires after 30 minutes, the same window `claim_parent_account` (schema
 * §31) allows a new account, so a choice from an abandoned attempt cannot apply
 * much later.
 *
 * Storage can be blocked (private windows, disabled site data). Every access is
 * wrapped: a blocked write means the account stays a student, as it always did.
 */

export const PENDING_ACCOUNT_TYPE_KEY = 'hsc.pendingAccountType';
export const PENDING_ACCOUNT_TYPE_MAX_AGE_MS = 30 * 60 * 1000;

/** Records the choice before a redirect. Anything other than `parent` clears it. */
export const rememberPendingAccountType = (
  accountType: 'student' | 'parent' | null | undefined,
  now: number = Date.now()
): void => {
  try {
    if (accountType !== 'parent') {
      window.localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
      return;
    }
    window.localStorage.setItem(
      PENDING_ACCOUNT_TYPE_KEY,
      JSON.stringify({ type: 'parent', at: now })
    );
  } catch {
    // Non-fatal: without the marker the sign-up stays a student.
  }
};

/** True when a parent choice recorded within the last 30 minutes is waiting. */
export const readPendingParentChoice = (now: number = Date.now()): boolean => {
  try {
    const raw = window.localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { type?: unknown; at?: unknown } | null;
    if (parsed?.type !== 'parent' || typeof parsed.at !== 'number') return false;
    const age = now - parsed.at;
    return age >= 0 && age < PENDING_ACCOUNT_TYPE_MAX_AGE_MS;
  } catch {
    // A corrupt or unreadable marker is treated as absent.
    return false;
  }
};

/** Forgets the choice. Called once the callback has used it, whatever the outcome. */
export const clearPendingAccountType = (): void => {
  try {
    window.localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
  } catch {
    // Non-fatal: the marker expires on its own.
  }
};
