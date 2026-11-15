import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { ToastType } from '../../hooks/useToast';
import {
  fetchSignupSettings,
  parseDailySignupCap,
  parseSignupDomains,
  saveSignupSettings,
  type SignupSettings,
} from '../../services/signupSettingsService';

interface SignupLimitsSectionProps {
  isOpen: boolean;
  showToast: (message: string, type: ToastType) => void;
}

/**
 * Sign-up limits: whether anyone can create an account, which email domains may, and a
 * daily cap on new accounts. The database enforces them through the Supabase "Before
 * user created" hook (schema.sql §33), so this panel only changes the stored settings.
 * Hidden on a database that pre-dates §33, rather than showing settings that do nothing.
 */
const SignupLimitsSection: React.FC<SignupLimitsSectionProps> = ({ isOpen, showToast }) => {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [saved, setSaved] = useState<SignupSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [domainsText, setDomainsText] = useState('');
  const [capText, setCapText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyToForm = (settings: SignupSettings) => {
    setSaved(settings);
    setEnabled(settings.signupsEnabled);
    setDomainsText(settings.allowedEmailDomains.join(', '));
    setCapText(settings.dailySignupCap !== null ? String(settings.dailySignupCap) : '');
  };

  // Re-read each time the dashboard opens, so a change made elsewhere is what the form shows.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadState('loading');
    fetchSignupSettings().then((settings) => {
      if (cancelled) return;
      if (settings) {
        applyToForm(settings);
        setLoadState('ready');
      } else {
        setLoadState('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (loadState === 'unavailable') return null;

  const formDomains = parseSignupDomains(domainsText);
  const isDirty =
    saved !== null &&
    (enabled !== saved.signupsEnabled ||
      formDomains.join(',') !== saved.allowedEmailDomains.join(',') ||
      capText.trim() !== (saved.dailySignupCap !== null ? String(saved.dailySignupCap) : ''));

  const handleSave = async () => {
    const cap = parseDailySignupCap(capText);
    if (cap.error) {
      setError(cap.error);
      showToast(cap.error, 'error');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const next = await saveSignupSettings({
        signupsEnabled: enabled,
        allowedEmailDomains: formDomains,
        dailySignupCap: cap.value,
      });
      applyToForm(next);
      showToast('Sign-up limits saved. They apply to the next sign-up.', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save the sign-up limits.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'text-sm rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-3 py-2 outline-none focus:border-[rgb(var(--color-accent))]/60 disabled:opacity-50';

  return (
    <section>
      <h3 className="t-section !normal-case !tracking-normal !text-sm text-[rgb(var(--color-text-muted))] light:text-slate-600 mb-3 flex items-center gap-2">
        <UserPlus className="w-3.5 h-3.5" /> Sign-up limits
      </h3>
      <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-600 mb-3 max-w-xl">
        Who can create an account. Each new account is a student with a daily AI allowance, so these
        are enforced on the server, not only in the sign-up form. They apply only once the Supabase{' '}
        <strong>Before user created</strong> hook is on (Authentication, Hooks, public.
        hook_before_user_created). Until it is, saving changes nothing.
      </p>

      {loadState === 'loading' ? (
        <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-600">
          Loading sign-up limits…
        </p>
      ) : (
        <div className="flex flex-col gap-3 max-w-xl">
          <label className="flex items-center gap-2 text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              disabled={isSaving}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-[rgb(var(--color-accent))]"
            />
            Allow new sign-ups
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[rgb(var(--color-text-dim))] light:text-slate-600">
              Allowed email domains
            </span>
            <input
              type="text"
              value={domainsText}
              disabled={isSaving}
              placeholder="education.nsw.gov.au, det.nsw.edu.au"
              aria-label="Allowed email domains"
              onChange={(e) => setDomainsText(e.target.value)}
              className={inputClass}
            />
            <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-600">
              Comma-separated. Blank allows any domain. Sub-domains of a listed domain are included.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[rgb(var(--color-text-dim))] light:text-slate-600">
              Max new accounts per day
            </span>
            <input
              type="number"
              min={0}
              value={capText}
              disabled={isSaving}
              placeholder="No limit"
              aria-label="Max new accounts per day"
              onChange={(e) => setCapText(e.target.value)}
              className={`${inputClass} w-32 font-mono`}
            />
            <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-600">
              Counted in UTC. Blank means no limit. Zero closes sign-ups for the day.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-400 light:text-red-700">
              {error}
            </p>
          )}

          <div>
            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className="t-label px-4 py-2 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] light:text-[rgb(var(--color-accent-dark))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Sign-up Limits'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default SignupLimitsSection;
