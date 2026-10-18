import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';
import { Scale, X, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import {
  creatorBackdrop,
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
} from '../utils/creatorChrome';

interface RecalibrateSamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  /**
   * Runs the recalibration for the chosen ids. The optional `onProgress`
   * callback is invoked once per sample as the sequential run advances, so the
   * modal can show a live {done} of {total} bar instead of a blind spinner.
   */
  onRecalibrate: (
    sampleIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
}

/** First line of an answer, for identifying it in a list. */
const preview = (answer: string, limit = 90): string => {
  const flat = (answer || '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
};

/**
 * Choose which exemplars to re-mark.
 *
 * Recalibration is metered marking — one evaluation per sample — so the
 * all-or-nothing button spent eight units to fix the one exemplar that looked
 * wrong. The count is stated up front for the same reason.
 *
 * "Band mismatch" is the quick pick that matters: it selects the samples whose
 * STORED band disagrees with the band their mark maps to under the current
 * Verb Gate, which is exactly the set that drifts after an import or a verb
 * change, and exactly what recalibration exists to repair.
 */
/**
 * A "select these" shortcut, at module scope on purpose.
 *
 * Declared inside the modal it would be a new component type on every render,
 * so React would unmount and remount all four of these buttons every time a
 * checkbox moved — throwing away focus mid-selection. What it needs from the
 * modal comes in as props instead.
 */
const QuickPick: React.FC<{
  label: string;
  ids: string[];
  disabled?: boolean;
  onPick: (ids: string[]) => void;
}> = ({ label, ids, disabled, onPick }) => (
  <button
    type="button"
    onClick={() => onPick(ids)}
    disabled={disabled}
    className="min-h-11 sm:min-h-0 t-label px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-inset))]/60 text-muted border border-slate-200 dark:border-white/10 hover:text-indigo-500 transition-colors disabled:opacity-40"
  >
    {label}
  </button>
);

const RecalibrateSamplesModal: React.FC<RecalibrateSamplesModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onRecalibrate,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // Per-sample progress driven by the hook's onProgress callback. Null while idle.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEscapeKey(isOpen && !isRunning, onClose);
  useScrollLock(isOpen);
  useUnsavedChanges(
    isRunning,
    'Sample answers are still being recalibrated. Leaving now will lose the ones not yet saved.'
  );

  const tier = useMemo(() => getCommandTermInfo(prompt.verb).tier, [prompt.verb]);

  const rows = useMemo(() => {
    return [...(prompt.sampleAnswers || [])]
      .sort((a, b) => b.mark - a.mark)
      .map((sample: SampleAnswer) => {
        const derivedBand = getBandForMark(sample.mark, prompt.totalMarks, tier);
        return { sample, derivedBand, mismatched: sample.band !== derivedBand };
      });
  }, [prompt.sampleAnswers, prompt.totalMarks, tier]);

  const mismatchedIds = useMemo(
    () => rows.filter((r) => r.mismatched).map((r) => r.sample.id),
    [rows]
  );
  const aiIds = useMemo(
    () => rows.filter((r) => r.sample.source === 'AI').map((r) => r.sample.id),
    [rows]
  );

  useEffect(() => {
    if (isOpen) {
      // Default to the samples that look wrong, falling back to everything when
      // nothing does — the common case is "fix the drift", not "re-mark the lot".
      setSelected(mismatchedIds.length > 0 ? mismatchedIds : rows.map((r) => r.sample.id));
      setIsRunning(false);
      setProgress(null);
    }
  }, [isOpen, prompt.id, mismatchedIds, rows]);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleRun = async () => {
    if (selected.length === 0) return;
    setIsRunning(true);
    setProgress({ done: 0, total: selected.length });
    try {
      await onRecalibrate(selected, (done, total) => setProgress({ done, total }));
      onClose();
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  return createPortal(
    <div className={creatorBackdrop('z-recalibrate')} onClick={isRunning ? undefined : onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recalibrate-title"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <Scale className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            {/* The question the samples belong to, so the title can name the action. */}
            <p className={`${CREATOR_KICKER} truncate`}>{prompt.question}</p>
            <h2 id="recalibrate-title" className={CREATOR_TITLE}>
              Recalibrate sample answers
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            aria-label="Close"
            className={`${CREATOR_CLOSE} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 sm:px-6 py-3 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30">
          <span className="t-label text-muted mr-1">Select</span>
          <QuickPick
            label="All"
            ids={rows.map((r) => r.sample.id)}
            disabled={isRunning}
            onPick={setSelected}
          />
          <QuickPick label="None" ids={[]} disabled={isRunning} onPick={setSelected} />
          <QuickPick
            label="AI only"
            ids={aiIds}
            disabled={isRunning || aiIds.length === 0}
            onPick={setSelected}
          />
          <QuickPick
            label={`Band mismatch (${mismatchedIds.length})`}
            ids={mismatchedIds}
            disabled={isRunning || mismatchedIds.length === 0}
            onPick={setSelected}
          />
        </div>

        <div
          className={`${CREATOR_BODY} space-y-2 bg-[rgb(var(--color-bg-surface))] light:bg-white`}
        >
          {rows.length === 0 && (
            <p className="py-10 text-center text-xs text-muted">
              This question has no sample answers to recalibrate.
            </p>
          )}
          {rows.map(({ sample, derivedBand, mismatched }) => {
            const config = getBandConfig(derivedBand);
            const isSelected = selected.includes(sample.id);
            return (
              <label
                key={sample.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? `${config.bg} ${config.border}`
                    : 'bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-slate-200 dark:border-white/10 hover:border-indigo-500/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isRunning}
                  onChange={() => toggle(sample.id)}
                  className="mt-1 w-4 h-4 shrink-0 accent-indigo-500"
                  aria-label={`Recalibrate the ${sample.mark} of ${prompt.totalMarks} sample`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-bold ${config.text}`}>
                      {sample.mark}/{prompt.totalMarks}
                    </span>
                    <span className="t-label text-muted">
                      Band {derivedBand}
                      {sample.source === 'AI' && sample.derivedFromStudent
                        ? ' · Student + AI'
                        : sample.source === 'USER'
                          ? ' · Student'
                          : sample.source === 'HSC_EXEMPLAR'
                            ? ' · Official'
                            : ' · AI'}
                    </span>
                    {mismatched && (
                      <span
                        className="t-label inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30"
                        title={`Stored as Band ${sample.band}, but ${sample.mark}/${prompt.totalMarks} is Band ${derivedBand} on this question`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> Band {sample.band} stored
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-serif">
                    {preview(sample.answer)}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* The run's status sits on its own line above the buttons, so the
            footer can keep the shared layout. */}
        <div className="flex-shrink-0 px-5 sm:px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/40">
          {isRunning && progress ? (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[rgb(var(--color-text-primary))]">
                  Recalibrating…
                </span>
                <span className="font-mono text-muted">
                  {progress.done} of {progress.total}
                </span>
              </div>
              <div
                className="h-2 rounded-full bg-slate-200 dark:bg-[rgb(var(--color-bg-surface-inset))] overflow-hidden"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label="Recalibration progress"
              >
                <div
                  className="h-full bg-[rgb(var(--color-primary))] transition-all"
                  style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">
              {/* Recalibration is marking, and the server meters it as such. */}
              {selected.length === 0
                ? 'Pick the answers you want re-marked.'
                : `Re-marks ${selected.length} answer${selected.length === 1 ? '' : 's'} — uses ${selected.length} marking credit${selected.length === 1 ? '' : 's'}.`}
            </p>
          )}
        </div>

        <div className={CREATOR_FOOTER}>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className={CREATOR_SECONDARY_BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || selected.length === 0}
            className={CREATOR_PRIMARY_BUTTON}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Recalibrating…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {selected.length > 0
                  ? `Recalibrate ${selected.length} answer${selected.length === 1 ? '' : 's'}`
                  : 'Recalibrate answers'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RecalibrateSamplesModal;
