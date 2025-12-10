import React from 'react';
import { AlertTriangle } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1"
              style={{ background: `linear-gradient(135deg, rgba(${isDestructive ? '239, 68, 68, 0.2' : '99, 102, 241, 0.2'}) 0%, rgba(${isDestructive ? '220, 38, 38, 0.2' : '14, 165, 233, 0.2'}) 100%)` }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: iconColor }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
              <p className="text-[rgb(var(--color-text-secondary))] text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`py-2 px-4 rounded-lg text-sm font-semibold transition hover:shadow-lg active:scale-[0.98] ${confirmButtonClass}`}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
