import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Prompt, SampleAnswer, UserRole } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { renderFormattedText, getBandConfig, cleanMarkdown } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { AccordionSection } from './ReferenceMaterials';
import { LadderRowGutter, ladderBandVars } from './LadderRow';
import {
  LADDER_CRITERION,
  LADDER_DISCLOSURE,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_FILL,
  LADDER_NOTE,
  LADDER_NOTE_GLYPH,
  LADDER_NOTE_LABEL,
  LADDER_PANE,
  LADDER_ROW,
  LADDER_SOLID,
  LADDER_STACK,
} from '../utils/ladderChrome';
import {
  criterionForMark,
  parseMarkingCriteria,
  questionCeilingBand,
  type MarkingCriteriaItem,
} from '../utils/markingGuideParse';
import { nearestExemplarMark, useOpenExemplarRequest } from '../utils/ladderLink';
import {
  SAMPLE_ACTION,
  SAMPLE_ACTION_DIVIDER,
  SAMPLE_ACTION_GROUP,
  SAMPLE_ACTION_ICON,
  SAMPLE_ACTIONS,
  SAMPLE_AI_BUTTON,
  SAMPLE_ANSWER,
  SAMPLE_CAROUSEL,
  SAMPLE_CAROUSEL_BUTTON,
  SAMPLE_CAROUSEL_COUNT,
  SAMPLE_COMMENTARY,
  SAMPLE_COMMENTARY_HEAD,
  SAMPLE_EMPTY,
  SAMPLE_LOCKED,
  SAMPLE_LOCKED_CTA,
  SAMPLE_NOTE_TEXT,
  SAMPLE_NOTE_TOGGLE,
  SAMPLE_PAGE,
  SAMPLE_PAGE_BAR,
  SAMPLE_PAGE_FOOT,
  SAMPLE_PAGE_TEXT,
  SAMPLE_PICKER,
  SAMPLE_PICKER_MORE,
  SAMPLE_PICKER_ROW,
  SAMPLE_PICKER_TAB,
  SAMPLE_PICKER_TAB_IDLE,
  SAMPLE_ROW_FIGURE,
  SAMPLE_ROW_HEAD,
  SAMPLE_ROW_META,
  SAMPLE_ROW_PREVIEW,
  SAMPLE_TOOLS,
  SAMPLE_ZONES,
  SAMPLE_ZOOM,
  SAMPLE_ZOOM_BUTTON,
  SAMPLE_ZOOM_VALUE,
  ZONE_CRITERION,
  ZONE_CRITERION_BODY,
  ZONE_FIGURE,
  ZONE_HEAD,
  ZONE_LABEL,
} from '../utils/sampleAnswerChrome';
import SampleAnswerGeneratorModal from './SampleAnswerGeneratorModal';
import SampleAnswerRevisionModal from './SampleAnswerRevisionModal';
import SampleAnswerEditorModal from './SampleAnswerEditorModal';
import RecalibrateSamplesModal from './RecalibrateSamplesModal';
import ConfirmationModal from './ConfirmationModal';
import FlagContentModal from './FlagContentModal';
import {
  ChevronDown,
  FileText,
  Sparkles,
  Repeat,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  BookOpen,
  Zap,
  Copy,
  Check,
  Bookmark,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  RefreshCw,
  UploadCloud,
  Flag,
  Lock,
  ListChecks,
  MessageSquareQuote,
} from 'lucide-react';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';
import { freeTierLimits } from '../services/planPolicy';
import {
  isFeatureLocked,
  isSampleAnswerLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import type { SyllabusKeywordContext } from '../services/geminiService';

/** Words in an exemplar, counted the way the live word guide counts a draft. */
const countWords = (text: string | undefined): number =>
  (text || '').trim().split(/\s+/).filter(Boolean).length;

interface GroupedSampleAnswers {
  mark: number;
  answers: SampleAnswer[];
  /** Band for this mark level, derived via the Verb Gate (getBandForMark). */
  calculatedBand: number;
}

/** Exemplar chips shown at a mark level before the rest fold behind "+N more". */
const VISIBLE_VARIANTS = 4;

/**
 * Provenance, in one word — the single thing that most distinguishes two
 * exemplars sitting at the same mark. Shared by the badge and the variant
 * picker so a sample cannot be called "Official" in one and "AI Model" in the
 * other.
 */
const sourceLabel = (sample: Pick<SampleAnswer, 'source' | 'derivedFromStudent'>): string =>
  sample.source === 'USER'
    ? 'Student'
    : sample.source === 'HSC_EXEMPLAR'
      ? 'Official'
      : sample.source === 'AI' && sample.derivedFromStudent
        ? 'Student + AI'
        : 'AI Model';

/**
 * Reading order within one mark level: verified HSC exemplars first, then real
 * student work, then AI rewrites of student work, then clean-room AI. It is a
 * confidence ordering — the exemplar a student should read FIRST is the one
 * closest to a real marked HSC response — and it makes "1 of 5" mean something
 * predictable rather than reflecting the order they happened to be generated.
 */
const SOURCE_RANK: Record<string, number> = { HSC_EXEMPLAR: 0, USER: 1, AI: 2 };
const byTrustworthiness = (a: SampleAnswer, b: SampleAnswer): number => {
  const rank = (s: SampleAnswer) =>
    (SOURCE_RANK[s.source ?? 'AI'] ?? 3) + (s.source === 'AI' && s.derivedFromStudent ? -0.5 : 0);
  return rank(a) - rank(b) || (a.id > b.id ? 1 : a.id < b.id ? -1 : 0);
};

/** The shape every header chip shares. Their tone is theirs, below. */
const CHIP = 't-label inline-flex items-center gap-1 px-2 py-0.5 rounded-full border';

/**
 * The tone of each source. A source is not a band, so these name the palette
 * directly, and they stay with the one component that draws them. Every ink is
 * tuned for its own ground: the light ink is the deeper step, because the band wash
 * under the row is the lighter ground.
 */
const SOURCE_TONE: Record<'student' | 'official' | 'upgrade' | 'ai', string> = {
  student:
    'border-blue-600/40 bg-blue-500/10 text-blue-800 dark:border-blue-400/40 dark:text-blue-300',
  official:
    'border-amber-600/50 bg-amber-500/10 text-amber-800 dark:border-amber-400/40 dark:text-amber-300',
  upgrade:
    'border-violet-600/40 bg-violet-500/10 text-violet-800 dark:border-violet-400/40 dark:text-violet-300',
  ai: 'border-slate-400 bg-white/70 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-300',
};

/**
 * The upgrade's amber. Amber is the plan's colour throughout the app, and a lock is a
 * state of the exemplar and not a band, so it is drawn here, with the component
 * that shows the lock, and not in the neutral chrome. Each ink is the deeper step on
 * the light ground, as the source tones are.
 */
const AI_LOCKED =
  'flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-50 text-amber-800 shadow-sm dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300 t-label transition-[box-shadow] duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-600/50 dark:focus-visible:ring-amber-300/60';

/** The upgrade button's fill, added to the chrome's shape on the locked card. */
const LOCK_CTA = 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-lg';

/** The hover of the destructive action, "Delete": red, on a device that hovers, so a tap
 *  does not leave it red. Red is also Band 1's hue, which is why it is drawn here with
 *  the other semantic accents and not in the neutral chrome. */
const DANGER_HOVER = 'can-hover:hover:text-red-700 dark:can-hover:hover:text-red-400';

/** An exemplar's icon action while it is flagged for review: the flag's amber. */
const FLAG_ACTIVE =
  'flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-lg text-amber-800 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-400/10 transition-colors duration-200 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/60';

/** Where an exemplar came from — and, for an AI one, whether it was written from
 *  scratch or lifted from a student's own response. A "Student + AI" sample
 *  carries the student's structure and voice, so it is read (and trusted)
 *  differently from a clean-room AI exemplar, and gets its own tone rather than
 *  being filed under the same grey "AI Model" chip. */
const SourceBadge: React.FC<Pick<SampleAnswer, 'source' | 'derivedFromStudent'>> = ({
  source,
  derivedFromStudent,
}) => {
  const isUser = source === 'USER';
  const isHsc = source === 'HSC_EXEMPLAR';
  const isUpgrade = source === 'AI' && !!derivedFromStudent;

  const tone = isUser
    ? SOURCE_TONE.student
    : isHsc
      ? SOURCE_TONE.official
      : isUpgrade
        ? SOURCE_TONE.upgrade
        : SOURCE_TONE.ai;

  const Icon = isUser ? UserIcon : isHsc ? BookOpen : Sparkles;
  const label = sourceLabel({ source, derivedFromStudent });
  const title = isUpgrade
    ? "A student's own response, rewritten by the AI to reach the next mark"
    : isUser
      ? 'A response written by a student and marked by the AI'
      : isHsc
        ? 'A verified HSC exemplar'
        : 'Written by the AI from the question and rubric';

  return (
    <span title={title} className={`${CHIP} ${tone}`}>
      {isUpgrade ? (
        <span className="inline-flex items-center gap-0.5">
          <UserIcon className="w-2.5 h-2.5" aria-hidden="true" />
          <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
        </span>
      ) : (
        <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      )}
      {label}
    </span>
  );
};

/**
 * One mark level, drawn as a ladder row: the same gutter, edge and wash as the
 * Marking Guide's row for the same mark, so the two panels line up when they are
 * open side by side.
 *
 * Shut, the whole body is one disclosure button: the source, the length and the
 * opening of the exemplar. Open, the body is three labelled zones read top to
 * bottom: the criterion that earns the mark (a solid head over the band wash), the
 * answer on its paper with the exemplar selector above it, and the marker's
 * commentary, which sits outside the paper on the desk.
 */
interface ExemplarRowProps {
  group: GroupedSampleAnswers;
  prompt: Prompt;
  isOpen: boolean;
  onToggle: () => void;
  /** Absent for a student — see the note on the button itself. */
  onUseSample?: (answer: string) => void;
  onRevise: (sample: SampleAnswer) => void;
  onEdit: (sample: SampleAnswer) => void;
  onDelete: (id: string) => void;
  onContribute?: (sample: SampleAnswer) => void;
  onFlag: (sample: SampleAnswer) => void;
  canModify: boolean;
  fontSize: number;
  /** The guide's row for this level, when the guide has one. */
  criterion?: MarkingCriteriaItem;
}

const ExemplarRow: React.FC<ExemplarRowProps> = React.memo(
  ({
    group,
    prompt,
    isOpen,
    onToggle,
    onUseSample,
    onRevise,
    onEdit,
    onDelete,
    onContribute,
    onFlag,
    canModify,
    fontSize,
    criterion,
  }) => {
    const [isContributing, setIsContributing] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isCopied, setIsCopied] = useState(false);
    const [feedbackExpanded, setFeedbackExpanded] = useState(true);
    // A generated batch can leave a dozen exemplars at one mark. The picker
    // shows the first few — which, after the trustworthiness sort, are the ones
    // worth reading first — and keeps the rest one click away rather than
    // spending four rows of chips on near-identical AI variations.
    const [showAllVariants, setShowAllVariants] = useState(false);
    // The disclosure's body, the notes' body and the picker's ids: the disclosure
    // names the first by aria-controls, the picker's tabs and the paper name each other.
    const bodyId = useId();
    const notesId = useId();
    const pickerId = useId();
    const paperId = useId();
    // The tabs by index, so the arrow keys can move focus with the selection.
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    // The "Copied" confirmation's timer. It is cleared when the row unmounts, so it
    // cannot set state on a row that has gone.
    const copiedTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
    // Stepping past the fold with the header arrows opens the strip rather
    // than leaving the reader on an exemplar no chip is highlighting.
    const visibleVariants =
      showAllVariants || currentIndex >= VISIBLE_VARIANTS
        ? group.answers
        : group.answers.slice(0, VISIBLE_VARIANTS);

    useEffect(() => {
      if (currentIndex >= group.answers.length && group.answers.length > 0) {
        setCurrentIndex(group.answers.length - 1);
      }
    }, [group.answers.length, currentIndex]);

    const currentSample = group.answers[currentIndex];
    const safeAnswer = currentSample?.answer || '';
    // Band number AND colour both come from the Verb Gate (getBandForMark) —
    // so a Band 5 is always blue, and this row mirrors the Marking Guide's row
    // for the same mark exactly.
    const displayBand = group.calculatedBand;
    // The server's word where it has one, the client's rule otherwise.
    //
    // `withheld` is set by the curriculum loader on the rows that came back
    // from `withheld_sample_answers()` — exemplars the policy refused to send,
    // so there is no prose here to reveal. `isSampleAnswerLocked` still runs
    // for the local library, which never went near a server and therefore has
    // nothing to withhold; it is the same rule, applied where it is the only
    // one available.
    const locked = Boolean(currentSample?.withheld) || isSampleAnswerLocked(displayBand);
    const bandConfig = useMemo(() => getBandConfig(displayBand), [displayBand]);
    const metrics = useAnswerMetrics(safeAnswer, prompt.keywords);
    // The opening of the exemplar, cleaned the way Use and Copy clean it, and
    // never drawn for a locked one.
    const preview = useMemo(
      () => (locked || !safeAnswer ? '' : cleanMarkdown(safeAnswer)),
      [locked, safeAnswer]
    );

    if (!currentSample) return null;

    // The carousel's buttons are siblings of the disclosure, not children of it, so
    // a press here never reaches the row's toggle and needs no `stopPropagation`.
    const handleNext = () => {
      setCurrentIndex((prev) => (prev + 1) % group.answers.length);
    };

    const handlePrev = () => {
      setCurrentIndex((prev) => (prev - 1 + group.answers.length) % group.answers.length);
    };

    const handleUseSample = () => {
      if (!onUseSample) return;
      onUseSample(cleanMarkdown(currentSample.answer));
    };

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(cleanMarkdown(currentSample.answer));
      } catch {
        // The browser refused the clipboard, so nothing was copied and nothing
        // should say "Copied". The text is still on the page to select by hand.
        return;
      }
      setIsCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setIsCopied(false), 2000);
    };

    const handleContribute = () => {
      if (!onContribute || isContributing) return;
      setIsContributing(true);
      // The handler runs its own AI screen + toast; resolve either shape.
      Promise.resolve(onContribute(currentSample)).finally(() => setIsContributing(false));
    };

    // The selector is a tablist, so it takes the arrow keys, Home and End, and only the
    // selected tab sits in the tab order. Moving the selection moves focus with it.
    const handleTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const last = visibleVariants.length - 1;
      const next =
        event.key === 'ArrowRight'
          ? currentIndex >= last
            ? 0
            : currentIndex + 1
          : event.key === 'ArrowLeft'
            ? currentIndex <= 0
              ? last
              : currentIndex - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? last
                : null;
      if (next === null) return;
      event.preventDefault();
      setCurrentIndex(next);
      tabRefs.current[next]?.focus();
    };

    const flagged = currentSample.contentFlag?.status === 'open';
    const hasPicker = group.answers.length > 1;
    const hiddenVariants = group.answers.length - visibleVariants.length;

    return (
      <div
        data-exemplar-row
        style={ladderBandVars(displayBand)}
        className={`${LADDER_ROW} ${isOpen ? LADDER_EDGE_OPEN : LADDER_EDGE_SHUT} ${LADDER_FILL}`}
      >
        <LadderRowGutter
          band={displayBand}
          markLabel={String(group.mark)}
          total={prompt.totalMarks}
          edge={isOpen ? 'open' : 'shut'}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* The header line. The disclosure is the whole of it while the row is
              shut, and the carousel's arrows are its siblings while it is open,
              so no button is ever inside another. Open, the source, the length and
              the lock move to the paper, which is where the answer is labelled. */}
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-controls={bodyId}
              data-exemplar-mark={group.mark}
              className={`${LADDER_DISCLOSURE} flex-1 min-w-0`}
            >
              {/* The mark is in the gutter, but a screen reader reads the row from
                  its disclosure, so the mark is named here as well. */}
              <span className="sr-only">
                {group.mark}/{prompt.totalMarks} marks,{' '}
              </span>
              <span className={SAMPLE_ROW_HEAD}>
                <span className={SAMPLE_ROW_META}>
                  {!isOpen && (
                    <SourceBadge
                      source={currentSample.source}
                      derivedFromStudent={currentSample.derivedFromStudent}
                    />
                  )}
                  {/* The flag stays in the header whether the row is open or shut, so it
                      is seen at a glance. */}
                  {flagged && (
                    <span
                      title={`Flagged for review: ${currentSample.contentFlag?.reason}`}
                      className={`${CHIP} border-amber-600/50 bg-amber-500/10 text-amber-800 dark:border-amber-400/40 dark:text-amber-300`}
                    >
                      <Flag className="w-2.5 h-2.5 fill-current" aria-hidden="true" /> Flagged
                    </span>
                  )}
                  {!isOpen &&
                    (locked ? (
                      <span
                        className={`${CHIP} border-slate-500 text-slate-700 dark:border-white/25 dark:text-slate-300`}
                      >
                        <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Locked
                      </span>
                    ) : (
                      <span className={SAMPLE_ROW_FIGURE}>
                        {countWords(currentSample.answer)} words
                      </span>
                    ))}
                  {hasPicker && (
                    <span className={SAMPLE_ROW_FIGURE}>{group.answers.length} exemplars</span>
                  )}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`mt-0.5 w-4 h-4 shrink-0 text-slate-600 dark:text-slate-300 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`}
                />
              </span>
              {!isOpen && preview && <span className={SAMPLE_ROW_PREVIEW}>{preview}</span>}
            </button>

            {isOpen && hasPicker && (
              <div className={SAMPLE_CAROUSEL}>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous sample"
                  className={SAMPLE_CAROUSEL_BUTTON}
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {/* "2 of 3", not a bare "2": the position is meaningless
                    without the total, and a batch of exemplars now arrives
                    several at a time. */}
                <span className={SAMPLE_CAROUSEL_COUNT}>
                  {currentIndex + 1}/{group.answers.length}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next sample"
                  className={SAMPLE_CAROUSEL_BUTTON}
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* The open part. `inert` while shut, so nothing in it is reachable
              from the keyboard or read out while the row is closed. */}
          <div
            id={bodyId}
            inert={!isOpen}
            className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden min-h-0">
              <div className={LADDER_PANE}>
                <div className={SAMPLE_ZONES}>
                  {/* Zone one: what the guide asks for at this level. It is the guide's
                      own row, lifted out: the band's solid head, then the criterion on
                      the band wash. Nothing is drawn when the guide has no row. */}
                  {criterion && (
                    <div
                      role="group"
                      aria-label="Marking criterion"
                      className={`${ZONE_CRITERION} ${LADDER_EDGE_OPEN}`}
                    >
                      <div className={`${ZONE_HEAD} ${LADDER_SOLID}`}>
                        <ListChecks className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className={ZONE_LABEL}>Marking criterion</span>
                        <span className={ZONE_FIGURE} aria-hidden="true">
                          ·
                        </span>
                        <span className={ZONE_FIGURE}>
                          {group.mark}/{prompt.totalMarks}
                        </span>
                      </div>
                      <div className={ZONE_CRITERION_BODY}>
                        <div className={LADDER_CRITERION}>
                          {renderFormattedText(criterion.description, prompt.keywords, prompt.verb)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Zone two: the answer. The selector sits above the paper because it
                      chooses which paper is shown, and the paper is the centre of the
                      row. The paper is labelled on its own top edge, and its foot holds
                      the metrics and the actions, so they belong to the answer. */}
                  <div role="group" aria-label="Model answer" className={SAMPLE_ANSWER}>
                    {hasPicker && (
                      <div className={SAMPLE_PICKER_ROW}>
                        <div
                          role="tablist"
                          aria-label="Exemplars at this mark"
                          className={SAMPLE_PICKER}
                          onKeyDown={handleTabKey}
                        >
                          {visibleVariants.map((sample, i) => {
                            const isCurrent = i === currentIndex;
                            return (
                              <button
                                key={sample.id}
                                ref={(el) => {
                                  tabRefs.current[i] = el;
                                }}
                                id={`${pickerId}-tab-${i}`}
                                type="button"
                                role="tab"
                                aria-selected={isCurrent}
                                tabIndex={isCurrent ? 0 : -1}
                                onClick={() => setCurrentIndex(i)}
                                className={`${SAMPLE_PICKER_TAB} ${
                                  isCurrent
                                    ? `${LADDER_SOLID} border-transparent shadow-sm`
                                    : SAMPLE_PICKER_TAB_IDLE
                                }`}
                              >
                                {sourceLabel(sample)}{' '}
                                <span className="font-normal tabular-nums">
                                  · {countWords(sample.answer)}w
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {hiddenVariants > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllVariants(true)}
                            className={SAMPLE_PICKER_MORE}
                          >
                            +{hiddenVariants} more
                          </button>
                        )}
                      </div>
                    )}

                    <div
                      id={paperId}
                      role={hasPicker ? 'tabpanel' : undefined}
                      aria-labelledby={hasPicker ? `${pickerId}-tab-${currentIndex}` : undefined}
                      className={SAMPLE_PAGE}
                    >
                      {/* The length, the source and the lock are named once: in the
                          header while the row is shut, and here on the paper while it is
                          open. The open body stays mounted through its collapse, so
                          this bar would otherwise repeat the header's figures. */}
                      <div className={SAMPLE_PAGE_BAR}>
                        <span className={ZONE_LABEL}>Model answer</span>
                        {isOpen &&
                          (locked ? (
                            <span
                              className={`${CHIP} border-slate-500 text-slate-700 dark:border-white/25 dark:text-slate-300`}
                            >
                              <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Locked
                            </span>
                          ) : (
                            <>
                              <span className={SAMPLE_ROW_FIGURE}>
                                {countWords(currentSample.answer)} words
                              </span>
                              <SourceBadge
                                source={currentSample.source}
                                derivedFromStudent={currentSample.derivedFromStudent}
                              />
                            </>
                          ))}
                      </div>

                      {locked ? (
                        // A locked exemplar is a locked exemplar, not a blurred one.
                        // schema.sql §25 stops sending the prose, so there is nothing
                        // here to blur: the card says which band it is, that it exists,
                        // and what covers it.
                        <div className="p-3 sm:p-4">
                          <div className={SAMPLE_LOCKED}>
                            <div className="w-10 h-10 rounded-tile flex items-center justify-center border border-amber-500/40 bg-amber-400/15">
                              <Lock
                                className="w-5 h-5 text-amber-700 dark:text-amber-400"
                                aria-hidden="true"
                              />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              A Band {displayBand} exemplar at {group.mark}/{prompt.totalMarks}
                            </p>
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 max-w-sm">
                              It is written and marked. Exemplars above Band{' '}
                              {freeTierLimits().maxSampleBand} are part of{' '}
                              {planLabelForFeature('sampleAnswers')}, so this one stays on the
                              server until your plan covers it.
                            </p>
                            <button
                              onClick={() => requestUpgrade('sampleAnswers')}
                              className={`${SAMPLE_LOCKED_CTA} ${LOCK_CTA}`}
                            >
                              Unlock with {planLabelForFeature('sampleAnswers')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* The exemplar, in the reading face at the shared size. */}
                          <div className={SAMPLE_PAGE_TEXT} style={{ fontSize: `${fontSize}px` }}>
                            {renderFormattedText(
                              currentSample.answer,
                              prompt.keywords,
                              prompt.verb
                            )}
                          </div>

                          <div className={SAMPLE_PAGE_FOOT}>
                            <div className={SAMPLE_ACTIONS}>
                              {/* The word count is in the paper's bar, so the metrics show
                                  the keywords only. */}
                              <AnswerMetricsDisplay
                                metrics={metrics}
                                showLabel={false}
                                showWords={false}
                              />

                              <div className={SAMPLE_ACTION_GROUP}>
                                {/* "Use" writes the exemplar straight into the student's
                                    draft, which is the one thing the writing surface refuses
                                    to let a student do by hand: paste is blocked there so a
                                    response is the student's own writing. It is handed down
                                    only to a curator, who moves exemplars through the editor
                                    as part of the job — for a student the exemplar stays
                                    something to read and compare against. */}
                                {onUseSample && (
                                  <button
                                    type="button"
                                    onClick={handleUseSample}
                                    title="Load this exemplar into the writing surface"
                                    className={SAMPLE_ACTION}
                                  >
                                    <Copy className="w-3 h-3" aria-hidden="true" /> Use
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleCopy}
                                  className={SAMPLE_ACTION}
                                >
                                  {isCopied ? (
                                    <Check className="w-3 h-3" aria-hidden="true" />
                                  ) : (
                                    <FileText className="w-3 h-3" aria-hidden="true" />
                                  )}
                                  {isCopied ? 'Copied' : 'Copy'}
                                </button>
                                {onContribute && (
                                  <button
                                    type="button"
                                    onClick={handleContribute}
                                    disabled={isContributing}
                                    title="Submit this sample answer to the shared library for review"
                                    className={SAMPLE_ACTION}
                                  >
                                    <UploadCloud className="w-3 h-3" aria-hidden="true" />
                                    {isContributing ? 'Submitting…' : 'Submit'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onFlag(currentSample)}
                                  className={flagged ? FLAG_ACTIVE : SAMPLE_ACTION_ICON}
                                  title={
                                    flagged
                                      ? 'This sample is flagged for review — click to view'
                                      : 'Something off about this sample? Flag it for review'
                                  }
                                >
                                  <Flag
                                    className={`w-3.5 h-3.5 ${flagged ? 'fill-current' : ''}`}
                                    aria-hidden="true"
                                  />
                                </button>
                                {canModify && (
                                  <>
                                    <span className={SAMPLE_ACTION_DIVIDER} aria-hidden="true" />
                                    <button
                                      type="button"
                                      onClick={() => onRevise(currentSample)}
                                      className={SAMPLE_ACTION_ICON}
                                      title="Revise with AI"
                                    >
                                      <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onEdit(currentSample)}
                                      className={SAMPLE_ACTION_ICON}
                                      title="Edit manually"
                                    >
                                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDelete(currentSample.id)}
                                      className={`${SAMPLE_ACTION_ICON} ${DANGER_HOVER}`}
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Zone three: the marker's commentary. It sits outside the paper, on
                      the desk, with a solid band bar down its edge. The notes fold away
                      from the reader's own toggle. A locked exemplar shows no notes: the
                      lock covers the commentary as much as the text. */}
                  {!locked && (currentSample.quickTip || currentSample.feedback) && (
                    <div
                      role="group"
                      aria-label="Marker's commentary"
                      className={`${SAMPLE_COMMENTARY} ${LADDER_EDGE_OPEN}`}
                    >
                      <div className={SAMPLE_COMMENTARY_HEAD}>
                        <span className={`flex items-center gap-2 ${ZONE_LABEL}`}>
                          <MessageSquareQuote className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          Marker's commentary
                        </span>
                        <button
                          type="button"
                          onClick={() => setFeedbackExpanded((prev) => !prev)}
                          aria-expanded={feedbackExpanded}
                          aria-controls={notesId}
                          className={SAMPLE_NOTE_TOGGLE}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`w-3 h-3 transition-transform duration-200 ${feedbackExpanded ? '' : '-rotate-90'}`}
                          />
                          {feedbackExpanded ? 'Hide Feedback' : 'Show Feedback'}
                        </button>
                      </div>
                      <div
                        id={notesId}
                        inert={!feedbackExpanded}
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${feedbackExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                      >
                        <div className="overflow-hidden min-h-0">
                          <div className="flex flex-col gap-3 pb-1">
                            {currentSample.quickTip && (
                              <div className={LADDER_NOTE}>
                                <Lightbulb className={LADDER_NOTE_GLYPH} aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className={LADDER_NOTE_LABEL}>Coach's Tip</p>
                                  <div className={`mt-1 ${SAMPLE_NOTE_TEXT}`}>
                                    {renderFormattedText(
                                      currentSample.quickTip,
                                      prompt.keywords,
                                      prompt.verb
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {currentSample.feedback && (
                              <div className={LADDER_NOTE}>
                                <BookOpen className={LADDER_NOTE_GLYPH} aria-hidden="true" />
                                <div className="min-w-0">
                                  <p className={LADDER_NOTE_LABEL}>Feedback</p>
                                  <div className={`mt-1 ${SAMPLE_NOTE_TEXT}`}>
                                    {renderFormattedText(
                                      currentSample.feedback,
                                      prompt.keywords,
                                      prompt.verb
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

const SampleAnswersAccordion: React.FC<SampleAnswersAccordionProps> = ({
  prompt,
  syllabus,
  onSampleAnswerGenerated,
  onUseSampleAnswer,
  onDeleteSampleAnswer,
  onUpdateSampleAnswer,
  onContributeSampleAnswer,
  userRole,
  onRecalibrate,
  defaultCollapsed = true,
  fontSize: fontSizeProp,
  onFontSizeChange,
}) => {
  const [openGroupMark, setOpenGroupMark] = useState<number | null>(null);
  // Bumped to open the panel from outside it: a guide row's "Model answer", or a
  // batch of exemplars that has just been generated. AccordionSection opens on a
  // change to this number, so the panel never has to own its own open state here.
  const [openSignal, setOpenSignal] = useState(0);
  // The level a cross-link asked for, which the next render focuses and brings into
  // view. A ref and not state: it is a one-shot instruction, not something to draw.
  const pendingFocusMark = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<SampleAnswer | null>(null);
  const [editorTarget, setEditorTarget] = useState<SampleAnswer | null>(null);
  // Deleting an exemplar is destructive and single-click — route it through
  // the shared ConfirmationModal like every other delete in the app.
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<SampleAnswer | null>(null);
  // Reading size is a workspace-wide setting when the parent supplies one, so
  // zooming the question also zooms the exemplars. The local state is only the
  // fallback for any standalone use of this card.
  const [localFontSize, setLocalFontSize] = useState(15);
  const fontSize = fontSizeProp ?? localFontSize;
  const setFontSize = onFontSizeChange ?? setLocalFontSize;
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [isRecalibratePickerOpen, setIsRecalibratePickerOpen] = useState(false);

  const canCurate = canCurateContent(userRole);
  // AI generation (draft/recalibrate) is a separate capability from manual
  // curation so the role sets can diverge — see utils/permissions.ts.
  const canGenerate = canUseAiGeneration(userRole);
  const studioLocked = isFeatureLocked('aiContentStudio');
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const tier = commandTermInfo.tier;

  // The question's own ceiling, as the Marking Guide and Syllabus Terms have it:
  // the header is drawn in this band, so the three reference headers agree.
  const ceilingBand = useMemo(
    () => questionCeilingBand(prompt.totalMarks, prompt.verb),
    [prompt.totalMarks, prompt.verb]
  );

  const groupedAnswers = useMemo(() => {
    const groups: Record<number, GroupedSampleAnswers> = {};
    (prompt.sampleAnswers || []).forEach((sa) => {
      if (!groups[sa.mark]) {
        groups[sa.mark] = {
          mark: sa.mark,
          answers: [],
          calculatedBand: getBandForMark(sa.mark, prompt.totalMarks, tier),
        };
      }
      groups[sa.mark].answers.push(sa);
    });
    Object.values(groups).forEach((g) => g.answers.sort(byTrustworthiness));
    return Object.values(groups).sort((a, b) => b.mark - a.mark);
  }, [prompt.sampleAnswers, prompt.totalMarks, tier]);

  // The marks already on the question, for the revision dialog. A fresh array per
  // render would hand that dialog a new prop every time the panel re-renders.
  const existingMarks = useMemo(() => groupedAnswers.map((g) => g.mark), [groupedAnswers]);

  // The guide's rows, read with the same parser the Marking Guide draws them with,
  // so the criterion a row names is the criterion the guide shows at that level.
  const guideRows = useMemo(
    () => parseMarkingCriteria(prompt.markingCriteria ?? '', prompt.totalMarks, tier),
    [prompt.markingCriteria, prompt.totalMarks, tier]
  );

  const totalSamples = groupedAnswers.reduce((sum, g) => sum + g.answers.length, 0);

  /**
   * The header's second line: the question's marks, then the exemplar TOTAL and the
   * level count, the same way the Marking Guide's line states its band. Eleven models
   * over three levels and three models over three levels are very different things
   * to walk into, and the marks say which ladder they are on.
   */
  const subtitle =
    groupedAnswers.length > 0
      ? `${prompt.totalMarks} marks · ${totalSamples} exemplar${totalSamples === 1 ? '' : 's'} · ${groupedAnswers.length} level${groupedAnswers.length === 1 ? '' : 's'}`
      : `${prompt.totalMarks} marks · No exemplars yet`;

  /** Opens the panel, then the row at `mark`. The one way both an outside request
   *  and a freshly generated exemplar open the panel, so they cannot drift. */
  const openLevel = (mark: number) => {
    setOpenSignal((n) => n + 1);
    setOpenGroupMark(mark);
  };

  // A guide row's "Model answer" asks for its level. The nearest level stands in
  // when the mark does not match one exactly, so the panel opens somewhere sensible.
  useOpenExemplarRequest(prompt.id, (requested) => {
    const target = nearestExemplarMark(
      groupedAnswers.map((g) => g.mark),
      requested
    );
    if (target === undefined) return;
    pendingFocusMark.current = target;
    openLevel(target);
  });

  // After a cross-link has opened its level, bring that row into view and move
  // focus to its disclosure. It runs after every render, but acts only on the one
  // request in the ref, and clears it on the first attempt, so a later render
  // cannot steal focus from wherever the student has gone since.
  useEffect(() => {
    const mark = pendingFocusMark.current;
    if (mark === null) return;
    pendingFocusMark.current = null;
    const disclosure = bodyRef.current?.querySelector<HTMLButtonElement>(
      `[data-exemplar-mark="${mark}"]`
    );
    if (!disclosure) return;
    const row = disclosure.closest<HTMLElement>('[data-exemplar-row]') ?? disclosure;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    disclosure.focus({ preventScroll: true });
  });

  const handleRecalibrate = async (
    sampleIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => {
    if (!onRecalibrate) return;
    setIsRecalibrating(true);
    try {
      await onRecalibrate(sampleIds, onProgress);
    } finally {
      // Always release the spinner — a failed AI call must not leave the
      // button stuck in its "recalibrating" state.
      setIsRecalibrating(false);
    }
  };

  const body = (
    <div ref={bodyRef} className="flex flex-col gap-3">
      {/* The tools: reading size for everybody, and the AI actions for staff only,
          in the Marking Guide's slim row so the two bodies open the same way. */}
      <div className={SAMPLE_TOOLS}>
        <div className={SAMPLE_ZOOM}>
          <button
            type="button"
            onClick={() => setFontSize(Math.max(12, fontSize - 2))}
            disabled={fontSize <= 12}
            className={SAMPLE_ZOOM_BUTTON}
            title="Decrease text size"
          >
            <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className={SAMPLE_ZOOM_VALUE}>{fontSize}</span>
          <button
            type="button"
            onClick={() => setFontSize(Math.min(32, fontSize + 2))}
            disabled={fontSize >= 32}
            className={SAMPLE_ZOOM_BUTTON}
            title="Increase text size"
          >
            <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {canGenerate && (
          <>
            {onRecalibrate && (
              <button
                type="button"
                onClick={() => setIsRecalibratePickerOpen(true)}
                disabled={isRecalibrating || !prompt.sampleAnswers?.length}
                className={`${SAMPLE_AI_BUTTON} px-2.5`}
                title="Recalibrate samples with AI — choose which ones"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRecalibrating ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              type="button"
              onClick={
                studioLocked
                  ? () => requestUpgrade('aiContentStudio')
                  : () => setIsGeneratorOpen(true)
              }
              title={
                studioLocked
                  ? `AI sample-answer generation is part of ${planLabelForFeature('aiContentStudio')} — tap to learn more`
                  : 'Add a sample answer with AI'
              }
              aria-label="Generate a sample answer"
              className={studioLocked ? AI_LOCKED : SAMPLE_AI_BUTTON}
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">Generate</span>
              {studioLocked && <PlusLockChip />}
            </button>
          </>
        )}
      </div>

      {groupedAnswers.length > 0 ? (
        <div className={LADDER_STACK}>
          {groupedAnswers.map((group) => (
            <ExemplarRow
              key={group.mark}
              group={group}
              prompt={prompt}
              isOpen={openGroupMark === group.mark}
              onToggle={() => setOpenGroupMark((prev) => (prev === group.mark ? null : group.mark))}
              onUseSample={onUseSampleAnswer}
              onRevise={(sa) => setRevisionTarget(sa)}
              onEdit={(sa) => setEditorTarget(sa)}
              onDelete={(id) => setDeleteTargetId(id)}
              onContribute={onContributeSampleAnswer}
              onFlag={(sa) => setFlagTarget(sa)}
              canModify={canCurate}
              fontSize={fontSize}
              criterion={criterionForMark(guideRows, group.mark, group.calculatedBand)}
            />
          ))}
        </div>
      ) : (
        <div className={SAMPLE_EMPTY}>
          <FileText
            className="w-8 h-8 mb-2 text-slate-600 dark:text-slate-300"
            aria-hidden="true"
          />
          <p className="t-label text-slate-700 dark:text-slate-300">
            No model responses available yet.
          </p>
          {canCurate && (
            <p className="t-label text-slate-700 dark:text-slate-300">
              Click generate to create exemplary answers.
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Lazy: a folded panel mounts none of its rows, so the text metrics each
          row runs happen only while the panel is on screen. */}
      <AccordionSection
        title="Sample Answers"
        subtitle={subtitle}
        icon={<Bookmark />}
        band={ceilingBand}
        hero
        defaultOpen={!defaultCollapsed}
        resetKey={prompt.id}
        supportId="sampleAnswers"
        forceOpenSignal={openSignal}
        lazy
      >
        {body}
      </AccordionSection>

      <SampleAnswerGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        prompt={prompt}
        syllabus={syllabus}
        onSampleAnswerGenerated={(answer) => {
          // Open the panel behind the modal as the batch lands. A teacher who
          // just generated five exemplars into a folded card had nothing to
          // show for it but a toast, and the panel defaults to folded.
          openLevel(answer.mark);
          onSampleAnswerGenerated(answer);
        }}
      />

      {onRecalibrate && (
        <RecalibrateSamplesModal
          isOpen={isRecalibratePickerOpen}
          onClose={() => setIsRecalibratePickerOpen(false)}
          prompt={prompt}
          onRecalibrate={handleRecalibrate}
        />
      )}

      {revisionTarget && (
        <SampleAnswerRevisionModal
          isOpen={!!revisionTarget}
          onClose={() => setRevisionTarget(null)}
          prompt={prompt}
          syllabus={syllabus}
          sampleToRevise={revisionTarget}
          existingMarks={existingMarks}
          onRevisionComplete={(sa) => {
            onSampleAnswerGenerated(sa);
            setRevisionTarget(null);
          }}
        />
      )}

      {editorTarget && (
        <SampleAnswerEditorModal
          isOpen={!!editorTarget}
          onClose={() => setEditorTarget(null)}
          prompt={prompt}
          sampleToEdit={editorTarget}
          onSave={(updated) => {
            onUpdateSampleAnswer(updated);
            setEditorTarget(null);
          }}
        />
      )}

      {flagTarget && (
        <FlagContentModal
          isOpen={!!flagTarget}
          onClose={() => setFlagTarget(null)}
          itemLabel="sample answer"
          existingFlag={flagTarget.contentFlag}
          onFlag={(reason) =>
            onUpdateSampleAnswer({
              ...flagTarget,
              contentFlag: { reason, flaggedAt: Date.now(), status: 'open' },
            })
          }
          onResolve={() =>
            onUpdateSampleAnswer(
              flagTarget.contentFlag
                ? {
                    ...flagTarget,
                    contentFlag: { ...flagTarget.contentFlag, status: 'resolved' },
                  }
                : flagTarget
            )
          }
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) onDeleteSampleAnswer(deleteTargetId);
        }}
        title="Delete this sample answer?"
        message="The model response will be removed from this question. This cannot be undone."
        confirmButtonText="Delete"
        isDestructive
      />
    </>
  );
};

interface SampleAnswersAccordionProps {
  prompt: Prompt;
  /** The syllabus this question sits under, so a generated or revised exemplar
   *  is written on the terms that syllabus and the question actually name. */
  syllabus?: SyllabusKeywordContext;
  onSampleAnswerGenerated: (answer: SampleAnswer) => void;
  /** Load an exemplar into the writing surface. Supplied for a curator only:
   *  a student's draft has to be a student's own writing (see Editor's paste
   *  guard), and this button is the same act in one click. */
  onUseSampleAnswer?: (text: string) => void;
  onDeleteSampleAnswer: (id: string) => void;
  onUpdateSampleAnswer: (answer: SampleAnswer) => void;
  onContributeSampleAnswer?: (answer: SampleAnswer) => void | Promise<void>;
  userRole: UserRole;
  /** Re-mark the chosen exemplars against the rubric. */
  onRecalibrate?: (
    sampleIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  /** Start folded. Defaults to true, matching the rail's other panels. */
  defaultCollapsed?: boolean;
  /** Shared workspace reading size. Omit to keep a private size. */
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}

export default SampleAnswersAccordion;
