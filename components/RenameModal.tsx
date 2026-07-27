import React, { useState, useEffect } from 'react';
import { Edit3, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  targetType: string;
  initialName: string;
  existingNames?: string[];
}

const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  onRename,
  targetType,
  initialName,
  existingNames = [],
}) => {
  // Escape closes this modal like every other modal surface.
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
  const [newName, setNewName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(initialName);
      setError(null);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    const trimmedNewName = newName.trim();
    if (
      trimmedNewName.toLowerCase() !== initialName.toLowerCase() &&
      existingNames.some((name) => name.toLowerCase() === trimmedNewName.toLowerCase())
    ) {
      setError(`A ${targetType.toLowerCase()} with this name already exists.`);
    } else {
      setError(null);
    }
  }, [newName, initialName, existingNames, targetType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && !error) {
      onRename(newName.trim());
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  const isButtonDisabled = !newName.trim() || !!error;

  return (
    <div
      // z-[2200]: matches ConfirmationModal — must out-rank every other
      // modal/overlay since rename can be requested while another is open.
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2200] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Rename {targetType}
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 truncate max-w-xs">
                  "{initialName}"
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 bg-[rgb(var(--color-bg-surface))] light:bg-white">
            <label
              htmlFor="rename-input"
              className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
            >
              New Name
            </label>
            <input
              type="text"
              id="rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={`block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border rounded-xl shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none transition ${error ? 'border-red-500 light:border-red-400 ring-1 ring-red-500' : 'border-[rgb(var(--color-border-secondary))] light:border-slate-300 focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]'}`}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            {error && <p className="text-red-400 light:text-red-600 text-xs mt-2">{error}</p>}
          </div>

          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isButtonDisabled}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameModal;
