import React, { useState, useEffect, useMemo } from 'react';
import { Edit3, X, Target, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Focus-area protection for a dot-point rename.
 *
 * A dot point's focus areas are normally READ from its description, so editing
 * the wording silently rewrites them — and because those focus areas are what a
 * generated question is narrowed to, a teacher fixing a typo could quietly
 * change what the app writes questions about. When the rename would change
 * them, the dialog says so and offers to keep the current list (by writing it
 * as an explicit override).
 */
export interface RenameFocusAreaGuard {
  /** Focus areas as they stand now. */
  current: string[];
  /** What the focus areas would become for a candidate description. */
  previewFor: (name: string) => string[];
  /** True when the list is already hand-set, and so immune to the rename. */
  isOverridden: boolean;
  /** Pin the current list so the rename cannot change it. */
  onKeep: (focusAreas: string[]) => void;
}

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  targetType: string;
  initialName: string;
  existingNames?: string[];
  /** Supplied for a dot point only — see RenameFocusAreaGuard. */
  focusAreaGuard?: RenameFocusAreaGuard;
  /**
   * Edit the value as multi-line text.
   *
   * Syllabus dot points and exam questions routinely run to several lines — a
   * statement, an "Including:" lead-in, then a bulleted list. A single-line
   * `<input>` cannot hold them: the browser's value sanitiser strips every
   * newline the moment the field is touched, so a teacher who edited one word
   * silently flattened the whole dot point into a run-on and the edit did not
   * come back looking like what they typed.
   */
  multiline?: boolean;
}

const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  onRename,
  targetType,
  initialName,
  existingNames = [],
  focusAreaGuard,
  multiline = false,
}) => {
  // Escape closes this modal like every other modal surface.
  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const [newName, setNewName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [keepFocusAreas, setKeepFocusAreas] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setNewName(initialName);
      setError(null);
      setKeepFocusAreas(true);
    }
  }, [isOpen, initialName]);

  // Only a live rename can change the focus areas, and only when they are still
  // being read from the description. A hand-set list already survives this.
  const focusAreaChange = useMemo(() => {
    if (!focusAreaGuard || focusAreaGuard.isOverridden) return null;
    const next = focusAreaGuard.previewFor(newName.trim());
    const current = focusAreaGuard.current;
    const changed = next.length !== current.length || next.some((item, i) => item !== current[i]);
    return changed ? { current, next } : null;
  }, [focusAreaGuard, newName]);

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

  const fieldStyles = error
    ? 'border-red-500 light:border-red-400 ring-1 ring-red-500'
    : 'border-[rgb(var(--color-border-secondary))] light:border-slate-300 focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && !error) {
      // Pin BEFORE the rename: the description change is what re-reads them.
      if (focusAreaChange && keepFocusAreas) focusAreaGuard?.onKeep(focusAreaChange.current);
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
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Rename"
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
            {multiline ? (
              <textarea
                id="rename-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  // Enter belongs to the text here — it is how the list below
                  // the statement gets its lines. Cmd/Ctrl+Enter saves.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                rows={6}
                className={`block w-full resize-y bg-[rgb(var(--color-bg-surface-light))] light:bg-white border rounded-xl shadow-sm py-3 px-4 font-mono text-[13px] leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none transition ${fieldStyles}`}
                autoFocus
              />
            ) : (
              <input
                type="text"
                id="rename-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border rounded-xl shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none transition ${fieldStyles}`}
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            )}
            {multiline && (
              <p className="mt-2 text-[11px] text-[rgb(var(--color-text-muted))] light:text-slate-500">
                Line breaks are kept. Put the statement on the first line and its focus areas
                underneath — one per line, or as a bulleted list — and only the statement is used as
                the label. Cmd/Ctrl + Enter saves.
              </p>
            )}
            {error && <p className="text-red-400 light:text-red-600 text-xs mt-2">{error}</p>}

            {focusAreaChange && (
              <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 animate-fade-in">
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> This changes the focus areas
                </p>
                <p className="text-[11px] leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 mb-3">
                  Focus areas are read from this dot point's wording, and questions are narrowed to
                  them.
                </p>
                <div className="space-y-1.5 mb-3 text-[11px]">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 w-12 shrink-0">
                      Now
                    </span>
                    <span className="text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                      {focusAreaChange.current.join(', ') || '(none)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 w-12 shrink-0">
                      After
                    </span>
                    <span className="text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                      {focusAreaChange.next.join(', ') || '(none)'}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepFocusAreas}
                    onChange={(e) => setKeepFocusAreas(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    <Target className="w-3 h-3 text-emerald-500" />
                    Keep the focus areas I have now
                  </span>
                </label>
              </div>
            )}
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
