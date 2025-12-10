
import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { Lock, User as UserIcon, ArrowRight, Sparkles, BookOpen, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

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
        setError('Please fill in all required fields.');
        return;
    }

    setIsLoading(true);
    try {
      const user = await authService.login(trimmedUsername, trimmedPassword);
      onLogin(user);
    } catch (err) {
      setError('Invalid credentials. Please check your username and password.');
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
      setError('Failed to initialize guest session.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center relative">
      <div className="relative w-full max-w-md px-6 z-10">
        
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] shadow-lg shadow-[rgb(var(--color-primary))/0.3] mb-4">
             <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2">HSC AI Evaluator</h1>
          <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 text-sm">Master your syllabus with AI-powered feedback.</p>
        </div>

        {/* Login Card */}
        <div className="bg-[rgb(var(--color-bg-surface))]/60 light:bg-white/80 backdrop-blur-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-8 transition-all">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-2 ml-1">Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserIcon className={`h-5 w-5 transition-colors ${usernameError ? 'text-red-400' : 'text-[rgb(var(--color-text-dim))] light:text-slate-400 group-focus-within:text-[rgb(var(--color-accent))]'}`} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                      setUsername(e.target.value);
                      if (usernameError) setUsernameError(false);
                      if (error) setError(null);
                  }}
                  className={`block w-full pl-11 pr-4 py-3.5 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border rounded-xl text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-[rgb(var(--color-text-dim))] light:placeholder-slate-400 focus:outline-none focus:ring-2 transition-all
                  ${usernameError 
                      ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500' 
                      : 'border-[rgb(var(--color-border-secondary))] light:border-slate-200 focus:ring-[rgb(var(--color-accent))] focus:border-transparent'
                  }`}
                  placeholder="e.g. admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-2 ml-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors ${passwordError ? 'text-red-400' : 'text-[rgb(var(--color-text-dim))] light:text-slate-400 group-focus-within:text-[rgb(var(--color-accent))]'}`} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(false);
                      if (error) setError(null);
                  }}
                  className={`block w-full pl-11 pr-4 py-3.5 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border rounded-xl text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-[rgb(var(--color-text-dim))] light:placeholder-slate-400 focus:outline-none focus:ring-2 transition-all
                  ${passwordError 
                      ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500' 
                      : 'border-[rgb(var(--color-border-secondary))] light:border-slate-200 focus:ring-[rgb(var(--color-accent))] focus:border-transparent'
                  }`}
                  placeholder="Enter password"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 light:bg-red-50 border border-red-500/20 light:border-red-200 text-red-400 light:text-red-600 text-sm flex items-center justify-center gap-2 font-medium animate-fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] hover:shadow-lg hover:shadow-[rgb(var(--color-primary))/0.3] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing In...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-grow border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-[rgb(var(--color-text-dim))] light:text-slate-400 text-xs">or</span>
            <div className="flex-grow border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200"></div>
          </div>

          <button
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4" /> Continue as Guest
          </button>

          {/* Demo Credentials Note */}
          <div className="mt-6 p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 text-center">
            <p className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-500 mb-2 font-semibold uppercase tracking-wider">Demo Credentials</p>
            <div className="flex justify-center gap-4 text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-mono">
                <div>
                    <span className="text-[rgb(var(--color-accent))] font-bold">admin</span> / <span className="text-[rgb(var(--color-accent))] font-bold">admin</span>
                </div>
                <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                <div>
                    <span className="text-[rgb(var(--color-accent))] font-bold">user</span> / <span className="text-[rgb(var(--color-accent))] font-bold">user</span>
                </div>
            </div>
          </div>
        </div>
        
        <p className="text-center text-[rgb(var(--color-text-dim))] light:text-slate-500 text-xs mt-6">
            &copy; {new Date().getFullYear()} HSC AI Evaluator. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
