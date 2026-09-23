import React from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';

/**
 * One labelled input on a signed-out screen, with its error and hint.
 *
 * Sign-in had one of these and password reset had its own, and they had
 * drifted: reset's lacked the focus ring, `aria-invalid`, and the link from
 * the field to its error message, so a screen reader landing on a rejected
 * password heard nothing about why. One component keeps the two screens the
 * same screen.
 *
 * Defined at module scope, never inside a render, so React keeps the same
 * input element between keystrokes and focus is not lost.
 */
interface AuthFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type: string;
  placeholder: string;
  icon: LucideIcon;
  autoComplete: string;
  /** Shown under the field, and what `aria-describedby` points at. */
  error?: string;
  /** A standing note under the field (e.g. which email domains may register).
   *  Hidden while there is an error, which says something more urgent. */
  hint?: string;
}

const AuthField: React.FC<AuthFieldProps> = ({
  id,
  label,
  value,
  onChange,
  type,
  placeholder,
  icon: Icon,
  autoComplete,
  error,
  hint,
}) => {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div>
      <div className="space-y-2.5">
        <label htmlFor={id} className="t-label block text-slate-400 light:text-slate-600 ml-1">
          {label}
        </label>
        <div
          className={`relative group/input flex items-center border-2 rounded-2xl transition-[border-color,background-color,box-shadow] duration-300 ease-out ${
            error
              ? 'bg-red-500/[0.06] light:bg-red-50 border-red-500/50 light:border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
              : 'bg-black/50 light:bg-slate-50 border-white/10 light:border-slate-300 hover:border-white/20 light:hover:border-slate-400 focus-within:border-indigo-500 focus-within:bg-black/70 light:focus-within:bg-white focus-within:shadow-[0_0_30px_rgba(99,102,241,0.25)]'
          }`}
        >
          <Icon
            aria-hidden="true"
            className={`ml-4 h-4 w-4 shrink-0 transition-colors duration-300 ${
              error
                ? 'text-red-400 light:text-red-600'
                : 'text-slate-500 group-focus-within/input:text-indigo-400'
            }`}
          />
          <input
            id={id}
            type={type}
            value={value}
            onChange={onChange}
            autoComplete={autoComplete}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="block w-full pl-3 pr-4 py-4 bg-transparent text-white light:text-slate-900 placeholder-slate-500 outline-none focus:outline-none focus:ring-0 border-none font-medium text-sm"
            placeholder={placeholder}
          />
        </div>
      </div>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-red-400 light:text-red-600 text-xs mt-2 ml-1 animate-fade-in"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          className="text-xs text-slate-500 light:text-slate-600 leading-relaxed mt-2 ml-1"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default AuthField;
