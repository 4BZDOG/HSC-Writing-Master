import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Prompt } from '../types';
import {
  stripHtmlTags,
  cleanMarkdown,
  getBandConfig,
  textContainsKeyword,
} from '../utils/renderUtils';
import {
  Sparkles,
  Copy,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  CheckCircle2,
  User as UserIcon,
  Columns2,
  AlignLeft,
  Plus,
  Minus,
  Hash,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  changeAnchors,
  diffWords,
  segmentsForSide,
  summariseDiff,
  type DiffSegment,
} from '../utils/textDiff';

interface ImprovementReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  improvedAnswer: string;
  originalAnswer?: string | null;
  originalPrompt: Prompt;
  /** The band the improved answer demonstrates. */
  targetBand: number;
  /** What the improved answer is worth, e.g. 5 of 8. */
  targetMark?: number;
  /** What the student's own answer scored, for the "+1 mark" framing. */
  originalMark?: number;
  onApply: (text: string) => void;
  /**
   * Label for a "carry on" action in the footer, e.g. "See my full feedback".
   *
   * Set when this comparison is standing in front of something rather than
   * having been opened from it — after marking, the diff comes first and the
   * feedback summary is behind it. Without a labelled way forward the only exit
   * is an X in the corner, which reads as "dismiss", not "continue". Omit it
   * and the footer keeps its Copy / Use-this-version pair.
   */
  continueLabel?: string;
}

type ViewMode = 'unified' | 'split';

/**
 * Tailwind classes for each kind of run, in both views.
 *
 * Colour is never the only cue: added text is underlined and cut text is struck
 * through, so the diff still reads for a colour-blind student, in a greyscale
 * print of the PDF, and at a glance from across a classroom.
 */
const OP_CLASS: Record<DiffSegment['op'], string> = {
  equal: '',
  insert:
    'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 rounded px-0.5 underline decoration-emerald-500/60 decoration-2 underline-offset-2',
  delete:
    'bg-rose-500/20 text-rose-900/80 dark:text-rose-200/75 rounded px-0.5 line-through decoration-rose-500/70 decoration-2',
};

/**
 * Renders a run of diff segments as flowing prose. `white-space: pre-wrap` on
 * the container keeps the author's own line breaks, and each segment carries
 * its trailing whitespace, so the marked-up text reads exactly like the plain
 * text with colour added.
 */
const DiffText: React.FC<{
  segments: DiffSegment[];
  fontSize: number;
  /** Segment index that "jump to change" is currently pointing at. */
  activeIndex?: number | null;
  /** Registers each changed run so the jump can scroll it into view. */
  registerMark?: (index: number, el: HTMLElement | null) => void;
}> = ({ segments, fontSize, activeIndex = null, registerMark }) => (
  <p
    className="font-serif leading-loose whitespace-pre-wrap text-slate-800 dark:text-slate-200"
    style={{ fontSize: `${fontSize}px` }}
  >
    {segments.map((segment, index) =>
      segment.op === 'equal' ? (
        <React.Fragment key={index}>{segment.value}</React.Fragment>
      ) : (
        <mark
          key={index}
          ref={registerMark ? (el) => registerMark(index, el) : undefined}
          className={`${OP_CLASS[segment.op]} ${
            // The focused change gets a ring rather than a different colour, so
            // "where am I" never competes with "what kind of change is this".
            index === activeIndex
              ? 'ring-2 ring-offset-1 ring-indigo-400 ring-offset-transparent'
              : ''
          }`}
          title={segment.op === 'insert' ? 'Added by the marker' : 'Cut by the marker'}
        >
          {segment.value}
        </mark>
      )
    )}
  </p>
);

const StatChip: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'add' | 'cut' | 'neutral';
}> = ({ icon: Icon, label, value, tone = 'neutral' }) => {
  const tones = {
    add: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    cut: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
    neutral:
      'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/25 dark:border-white/10',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      <Icon className="w-3 h-3" />
      <span className="tabular-nums">{value}</span>
      <span className="opacity-70 font-medium normal-case tracking-normal">{label}</span>
    </span>
  );
};

/**
 * "Your answer → your improved answer", with the changes marked.
 *
 * The improvement is briefed as an EDIT of the student's own response
 * (`getNextLevelTarget`, `buildUpgradeStyleRules`), so the only reading that
 * makes sense is a diff: added words in green, cut words struck through in red,
 * everything else theirs. A student who sees "you kept 84% of your own words
 * and these eleven earned the extra mark" learns something an unmarked block of
 * new prose cannot teach — and the retention figure is also how they can tell
 * at a glance whether the AI actually followed the brief.
 */
const ImprovementReviewModal: React.FC<ImprovementReviewModalProps> = ({
  isOpen,
  onClose,
  improvedAnswer,
  originalAnswer,
  originalPrompt,
  targetBand,
  targetMark,
  originalMark,
  onApply,
  continueLabel,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [view, setView] = useState<ViewMode>('unified');
  const [fontSize, setFontSize] = useState(15);
  const [changeCursor, setChangeCursor] = useState(0);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const titleId = useId();
  const bandConfig = getBandConfig(targetBand);

  useEscapeKey(isOpen, onClose);

  // Tab stays inside the dialog while it is open, and focus returns to

  // whatever opened it on close. Partners `useEscapeKey` — same stack,

  // same topmost-only arbitration.

  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  // Plain text on both sides: the diff is over what the student wrote and what
  // they would write, not over whatever markup the model decorated it with.
  // `cleanMarkdown` as well as tag stripping, because a model that returns
  // "**cache hit ratio**" would otherwise put the asterisks inside the word and
  // report a term the student already used as an addition.
  const originalText = useMemo(
    () => cleanMarkdown(stripHtmlTags(originalAnswer || '')).trim(),
    [originalAnswer]
  );
  const revisedText = useMemo(
    () => cleanMarkdown(stripHtmlTags(improvedAnswer || '')).trim(),
    [improvedAnswer]
  );

  const segments = useMemo(() => diffWords(originalText, revisedText), [originalText, revisedText]);
  const stats = useMemo(() => summariseDiff(segments), [segments]);
  const originalSide = useMemo(() => segmentsForSide(segments, 'original'), [segments]);
  const revisedSide = useMemo(() => segmentsForSide(segments, 'revised'), [segments]);

  // Which syllabus terms the revision brought in. This is the single most
  // actionable thing on the screen: it names what the extra mark was for.
  const newKeywords = useMemo(() => {
    const added = segments
      .filter((s) => s.op === 'insert')
      .map((s) => s.value)
      .join(' ');
    if (!added.trim()) return [];
    return (originalPrompt.keywords || []).filter(
      (kw) => kw && textContainsKeyword(added, kw) && !textContainsKeyword(originalText, kw)
    );
  }, [segments, originalPrompt.keywords, originalText]);

  // Where the "next change" control is pointing, and how to move it. Grouped
  // so a deletion and the insertion replacing it count as one change — that is
  // how a reader sees them, and counting them separately would make an eleven-
  // change revision claim twenty-two.
  const anchors = useMemo(() => changeAnchors(segments), [segments]);

  useEffect(() => {
    // A fresh comparison starts at the first change, not wherever the last one
    // left the cursor.
    setChangeCursor(0);
    markRefs.current.clear();
  }, [originalText, revisedText, view, isOpen]);

  const jumpToChange = useCallback(
    (delta: number) => {
      if (anchors.length === 0) return;
      const next = (changeCursor + delta + anchors.length) % anchors.length;
      setChangeCursor(next);

      // Moving the cursor is the point; scrolling to it is a nicety. Guarded so
      // an environment without `scrollIntoView` cannot turn the button into a
      // thrown error, and so the app's reduced-motion setting is honoured.
      const target = markRefs.current.get(anchors[next]);
      if (typeof target?.scrollIntoView !== 'function') return;
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    },
    [anchors, changeCursor]
  );

  const registerMark = useCallback((index: number, el: HTMLElement | null) => {
    if (el) markRefs.current.set(index, el);
    else markRefs.current.delete(index);
  }, []);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(revisedText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApply = () => {
    onApply(revisedText);
    onClose();
  };

  const hasOriginal = !!originalText.trim();
  const retentionPct = Math.round(stats.retention * 100);
  // A rewrite identical to the student's answer is worth exactly what theirs
  // was, so the header must not go on claiming the extra mark, and there is
  // nothing to copy across.
  const unchanged = hasOriginal && anchors.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1300] p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-6xl border-2 ${bandConfig.border} animate-fade-in-up overflow-hidden flex flex-col max-h-[92vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-5 bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0`}
        >
          <div
            className="absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10 gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 id={titleId} className="text-xl font-bold text-white tracking-tight truncate">
                  {unchanged ? 'Your answer, unchanged' : 'Your answer, improved'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-white/90 font-medium text-xs mt-0.5">
                  {unchanged && <span>The marker left it as you wrote it</span>}
                  {!unchanged && targetMark !== undefined && (
                    <span className="bg-white/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      {originalMark !== undefined ? `${originalMark} → ` : ''}
                      {targetMark}/{originalPrompt.totalMarks}
                    </span>
                  )}
                  {!unchanged && <span>Band {targetBand} standard</span>}
                  {!unchanged &&
                    originalMark !== undefined &&
                    targetMark !== undefined &&
                    targetMark > originalMark && (
                      <>
                        <span className="opacity-60">•</span>
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />+{targetMark - originalMark} mark
                        </span>
                      </>
                    )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 shrink-0 rounded-lg bg-white/20 hover:bg-white/30 transition-all flex items-center justify-center backdrop-blur-sm"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Summary + controls */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] flex flex-wrap items-center gap-x-4 gap-y-2 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatChip icon={Plus} label="added" value={`${stats.added}`} tone="add" />
            <StatChip icon={Minus} label="cut" value={`${stats.removed}`} tone="cut" />
            {hasOriginal && (
              <StatChip
                icon={Hash}
                label="of your words kept"
                value={`${retentionPct}%`}
                tone="neutral"
              />
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Stepping through the changes. On a 300-word revision the coloured
                runs are scattered through several screens, and "find the next
                one" is not a job to leave to the reader. */}
            {anchors.length > 1 && (
              <div className="flex items-center gap-0.5 bg-white dark:bg-black/20 p-0.5 rounded-lg border border-slate-200 dark:border-white/10">
                <button
                  onClick={() => jumpToChange(-1)}
                  aria-label="Previous change"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 text-[10px] font-bold text-slate-500 dark:text-slate-300 tabular-nums whitespace-nowrap">
                  {changeCursor + 1}/{anchors.length}
                </span>
                <button
                  onClick={() => jumpToChange(1)}
                  aria-label="Next change"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-0.5 bg-white dark:bg-black/20 p-0.5 rounded-lg border border-slate-200 dark:border-white/10">
              <button
                onClick={() => setFontSize((s) => Math.max(12, s - 2))}
                disabled={fontSize <= 12}
                aria-label="Decrease text size"
                className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
              >
                A−
              </button>
              <button
                onClick={() => setFontSize((s) => Math.min(28, s + 2))}
                disabled={fontSize >= 28}
                aria-label="Increase text size"
                className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
              >
                A+
              </button>
            </div>
            {hasOriginal && (
              <div
                className="flex items-center gap-0.5 bg-white dark:bg-black/20 p-0.5 rounded-lg border border-slate-200 dark:border-white/10"
                role="group"
                aria-label="Comparison view"
              >
                <button
                  onClick={() => setView('unified')}
                  aria-pressed={view === 'unified'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    view === 'unified'
                      ? 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <AlignLeft className="w-3 h-3" /> Marked up
                </button>
                <button
                  onClick={() => setView('split')}
                  aria-pressed={view === 'split'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    view === 'split'
                      ? 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Columns2 className="w-3 h-3" /> Side by side
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {/* An identical rewrite is a real outcome, not an empty screen: the
              marker had nothing to add, and saying so plainly is worth more to
              the student than a page of unmarked text they have to compare by
              eye to discover the same thing. */}
          {hasOriginal && anchors.length === 0 && (
            <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-500/25 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  No changes — this is already your answer
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
                  The marker did not change anything, so there is nothing here to copy across. Try
                  marking a fuller draft, or regenerate for a second opinion.
                </p>
              </div>
            </div>
          )}

          {!hasOriginal || view === 'unified' ? (
            <div className="p-6 sm:p-8">
              {hasOriginal && anchors.length > 0 && (
                <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50" />
                    added
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500/50" />
                    cut
                  </span>
                  <span className="normal-case tracking-normal font-medium opacity-70">
                    everything unmarked is your own writing
                  </span>
                </p>
              )}
              <DiffText
                segments={hasOriginal ? segments : revisedSide}
                fontSize={fontSize}
                activeIndex={anchors[changeCursor] ?? null}
                registerMark={registerMark}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-white/10">
              <div>
                <div className="sticky top-0 px-6 py-2.5 bg-slate-100/90 dark:bg-white/[0.04] backdrop-blur-sm border-b border-slate-200 dark:border-white/10 flex items-center gap-2 z-10">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                    Your original
                  </h3>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 tabular-nums">
                    {stats.originalWords} words
                  </span>
                </div>
                <div className="p-6 opacity-90">
                  <DiffText segments={originalSide} fontSize={fontSize} />
                </div>
              </div>
              <div>
                <div
                  className={`sticky top-0 px-6 py-2.5 ${bandConfig.bg} backdrop-blur-sm border-b border-slate-200 dark:border-white/10 flex items-center gap-2 z-10`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${bandConfig.text}`} />
                  <h3
                    className={`text-[10px] font-black uppercase tracking-widest ${bandConfig.text}`}
                  >
                    Improved
                  </h3>
                  <span className="ml-auto text-[10px] font-bold text-slate-400 tabular-nums">
                    {stats.revisedWords} words
                  </span>
                </div>
                <div className="p-6">
                  {/* The revised column owns the jump targets in split view:
                      it is the side a student is being asked to write. */}
                  <DiffText
                    segments={revisedSide}
                    fontSize={fontSize}
                    activeIndex={anchors[changeCursor] ?? null}
                    registerMark={registerMark}
                  />
                </div>
              </div>
            </div>
          )}

          {newKeywords.length > 0 && (
            <div className="mx-6 sm:mx-8 mb-8 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2.5 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Syllabus terms the revision added
              </p>
              <div className="flex flex-wrap gap-2">
                {newKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-black/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-200 text-[11px] font-bold"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between items-center gap-3 flex-shrink-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            {continueLabel
              ? // Standing in front of the marking summary, the useful thing to
                // say is what is behind it \u2014 not where the samples were filed.
                'Your mark, the criteria breakdown and the marker\u2019s commentary come next.'
              : unchanged
                ? 'Your answer is saved to this question\u2019s sample answers.'
                : "Both versions are saved to this question's sample answers."}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-none py-2.5 px-5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-center gap-2"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {isCopied ? 'Copied' : 'Copy'}
            </button>

            {/* Nothing to apply when the two texts are the same — a button
                that silently does nothing is worse than no button. */}
            {!unchanged && (
              <button
                onClick={handleApply}
                className={
                  continueLabel
                    ? // The way forward is the filled button when there is one,
                      // so this steps back to the outline treatment rather than
                      // competing with it.
                      'flex-1 sm:flex-none py-2.5 px-5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-center gap-2'
                    : `flex-1 sm:flex-none py-2.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg bg-gradient-to-r ${bandConfig.gradient} hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2`
                }
              >
                <span>Use this version</span>
                {!continueLabel && <ArrowRight className="w-4 h-4" />}
              </button>
            )}

            {/* Where the flow goes next — see `continueLabel`. Focused on open
                so Enter carries on, and so a keyboard user is not left hunting
                for the exit. */}
            {continueLabel && (
              <button
                onClick={onClose}
                autoFocus
                className={`flex-1 sm:flex-none py-2.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg bg-gradient-to-r ${bandConfig.gradient} hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2`}
              >
                <span>{continueLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImprovementReviewModal;
