import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, History, LogOut, ArrowRight, ScrollText } from 'lucide-react';
import type { User } from '../types';
import { CHARTER_ICONS } from './agreementIcons';
import LegalDocumentReader from './LegalDocumentReader';
import {
  charterForRole,
  changesSince,
  isAgreementBlocking,
  agreementPromptReason,
} from '../services/agreementService';
import { AGREEMENT_VERSION, LEGAL_CONFIG } from '../data/legalContent';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

/**
 * The user agreement gate.
 *
 * Signed-in users must accept before they reach the workspace; guests get the
 * same charter as a dismissible notice. Acceptance is versioned, so bumping
 * `AGREEMENT_VERSION` re-prompts everyone — and anyone who accepted an earlier
 * version is shown exactly what changed, because being re-asked with no
 * explanation reads as a bug rather than an update.
 *
 * Design intent: the charter is the agreement people actually read, so it gets
 * the space and the plain language. The binding documents sit one click away
 * in the same dialog rather than behind a link that loses your place.
 *
 * A blocking gate always keeps an exit — "Sign out" — because a dialog with no
 * way past it and no way back is a trap, not a consent flow.
 */

interface UserAgreementModalProps {
  user: User;
  /** Record acceptance and let the user through. */
  onAccept: () => void;
  /** Guests only — close without recording anything. */
  onDismiss: () => void;
  onLogout: () => void;
  /** Disables the button while the acceptance is being written. */
  isSaving?: boolean;
}

const UserAgreementModal: React.FC<UserAgreementModalProps> = ({
  user,
  onAccept,
  onDismiss,
  onLogout,
  isSaving = false,
}) => {
  const charter = charterForRole(user.role);
  const blocking = isAgreementBlocking(user);
  const reason = agreementPromptReason(user);
  const returning = reason === 'updated';
  const changes = changesSince(user.agreement?.version);

  const [agreed, setAgreed] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open. Without this, a keyboard or screen
  // reader user lands at the top of the document and has to tab through
  // whatever the browser considers first — on a gate that is the whole point
  // of the screen, that is the difference between usable and not.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Keep Tab inside the dialog. The workspace is not rendered while blocking,
  // but the guest notice sits over a live app, and tabbing behind a modal into
  // controls you cannot see is disorienting either way.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const heading =
    reason === 'updated'
      ? 'We have updated this'
      : reason === 'roleChanged'
        ? 'Your account has changed'
        : charter.title;

  const lede =
    reason === 'updated'
      ? 'The agreement has changed since you last accepted it. Here it is again — the changes are listed below.'
      : reason === 'roleChanged'
        ? 'You now have staff access, which comes with responsibilities the student agreement does not cover — student visibility and moderation. Please read this version.'
        : charter.intro;

  // Guests can dismiss with Esc; a blocking gate deliberately cannot be
  // escaped by keyboard, or the acceptance record would mean nothing.
  useEscapeKey(!blocking, onDismiss);
  // The page stays frozen either way — this dialog is only ever mounted while
  // it is on screen, and a blocking gate least of all wants a live page behind
  // it.
  useScrollLock(true);

  const canContinue = blocking ? agreed && !isSaving : true;

  return createPortal(
    <div
      className="fixed inset-0 z-[980] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (!blocking && e.target === e.currentTarget) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="clip-stable w-full max-w-2xl rounded-[32px] bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-200 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.75)] overflow-hidden animate-fade-in-up flex flex-col max-h-[92vh] outline-none"
      >
        {/* Header */}
        <div className="relative px-6 sm:px-8 py-6 bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 text-white overflow-hidden shrink-0">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <div className="relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/75 block">
              {charter.eyebrow} · v{AGREEMENT_VERSION}
            </span>
            <h2
              id="agreement-title"
              className="text-2xl sm:text-3xl font-black tracking-tighter leading-tight mt-1"
            >
              {heading}
            </h2>
            <p className="text-sm text-white/85 leading-relaxed mt-2 max-w-lg font-medium">
              {lede}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
          {/* What changed — only ever shown to someone who accepted an
              earlier version, and only when we can actually say what moved. */}
          {returning && changes.length > 0 && (
            <div className="mb-6 rounded-2xl bg-amber-400/5 light:bg-amber-50 border border-amber-400/20 light:border-amber-200 p-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 light:text-amber-700 flex items-center gap-2 mb-3">
                <History className="w-3.5 h-3.5" /> What changed
              </span>
              <ul className="space-y-2">
                {changes.flatMap((change) =>
                  change.summary.map((line, i) => (
                    <li
                      key={`${change.version}-${i}`}
                      className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 flex gap-2.5"
                    >
                      <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-amber-500" />
                      <span>{line}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* The charter itself */}
          <ul className="space-y-3">
            {charter.promises.map((promise) => {
              const Icon = CHARTER_ICONS[promise.icon];
              return (
                <li
                  key={promise.title}
                  className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${
                    promise.emphasis
                      ? 'bg-amber-400/[0.06] light:bg-amber-50 border-amber-400/25 light:border-amber-200'
                      : 'bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200'
                  }`}
                >
                  <div
                    className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                      promise.emphasis
                        ? 'bg-amber-400/15 text-amber-500'
                        : 'bg-indigo-500/10 text-indigo-400 light:text-indigo-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-snug">
                      {promise.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 mt-1">
                      {promise.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* The binding documents, in the same dialog so reading them never
              costs you your place in the flow. */}
          <div className="mt-5 rounded-2xl border border-white/5 light:border-slate-200 overflow-hidden">
            <button
              onClick={() => setShowDocuments((open) => !open)}
              aria-expanded={showDocuments}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-white/[0.03] light:bg-slate-50 hover:bg-white/[0.06] light:hover:bg-slate-100 transition-colors text-left"
            >
              <ScrollText className="w-4 h-4 text-indigo-400 light:text-indigo-600 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 uppercase tracking-wide">
                  Read the full Terms of Use and Privacy Notice
                </span>
                <span className="block text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-0.5 font-medium">
                  The charter above is a summary. These are the documents you are agreeing to.
                </span>
              </span>
              {showDocuments ? (
                <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>
            {showDocuments && (
              <div className="p-4 border-t border-white/5 light:border-slate-200 animate-fade-in">
                <LegalDocumentReader scrollAreaClassName="max-h-[40vh]" />
              </div>
            )}
          </div>

          {/* Consent */}
          {blocking ? (
            <label className="mt-6 flex items-start gap-3 p-4 rounded-2xl bg-indigo-500/[0.07] light:bg-indigo-50 border border-indigo-500/25 light:border-indigo-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 rounded accent-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-relaxed">
                {charter.acceptLabel}, including the Terms of Use and Privacy Notice.
                {user.role === 'user' && (
                  <span className="block font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-600 mt-1">
                    If you are under 18, read this with a parent, carer or teacher first.
                  </span>
                )}
              </span>
            </label>
          ) : (
            <p className="mt-6 text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed p-4 rounded-2xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200">
              You are browsing as a guest, so there is nothing to sign — nothing you do is saved to
              our servers. Make an account when you want your work and progress kept.
            </p>
          )}

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              onClick={blocking ? onAccept : onDismiss}
              disabled={!canContinue}
              className="flex-1 px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-900/30 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                'Saving…'
              ) : blocking ? (
                <>
                  Agree and continue <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Got it — let me look around <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            {blocking && (
              <button
                onClick={onLogout}
                className="px-5 py-3.5 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-bold text-xs uppercase tracking-widest border border-white/5 light:border-slate-200 hover:bg-white/10 light:hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-400">
            {LEGAL_CONFIG.productName} · You can re-read this any time from your profile.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UserAgreementModal;
