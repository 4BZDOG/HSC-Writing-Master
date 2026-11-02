import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Prompt, PromptVerb } from '../types';
import {
  stripHtmlTags,
  cleanMarkdown,
  getBandConfig,
  getBandRgb,
  KEYWORD_CHIP_CLASS,
  renderFormattedText,
  renderHighlightedText,
  textContainsKeyword,
} from '../utils/renderUtils';
import {
  Copy,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  CheckCircle2,
  ArrowUpRight,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  ChevronsRight,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  diffWords,
  groupEdits,
  segmentsForSide,
  summariseDiff,
  type DiffEdit,
  type DiffSegment,
} from '../utils/textDiff';
import { wordCountsLine, wordsKeptParts } from '../utils/diffSummary';

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
   * and the footer offers "Back to feedback" beside "Use this version", because
   * this comparison was opened from the summary and the way out is back to it.
   */
  continueLabel?: string;
  /**
   * What the marker says it changed and why, from the rewrite's `keyChanges`.
   * Shown as a short list above the edits, so the reader has the reason before
   * the list of where. Omit it and the margin opens on the edits.
   */
  keyChanges?: string[];
}

type ViewMode = 'marked' | 'clean' | 'split';

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'marked', label: 'Edits marked' },
  { id: 'clean', label: 'Clean copy' },
  { id: 'split', label: 'Side by side' },
];

/** How long each edit stays on the page during the replay, its animation included. */
const REPLAY_STEP_MS = 1600;
/** The mark's count-up at the end of the replay. */
const COUNT_UP_MS = 900;

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
  // Cut text is struck through, and still has to be read to be compared, so it
  // takes the full tone rather than an alpha that drops it under 4.5:1.
  delete:
    'bg-rose-500/10 text-rose-800 dark:text-rose-300 rounded-lg px-0.5 line-through decoration-rose-600/70 dark:decoration-rose-400/70 decoration-2',
};

/**
 * The focused edit's ring. It is drawn in the band (`--band-rgb`, set on the
 * frame), and it pulses once when it arrives, so the eye is drawn to the edit
 * that the margin and the page now share.
 */
const RING_CLASS =
  'ring-2 ring-offset-1 ring-offset-transparent animate-edit-focus motion-reduce:animate-none';

/** A syllabus term the revision has not reached yet, in the replay. */
const UNLIT_TERM_CLASS =
  'inline-block px-2 py-0.5 rounded-lg text-xs font-semibold border border-dashed border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-400 transition-colors duration-500 motion-reduce:transition-none';

/**
 * A syllabus term the revision has brought in, lit once its edit is on the page.
 * It is the app's term style exactly, so it reads as the same chip everywhere.
 */
const LIT_TERM_CLASS = KEYWORD_CHIP_CLASS;

/**
 * Splits a run into its words and the whitespace that follows them, so the
 * whitespace can be drawn outside the run's mark.
 */
const splitTrailingWhitespace = (value: string): [string, string] => {
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  return [value.slice(0, value.length - trailing.length), trailing];
};

/** The reader's own setting, read where a script needs it. Safe where `matchMedia` is missing. */
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** The first ten words of a run, for the live announcement. A long edit is not read out whole. */
const briefly = (text: string, count = 10): string => {
  const words = text.trim().split(/\s+/);
  return words.length > count ? `${words.slice(0, count).join(' ')}…` : words.join(' ');
};

/** "Cut “slow”. Added “quick”." — what one edit did, in words a listener can follow. */
const describeEdit = (edit: DiffEdit): string =>
  [
    edit.removed && `Cut “${briefly(edit.removed)}”.`,
    edit.added && `Added “${briefly(edit.added)}”.`,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * The page. `white-space: pre-wrap` keeps the student's own line breaks, and
 * each segment carries its trailing whitespace, so the marked-up text reads
 * exactly like the plain text with the edits drawn on.
 *
 * With `editNumbers` each edit opens with its number, matching the margin — so
 * "look at edit 4" means the same place in both.
 *
 * With `replayStep` set the page is part-way through the replay: an edit the
 * replay has not reached shows the student's own words, and one it has reached
 * wears its marks. The edit just reached animates in; the rest is the marked view.
 */
const DiffText: React.FC<{
  segments: DiffSegment[];
  fontSize: number;
  /** Segment range of the edit the reader is on: its changed runs wear the ring. */
  activeRange?: { start: number; end: number } | null;
  /** Segment index → edit number, for the numbered view. */
  editNumbers?: Map<number, number>;
  /** Segment index → edit index, or -1 for a kept run. Lets a run name its edit. */
  editOf?: number[];
  /** Replay: how many edits are on the page. Null when the page is not replaying. */
  replayStep?: number | null;
  /** Registers each edit's first run so the stepper can scroll to it. */
  registerMark?: (index: number, el: HTMLElement | null) => void;
  onSelectEdit?: (editIndex: number) => void;
  /** Reports the edit under the pointer or the focus, or null when it leaves. */
  onPreview?: (editIndex: number | null) => void;
  /** The question's terms and command verb, painted on the text as everywhere else. */
  keywords?: string[];
  verb?: PromptVerb;
  /**
   * Which column this is. The combined view shows both sides, so a cut run's
   * paragraph break is collapsed there; the original column shows only the
   * student's own text, where that break is real and has to stay.
   */
  side?: 'both' | 'original' | 'revised';
}> = ({
  segments,
  fontSize,
  activeRange = null,
  editNumbers,
  editOf,
  replayStep = null,
  registerMark,
  onSelectEdit,
  onPreview,
  keywords,
  verb,
  side = 'both',
}) => {
  return (
    <p
      className="font-serif leading-[1.9] whitespace-pre-wrap text-slate-800 dark:text-slate-200"
      style={{ fontSize: `${fontSize}px` }}
    >
      {segments.map((segment, index) => {
        // Every run is highlighted, including the ones the marker added or cut:
        // a syllabus term the revision brought in is the thing the reader is
        // looking for, so it has to show inside the edit as well as beside it.
        if (segment.op === 'equal') {
          return (
            <React.Fragment key={index}>
              {renderHighlightedText(segment.value, keywords, verb)}
            </React.Fragment>
          );
        }
        const previous = segments[index - 1];
        const opensEdit = !previous || previous.op === 'equal';
        const editIndex = editOf?.[index] ?? -1;
        // Replay: an edit the replay has not reached is still the student's own
        // wording, so its cut runs are plain and its added runs are not drawn.
        const pending = replayStep !== null && editIndex >= replayStep;
        // The edit the replay has just reached. Its runs animate in once.
        const fresh = replayStep !== null && editIndex === replayStep - 1;
        // Every changed run of the active edit wears the ring, not only its first:
        // a replacement is a cut AND an insertion, and ringing half of it pointed
        // at the struck word while the new wording sat unmarked beside it. Kept
        // words bridged between two changes stay plain.
        const inActive =
          activeRange !== null && index >= activeRange.start && index <= activeRange.end;
        const number = opensEdit ? editNumbers?.get(index) : undefined;
        const hover = {
          onMouseEnter: () => onPreview?.(editIndex),
          onMouseLeave: () => onPreview?.(null),
        };
        // The edit's number. Its hit area is a 44px square centred on the small
        // pill, drawn by a pseudo-element: absolute, so the line's layout is the
        // same with or without it.
        const numberButton =
          number === undefined ? null : (
            <button
              type="button"
              onClick={() => onSelectEdit?.(number - 1)}
              onFocus={() => onPreview?.(editIndex)}
              onBlur={() => onPreview?.(null)}
              aria-label={`Edit ${number}`}
              // The active marker is the band's solid fill with its own ink
              // (`band-solid`), not white on the band: white failed 4.5:1 on
              // the purple and the yellow-green hues.
              {...hover}
              className={`relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] inline-flex items-center justify-center align-[0.3em] mr-0.5 min-w-[1.4em] h-[1.4em] px-1 rounded-full font-sans text-[10px] font-bold tabular-nums leading-none transition-colors ${
                inActive
                  ? 'band-solid'
                  : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300 can-hover:hover:bg-slate-300 dark:can-hover:hover:bg-white/20'
              }`}
            >
              {number}
            </button>
          );
        // Not yet on the page: only its number, so the reader can see where the
        // next edit will land.
        if (pending && segment.op === 'insert') {
          return <React.Fragment key={index}>{numberButton}</React.Fragment>;
        }
        const ringStyle = inActive
          ? ({ '--tw-ring-color': 'rgb(var(--band-rgb))' } as React.CSSProperties)
          : undefined;
        const ringClass = inActive ? RING_CLASS : '';
        if (pending) {
          // The student's own words, as they were. Plain, with its paragraph
          // breaks, and the jump target for the edit's first run.
          return (
            <React.Fragment key={index}>
              {numberButton}
              <span
                ref={opensEdit && registerMark ? (el) => registerMark(index, el) : undefined}
                className={`rounded-lg ${ringClass}`}
                style={ringStyle}
                {...hover}
              >
                {renderHighlightedText(segment.value, keywords, verb)}
              </span>
            </React.Fragment>
          );
        }
        const animation = fresh
          ? `${segment.op === 'delete' ? 'animate-replay-cut' : 'animate-replay-in'} motion-reduce:animate-none`
          : '';
        // Only the words go inside a mark. A line break inside one is drawn as an
        // empty highlighted line, so the run is cut at every break — the trailing
        // one and any inside a run that spans paragraphs — and the breaks are
        // drawn plain between the marks.
        //
        // A cut run's breaks are the ORIGINAL's layout. In the combined view every
        // break of the revision is carried by an equal or inserted run, so keeping
        // a cut run's break as well would split the revised paragraph in two. A
        // single space keeps the words apart without that.
        const collapseBreaks = segment.op === 'delete' && side !== 'original';
        const pieces = segment.value.split(/(\s*\n\s*)/);
        return (
          <React.Fragment key={index}>
            {numberButton}
            {pieces.map((piece, p) => {
              // Odd pieces are the breaks the split kept; a run that is only
              // whitespace has no words, so it is plain too.
              if (p % 2 === 1 || !piece.trim()) {
                return collapseBreaks && piece.includes('\n') ? ' ' : piece;
              }
              const [visible, trailing] = splitTrailingWhitespace(piece);
              return (
                <React.Fragment key={p}>
                  <mark
                    // The first piece is the run's jump target.
                    ref={
                      p === 0 && opensEdit && registerMark
                        ? (el) => registerMark(index, el)
                        : undefined
                    }
                    // The focused edit gets a ring rather than a different colour, so
                    // "where am I" never competes with "what kind of edit is this".
                    className={`${OP_CLASS[segment.op]} ${ringClass} ${animation}`}
                    style={ringStyle}
                    title={segment.op === 'insert' ? 'Added by the marker' : 'Cut by the marker'}
                    {...hover}
                  >
                    {renderHighlightedText(visible, keywords, verb, true)}
                  </mark>
                  {trailing}
                </React.Fragment>
              );
            })}
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
 *
 * Wide screens give the page its own column and put the two margins either side
 * of it: the why (what the marker asked, and what changed) on the left, the
 * where (the numbered edits) on the right. Below `xl` they stack under the page,
 * as they always did.
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
  keyChanges,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [view, setView] = useState<ViewMode>('marked');
  const [fontSize, setFontSize] = useState(17);
  const [cursor, setCursor] = useState(0);
  /** The edit the pointer or the keyboard is on, which takes the highlight while it lasts. */
  const [preview, setPreview] = useState<number | null>(null);
  /**
   * The replay: how many edits are on the page, from 0 (the student's own
   * answer) to the edit count (the marked view). Null when it is not running.
   */
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /** The mark as the replay counts it up to the target. Only read once the replay has finished. */
  const [countedMark, setCountedMark] = useState(targetMark ?? 0);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const railRefs = useRef(new Map<number, HTMLElement>());
  const copiedTimer = useRef<number | undefined>(undefined);
  const titleId = useId();
  const descId = useId();
  const bandConfig = getBandConfig(targetBand);
  // The band as one custom property on the frame. Every band-coloured part of
  // the modal reads it from here, through `band-solid`, `band-edge-strong` and
  // `rgb(var(--band-rgb))`, so no colour is written at a call site.
  const bandStyle = { '--band-rgb': getBandRgb(targetBand) } as React.CSSProperties;

  useEscapeKey(isOpen, onClose);

  // The "Copied" confirmation is cleared when the modal goes, so a timer left
  // running cannot set state on an unmounted component.
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

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

  // Grouped so a rewrite is one numbered edit, not a fragment per word: a kept
  // run of a couple of words between two changes does not split it. A deletion
  // and the insertion replacing it are one edit too — that is how a reader sees
  // them, and counting them separately would make an eleven-edit revision claim
  // twenty-two.
  const edits = useMemo<DiffEdit[]>(() => groupEdits(segments), [segments]);
  // A comparison exists when there is an original to set the revision against and
  // at least one change to show. Without either, the page is the revision alone.
  const comparing = !!originalText.trim() && edits.length > 0;
  const editNumbers = useMemo(
    () => new Map(edits.map((edit, i) => [edit.start, i + 1] as const)),
    [edits]
  );
  /** Each segment's edit index, or -1 for a kept run. The replay and the hover both read it. */
  const segmentEdit = useMemo(() => {
    const map = new Array<number>(segments.length).fill(-1);
    edits.forEach((edit, i) => {
      for (let j = edit.start; j <= edit.end; j++) map[j] = i;
    });
    return map;
  }, [edits, segments]);
  /**
   * How many runs of the revised column come before each segment of the full
   * diff. That column holds only the equal and inserted runs, so an index into
   * the full diff points at the wrong words there: converting through this
   * table is what puts the side-by-side ring and jump on the words the edit
   * names. Has one more entry than `segments`, so the end of an edit converts too.
   */
  const revisedBefore = useMemo(() => {
    const counts = [0];
    for (const segment of segments) {
      counts.push(counts[counts.length - 1] + (segment.op === 'delete' ? 0 : 1));
    }
    return counts;
  }, [segments]);
  /**
   * Each edit's first ADDED run, as an index into the revised column of the
   * side-by-side view. A pure cut has nothing on the revised side, so it maps to
   * -1 and is not ringed.
   */
  const revisedAnchors = useMemo(
    () =>
      edits.map((edit) => {
        for (let j = edit.start; j <= edit.end; j++) {
          if (segments[j].op === 'insert') return revisedBefore[j];
        }
        return -1;
      }),
    [edits, segments, revisedBefore]
  );
  /** Each edit's span in the revised column, for the side-by-side ring. Null for a pure cut. */
  const revisedRanges = useMemo(
    () =>
      edits.map((edit) => {
        const start = revisedBefore[edit.start];
        const end = revisedBefore[edit.end + 1] - 1;
        return end >= start ? { start, end } : null;
      }),
    [edits, revisedBefore]
  );

  // Which syllabus terms the revision brought in: it names what the extra mark
  // was for in the question's own vocabulary. A term the student already used
  // is not claimed as new.
  const newKeywords = useMemo(
    () =>
      (originalPrompt.keywords || []).filter(
        (kw) =>
          !!kw && textContainsKeyword(revisedText, kw) && !textContainsKeyword(originalText, kw)
      ),
    [originalPrompt.keywords, originalText, revisedText]
  );
  /**
   * The first edit that puts each new term on the page. A term lights up when
   * the replay reaches that edit. -1 when no single edit carries it, and then it
   * lights when the replay finishes.
   */
  const termEdit = useMemo(
    () =>
      new Map(
        newKeywords.map(
          (kw) => [kw, edits.findIndex((e) => textContainsKeyword(e.added, kw))] as const
        )
      ),
    [newKeywords, edits]
  );

  const asked = useMemo(
    () => (markerAsked || []).map((s) => s.trim()).filter(Boolean),
    [markerAsked]
  );
  const changeReasons = useMemo(
    () => (keyChanges || []).map((s) => s.trim()).filter(Boolean),
    [keyChanges]
  );

  useEffect(() => {
    // A fresh comparison starts at the first edit, not wherever the last one
    // left the cursor, and not part-way through a replay of the last one.
    setCursor(0);
    setPreview(null);
    setReplayStep(null);
    setIsPlaying(false);
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
      const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
      const mark = markRefs.current.get(
        view === 'split' ? revisedAnchors[next] : edits[next].start
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

  // ---- The replay -------------------------------------------------------------

  // The replay is a view of the marked page, so it is only on while that view is.
  const replayAvailable = comparing && view === 'marked';
  const replaying = replayAvailable && replayStep !== null;
  const replayDone = replaying && replayStep >= edits.length;
  const playingNow = replaying && isPlaying && !replayDone;

  // One edit per tick. The timer is only running while the replay is playing
  // and has edits left, so it stops on its own at the end, and on pause.
  useEffect(() => {
    if (!isPlaying || replayStep === null || replayStep >= edits.length) return;
    const timer = window.setTimeout(
      () => setReplayStep((step) => (step === null ? step : Math.min(step + 1, edits.length))),
      REPLAY_STEP_MS
    );
    return () => window.clearTimeout(timer);
  }, [isPlaying, replayStep, edits.length]);

  // The margin and the page follow the replay: the edit just reached is the one
  // on the ring, and it is scrolled into view. The edit before the first step
  // is the first one, so the page opens on where the replay will begin.
  useEffect(() => {
    if (replayStep === null || edits.length === 0) return;
    goTo(clamp(replayStep - 1, 0, edits.length - 1));
  }, [replayStep, goTo, edits.length]);

  // The mark counts up from the student's own score to the target as the replay
  // finishes. Under reduced motion it is the target at once.
  useEffect(() => {
    if (!replayDone || targetMark === undefined) return;
    const from = originalMark ?? targetMark;
    if (prefersReducedMotion()) {
      setCountedMark(targetMark);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setCountedMark(Math.round(from + (targetMark - from) * eased));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    setCountedMark(from);
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [replayDone, originalMark, targetMark]);

  const chooseView = (next: ViewMode) => {
    setView(next);
    // Leaving the marked view ends the replay, so a timer does not step a page
    // nobody is looking at.
    setReplayStep(null);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (replayStep === null || replayDone) {
      // Starting, or starting again from the top.
      setReplayStep(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((playing) => !playing);
  };

  const stepReplay = (delta: number) => {
    setIsPlaying(false);
    setReplayStep((step) => clamp((step ?? 0) + delta, 0, edits.length));
  };

  const skipToEnd = () => {
    setIsPlaying(false);
    setReplayStep(edits.length);
  };

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(revisedText);
    } catch {
      // The browser refused the clipboard, so nothing was copied and nothing
      // should say "Copied". The text is on the page to select by hand.
      return;
    }
    setIsCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setIsCopied(false), 2000);
  };

  // Put the rewrite in the draft, then close. Focus then goes to the writing
  // surface, because that is where the student is sent next. The focus trap alone
  // hands it back to whatever opened the review, and after marking that is often
  // a control that has since been disabled or closed, or a theme toggle the
  // student used earlier, which leaves focus on the page chrome.
  //
  // The trap restores on the frame after it closes, so this waits a frame more
  // to land after it. Written as a second frame rather than a timeout, so the
  // order does not depend on how long the restore takes.
  const handleApply = () => {
    onApply(revisedText);
    onClose();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById('main-content')
          ?.querySelector<HTMLTextAreaElement>('textarea')
          ?.focus();
      });
    });
  };

  const hasOriginal = !!originalText.trim();
  const kept = wordsKeptParts(stats);
  // A rewrite identical to the student's answer is worth exactly what theirs
  // was, so the header must not go on claiming the extra mark, and there is
  // nothing to copy across.
  const unchanged = hasOriginal && edits.length === 0;
  const gained =
    !unchanged && originalMark !== undefined && targetMark !== undefined
      ? targetMark - originalMark
      : 0;
  const split = comparing && view === 'split';
  const hasWhy = asked.length > 0 || changeReasons.length > 0;

  // The edit the page and the margin show as current: the one under the pointer
  // or the focus while there is one, otherwise the cursor. The replay moves the
  // cursor, so the ring follows it.
  const focusEdit = preview ?? cursor;
  const activeEdit = view === 'clean' ? undefined : edits[focusEdit];
  const activeRange = activeEdit ? { start: activeEdit.start, end: activeEdit.end } : null;
  // The page shows the replay's frame while it runs; the marked view otherwise.
  const shownStep = replaying ? replayStep : null;
  // The mark the header shows. The student's own score until the replay finishes,
  // then the count-up. Outside a replay it is the target, as it always was.
  const shownMark =
    targetMark === undefined
      ? undefined
      : replaying
        ? replayDone
          ? countedMark
          : (originalMark ?? targetMark)
        : targetMark;
  // The band rule fills as the replay reaches each edit, and is full otherwise.
  const bandFill = replaying && replayStep !== null ? replayStep / edits.length : 1;
  const replayLabel =
    replayStep === null
      ? ''
      : replayStep === 0
        ? 'Your answer'
        : replayDone
          ? `All ${edits.length} edits`
          : `Edit ${replayStep} of ${edits.length}`;
  // One announcement per edit, not per word: the live region names the edit.
  const liveText = !replaying
    ? ''
    : replayStep === 0
      ? 'Replay started. Your answer, before the marker’s edits.'
      : replayDone
        ? `Replay finished. All ${edits.length} edits are on the page.`
        : `Edit ${replayStep} of ${edits.length}. ${describeEdit(edits[replayStep - 1])}`;

  const reassurance =
    stats.retention >= 0.75
      ? 'Most of this is still your answer. The marker changed only the words in the edits below.'
      : stats.retention >= 0.5
        ? 'A good share of your wording stayed. Check each edit before you use the version.'
        : 'Most of the wording is new. Read each edit before you use this version.';

  // Every button here is 44px tall on a phone, the touch target, and returns to
  // its own height from `sm`. The primary action is the band's own solid fill
  // with its ink (`band-solid`), which holds AA on all six hues where white did
  // not.
  const secondaryButton =
    't-label flex-1 sm:flex-none min-h-11 sm:min-h-0 py-2.5 px-5 rounded-xl text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 can-hover:hover:bg-slate-100 dark:can-hover:hover:bg-white/10 border border-slate-300 dark:border-white/10 transition-colors touch-manipulation flex items-center justify-center gap-2';
  const primaryButton =
    't-label flex-1 sm:flex-none min-h-11 sm:min-h-0 py-2.5 px-6 rounded-xl font-semibold band-solid can-hover:hover:brightness-110 active:brightness-95 transition-[filter] touch-manipulation flex items-center justify-center gap-2';
  const toolGroup =
    'flex items-center gap-0.5 p-0.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20';
  const toolButton =
    'inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-400 can-hover:hover:text-slate-800 dark:can-hover:hover:text-slate-100 can-hover:hover:bg-slate-100 dark:can-hover:hover:bg-white/10 transition-colors touch-manipulation disabled:opacity-40';
  // The replay's start is a labelled control, not an icon: it is the one thing
  // on the toolbar a student has to find on purpose.
  const replayStartButton =
    't-label inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-slate-800 dark:text-slate-100 can-hover:hover:bg-slate-100 dark:can-hover:hover:bg-white/10 transition-colors touch-manipulation whitespace-nowrap';

  // ---- Layout -------------------------------------------------------------
  // Wide screens: the page in its own column, the margins either side of it. The
  // grid is only on from `lg`, and the three-zone one only from `xl`, so a phone
  // and a tablet keep the one scrolling column they always had. Side by side
  // takes the whole width for its two columns, and its margins sit beneath them.
  const bodyClass = !comparing
    ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar'
    : split
      ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar'
      : `flex-1 min-h-0 overflow-y-auto custom-scrollbar lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)] xl:overflow-hidden xl:grid-rows-[minmax(0,1fr)] ${
          hasWhy
            ? 'xl:grid-cols-[15rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]'
            : 'xl:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_21rem]'
        }`;
  const pageColumnClass = !comparing
    ? ''
    : split
      ? ''
      : `lg:overflow-y-auto lg:min-h-0 custom-scrollbar lg:col-start-1 lg:row-start-1 xl:overflow-y-auto xl:min-h-0 xl:row-start-1 ${
          hasWhy ? 'xl:col-start-2' : 'xl:col-start-1'
        }`;
  // The margin is one column below `xl`, holding both margins; from `xl` it is
  // `contents`, so each margin is a cell of the page's grid in its own right.
  const marginColumnClass = !comparing
    ? ''
    : split
      ? 'md:grid md:grid-cols-2'
      : 'lg:overflow-y-auto lg:min-h-0 custom-scrollbar lg:col-start-2 lg:row-start-1 lg:border-l border-slate-200 dark:border-white/10 xl:contents';
  const whyRailClass = split
    ? 'border-t md:border-t-0 md:border-r'
    : `border-t lg:border-t-0 xl:border-t-0 xl:border-r xl:row-start-1 xl:col-start-1 xl:overflow-y-auto xl:min-h-0 custom-scrollbar`;
  const whereRailClass = split
    ? `border-t md:border-t-0 ${hasWhy ? '' : 'md:col-span-2'}`
    : `border-t ${hasWhy ? '' : 'lg:border-t-0'} xl:border-t-0 xl:border-l xl:row-start-1 ${
        hasWhy ? 'xl:col-start-3' : 'xl:col-start-2'
      } xl:overflow-y-auto xl:min-h-0 custom-scrollbar`;
  const railSurface =
    'bg-surface-elevated dark:bg-white/[0.02] border-slate-200 dark:border-white/10 px-5 sm:px-6 py-6 flex flex-col gap-7';

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
        style={bandStyle}
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-surface shadow-lg w-full max-w-6xl xl:max-w-[min(94vw,1500px)] border border-slate-200 dark:border-white/10 animate-fade-in-up motion-reduce:animate-none overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The band this revision reaches, as one rule across the top — the
            only saturated colour on the frame, so the edits keep the page's
            attention. During the replay it fills edit by edit, to the band. */}
        <div
          className="h-1 shrink-0 bg-slate-200 dark:bg-white/10 overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="h-full origin-left bg-[rgb(var(--band-rgb))] transition-transform duration-700 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${bandFill})` }}
          />
        </div>

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
              // On a phone every line above the page is a line of the student's
              // answer not shown, and the legend over the text says the same thing.
              // It stays as the dialog's description for a screen reader.
              className="sr-only sm:not-sr-only sm:mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl"
            >
              {unchanged
                ? 'The marker left it as you wrote it.'
                : hasOriginal
                  ? 'The marker’s edits, drawn on your own writing.'
                  : 'The marker’s version of this answer.'}
            </p>
          </div>

          <div className="flex items-start gap-3 sm:gap-5 shrink-0">
            {/* The mark it moved, said once and large enough to be the point. The
                title names the gain, so this line gives the figure and the band
                and nothing else. The chip it replaces put "3 → 4/4" at 12px inside
                a gradient. */}
            {!unchanged && targetMark !== undefined && (
              <div className="text-right">
                <p className="flex items-baseline justify-end gap-1.5 tabular-nums leading-none">
                  {originalMark !== undefined && (
                    <>
                      <span className="text-lg font-semibold text-slate-600 dark:text-slate-400">
                        {originalMark}
                      </span>
                      <span className="sr-only"> to </span>
                      <span aria-hidden="true" className="text-slate-600 dark:text-slate-400">
                        →
                      </span>
                    </>
                  )}
                  <span className={`text-3xl font-black ${bandConfig.text}`}>{shownMark}</span>
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    <span aria-hidden="true">/</span>
                    <span className="sr-only"> out of </span>
                    {originalPrompt.totalMarks}
                  </span>
                </p>
                <p className="t-label mt-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  Band {targetBand}
                </p>
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-lg text-slate-600 dark:text-slate-400 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white can-hover:hover:bg-slate-100 dark:can-hover:hover:bg-white/10 transition-colors flex items-center justify-center touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* What the process did for this answer, in the student's own terms, and
            the syllabus terms it brought in. It fades in once, on open. */}
        {comparing && (
          <section
            aria-label="What changed"
            className="px-5 sm:px-8 pt-4 pb-3 shrink-0 border-b border-slate-200 dark:border-white/10 bg-surface-elevated dark:bg-white/[0.02] animate-fade-in-up motion-reduce:animate-none"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0 md:max-w-xl">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {reassurance}
                </p>
                <p className="t-label mt-1 text-slate-600 dark:text-slate-400 tabular-nums">
                  {wordCountsLine(stats)}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:justify-end shrink-0">
                {[
                  {
                    key: 'kept',
                    label: kept.label,
                    value: kept.figure,
                    tone: 'text-slate-900 dark:text-white',
                  },
                  {
                    key: 'added',
                    label: 'words added',
                    value: stats.added === 0 ? '0' : `+${stats.added}`,
                    tone: 'text-emerald-700 dark:text-emerald-300',
                  },
                  {
                    key: 'cut',
                    label: 'words cut',
                    value: stats.removed === 0 ? '0' : `−${stats.removed}`,
                    tone: 'text-rose-700 dark:text-rose-300',
                  },
                ].map((tile, i) => (
                  <div
                    key={tile.key}
                    className="flex flex-col-reverse gap-0.5 px-3 py-2 md:px-3.5 md:min-w-[7.5rem] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] animate-fade-in-up-sm motion-reduce:animate-none"
                    style={{ animationDelay: `${120 + i * 90}ms`, animationFillMode: 'both' }}
                  >
                    {/* The label comes first in the source, as a `dl` requires; the
                        column is reversed so the figure reads first on screen. */}
                    <dt className="t-label text-slate-600 dark:text-slate-400">{tile.label}</dt>
                    <dd
                      className={`text-lg md:text-xl font-bold tabular-nums leading-tight m-0 ${tile.tone}`}
                    >
                      {tile.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {newKeywords.length > 0 && (
              <section className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                  Syllabus terms the revision added
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {newKeywords.map((kw) => {
                    const at = termEdit.get(kw) ?? -1;
                    const lit = !replaying || replayDone || (at >= 0 && at < (replayStep ?? 0));
                    return (
                      <li key={kw}>
                        <span className={lit ? LIT_TERM_CLASS : UNLIT_TERM_CLASS}>{kw}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </section>
        )}

        {/* The replay's live region is always here, so a change is announced. */}
        <p className="sr-only" aria-live="polite">
          {liveText}
        </p>

        <div className="px-5 sm:px-8 py-2.5 border-b border-slate-200 dark:border-white/10 bg-surface-elevated dark:bg-white/[0.02] flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
          {comparing && (
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-200/70 dark:bg-black/25"
              role="group"
              aria-label="How to show the revision"
            >
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => chooseView(v.id)}
                  aria-pressed={view === v.id}
                  className={`t-label inline-flex items-center min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap touch-manipulation ${
                    view === v.id
                      ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 can-hover:hover:text-slate-800 dark:can-hover:hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {/* Watching the marker's edits go in, one at a time. Optional: the page
              is complete without it, and the controls are not on it until asked
              for. The start is the same control as Play, so focus stays on it. */}
          {replayAvailable && (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className={toolGroup} role="group" aria-label="Watch the marker’s edits">
                {replayStep !== null && (
                  <button
                    type="button"
                    onClick={() => stepReplay(-1)}
                    disabled={replayStep <= 0}
                    aria-label="Previous edit"
                    className={toolButton}
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={
                    replayStep === null
                      ? undefined
                      : playingNow
                        ? 'Pause the replay'
                        : replayDone
                          ? 'Replay from the start'
                          : 'Play the replay'
                  }
                  className={replayStep === null ? replayStartButton : toolButton}
                >
                  {replayStep === null ? (
                    <>
                      <Play
                        className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400"
                        aria-hidden="true"
                      />
                      <span>Watch the marker’s edits</span>
                    </>
                  ) : playingNow ? (
                    <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : replayDone ? (
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
                {replayStep !== null && (
                  <button
                    type="button"
                    onClick={() => stepReplay(1)}
                    disabled={replayDone}
                    aria-label="Next edit"
                    className={toolButton}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
                {replayStep !== null && (
                  <button
                    type="button"
                    onClick={skipToEnd}
                    disabled={replayDone}
                    aria-label="Skip to the end"
                    className={toolButton}
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {replayStep !== null && (
                <div className="flex items-center gap-2.5 min-w-[9rem] flex-1 max-w-xs">
                  <div
                    role="progressbar"
                    aria-label="Replay progress"
                    aria-valuemin={0}
                    aria-valuemax={edits.length}
                    aria-valuenow={replayStep}
                    aria-valuetext={replayLabel}
                    className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"
                  >
                    <div
                      className="h-full origin-left rounded-full bg-[rgb(var(--band-rgb))] transition-transform duration-300 ease-out motion-reduce:transition-none"
                      style={{ transform: `scaleX(${replayStep / edits.length})` }}
                    />
                  </div>
                  <span className="t-label tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {replayLabel}
                  </span>
                </div>
              )}
            </div>
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
            {/* Not on a phone: the system text size and pinch-zoom do this job
                there, and without it the stepper fits on the row beside the
                words-kept figure instead of taking a row of its own. */}
            <div className={`${toolGroup} hidden sm:flex`}>
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

        {/* The page and its margins. From `lg` the page and the margin scroll on
            their own; from `xl` the margin splits into the why on the left of the
            page and the where on its right. Below `lg` the margin follows the page
            in one scroll. */}
        <div className={bodyClass}>
          <div className={pageColumnClass}>
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
                  {/* The way to get a different rewrite is to write more: this
                      modal has no control that asks for another one. */}
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5 leading-relaxed">
                    The marker did not change anything, so there is nothing here to copy across. Add
                    more of your own reasoning, then mark it again.
                  </p>
                </div>
              </div>
            )}

            {comparing && split ? (
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-white/10">
                {(
                  [
                    ['Your original', stats.originalWords, originalSide, false],
                    ['Improved', stats.revisedWords, revisedSide, true],
                  ] as const
                ).map(([label, words, runs, isRevised]) => (
                  <div key={label}>
                    <div className="sticky top-0 px-5 sm:px-6 py-2.5 bg-surface-elevated/95 dark:bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm border-b border-slate-200 dark:border-white/10 flex items-center gap-2 z-10">
                      {isRevised && (
                        <span
                          className="w-2 h-2 rounded-full bg-[rgb(var(--band-rgb))]"
                          aria-hidden="true"
                        />
                      )}
                      <h3 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                        {label}
                      </h3>
                      <span className="ml-auto t-label text-slate-600 dark:text-slate-400 tabular-nums">
                        {words} words
                      </span>
                    </div>
                    <div className="px-5 sm:px-6 py-6">
                      {/* The revised column owns the jump targets: it is the
                          side a student is being asked to write. */}
                      <DiffText
                        segments={runs}
                        side={isRevised ? 'revised' : 'original'}
                        fontSize={fontSize}
                        activeRange={isRevised ? (revisedRanges[focusEdit] ?? null) : null}
                        registerMark={isRevised ? registerMark : undefined}
                        onPreview={isRevised ? setPreview : undefined}
                        keywords={originalPrompt.keywords}
                        verb={originalPrompt.verb}
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
                  <p className="t-label mb-5 text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={OP_CLASS.insert}>added</span>
                    <span className={OP_CLASS.delete}>cut</span>
                    <span>everything unmarked is your own writing</span>
                  </p>
                )}
                {comparing && view === 'marked' ? (
                  <DiffText
                    segments={segments}
                    fontSize={fontSize}
                    activeRange={activeRange}
                    editNumbers={editNumbers}
                    editOf={segmentEdit}
                    replayStep={shownStep}
                    registerMark={registerMark}
                    onSelectEdit={goTo}
                    onPreview={setPreview}
                    keywords={originalPrompt.keywords}
                    verb={originalPrompt.verb}
                  />
                ) : (
                  <p
                    className="font-serif leading-[1.9] whitespace-pre-wrap text-slate-800 dark:text-slate-200"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {renderFormattedText(revisedText, originalPrompt.keywords, originalPrompt.verb)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The margin: why first — the marker's own advice, and what the rewrite
              says it changed — then where, edit by edit. Each is its own landmark. */}
          {comparing && (
            <div className={marginColumnClass}>
              {hasWhy && (
                <aside
                  aria-label="What changed and why"
                  className={`${railSurface} ${whyRailClass}`}
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
                            <span>
                              {renderFormattedText(
                                item,
                                originalPrompt.keywords,
                                originalPrompt.verb
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* What the marker says it changed, and why. Set beside the edits,
                      not on them: a reason is not tied to one edit, and a link drawn
                      from it to a single edit would be a guess. */}
                  {changeReasons.length > 0 && (
                    <section>
                      <RailHeading>What changed and why</RailHeading>
                      <ul className="space-y-2.5">
                        {changeReasons.map((item, i) => (
                          <li
                            key={i}
                            className="flex gap-2.5 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300"
                          >
                            <span
                              className="mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full bg-[rgb(var(--band-rgb))]"
                              aria-hidden="true"
                            />
                            <span>
                              {renderFormattedText(
                                item,
                                originalPrompt.keywords,
                                originalPrompt.verb
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </aside>
              )}

              <aside aria-label="The edits" className={`${railSurface} ${whereRailClass}`}>
                <section>
                  <RailHeading
                    aside={
                      <span className="t-label text-slate-600 dark:text-slate-400 tabular-nums">
                        {edits.length}
                      </span>
                    }
                  >
                    The edits
                  </RailHeading>
                  <ol className="flex flex-col gap-1">
                    {edits.map((edit, i) => {
                      const active = i === focusEdit && view !== 'clean';
                      const reached = replaying && replayStep !== null && i < replayStep;
                      return (
                        <li
                          key={edit.start}
                          ref={(el) => {
                            if (el) railRefs.current.set(i, el);
                            else railRefs.current.delete(i);
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (view === 'clean') chooseView('marked');
                              goTo(i);
                            }}
                            onMouseEnter={() => setPreview(i)}
                            onMouseLeave={() => setPreview(null)}
                            onFocus={() => setPreview(i)}
                            onBlur={() => setPreview(null)}
                            aria-current={i === cursor && view !== 'clean' ? 'true' : undefined}
                            // The focused edit is the band's own edge at full strength
                            // (`band-edge-strong`), so the rail says which edit the
                            // page is on in the colour the page uses for it.
                            className={`w-full text-left flex gap-3 p-2.5 rounded-xl border touch-manipulation transition-colors duration-200 ${
                              active
                                ? 'bg-white dark:bg-white/[0.06] band-edge-strong shadow-sm'
                                : 'border-transparent can-hover:hover:bg-white/70 dark:can-hover:hover:bg-white/[0.04]'
                            }`}
                          >
                            <span
                              className={`mt-0.5 shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1 rounded-full text-[11px] font-bold tabular-nums transition-colors duration-200 ${
                                active
                                  ? 'band-solid'
                                  : reached
                                    ? 'text-slate-800 dark:text-slate-100'
                                    : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                              }`}
                              // An edit the replay has passed takes a tint of the band,
                              // set from the frame's own variable rather than a class.
                              style={
                                reached && !active
                                  ? { backgroundColor: 'rgb(var(--band-rgb) / 0.18)' }
                                  : undefined
                              }
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0 font-serif text-[14px] leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-4">
                              {edit.removed && (
                                <span className={OP_CLASS.delete}>
                                  {renderHighlightedText(
                                    edit.removed,
                                    originalPrompt.keywords,
                                    originalPrompt.verb,
                                    true
                                  )}
                                </span>
                              )}
                              {edit.removed && edit.added && (
                                // Decorative: the cut and the added words are both read out.
                                <span className="font-sans text-slate-400" aria-hidden="true">
                                  {' → '}
                                </span>
                              )}
                              {edit.added && (
                                <span className={OP_CLASS.insert}>
                                  {renderHighlightedText(
                                    edit.added,
                                    originalPrompt.keywords,
                                    originalPrompt.verb,
                                    true
                                  )}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </aside>
            </div>
          )}
        </div>

        {/* The footer's job is the way forward, so one action is primary. After
            marking it is "See my full feedback", which carries on; opened from the
            summary it is "Use this version" when there is a version to take, and
            "Back to feedback" when there is not. Everything else is secondary. On a
            phone the primary takes the first full-width row, and the rest share the
            row beneath. */}
        <div className="px-5 sm:px-8 py-4 border-t border-slate-200 dark:border-white/10 bg-surface-elevated dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
          {/* A note on what comes next, which a phone cannot spare two lines for:
              the primary button already names it. */}
          <p className="hidden sm:block text-xs text-slate-600 dark:text-slate-400 text-left">
            {continueLabel
              ? // Standing in front of the marking summary, the useful thing to
                // say is what is behind it — not where the samples were filed.
                'Your mark, the criteria breakdown and the marker’s commentary come next.'
              : unchanged
                ? 'Your answer is saved to this question’s sample answers.'
                : 'Both versions are saved to this question’s sample answers.'}
          </p>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2.5 w-full sm:w-auto">
            <button onClick={handleCopy} className={secondaryButton}>
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {isCopied ? 'Copied' : 'Copy'}
            </button>

            {continueLabel ? (
              <>
                {/* Nothing to apply when the two texts are the same — a button
                    that silently does nothing is worse than no button. */}
                {!unchanged && (
                  <button
                    onClick={handleApply}
                    title="Put this version in your draft"
                    className={secondaryButton}
                  >
                    <span>Use this version</span>
                  </button>
                )}

                {/* Where the flow goes next — see `continueLabel`. Focused on open
                    so Enter carries on, and so a keyboard user is not left hunting
                    for the exit. */}
                <button
                  onClick={onClose}
                  autoFocus
                  className={`${primaryButton} col-span-2 order-first sm:order-none`}
                >
                  <span>{continueLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className={
                    unchanged
                      ? `${primaryButton} col-span-2 order-first sm:order-none`
                      : secondaryButton
                  }
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to feedback</span>
                </button>

                {!unchanged && (
                  <button
                    onClick={handleApply}
                    title="Put this version in your draft"
                    className={`${primaryButton} col-span-2 order-first sm:order-none`}
                  >
                    <span>Use this version</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImprovementReviewModal;
