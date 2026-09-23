import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import {
  validateNewPassword,
  hasSignupErrors,
  MIN_PASSWORD_LENGTH,
  type SignupFieldErrors,
} from '../services/signupPolicy';
import { Lock, ArrowRight, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import AuthBackdrop from './AuthBackdrop';
import AuthBrand from './AuthBrand';
import AuthField from './AuthField';
import MeshOverlay from './MeshOverlay';
import {
  AUTH_CARD,
  AUTH_COLUMN,
  AUTH_PAGE,
  AUTH_PRIMARY_BUTTON,
  AUTH_TEXT_LINK,
} from '../utils/authChrome';

interface ResetPasswordPageProps {
  /** Called with the signed-in user once the new password is set. */
  onComplete: (user: User) => void;
  /** Called when the user backs out; the caller returns to the login screen. */
  onCancel: () => void;
}

/**
 * The second half of a password reset: the screen the emailed link lands on.
 *
 * It is a whole screen rather than a mode of the login form because the user
 * arriving here is ALREADY signed in — the recovery link established a session
 * before they chose anything. Showing them a login form at that moment would be
 * incoherent, and letting them wander into the app without setting a password
 * would leave the session belonging to whoever opened the email rather than to
 * the account holder. So this is the only thing on screen, and backing out
 * signs that session off (`onCancel` → `cancelPasswordRecovery`).
 */
const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onComplete, onCancel }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors = validateNewPassword({ password, confirmPassword });
    setFieldErrors(errors);
    if (hasSignupErrors(errors)) return;

    setIsLoading(true);
    try {
      onComplete(await authService.completePasswordReset(password));
    } catch (err) {
      // completePasswordReset already restates an expired/used link and a
      // reused password in terms the reader can act on.
      setError(err instanceof Error ? err.message : 'Could not set the new password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={AUTH_PAGE}>
      <AuthBackdrop />

      <div className={AUTH_COLUMN}>
        <AuthBrand />

        <div className="w-full max-w-[420px] relative z-10 animate-fade-in-up">
          <div className={AUTH_CARD}>
            <MeshOverlay opacity="opacity-[0.04] light:opacity-[0.06]" />
            <div className="p-10 relative z-10">
              <form onSubmit={handleSubmit} className="space-y-7" data-testid="reset-password-form">
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border-2 border-indigo-500/30 flex items-center justify-center">
                    <KeyRound
                      className="w-7 h-7 text-indigo-400 light:text-indigo-600"
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="text-xl font-bold text-white light:text-slate-900">
                    Choose a new password
                  </h2>
                  <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">
                    You will be signed in straight away once it is set.
                  </p>
                </div>

                <AuthField
                  id="newPassword"
                  label="New password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  type="password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  icon={Lock}
                  // Always a NEW password here, so a password manager offers to
                  // generate and store one instead of filling in the old one.
                  autoComplete="new-password"
                  error={fieldErrors.password}
                />

                <AuthField
                  id="confirmNewPassword"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
                  type="password"
                  placeholder="Type it again"
                  icon={Lock}
                  autoComplete="new-password"
                  error={fieldErrors.confirmPassword}
                />

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 text-red-400 light:text-red-600 text-xs font-bold py-1 px-1 animate-fade-in"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading || undefined}
                  className={AUTH_PRIMARY_BUTTON}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      <span className="sr-only">Setting password…</span>
                    </>
                  ) : (
                    <>
                      Set password <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 light:text-slate-600">
                  <button type="button" onClick={onCancel} className={AUTH_TEXT_LINK}>
                    Cancel and sign out
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
