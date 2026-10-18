import React from 'react';
import { Database } from 'lucide-react';
import { CREATOR_ICON_TILE } from '../../utils/creatorChrome';

export const ModalHeader: React.FC<{ title: string; subtitle: string; icon?: React.ReactNode }> = ({
  title,
  subtitle,
  icon,
}) => (
  <div className="flex-shrink-0 px-6 py-5 border-b border-slate-200 dark:border-white/10">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* The tile names the object; the caller's icon, or the database default. */}
        <div aria-hidden="true" className={CREATOR_ICON_TILE}>
          {icon || <Database className="w-5 h-5" />}
        </div>
        <div>
          <h3 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">{title}</h3>
          <p className="text-[rgb(var(--color-text-muted))] mt-1 text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  </div>
);

export const ActionButtons: React.FC<{
  onCancel: () => void;
  onConfirm: () => void;
  confirmText: string;
  isConfirmDisabled?: boolean;
  /** Short explanation shown beside the buttons — use it to say WHY the
   *  confirm button is disabled, so the user isn't left guessing. */
  hint?: string;
}> = ({ onCancel, onConfirm, confirmText, isConfirmDisabled = false, hint }) => (
  <div className="px-4 sm:px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-end gap-3 flex-shrink-0">
    {hint && (
      <p className="text-xs text-[rgb(var(--color-text-muted))] mr-auto w-full sm:w-auto">{hint}</p>
    )}
    <button
      onClick={onCancel}
      className="py-2 px-4 min-h-11 sm:min-h-0 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] active:scale-[0.98] transition"
    >
      Cancel
    </button>
    <button
      onClick={onConfirm}
      disabled={isConfirmDisabled}
      className="py-2 px-4 min-h-11 sm:min-h-0 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition disabled:opacity-50"
    >
      {confirmText}
    </button>
  </div>
);
