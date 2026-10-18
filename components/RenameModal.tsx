import React, { useState, useEffect, useMemo } from 'react';
import { Tag, X, Target, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_FIELD_LABEL,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

/**
 * The shared backdrop, lifted to the critical layer. Rename can be requested
 * while another dialog is open, so it must sit above every other modal.
 */
const RENAME_BACKDROP = CREATOR_BACKDROP.replace('z-modal', 'z-critical');

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

  // The shared field border stays as it is on an error; the red ring carries the
  // error, so the two never fight over the same border colour.
  const fieldClass = `${CREATOR_INPUT}${error ? ' ring-1 ring-red-500' : ''}${
    multiline ? ' resize-y font-mono leading-relaxed' : ''
  }`;

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
    <div className={RENAME_BACKDROP} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        className={`${CREATOR_SHELL} max-w-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <Tag className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            {/* The name being changed, in the kicker, so the title can say what kind of item it is. */}
            <p className={`${CREATOR_KICKER} truncate`}>“{initialName}”</p>
            <h2 id="rename-title" className={CREATOR_TITLE}>
              Rename {targetType.toLowerCase()}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={`${CREATOR_BODY} space-y-4`}>
            <div>
              <label htmlFor="rename-input" className={CREATOR_FIELD_LABEL}>
                New name
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
                  aria-invalid={!!error}
                  className={fieldClass}
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  id="rename-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  aria-invalid={!!error}
                  className={fieldClass}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                />
              )}
              {multiline && (
                <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))]">
                  Line breaks are kept. Put the statement on the first line and its focus areas
                  underneath — one per line, or as a bulleted list — and only the statement is used
                  as the label. Cmd/Ctrl + Enter saves.
                </p>
              )}
              {error && <p className="text-red-600 dark:text-red-400 text-xs mt-2">{error}</p>}
            </div>

            {focusAreaChange && (
              <div className="p-4 rounded-xl bg-amber-500/10 light:bg-amber-100/60 border border-amber-500/30 light:border-amber-300 animate-fade-in">
                <p className="t-label flex items-center gap-2 text-amber-600 light:text-amber-700 dark:text-amber-400 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> This changes the focus areas
                </p>
                <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] mb-3">
                  Focus areas are read from this dot point's wording, and questions are narrowed to
                  them.
                </p>
                <div className="space-y-1.5 mb-3 text-xs">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-bold text-[rgb(var(--color-text-muted))] w-12 shrink-0">
                      Now
                    </span>
                    <span className="text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                      {focusAreaChange.current.join(', ') || '(none)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-bold text-[rgb(var(--color-text-muted))] w-12 shrink-0">
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
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[rgb(var(--color-text-primary))]">
                    <Target className="w-3 h-3 text-emerald-500 light:text-emerald-700" />
                    Keep the focus areas I have now
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className={CREATOR_FOOTER}>
            <button type="button" onClick={onClose} className={CREATOR_SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={isButtonDisabled} className={CREATOR_PRIMARY_BUTTON}>
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameModal;
