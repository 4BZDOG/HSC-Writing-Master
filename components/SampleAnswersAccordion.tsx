import React, { useId, useState, useMemo, useEffect } from 'react';
import { Prompt, SampleAnswer, UserRole } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import {
  renderFormattedText,
  getBandConfig,
  getBandRgb,
  getTierScaleConfig,
  cleanMarkdown,
} from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../utils/panelStyles';
import {
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TITLE,
  RIBBON_MINI_BAR_UNLIT,
  RIBBON_MINI_STAIR,
  RIBBON_TIER_CARD_IDLE,
} from '../utils/verbRibbonChrome';
import {
  SAMPLE_EXEMPLAR_ACTIONS,
  SAMPLE_EXEMPLAR_TOOLBAR,
  SAMPLE_MINI_BAR,
  SAMPLE_ROW_CAROUSEL,
  SAMPLE_ROW_CHEVRON,
  SAMPLE_ROW_DISCLOSURE,
  SAMPLE_ROW_LINE,
  SAMPLE_ROW_SCOREBOARD,
  SAMPLE_PANEL_BODY,
  SAMPLE_PANEL_HEADER,
  SAMPLE_PANEL_LIT_EDGE,
  SAMPLE_PANEL_LIT_GLOW,
  SAMPLE_PANEL_TOGGLE,
  SAMPLE_PANEL_TOOLS,
  SAMPLE_ROW,
  SAMPLE_ROW_BODY,
  SAMPLE_ROW_EDGE_OPEN,
  SAMPLE_ROW_EDGE_SHUT,
  SAMPLE_ROW_HEADER,
  SAMPLE_ROW_META,
  SAMPLE_STAT_CELL,
  SAMPLE_STAT_GRID,
  SAMPLE_STAT_LABEL,
  SAMPLE_STAT_VALUE,
} from '../utils/sampleAnswerChrome';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import { useSupportResource } from '../hooks/useSupportResource';
import type { SyllabusKeywordContext } from '../services/geminiService';
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
  Award,
  Edit3,
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

// --- Shared Internal Components ---

/** Words in an exemplar, counted the way the live word guide counts a draft. */
const countWords = (text: string | undefined): number =>
  (text || '').trim().split(/\s+/).filter(Boolean).length;

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} light:opacity-[0.08] pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

interface GroupedSampleAnswers {
  mark: number;
  answers: SampleAnswer[];
  /** Band for this mark level, derived via the Verb Gate (getBandForMark). */
  calculatedBand: number;
}

/** Exemplar chips shown at a mark level before the rest fold behind "+N more". */
const VISIBLE_VARIANTS = 4;

const wordCountOf = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

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

/**
 * Where an exemplar came from — and, for an AI one, whether it was written from
 * scratch or lifted from a student's own response. A "Student + AI" sample
 * carries the student's structure and voice, so it is read (and trusted)
 * differently from a clean-room AI exemplar, and gets its own colour and icon
 * pair rather than being filed under the same grey "AI Model" chip.
 */
const SourceBadge: React.FC<{ source?: string; derivedFromStudent?: boolean }> = ({
  source,
  derivedFromStudent,
}) => {
  const isUser = source === 'USER';
  const isHsc = source === 'HSC_EXEMPLAR';
  const isUpgrade = source === 'AI' && !!derivedFromStudent;

  const config = isUser
    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    : isHsc
      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
      : isUpgrade
        ? 'bg-violet-500/10 text-violet-500 dark:text-violet-400 border-violet-500/25'
        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';

  const Icon = isUser ? UserIcon : isHsc ? BookOpen : Sparkles;
  const label = isUser ? 'Student' : isHsc ? 'Official' : isUpgrade ? 'Student + AI' : 'AI Model';
  const title = isUpgrade
    ? "A student's own response, rewritten by the AI to reach the next mark"
    : isUser
      ? 'A response written by a student and marked by the AI'
      : isHsc
        ? 'A verified HSC exemplar'
        : 'Written by the AI from the question and rubric';

  return (
    <span
      title={title}
      className={`t-label inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${config}`}
    >
      {isUpgrade ? (
        <span className="inline-flex items-center gap-0.5">
          <UserIcon className="w-2.5 h-2.5" />
          <Sparkles className="w-2.5 h-2.5" />
        </span>
      ) : (
        <Icon className="w-2.5 h-2.5" />
      )}
      {label}
    </span>
  );
};

const CarouselAccordionItem: React.FC<{
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
}> = React.memo(
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
    // The row's expansion, named for its disclosure button (aria-controls).
    const bodyId = useId();
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
    // Band number AND colour both come from the Verb Gate (getBandForMark)
    // — so a Band 5 is always blue, Band 4 green, Band 6 purple, and this
    // placard mirrors the Marking Guide exactly.
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
      await navigator.clipboard.writeText(cleanMarkdown(currentSample.answer));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    const handleContribute = () => {
      if (!onContribute || isContributing) return;
      setIsContributing(true);
      // The handler runs its own AI screen + toast; resolve either shape.
      Promise.resolve(onContribute(currentSample)).finally(() => setIsContributing(false));
    };

    // A row is a tier card, in the ribbon's vocabulary: its edge is the group's own
    // band, drawn from `--band-rgb` (set from `getBandRgb(displayBand)`), a whisper
    // when shut and a statement when open. Its header is the band's tint, and the
    // figures sit in a scoreboard. Nothing here is a second copy of the band palette.
    return (
      <div
        style={{ '--band-rgb': getBandRgb(displayBand) } as React.CSSProperties}
        className={`group ${SAMPLE_ROW} ${RIBBON_TIER_CARD_IDLE} ${isOpen ? SAMPLE_ROW_EDGE_OPEN : SAMPLE_ROW_EDGE_SHUT}`}
      >
        <div className={SAMPLE_ROW_HEADER}>
          {/* The disclosure. It holds the scoreboard and the chevron, and it is a
              button of its own: the carousel's controls are siblings of it on the
              line beneath (see below), never inside it, so no button is nested in
              another. */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={bodyId}
            className={SAMPLE_ROW_DISCLOSURE}
          >
            {/* The scoreboard. Each figure is one text run, so the row reads as
              "6/6 marks" and "12 words" to a screen reader and to a search. The
              band figure takes the band's own text shade, which is the one colour
              a row says in words as well as in its edge. */}
            <div className={SAMPLE_ROW_SCOREBOARD}>
              <div className={SAMPLE_STAT_GRID}>
                <div className={SAMPLE_STAT_CELL}>
                  <span className={SAMPLE_STAT_LABEL}>Mark</span>
                  <span className={`${SAMPLE_STAT_VALUE} text-slate-900 dark:text-white`}>
                    {group.mark}/{prompt.totalMarks} marks
                  </span>
                </div>
                <div className={SAMPLE_STAT_CELL}>
                  <span className={SAMPLE_STAT_LABEL}>Band</span>
                  <span className={`${SAMPLE_STAT_VALUE} ${bandConfig.text}`}>{displayBand}</span>
                </div>
                {/* Its length, because the first thing a student does with an
                exemplar is hold their own draft up against it, and the word
                guide under their draft counts in the same unit. */}
                {!locked && (
                  <div className={SAMPLE_STAT_CELL}>
                    <span className={SAMPLE_STAT_LABEL}>Length</span>
                    <span
                      className={`${SAMPLE_STAT_VALUE} text-slate-900 dark:text-white tabular-nums`}
                    >
                      {countWords(currentSample.answer)} words
                    </span>
                  </div>
                )}
                {group.answers.length > 1 && (
                  <div className={SAMPLE_STAT_CELL}>
                    <span className={SAMPLE_STAT_LABEL}>Exemplars</span>
                    <span
                      className={`${SAMPLE_STAT_VALUE} text-slate-900 dark:text-white tabular-nums`}
                    >
                      {group.answers.length}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <ChevronDown
              className={`${SAMPLE_ROW_CHEVRON} ${isOpen ? 'rotate-180 text-slate-600 dark:text-white' : 'text-slate-400'}`}
            />
          </button>

          {/* The line beneath the disclosure: what the exemplar is (its source and
              its flag) on the left, and the carousel on the right. The carousel's
              buttons are siblings of the disclosure, so pressing them steps through
              the exemplars and leaves the row as it is. */}
          <div className={SAMPLE_ROW_LINE}>
            <div className={SAMPLE_ROW_META}>
              <SourceBadge
                source={currentSample.source}
                derivedFromStudent={currentSample.derivedFromStudent}
              />
              {currentSample.contentFlag?.status === 'open' && (
                <span
                  className="t-label inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30"
                  title={`Flagged for review: ${currentSample.contentFlag.reason}`}
                >
                  <Flag className="w-2.5 h-2.5 fill-current" /> Flagged
                </span>
              )}
            </div>

            {isOpen && group.answers.length > 1 && (
              <div className={SAMPLE_ROW_CAROUSEL}>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous sample"
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {/* "2 of 3", not a bare "2": the position is meaningless
                    without the total, and a batch of exemplars now arrives
                    several at a time. */}
                <span className="text-[11px] font-bold px-1 text-center text-slate-600 dark:text-slate-300 tabular-nums">
                  {currentIndex + 1}/{group.answers.length}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next sample"
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Smooth Expansion Animation Container */}
        <div
          id={bodyId}
          inert={!isOpen}
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className={SAMPLE_ROW_BODY}>
              {/* A locked exemplar is a locked exemplar, not a blurred one.
                  This was `blur-sm` over the real prose, which the server had
                  already sent — one class removed in the inspector and the
                  library was free. schema.sql §25 stops sending it, so there is
                  nothing here to blur: the card says which band it is, that it
                  exists, and what covers it. */}
              {locked ? (
                <div className="rounded-2xl border border-dashed border-amber-400/30 bg-amber-400/[0.04] light:bg-amber-50/60 px-6 py-8 flex flex-col items-center text-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-500" />
                  </div>
                  <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    A Band {displayBand} exemplar at {group.mark}/{prompt.totalMarks}
                  </p>
                  <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 max-w-sm">
                    It is written and marked. Exemplars above Band {freeTierLimits().maxSampleBand}{' '}
                    are part of {planLabelForFeature('sampleAnswers')}, so this one stays on the
                    server until your plan covers it.
                  </p>
                  <button
                    onClick={() => requestUpgrade('sampleAnswers')}
                    className="t-label px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg hover:scale-105 active:scale-[0.98] transition-all"
                  >
                    Unlock with {planLabelForFeature('sampleAnswers')}
                  </button>
                </div>
              ) : (
                <div
                  // The exemplar's own container, and the fourth place this band
                  // is stated inside one strip: the 56px mark tile says it, the
                  // strip's wash says it, the left rail says it, and then a
                  // fully opaque `orange-600` rectangle — 719x286 of it, measured
                  // — is drawn around the prose. Nothing about the answer itself
                  // is orange, so the loudest line in the panel belonged to the
                  // one part of it with no band content. `band-edge` keeps the
                  // container closed and lets the three cues that ARE about the
                  // band carry it.
                  style={{ '--band-rgb': getBandRgb(displayBand) } as React.CSSProperties}
                  className={`relative rounded-2xl bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))] border band-edge overflow-hidden shadow-inner`}
                >
                  {/* Which exemplar, of the several at this mark.
                      The arrows in the header can step through them, but they
                      say nothing about what is being stepped through: "2 of 5"
                      turns five distinct exemplars into a shuffle, and a student
                      reads all five to find out that four were AI variations on
                      the same shape. Naming each one by where it came from and
                      how long it is makes the choice a choice — most students
                      want the Official one and one contrast, not the set. */}
                  {group.answers.length > 1 && (
                    <div className="px-4 pt-4">
                      <p className="t-label text-slate-500 dark:text-slate-400 mb-2">
                        {group.answers.length} exemplars at {group.mark}/{prompt.totalMarks}
                      </p>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="tablist"
                        aria-label="Exemplars at this mark"
                      >
                        {visibleVariants.map((sample, i) => {
                          const isCurrent = i === currentIndex;
                          return (
                            <button
                              key={sample.id}
                              role="tab"
                              aria-selected={isCurrent}
                              onClick={() => setCurrentIndex(i)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                isCurrent
                                  ? `${bandConfig.solidBg} ${bandConfig.solidText} border-transparent shadow-sm`
                                  : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              {sourceLabel(sample)}
                              <span className={isCurrent ? 'opacity-70' : 'opacity-60'}>
                                {' · '}
                                {wordCountOf(sample.answer)}w
                              </span>
                            </button>
                          );
                        })}
                        {group.answers.length > visibleVariants.length && (
                          <button
                            onClick={() => setShowAllVariants(true)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-dashed border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            +{group.answers.length - visibleVariants.length} more
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Controls Bar */}
                  <div className={SAMPLE_EXEMPLAR_TOOLBAR}>
                    <AnswerMetricsDisplay
                      metrics={metrics}
                      showLabel={false}
                      className="opacity-100 scale-95 origin-left"
                      band={displayBand}
                    />

                    <div className={SAMPLE_EXEMPLAR_ACTIONS}>
                      {/* "Use" writes the exemplar straight into the student's
                        draft, which is the one thing the writing surface refuses
                        to let a student do by hand: paste is blocked there so a
                        response is the student's own writing. A button that did
                        the same job in one click left the front door locked and
                        the window open. It is handed down only to a curator, who
                        moves exemplars through the editor as part of the job —
                        for a student the exemplar stays something to read and
                        compare against. */}
                      {onUseSample && (
                        <button
                          onClick={handleUseSample}
                          title="Load this exemplar into the writing surface"
                          className="t-label px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-1.5"
                        >
                          <Copy className="w-3 h-3" /> Use
                        </button>
                      )}
                      <button
                        onClick={handleCopy}
                        className="t-label px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center gap-1.5"
                      >
                        {isCopied ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        {isCopied ? 'Copied' : 'Copy'}
                      </button>
                      {onContribute && (
                        <button
                          onClick={handleContribute}
                          disabled={isContributing}
                          title="Submit this sample answer to the shared library for review"
                          className="t-label px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <UploadCloud className="w-3 h-3" />{' '}
                          {isContributing ? 'Submitting…' : 'Submit'}
                        </button>
                      )}
                      <button
                        onClick={() => onFlag(currentSample)}
                        className={`p-1.5 rounded-lg transition-all ${
                          currentSample.contentFlag?.status === 'open'
                            ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
                            : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        }`}
                        title={
                          currentSample.contentFlag?.status === 'open'
                            ? 'This sample is flagged for review — click to view'
                            : 'Something off about this sample? Flag it for review'
                        }
                      >
                        <Flag
                          className={`w-3.5 h-3.5 ${currentSample.contentFlag?.status === 'open' ? 'fill-current' : ''}`}
                        />
                      </button>
                      {canModify && <div className="w-px h-4 bg-slate-300 dark:bg-white/10 mx-1" />}
                      {canModify && (
                        <>
                          <button
                            onClick={() => onRevise(currentSample)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                            title="Revise with AI"
                          >
                            <Repeat className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEdit(currentSample)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                            title="Edit manually"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(currentSample.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className="p-6 font-serif leading-loose text-slate-700 dark:text-slate-300 whitespace-pre-wrap transition-all duration-200"
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
                  >
                    {renderFormattedText(currentSample.answer, prompt.keywords, prompt.verb)}
                  </div>
                </div>
              )}

              {/* Feedback and Coach's Tip — collapsible */}
              {(currentSample.quickTip || currentSample.feedback) && (
                <div className="mt-3">
                  <button
                    onClick={() => setFeedbackExpanded((prev) => !prev)}
                    className="t-label flex items-center gap-1.5 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))] transition-colors mb-2"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${feedbackExpanded ? '' : '-rotate-90'}`}
                    />
                    {feedbackExpanded ? 'Hide Feedback' : 'Show Feedback'}
                  </button>
                  <div
                    inert={!feedbackExpanded}
                    className={`grid transition-all duration-300 ease-in-out ${feedbackExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="overflow-hidden space-y-3">
                      {currentSample.quickTip && (
                        <div
                          className={`px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-900/10 flex items-start gap-3`}
                        >
                          <div className="mt-0.5 p-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <Lightbulb className="w-3 h-3" />
                          </div>
                          <div>
                            <p className="t-label text-indigo-600 dark:text-indigo-400 mb-1">
                              Coach's Tip
                            </p>
                            <p className="text-xs text-indigo-900 dark:text-indigo-200/90 leading-relaxed font-medium">
                              {currentSample.quickTip}
                            </p>
                          </div>
                        </div>
                      )}

                      {currentSample.feedback && (
                        <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-500/20 flex items-start gap-3">
                          <div className="mt-0.5 p-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                            <BookOpen className="w-3 h-3" />
                          </div>
                          <div>
                            <p className="t-label text-amber-600 dark:text-amber-400 mb-1">
                              Feedback
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed">
                              {renderFormattedText(
                                currentSample.feedback,
                                prompt.keywords,
                                prompt.verb
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
  // Folded by default, like the Marking Guide and Grade Standards it sits with.
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const panelId = useId();
  const opened = useOpenedOnce(!isCollapsed, prompt.id);
  useSupportResource(prompt.id, 'sampleAnswers', !isCollapsed);
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

  const maxPossibleBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier),
    [prompt.totalMarks, commandTermInfo.tier]
  );

  // Placard chrome uses the verb's tier identity (matches the prompt and
  // writing surface); the band ceiling stays numeric in the subtitle.
  const maxBandConfig = useMemo(
    () => getTierScaleConfig(commandTermInfo.tier),
    [commandTermInfo.tier]
  );

  const groupedAnswers = useMemo(() => {
    const groups: Record<number, GroupedSampleAnswers> = {};
    (prompt.sampleAnswers || []).forEach((sa) => {
      if (!groups[sa.mark]) {
        groups[sa.mark] = {
          mark: sa.mark,
          answers: [],
          calculatedBand: getBandForMark(sa.mark, prompt.totalMarks, commandTermInfo.tier),
        };
      }
      groups[sa.mark].answers.push(sa);
    });
    Object.values(groups).forEach((g) => g.answers.sort(byTrustworthiness));
    return Object.values(groups).sort((a, b) => b.mark - a.mark);
  }, [prompt.sampleAnswers, prompt.totalMarks, prompt.verb, commandTermInfo.tier]);

  const totalSamples = groupedAnswers.reduce((sum, g) => sum + g.answers.length, 0);

  /**
   * The folded card's second line.
   *
   * The exemplar TOTAL, not just the level count: eleven models spread over
   * three levels and three models over three levels are very different things
   * to walk into, and this used to describe both as "3 performance levels".
   *
   * Built once rather than inline, so the `title` that makes it readable when
   * it truncates is the same string it renders. On a phone the line wants
   * 195px in a 138px row, and the part that gets cut is the band ceiling on
   * the end.
   */
  const exemplarSummary =
    (groupedAnswers.length > 0
      ? `${groupedAnswers.length} level${groupedAnswers.length === 1 ? '' : 's'} · ${totalSamples} exemplar${totalSamples === 1 ? '' : 's'}`
      : 'No models yet') + ` · Band ceiling ${maxPossibleBand}`;

  // The tier's hue for the whole panel: the tile, the edge and the glow below are
  // all drawn from this one `--band-rgb`, the same palette the rows and the ribbon
  // use. A verb always has a tier, so the tile is always lit.
  const tierRgb = getBandRgb(commandTermInfo.tier);

  // The mini ladder: six bars, one per band, read against the verb's ceiling.
  // Three states, and they are the point of the glyph:
  //   - SOLID, in the band's colour: at least one exemplar is written at that
  //     band. The student has a model to read there.
  //   - FAINT, the band's colour at a third: the verb can reach that band, and no
  //     exemplar has been written for it yet. This is the gap a curator fills.
  //   - GREY: above the verb's band ceiling, so no response to it can reach that
  //     band whatever the student writes.
  // A band that is covered is always within the ceiling (`getBandForMark` caps
  // every group at the verb's tier), so SOLID is a subset of the reachable bands.
  const coveredBands = useMemo(
    () => new Set(groupedAnswers.map((g) => g.calculatedBand)),
    [groupedAnswers]
  );
  const ladderTitle = `Model answers at ${
    coveredBands.size > 0
      ? `Band ${[...coveredBands].sort((a, b) => a - b).join(', ')}`
      : 'no band yet'
  }; band ceiling Band ${maxPossibleBand}`;

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

  return (
    // The panel is a tier-lit card when it is open: its edge and its glow are the
    // tier's, drawn from `--band-rgb`, the same device as the verb ribbon's stage.
    // Shut, it is the neutral folder every other reference panel is. The glow is a
    // box shadow and not a sibling layer, because PANEL_SURFACE is pinned as the
    // panel's root (see SAMPLE_PANEL_LIT_GLOW).
    <div
      style={
        {
          '--band-rgb': tierRgb,
          ...(isCollapsed
            ? {}
            : { borderColor: SAMPLE_PANEL_LIT_EDGE, boxShadow: SAMPLE_PANEL_LIT_GLOW }),
        } as React.CSSProperties
      }
      className={`${PANEL_SURFACE} mb-3 last:mb-0`}
    >
      {/* Header: the disclosure on the left, the panel's own controls on the
          right. Reading size, "Generate" and "Recalibrate" used to live in a
          strip inside the body, which meant a student had to open the panel to
          make the exemplars readable and a teacher had to open it to add one.
          They belong in the chrome, where a panel's controls are expected — and
          where they stay reachable while it is folded.

          Access is decided per control: the zoom is a reading aid everybody
          gets, while the two AI actions are gated on `canUseAiGeneration` and
          are simply not rendered for a student or a guest. */}
      <div className={`${SAMPLE_PANEL_HEADER} ${isCollapsed ? '' : PANEL_HEADER_OPEN}`}>
        <div
          className={`absolute inset-0 opacity-[0.03] bg-gradient-to-r ${maxBandConfig.gradient} pointer-events-none`}
        />

        <button
          onClick={() => setIsCollapsed((c) => !c)}
          aria-expanded={!isCollapsed}
          aria-controls={panelId}
          className={`${SAMPLE_PANEL_TOGGLE} ${PANEL_ROW_MIN_H} group ${
            isCollapsed ? PANEL_HEADER_CLOSED : ''
          }`}
        >
          {/* The tier's tile, in the ribbon's header vocabulary. The tier is always
              known for a verb, so the tile is always lit — the ribbon does the same
              once a verb is chosen. Its icon stays the bookmark this panel has. */}
          <div
            className={`${RIBBON_HEADER_TILE} ${maxBandConfig.solidBg} ${maxBandConfig.solidText} border-white/20`}
          >
            <Bookmark className="w-4 h-4" />
          </div>
          <div className="text-left min-w-0">
            {/* The panel's own name, in the ribbon's header title voice. The
                exemplar summary under it is the ribbon's sublabel. */}
            <span className={RIBBON_HEADER_TITLE}>Sample Answers</span>
            <span title={exemplarSummary} className={RIBBON_HEADER_SUBLABEL}>
              {exemplarSummary}
            </span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
            <PanelReadChip show={opened && isCollapsed} />
            <ChevronDown
              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-500 ${
                isCollapsed ? '' : 'rotate-180 text-slate-900 dark:text-white'
              }`}
            />
          </div>
        </button>

        <div className={SAMPLE_PANEL_TOOLS}>
          {/* The ceiling in miniature, as the ribbon draws it: one bar per band,
              rising. It is decorative — the summary above says the same in words,
              so it is hidden from assistive technology, and below `sm` it is not
              drawn at all, as the ribbon's is not. It sits with the tools rather
              than in the title's row, so when the header wraps it wraps with them
              and never takes room from the title. See `ladderTitle` for the reading
              of each state. */}
          <span className={RIBBON_MINI_STAIR} aria-hidden="true" title={ladderTitle}>
            {[1, 2, 3, 4, 5, 6].map((band) => {
              const reachable = band <= maxPossibleBand;
              const covered = coveredBands.has(band);
              const bandRgb = getBandRgb(band);
              const fill = covered
                ? { backgroundColor: `rgb(${bandRgb.split(' ').join(', ')})` }
                : reachable
                  ? { backgroundColor: `rgba(${bandRgb.split(' ').join(', ')}, 0.35)` }
                  : {};
              return (
                <span
                  key={band}
                  className={`${SAMPLE_MINI_BAR} ${reachable ? '' : RIBBON_MINI_BAR_UNLIT}`}
                  style={{ height: `${5 + (band - 1) * 2.2}px`, ...fill }}
                />
              );
            })}
          </span>
          <div className="flex items-center gap-0.5 bg-white dark:bg-black/20 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              disabled={fontSize <= 12}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
              title="Decrease text size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 w-5 text-center select-none">
              {fontSize}
            </span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              disabled={fontSize >= 32}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
              title="Increase text size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {canGenerate && (
            <>
              {onRecalibrate && (
                <button
                  onClick={() => setIsRecalibratePickerOpen(true)}
                  disabled={isRecalibrating || !prompt.sampleAnswers?.length}
                  className={`
                    p-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10
                    text-slate-500 hover:text-indigo-500 disabled:opacity-50 transition-all
                    ${isRecalibrating ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-200' : ''}
                  `}
                  title="Recalibrate samples with AI — choose which ones"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalibrating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
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
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm hover:shadow-lg transition-all ${
                  studioLocked
                    ? 'bg-amber-400/10 border-amber-400/40 text-amber-600 dark:text-amber-400'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-500/30 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Generate</span>
                {studioLocked && <PlusLockChip />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folded away means not rendered — a card with several exemplars, each
          running its own metrics, should not keep working out of sight. */}
      {!isCollapsed && (
        <div id={panelId} className={SAMPLE_PANEL_BODY}>
          {groupedAnswers.length > 0 ? (
            groupedAnswers.map((group) => (
              <CarouselAccordionItem
                key={group.mark}
                group={group}
                prompt={prompt}
                isOpen={openGroupMark === group.mark}
                onToggle={() =>
                  setOpenGroupMark((prev) => (prev === group.mark ? null : group.mark))
                }
                onUseSample={onUseSampleAnswer}
                onRevise={(sa) => setRevisionTarget(sa)}
                onEdit={(sa) => setEditorTarget(sa)}
                onDelete={(id) => setDeleteTargetId(id)}
                onContribute={onContributeSampleAnswer}
                onFlag={(sa) => setFlagTarget(sa)}
                canModify={canCurate}
                fontSize={fontSize}
              />
            ))
          ) : (
            <div className="py-12 flex flex-col items-center text-center">
              <FileText className="w-8 h-8 text-slate-500 mb-3" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                No model responses available yet.
              </p>
              {canCurate && (
                <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                  Click generate to create exemplary answers.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <SampleAnswerGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        prompt={prompt}
        syllabus={syllabus}
        onSampleAnswerGenerated={(answer) => {
          // Open the panel behind the modal as the batch lands. A teacher who
          // just generated five exemplars into a folded card had nothing to
          // show for it but a toast, and the panel defaults to folded.
          setIsCollapsed(false);
          setOpenGroupMark(answer.mark);
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
          existingMarks={groupedAnswers.map((g) => g.mark)}
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
    </div>
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
