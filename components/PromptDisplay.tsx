import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import type { ToastType } from '../hooks/useToast';
import { createPortal } from 'react-dom';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import {
  describeAccess,
  isFeatureLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import {
  Edit3,
  Save,
  X,
  Sparkles,
  BookMarked,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  ChevronRight,
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
import { getBandRgb, getTierScaleConfig, renderFormattedText } from '../utils/renderUtils';
import { splitSyllabusTerms, type SyllabusPlacement } from '../utils/syllabusTermSource';
import MathSymbolToolbar from './MathSymbolToolbar';
import ScenarioImageUploader from './ScenarioImageUploader';
import ScenarioCarousel from './ScenarioCarousel';
import { getCommandTermInfo, getRecommendedTime, getTargetBand } from '../data/commandTerms';
import { cappedCardHeight, naturalCardHeight } from '../utils/layoutConstants';
import { useChromeHeightReporter } from '../hooks/useChromeHeightReporter';
import {
  CARD_FOOTER_BOX,
  CARD_HEADER_BAR,
  CARD_HEADER_BOX,
  cardHeaderWash,
  CARD_HEADER_ICON,
  CARD_HEADER_IDENTITY,
  CARD_HEADER_META,
  CARD_HEADER_META_ROW,
  CARD_HEADER_ROW,
  CARD_HEADER_TITLE,
  CARD_HEADER_TITLE_BLOCK,
  CARD_HEADER_CORNER,
  CARD_HEADER_ZOOM,
  CARD_HEADER_ZOOM_BUTTON,
} from '../utils/cardChrome';
import { getPastHscLabel } from '../utils/pastHscUtils';
import OutcomeDetailModal from './OutcomeDetailModal';
import AiBusyOverlay from './AiBusyOverlay';
import LoadingIndicator from './LoadingIndicator';
import FlagContentModal from './FlagContentModal';
import { TERM_CHIP_RESTING } from '../utils/termChrome';
import { withIndefiniteArticle } from '../utils/grammar';
import { canStepReadingSize, stepReadingSize } from '../utils/readingSize';
import { capOutcomeLinks } from '../utils/outcomeCodes';

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
  /** The syllabus above this question. The filler list of terms marks the ones
   *  the question names itself, so it says the same thing as the Syllabus Terms
   *  panel rather than showing the same terms as if they were interchangeable. */
  syllabus?: SyllabusPlacement;
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

/**
 * A chip in the card's footer: the "Read before you write" button and each
 * outcome code. One height (36px, 44px on a phone) so a row of them, or two rows
 * once they wrap, reads as one set, and `whitespace-nowrap` so a code is never
 * broken across lines. Callers add the band colours and their own padding.
 */
const FOOTER_CHIP =
  'inline-flex items-center rounded-lg border whitespace-nowrap max-w-full min-h-9 max-sm:min-h-11 transition-all touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The band fill the footer's chips share: the mark ladder's gradient (`.band-fill`) with
 * a firm edge of the tier's own hue, read from `--band-rgb` on the footer. The ink is
 * the tier's text step, as it was on the flat pastel these replace.
 */
const OUTCOME_FILL = 'band-fill border-[rgb(var(--band-rgb)/0.55)]';

/**
 * A tool button beside the brief button: the AI auto-link wand and the flag.
 * Square, the chips' own height and radius, and a firm band-coloured edge, so the
 * row of three reads as one set. They used to differ in fill, border and weight
 * (a filled tile, a grey bordered one, a bordered label), which made the row look
 * assembled from leftovers.
 */
const FOOTER_TOOL =
  'shrink-0 flex items-center justify-center size-9 max-sm:size-11 rounded-lg border transition-all touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The marks and the band as chips on the header's meta line, on a phone only. The
 * verb chip's ground, edge and type, without its underline: these are facts, and
 * only the verb opens its guide by looking like it does. From `sm` they are the
 * corner bar's pills.
 */
const PHONE_STAT_CHIP =
  't-label leading-none whitespace-nowrap inline-flex items-center gap-1 bg-black/20 px-2 py-1 rounded-lg border border-white/15 shadow-sm backdrop-blur-sm';

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
  // The preview is the chip's description. It is named by id only while it is
  // showing: a reference to a node that is not in the page is a dangling one.
  const tipId = useId();

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
        aria-describedby={anchor ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`
          t-label ${FOOTER_CHIP} justify-center gap-1.5 px-2.5
          ${OUTCOME_FILL} ${bandConfig.text} duration-300 cursor-pointer
          hover:brightness-110 hover:shadow-lg
        `}
      >
        <Target className="w-3 h-3 shrink-0 opacity-70" aria-hidden="true" />
        {outcome.code}
      </button>
      {anchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            id={tipId}
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
        <h4 className="t-section text-amber-400 light:text-amber-700">Past HSC paper</h4>
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
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-amber-600 hover:bg-amber-500 shadow-lg flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
  syllabus,
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
  /** A locked control's tooltip is the one sentence that says why. */
  const studioTitle = (title: string): string =>
    studioLocked ? `${title} — ${describeAccess('aiContentStudio').explanation}` : title;
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
  // A plain-text scenario sheds its inset box below `sm`. The box's border and
  // fill, and the quote gutter inside them, left the text about 220px wide at
  // 390px, which is ~30 characters a line. A scenario with an image keeps the box:
  // the carousel is laid inside it.
  const scenarioIsPlainText = !!prompt.scenario && !prompt.scenarioImage;
  const pastHsc = useMemo(() => getPastHscLabel(prompt), [prompt]);
  // Filler for the void a short question leaves — see the block that uses it.
  // Keyed off the absence of a real scenario rather than of the scenario
  // SECTION: a curator sees a dashed "no scenario" placeholder in that case,
  // which occupies a strip of the card but leaves the void underneath it.
  const showKeywordFiller =
    !prompt.scenario && !examMode && !condensed && (prompt.keywords?.length ?? 0) > 0;

  // The filler list, must-use terms first. This card has no room to teach the
  // distinction, so it carries it the way the panel does — order and a mark —
  // rather than explaining it twice.
  const orderedKeywords = useMemo(() => {
    const { mustUse, supporting } = splitSyllabusTerms(prompt.keywords || [], {
      question: prompt.question,
      scenario: prompt.scenario,
      ...syllabus,
    });
    return [
      ...mustUse.map((term) => ({ term, isKeyTerm: true })),
      ...supporting.map((term) => ({ term, isKeyTerm: false })),
    ];
  }, [prompt.keywords, prompt.question, prompt.scenario, syllabus]);
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  // The suggested time the card states, from the one function the metrics strip
  // and the verb guide use, so the three never quote different numbers.
  const suggestedMinutes = useMemo(
    () => Math.max(1, Math.round(getRecommendedTime(prompt.totalMarks, verbInfo) / 60)),
    [prompt.totalMarks, verbInfo]
  );
  // The band a full-mark response reaches — used in COPY only ("Band 2").
  const targetBand = useMemo(
    () => getTargetBand(prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );
  // Chrome colour = the verb's TIER identity (same scale as the picker and
  // hierarchy ribbon); targetBand stays purely numeric copy ("Band 2").
  const bandConfig = useMemo(() => getTierScaleConfig(verbInfo.tier), [verbInfo.tier]);

  // In the question's own order, which puts the outcome it most directly assesses
  // first, and no more than two: a question that still carries a longer list
  // (an older import) shows its first two.
  const linkedOutcomes = useMemo(() => {
    if (examMode || !prompt.linkedOutcomes) return [];
    const byCode = new Map(courseOutcomes.map((o) => [o.code, o]));
    return capOutcomeLinks(prompt.linkedOutcomes.filter((code) => byCode.has(code))).map(
      (code) => byCode.get(code)!
    );
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
        minHeight: minTotalHeight ? cappedCardHeight(minTotalHeight) : undefined,
        maxHeight: minTotalHeight ? cappedCardHeight(minTotalHeight) : undefined,
      }}
    >
      <div ref={contentWrapRef} className="flex flex-col flex-1 min-h-0">
        {/* Header Container */}
        <div
          ref={headerRef}
          // Every class in this header comes from utils/cardChrome, shared with
          // the writing card so the pair reads as one piece of furniture.
          className={CARD_HEADER_BOX}
          style={{
            minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto',
            background: cardHeaderWash(verbInfo.tier),
          }}
        >
          {/* Matches the writing card's header grid (see Editor), so the pair
              keeps one texture. */}
          <MeshOverlay opacity="opacity-10" />

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
                {/* Below `sm` this line runs to the card's right edge and also
                    carries the marks and the band, which the corner bar holds from
                    `sm`. The bar used to share this grid row on a phone, with
                    nothing to stop the two meeting: "CRITICALLY EVALUATE" beside
                    "12 Marks | Band 6" ran under the bar at 390px, and "IDENTIFY"
                    did at 320px. On one wrapping line the stats move down a line
                    instead. */}
                <div
                  className={`${CARD_HEADER_META_ROW} max-sm:col-start-2 max-sm:col-end-4 max-sm:row-start-2 max-sm:gap-x-1.5 max-sm:gap-y-0`}
                >
                  <button
                    onClick={onVerbClick}
                    disabled={examMode}
                    // Named for what pressing it does, not for what it says:
                    // the visible text is the verb alone, which tells a screen
                    // reader nothing about there being a guide behind it.
                    aria-label={
                      examMode ? undefined : `Open the command verb guide for ${prompt.verb}`
                    }
                    title={
                      examMode
                        ? undefined
                        : `What ${withIndefiniteArticle(prompt.verb)} question asks for`
                    }
                    // Underlined, like the verb in the question below it, so
                    // one visual language means "this opens the verb guide" —
                    // and so this chip stops reading as another fact chip like
                    // the "4 Marks" and "Band 2" pills it sits beside.
                    className={`t-label leading-none whitespace-nowrap bg-black/20 px-2.5 py-1 rounded-lg border border-white/15 shadow-sm backdrop-blur-sm transition-all ${
                      examMode
                        ? 'cursor-default'
                        : 'underline decoration-dotted decoration-white/50 underline-offset-[3px] hover:bg-black/30 hover:decoration-solid hover:decoration-white active:scale-[0.98]'
                    }`}
                  >
                    {prompt.verb}
                  </button>
                  {isEnriching && (
                    <span
                      className="t-label inline-flex items-center gap-1 leading-none bg-black/20 border border-white/20 rounded-full px-1.5 py-0.5 animate-fade-in"
                      title="Fetching this question's scenario and syllabus terms in the background — you can start writing now."
                    >
                      <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                      <span className="hidden 2xl:inline">Enhancing</span>
                    </span>
                  )}
                  {hasOpenFlag && (
                    <button
                      onClick={() => setIsFlagModalOpen(true)}
                      // Worse than an unnamed button: below 2xl the label is
                      // hidden, so the accessible name fell back to `title` and
                      // whatever a curator typed into the flag reason BECAME the
                      // name of this control.
                      aria-label="View the flag on this question"
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
                      className={`inline-flex items-center gap-1 text-[9px] leading-none font-black tracking-[0.1em] rounded-full px-1.5 py-0.5 animate-fade-in transition-colors bg-black/20 border border-white/30 ${
                        canCurate && !examMode
                          ? 'hover:bg-black/30 cursor-pointer'
                          : 'cursor-default'
                      }`}
                      title={`${pastHsc.title}${canCurate && !examMode ? ' — click to edit' : ''}`}
                    >
                      <Landmark className="w-2.5 h-2.5" />
                      {pastHsc.text}
                    </button>
                  )}
                  <span className={`${PHONE_STAT_CHIP} sm:hidden`}>
                    <Award className="w-3 h-3 text-white/70" aria-hidden="true" />
                    {prompt.totalMarks} Marks
                  </span>
                  {examMode ? (
                    <span
                      className={`${PHONE_STAT_CHIP} font-bold sm:hidden`}
                      title={`A full-mark response to this ${prompt.verb} question reaches Band ${targetBand}.`}
                    >
                      <Target className="w-3 h-3 text-white/70" aria-hidden="true" />
                      Band {targetBand}
                    </span>
                  ) : (
                    // 44px tall, as the bar's band button is on a phone, with the
                    // chip drawn inside it.
                    <button
                      type="button"
                      onClick={onVerbClick}
                      aria-label={`Band ${targetBand} is the target. See what ${prompt.verb} asks for`}
                      className="sm:hidden inline-flex items-center min-h-11 touch-manipulation group/band focus-visible:outline-none"
                    >
                      <span
                        className={`${PHONE_STAT_CHIP} font-bold group-active/band:scale-[0.98] group-focus-visible/band:ring-2 group-focus-visible/band:ring-white/70`}
                      >
                        <Target className="w-3 h-3 text-white/70" aria-hidden="true" />
                        Band {targetBand}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* The corner: reading size across the top, the question's stats
              docked on the floor. The stats are the twin of the writing card's
              tool bar across the gap (same height, same fill, level with it)
              and the reading size sits over them, in the corner a student's
              eye goes to for "make this bigger". It used to live in the footer
              beside the outcome chips, which is the row that ran out of width
              in two columns, and it vanished with that row in Focus Mode. */}
            <div className={CARD_HEADER_CORNER}>
              <div role="group" aria-label="Reading size" className={CARD_HEADER_ZOOM}>
                <button
                  type="button"
                  onClick={() => onFontSizeChange(stepReadingSize(fontSize, -1))}
                  disabled={!canStepReadingSize(fontSize, -1)}
                  // Icon-only, so it needs a name of its own: `title` is a
                  // tooltip, and not every screen reader treats one as the
                  // accessible name.
                  aria-label="Decrease reading size"
                  className={CARD_HEADER_ZOOM_BUTTON}
                  title="Decrease font size"
                >
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span
                  className="t-label font-mono tabular-nums text-white min-w-[2.25ch] text-center select-none max-sm:sr-only"
                  aria-live="polite"
                >
                  {fontSize}
                </span>
                <button
                  type="button"
                  onClick={() => onFontSizeChange(stepReadingSize(fontSize, 1))}
                  disabled={!canStepReadingSize(fontSize, 1)}
                  aria-label="Increase reading size"
                  className={CARD_HEADER_ZOOM_BUTTON}
                  title="Increase font size"
                >
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div
                data-card-bar
                // From `sm` only: on a phone the marks and band are chips on the
                // meta line (see there).
                className={`t-label ${CARD_HEADER_BAR} gap-1.5 max-sm:hidden`}
              >
                {/* First to go when the row is tight: the suggested time is
                  the least load-bearing of the three, and the question card is
                  at its narrowest exactly where the corner has least room. It
                  is the same number the writing metrics strip counts down from
                  and the verb guide quotes. */}
                <span
                  className="hidden 2xl:flex items-center gap-1 opacity-90"
                  title="Suggested time for a question worth these marks"
                >
                  <Clock className="w-3 h-3 text-white/70" /> {suggestedMinutes} min
                </span>
                <span className="hidden 2xl:block w-px h-2.5 bg-white/20"></span>
                <span className="flex items-center gap-1 opacity-90">
                  <Award className="w-3 h-3 text-white/70" /> {prompt.totalMarks} Marks
                </span>
                <span className="w-px h-2.5 bg-white/20"></span>
                {examMode ? (
                  <span
                    className="flex items-center gap-1 font-bold"
                    title={`A full-mark response to this ${prompt.verb} question reaches Band ${targetBand}.`}
                  >
                    <Target className="w-3 h-3 text-white/70" /> Band {targetBand}
                  </span>
                ) : (
                  // The tooltip says what the band is for; a phone has no hover,
                  // so the same chip opens the verb guide, where the question's
                  // own marks, length and time are laid out.
                  <button
                    type="button"
                    onClick={onVerbClick}
                    aria-label={`Band ${targetBand} is the target. See what ${prompt.verb} asks for`}
                    title={`A full-mark response to this ${prompt.verb} question reaches Band ${targetBand}. Open the guide.`}
                    className="flex items-center gap-1 font-bold rounded-lg -mx-1 px-1 max-sm:min-h-11 hover:bg-white/10 active:scale-[0.98] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Target className="w-3 h-3 text-white/70" aria-hidden="true" /> Band{' '}
                    {targetBand}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Tier Glow & Gradient Background */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} opacity-[0.03] pointer-events-none`}
        />

        <div
          ref={bodyRef}
          className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar scroll-stable"
        >
          <div
            ref={bodyContentRef}
            // `my-auto` when the question stands alone: the card is floored at
            // MIN_CARD_HEIGHT so the writing area beside it stays usable, and a
            // lone one-line question pinned to the top left the rest of the card
            // reading as blank. Auto margins collapse to 0 the moment the
            // content is taller than the body, so long questions still start at
            // the top and scroll normally.
            // Below `sm` the sides come in to the header's 16px gutter, so the question
            // and the scenario line up with the icon, and the scenario has the width
            // to read at (see the scenario's own classes).
            className={`${condensed ? 'p-6 max-sm:px-4 sm:p-8' : 'p-6 max-sm:px-4 sm:p-8 pb-4 sm:pb-4'} ${
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
                <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] rounded-panel border border-white/10 light:border-slate-300 shadow-inner">
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
                  {/* The question fills its card at every width. It was once capped at
                    70 characters a line, but the product owner ruled that a card
                    left empty down its right side reads as unfinished, so the
                    text runs to the card's padding. See DesignSpec §4, "Measure". */}
                  <h2
                    className="font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 font-serif tracking-tight break-words"
                    style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                  >
                    {/* The verb opens its guide. It has always been drawn
                      bold, accent-coloured and underlined — a hyperlink in
                      everything but behaviour — while the only real trigger was
                      a chip up in the header dressed exactly like the "4 Marks"
                      and "Band 2" chips that state facts and do nothing. The
                      affordance was on the wrong element. Not in Exam Mode,
                      where the guide is assistance. */}
                    {renderFormattedText(
                      prompt.question,
                      prompt.keywords,
                      prompt.verb,
                      examMode ? undefined : onVerbClick
                    )}
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
                          className={`p-2.5 max-sm:size-11 max-sm:flex max-sm:items-center max-sm:justify-center rounded-xl shadow-lg hover:scale-110 transition-all ${
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
                        className="p-2.5 max-sm:size-11 max-sm:flex max-sm:items-center max-sm:justify-center rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 shadow-lg hover:scale-110 transition-all"
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
                  {/* `-400` in the dark theme, not `-500`. Measured on the
                      question card's own surface: `slate-500` reads 3.73:1
                      against a 4.5 floor there. It survived this long because
                      the heading only renders for a question that HAS a
                      scenario, and the contrast sweep's first question has
                      none — see `openQuestionWithOutcomes`. The light partner
                      is unchanged; it was already clearing the floor. */}
                  <h3 className="text-sm font-bold text-slate-400 light:text-slate-600 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" /> Context scenario
                  </h3>
                  {canCurate && !isEditingScenario && (
                    <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover/prompt:opacity-100 transition-opacity">
                      {canGenerate && (
                        <button
                          onClick={studioAction(onGenerateScenario)}
                          disabled={isGeneratingScenario}
                          className={`max-sm:size-11 p-1.5 rounded-lg transition-colors ${
                            studioChrome || 'text-indigo-400 hover:bg-indigo-500/10'
                          }`}
                          aria-label={studioTitle('Regenerate Scenario')}
                          aria-busy={isGeneratingScenario || undefined}
                          title={studioTitle('Regenerate Scenario')}
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${isGeneratingScenario ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingScenario(true)}
                        className="max-sm:size-11 p-1.5 rounded-lg text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                        title="Edit Scenario"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsUploadingImage((v) => !v)}
                        aria-expanded={isUploadingImage}
                        className={`max-sm:size-11 p-1.5 rounded-lg transition-colors ${
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
                  <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] rounded-2xl border border-white/10 light:border-slate-300">
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
                             scenarioIsPlainText
                               ? 'max-sm:p-0 max-sm:border-0 max-sm:shadow-none max-sm:bg-transparent light:max-sm:bg-transparent'
                               : ''
                           }
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
                        {/* Decorative Quote Icon. Hidden below `sm`: its gutter is what took
                            the text's width, and the thin rule on the paragraph carries
                            the quotation there instead. */}
                        <Quote className="absolute -top-3 -left-2 w-6 h-6 text-slate-500/20 light:text-slate-500/30 transform rotate-180 max-sm:hidden" />
                        <p
                          className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2 break-words max-sm:pl-2.5 max-sm:pr-0 max-sm:border-l-2 max-sm:border-white/20 light:max-sm:border-slate-300"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          {renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb)}
                        </p>
                      </div>
                    ) : (
                      /* Compact empty state — a single row, so a scenario-less
                       question doesn't push the writing surface down screen. */
                      <div className="flex flex-wrap items-center justify-center py-2 text-center gap-x-4 gap-y-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                          No scenario provided.
                        </p>
                        {canGenerate && (
                          <button
                            onClick={studioAction(onGenerateScenario)}
                            disabled={isGeneratingScenario}
                            title={studioTitle('Generate Context')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:scale-105 ${
                              studioChrome ||
                              'bg-indigo-500/10 light:bg-indigo-100 text-indigo-400 light:text-indigo-700 border border-indigo-500/20 light:border-indigo-300 hover:bg-indigo-500/20 light:hover:bg-indigo-200'
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
                      {/* The same wait card as every other AI request. It was a bare
                          spinner here because the card did not fit a box this small;
                          it now sizes itself to the veil (index.css, `.ai-wait-stage`). */}
                      <LoadingIndicator
                        task="generation"
                        message="Writing a scenario"
                        messages={[
                          'Reading the question',
                          'Choosing a setting for it',
                          'Writing the scenario',
                        ]}
                        duration={8}
                      />
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
                <h3 className="t-section text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5" /> Syllabus terms to weave in
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* Must-use terms lead and carry the bookmark, the same way
                      the Syllabus Terms panel shows them. This list is the same
                      terms on the same screen: printing them as one
                      undifferentiated row told a student they were
                      interchangeable, which is the thing the panel exists to
                      deny. */}
                  {orderedKeywords.map(({ term, isKeyTerm }) => (
                    <span
                      key={term}
                      title={
                        isKeyTerm
                          ? 'Named in the question or its syllabus — a must-use term'
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                        isKeyTerm
                          ? `${bandConfig.bg} ${bandConfig.border} ${bandConfig.text}`
                          : TERM_CHIP_RESTING
                      }`}
                    >
                      {isKeyTerm && <BookMarked className="w-3 h-3 shrink-0 opacity-70" />}
                      {term}
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
                  {/* A student was shown "Context Enrichment Failed: AI Service
                      Unavailable after 16s: Server is missing GEMINI_API_KEY
                      configuration." The enrichment only adds extras (a
                      scenario, terms, outcome links); nothing they need to
                      write or be marked depends on it, so that is what they
                      are told. Someone who can fix it still gets the cause. */}
                  <span>
                    {canCurate
                      ? `Couldn't add a scenario and terms to this question: ${enrichError}`
                      : "Couldn't load the extra detail for this question. You can still write and be marked as normal."}
                  </span>
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
          a child of it, so the brief button, the outcome chips and the flag stay
          pinned to the bottom instead of scrolling out of reach when a long
          scenario overflows.

          One row from `sm`, and nothing scrolls: the brief button, which takes
          what width is left, then the outcome chips at their own width, then the
          two tools (the AI wand for those who can use it, and the flag) as square
          tiles of the chips' own height. A question links one outcome, or two at
          most (`MAX_LINKED_OUTCOMES`), so the chips fit beside the button; they
          used to take a second row of their own, a grid sized for five. Where the
          footer is too narrow for that (a phone, or two chips in the card's
          two-column width), the chips drop to a line of their own beneath, so the
          button keeps its label: `.outcome-footer` in index.css, a container query
          on the footer's own width. */}
        {!(condensed && linkedOutcomes.length === 0) && (
          <div
            ref={footerRef}
            style={
              {
                minHeight: minFooterHeight || 52,
                '--band-rgb': getBandRgb(verbInfo.tier),
              } as React.CSSProperties
            }
            className={`${CARD_FOOTER_BOX} relative z-10 flex items-center mt-auto`}
          >
            {/* Inner wrapper carries the layout so its height stays
              content-driven — the outer box is inflated by the synced
              minFooterHeight and cannot be measured. */}
            <div
              ref={footerContentRef}
              className="outcome-footer w-full flex flex-wrap items-center gap-2"
            >
              {/* The whole label is the entry point, not just the chips. The
                  chips say WHICH outcomes apply; this says what opening them
                  gets you: what the marker is looking for in this question, and
                  a plain-English brief on the outcomes, worth reading before the
                  first sentence is written. */}
              {linkedOutcomes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleOutcomeClickInternal(linkedOutcomes[0])}
                  title="Open the outcome brief — what this question is assessing and what the marker is looking for"
                  className={`${FOOTER_CHIP} flex-1 min-w-0 justify-between gap-2 px-3 band-fill border-[rgb(var(--band-rgb)/0.85)] ${bandConfig.text} text-xs font-bold hover:brightness-110`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    Read before you write
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </button>
              ) : (
                <div className="flex-1 min-w-0">
                  {!examMode && (
                    // No `opacity`: a muted tone says "nothing to see" and stays
                    // readable for whoever needs to read it.
                    <span className="inline-flex items-center gap-2 min-h-9 text-xs text-[rgb(var(--color-text-muted))] italic font-medium">
                      <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      No outcomes linked
                    </span>
                  )}
                </div>
              )}
              {linkedOutcomes.length > 0 && (
                <div
                  role="group"
                  aria-label="Linked outcomes"
                  data-count={linkedOutcomes.length}
                  className="outcome-footer-chips flex gap-2"
                >
                  {linkedOutcomes.map((outcome) => (
                    <OutcomeChip
                      key={outcome.code}
                      outcome={outcome}
                      bandConfig={bandConfig}
                      onOpen={() => handleOutcomeClickInternal(outcome)}
                    />
                  ))}
                </div>
              )}
              {canGenerate && onSuggestOutcomes && !examMode && (
                <button
                  type="button"
                  onClick={studioAction(onSuggestOutcomes)}
                  disabled={isSuggestingOutcomes}
                  aria-label="Auto-link outcomes with AI"
                  aria-busy={isSuggestingOutcomes || undefined}
                  className={`${FOOTER_TOOL} ${
                    studioChrome ||
                    'bg-[rgb(var(--color-accent))]/10 border-[rgb(var(--color-accent))]/40 text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/20'
                  } ${isSuggestingOutcomes ? 'animate-pulse' : ''}`}
                  title={studioTitle('Auto-link Outcomes with AI')}
                >
                  <Wand2
                    className={`w-3.5 h-3.5 ${isSuggestingOutcomes ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFlagModalOpen(true)}
                aria-label={
                  hasOpenFlag ? 'View the flag on this question' : 'Flag this question for review'
                }
                className={`${FOOTER_TOOL} ${
                  hasOpenFlag
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                    : 'bg-[rgb(var(--color-bg-surface-light))] border-[rgb(var(--band-rgb)/0.45)] text-[rgb(var(--color-text-secondary))] hover:text-amber-600 hover:border-amber-500/60'
                }`}
                title={
                  hasOpenFlag
                    ? 'This question is flagged for review — click to view'
                    : 'Something off about this question? Flag it for review'
                }
              >
                <Flag
                  className={`w-3.5 h-3.5 ${hasOpenFlag ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
              </button>
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
            // Stacked over the brief, not swapped for it. Exam mode disables the
            // verb button, so it gets no sheet either (it has no outcome chips
            // today, so this is the rule written down, not a reachable path).
            onVerbSheet={examMode ? undefined : onVerbClick}
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
