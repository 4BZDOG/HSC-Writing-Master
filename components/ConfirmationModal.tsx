import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = 'Confirm',
  isDestructive = false,
}) => {
  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const iconColor = isDestructive ? 'rgb(var(--color-danger))' : 'rgb(var(--color-accent))';
  const confirmButtonClass = isDestructive
    ? 'bg-gradient-danger text-white'
    : 'bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] text-white';

  // Portalled to <body>. This dialog is opened from inside cards that carry
  // `clip-stable` (a translateZ compositing hint), and a transformed ancestor
  // becomes the containing block for `position: fixed` — so the backdrop was
  // sized to the card rather than the viewport, and clipped by the card's own
  // `overflow: hidden`. Rendered at the top of the document it is a dialog
  // again, wherever it is opened from.
  if (typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm"
      // z-critical (2200): this dialog is opened globally (e.g. DataManagerModal's
      // "Clear All Data" / "Reset to Default" trigger it from inside their
      // own z-modal-data (500) overlay), so it must out-rank every other modal/overlay
      // in the app or the confirmation renders invisibly behind its caller.
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-critical p-4"
      onClick={(e) => {
        // Don't let the click bubble to a parent overlay (this dialog can be
        // nested inside another modal's backdrop) — it would close both.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-lg w-full max-w-md border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1"
              style={{
                background: `linear-gradient(135deg, rgba(${isDestructive ? '239, 68, 68, 0.2' : '99, 102, 241, 0.2'}) 0%, rgba(${isDestructive ? '220, 38, 38, 0.2' : '14, 165, 233, 0.2'}) 100%)`,
              }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: iconColor }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-2">
                {title}
              </h2>
              <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 text-sm leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`py-2.5 px-5 rounded-lg text-sm font-semibold transition hover:shadow-lg active:scale-[0.98] ${confirmButtonClass}`}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmationModal;
