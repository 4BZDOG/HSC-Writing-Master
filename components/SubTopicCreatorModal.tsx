import React, { useState, useEffect } from 'react';
import { FolderPlus, Sparkles, X } from 'lucide-react';
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

interface SubTopicCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: (newItemName: string, options: { generateDotPoints: boolean }) => void;
  existingNames: string[];
  /** The topic it will be added to, named — this modal never said. */
  destination?: string;
}

const SubTopicCreatorModal: React.FC<SubTopicCreatorModalProps> = ({
  isOpen,
  onClose,
  onItemCreated,
  existingNames,
  destination,
}) => {
  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const [newItemName, setNewItemName] = useState('');
  // Off until asked for. NSW dot points are NESA's own wording, so inventing
  // them is the exception, and when it was on by default a curator who only
  // wanted a heading got an AI call they never chose (and, on a failure, four
  // retries counted against the AI circuit breaker). "Add dot points" now
  // takes the real ones typed or pasted.
  const [shouldGenerate, setShouldGenerate] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewItemName('');
      setValidationError(null);
      setShouldGenerate(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (existingNames.some((name) => name.toLowerCase() === newItemName.trim().toLowerCase())) {
      setValidationError(`A sub-topic with this name already exists.`);
    } else {
      setValidationError(null);
    }
  }, [newItemName, existingNames]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim() && !validationError) {
      onItemCreated(newItemName.trim(), { generateDotPoints: shouldGenerate });
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  const isButtonDisabled = !newItemName.trim() || !!validationError;

  return (
    <div className={CREATOR_BACKDROP} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtopic-creator-title"
        className={`${CREATOR_SHELL} max-w-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <FolderPlus className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>{destination || 'New sub-topic'}</p>
            <h2 id="subtopic-creator-title" className={CREATOR_TITLE}>
              Add a sub-topic
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={`${CREATOR_BODY} space-y-5`}>
            {/* Name input */}
            <div>
              <label htmlFor="subtopic-name" className={CREATOR_FIELD_LABEL}>
                Sub-topic name
              </label>
              <input
                type="text"
                id="subtopic-name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className={`${CREATOR_INPUT} ${validationError ? 'ring-1 ring-red-500' : ''}`}
                placeholder="e.g., Inquiry Question 1"
                aria-invalid={!!validationError}
                aria-describedby={validationError ? 'subtopic-name-error' : undefined}
                autoFocus
              />
              {validationError && (
                <p id="subtopic-name-error" className="t-label text-red-600 dark:text-red-400 mt-2">
                  {validationError}
                </p>
              )}
            </div>

            {/* AI generation option — the label is the whole target, so one click toggles it once. */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                shouldGenerate
                  ? 'border-indigo-200 bg-indigo-50/50 dark:border-[rgb(var(--color-accent))]/30 dark:bg-[rgb(var(--color-accent))]/5'
                  : 'border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-[rgb(var(--color-bg-surface-inset))]/30'
              }`}
            >
              <input
                type="checkbox"
                checked={shouldGenerate}
                onChange={(e) => setShouldGenerate(e.target.checked)}
                className="h-4 w-4 mt-0.5 rounded-lg border-slate-300 dark:border-white/15 bg-white dark:bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="flex items-center gap-2 font-semibold text-sm text-[rgb(var(--color-text-primary))]">
                  <Sparkles
                    className="w-4 h-4 text-[rgb(var(--color-accent))] flex-shrink-0"
                    aria-hidden="true"
                  />
                  Generate dot points with AI
                </span>
                <p className="text-xs text-muted mt-1">
                  AI will suggest syllabus dot points for this sub-topic based on the course and
                  topic context.
                </p>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div className={CREATOR_FOOTER}>
            <button type="button" onClick={onClose} className={CREATOR_SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={isButtonDisabled} className={CREATOR_PRIMARY_BUTTON}>
              Add sub-topic
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubTopicCreatorModal;
