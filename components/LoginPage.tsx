import React, { useState } from 'react';
import { User } from '../types';
import { authService, isDemoAuthEnabled } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import type { Provider } from '@supabase/auth-js';
import {
  Lock,
  User as UserIcon,
  ArrowRight,
  Sparkles,
  BookOpen,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

// Injected from package.json by the build (vite.config.ts define); the typeof
// guard keeps environments without the define from throwing a ReferenceError.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

/**
 * InputField defined outside to prevent focus-loss bug during re-renders.
 */
const InputField = ({
  id,
  label,
  value,
  onChange,
  type,
  placeholder,
  icon: Icon,
  hasError,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type: string;
  placeholder: string;
  icon: any;
  hasError: boolean;
}) => (
  <div className="space-y-2.5">
    <label
      htmlFor={id}
      className="block text-[11px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-widest ml-1"
    >
      {label}
    </label>
    <div
      className={`
        relative group/input flex items-center 
        bg-black/50 light:bg-slate-50 
        border-2 rounded-2xl transition-colors duration-300 ease-out
        ${
          hasError
            ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)] bg-red-500/[0.02]'
            : 'border-white/10 light:border-slate-300 hover:border-white/20 light:hover:border-slate-400 focus-within:border-indigo-500 focus-within:bg-black/70 focus-within:shadow-[0_0_30px_rgba(99,102,241,0.25)]'
        }
    `}
    >
      <Icon
        className={`ml-4 h-4 w-4 transition-colors duration-300 ${hasError ? 'text-red-400' : 'text-slate-500 group-focus-within/input:text-indigo-400'}`}
      />
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={
          id === 'username' ? (isSupabaseConfigured ? 'email' : 'username') : 'current-password'
        }
        className="block w-full pl-3 pr-4 py-4 bg-transparent text-white light:text-slate-900 placeholder-slate-600 outline-none focus:outline-none focus:ring-0 border-none font-medium text-sm"
        placeholder={placeholder}
      />
    </div>
  </div>
);

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

const OAUTH_PROVIDERS: { id: Provider; label: string; icon: React.FC }[] = [
  { id: 'google', label: 'Google', icon: GoogleIcon },
  { id: 'azure', label: 'Microsoft', icon: MicrosoftIcon },
  { id: 'github', label: 'GitHub', icon: GitHubIcon },
];

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<Provider | null>(null);

  const [usernameError, setUsernameError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUsernameError(false);
    setPasswordError(false);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    let isValid = true;
    if (!trimmedUsername) {
      setUsernameError(true);
      isValid = false;
    }
    if (!trimmedPassword) {
      setPasswordError(true);
      isValid = false;
    }
    if (!isValid) {
      setError('Required fields missing.');
      return;
    }

    setIsLoading(true);
    try {
      const user = await authService.login(trimmedUsername, trimmedPassword);
      onLogin(user);
    } catch (err) {
      // Configuration problems (e.g. demo auth disabled in production) carry
      // an actionable message — don't flatten those into "bad password".
      const message = err instanceof Error ? err.message : '';
      setError(
        message.includes('not configured') ? message : 'Invalid credentials. Access denied.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    try {
      const user = await authService.loginAsGuest();
      onLogin(user);
    } catch (error) {
      setError('Guest session failed.');
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden px-6 selection:bg-indigo-500/30">
      {/* Aurora Background Effects */}
      <div className="absolute inset-0 bg-[rgb(var(--color-bg-base))]" />
      <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[120px] opacity-10 animate-pulse" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[120px] opacity-10 animate-pulse" />

      {/* Hero Branding Section */}
      <div className="text-center mb-12 relative z-10 animate-fade-in">
        <div className="relative inline-block mb-6 group">
          <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
          <div className="relative w-20 h-20 rounded-[32px] bg-gradient-to-br from-indigo-500 to-sky-500 border border-white/20 shadow-2xl flex items-center justify-center transform group-hover:scale-105 transition-transform duration-700">
            <Sparkles className="w-10 h-10 text-white animate-pulse" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 opacity-80">
            HSC Writing Coach
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-white light:text-slate-900 leading-none">
            Band <span className="text-indigo-500">6</span>
          </h1>
          <p className="text-slate-400 light:text-slate-500 text-sm font-medium mt-4 max-w-xs mx-auto leading-relaxed">
            The AI writing coach and marker for NSW HSC courses.
          </p>
        </div>
      </div>

      {/* Main Login Card */}
      <div
        className="w-full max-w-[420px] relative z-10 animate-fade-in-up"
        style={{ animationDelay: '200ms' }}
      >
        <div className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 border-white/20 light:border-slate-200 rounded-[44px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] light:shadow-2xl overflow-hidden relative">
          <MeshOverlay opacity="opacity-[0.04] light:opacity-[0.06]" />

          <div className="p-10 relative z-10">
            <form onSubmit={handleSubmit} className="space-y-7">
              <InputField
                id="username"
                label={isSupabaseConfigured ? 'Email' : 'Username'}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(false);
                }}
                type={isSupabaseConfigured ? 'email' : 'text'}
                placeholder={isSupabaseConfigured ? 'Enter email address' : 'Enter username'}
                icon={UserIcon}
                hasError={usernameError}
              />

              <InputField
                id="password"
                label="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(false);
                }}
                type="password"
                placeholder="Enter password"
                icon={Lock}
                hasError={passwordError}
              />

              {error && (
                <div className="flex items-center gap-2 text-red-400 light:text-red-600 text-xs font-bold py-1 px-1 animate-fade-in">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-900/40 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group/btn border-2 border-white/10 hover:border-white/20"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Sign In{' '}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" />
                  </>
                )}
              </button>
            </form>

            {isSupabaseConfigured && (
              <div className="mt-7">
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex-1 h-px bg-white/10 light:bg-slate-300" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
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
                      className="flex-1 py-3.5 rounded-2xl font-bold text-xs text-slate-300 light:text-slate-600 bg-white/5 light:bg-slate-50 border-2 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-100 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={`Sign in with ${label}`}
                    >
                      {oauthLoading === id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon />
                      )}
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7">
              <button
                onClick={handleGuestLogin}
                disabled={isLoading || oauthLoading !== null}
                className="w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.1em] text-slate-300 light:text-slate-600 bg-white/5 light:bg-slate-100 border-2 border-white/5 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <BookOpen className="w-4 h-4" /> Continue as Guest
              </button>
            </div>
          </div>

          {/* Footer Info */}
          <div className="bg-black/40 light:bg-slate-100 px-10 py-5 border-t border-white/10 light:border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/50" /> Secure System
            </div>
            <div className="flex gap-4">
              <span>v{APP_VERSION}</span>
            </div>
          </div>
        </div>

        {/* Identity Hint Section — only when the local demo accounts actually
            work (dev builds, or VITE_ENABLE_DEMO_AUTH=true). In Supabase mode
            logins are real email accounts and these hints would mislead. */}
        {!isSupabaseConfigured && isDemoAuthEnabled() && (
          <div className="mt-10 text-center animate-fade-in" style={{ animationDelay: '500ms' }}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
              Demo Accounts
            </p>
            <div className="flex justify-center gap-10">
              <div className="flex flex-col items-center">
                <span className="text-white light:text-slate-800 text-xs font-mono font-bold tracking-tight px-3 py-1 rounded-lg bg-white/5 light:bg-slate-200 border border-white/10 light:border-slate-300 shadow-lg">
                  admin
                </span>
                <span className="text-[10px] text-slate-500 uppercase mt-2 font-bold tracking-wider">
                  Admin
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-white light:text-slate-800 text-xs font-mono font-bold tracking-tight px-3 py-1 rounded-lg bg-white/5 light:bg-slate-200 border border-white/10 light:border-slate-300 shadow-lg">
                  teacher
                </span>
                <span className="text-[10px] text-slate-500 uppercase mt-2 font-bold tracking-wider">
                  Teacher
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-white light:text-slate-800 text-xs font-mono font-bold tracking-tight px-3 py-1 rounded-lg bg-white/5 light:bg-slate-200 border border-white/10 light:border-slate-300 shadow-lg">
                  user
                </span>
                <span className="text-[10px] text-slate-500 uppercase mt-2 font-bold tracking-wider">
                  Student
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
