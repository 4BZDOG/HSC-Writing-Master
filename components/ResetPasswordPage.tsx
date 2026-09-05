import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import {
  validateNewPassword,
  hasSignupErrors,
  MIN_PASSWORD_LENGTH,
  type SignupFieldErrors,
} from '../services/signupPolicy';
import { Lock, ArrowRight, Sparkles, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import AuthBackdrop from './AuthBackdrop';

interface ResetPasswordPageProps {
  /** Called with the signed-in user once the new password is set. */
  onComplete: (user: User) => void;
  /** Called when the user backs out; the caller returns to the login screen. */
  onCancel: () => void;
}

const MeshOverlay = () => (
  <div
    className="absolute inset-0 opacity-[0.04] light:opacity-[0.06] pointer-events-none mix-blend-overlay z-0"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const Field = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  hasError,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  hasError: boolean;
}) => (
  <div className="space-y-2.5">
    <label htmlFor={id} className="t-label block text-slate-400 light:text-slate-600 ml-1">
      {label}
    </label>
    <div
      className={`relative flex items-center bg-black/50 light:bg-slate-50 border-2 rounded-2xl transition-colors duration-300 ${
        hasError
          ? 'border-red-500/50 bg-red-500/[0.02]'
          : 'border-white/10 light:border-slate-300 focus-within:border-indigo-500'
      }`}
    >
      <Lock className={`ml-4 h-4 w-4 ${hasError ? 'text-red-400' : 'text-slate-500'}`} />
      <input
        id={id}
        type="password"
        value={value}
        onChange={onChange}
        // Always a NEW password here, so a password manager offers to generate
        // and store one instead of filling in the one that is being replaced.
        autoComplete="new-password"
        className="block w-full pl-3 pr-4 py-4 bg-transparent text-white light:text-slate-900 placeholder-slate-600 outline-none border-none font-medium text-sm"
        placeholder={placeholder}
      />
    </div>
  </div>
);

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
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden px-6">
      <AuthBackdrop />

      <div className="text-center mb-10 relative z-10 animate-fade-in">
        <div className="relative w-20 h-20 mx-auto mb-6 rounded-tile bg-gradient-to-br from-indigo-500 to-sky-500 border border-white/20 shadow-lg flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <span className="t-label text-indigo-400 opacity-80">HSC Writing Coach</span>
        <h1 className="text-4xl font-bold tracking-tight text-white light:text-slate-900 leading-none mt-2">
          Band <span className="text-indigo-500">6</span>
        </h1>
      </div>

      <div className="w-full max-w-[420px] relative z-10 animate-fade-in-up">
        <div className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 border-white/20 light:border-slate-300/80 rounded-surface shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] light:shadow-[0_28px_60px_-20px_rgba(51,65,85,0.35)] overflow-hidden relative">
          <MeshOverlay />
          <div className="p-10 relative z-10">
            <form onSubmit={handleSubmit} className="space-y-7" data-testid="reset-password-form">
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border-2 border-indigo-500/30 flex items-center justify-center">
                  <KeyRound className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white light:text-slate-900">
                  Choose a new password
                </h2>
                <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">
                  You will be signed in straight away once it is set.
                </p>
              </div>

              <div>
                <Field
                  id="newPassword"
                  label="New password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  hasError={Boolean(fieldErrors.password)}
                />
                {fieldErrors.password && (
                  <p className="flex items-center gap-1.5 text-red-400 light:text-red-600 text-[11px] mt-2 ml-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> {fieldErrors.password}
                  </p>
                )}
              </div>

              <div>
                <Field
                  id="confirmNewPassword"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
                  placeholder="Type it again"
                  hasError={Boolean(fieldErrors.confirmPassword)}
                />
                {fieldErrors.confirmPassword && (
                  <p className="flex items-center gap-1.5 text-red-400 light:text-red-600 text-[11px] mt-2 ml-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-400 light:text-red-600 text-xs font-bold py-1 px-1 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/40 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 border-2 border-white/10"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Set password <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 light:text-slate-600">
                <button
                  type="button"
                  onClick={onCancel}
                  className="font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                >
                  Cancel and sign out
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
