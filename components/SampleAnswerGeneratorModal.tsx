import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { generateSampleAnswer } from '../services/geminiService';
import { getCommandTermInfo, getBandForMark, TIER_GROUPS } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import {
  X,
  Sparkles,
  AlertTriangle,
  Info,
  Check,
  Plus,
  Target,
  Award,
  Loader2,
  CopyCheck,
  Trash2,
} from 'lucide-react';
import { getBandConfig, stripHtmlTags } from '../utils/renderUtils';
import { describeSimilarity, findNearDuplicate } from '../utils/answerSimilarity';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

interface SampleAnswerGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  onSampleAnswerGenerated: (newAnswer: SampleAnswer) => void;
}

const SampleAnswerGeneratorModal: React.FC<SampleAnswerGeneratorModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onSampleAnswerGenerated,
}) => {
  // A ladder of exemplars is more useful than any single one, and a teacher
  // building one had to reopen this modal once per mark. The selection is
  // therefore a SET of marks, kept in ascending order so the batch is written
  // from the bottom up and each answer can see the ones below it.
  const [selectedMarks, setSelectedMarks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  /** Which mark in the batch is being written, for the progress read-out. */
  const [progress, setProgress] = useState<{ done: number; total: number; mark: number } | null>(
    null
  );
  /**
   * Answers that came back saying what an exemplar at the same mark already
   * says. Held here rather than written: a level that holds five variations on
   * one shape charges a student four readings for nothing, and the cheapest fix
   * is not to store the fifth. Nothing is discarded silently — each one is shown
   * beside the exemplar it repeats, and keeping it is one click.
   */
  const [duplicates, setDuplicates] = useState<
    { answer: SampleAnswer; against: SampleAnswer; score: number }[]
  >([]);

  // Escape closes this modal like every other modal surface (but never mid-operation).
  useEscapeKey(isOpen && !isLoading, onClose);
  useScrollLock(isOpen);
  // Escape and the backdrop are already blocked while a batch runs, but a
  // browser navigation was not: closing the tab five answers into an eight-mark
  // ladder threw away every AI call still to land.
  useUnsavedChanges(
    isLoading || duplicates.length > 0,
    'Sample answers are still being written. Leaving now will lose the ones not yet saved.'
  );
  const [error, setError] = useState<string | null>(null);

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  const existingCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (prompt.sampleAnswers || []).forEach((sa) => {
      counts.set(sa.mark, (counts.get(sa.mark) || 0) + 1);
    });
    return counts;
  }, [prompt.sampleAnswers]);

  // Coverage is judged on the band the mark maps to on THIS question, not the
  // band stored on the sample. A stored band travels with imported and legacy
  // exemplars and can disagree with the Verb Gate — which left the coverage
  // strip claiming bands that no sample actually demonstrates, and pointed the
  // suggestion at a band that was already covered.
  const coveredBands = useMemo(() => {
    const bands = new Set<number>();
    (prompt.sampleAnswers || []).forEach((sa) =>
      bands.add(getBandForMark(sa.mark, prompt.totalMarks, commandTermInfo.tier))
    );
    return bands;
  }, [prompt.sampleAnswers, prompt.totalMarks, commandTermInfo.tier]);

  const tierInfo = useMemo(
    () => TIER_GROUPS.find((t) => t.tier === commandTermInfo.tier),
    [commandTermInfo.tier]
  );

  const maxBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier),
    [prompt.totalMarks, commandTermInfo.tier]
  );

  const markOptions = useMemo(() => {
    return Array.from({ length: prompt.totalMarks + 1 }, (_, i) => i).map((mark) => ({
      mark,
      band: getBandForMark(mark, prompt.totalMarks, commandTermInfo.tier),
      count: existingCounts.get(mark) || 0,
    }));
  }, [prompt.totalMarks, existingCounts, commandTermInfo.tier]);

  const suggestedMark = useMemo(() => {
    // No samples yet → start with full marks (natural first exemplar)
    if (coveredBands.size === 0) return prompt.totalMarks;
    // Find the highest missing band and suggest the highest mark that maps to it
    for (let b = maxBand; b >= 1; b--) {
      if (!coveredBands.has(b)) {
        const options = markOptions.filter((o) => o.band === b && o.mark > 0);
        if (options.length > 0) return options[options.length - 1].mark;
      }
    }
    return prompt.totalMarks;
  }, [maxBand, coveredBands, markOptions, prompt.totalMarks]);

  const missingBands = useMemo(() => {
    const missing: number[] = [];
    for (let b = 1; b <= maxBand; b++) {
      if (!coveredBands.has(b)) missing.push(b);
    }
    return missing;
  }, [maxBand, coveredBands]);

  /** One mark per band that has no exemplar yet — the "complete the ladder" pick. */
  const missingBandMarks = useMemo(() => {
    const marks: number[] = [];
    missingBands.forEach((b) => {
      const options = markOptions.filter((o) => o.band === b && o.mark > 0);
      if (options.length > 0) marks.push(options[options.length - 1].mark);
    });
    return Array.from(new Set(marks)).sort((a, b) => a - b);
  }, [missingBands, markOptions]);

  // Reset on every open: this modal stays mounted while the user navigates
  // between prompts, so a mark selected for a previous (larger) question
  // would otherwise silently persist — and could even exceed the current
  // question's totalMarks. Default to the suggested mark (targeting a missing band).
  useEffect(() => {
    if (isOpen) {
      setSelectedMarks([suggestedMark]);
      setIsLoading(false);
      setProgress(null);
      setError(null);
      setDuplicates([]);
    }
  }, [isOpen, prompt.id, prompt.totalMarks, suggestedMark]);

  const toggleMark = (mark: number) => {
    setSelectedMarks((prev) =>
      prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark].sort((a, b) => a - b)
    );
  };

  const handleGenerate = async () => {
    if (selectedMarks.length === 0) return;

    setIsLoading(true);
    setError(null);
    setDuplicates([]);
    // Sequential, not parallel: a batch of eight would otherwise arrive at the
    // provider at once and trip the rate limit, and each answer is written with
    // sight of the ones already produced so the ladder is genuinely graduated.
    const written: SampleAnswer[] = [];
    const failed: number[] = [];
    const repeats: { answer: SampleAnswer; against: SampleAnswer; score: number }[] = [];
    let lastMessage = '';

    // What a new answer is checked against: everything already saved on this
    // question, plus whatever this batch has produced. Snapshotted here because
    // `prompt` re-renders underneath the loop as each answer is saved.
    const library: SampleAnswer[] = [...(prompt.sampleAnswers || [])];

    for (let i = 0; i < selectedMarks.length; i++) {
      const mark = selectedMarks[i];
      setProgress({ done: i, total: selectedMarks.length, mark });
      try {
        // A snapshot, not the live array: the callee must see the ladder as it
        // stood when its answer was requested.
        const newAnswer = await generateSampleAnswer(prompt, mark, [...written]);
        written.push(newAnswer);

        // The model is now told what already sits at this mark, but being told
        // is not the same as having complied. Only answers at the SAME mark are
        // compared: a 4/6 resembling the 6/6 is the ladder being tight, which
        // is a different (and often correct) thing.
        const repeat = findNearDuplicate(
          newAnswer.answer,
          library.filter((s) => s.mark === mark)
        );
        if (repeat) {
          repeats.push({ answer: newAnswer, against: repeat.against, score: repeat.score });
          continue;
        }

        library.push(newAnswer);
        // Surfaced as it lands, so a long batch fills the panel behind the
        // modal rather than appearing all at once at the end.
        onSampleAnswerGenerated(newAnswer);
      } catch (err) {
        failed.push(mark);
        lastMessage = err instanceof Error ? err.message : 'Generation failed.';
      }
    }

    setIsLoading(false);
    setProgress(null);
    setDuplicates(repeats);

    if (failed.length === 0) {
      // A batch that produced a repeat stays open on the review panel — closing
      // over the top of it would be the silent discard this check exists to
      // avoid.
      if (repeats.length === 0) handleClose();
      return;
    }
    // Whatever succeeded is already saved; say plainly what did not, and leave
    // the modal open with only the failures still selected so "Generate" retries
    // exactly those.
    setSelectedMarks(failed);
    setError(
      `${failed.length} of ${selectedMarks.length} could not be generated (${failed
        .map((m) => `${m}/${prompt.totalMarks}`)
        .join(', ')}). ${lastMessage}`
    );
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  /** Write a held-back answer to the library after all. */
  const keepDuplicate = (id: string) => {
    const entry = duplicates.find((d) => d.answer.id === id);
    if (entry) onSampleAnswerGenerated(entry.answer);
    setDuplicates((prev) => prev.filter((d) => d.answer.id !== id));
  };

  /** Drop it. Nothing was written, so there is nothing to undo. */
  const discardDuplicate = (id: string) =>
    setDuplicates((prev) => prev.filter((d) => d.answer.id !== id));

  const keepAllDuplicates = () => {
    duplicates.forEach((d) => onSampleAnswerGenerated(d.answer));
    setDuplicates([]);
  };

  if (!isOpen) return null;

  // The chrome colours itself from the highest mark in the selection — the top
  // of the ladder being built.
  const topMark = selectedMarks.length > 0 ? Math.max(...selectedMarks) : null;
  const selectedBand =
    topMark !== null ? getBandForMark(topMark, prompt.totalMarks, commandTermInfo.tier) : 1;
  const activeBandConfig = getBandConfig(selectedBand);
  const selectedBands = Array.from(
    new Set(selectedMarks.map((m) => getBandForMark(m, prompt.totalMarks, commandTermInfo.tier)))
  ).sort((a, b) => a - b);
  // The busy overlay follows the answer being written, not the top of the batch.
  const progressBand =
    progress !== null
      ? getBandForMark(progress.mark, prompt.totalMarks, commandTermInfo.tier)
      : selectedBand;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all duration-300"
      onClick={handleClose}
    >
      <div
        className={`
          clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl
          w-full max-w-3xl border-2 ${activeBandConfig.border}
          animate-fade-in-up overflow-hidden flex flex-col h-[85vh] sm:h-[650px]
          ${activeBandConfig.glow}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`relative px-8 py-6 border-b-2 ${activeBandConfig.border} overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50`}
        >
          <div
            className={`absolute inset-0 opacity-10 light:opacity-5 bg-gradient-to-r ${activeBandConfig.gradient}`}
          />

          {/* Cubic Mesh Texture Overlay */}
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div
                className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg
                        bg-gradient-to-br ${activeBandConfig.gradient} text-white
                    `}
              >
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white light:text-slate-900 tracking-tight">
                  Generate Sample Answer
                </h2>
                <div className="flex items-center gap-2 mt-1 text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider bg-white/10 light:bg-white/60 border border-white/20 light:border-slate-300/50`}
                  >
                    '{prompt.verb}'
                  </span>
                  <span className="opacity-50">•</span>
                  <span className="opacity-80">{tierInfo?.title}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isLoading}
              aria-label="Close"
              className="p-2 rounded-xl hover:bg-white/10 light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] hover:text-white light:hover:text-slate-900 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {duplicates.length > 0 && (
            <div className="rounded-2xl border-2 border-amber-500/40 light:border-amber-300 bg-amber-500/5 light:bg-amber-50 p-5 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 light:bg-amber-100 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <CopyCheck className="w-4 h-4 text-amber-400 light:text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-amber-300 light:text-amber-800 uppercase tracking-wider">
                    {duplicates.length === 1
                      ? 'One answer repeats an exemplar already at that mark'
                      : `${duplicates.length} answers repeat exemplars already at their mark`}
                  </h3>
                  <p className="text-xs leading-relaxed text-amber-200/80 light:text-amber-800/90 mt-1">
                    Nothing below has been saved yet. A level holding two answers that say the same
                    thing costs every student a second reading for nothing — but this is a
                    judgement, not a rule, so keeping one is a click away.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {duplicates.map(({ answer, against, score }) => {
                  const band = getBandForMark(answer.mark, prompt.totalMarks, commandTermInfo.tier);
                  const config = getBandConfig(band);
                  return (
                    <div
                      key={answer.id}
                      className="rounded-xl border border-amber-500/20 light:border-amber-200 bg-[rgb(var(--color-bg-surface))]/60 light:bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${config.bg} ${config.text} border ${config.border}`}
                        >
                          {answer.mark}/{prompt.totalMarks}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/15 light:bg-amber-100 text-amber-400 light:text-amber-800 border border-amber-500/30">
                          {describeSimilarity(score)} · {Math.round(score * 100)}% overlap
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => keepDuplicate(answer.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 light:bg-emerald-50 text-emerald-400 light:text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
                          >
                            <Check className="w-3 h-3" /> Keep it
                          </button>
                          <button
                            onClick={() => discardDuplicate(answer.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/10 light:bg-red-50 text-red-400 light:text-red-700 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 className="w-3 h-3" /> Discard
                          </button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[9px] font-black uppercase tracking-[0.15em] text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1">
                            New
                          </span>
                          <p className="text-[11px] leading-snug font-serif text-[rgb(var(--color-text-secondary))] light:text-slate-700 line-clamp-3">
                            {stripHtmlTags(answer.answer)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[9px] font-black uppercase tracking-[0.15em] text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1">
                            Already in the library
                          </span>
                          <p className="text-[11px] leading-snug font-serif text-[rgb(var(--color-text-muted))] light:text-slate-500 line-clamp-3">
                            {stripHtmlTags(against.answer)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {duplicates.length > 1 && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={keepAllDuplicates}
                    className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-500/10 light:bg-emerald-50 text-emerald-400 light:text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                  >
                    Keep all {duplicates.length}
                  </button>
                  <button
                    onClick={() => setDuplicates([])}
                    className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 hover:text-[rgb(var(--color-text-secondary))] transition-all"
                  >
                    Discard all
                  </button>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Select Target Marks
                <span className="normal-case tracking-normal font-medium opacity-70">
                  — pick as many as you like
                </span>
              </h3>

              <div className="flex items-center gap-2">
                {missingBandMarks.length > 0 && (
                  <button
                    onClick={() => !isLoading && setSelectedMarks(missingBandMarks)}
                    disabled={isLoading}
                    className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                    title="Select one mark for every band that has no exemplar yet"
                  >
                    Complete the ladder ({missingBandMarks.length})
                  </button>
                )}
                {selectedMarks.length > 0 && (
                  <button
                    onClick={() => !isLoading && setSelectedMarks([])}
                    disabled={isLoading}
                    className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 hover:text-[rgb(var(--color-text-secondary))] transition-all disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {markOptions.map((option) => {
                const optionBandConfig = getBandConfig(option.band);
                const isSelected = selectedMarks.includes(option.mark);
                const hasAnswers = option.count > 0;
                const isSuggested = option.mark === suggestedMark && !isSelected && !hasAnswers;
                const order = isSelected ? selectedMarks.indexOf(option.mark) + 1 : 0;

                return (
                  <button
                    key={option.mark}
                    onClick={() => !isLoading && toggleMark(option.mark)}
                    disabled={isLoading}
                    aria-pressed={isSelected}
                    aria-label={`${option.mark} of ${prompt.totalMarks} marks, Band ${option.band}${
                      hasAnswers ? ` (${option.count} already written)` : ''
                    }`}
                    className={`
                                    relative w-16 h-20 rounded-2xl border transition-all duration-200 ease-out
                                    flex flex-col items-center justify-center gap-1 group
                                    ${
                                      isSelected
                                        ? `${optionBandConfig.bg} ${optionBandConfig.border} border-2 light:border-2 ${optionBandConfig.glow} transform scale-110 z-10 shadow-lg`
                                        : isSuggested
                                          ? `bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-2 border-dashed ${optionBandConfig.border} opacity-90 hover:opacity-100 hover:scale-[1.05]`
                                          : `bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 opacity-70 light:opacity-100 hover:opacity-100 hover:scale-[1.05] hover:border-[rgb(var(--color-border-secondary))] light:hover:border-slate-300 light:shadow-sm`
                                    }
                                `}
                  >
                    <span
                      className={`text-2xl font-black font-mono ${isSelected ? optionBandConfig.text : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600'}`}
                    >
                      {option.mark}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider ${isSelected ? optionBandConfig.text : 'text-[rgb(var(--color-text-muted))] light:text-slate-500'}`}
                    >
                      Band {option.band}
                    </span>
                    {hasAnswers && !isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-full text-[9px] border border-[rgb(var(--color-border-secondary))] light:border-slate-300 shadow-sm text-emerald-400 light:text-emerald-600">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                    {isSelected && (
                      <div
                        className={`absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-black shadow-md bg-gradient-to-br ${optionBandConfig.gradient}`}
                        title={`Will be written ${order === 1 ? 'first' : `${order}${order === 2 ? 'nd' : order === 3 ? 'rd' : 'th'}`}`}
                      >
                        {/* The order number matters: the batch runs bottom-up so
                            each answer can be written against the ones below it. */}
                        {selectedMarks.length > 1 ? order : <Plus className="w-3 h-3" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Band coverage indicator */}
            {prompt.sampleAnswers && prompt.sampleAnswers.length > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider">
                  Coverage:
                </span>
                {Array.from({ length: maxBand }, (_, i) => i + 1).map((b) => {
                  const bConfig = getBandConfig(b);
                  const covered = coveredBands.has(b);
                  return (
                    <span
                      key={b}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        covered
                          ? `${bConfig.bg} ${bConfig.text} ${bConfig.border} border`
                          : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 border border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300'
                      }`}
                    >
                      {covered && <Check className="w-2.5 h-2.5" />}B{b}
                    </span>
                  );
                })}
                {missingBands.length > 0 && (
                  <span className="text-[10px] text-amber-400 light:text-amber-600 font-medium ml-1">
                    {missingBands.length} band{missingBands.length > 1 ? 's' : ''} missing
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            className={`
                flex-1 rounded-2xl border-2 p-6 relative overflow-hidden transition-all duration-500
                ${
                  selectedMarks.length > 0
                    ? `${activeBandConfig.bg} ${activeBandConfig.border}`
                    : 'bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 border-dashed'
                }
            `}
          >
            {selectedMarks.length > 0 ? (
              <div className="animate-fade-in relative z-10">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span
                    className={`
                                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm
                                bg-[rgb(var(--color-bg-surface))] light:bg-white border ${activeBandConfig.border} ${activeBandConfig.text}
                            `}
                  >
                    <Award className="w-3.5 h-3.5" />
                    {selectedMarks.length === 1
                      ? `Expected Result: Band ${selectedBand}`
                      : `${selectedMarks.length} answers • Band${selectedBands.length > 1 ? 's' : ''} ${selectedBands.join(', ')}`}
                  </span>
                  {selectedMarks.map((m) => {
                    const b = getBandForMark(m, prompt.totalMarks, commandTermInfo.tier);
                    const c = getBandConfig(b);
                    return (
                      <span
                        key={m}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black tracking-wider ${c.bg} ${c.text} border ${c.border}`}
                      >
                        {m}/{prompt.totalMarks}
                      </span>
                    );
                  })}
                </div>

                <p
                  className={`text-sm leading-relaxed font-medium ${activeBandConfig.text} opacity-90 max-w-xl`}
                >
                  {selectedMarks.length === 1 ? (
                    <>
                      The AI will generate a response specifically tailored to achieve{' '}
                      <strong>
                        {selectedMarks[0]}/{prompt.totalMarks} marks
                      </strong>
                      .
                      {selectedMarks[0] === 0
                        ? ' This simulates a non-attempt or a response that completely fails to address the criteria.'
                        : ` It will demonstrate the depth, terminology, and structure expected of a Band ${selectedBand} student for this '${prompt.verb}' question.`}
                    </>
                  ) : (
                    <>
                      The AI will write <strong>{selectedMarks.length} sample answers</strong>, one
                      per selected mark, from the lowest upwards. Each is written with sight of the
                      ones below it, so the set reads as a genuine ladder — more content, sharper
                      terminology and deeper thinking at every step — rather than{' '}
                      {selectedMarks.length} versions of the same answer.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <Info className="w-10 h-10 mb-3 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
                <p className="text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-500">
                  Select one or more marks above to configure the generator.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl border border-red-500/50 bg-red-500/10 light:bg-red-50 light:border-red-200 flex items-start gap-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-400 light:text-red-700">
                  Generation Failed
                </p>
                <p className="text-xs text-red-300 light:text-red-600 mt-1 opacity-90">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div
          className={`p-6 border-t-2 ${activeBandConfig.border} bg-[rgb(var(--color-bg-surface))]/80 light:bg-slate-50/80 backdrop-blur-md`}
        >
          {/* Generating again over the top of an unreviewed repeat would throw
              it away without anyone deciding to — the one thing this check
              exists to prevent. */}
          {duplicates.length > 0 && (
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-amber-400 light:text-amber-700">
              Keep or discard the repeated answer{duplicates.length > 1 ? 's' : ''} above first
            </p>
          )}
          <button
            onClick={handleGenerate}
            disabled={isLoading || selectedMarks.length === 0 || duplicates.length > 0}
            className={`
                    w-full py-4 px-6 rounded-xl font-bold text-white text-base tracking-wide
                    transition-all duration-300 flex items-center justify-center gap-3
                    shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0
                    ${
                      selectedMarks.length === 0 || duplicates.length > 0
                        ? 'bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-500 cursor-not-allowed'
                        : `bg-gradient-to-r ${activeBandConfig.gradient} shadow-[rgba(0,0,0,0.2)] hover:shadow-[rgb(var(--color-accent))/0.2]`
                    }
                `}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>
                  {progress && progress.total > 1
                    ? `Writing ${progress.done + 1} of ${progress.total} — ${progress.mark}/${prompt.totalMarks}...`
                    : 'Crafting Response...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>
                  {selectedMarks.length === 1
                    ? `Generate Band ${selectedBand} Answer`
                    : `Generate ${selectedMarks.length} Sample Answers`}
                </span>
              </>
            )}
          </button>
        </div>

        <AiBusyOverlay show={isLoading}>
          <LoadingIndicator
            task="generation"
            message={
              progress && progress.total > 1
                ? `Writing answer ${progress.done + 1} of ${progress.total}`
                : `Crafting a Band ${selectedBand} response`
            }
            messages={[
              `Analysing '${prompt.verb}' requirements...`,
              `Targeting ${progress?.mark ?? selectedMarks[0]}/${prompt.totalMarks} marks...`,
              `Calibrating for Band ${progressBand} standard...`,
              'Drafting response content...',
              'Validating against NESA criteria...',
            ]}
            duration={8}
            band={progressBand}
          />
        </AiBusyOverlay>
      </div>
    </div>,
    document.body
  );
};

export default SampleAnswerGeneratorModal;
