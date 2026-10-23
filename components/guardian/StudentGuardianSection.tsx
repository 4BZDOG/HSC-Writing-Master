import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '../../types';
import { PLAN_LABELS } from '../../services/entitlements';
import {
  createGuardianInvite,
  guardianAvailable,
  listMyGuardians,
  removeGuardianLink,
  type GuardianInvite,
  type LinkedGuardian,
} from '../../services/guardianService';
import { PROFILE_CARD, PROFILE_SECTION_TITLE } from '../ProfileCharts';

/**
 * The student's side of the parent link, in the profile's settings tab.
 *
 * The child makes the code, so the child decides who may link. Sharing it lets
 * a parent see the child's progress and pay for their plan. Removing a guardian
 * is confirmed inline: the profile is already a dialog, and a second dialog
 * opened from inside it breaks the close-on-backdrop rule.
 *
 * Shown only where there is an online account to link to, and only to a
 * student: a parent links from their own dashboard, and nobody else holds a
 * child's plan to share.
 */

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const dateLabel = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

const expiryLabel = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Whether the section belongs in this profile at all. Only a student makes a
 * link code: the server's create_guardian_invite refuses every other role, so a
 * teacher, admin, parent or guest is not offered a control that can only fail.
 */
export const showGuardianSection = (user: User): boolean =>
  guardianAvailable() && user.role === 'user';

const BUTTON_QUIET =
  't-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl border border-secondary bg-surface text-secondary can-hover:hover:bg-surface-inset touch-manipulation select-none transition-colors disabled:cursor-wait disabled:text-muted';

const BUTTON_PLUS =
  't-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-slate-950 can-hover:hover:bg-amber-800 dark:can-hover:hover:bg-amber-500 active:scale-[0.98] transition-colors touch-manipulation select-none disabled:cursor-wait disabled:bg-surface-light disabled:text-muted';

const StudentGuardianSection: React.FC = () => {
  const [invite, setInvite] = useState<GuardianInvite | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [guardians, setGuardians] = useState<LinkedGuardian[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);

  const loadGuardians = useCallback(async () => {
    setListError(null);
    try {
      setGuardians(await listMyGuardians());
    } catch (err) {
      setListError(errorText(err, 'Your linked guardians could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void loadGuardians();
  }, [loadGuardians]);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    setCopied(false);
    try {
      setInvite(await createGuardianInvite());
    } catch (err) {
      setCreateError(errorText(err, 'A link code could not be created. Try again in a moment.'));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
    } catch {
      setCopied(false);
      setCreateError('The code could not be copied. Select it and copy it by hand.');
    }
  };

  const handleRemove = async (guardian: LinkedGuardian) => {
    setRemovingId(guardian.guardianId);
    setRemoveError(null);
    setRemoveNotice(null);
    try {
      const removed = await removeGuardianLink(guardian.guardianId);
      setConfirmingId(null);
      if (!removed) setRemoveNotice('That link had already been removed.');
      await loadGuardians();
    } catch (err) {
      setRemoveError(errorText(err, 'The link could not be removed. Try again in a moment.'));
    } finally {
      setRemovingId(null);
    }
  };

  const expires = invite ? expiryLabel(invite.expiresAt) : null;

  return (
    <section aria-labelledby="profile-guardian-heading" className="space-y-3">
      <h3 id="profile-guardian-heading" className={PROFILE_SECTION_TITLE}>
        Parent or guardian
      </h3>
      <div className={`${PROFILE_CARD} space-y-5`}>
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-secondary">
            Create a link code and share it with a parent or guardian. Once they enter it, they can
            see your progress and pay for your {PLAN_LABELS.plus}. They see your marks and trends,
            not what you wrote.
          </p>
          <p className="t-label text-muted">A code works once and expires after 7 days.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            aria-busy={creating || undefined}
            className={BUTTON_PLUS}
          >
            {creating ? 'Creating code…' : invite ? 'Create a new code' : 'Create a link code'}
          </button>

          {invite && (
            <div className="space-y-2 rounded-xl border border-secondary bg-surface-inset p-4">
              <p className="font-mono text-2xl font-bold tracking-widest tabular-nums text-primary select-all break-all">
                {invite.code}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleCopy} className={BUTTON_QUIET}>
                  {copied ? 'Copied' : 'Copy code'}
                </button>
                {expires && <p className="t-label text-secondary">Expires {expires}</p>}
              </div>
            </div>
          )}

          {createError && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {createError}
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-secondary pt-5">
          <h4 className="text-sm font-semibold text-primary">Linked parents and guardians</h4>

          {guardians === null && !listError && (
            <p role="status" aria-busy="true" className="t-label text-secondary">
              Loading…
            </p>
          )}

          {listError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                {listError}
              </p>
              <button type="button" onClick={() => void loadGuardians()} className={BUTTON_QUIET}>
                Try again
              </button>
            </div>
          )}

          {guardians !== null && guardians.length === 0 && (
            <p className="text-sm text-secondary">
              No parent or guardian is linked to your account.
            </p>
          )}

          {guardians !== null && guardians.length > 0 && (
            <ul className="space-y-3">
              {guardians.map((guardian) => {
                const linked = dateLabel(guardian.linkedAt);
                const confirming = confirmingId === guardian.guardianId;
                return (
                  <li
                    key={guardian.guardianId}
                    className="flex flex-col gap-3 rounded-xl border border-secondary bg-surface-inset p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-primary break-words">
                        {guardian.displayName}
                      </p>
                      {linked && <p className="t-label text-muted">Linked {linked}</p>}
                    </div>
                    {confirming ? (
                      <div className="space-y-2">
                        <p className="text-sm text-secondary">
                          They will stop seeing your progress. A {PLAN_LABELS.plus} they pay for
                          keeps running.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRemove(guardian)}
                            disabled={removingId === guardian.guardianId}
                            className="t-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-red-700 text-white can-hover:hover:bg-red-800 touch-manipulation select-none disabled:cursor-wait"
                          >
                            {removingId === guardian.guardianId ? 'Removing…' : 'Remove'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className={BUTTON_QUIET}
                          >
                            Keep link
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveError(null);
                            setConfirmingId(guardian.guardianId);
                          }}
                          className="t-label min-h-11 sm:min-h-0 px-3 py-2 rounded-xl text-red-700 dark:text-red-400 can-hover:hover:bg-surface-elevated touch-manipulation select-none"
                        >
                          Remove {guardian.displayName}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {removeError && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {removeError}
            </p>
          )}
          {removeNotice && (
            <p role="status" className="text-sm font-medium text-secondary">
              {removeNotice}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default StudentGuardianSection;
