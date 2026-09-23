import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Prompt } from '../types';
import {
  stripHtmlTags,
  cleanMarkdown,
  getBandConfig,
  getBandHex,
  renderFormattedText,
  textContainsKeyword,
} from '../utils/renderUtils';
import { Copy, ArrowRight, ArrowLeft, X, Check, CheckCircle2, ArrowUpRight } from 'lucide-react';
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
   * What the marker told the student to do — the evaluation's `improvements`.
   *
   * The edits are the marker acting on that advice, so the two belong on one
   * screen: the list says why, the page shows where. Omit it (a plan without
   * full feedback has it redacted) and the margin opens on the edits.
   */
  markerAsked?: string[];
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

type ViewMode = 'marked' | 'clean' | 'split';

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'marked', label: 'Edits marked' },
  { id: 'clean', label: 'Clean copy' },
  { id: 'split', label: 'Side by side' },
];

/**
 * Tailwind classes for each kind of run, on the page and in the margin.
 *
 * Colour is never the only cue: added text is underlined and cut text is struck
 * through, so the diff still reads for a colour-blind student, in a greyscale
 * print, and at a glance from across a classroom.
 */
const OP_CLASS: Record<DiffSegment['op'], string> = {
  equal: '',
  insert:
    'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 rounded-lg px-0.5 underline decoration-emerald-600/60 dark:decoration-emerald-400/60 decoration-2 underline-offset-[3px]',
  delete:
    'bg-rose-500/10 text-rose-800/80 dark:text-rose-300/75 rounded-lg px-0.5 line-through decoration-rose-600/70 dark:decoration-rose-400/70 decoration-2',
};

/** One edit: the run of cut and added words between two stretches of the student's own. */
interface Edit {
  /** Index in `segments` of the edit's first run — the jump target. */
  anchor: number;
  removed: string;
  added: string;
}

/**
 * The page. `white-space: pre-wrap` keeps the student's own line breaks, and
 * each segment carries its trailing whitespace, so the marked-up text reads
 * exactly like the plain text with the edits drawn on.
 *
 * With `editNumbers` each edit opens with its number, matching the margin — so
 * "look at edit 4" means the same place in both.
 */
const DiffText: React.FC<{
  segments: DiffSegment[];
  fontSize: number;
  /** Segment index of the first run of the edit the reader is on. */
  activeAnchor?: number | null;
  /** Segment index → edit number, for the numbered view. */
  editNumbers?: Map<number, number>;
  /** Registers each edit's first run so the stepper can scroll to it. */
  registerMark?: (index: number, el: HTMLElement | null) => void;
  onSelectEdit?: (editIndex: number) => void;
  bandHex: string;
}> = ({
  segments,
  fontSize,
  activeAnchor = null,
  editNumbers,
  registerMark,
  onSelectEdit,
  bandHex,
}) => {
  // Every run of the active edit wears the ring, not only its first — a
  // replacement is a cut AND an insertion, and ringing half of it pointed at
  // the struck word while the new wording sat unmarked beside it.
  let inActive = false;
  return (
    <p
      className="font-serif leading-[1.9] whitespace-pre-wrap text-slate-800 dark:text-slate-200"
      style={{ fontSize: `${fontSize}px` }}
    >
      {segments.map((segment, index) => {
        if (segment.op === 'equal') {
          inActive = false;
          return <React.Fragment key={index}>{segment.value}</React.Fragment>;
        }
        const previous = segments[index - 1];
        const opensEdit = !previous || previous.op === 'equal';
        if (opensEdit) inActive = index === activeAnchor;
        const number = opensEdit ? editNumbers?.get(index) : undefined;
        return (
          <React.Fragment key={index}>
            {number !== undefined && (
              <button
                type="button"
                onClick={() => onSelectEdit?.(number - 1)}
                aria-label={`Edit ${number}`}
                className={`inline-flex items-center justify-center align-[0.3em] mr-0.5 min-w-[1.4em] h-[1.4em] px-1 rounded-full font-sans text-[10px] font-bold tabular-nums leading-none transition-colors ${
                  inActive
                    ? 'text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/20'
                }`}
                style={inActive ? { backgroundColor: bandHex } : undefined}
              >
                {number}
              </button>
            )}
            <mark
              ref={opensEdit && registerMark ? (el) => registerMark(index, el) : undefined}
              // The focused edit gets a ring rather than a different colour, so
              // "where am I" never competes with "what kind of edit is this".
              className={`${OP_CLASS[segment.op]} ${inActive ? 'ring-2 ring-offset-1 ring-offset-transparent' : ''}`}
              style={inActive ? ({ '--tw-ring-color': bandHex } as React.CSSProperties) : undefined}
              title={segment.op === 'insert' ? 'Added by the marker' : 'Cut by the marker'}
            >
              {segment.value}
            </mark>
          </React.Fragment>
        );
      })}
    </p>
  );
};

/** A heading in the margin: small, quiet, and the same everywhere in it. */
const RailHeading: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({
  children,
  aside,
}) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{children}</h3>
    {aside}
  </div>
);

/**
 * "Your answer → your answer, one mark higher", with the marker's edits drawn
 * on it.
 *
 * The improvement is briefed as an EDIT of the student's own response
 * (`getNextLevelTarget`, `buildUpgradeStyleRules`), so it reads as a marked-up
 * page: added words underlined in green, cut words struck through, everything
 * else theirs. Each edit is numbered, and the margin lists them under what the
 * marker asked for — the page shows where the extra mark came from, the margin
 * says why. "These eleven edits, for these three reasons" teaches something an
 * unmarked block of new prose cannot.
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
  markerAsked,
  continueLabel,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [view, setView] = useState<ViewMode>('marked');
  const [fontSize, setFontSize] = useState(17);
  const [cursor, setCursor] = useState(0);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const railRefs = useRef(new Map<number, HTMLElement>());
  const titleId = useId();
  const descId = useId();
  const bandConfig = getBandConfig(targetBand);
  const bandHex = getBandHex(targetBand);

  useEscapeKey(isOpen, onClose);

  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack, same
  // topmost-only arbitration.
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

  // Grouped so a deletion and the insertion replacing it count as one edit —
  // that is how a reader sees them, and counting them separately would make an
  // eleven-edit revision claim twenty-two.
  const anchors = useMemo(() => changeAnchors(segments), [segments]);
  const edits = useMemo<Edit[]>(
    () =>
      anchors.map((anchor) => {
        let removed = '';
        let added = '';
        for (let i = anchor; i < segments.length && segments[i].op !== 'equal'; i++) {
          if (segments[i].op === 'delete') removed += segments[i].value;
          else added += segments[i].value;
        }
        return { anchor, removed: removed.trim(), added: added.trim() };
      }),
    [anchors, segments]
  );
  const editNumbers = useMemo(
    () => new Map(anchors.map((anchor, i) => [anchor, i + 1] as const)),
    [anchors]
  );
  /**
   * Each edit's first ADDED run, as an index into the revised column of the
   * side-by-side view. That column holds only the equal and inserted runs, so
   * an index into the full diff points at the wrong words there — the old
   * stepper ringed text several runs away from the edit it named. A pure cut
   * has nothing on the revised side, so it maps to -1 and is not ringed.
   */
  const revisedAnchors = useMemo(() => {
    const toRevised = new Map<number, number>();
    let r = 0;
    segments.forEach((s, j) => {
      if (s.op !== 'delete') toRevised.set(j, r++);
    });
    return anchors.map((anchor) => {
      for (let j = anchor; j < segments.length && segments[j].op !== 'equal'; j++) {
        if (segments[j].op === 'insert') return toRevised.get(j) ?? -1;
      }
      return -1;
    });
  }, [anchors, segments]);

  // Which syllabus terms the revision brought in: it names what the extra mark
  // was for in the question's own vocabulary.
  const newKeywords = useMemo(() => {
    const added = edits.map((e) => e.added).join(' ');
    if (!added.trim()) return [];
    return (originalPrompt.keywords || []).filter(
      (kw) => kw && textContainsKeyword(added, kw) && !textContainsKeyword(originalText, kw)
    );
  }, [edits, originalPrompt.keywords, originalText]);

  const asked = useMemo(
    () => (markerAsked || []).map((s) => s.trim()).filter(Boolean),
    [markerAsked]
  );

  useEffect(() => {
    // A fresh comparison starts at the first edit, not wherever the last one
    // left the cursor.
    setCursor(0);
    markRefs.current.clear();
  }, [originalText, revisedText, isOpen]);

  /**
   * Put the reader on an edit, in the page and in the margin. Moving the
   * cursor is the point; scrolling to it is a nicety, guarded so an
   * environment without `scrollIntoView` cannot turn a click into a thrown
   * error, and so the reduced-motion setting is honoured.
   */
  const goTo = useCallback(
    (index: number) => {
      if (edits.length === 0) return;
      const next = (index + edits.length) % edits.length;
      setCursor(next);
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
      const mark = markRefs.current.get(
        view === 'split' ? revisedAnchors[next] : edits[next].anchor
      );
      if (typeof mark?.scrollIntoView === 'function') {
        mark.scrollIntoView({ block: 'center', behavior });
      }
      const item = railRefs.current.get(next);
      if (typeof item?.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest', behavior });
      }
    },
    [edits, view, revisedAnchors]
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
  const unchanged = hasOriginal && edits.length === 0;
  const gained =
    !unchanged && originalMark !== undefined && targetMark !== undefined
      ? targetMark - originalMark
      : 0;
  const activeAnchor = view === 'clean' ? null : (edits[cursor]?.anchor ?? null);
  const comparing = hasOriginal && !unchanged;

  const secondaryButton =
    't-label flex-1 sm:flex-none py-2.5 px-5 rounded-xl text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 transition-colors flex items-center justify-center gap-2';
  const primaryButton = `t-label flex-1 sm:flex-none py-2.5 px-6 rounded-xl text-white font-semibold ${bandConfig.solidBg} hover:brightness-110 active:brightness-95 transition-[filter] flex items-center justify-center gap-2`;
  const toolGroup =
    'flex items-center gap-0.5 p-0.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20';
  const toolButton =
    'p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-40';

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-improvement p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-lg w-full max-w-6xl border border-slate-200 dark:border-white/10 animate-fade-in-up overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The band this revision reaches, as one rule across the top — the
            only saturated colour on the frame, so the edits keep the page's
            attention. It replaces a full-width gradient header with a grid
            texture, which outshouted the words it was introducing. */}
        <div className="h-1 shrink-0" style={{ backgroundColor: bandHex }} aria-hidden="true" />

        <header className="px-5 sm:px-8 pt-5 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight"
            >
              {/* The gain is usually one mark, but not always — a student already
                  in the question's top band is lifted to full marks. */}
              {unchanged
                ? 'Your answer, unchanged'
                : gained === 1
                  ? 'Your answer, one mark higher'
                  : gained > 1
                    ? `Your answer, ${gained} marks higher`
                    : 'Your answer, improved'}
            </h2>
            <p
              id={descId}
              className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl"
            >
              {unchanged
                ? 'The marker left it as you wrote it.'
                : hasOriginal
                  ? 'The marker’s edits, drawn on your own writing.'
                  : 'The marker’s version of this answer.'}
            </p>
          </div>

          <div className="flex items-start gap-3 sm:gap-5 shrink-0">
            {/* The mark it moved, said once and large enough to be the point.
                The chip it replaces put "3 → 4/4" at 12px inside a gradient. */}
            {!unchanged && targetMark !== undefined && (
              <div className="text-right">
                <p className="flex items-baseline justify-end gap-1.5 tabular-nums leading-none">
                  {originalMark !== undefined && (
                    <>
                      <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">
                        {originalMark}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400" aria-label="to">
                        →
                      </span>
                    </>
                  )}
                  <span className={`text-3xl font-black ${bandConfig.text}`}>{targetMark}</span>
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    <span aria-hidden="true">/</span>
                    <span className="sr-only"> out of </span>
                    {originalPrompt.totalMarks}
                  </span>
                </p>
                <p className="t-label mt-1.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Band {targetBand}
                  {gained > 0 && ` · +${gained} mark${gained === 1 ? '' : 's'}`}
                </p>
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 shrink-0 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="px-5 sm:px-8 py-2.5 border-y border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
          {comparing && (
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-200/70 dark:bg-black/25"
              role="group"
              aria-label="How to show the revision"
            >
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  aria-pressed={view === v.id}
                  className={`t-label px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    view === v.id
                      ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {/* How much of the answer is still the student's. Retention is the
              reassurance a student needs before they read on, and the figure
              that shows whether the rewrite actually followed its brief. */}
          {comparing && (
            <p className="t-label text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {retentionPct}%
              </span>{' '}
              <span>of your words kept</span>
              <span className="hidden md:inline">
                {' '}
                · {stats.originalWords} → {stats.revisedWords} words
              </span>
            </p>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {/* Stepping through the edits. On a 300-word revision the marks
                are scattered through several screens, and "find the next one"
                is not a job to leave to the reader. */}
            {edits.length > 1 && view !== 'clean' && (
              <div className={toolGroup}>
                <button
                  onClick={() => goTo(cursor - 1)}
                  aria-label="Previous change"
                  className={toolButton}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                  {cursor + 1}/{edits.length}
                </span>
                <button
                  onClick={() => goTo(cursor + 1)}
                  aria-label="Next change"
                  className={toolButton}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className={toolGroup}>
              <button
                onClick={() => setFontSize((s) => Math.max(13, s - 2))}
                disabled={fontSize <= 13}
                aria-label="Decrease text size"
                className={`${toolButton} px-2 py-1 text-[11px] font-bold`}
              >
                A−
              </button>
              <button
                onClick={() => setFontSize((s) => Math.min(27, s + 2))}
                disabled={fontSize >= 27}
                aria-label="Increase text size"
                className={`${toolButton} px-2 py-1 text-[11px] font-bold`}
              >
                A+
              </button>
            </div>
          </div>
        </div>

        {/* The page and its margin. From `lg` each scrolls on its own, so the
            list of edits stays beside the text it points into. Below `lg` the
            margin follows the page in one scroll. */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${
            comparing ? 'lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_21rem]' : ''
          }`}
        >
          <div className={comparing ? 'lg:overflow-y-auto lg:min-h-0 custom-scrollbar' : ''}>
            {/* An identical rewrite is a real outcome, not an empty screen: the
                marker had nothing to add, and saying so plainly is worth more
                than a page of unmarked text to compare by eye. */}
            {unchanged && (
              <div className="mx-5 sm:mx-8 mt-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-500/25 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    No changes — this is already your answer
                  </p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
                    The marker did not change anything, so there is nothing here to copy across. Try
                    marking a fuller draft, or regenerate for a second opinion.
                  </p>
                </div>
              </div>
            )}

            {comparing && view === 'split' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-white/10">
                {(
                  [
                    ['Your original', stats.originalWords, originalSide, false],
                    ['Improved', stats.revisedWords, revisedSide, true],
                  ] as const
                ).map(([label, words, side, isRevised]) => (
                  <div key={label}>
                    <div className="sticky top-0 px-5 sm:px-6 py-2.5 bg-slate-50/95 dark:bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm border-b border-slate-200 dark:border-white/10 flex items-center gap-2 z-10">
                      {isRevised && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: bandHex }}
                          aria-hidden="true"
                        />
                      )}
                      <h3 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                        {label}
                      </h3>
                      <span className="ml-auto t-label text-slate-500 dark:text-slate-400 tabular-nums">
                        {words} words
                      </span>
                    </div>
                    <div className="px-5 sm:px-6 py-6">
                      {/* The revised column owns the jump targets: it is the
                          side a student is being asked to write. */}
                      <DiffText
                        segments={side}
                        fontSize={fontSize}
                        bandHex={bandHex}
                        activeAnchor={isRevised ? (revisedAnchors[cursor] ?? null) : null}
                        registerMark={isRevised ? registerMark : undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* One reading column, bounded to a line people read at (about 70
                 characters at the default size) rather than to the modal. The
                 bound wraps the legend and the prose together, so the two
                 narrow as one. */
              <div className="px-5 sm:px-10 py-7 max-w-3xl mx-auto">
                {comparing && view === 'marked' && (
                  <p className="t-label mb-5 text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={OP_CLASS.insert}>added</span>
                    <span className={OP_CLASS.delete}>cut</span>
                    <span>everything unmarked is your own writing</span>
                  </p>
                )}
                {comparing && view === 'marked' ? (
                  <DiffText
                    segments={segments}
                    fontSize={fontSize}
                    activeAnchor={activeAnchor}
                    editNumbers={editNumbers}
                    registerMark={registerMark}
                    onSelectEdit={goTo}
                    bandHex={bandHex}
                  />
                ) : (
                  <p
                    className="font-serif leading-[1.9] whitespace-pre-wrap text-slate-800 dark:text-slate-200"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {renderFormattedText(revisedText, originalPrompt.keywords)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The margin: why first — the marker's own advice — then where,
              edit by edit, then the vocabulary the edits brought in. */}
          {comparing && (
            <aside
              aria-label="What changed and why"
              className="border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] lg:overflow-y-auto lg:min-h-0 custom-scrollbar px-5 sm:px-6 py-6 flex flex-col gap-7"
            >
              {asked.length > 0 && (
                <section>
                  <RailHeading>What the marker asked for</RailHeading>
                  <ul className="space-y-2.5">
                    {asked.map((item, i) => (
                      <li
                        key={i}
                        className="flex gap-2.5 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300"
                      >
                        <ArrowUpRight
                          className={`w-3.5 h-3.5 mt-[3px] shrink-0 ${bandConfig.text}`}
                          aria-hidden="true"
                        />
                        <span>{renderFormattedText(item, originalPrompt.keywords)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <RailHeading
                  aside={
                    <span className="t-label text-slate-500 dark:text-slate-400 tabular-nums">
                      {edits.length}
                    </span>
                  }
                >
                  The edits
                </RailHeading>
                <ol className="flex flex-col gap-1">
                  {edits.map((edit, i) => {
                    const active = i === cursor && view !== 'clean';
                    return (
                      <li
                        key={edit.anchor}
                        ref={(el) => {
                          if (el) railRefs.current.set(i, el);
                          else railRefs.current.delete(i);
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (view === 'clean') setView('marked');
                            goTo(i);
                          }}
                          aria-current={active ? 'true' : undefined}
                          className={`w-full text-left flex gap-3 p-2.5 rounded-xl border transition-colors ${
                            active
                              ? 'bg-white dark:bg-white/[0.06] border-slate-300 dark:border-white/15 shadow-sm'
                              : 'border-transparent hover:bg-white/70 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span
                            className={`mt-0.5 shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1 rounded-full text-[11px] font-bold tabular-nums ${
                              active
                                ? 'text-white'
                                : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                            }`}
                            style={active ? { backgroundColor: bandHex } : undefined}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 font-serif text-[14px] leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-4">
                            {edit.removed && (
                              <span className={OP_CLASS.delete}>{edit.removed}</span>
                            )}
                            {edit.removed && edit.added && (
                              <span className="font-sans text-slate-400"> → </span>
                            )}
                            {edit.added && <span className={OP_CLASS.insert}>{edit.added}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {newKeywords.length > 0 && (
                <section>
                  <RailHeading>Syllabus terms the revision added</RailHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {newKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          )}
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            {continueLabel
              ? // Standing in front of the marking summary, the useful thing to
                // say is what is behind it — not where the samples were filed.
                'Your mark, the criteria breakdown and the marker’s commentary come next.'
              : unchanged
                ? 'Your answer is saved to this question’s sample answers.'
                : 'Both versions are saved to this question’s sample answers.'}
          </p>

          {/* On a phone the way forward takes its own full-width row above the
              other two; three abreast, "See my full feedback" wrapped to three
              lines in a button 110px wide. */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2.5 w-full sm:w-auto">
            <button onClick={handleCopy} className={secondaryButton}>
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
                title="Put this version in your draft"
                className={continueLabel ? secondaryButton : `${primaryButton} col-span-1`}
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
                className={`${primaryButton} col-span-2 order-first sm:order-none`}
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
