import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
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
        autoComplete={id === 'username' ? 'username' : 'current-password'}
        className="block w-full pl-3 pr-4 py-4 bg-transparent text-white light:text-slate-900 placeholder-slate-600 outline-none focus:outline-none focus:ring-0 border-none font-medium text-sm"
        placeholder={placeholder}
      />
    </div>
  </div>
);

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('Invalid credentials. Access denied.');
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
            AI Marking Assistant
          </span>
          <h1 className="text-4xl font-bold tracking-tight text-white light:text-slate-900 leading-none">
            Evaluator<span className="text-indigo-500">.</span>Studio
          </h1>
          <p className="text-slate-400 light:text-slate-500 text-sm font-medium mt-4 max-w-xs mx-auto leading-relaxed">
            HSC Software Engineering & Science Evaluation Tool.
          </p>
        </div>
      </div>

      {/* Main Login Card */}
      <div
        className="w-full max-w-[420px] relative z-10 animate-fade-in-up"
        style={{ animationDelay: '200ms' }}
      >
        <div className="bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 border-white/20 light:border-slate-200 rounded-[44px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] light:shadow-2xl overflow-hidden relative">
          <MeshOverlay opacity="opacity-[0.04] light:opacity-[0.06]" />

          <div className="p-10 relative z-10">
            <form onSubmit={handleSubmit} className="space-y-7">
              <InputField
                id="username"
                label="Username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(false);
                }}
                type="text"
                placeholder="Enter username"
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

            <div className="mt-8">
              <button
                onClick={handleGuestLogin}
                className="w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.1em] text-slate-300 light:text-slate-600 bg-white/5 light:bg-slate-100 border-2 border-white/5 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 transition-all flex items-center justify-center gap-3 shadow-inner"
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
              <span>v2.2.1</span>
            </div>
          </div>
        </div>

        {/* Identity Hint Section */}
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
                user
              </span>
              <span className="text-[10px] text-slate-500 uppercase mt-2 font-bold tracking-wider">
                Student
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
