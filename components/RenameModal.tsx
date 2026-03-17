import React, { useState, useEffect } from 'react';
import { Edit3, X } from 'lucide-react';

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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">
                  Rename {targetType}
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] truncate max-w-xs">
                  "{initialName}"
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label
              htmlFor="rename-input"
              className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2"
            >
              New Name
            </label>
            <input
              type="text"
              id="rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={`block w-full bg-[rgb(var(--color-bg-surface-light))] border rounded-lg shadow-sm py-3 px-4 focus:outline-none transition ${error ? 'border-red-500 ring-1 ring-red-500' : 'border-[rgb(var(--color-border-secondary))] focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]'}`}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isButtonDisabled}
              className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50"
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
