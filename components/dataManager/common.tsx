import React from 'react';
import { Database } from 'lucide-react';

export const ModalHeader: React.FC<{ title: string; subtitle: string; icon?: React.ReactNode }> = ({
  title,
  subtitle,
  icon,
}) => (
  <div className="flex-shrink-0 px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
          {icon || <Database className="w-5 h-5 text-white" />}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-gray-400 mt-1 text-sm">{subtitle}</p>
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
}> = ({ onCancel, onConfirm, confirmText, isConfirmDisabled = false }) => (
  <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3 flex-shrink-0">
    <button
      onClick={onCancel}
      className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
    >
      Cancel
    </button>
    <button
      onClick={onConfirm}
      disabled={isConfirmDisabled}
      className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50"
    >
      {confirmText}
    </button>
  </div>
);
