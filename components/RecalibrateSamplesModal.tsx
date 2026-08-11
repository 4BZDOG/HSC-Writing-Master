import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';
import { RefreshCw, X, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

interface RecalibrateSamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  /** Runs the recalibration for the chosen ids. */
  onRecalibrate: (sampleIds: string[]) => Promise<void>;
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
const RecalibrateSamplesModal: React.FC<RecalibrateSamplesModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onRecalibrate,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

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
    }
  }, [isOpen, prompt.id, mismatchedIds, rows]);

  if (!isOpen) return null;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleRun = async () => {
    if (selected.length === 0) return;
    setIsRunning(true);
    try {
      await onRecalibrate(selected);
      onClose();
    } finally {
      setIsRunning(false);
    }
  };

  const QuickPick: React.FC<{ label: string; ids: string[]; disabled?: boolean }> = ({
    label,
    ids,
    disabled,
  }) => (
    <button
      onClick={() => setSelected(ids)}
      disabled={disabled || isRunning}
      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 border border-[rgb(var(--color-border-secondary))]/25 light:border-slate-200 hover:text-indigo-500 transition-colors disabled:opacity-40"
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1200] p-4"
      onClick={isRunning ? undefined : onClose}
    >
      <div
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-indigo-500/30 animate-fade-in-up overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-lg">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                Recalibrate Sample Answers
              </h2>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 truncate">
                Re-mark against the rubric — choose which ones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            aria-label="Close"
            className="w-9 h-9 shrink-0 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))]/30 light:hover:bg-slate-300 transition-all flex items-center justify-center disabled:opacity-40"
          >
            <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 flex flex-wrap items-center gap-2 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50">
          <span className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500 mr-1">
            Select
          </span>
          <QuickPick label="All" ids={rows.map((r) => r.sample.id)} />
          <QuickPick label="None" ids={[]} />
          <QuickPick label="AI only" ids={aiIds} disabled={aiIds.length === 0} />
          <QuickPick
            label={`Band mismatch (${mismatchedIds.length})`}
            ids={mismatchedIds}
            disabled={mismatchedIds.length === 0}
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {rows.length === 0 && (
            <p className="py-10 text-center text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
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
                    : 'bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 hover:border-indigo-500/30'
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
                    <span className={`text-xs font-black ${config.text}`}>
                      {sample.mark}/{prompt.totalMarks}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
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
                        className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        title={`Stored as Band ${sample.band}, but ${sample.mark}/${prompt.totalMarks} is Band ${derivedBand} on this question`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> Band {sample.band} stored
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-serif">
                    {preview(sample.answer)}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[rgb(var(--color-text-muted))] light:text-slate-500">
            {/* Recalibration is marking, and the server meters it as such. */}
            {selected.length === 0
              ? 'Nothing selected.'
              : `Re-marks ${selected.length} answer${selected.length === 1 ? '' : 's'} — uses ${selected.length} marking credit${selected.length === 1 ? '' : 's'}.`}
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              disabled={isRunning}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning || selected.length === 0}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-sky-500 hover:shadow-lg active:scale-[0.98] transition disabled:opacity-40 flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Recalibrating…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Recalibrate {selected.length || ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RecalibrateSamplesModal;
