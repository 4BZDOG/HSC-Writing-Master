import React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Scale } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import LegalDocumentReader from './LegalDocumentReader';
import type { LegalDocumentId } from '../data/legalContent';

interface LegalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which document to open on — "Privacy Notice" links open straight there. */
  initialDocument?: LegalDocumentId;
}

/**
 * Standalone reader for the Terms of Use and Privacy Notice. Reachable from
 * the profile, the quick-start guide and the sign-in page, so the agreements
 * are readable BEFORE anyone is asked to accept them — and re-readable at any
 * time afterwards, which is the part most apps forget.
 *
 * The head sits on the desk tone with a rule under it, and the reading column
 * is the paper below. A reader's head is furniture, not an advertisement; the
 * document is the thing that should be bright.
 */
const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({
  isOpen,
  onClose,
  initialDocument = 'terms',
}) => {
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-legal bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="clip-stable w-full max-w-4xl rounded-surface bg-[rgb(var(--color-bg-surface))] border border-white/10 light:border-slate-300 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-base))] border-b border-white/10 light:border-slate-300 shrink-0 flex items-center gap-4">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-[rgb(var(--color-bg-surface))] border border-white/10 light:border-slate-300 flex items-center justify-center text-indigo-400 light:text-indigo-600">
            <Scale className="w-5 h-5" />
          </div>
          <h2
            id="legal-modal-title"
            className="min-w-0 text-xl font-bold tracking-tight leading-tight text-[rgb(var(--color-text-primary))]"
          >
            Terms &amp; Privacy
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-2 rounded-xl text-[rgb(var(--color-text-muted))] hover:bg-white/10 light:hover:bg-surface-inset hover:text-[rgb(var(--color-text-primary))] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar">
          <LegalDocumentReader
            initialDocument={initialDocument}
            scrollAreaClassName="max-h-[60vh]"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LegalDocumentModal;
