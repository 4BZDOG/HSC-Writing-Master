import React, { useEffect, useRef, useState } from 'react';
import { User } from '../types';
import { authService, isDemoAuthEnabled } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import {
  isSignupEnabled,
  resolveAllowedDomains,
  validateSignup,
  hasSignupErrors,
  allowedDomainMessage,
  MIN_PASSWORD_LENGTH,
  type SignupFieldErrors,
} from '../services/signupPolicy';
import type { Provider } from '@supabase/auth-js';
import AuthBackdrop from './AuthBackdrop';
import AuthBrand from './AuthBrand';
import MeshOverlay from './MeshOverlay';
import { Lock, User as UserIcon, BookOpen, AlertCircle, Loader2, MailCheck } from 'lucide-react';
import LegalDocumentModal from './LegalDocumentModal';
import AuthField from './AuthField';
import {
  AUTH_CARD,
  AUTH_COLUMN,
  AUTH_PAGE,
  AUTH_PRIMARY_BUTTON,
  AUTH_TEXT_LINK,
} from '../utils/authChrome';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

// Injected from package.json by the build (vite.config.ts define); the typeof
// guard keeps environments without the define from throwing a ReferenceError.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** The mock accounts, whose passwords are their usernames (services/authService). */
const DEMO_ACCOUNTS = [
  { username: 'admin', role: 'Admin' },
  { username: 'teacher', role: 'Teacher' },
  { username: 'user', role: 'Student' },
] as const;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const ALL_OAUTH_PROVIDERS: { id: Provider; label: string; icon: React.FC }[] = [
  { id: 'google', label: 'Google', icon: GoogleIcon },
  { id: 'azure', label: 'Microsoft', icon: MicrosoftIcon },
  { id: 'github', label: 'GitHub', icon: GitHubIcon },
];

/**
 * Which SSO buttons this deployment shows, from `VITE_OAUTH_PROVIDERS`.
 *
 * A provider button is only useful if the provider is ENABLED in the Supabase
 * dashboard — and none of them is, on a new project. Rendering all three
 * unconditionally meant a fresh deployment showed three buttons that each
 * failed with Supabase's raw "Unsupported provider" once the user had already
 * been redirected. A NSW DoE school in particular wants Microsoft alone: Google
 * and GitHub are not just unused there, they are a support ticket each.
 *
 * Unset keeps the previous behaviour (all three) so no working deployment
 * loses a login method on upgrade. Set it to the providers actually enabled —
 * `VITE_OAUTH_PROVIDERS=azure` — or to `none` to hide the section entirely and
 * run on email/password alone. Unknown names are ignored rather than rendered
 * as a button that cannot work.
 */
export const resolveOAuthProviders = (
  raw: string | undefined
): { id: Provider; label: string; icon: React.FC }[] => {
  const configured = raw?.trim();
  if (configured === undefined || configured === '') return ALL_OAUTH_PROVIDERS;
  if (configured.toLowerCase() === 'none') return [];
  const wanted = configured
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  // Ordered by the wanted list, not the catalogue, so a deployment controls
  // which provider reads as the primary one.
  return wanted
    .map((name) => ALL_OAUTH_PROVIDERS.find((p) => p.id === name))
    .filter((p): p is (typeof ALL_OAUTH_PROVIDERS)[number] => p !== undefined);
};

const OAUTH_PROVIDERS = resolveOAuthProviders(import.meta.env.VITE_OAUTH_PROVIDERS);

/**
 * Self-registration is offered only when there is somewhere to register: mock
 * mode has a fixed set of demo logins and no account store, so the link would
 * lead to a form that cannot succeed.
 *
 * FUNCTIONS, not module-level constants. Both read a binding imported from
 * `services/`, and doing that at module scope is the pattern behind "Cannot
 * access 'X' before initialization": if the bundler ever puts this file and
 * that service in chunks that import each other, this body runs before the
 * other chunk has initialised and the page renders blank. Deferring the read
 * to call time makes chunk placement irrelevant — the same reasoning, and the
 * same fix, as `freeTierLimits()` in services/planPolicy.ts. `npm run
 * check:eager-reads` fails the build on the module-scope form.
 */
const signupAvailable = (): boolean =>
  isSupabaseConfigured && isSignupEnabled(import.meta.env.VITE_ENABLE_SIGNUP);

/**
 * The SAME list the SSO callback enforces (services/authService.ts) — one rule
 * for every way an account can appear, since restricting one route and not the
 * other restricts nothing.
 */
const signupAllowedDomains = (): string[] => resolveAllowedDomains(import.meta.env);

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<Provider | null>(null);

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  // Set once the account exists but needs its emailed link followed. The form
  // is replaced rather than kept alongside a success banner — leaving it there
  // invites a second submit, which just fails as "already registered".
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  // Readable BEFORE signing in — being asked to accept an agreement you had no
  // way of reading first is the thing everyone hates about consent dialogs.
  const [isLegalOpen, setIsLegalOpen] = useState(false);

  // When the card's contents are swapped — a mode switch, or a form replaced by
  // its "check your email" panel — focus moves to the new heading, so a screen
  // reader hears what is now there instead of silence on a vanished button.
  // Not on first render: arriving on the page leaves focus where it lands.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formChanged = useRef(false);
  useEffect(() => {
    if (!formChanged.current) return;
    headingRef.current?.focus();
  }, [mode, resetSentTo, confirmationSentTo]);

  /** Clear everything transient when moving between modes. */
  const switchMode = (next: 'signin' | 'signup' | 'reset') => {
    formChanged.current = true;
    setMode(next);
    setError(null);
    // Both success panels replace the form, so today their own buttons are the
    // only way out and they clear these first. Clearing here as well means a
    // future entry point cannot land someone on a stale "check your email"
    // panel for a mode they have since left.
    setResetSentTo(null);
    setConfirmationSentTo(null);
    setFieldErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  const handleResetRequest = async () => {
    setError(null);
    const email = username.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldErrors({ email: 'Enter the email address on the account.' });
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      await authService.requestPasswordReset(email);
      // Shown whether or not an account exists — see requestPasswordReset. The
      // wording is careful for that reason: it must not become a way to find
      // out who has an account here.
      formChanged.current = true;
      setResetSentTo(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    setError(null);
    const errors = validateSignup({
      email: username,
      password,
      confirmPassword,
      allowedDomains: signupAllowedDomains(),
    });
    setFieldErrors(errors);
    if (hasSignupErrors(errors)) return;

    setIsLoading(true);
    try {
      const result = await authService.signUp(username.trim(), password, displayName);
      if (result.status === 'confirmation-required') {
        formChanged.current = true;
        setConfirmationSentTo(result.email);
        return;
      }
      onLogin(result.user);
    } catch (err) {
      // authService.signUp already restates Supabase's wording for a school
      // audience, so show it rather than flattening it to something generic.
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') {
      await handleSignup();
      return;
    }
    if (mode === 'reset') {
      await handleResetRequest();
      return;
    }
    setError(null);

    const trimmedUsername = username.trim();

    // Said under the field that is empty, the same way sign-up does it, rather
    // than as one "required fields missing" banner that leaves the reader to
    // work out which.
    const errors: SignupFieldErrors = {};
    if (!trimmedUsername) {
      errors.email = isSupabaseConfigured ? 'Enter your email address.' : 'Enter your username.';
    }
    // Emptiness is judged on the trimmed value, but the password itself is
    // sent exactly as typed. Sign-up stores it untrimmed, so trimming here
    // locked out anyone whose password began or ended with a space.
    if (!password.trim()) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (hasSignupErrors(errors)) return;

    setIsLoading(true);
    try {
      const user = await authService.login(trimmedUsername, password);
      onLogin(user);
    } catch (err) {
      // Only a genuine credential rejection is restated here. Everything else
      // — demo auth switched off, offline, rate-limited, an unconfirmed
      // account — arrives already worded by authService with its own remedy,
      // and flattening it into "bad password" sends the reader the wrong way.
      const message = err instanceof Error ? err.message : '';
      setError(
        message && !/invalid username or password/i.test(message)
          ? message
          : isSupabaseConfigured
            ? 'That email and password do not match an account. Check both and try again.'
            : 'That username and password do not match an account. Check both and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const user = await authService.loginAsGuest();
      onLogin(user);
    } catch {
      setError('Could not start a guest session. Try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: Provider) => {
    setError(null);
    setOauthLoading(provider);
    try {
      await authService.loginWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth login failed.');
      setOauthLoading(null);
    }
  };

  return (
    <div className={AUTH_PAGE}>
      <AuthBackdrop />

      <div className={AUTH_COLUMN}>
        <AuthBrand tagline="Write a response to an HSC question, and see it marked against the NESA band descriptors." />

        {/* Main Login Card */}
        <div
          className="w-full max-w-[420px] relative z-10 animate-fade-in-up"
          style={{ animationDelay: '200ms' }}
        >
          <div className={AUTH_CARD}>
            <MeshOverlay opacity="opacity-[0.04] light:opacity-[0.06]" />

            <div className="p-10 relative z-10">
              {resetSentTo ? (
                /* Deliberately does NOT say whether an account exists — see
                 authService.requestPasswordReset. "No account with that email"
                 turns this form into a way to discover who has one, and here
                 that is a roster of students. */
                <div className="space-y-5 animate-fade-in" data-testid="reset-sent">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-emerald-400 light:text-emerald-600" />
                  </div>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-xl font-bold text-white light:text-slate-900 outline-none"
                  >
                    Check your email
                  </h2>
                  <p className="text-sm text-slate-400 light:text-slate-600 leading-relaxed">
                    If an account exists for{' '}
                    <span className="font-bold text-slate-200 light:text-slate-800">
                      {resetSentTo}
                    </span>
                    , a link to set a new password is on its way. It expires shortly and can only be
                    used once.
                  </p>
                  <p className="text-xs text-slate-500 light:text-slate-600 leading-relaxed">
                    Nothing arrived? Check the junk folder, and confirm you typed the address you
                    signed up with. School mail filters are often the culprit — an administrator can
                    reset the password directly if the link never lands.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetSentTo(null);
                      switchMode('signin');
                    }}
                    className={AUTH_PRIMARY_BUTTON}
                  >
                    Back to sign in
                  </button>
                </div>
              ) : confirmationSentTo ? (
                /* The account exists but is inert until the emailed link is
                 followed. Say exactly that — "check your email" without
                 saying why leaves people retrying the form. */
                <div className="space-y-5 animate-fade-in" data-testid="signup-confirmation">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-emerald-400 light:text-emerald-600" />
                  </div>
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-xl font-bold text-white light:text-slate-900 outline-none"
                  >
                    Confirm your email
                  </h2>
                  <p className="text-sm text-slate-400 light:text-slate-600 leading-relaxed">
                    We sent a confirmation link to{' '}
                    <span className="font-bold text-slate-200 light:text-slate-800">
                      {confirmationSentTo}
                    </span>
                    . Click it to activate the account, then come back and sign in. The account will
                    not work until you do.
                  </p>
                  <p className="text-xs text-slate-500 light:text-slate-600 leading-relaxed">
                    Nothing arrived? Check the junk folder. School mail filters are often the
                    culprit — an administrator can confirm the account manually in Supabase if it
                    never lands.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationSentTo(null);
                      switchMode('signin');
                    }}
                    className={AUTH_PRIMARY_BUTTON}
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  {/* Every mode has a heading, and switching modes moves focus
                    to it. Swapping the form's fields under someone's cursor
                    used to be silent to a screen reader: "Create one" was
                    pressed and nothing said a different form was now there.
                    Sign-in's heading is visually hidden — the card is plainly
                    a sign-in card and a title would only repeat the button. */}
                  <div className={mode === 'signin' ? 'sr-only' : 'space-y-2 mb-7'}>
                    <h2
                      ref={headingRef}
                      tabIndex={-1}
                      className="text-lg font-bold text-white light:text-slate-900 outline-none"
                    >
                      {mode === 'signup'
                        ? 'Create your account'
                        : mode === 'reset'
                          ? 'Reset your password'
                          : 'Sign in'}
                    </h2>
                    {mode === 'reset' && (
                      <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">
                        Enter the email address on your account and we will send you a link to set a
                        new password.
                      </p>
                    )}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-7">
                    {mode === 'signup' && (
                      <AuthField
                        id="displayName"
                        label="Full name (optional)"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        type="text"
                        placeholder="How your name appears in the app"
                        icon={UserIcon}
                        autoComplete="name"
                      />
                    )}

                    <AuthField
                      id="username"
                      label={isSupabaseConfigured ? 'Email' : 'Username'}
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }}
                      type={isSupabaseConfigured ? 'email' : 'text'}
                      placeholder={isSupabaseConfigured ? 'Enter email address' : 'Enter username'}
                      icon={UserIcon}
                      autoComplete={isSupabaseConfigured ? 'email' : 'username'}
                      error={fieldErrors.email}
                      hint={
                        mode === 'signup' && signupAllowedDomains().length > 0
                          ? allowedDomainMessage(signupAllowedDomains())
                          : undefined
                      }
                    />

                    {/* Kept mounted in reset mode, only hidden, so a password
                      manager's association with the form survives the switch. */}
                    <div className={mode === 'reset' ? 'hidden' : undefined}>
                      <AuthField
                        id="password"
                        label="Password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }}
                        type="password"
                        placeholder={
                          mode === 'signup'
                            ? `At least ${MIN_PASSWORD_LENGTH} characters`
                            : 'Enter password'
                        }
                        icon={Lock}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        error={fieldErrors.password}
                      />
                    </div>

                    {mode === 'signup' && (
                      <AuthField
                        id="confirmPassword"
                        label="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                        }}
                        type="password"
                        placeholder="Type the password again"
                        icon={Lock}
                        autoComplete="new-password"
                        error={fieldErrors.confirmPassword}
                      />
                    )}

                    {error && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 text-red-400 light:text-red-600 text-xs font-bold py-1 px-1 animate-fade-in"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />{' '}
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || oauthLoading !== null}
                      aria-busy={isLoading || undefined}
                      className={AUTH_PRIMARY_BUTTON}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                          {/* The spinner alone left the button with no name at all
                          while it worked. */}
                          <span className="sr-only">
                            {mode === 'signup'
                              ? 'Creating account…'
                              : mode === 'reset'
                                ? 'Sending reset link…'
                                : 'Signing in…'}
                          </span>
                        </>
                      ) : (
                        <>
                          {mode === 'signup'
                            ? 'Create account'
                            : mode === 'reset'
                              ? 'Send reset link'
                              : 'Sign in'}
                        </>
                      )}
                    </button>

                    {mode === 'reset' ? (
                      <p className="text-center text-xs text-slate-400 light:text-slate-600">
                        Remembered it?{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('signin')}
                          className={AUTH_TEXT_LINK}
                        >
                          Back to sign in
                        </button>
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {/* Password sign-in only. There is nothing to reset on a mock
                        deployment, and an SSO account's password lives with the
                        identity provider, not here. */}
                        {mode === 'signin' && isSupabaseConfigured && (
                          <p className="text-center text-xs text-slate-400 light:text-slate-600">
                            <button
                              type="button"
                              onClick={() => switchMode('reset')}
                              className={AUTH_TEXT_LINK}
                            >
                              Forgot your password?
                            </button>
                          </p>
                        )}
                        {signupAvailable() && (
                          <p className="text-center text-xs text-slate-400 light:text-slate-600">
                            {mode === 'signin'
                              ? "Don't have an account? "
                              : 'Already have an account? '}
                            <button
                              type="button"
                              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                              className={AUTH_TEXT_LINK}
                            >
                              {mode === 'signin' ? 'Create one' : 'Sign in'}
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                  </form>
                </>
              )}

              {isSupabaseConfigured && OAUTH_PROVIDERS.length > 0 && (
                <div className="mt-7">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="flex-1 h-px bg-white/10 light:bg-slate-300" />
                    <span className="t-label text-slate-500 light:text-slate-600">
                      or continue with
                    </span>
                    <div className="flex-1 h-px bg-white/10 light:bg-slate-300" />
                  </div>
                  <div className="flex gap-3">
                    {OAUTH_PROVIDERS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleOAuthLogin(id)}
                        disabled={isLoading || oauthLoading !== null}
                        className="flex-1 py-3.5 rounded-2xl font-bold text-xs text-slate-300 light:text-slate-600 bg-white/5 light:bg-slate-50 border-2 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`Sign in with ${label}`}
                      >
                        {oauthLoading === id ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Icon />
                        )}
                        {/* `sr-only`, not `hidden`, below `sm`: a phone has room
                          for the logo only, but the button still needs a name. */}
                        <span className="sr-only sm:not-sr-only">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-7">
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={isLoading || oauthLoading !== null}
                  className="t-label w-full py-4 rounded-2xl text-slate-300 light:text-slate-600 bg-white/5 light:bg-slate-100 border-2 border-white/5 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <BookOpen className="w-4 h-4" aria-hidden="true" /> Continue as guest
                </button>
              </div>
            </div>

            {/* Footer Info */}
            <div className="t-label bg-black/40 light:bg-slate-100 px-10 py-5 border-t border-white/10 light:border-slate-200 flex justify-between items-center text-slate-500 light:text-slate-600">
              <button
                type="button"
                onClick={() => setIsLegalOpen(true)}
                className="hover:text-indigo-400 light:hover:text-indigo-700 underline-offset-2 hover:underline transition-colors"
              >
                Terms &amp; Privacy
              </button>
              <span className="font-mono">v{APP_VERSION}</span>
            </div>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-slate-400 light:text-slate-600 px-4">
            Signing in means agreeing to the Terms of Use and Privacy Notice. Marks given here are
            practice feedback from an AI — never an official HSC result.
          </p>

          <LegalDocumentModal isOpen={isLegalOpen} onClose={() => setIsLegalOpen(false)} />

          {/* Identity Hint Section — only when the local demo accounts actually
            work (dev builds, or VITE_ENABLE_DEMO_AUTH=true). In Supabase mode
            logins are real email accounts and these hints would mislead.
            Each chip fills the form rather than only naming an account: the
            password was never shown anywhere, so the hint used to be half of
            what someone needed to get in. */}
          {!isSupabaseConfigured && isDemoAuthEnabled() && mode === 'signin' && (
            <div className="mt-10 text-center animate-fade-in" style={{ animationDelay: '500ms' }}>
              <p className="t-label text-slate-400 light:text-slate-600 mb-1">Demo accounts</p>
              <p className="text-xs text-slate-400 light:text-slate-600 mb-4">
                The password is the same as the username. Choose one to fill the form.
              </p>
              <div className="flex justify-center gap-3 sm:gap-6">
                {DEMO_ACCOUNTS.map(({ username: demo, role }) => (
                  <button
                    key={demo}
                    type="button"
                    onClick={() => {
                      setUsername(demo);
                      setPassword(demo);
                      setFieldErrors({});
                      setError(null);
                    }}
                    aria-label={`Fill in the ${role.toLowerCase()} demo account`}
                    className="group flex flex-col items-center rounded-xl px-2 py-1.5 hover:bg-white/5 light:hover:bg-slate-900/5 transition-colors"
                  >
                    <span className="text-white light:text-slate-800 text-xs font-mono font-bold tracking-tight px-3 py-1 rounded-lg bg-white/5 light:bg-slate-200 border border-white/10 light:border-slate-300 group-hover:border-indigo-400/60 transition-colors">
                      {demo}
                    </span>
                    <span className="t-label text-slate-400 light:text-slate-600 mt-2">{role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
