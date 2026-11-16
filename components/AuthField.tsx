import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, type LucideIcon } from 'lucide-react';

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
  /** Optional. A placeholder that only repeats the label is left out. */
  placeholder?: string;
  icon: LucideIcon;
  /** Focus this field when the screen opens. */
  autoFocus?: boolean;
  /** Paint the field as wrong without a message: the card-level message says
   *  what happened, and this marks which fields it applies to. */
  invalid?: boolean;
  autoComplete: string;
  /** Shown under the field, and what `aria-describedby` points at. */
  error?: string;
  /** A standing note under the field (e.g. which email domains may register).
   *  Hidden while there is an error, which says something more urgent, and
   *  while Caps Lock is on, which is more urgent than the note. */
  hint?: string;
  /** Adds a control that shows or hides the typed password. Only a password
   *  field takes it; on any other type the prop does nothing. */
  revealable?: boolean;
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
  revealable,
  autoFocus,
  invalid,
}) => {
  const errorId = `${id}-error`;
  const flagged = Boolean(error) || Boolean(invalid);
  const hintId = `${id}-hint`;
  const isPassword = type === 'password';
  const canReveal = Boolean(revealable) && isPassword;
  const [revealed, setRevealed] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  // One message in the slot at a time: error, then Caps Lock, then the hint.
  const showCapsLock = isPassword && capsLockOn && !error;
  const describedBy = error ? errorId : showCapsLock || hint ? hintId : undefined;

  // `getModifierState` is read from the key event itself, so the state is the
  // keyboard's real Caps Lock, not a guess from the last key typed.
  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
  };
  return (
    <div>
      <div className="space-y-2.5">
        <label htmlFor={id} className="t-label block text-slate-400 light:text-slate-600 ml-1">
          {label}
        </label>
        <div
          className={`relative group/input flex items-center border-2 rounded-2xl transition-[border-color,background-color,box-shadow] duration-300 ease-out focus-within:ring-4 focus-within:ring-indigo-500/25 ${
            flagged
              ? 'bg-red-500/[0.06] light:bg-red-50 border-red-500/50 light:border-red-600'
              : 'bg-black/50 light:bg-surface-inset border-white/10 light:border-slate-500 hover:border-white/20 light:hover:border-slate-600 focus-within:border-indigo-500 focus-within:bg-black/70 light:focus-within:bg-white'
          }`}
        >
          <Icon
            aria-hidden="true"
            className={`ml-4 h-4 w-4 shrink-0 transition-colors duration-300 ${
              flagged
                ? 'text-red-400 light:text-red-600'
                : 'text-slate-500 group-focus-within/input:text-indigo-400'
            }`}
          />
          <input
            id={id}
            type={canReveal && revealed ? 'text' : type}
            value={value}
            onChange={onChange}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            aria-invalid={flagged ? true : undefined}
            aria-describedby={describedBy}
            // Caps Lock is tracked on the key events; blur clears it, because a
            // key released in another window never reaches this field.
            onKeyDown={isPassword ? trackCapsLock : undefined}
            onKeyUp={isPassword ? trackCapsLock : undefined}
            onBlur={isPassword ? () => setCapsLockOn(false) : undefined}
            className={`block w-full pl-3 ${canReveal ? 'pr-1' : 'pr-4'} py-4 bg-transparent text-white light:text-slate-900 placeholder-slate-500 light:placeholder-slate-600 outline-none focus:outline-none focus:ring-0 border-none font-medium text-base sm:text-sm`}
            placeholder={placeholder}
          />
          {/* A 44px square below `sm` for a thumb, 36px from there up. A toggle
            button keeps ONE name and reports its state through aria-pressed: a
            name that flipped to "Hide password" as well would be read out as
            "Hide password, pressed", which says the opposite of what is on. */}
          {canReveal && (
            <button
              type="button"
              onClick={() => setRevealed((shown) => !shown)}
              aria-label="Show password"
              aria-pressed={revealed}
              aria-controls={id}
              className="mr-1.5 min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 rounded-xl flex items-center justify-center text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 light:focus-visible:ring-indigo-600"
            >
              {revealed ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}
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
      ) : showCapsLock || hint ? (
        <p
          id={hintId}
          className="text-xs text-slate-400 light:text-slate-600 leading-relaxed mt-2 ml-1"
        >
          {showCapsLock ? 'Caps Lock is on.' : hint}
        </p>
      ) : null}
    </div>
  );
};

export default AuthField;
