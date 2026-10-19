import React, { useState, useEffect, useMemo } from 'react';
import { generateDotPointsForSubTopic } from '../services/geminiService';
import { describeAccess, isFeatureLocked, requestUpgrade } from '../services/entitlements';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import { X, ListChecks, Sparkles, Lock } from 'lucide-react';
import AiErrorNotice from './AiErrorNotice';
import DiscardConfirmBar from './DiscardConfirmBar';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { parseDotPointLines } from '../utils/dotPointLines';
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

interface DotPointGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Adds the given dot point descriptions to this sub-topic. Both modes end
   * here: typed lines and AI suggestions are added by the same handler.
   */
  onDotPointsGenerated: (dotPoints: string[]) => void;
  courseName: string;
  topicName: string;
  subTopicName: string;
  /**
   * Descriptions of the dot points this sub-topic already holds. A typed line
   * that repeats one is skipped rather than added a second time.
   */
  existingDotPoints?: string[];
}

type EntryMode = 'paste' | 'ai';

const NO_EXISTING_DOT_POINTS: string[] = [];

const DotPointGeneratorModal: React.FC<DotPointGeneratorModalProps> = ({
  isOpen,
  onClose,
  onDotPointsGenerated,
  courseName,
  topicName,
  subTopicName,
  existingDotPoints = NO_EXISTING_DOT_POINTS,
}) => {
  // Typing and pasting are free and open to every curator. Only the AI pass is
  // on the studio plan, so the lock is read here, for that tab alone.
  const aiLocked = isFeatureLocked('aiContentStudio');
  const [mode, setMode] = useState<EntryMode>('paste');
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseDotPointLines(text, existingDotPoints),
    [text, existingDotPoints]
  );
  const hasText = text.trim().length > 0;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsLoading(false);
    } else {
      // Each opening starts on the typed mode with an empty box. Closing with
      // text in it has already been confirmed by the discard guard, or the text
      // was added, so there is nothing left to keep.
      setText('');
      setMode('paste');
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    // The AI pass is the only plan-gated call here. Checked before the request,
    // so a locked plan opens the upgrade prompt rather than spending a call the
    // server would refuse.
    if (aiLocked) {
      requestUpgrade('aiContentStudio');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const dotPoints = await generateDotPointsForSubTopic(courseName, topicName, subTopicName);
      if (!dotPoints || dotPoints.length === 0) {
        setError(
          'The AI could not produce dot points for this sub-topic. Try again, or use Type or paste.'
        );
        return;
      }
      onDotPointsGenerated(dotPoints);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTyped = () => {
    if (parsed.dotPoints.length === 0) return;
    onDotPointsGenerated(parsed.dotPoints);
    // Closes directly rather than through the discard guard: the text has
    // been added, so there is nothing to ask about.
    onClose();
  };

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  // Typed text is work in progress, so a stray click on the backdrop or a
  // deliberate close asks first. The AI tab has no text of its own to lose.
  const guard = useDiscardGuard(isOpen, hasText, handleClose);
  const requestClose = () => {
    if (isLoading) return;
    guard.requestClose();
  };

  // Escape closes like every other modal surface, but never mid-request.
  useEscapeKey(isOpen && !isLoading, guard.requestClose);
  useScrollLock(isOpen);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) {
    return null;
  }

  const count = parsed.dotPoints.length;
  const countLabel = `${count} dot point${count === 1 ? '' : 's'}`;

  return (
    <div className={CREATOR_BACKDROP} onClick={guard.requestCloseFromBackdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dot-point-generator-title"
        className={`${CREATOR_SHELL} max-w-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <ListChecks className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>{subTopicName}</p>
            <h2 id="dot-point-generator-title" className={CREATOR_TITLE}>
              Add dot points
            </h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={CREATOR_BODY}>
          <div
            role="tablist"
            aria-label="How to add dot points"
            className="flex items-center gap-1 p-1 mb-5 rounded-xl bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-inset))]/50"
          >
            {(
              [
                { id: 'paste', label: 'Type or paste' },
                { id: 'ai', label: 'Suggest with AI' },
              ] as const
            ).map((tab) => {
              const selected = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`dot-point-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="dot-point-mode-panel"
                  onClick={() => setMode(tab.id)}
                  disabled={isLoading}
                  className={`min-h-11 sm:min-h-0 flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
                    selected
                      ? 'bg-white border-slate-300 text-slate-900 shadow-sm dark:bg-[rgb(var(--color-bg-surface-light))] dark:border-white/15 dark:text-[rgb(var(--color-text-primary))]'
                      : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-[rgb(var(--color-text-muted))] dark:hover:text-[rgb(var(--color-text-primary))]'
                  }`}
                >
                  {tab.id === 'ai' && <Sparkles className="w-4 h-4" aria-hidden="true" />}
                  {tab.label}
                  {tab.id === 'ai' && aiLocked && (
                    <Lock className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="dot-point-mode-panel"
            aria-labelledby={mode === 'paste' ? 'dot-point-tab-paste' : 'dot-point-tab-ai'}
          >
            {mode === 'paste' ? (
              <>
                <label htmlFor="dot-point-lines" className={CREATOR_FIELD_LABEL}>
                  Dot points
                </label>
                <textarea
                  id="dot-point-lines"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  aria-describedby="dot-point-lines-hint"
                  placeholder="Describe the function of a CPU cache"
                  className={`${CREATOR_INPUT} min-h-40 resize-y`}
                />
                <p
                  id="dot-point-lines-hint"
                  className="mt-2 t-body text-[rgb(var(--color-text-secondary))]"
                >
                  One dot point per line. Paste them straight from the syllabus.
                </p>

                <div aria-live="polite" className="mt-4">
                  {count > 0 && (
                    <>
                      <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))]">
                        {countLabel} will be added
                      </p>
                      <ul className="mt-2 space-y-2">
                        {parsed.dotPoints.map((line) => (
                          <li
                            key={line.toLowerCase()}
                            className="t-body text-sm text-[rgb(var(--color-text-primary))] py-2 px-3 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 border border-slate-200 dark:border-white/10"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {hasText && count === 0 && (
                    <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                      Nothing new to add yet.
                    </p>
                  )}
                  {parsed.skippedExisting > 0 && (
                    <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))]">
                      {parsed.skippedExisting} already in this sub-topic, skipped
                    </p>
                  )}
                  {parsed.skippedRepeated > 0 && (
                    <p className="mt-1 text-xs text-[rgb(var(--color-text-muted))]">
                      {parsed.skippedRepeated} repeated above, skipped
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="t-body text-[rgb(var(--color-text-secondary))]">
                  Draft suggested dot points for this sub-topic with AI. They are a starting point,
                  not NESA’s wording. For the exact syllabus text, use Type or paste.
                </p>
                {aiLocked && (
                  <p className="mt-3 t-body text-[rgb(var(--color-text-secondary))]">
                    {describeAccess('aiContentStudio').explanation}
                  </p>
                )}
                {error && !isLoading && (
                  <div className="mt-4">
                    <AiErrorNotice
                      title="No dot points were drafted"
                      message={error}
                      onRetry={handleGenerate}
                      onDismiss={() => setError(null)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {guard.isConfirming ? (
          <DiscardConfirmBar
            summary="the dot points you have typed"
            onKeep={guard.cancelDiscard}
            onDiscard={guard.confirmDiscard}
          />
        ) : (
          <div className={CREATOR_FOOTER}>
            <button
              type="button"
              onClick={requestClose}
              disabled={isLoading}
              className={CREATOR_SECONDARY_BUTTON}
            >
              Cancel
            </button>
            {mode === 'paste' ? (
              <button
                type="button"
                onClick={handleAddTyped}
                disabled={count === 0}
                className={CREATOR_PRIMARY_BUTTON}
              >
                Add {countLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className={CREATOR_PRIMARY_BUTTON}
              >
                {aiLocked ? (
                  <Lock className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ListChecks className="w-4 h-4" aria-hidden="true" />
                )}
                Generate dot points
              </button>
            )}
          </div>
        )}

        <AiBusyOverlay show={isLoading}>
          <LoadingIndicator
            task="generation"
            message="Generating dot points"
            messages={['Reading the course and topic', 'Drafting 3 to 5 syllabus dot points']}
            duration={8}
            band={3}
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default DotPointGeneratorModal;
