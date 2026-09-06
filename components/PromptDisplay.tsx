import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ToastType } from '../hooks/useToast';
import { createPortal } from 'react-dom';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import {
  Edit3,
  Save,
  X,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  Link2,
  Wand2,
  Award,
  ShieldCheck,
  Info,
  Clock,
  Quote,
  FileQuestion,
  ZoomIn,
  ZoomOut,
  Loader2,
  Target,
  Flag,
  Landmark,
  ImagePlus,
} from 'lucide-react';
import { getTierScaleConfig, renderFormattedText } from '../utils/renderUtils';
import MathSymbolToolbar from './MathSymbolToolbar';
import ScenarioImageUploader from './ScenarioImageUploader';
import ScenarioCarousel from './ScenarioCarousel';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { naturalCardHeight } from '../utils/layoutConstants';
import { useChromeHeightReporter } from '../hooks/useChromeHeightReporter';
import {
  CARD_HEADER_BAR,
  CARD_HEADER_BOX,
  CARD_HEADER_ICON,
  CARD_HEADER_IDENTITY,
  CARD_HEADER_META,
  CARD_HEADER_META_ROW,
  CARD_HEADER_ROW,
  CARD_HEADER_TITLE,
  CARD_HEADER_TITLE_BLOCK,
  CARD_HEADER_TRAY,
} from '../utils/cardChrome';
import { getPastHscLabel } from '../utils/pastHscUtils';
import OutcomeDetailModal from './OutcomeDetailModal';
import AiBusyOverlay from './AiBusyOverlay';
import FlagContentModal from './FlagContentModal';

interface PromptDisplayProps {
  prompt: Prompt;
  isEnriching: boolean;
  enrichError: string | null;
  onVerbClick: () => void;
  onGenerateScenario: () => void;
  onUpdatePrompt: (updates: Partial<Prompt>) => void;
  isGeneratingScenario: boolean;
  generateScenarioError: string | null;
  courseOutcomes: CourseOutcome[];
  onOutcomeClick: (outcome: CourseOutcome) => void;
  userRole: UserRole;
  onDismissEnrichError: () => void;
  onRunQualityCheck: (content: string, type: 'question' | 'code') => void;
  onSuggestOutcomes: () => void;
  isSuggestingOutcomes: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  onTotalHeightChange?: (height: number) => void;
  onFooterResize?: (height: number) => void;
  minFooterHeight?: number;
  minTotalHeight?: number;
  /** Focus Mode: keep the card to just the question — skip the empty scenario
      placeholder and empty outcomes footer so the writing surface stays high
      on screen. Sections with real content still render. */
  condensed?: boolean;
  breadcrumb?: string[];
  /** Exam Mode: the card states the question and nothing that coaches. The
   *  outcome briefing and the verb guide are assistance in the same sense the
   *  hidden reference rail and the writing area's strategy tip are — a student
   *  sitting an exam is not handed the outcomes their answer is marked against,
   *  let alone an AI explanation of how to satisfy them. */
  examMode?: boolean;
  /** Surfaces paste/upload rejections from the scenario image panel. Optional
   *  so existing callers/tests that don't thread a toast handler through are
   *  unaffected — the panel simply drops the message if absent. */
  showToast?: (message: string, type: ToastType) => void;
}

const MeshOverlay = ({
  opacity = 'opacity-[0.03]',
  color = '%23ffffff',
}: {
  opacity?: string;
  color?: string;
}) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='${color}' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

/** Half the preview panel's width (w-72), used to keep it on screen. */
const OUTCOME_PREVIEW_HALF_WIDTH = 144;

/**
 * One outcome chip plus its hover preview.
 *
 * The preview is rendered into `document.body` rather than beside the chip.
 * The prompt card clips its own overflow (rounded corners + a scrolling body)
 * and the chip strip scrolls horizontally, so an absolutely positioned panel
 * was sliced off at the card edge — exactly where it had the most to say. A
 * fixed-position portal sits above all of that, and is clamped to the viewport
 * so a chip near either edge still reads in full.
 */
const OutcomeChip: React.FC<{
  outcome: CourseOutcome;
  bandConfig: ReturnType<typeof getTierScaleConfig>;
  onOpen: () => void;
}> = ({ outcome, bandConfig, onOpen }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    // Touch browsers leave a tapped element in :hover, so on a phone the panel
    // latched open over the question — and the tap opens the full brief anyway.
    if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centre = rect.left + rect.width / 2;
    setAnchor({
      left: Math.min(
        Math.max(centre, OUTCOME_PREVIEW_HALF_WIDTH + 12),
        window.innerWidth - OUTCOME_PREVIEW_HALF_WIDTH - 12
      ),
      top: rect.top,
    });
  }, []);

  const hide = useCallback(() => setAnchor(null), []);

  // The chip travels with the scrolling strip and the page; a fixed panel does
  // not, so it is dismissed rather than left floating over unrelated content.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [anchor, hide]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onOpen}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        title={`Open the brief for ${outcome.code} — what it asks for and how it applies to this question`}
        className={`
          t-label flex items-center gap-1 px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0
          ${bandConfig.bg} border ${bandConfig.border}
          ${bandConfig.text} transition-all duration-300 cursor-pointer
          hover:brightness-125 hover:shadow-lg
          active:scale-[0.98]
        `}
      >
        <Target className="w-2.5 h-2.5 opacity-60" />
        {outcome.code}
      </button>
      {anchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-tooltip w-72 -translate-x-1/2 -translate-y-full p-4 text-xs text-left font-medium leading-relaxed text-white light:text-slate-800 bg-[rgb(var(--color-bg-surface-elevated))]/95 light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-2xl shadow-lg pointer-events-none backdrop-blur-xl animate-fade-in"
            style={{ left: anchor.left, top: anchor.top - 12 }}
          >
            <div className={`flex items-center gap-2 mb-2 ${bandConfig.text}`}>
              <Award className="w-3.5 h-3.5" />
              <span className="t-label">Objective</span>
            </div>
            {outcome.description}
            <div
              className={`t-label mt-2.5 pt-2.5 border-t border-white/10 light:border-slate-200 flex items-center gap-1.5 ${bandConfig.text}`}
            >
              <Sparkles className="w-3 h-3" />
              Click for the full brief
              {isFeatureLocked('outcomeBriefing') && <PlusLockChip feature="outcomeBriefing" />}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

/**
 * Which HSC paper a question came from, editable in place.
 *
 * The three fields have always existed on `Prompt`, but only a bulk import
 * could write them — so a question tagged with the wrong year, or a real past
 * paper question added by hand, could not be corrected anywhere in the app.
 */
const ProvenanceEditor: React.FC<{
  prompt: Prompt;
  onSave: (updates: Partial<Prompt>) => void;
  onCancel: () => void;
}> = ({ prompt, onSave, onCancel }) => {
  const [year, setYear] = useState(prompt.hscYear ? String(prompt.hscYear) : '');
  const [questionNumber, setQuestionNumber] = useState(prompt.hscQuestionNumber ?? '');

  const parsedYear = Number(year);
  const yearIsUsable = !year || (Number.isFinite(parsedYear) && parsedYear > 1900);

  return (
    <div className="animate-fade-in p-4 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-amber-500/30 light:border-amber-300 space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-amber-400 light:text-amber-600" />
        <h4 className="t-label text-amber-400 light:text-amber-700">Past HSC paper</h4>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="t-label text-slate-500">Year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="e.g. 2023"
            className="w-28 px-3 py-2 rounded-xl bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-300 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="t-label text-slate-500">Question No.</span>
          <input
            type="text"
            value={questionNumber}
            onChange={(e) => setQuestionNumber(e.target.value)}
            placeholder="e.g. 12(b)"
            className="w-32 px-3 py-2 rounded-xl bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-300 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </label>
        <div className="flex items-center gap-2 ml-auto">
          {prompt.isPastHSC && (
            // Untagging is the other half of "can be corrected": a question
            // wrongly imported as a past paper has to be able to stop being one.
            <button
              onClick={() =>
                onSave({ isPastHSC: false, hscYear: undefined, hscQuestionNumber: undefined })
              }
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-red-400 transition-colors"
            >
              Not a past paper
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                isPastHSC: true,
                hscYear: year && yearIsUsable ? parsedYear : undefined,
                hscQuestionNumber: questionNumber.trim() || undefined,
              })
            }
            disabled={!yearIsUsable}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-lg flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        A question from a real HSC examination is labelled as such wherever it appears — in the
        question picker and on this card. Leave the year blank if you only know it is a past paper.
      </p>
    </div>
  );
};

const PromptDisplay: React.FC<PromptDisplayProps> = ({
  prompt,
  isEnriching,
  enrichError,
  onVerbClick,
  onGenerateScenario,
  onUpdatePrompt,
  isGeneratingScenario,
  generateScenarioError,
  courseOutcomes,
  onOutcomeClick,
  userRole,
  onDismissEnrichError,
  onRunQualityCheck,
  onSuggestOutcomes,
  isSuggestingOutcomes,
  fontSize,
  onFontSizeChange,
  onHeaderResize,
  minHeaderHeight,
  onTotalHeightChange,
  onFooterResize,
  minFooterHeight,
  minTotalHeight,
  condensed = false,
  breadcrumb,
  examMode = false,
  showToast,
}) => {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(prompt.question);
  const [isEditingScenario, setIsEditingScenario] = useState(false);
  const [editScenarioText, setEditScenarioText] = useState(prompt.scenario || '');
  const questionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scenarioTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<CourseOutcome | null>(null);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [isEditingProvenance, setIsEditingProvenance] = useState(false);

  const hasOpenFlag = prompt.contentFlag?.status === 'open';

  const headerRef = useRef<HTMLDivElement>(null);
  const headerContentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const footerContentRef = useRef<HTMLDivElement>(null);

  const canCurate = canCurateContent(userRole);
  const canGenerate = canUseAiGeneration(userRole);

  /**
   * Every AI control on this card — the quality check, the scenario writer, the
   * outcome auto-linker — is an AI Content Studio action, so each carries the
   * studio's plan lock as well as the role gate above. `canGenerate` decides
   * whether the control is drawn at all; this decides whether pressing it does
   * the work or opens the upgrade prompt.
   */
  const studioLocked = isFeatureLocked('aiContentStudio');
  /** Run the real action, or sell the plan that unlocks it. */
  const studioAction = (action: () => void) => () =>
    studioLocked ? requestUpgrade('aiContentStudio') : action();
  /** Append the reason to a control's tooltip when it is locked. */
  const studioTitle = (title: string): string =>
    studioLocked ? `${title} — part of the AI Content Studio, tap to learn more` : title;
  /** Amber "locked" chrome, or nothing, for a control's className. */
  const studioChrome = studioLocked
    ? 'bg-amber-400/15 border border-amber-400/40 text-amber-500 light:text-amber-600'
    : '';

  // A question with no scenario shows the "Context Scenario" heading and its
  // dashed placeholder only to someone who can actually add one. To a student it
  // was ~130px of "No scenario provided." inside a card whose height is capped —
  // space the question itself can use instead. Same reasoning as `condensed`,
  // extended to Exam Mode and to viewers without curation rights.
  const showScenarioSection =
    !!prompt.scenario ||
    !!prompt.scenarioImage ||
    isEditingScenario ||
    !(condensed || examMode || !canCurate);
  const pastHsc = useMemo(() => getPastHscLabel(prompt), [prompt]);
  // Filler for the void a short question leaves — see the block that uses it.
  // Keyed off the absence of a real scenario rather than of the scenario
  // SECTION: a curator sees a dashed "no scenario" placeholder in that case,
  // which occupies a strip of the card but leaves the void underneath it.
  const showKeywordFiller =
    !prompt.scenario && !examMode && !condensed && (prompt.keywords?.length ?? 0) > 0;
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  // The band a full-mark response reaches — used in COPY only ("Band 2").
  const targetBand = useMemo(
    () => getTargetBand(prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );
  // Chrome colour = the verb's TIER identity (same scale as the picker and
  // hierarchy ribbon); targetBand stays purely numeric copy ("Band 2").
  const bandConfig = useMemo(() => getTierScaleConfig(verbInfo.tier), [verbInfo.tier]);

  const linkedOutcomes = useMemo(() => {
    if (examMode || !prompt.linkedOutcomes) return [];
    return courseOutcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code));
  }, [courseOutcomes, prompt.linkedOutcomes, examMode]);

  useEffect(() => {
    setEditQuestionText(prompt.question);
  }, [prompt.question]);

  useEffect(() => {
    setEditScenarioText(prompt.scenario || '');
  }, [prompt.scenario]);

  // Header and footer height observation — see useChromeHeightReporter for why
  // the natural height is reported rather than the rendered box.
  useChromeHeightReporter(headerRef, headerContentRef, onHeaderResize);
  useChromeHeightReporter(footerRef, footerContentRef, onFooterResize);

  // Total height observation — the single value the writing area is sized
  // from. It reports the NATURAL height, not the rendered box inflated by the
  // minHeight floor: the inner wrapper is a flex child that stretches to that
  // floor, so measuring it fed the inflated value straight back in and the
  // card could only ever grow. Substituting the body's content height for its
  // rendered height gives a value that shrinks again.
  //
  // The OUTER card is measured, not the inner wrapper, so the two 2px borders
  // are included — the writing area pins itself to this number exactly, and
  // measuring inside the border left it 4px shorter than the prompt.
  useEffect(() => {
    if (!contentWrapRef.current || !onTotalHeightChange || typeof ResizeObserver === 'undefined')
      return;

    let frame = 0;
    // Deferred to a frame for the same reason as the chrome reporters: the
    // writing area is sized from this number, resizing it can resize this card
    // back, and measuring inside the observer callback let that round-trip run
    // several times within a single frame — which is what the flickering was.
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        onTotalHeightChange(
          naturalCardHeight(containerRef.current, bodyRef.current, bodyContentRef.current)
        )
      );
    };

    const observer = new ResizeObserver(report);
    observer.observe(contentWrapRef.current);
    if (bodyContentRef.current) observer.observe(bodyContentRef.current);
    report();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [onTotalHeightChange, prompt.question, prompt.scenario, fontSize]);

  const handleSaveQuestion = () => {
    if (editQuestionText.trim() !== prompt.question) {
      onUpdatePrompt({ question: editQuestionText.trim() });
    }
    setIsEditingQuestion(false);
  };

  const handleSaveScenario = () => {
    if (editScenarioText.trim() !== prompt.scenario) {
      onUpdatePrompt({ scenario: editScenarioText.trim() });
    }
    setIsEditingScenario(false);
  };

  const handleOutcomeClickInternal = (outcome: CourseOutcome) => {
    setSelectedOutcome(outcome);
    onOutcomeClick(outcome);
  };

  // Anyone can raise a flag; resolving keeps the record (status: 'resolved')
  // so an admin can still see what was reported and when.
  const handleFlag = (reason: string) =>
    onUpdatePrompt({ contentFlag: { reason, flaggedAt: Date.now(), status: 'open' } });
  const handleResolveFlag = () => {
    if (prompt.contentFlag) {
      onUpdatePrompt({ contentFlag: { ...prompt.contentFlag, status: 'resolved' } });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`
 clip-stable relative overflow-hidden rounded-surface
            bg-[rgb(var(--color-bg-surface))] light:bg-white
            border-2 ${bandConfig.border} shadow-lg ${bandConfig.glow}
            transition-[box-shadow,border-color,background-color] duration-500
            group/prompt flex flex-col h-full
        `}
      // min and max are the same value, so the card is exactly the height the
      // sync decided: its own content where that fits, the viewport cap where
      // it doesn't. A question that outruns the cap scrolls in its body rather
      // than pushing the writing area below the fold.
      style={{
        minHeight: minTotalHeight || undefined,
        maxHeight: minTotalHeight ? `${minTotalHeight}px` : undefined,
      }}
    >
      <div ref={contentWrapRef} className="flex flex-col flex-1 min-h-0">
        {/* Header Container */}
        <div
          ref={headerRef}
          // Every class in this header comes from utils/cardChrome, shared with
          // the writing card so the pair reads as one piece of furniture.
          className={`${CARD_HEADER_BOX} bg-gradient-to-r ${bandConfig.gradient}`}
          style={{ minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto' }}
        >
          <MeshOverlay opacity="opacity-20" />

          <div ref={headerContentRef} className={CARD_HEADER_ROW}>
            {/* Left: Icon + Hero Title */}
            <div className={CARD_HEADER_IDENTITY}>
              <div className={CARD_HEADER_ICON}>
                <FileQuestion className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              </div>
              <div className={CARD_HEADER_TITLE_BLOCK}>
                <h3 className={CARD_HEADER_TITLE}>Writing Prompt</h3>
                {/* The meta line, mirroring the writing card's: a chip, then
                  whatever this card has to say about itself. There it is the
                  band being worked towards and how far the response has come;
                  here it is the command verb, and the status of the question.
                  Everything on this line was somewhere more expensive before.
                  The directive was a hero block stacked over the stat pills in
                  the corner, which cost the header a whole third row. The
                  status chips hung off the heading, where they set the width of
                  the identity block and pushed the corner bar onto a row of its
                  own at any laptop width. And a "Band 2 ceiling" caption sat
                  here saying what the BAND pill in the corner already says —
                  its tooltip says it in full. */}
                <div className={CARD_HEADER_META_ROW}>
                  <button
                    onClick={onVerbClick}
                    disabled={examMode}
                    // Named for what pressing it does, not for what it says:
                    // the visible text is the verb alone, which tells a screen
                    // reader nothing about there being a guide behind it.
                    aria-label={
                      examMode ? undefined : `Open the command verb guide for ${prompt.verb}`
                    }
                    title={examMode ? undefined : `What a ${prompt.verb} question asks for`}
                    className={`t-label leading-none whitespace-nowrap bg-white/20 px-2.5 py-1 rounded-lg border border-white/15 shadow-sm backdrop-blur-sm transition-all ${
                      examMode ? 'cursor-default' : 'hover:bg-white/30 active:scale-[0.98]'
                    }`}
                  >
                    {prompt.verb}
                  </button>
                  {isEnriching && (
                    <span
                      className="t-label inline-flex items-center gap-1 leading-none bg-white/15 border border-white/20 rounded-full px-1.5 py-0.5 animate-fade-in"
                      title="Fetching this question's scenario and syllabus terms in the background — you can start writing now."
                    >
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span className="hidden 2xl:inline">Enhancing</span>
                    </span>
                  )}
                  {hasOpenFlag && (
                    <button
                      onClick={() => setIsFlagModalOpen(true)}
                      className="t-label inline-flex items-center gap-1 leading-none bg-amber-300/25 border border-amber-200/50 rounded-full px-1.5 py-0.5 animate-fade-in hover:bg-amber-300/40 transition-colors"
                      title={`Flagged for review: ${prompt.contentFlag?.reason ?? ''}`}
                    >
                      <Flag className="w-2.5 h-2.5" />
                      <span className="hidden 2xl:inline">Flagged</span>
                    </button>
                  )}
                  {/* Where the question came from — shown only when the
                    question actually CAME from somewhere. The empty state used
                    to render a dashed "Tag paper" chip beside the heading for
                    every curator on every practice question: a filing control
                    sitting in the most prominent line of the workspace, next to
                    a question that is not a past paper and never will be.
                    Tagging now belongs where the rest of a question's metadata
                    is set — the question editor — and this chip is left to say
                    what it is for, with editing still one click away for a
                    curator who spots a wrong year. */}
                  {pastHsc && (
                    <button
                      onClick={() => canCurate && !examMode && setIsEditingProvenance((v) => !v)}
                      disabled={!canCurate || examMode}
                      aria-expanded={canCurate && !examMode ? isEditingProvenance : undefined}
                      // No `uppercase` here, unlike its neighbours: an HSC
                      // question number is "12(b)", and shouting it as
                      // "Q12(B)" changes what the label says.
                      className={`inline-flex items-center gap-1 text-[9px] leading-none font-black tracking-[0.1em] rounded-full px-1.5 py-0.5 animate-fade-in transition-colors bg-white/20 border border-white/30 ${
                        canCurate && !examMode
                          ? 'hover:bg-white/30 cursor-pointer'
                          : 'cursor-default'
                      }`}
                      title={`${pastHsc.title}${canCurate && !examMode ? ' — click to edit' : ''}`}
                    >
                      <Landmark className="w-2.5 h-2.5" />
                      {pastHsc.text}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* The question's stats, docked in the bottom-right corner — the
              twin of the writing card's tool bar across the gap: same tray,
              same height, same fill. */}
            <div className={CARD_HEADER_TRAY}>
              <div className={`t-label ${CARD_HEADER_BAR} gap-1.5`}>
                {/* First to go when the row is tight: the suggested time is
                  the least load-bearing of the three (the metrics strip runs a
                  countdown on the same number), and the question card is at
                  its narrowest exactly where the corner has least room. */}
                <span
                  className="hidden 2xl:flex items-center gap-1 opacity-90"
                  title="Suggested time for a question worth these marks"
                >
                  <Clock className="w-3 h-3 text-white/70" /> {Math.round(prompt.totalMarks * 1.5)}{' '}
                  min
                </span>
                <span className="hidden 2xl:block w-px h-2.5 bg-white/20"></span>
                <span className="flex items-center gap-1 opacity-90">
                  <Award className="w-3 h-3 text-white/70" /> {prompt.totalMarks} Marks
                </span>
                <span className="w-px h-2.5 bg-white/20"></span>
                <span
                  className="flex items-center gap-1 font-bold"
                  title={`A full-mark response to this ${prompt.verb} question reaches Band ${targetBand}.`}
                >
                  <Target className="w-3 h-3 text-white/70" /> Band {targetBand}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Tier Glow & Gradient Background */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} opacity-[0.03] pointer-events-none`}
        />

        <div ref={bodyRef} className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div
            ref={bodyContentRef}
            // `my-auto` when the question stands alone: the card is floored at
            // MIN_CARD_HEIGHT so the writing area beside it stays usable, and a
            // lone one-line question pinned to the top left the rest of the card
            // reading as blank. Auto margins collapse to 0 the moment the
            // content is taller than the body, so long questions still start at
            // the top and scroll normally.
            className={`${condensed ? 'p-6 sm:p-8' : 'p-6 sm:p-8 pb-4 sm:pb-4'} ${
              showScenarioSection ? '' : 'my-auto'
            } relative z-10 flex flex-col gap-6 sm:gap-8`}
          >
            {/* Provenance editor — opened from the header chip. */}
            {isEditingProvenance && canCurate && !examMode && (
              <ProvenanceEditor
                prompt={prompt}
                onSave={(updates) => {
                  onUpdatePrompt(updates);
                  setIsEditingProvenance(false);
                }}
                onCancel={() => setIsEditingProvenance(false)}
              />
            )}

            {/* Question Section - "The Canvas" */}
            <div className="group/question relative pt-2">
              {isEditingQuestion ? (
                <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white rounded-panel border border-white/10 light:border-slate-300 shadow-inner">
                  <div className="px-2 pt-2">
                    <MathSymbolToolbar
                      textareaRef={questionTextareaRef}
                      value={editQuestionText}
                      onChange={setEditQuestionText}
                    />
                  </div>
                  <textarea
                    ref={questionTextareaRef}
                    value={editQuestionText}
                    onChange={(e) => setEditQuestionText(e.target.value)}
                    className="w-full bg-transparent border-none p-4 font-serif font-medium outline-none text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-slate-500 min-h-[120px]"
                    style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 px-4 pb-2">
                    <button
                      onClick={() => setIsEditingQuestion(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveQuestion}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-[0.98]"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative pl-2">
                  <h2
                    className="font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 font-serif tracking-tight break-words"
                    style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                  >
                    {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
                  </h2>
                  {/* Curator controls: hover-revealed on pointer devices; on
                    phones (no hover) they sit in flow under the question
                    instead of absolutely positioned into the header. */}
                  {canCurate && (
                    <div className="flex gap-2 justify-end mt-3 sm:mt-0 sm:absolute sm:-right-4 sm:-top-10 sm:opacity-0 sm:group-hover/question:opacity-100 transition-opacity">
                      {canGenerate && (
                        <button
                          onClick={studioAction(() =>
                            onRunQualityCheck(prompt.question, 'question')
                          )}
                          className={`p-2.5 rounded-xl shadow-lg hover:scale-110 transition-all ${
                            studioChrome ||
                            'bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-emerald-400 hover:text-emerald-300'
                          }`}
                          title={studioTitle('Run Quality Check')}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingQuestion(true)}
                        className="p-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 shadow-lg hover:scale-110 transition-all"
                        title="Edit Question"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scenario Section - "The Context" (see `showScenarioSection`) */}
            {showScenarioSection && (
              <div className="relative group/scenario">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="t-label text-slate-500 light:text-slate-600 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" /> Context Scenario
                  </h3>
                  {canCurate && !isEditingScenario && (
                    <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover/prompt:opacity-100 transition-opacity">
                      {canGenerate && (
                        <button
                          onClick={studioAction(onGenerateScenario)}
                          disabled={isGeneratingScenario}
                          className={`p-1.5 rounded-lg transition-colors ${
                            studioChrome || 'text-indigo-400 hover:bg-indigo-500/10'
                          }`}
                          title={studioTitle('Regenerate Scenario')}
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${isGeneratingScenario ? 'animate-spin' : ''}`}
                          />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingScenario(true)}
                        className="p-1.5 rounded-lg text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                        title="Edit Scenario"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsUploadingImage((v) => !v)}
                        aria-expanded={isUploadingImage}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isUploadingImage
                            ? 'text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10'
                            : 'text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 light:hover:bg-slate-100'
                        }`}
                        title={
                          prompt.scenarioImage ? 'Manage Scenario Image' : 'Add Scenario Image'
                        }
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isUploadingImage && canCurate && !isEditingScenario && (
                  <div className="mb-4">
                    <ScenarioImageUploader
                      promptId={prompt.id}
                      existingImage={prompt.scenarioImage}
                      onImageChange={(ref) => onUpdatePrompt({ scenarioImage: ref })}
                      showToast={showToast}
                    />
                  </div>
                )}

                {isEditingScenario ? (
                  <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white rounded-2xl border border-white/10 light:border-slate-300">
                    <div className="px-2 pt-2">
                      <MathSymbolToolbar
                        textareaRef={scenarioTextareaRef}
                        value={editScenarioText}
                        onChange={setEditScenarioText}
                      />
                    </div>
                    <textarea
                      ref={scenarioTextareaRef}
                      value={editScenarioText}
                      onChange={(e) => setEditScenarioText(e.target.value)}
                      className="w-full bg-transparent border-none p-4 font-medium outline-none text-[rgb(var(--color-text-primary))] light:text-slate-900 resize-none font-serif leading-relaxed"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={4}
                    />
                    <div className="flex justify-end gap-2 px-2 pb-2">
                      <button
                        onClick={() => {
                          setEditScenarioText(prompt.scenario || '');
                          setIsEditingScenario(false);
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveScenario}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-2 shadow-sm hover:scale-105 active:scale-[0.98] transition-all"
                      >
                        <Save className="w-3.5 h-3.5" /> Save Scenario
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`
                           relative p-6 rounded-2xl transition-all duration-300
                           ${
                             prompt.scenario || prompt.scenarioImage
                               ? `bg-black/20 light:bg-slate-100 border-2 border-white/10 light:border-slate-300 shadow-inner`
                               : 'bg-transparent border-dashed border border-slate-700/50 light:border-slate-300'
                           }
                       `}
                  >
                    {prompt.scenarioImage ? (
                      <ScenarioCarousel
                        scenarioText={prompt.scenario}
                        scenarioImage={prompt.scenarioImage}
                        keywords={prompt.keywords}
                        verb={prompt.verb}
                        fontSize={fontSize}
                      />
                    ) : prompt.scenario ? (
                      <div className="relative">
                        {/* Decorative Quote Icon */}
                        <Quote className="absolute -top-3 -left-2 w-6 h-6 text-slate-500/20 light:text-slate-500/30 transform rotate-180" />
                        <p
                          className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2 break-words"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          {renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb)}
                        </p>
                      </div>
                    ) : (
                      /* Compact empty state — a single row, so a scenario-less
                       question doesn't push the writing surface down screen. */
                      <div className="flex flex-wrap items-center justify-center py-2 text-center gap-x-4 gap-y-2">
                        <p className="text-xs text-slate-500 font-medium">No scenario provided.</p>
                        {canGenerate && (
                          <button
                            onClick={studioAction(onGenerateScenario)}
                            disabled={isGeneratingScenario}
                            title={studioTitle('Generate Context')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:scale-105 ${
                              studioChrome ||
                              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Generate Context
                            {studioLocked && <PlusLockChip feature="aiContentStudio" />}
                          </button>
                        )}
                      </div>
                    )}
                    <AiBusyOverlay
                      show={isGeneratingScenario}
                      rounded="rounded-2xl"
                      z="z-10"
                      maxWidth="max-w-xs"
                    >
                      <div className="flex flex-col items-center gap-3 text-indigo-500 dark:text-indigo-400">
                        <Loader2 className="w-10 h-10 animate-spin" />
                        <span className="t-label">Generating context…</span>
                      </div>
                    </AiBusyOverlay>
                  </div>
                )}

                {generateScenarioError && (
                  <div className="mt-3 text-xs text-red-400 flex items-center gap-2 bg-red-500/10 p-3 rounded-xl border border-red-500/20 animate-fade-in">
                    <AlertTriangle className="w-3.5 h-3.5" /> {generateScenarioError}
                  </div>
                )}
              </div>
            )}

            {/* The card's height is set by the writing area beside it, not by
              its own contents, so a one-line question with no scenario leaves
              a large void. The syllabus terms are the thing a student reaches
              for next — they otherwise sit in the left rail, which is below
              the fold on a laptop and gone entirely in Focus Mode. Only shown
              where there is actually room: with a scenario present the card is
              already full. Never in Exam Mode, where the terms are assistance. */}
            {showKeywordFiller && (
              <div className="animate-fade-in">
                <h3 className="t-label text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5" /> Syllabus terms to weave in
                </h3>
                <div className="flex flex-wrap gap-2">
                  {prompt.keywords?.map((keyword) => (
                    <span
                      key={keyword}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${bandConfig.bg} ${bandConfig.border} ${bandConfig.text}`}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Enrich Error Banner */}
            {enrichError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <Info className="w-3.5 h-3.5" />
                  <span>Context Enrichment Failed: {enrichError}</span>
                </div>
                <button
                  onClick={onDismissEnrichError}
                  aria-label="Dismiss"
                  className="p-1 hover:bg-amber-500/20 rounded-lg text-amber-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Outcomes Footer - "The Evidence". A sibling of the scroll region, not
          a child of it, so the syllabus link, outcome chips and zoom controls
          stay pinned to the bottom instead of scrolling out of reach when a
          long scenario overflows. */}
        {!(condensed && linkedOutcomes.length === 0) && (
          <div
            ref={footerRef}
            className="relative z-10 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border-t border-white/10 light:border-slate-200/50 px-4 sm:px-6 py-3 flex items-center backdrop-blur-sm mt-auto flex-shrink-0 rounded-b-surface-inner"
            style={{ minHeight: minFooterHeight || 52 }}
          >
            {/* Inner wrapper carries the row layout so its height stays
              content-driven — the outer box is inflated by the synced
              minFooterHeight and cannot be measured. */}
            <div
              ref={footerContentRef}
              className="w-full flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-3"
            >
              {/* On phones: label and the flag/zoom controls share the first row
                and the outcome chips wrap to a full-width second row — two rows,
                not three. The label may shrink (`min-w-0`) to keep it that way.
                From sm up it is one row: label | chips | controls. */}
              <div className="order-1 flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink-0">
                {/* The whole label is the entry point, not just the chips. The
                  chips say WHICH outcomes apply; this says what opening them
                  gets you — a plain-English brief on what the markers want,
                  worth reading before the first sentence is written. */}
                {linkedOutcomes.length > 0 ? (
                  <button
                    onClick={() => handleOutcomeClickInternal(linkedOutcomes[0])}
                    title="Open the outcome brief — what this question is assessing, in plain English"
                    className={`flex items-center gap-2 sm:gap-3 group/link rounded-xl pr-1.5 sm:pr-3 -ml-1 pl-1 py-1 transition-all hover:bg-white/5 light:hover:bg-slate-100 active:scale-[0.98] ${bandConfig.border} border border-transparent hover:border-current/10`}
                  >
                    {/* Decorative icon tile — the inline Sparkles carries the
                      "there is something to read here" cue on its own, so the
                      tile is dropped on phones to buy the row its 44px. */}
                    <div
                      className={`
                                  hidden sm:block p-2.5 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-300
                                  ${bandConfig.bg} ${bandConfig.border} group-hover/link:scale-110
                              `}
                    >
                      <Link2 className={`w-4 h-4 ${bandConfig.text}`} />
                    </div>
                    <div className="flex flex-col text-left">
                      {/* The eyebrow is the first casualty whenever the row is
                        tight: it is the widest element in it and "What's
                        assessed" already says what the button does. It costs a
                        whole extra footer row on a phone AND in the two-column
                        layout below xl, where this card is only ~380px wide. */}
                      <span className="t-label hidden xl:block text-slate-500 dark:text-slate-400 leading-none mb-1">
                        Before you write
                      </span>
                      <span
                        className={`text-xs font-bold ${bandConfig.text} flex items-center gap-1.5`}
                      >
                        <Sparkles className="w-3 h-3 opacity-70" />
                        What&apos;s assessed
                      </span>
                    </div>
                  </button>
                ) : examMode ? null : (
                  <div className="flex items-center gap-3 group/link">
                    <div
                      className={`
                                  p-2.5 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-300
                                  ${bandConfig.bg} ${bandConfig.border} group-hover/link:scale-110
                              `}
                    >
                      <Link2 className={`w-4 h-4 ${bandConfig.text}`} />
                    </div>
                    <div className="flex flex-col">
                      <span className="t-label text-slate-500 dark:text-slate-400 leading-none mb-1">
                        Syllabus
                      </span>
                      <span className={`t-label ${bandConfig.text}`}>Outcome Link</span>
                    </div>
                  </div>
                )}
                {canGenerate && onSuggestOutcomes && !examMode && (
                  <button
                    onClick={studioAction(onSuggestOutcomes)}
                    disabled={isSuggestingOutcomes}
                    className={`p-2 rounded-lg transition-all ${
                      studioChrome ||
                      'bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/20'
                    } ${isSuggestingOutcomes ? 'animate-pulse' : 'hover:scale-110'}`}
                    title={studioTitle('Auto-link Outcomes with AI')}
                  >
                    <Wand2
                      className={`w-3.5 h-3.5 ${isSuggestingOutcomes ? 'animate-spin' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* One horizontal strip, never a stack. The chips used to take a
                full-width row of their own beneath the label, which cost the
                footer a whole extra row for two or three short codes. They now
                sit inline between the label and the controls and SCROLL
                sideways when a question links more outcomes than the card is
                wide — the row height stays fixed either way. Below sm they
                still drop to their own row, where there is no width to share. */}
              <div className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 min-w-0 flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-hide py-0.5">
                {linkedOutcomes.length > 0 ? (
                  linkedOutcomes.map((outcome) => (
                    <OutcomeChip
                      key={outcome.code}
                      outcome={outcome}
                      bandConfig={bandConfig}
                      onOpen={() => handleOutcomeClickInternal(outcome)}
                    />
                  ))
                ) : examMode ? null : (
                  // No `opacity` on this one: a muted tone AND a 60% wash on
                  // top put it under 2.5:1 in the light theme. The tone alone
                  // says "nothing to see" and stays readable for whoever needs
                  // to read it.
                  <span className="text-xs text-[rgb(var(--color-text-muted))] italic font-medium whitespace-nowrap">
                    No specific outcomes linked.
                  </span>
                )}
              </div>

              <div className="order-2 sm:order-3 flex items-center gap-2 ml-auto flex-shrink-0">
                <button
                  onClick={() => setIsFlagModalOpen(true)}
                  aria-label={
                    hasOpenFlag ? 'View the flag on this question' : 'Flag this question for review'
                  }
                  className={`p-1.5 sm:p-2 rounded-lg border transition-all ${
                    hasOpenFlag
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                      : 'bg-black/10 light:bg-slate-200/50 border-white/10 light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-amber-500'
                  }`}
                  title={
                    hasOpenFlag
                      ? 'This question is flagged for review — click to view'
                      : 'Something off about this question? Flag it for review'
                  }
                >
                  <Flag className={`w-3.5 h-3.5 ${hasOpenFlag ? 'fill-current' : ''}`} />
                </button>

                <div className="flex items-center gap-1 bg-black/10 light:bg-slate-200/50 backdrop-blur-xl p-1 rounded-lg border border-white/10 light:border-slate-300 shadow-inner">
                  <button
                    onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
                    // Icon-only, so it needs a name of its own: `title` is a
                    // tooltip, and not every screen reader treats one as the
                    // accessible name.
                    aria-label="Decrease reading size"
                    className="p-1 sm:p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-lg transition-colors"
                    title="Decrease font size"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[rgb(var(--color-text-muted))] w-6 text-center select-none">
                    {fontSize}
                  </span>
                  <button
                    onClick={() => onFontSizeChange(Math.min(48, fontSize + 2))}
                    aria-label="Increase reading size"
                    className="p-1 sm:p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-lg transition-colors"
                    title="Increase font size"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedOutcome && (
          <OutcomeDetailModal
            isOpen={!!selectedOutcome}
            onClose={() => setSelectedOutcome(null)}
            outcomes={linkedOutcomes}
            initialCode={selectedOutcome.code}
            question={prompt.question}
            tier={verbInfo.tier}
            verb={prompt.verb}
            totalMarks={prompt.totalMarks}
            breadcrumb={breadcrumb}
          />
        )}

        <FlagContentModal
          isOpen={isFlagModalOpen}
          onClose={() => setIsFlagModalOpen(false)}
          itemLabel="question"
          existingFlag={prompt.contentFlag}
          onFlag={handleFlag}
          onResolve={handleResolveFlag}
        />
      </div>
    </div>
  );
};

export default PromptDisplay;
