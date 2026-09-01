import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ToastType } from '../hooks/useToast';
import {
  EvaluationResult,
  Prompt,
  EvaluationCriterion,
  UserFeedback,
  HierarchyContext,
} from '../types';
import {
  getBandConfig,
  getBandHex,
  getBandName,
  renderFormattedText,
  stripHtmlTags,
  textContainsKeyword,
  BandConfig,
} from '../utils/renderUtils';
import {
  CheckCircle,
  XCircle,
  Hash,
  Award,
  AlertTriangle,
  Trophy,
  ClipboardList,
  FileDown,
  Settings2,
  Loader2,
  Save,
  ArrowUpCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  PenLine,
  Quote,
  Target,
  RefreshCw,
  Zap,
  Lightbulb,
  Columns2,
  Check,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import {
  getCommandTermInfo,
  getBandForMark,
  getNextLevelTarget,
  tierShortLabel,
} from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import ResponseFeedback from './ResponseFeedback';
import SupportUsageSummary from './SupportUsageSummary';
import { exportEvaluationPdf } from '../pdf';
import PdfExportOptions from './PdfExportOptions';
import {
  PdfExportPreferences,
  readPdfPreferences,
  writePdfPreferences,
} from '../utils/pdfExportPreferences';
import { isFeatureLocked, isFeedbackLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from './UpgradeModal';
import { AI_MARKING_DISCLAIMER } from '../data/legalContent';

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500 no-print`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const MetricCard = ({
  label,
  value,
  subtext,
  icon: Icon,
  theme,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  theme: BandConfig;
}) => (
  <div
    className={`bg-white dark:bg-white/5 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col gap-3 h-full relative overflow-hidden group hover:shadow-md transition-all duration-300`}
  >
    {/* Icon sits inline with its label rather than floating in its own row —
        keeps the tile compact so the score placard beside it doesn't have to
        stretch to match an artificially tall column. */}
    <div className="flex items-center gap-2.5">
      <div
        className={`p-2 rounded-xl shrink-0 ${theme.bg} ${theme.text} group-hover:scale-110 transition-transform duration-300`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate">
        {label}
      </h4>
    </div>
    <div className="flex items-baseline gap-1.5 mt-auto">
      <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
        {value}
      </span>
      {subtext && (
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {subtext}
        </span>
      )}
    </div>
  </div>
);

// The "Band 6" goal meter: how far this response sits from the app's titular
// goal. Achieved bands fill in the current band's canonical colour (BAND_HEX,
// via getBandHex, so it always matches the placard beside it); the numbered
// rungs and the distance text carry the information without relying on colour.
const BandGoalCard = ({ currentBand, maxBand }: { currentBand: number; maxBand: number }) => {
  const goalConfig = getBandConfig(maxBand);
  const reached = currentBand >= maxBand;
  const bandsAway = Math.max(0, maxBand - currentBand);
  const rungs = Array.from({ length: maxBand }, (_, i) => i + 1);

  return (
    <div className="bg-white dark:bg-white/5 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm flex flex-col justify-between gap-3 h-full relative overflow-hidden group hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-2.5">
        <div
          className={`p-2 rounded-xl shrink-0 ${goalConfig.bg} ${goalConfig.text} group-hover:scale-110 transition-transform duration-300`}
        >
          <Trophy className="w-4 h-4" />
        </div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate">
          Band {maxBand} Goal
        </h4>
      </div>
      <div>
        <span className="block text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-3">
          {reached ? 'Achieved' : `${bandsAway} band${bandsAway === 1 ? '' : 's'} to go`}
        </span>
        <div
          className="flex gap-1"
          role="img"
          aria-label={`Band ${currentBand} of ${maxBand} — ${reached ? `Band ${maxBand} achieved` : `${bandsAway} band${bandsAway === 1 ? '' : 's'} from the Band ${maxBand} goal`}`}
        >
          {rungs.map((b) => (
            <div key={b} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`h-2 w-full rounded-full transition-colors duration-500 ${
                  b <= currentBand ? '' : 'bg-slate-200 dark:bg-white/10'
                }`}
                style={b <= currentBand ? { backgroundColor: getBandHex(b) } : undefined}
              />
              <span
                className={`text-[9px] font-black leading-none ${
                  b === maxBand
                    ? goalConfig.text
                    : b <= currentBand
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {b}
              </span>
            </div>
          ))}
        </div>
        {/* The band name belongs to the CURRENT band, so it reads as a caption
            on the meter rather than as a modifier of "n bands to go" above. */}
        <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Now Band {currentBand} · {getBandName(currentBand)}
        </p>
      </div>
    </div>
  );
};

/**
 * One card treatment for every panel in the report.
 *
 * The sections had drifted into four: a `rounded-[32px]` tinted panel, a
 * `rounded-3xl` white card, a dashed-border callout and a bare region between
 * two hairline rules. Read top to bottom the page looked assembled rather than
 * designed, which is most of what "dated" meant here. One radius, one border,
 * one surface — the colour a section carries is then free to mean something.
 */
const CARD =
  'rounded-3xl bg-white dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shadow-sm';

/**
 * The heading above a section: an icon in its section's colour, the label, and
 * an optional trailing chip. Replaces three different treatments — a centred
 * label between two hairline rules, a left-aligned icon pair, and a bare
 * uppercase span — with one, so the eye can find section boundaries without
 * re-learning them each time.
 */
const SectionHeading: React.FC<{
  icon: React.ElementType;
  label: string;
  tone?: string;
  toneBg?: string;
  children?: React.ReactNode;
}> = ({ icon: Icon, label, tone = 'text-slate-500 dark:text-slate-400', toneBg, children }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`p-1.5 rounded-lg ${toneBg ?? 'bg-slate-100 dark:bg-white/10'} ${tone}`}>
      <Icon className="w-3.5 h-3.5" />
    </div>
    <h3 className={`text-[11px] font-black uppercase tracking-[0.18em] ${tone}`}>{label}</h3>
    {children}
  </div>
);

/**
 * How much of a criterion's marks the response earned, as a filled track.
 *
 * "2 / 4" is a fact the reader has to do arithmetic on, and a list of them is a
 * list of arithmetic; the same fact as a track is read at a glance, and a
 * column of tracks shows which criterion cost the most marks without reading a
 * word. The exported PDF has drawn this since it was written (see METER in
 * pdf/types) — the screen was the one that made you work it out.
 */
const CriterionMeter: React.FC<{ mark: number; maxMark: number }> = ({ mark, maxMark }) => {
  const ratio = maxMark > 0 ? Math.max(0, Math.min(1, mark / maxMark)) : 0;
  // The same three-step scale the PDF uses, so a printed report and the screen
  // never disagree about which criteria went well.
  const tone =
    ratio >= 0.85
      ? 'bg-emerald-500'
      : ratio >= 0.5
        ? 'bg-amber-500'
        : ratio > 0
          ? 'bg-rose-500'
          : 'bg-slate-300 dark:bg-white/15';
  return (
    <div
      className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"
      role="img"
      aria-label={`${mark} of ${maxMark} marks awarded`}
    >
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};

// Added interface and used React.FC to correctly allow standard props like 'key' in JSX
interface CriteriaRowProps {
  criterion: EvaluationCriterion;
  maxMark: number;
  mark: number;
  feedback: string;
  prompt: Prompt;
  index?: number;
}

const CriteriaRow: React.FC<CriteriaRowProps> = ({
  criterion,
  maxMark,
  mark,
  feedback,
  prompt,
  index = 0,
}) => {
  const percentage = maxMark > 0 ? (mark / maxMark) * 100 : 0;
  const isSuccess = percentage === 100;
  const isFailure = percentage === 0;

  return (
    <div
      className={`group relative p-5 sm:p-6 ${CARD} hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md transition-all duration-300 animate-fade-in-up-sm CriteriaRow`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug flex-1 min-w-0">
          {/* Numbered, so a criterion can be referred to out loud — "look at
              three" — rather than by quoting its wording back. */}
          <span className="text-slate-300 dark:text-slate-600 tabular-nums mr-2">{index + 1}</span>
          {criterion.criterion}
        </h4>
        <div
          className={`flex items-baseline gap-0.5 px-2.5 py-1 rounded-lg text-xs font-black shrink-0 tabular-nums ${isSuccess ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : isFailure ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'}`}
        >
          <span>{mark}</span>
          <span className="opacity-40">/</span>
          <span>{maxMark}</span>
        </div>
      </div>

      <div className="mt-3">
        <CriterionMeter mark={mark} maxMark={maxMark} />
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
        {renderFormattedText(feedback, prompt.keywords, prompt.verb)}
      </p>
    </div>
  );
};

interface EvaluationDisplayProps {
  result: EvaluationResult;
  prompt: Prompt;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
  /** Open the side-by-side diff of the student's answer against the rewrite. */
  onCompareImprovement?: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  userAnswer?: string;
  onSaveToSamples?: () => void;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
  userName?: string;
  showToast?: (message: string, type?: ToastType) => void;
}

const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({
  result,
  prompt,
  onUseRevisedAnswer,
  onImproveAnswer,
  onCompareImprovement,
  isImproving,
  improveAnswerError,
  userAnswer = '',
  onSaveToSamples,
  onFeedbackSubmit,
  hierarchy,
  userName = 'Student',
  showToast,
}) => {
  const bandConfig = getBandConfig(result.overallBand);
  const termInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const reportRef = useRef<HTMLDivElement>(null);

  // Plus-gated controls stay visible in a locked (amber) state; a click opens
  // the upgrade prompt instead of running the action. See services/entitlements.
  const pdfLocked = isFeatureLocked('pdfExport');
  const upgradesLocked = isFeatureLocked('answerUpgrades');
  const feedbackLocked = isFeedbackLocked();

  // Vector-PDF export state (guards double-clicks, drives the button spinner).
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  // Paper, copies and what goes in the report. Read once from the device's
  // stored preferences so a teacher printing a class set sets them once.
  const [pdfPrefs, setPdfPrefs] = useState<PdfExportPreferences>(() => readPdfPreferences());
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  const updatePdfPrefs = (next: PdfExportPreferences) => {
    setPdfPrefs(next);
    writePdfPreferences(next);
  };

  /**
   * The rewrite, as this client is allowed to present it.
   *
   * The server withholds it from a plan without `answerUpgrades`, so normally
   * there is nothing here to hide. The lock is applied again anyway, in ONE
   * place that every consumer reads — the rendered exemplar, the buttons, the
   * comparison, and the exported PDF — because a rewrite can outlive the
   * entitlement that produced it: a cached result, or a session that was still
   * open when the plan lapsed. A paid asset should not depend on which of four
   * call sites remembered to check.
   */
  const revisedText = useMemo(() => {
    if (upgradesLocked || !result.revisedAnswer) return '';
    return typeof result.revisedAnswer === 'string'
      ? result.revisedAnswer
      : result.revisedAnswer.text;
  }, [result.revisedAnswer, upgradesLocked]);

  // The question's tier caps how high an exemplar can realistically sit.
  const maxBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, termInfo.tier),
    [prompt.totalMarks, termInfo.tier]
  );

  // The Verb Gate binds only below Band 6: a tier-6 verb (Evaluate, Synthesise…)
  // leaves the full range open, so there is nothing to explain there. Below that
  // the ceiling is real, and the report should say why it is where it is.
  const capIsBinding = maxBand < 6;
  // Band N's canonical colour equals Tier N's, so the cap note wears the same
  // hue as the "Band N Goal" card beside it (see getBandConfig / BandGoalCard).
  const capConfig = getBandConfig(maxBand);

  // What the improved response is actually worth: one mark above the student's,
  // and the band that mark maps to. The header used to promise "Band N+1" for a
  // rewrite briefed to earn a single extra mark, so on most questions the label
  // over-sold what the student was reading.
  const nextLevel = useMemo(
    () => getNextLevelTarget(result.overallMark, prompt.totalMarks, termInfo.tier),
    [result.overallMark, prompt.totalMarks, termInfo.tier]
  );

  const exemplarMark = useMemo(() => {
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.mark) {
      return Math.min(prompt.totalMarks, result.revisedAnswer.mark);
    }
    return nextLevel.targetMark;
  }, [result.revisedAnswer, nextLevel.targetMark, prompt.totalMarks]);

  const exemplarBand = useMemo(() => {
    // An AI-reported band is clamped to the question's ceiling too — the Verb
    // Gate applies to every band figure shown, including model output.
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.band) {
      return Math.min(maxBand, result.revisedAnswer.band);
    }
    return Math.min(maxBand, getBandForMark(exemplarMark, prompt.totalMarks, termInfo.tier));
  }, [result.revisedAnswer, exemplarMark, prompt.totalMarks, termInfo.tier, maxBand]);

  const exemplarConfig = getBandConfig(exemplarBand);

  // Calculations for metrics
  const wordCount = useMemo(
    () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
    [userAnswer]
  );
  const { keywordsUsedCount } = useMemo(() => {
    // Shares the highlighter's matcher so this count always agrees with the
    // terms shown highlighted in the response.
    const used = (prompt.keywords || []).filter((kw) => textContainsKeyword(userAnswer, kw));
    return { keywordsUsedCount: used.length };
  }, [userAnswer, prompt.keywords]);

  // Where this question lives in the syllabus — shown under the hero and
  // embedded in the PDF so a shared report identifies its own provenance.
  const syllabusTrail = useMemo(
    () =>
      hierarchy
        ? [hierarchy.course, hierarchy.topic, hierarchy.subTopic, hierarchy.dotPoint].filter(
            (s): s is string => !!s && !!s.trim()
          )
        : [],
    [hierarchy]
  );

  // Auto-scroll the trail rail to its leaf on overflow, matching Breadcrumb.tsx:
  // the deepest segment (the exact dot point marked) is the most useful, but a
  // left-pinned overflow rail hides it on a narrow viewport. Keyed on the
  // trail's CONTENT so it only re-scrolls when the location actually changes.
  const trailRailRef = useRef<HTMLElement>(null);
  const trailKey = syllabusTrail.join('›');
  useEffect(() => {
    const el = trailRailRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: el.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
  }, [trailKey]);

  const handleExportPdf = async () => {
    if (isExporting) return; // guard double-clicks
    setIsExporting(true);
    setExportStatus('Starting…');
    try {
      // Pass raw content through; the pdf module normalises HTML/markup safely
      // (a whitelist strip that preserves bare `<`/`>` in code and maths).
      await exportEvaluationPdf({
        data: {
          question: prompt.question,
          verb: prompt.verb,
          totalMarks: prompt.totalMarks,
          syllabusPath: syllabusTrail.join('  ›  ') || undefined,
          studentAnswer: pdfPrefs.includeResponse ? userAnswer.trim() || undefined : undefined,
          overallMark: result.overallMark,
          overallBand: result.overallBand,
          overallFeedback: result.overallFeedback || '',
          quickTip: result.quickTip,
          strengths: result.strengths || [],
          improvements: result.improvements || [],
          criteria: (result.criteria || []).map((c) => ({
            criterion: c.criterion,
            mark: c.mark,
            maxMark: c.maxMark,
            feedback: c.feedback,
          })),
          // Empty while locked (see `revisedText`), which takes the improved
          // response AND the change list built from it out of the file.
          revisedAnswer: revisedText || undefined,
          exemplarBand,
          exemplarMark,
          wordCount,
          keywordsUsed: keywordsUsedCount,
          keywordsTotal: prompt.keywords?.length || 0,
          markerNotes: pdfPrefs.markerNotes,
          // Colours the syllabus terms on the page the way `renderFormattedText`
          // colours them on screen — the exporter shares the app's matcher, so
          // the two cannot disagree about what counts as a key term.
          keywords: prompt.keywords || [],
        },
        pageSize: pdfPrefs.pageSize,
        copies: pdfPrefs.copies,
        showFields: pdfPrefs.showFields,
        filename: `HSC-${prompt.verb}-Band${result.overallBand}-Feedback`,
        subtitle: hierarchy
          ? `${hierarchy.topic} — ${hierarchy.subTopic}`
          : 'Marking Feedback Report',
        onToast: showToast,
        onProgress: (_fraction, label) => setExportStatus(label),
      });
    } catch {
      // Every rejection is a PdfExportError the exporter has already toasted,
      // naming the stage that failed.
    } finally {
      setIsExporting(false);
      setExportStatus('');
    }
  };

  return (
    <div
      ref={reportRef}
      /* gap-6, not gap-8: each section now carries its own heading with its own
         margin, so the old gap stacked two separations on top of each other and
         pushed the criteria a scroll further down than they needed to be. */
      className="relative flex flex-col gap-6 max-w-5xl mx-auto pb-20 EvaluationDisplay"
    >
      <AiBusyOverlay show={isImproving} rounded="rounded-3xl">
        <LoadingIndicator
          task="generation"
          message={`Lifting your answer to ${nextLevel.targetMark}/${prompt.totalMarks}`}
          messages={[
            'Keeping your wording and structure...',
            'Adding what the marker asked for...',
            'Sharpening the syllabus terminology...',
          ]}
          duration={12}
          band={exemplarBand}
        />
      </AiBusyOverlay>

      {/* Hero Question Context — left edge aligns with the cards below it, and
          the trail/meta/question sit on a tightening rhythm so the question
          reads as the heading of the whole report. */}
      <header className="flex flex-col gap-3">
        {/* Breadcrumb as one scrollable rail rather than a wrapping block: a
            deep syllabus trail wrapped to four stacked lines on a phone,
            shoving the question down the screen. It scrolls only when it
            overflows, so on a desktop that already fits it looks and behaves
            exactly as before — matching the workspace breadcrumb's own
            scrollbar-hide rail. */}
        {syllabusTrail.length > 0 && (
          <nav
            ref={trailRailRef}
            aria-label="Syllabus location"
            // tabIndex makes the hidden-scrollbar rail reachable by keyboard so a
            // clipped deep trail can still be scrolled without a pointer.
            tabIndex={0}
            className="flex items-center gap-x-1.5 flex-nowrap overflow-x-auto scrollbar-hide text-slate-500 dark:text-slate-400"
          >
            {syllabusTrail.map((segment, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  title={segment}
                >
                  {segment}
                </span>
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {prompt.verb}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {prompt.totalMarks} Marks
          </span>
        </div>
        <h2 className="text-xl md:text-2xl font-serif font-medium text-slate-900 dark:text-white leading-snug max-w-3xl">
          {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
        </h2>
      </header>

      {/* Score & Metrics Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Main Vibrant Placard */}
        <div
          className={`clip-stable lg:col-span-7 relative rounded-3xl overflow-hidden p-7 sm:p-8 shadow-xl transition-all duration-500 bg-gradient-to-br ${bandConfig.gradient}`}
        >
          <MeshOverlay opacity="opacity-[0.15]" />

          <div className="relative z-10 flex flex-col justify-between h-full gap-6 text-white">
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 mb-4 shadow-sm backdrop-blur-md bg-white/20`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Band {result.overallBand} · {getBandName(result.overallBand)}
                    </span>
                  </div>
                  <h1 className="text-6xl sm:text-7xl font-black tracking-tight italic leading-none">
                    {result.overallMark}
                    <span className="text-3xl font-medium align-top opacity-60">
                      /{prompt.totalMarks}
                    </span>
                  </h1>
                  <p className="text-xs font-bold opacity-80 mt-2 tracking-[0.15em] uppercase">
                    Assessment Score
                  </p>
                </div>
                <div
                  className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/20 shadow-xl no-print`}
                >
                  {result.overallBand >= 5 ? (
                    <Trophy className="w-7 h-7 text-white" />
                  ) : result.overallBand >= 3 ? (
                    <Target className="w-7 h-7 text-white" />
                  ) : (
                    <AlertTriangle className="w-7 h-7 text-white" />
                  )}
                </div>
              </div>

              {/* Marks awarded as a share of the total — gives the placard's
                middle a purpose instead of leaving a gradient void when the
                column stretches to match the metrics beside it. */}
              <div
                className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden"
                role="img"
                aria-label={`${result.overallMark} of ${prompt.totalMarks} marks awarded`}
              >
                <div
                  className="h-full rounded-full bg-white/90 transition-all duration-700"
                  style={{
                    width: `${prompt.totalMarks > 0 ? Math.min(100, (result.overallMark / prompt.totalMarks) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              {/* Export, and the options behind a chevron. Splitting them keeps
                  the common case one click while making paper size, copies and
                  what goes in the report reachable at all — every one of them
                  was already supported by the exporter and unreachable. */}
              <div className="relative flex" ref={pdfMenuRef}>
                <button
                  onClick={pdfLocked ? () => requestUpgrade('pdfExport') : handleExportPdf}
                  disabled={isExporting}
                  aria-busy={isExporting}
                  title={
                    pdfLocked ? 'PDF export is part of Band 6 Plus — tap to learn more' : undefined
                  }
                  className={`px-5 py-3 rounded-l-2xl text-white text-xs font-bold shadow-sm transition-all border border-r-0 backdrop-blur-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    pdfLocked
                      ? 'bg-amber-400/15 hover:bg-amber-400/25 border-amber-300/50'
                      : 'bg-white/20 hover:bg-white/30 border-white/20'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {/* The stage text updates several times during a multi-second
                          export (engine → fonts → page N of M). aria-busy on the
                          button says "working", but without a live region none of
                          the progress is announced. */}
                      <span role="status" aria-live="polite">
                        {exportStatus || 'Exporting…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" /> Export PDF
                      {pdfLocked && (
                        <PlusLockChip className="bg-white/15 border-white/40 text-white" />
                      )}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPdfOptions((v) => !v)}
                  disabled={isExporting}
                  aria-label="PDF export options"
                  aria-expanded={showPdfOptions}
                  title="Paper size, copies and what to include"
                  className={`px-2.5 rounded-r-2xl text-white border backdrop-blur-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    showPdfOptions ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30'
                  } border-white/20`}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <PdfExportOptions
                  open={showPdfOptions}
                  onClose={() => setShowPdfOptions(false)}
                  value={pdfPrefs}
                  onChange={updatePdfPrefs}
                  anchorRef={pdfMenuRef}
                />
              </div>
              {onSaveToSamples && (
                <button
                  onClick={onSaveToSamples}
                  className="px-5 py-3 rounded-2xl bg-white text-indigo-900 hover:bg-indigo-50 text-xs font-bold shadow-lg transition-all hover:scale-105 flex items-center gap-2 border-2 border-transparent"
                >
                  <Save className="w-4 h-4" /> Save Result
                </button>
              )}
            </div>

            {/* The agreement makes this point once, at sign-up. This is where
                it actually matters: next to a mark and a band that look
                exactly like a real result. Deliberately quiet, and always
                present — including on the printed page. */}
            <p className="text-[10px] leading-relaxed text-white/60 max-w-md">
              {AI_MARKING_DISCLAIMER}
            </p>
          </div>
        </div>

        {/* Goal + Metrics */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <BandGoalCard currentBand={result.overallBand} maxBand={maxBand} />
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Volume"
              value={wordCount}
              subtext="Words"
              icon={FileText}
              theme={bandConfig}
            />
            <MetricCard
              label="Key Terms"
              value={keywordsUsedCount}
              subtext={`of ${prompt.keywords?.length || 0}`}
              icon={Hash}
              theme={bandConfig}
            />
          </div>
        </div>
      </div>

      {/* Why the goal above is capped where it is. The "Band N Goal" card states
          the ceiling; without this a student or teacher can read it as the
          marker being harsh rather than as the verb's own cognitive limit.
          Shown only when the cap actually binds (below Band 6) — a tier-6 verb
          leaves the full range open and needs no explanation. The meaning is
          carried entirely by the text, not the tier tint, so it stands on a
          greyscale print and to a screen reader. */}
      {capIsBinding && (
        <div className={`${CARD} flex items-start gap-4 p-5`}>
          <div className={`p-2.5 rounded-xl shrink-0 ${capConfig.iconBg} ${capConfig.text}`}>
            <Award className="w-5 h-5" />
          </div>
          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 pt-0.5">
            <span className="font-bold text-slate-800 dark:text-slate-100">'{prompt.verb}'</span> is
            a Tier {termInfo.tier} ({tierShortLabel(termInfo.tier)}) command. Its cognitive demand
            caps the achievable result at{' '}
            <span className={`font-bold ${capConfig.text}`}>Band {maxBand}</span> — even a flawless
            response tops out here, so this is the ceiling the mark is measured against, not a harsh
            marker.
          </p>
        </div>
      )}

      {/* Student Response — included so the report can be shared with a
          teacher as a self-contained record of what was actually submitted. */}
      {userAnswer.trim() && (
        <section className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                <PenLine className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {userName}'s Response
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {wordCount} words · as submitted
            </span>
          </div>
          <div className="p-6 sm:p-8">
            <div className="prose prose-slate dark:prose-invert max-w-none font-serif leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
              {renderFormattedText(userAnswer, prompt.keywords, prompt.verb)}
            </div>
          </div>
        </section>
      )}

      {/* Coach's Tip — the one sentence to act on first. A solid card with a
          band-coloured rail rather than the dashed callout it used to be: the
          dashes read as a placeholder, and the tip is the opposite of one. */}
      {result.quickTip && (
        <div
          className={`relative overflow-hidden ${CARD} flex items-start gap-4 p-5 animate-fade-in`}
        >
          <div
            className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bandConfig.gradient}`}
            aria-hidden="true"
          />
          <div className={`ml-1 p-2.5 rounded-xl ${bandConfig.iconBg} ${bandConfig.text} shrink-0`}>
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <span
              className={`block mb-1 text-[10px] font-black uppercase tracking-[0.18em] ${bandConfig.text}`}
            >
              Coach's Tip
            </span>
            {/* Run through the formatter like every other piece of marker prose
                — it used to be the one place a syllabus term printed plain. */}
            <p className="text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
              {renderFormattedText(result.quickTip, prompt.keywords, prompt.verb)}
            </p>
          </div>
        </div>
      )}

      {/* Marker's Commentary */}
      <section>
        <SectionHeading icon={Quote} label="Marker's Commentary" />
        <div className={`relative overflow-hidden ${CARD} p-6 sm:p-8`}>
          <div
            className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bandConfig.gradient}`}
            aria-hidden="true"
          />
          {/* Serif, because this is the one passage on the page written TO the
              student — but at reading size. It used to be text-xl italic, which
              set the marker's aside larger than the question it was about. */}
          <div className="prose prose-slate dark:prose-invert max-w-none font-serif text-base sm:text-[17px] leading-relaxed text-slate-700 dark:text-slate-300 pl-3">
            {renderFormattedText(result.overallFeedback, prompt.keywords, prompt.verb)}
          </div>
        </div>
      </section>

      {/* Strengths & Growth */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section>
          <SectionHeading
            icon={CheckCircle}
            label="Strong Evidence"
            tone="text-emerald-600 dark:text-emerald-400"
            toneBg="bg-emerald-100 dark:bg-emerald-500/15"
          />
          <ul className={`${CARD} p-5 sm:p-6 space-y-3.5`}>
            {result.strengths.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                {/* A tick, not a dot. The two lists mean opposite things and
                    used to be told apart only by the colour of a 6px circle —
                    which is no distinction at all on a greyscale print. */}
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                <span>{renderFormattedText(s, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </section>
        {/* The improvement path is REDACTED server-side for the free tier
            (api/_lib/entitlements.ts replaces it with the upgrade
            placeholder), so it has to carry the same lock treatment as the
            criteria below. Without it a free user reads
            "Upgrade to see this feedback." as if it were the marker's actual
            advice, with nothing to click. */}
        <section className="relative">
          <SectionHeading
            icon={XCircle}
            label="Areas for Growth"
            tone="text-rose-600 dark:text-rose-400"
            toneBg="bg-rose-100 dark:bg-rose-500/15"
          >
            {feedbackLocked && <PlusLockChip />}
          </SectionHeading>
          {feedbackLocked && (
            <ContentLockOverlay
              feature="fullFeedback"
              message="Your improvement path is a Plus feature"
              className="rounded-3xl"
            />
          )}
          <ul
            className={`${CARD} p-5 sm:p-6 space-y-3.5 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
          >
            {result.improvements.map((im, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-fade-in-up-sm"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>{renderFormattedText(im, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* What the student had open before writing. Placed directly under the
          improvement path, where "you did not open the Marking Guide" reads as
          a route to the advice above rather than a reprimand of its own. */}
      <SupportUsageSummary promptId={prompt.id} />

      {/* Criteria Breakdown */}
      <section className="relative">
        <div className="no-print">
          <SectionHeading icon={ClipboardList} label="Criteria Breakdown">
            {feedbackLocked && <PlusLockChip />}
          </SectionHeading>
        </div>
        {feedbackLocked && (
          <ContentLockOverlay
            feature="fullFeedback"
            message="Detailed criterion feedback is a Plus feature"
          />
        )}
        <div
          className={`grid grid-cols-1 gap-3 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
        >
          {result.criteria.map((criterion, idx) => (
            <CriteriaRow
              key={idx}
              index={idx}
              criterion={criterion}
              maxMark={criterion.maxMark}
              mark={criterion.mark}
              feedback={criterion.feedback}
              prompt={prompt}
            />
          ))}
        </div>
      </section>

      {/* Failed answer upgrades were silently swallowed before — surface them. */}
      {improveAnswerError && !isImproving && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 no-print">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              The improved response could not be generated.
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
              {improveAnswerError}
            </p>
          </div>
        </div>
      )}

      {/* Improved Response (Exemplar).
          Rendered when there IS a rewrite — or when the plan withheld one. The
          proxy redacts the rewrite for an account whose plan doesn't include
          answer upgrades (redactPaidFeedback), which left `revisedText` empty
          and hid this whole section — including the upgrade button inside it
          that is the only thing selling the feature. The section a free user
          sees is the locked state below: no exemplar text, one clear CTA. */}
      {(revisedText || (upgradesLocked && result.overallMark < prompt.totalMarks)) && (
        <section
          className={`clip-stable relative rounded-3xl border ${exemplarConfig.border} overflow-hidden shadow-lg transition-all duration-500 group mt-4`}
        >
          <div
            className={`absolute inset-0 ${exemplarConfig.bg} opacity-[0.03] pointer-events-none no-print`}
          />
          <MeshOverlay />

          <div
            className={`px-8 py-5 bg-gradient-to-r ${exemplarConfig.gradient} flex flex-wrap justify-between items-center gap-4 relative z-10`}
          >
            <div className="flex items-center gap-5">
              <div className="p-3 rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm text-white">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-black uppercase tracking-normal italic text-white">
                  Improved Response
                </h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest">
                    {revisedText
                      ? `Your answer, lifted to ${exemplarMark}/${prompt.totalMarks} — Band ${exemplarBand}`
                      : `See your answer rewritten to ${exemplarMark}/${prompt.totalMarks}`}
                  </span>
                  {revisedText && result.overallMark < exemplarMark && (
                    <span className="px-2 py-0.5 rounded-lg bg-white/20 text-white text-[9px] font-black uppercase tracking-wider backdrop-blur-sm no-print">
                      +{exemplarMark - result.overallMark} Mark
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              {/* Gated on MARKS, not bands: a student sitting at 5/6 inside the
                  top band still has a mark to win, and the band test hid the
                  control from them. */}
              {result.overallMark < prompt.totalMarks && (
                <button
                  onClick={
                    upgradesLocked ? () => requestUpgrade('answerUpgrades') : onImproveAnswer
                  }
                  disabled={isImproving}
                  title={
                    upgradesLocked
                      ? 'AI answer upgrades are part of Band 6 Plus — tap to learn more'
                      : undefined
                  }
                  className={`px-5 py-3 rounded-xl text-white border text-[11px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-[0.98] flex items-center gap-2 backdrop-blur-sm ${
                    upgradesLocked
                      ? 'bg-amber-400/15 hover:bg-amber-400/25 border-amber-300/50'
                      : 'bg-white/10 hover:bg-white/20 border-white/20'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${isImproving ? 'animate-spin' : ''}`} />
                  {isImproving
                    ? 'Regenerating...'
                    : revisedText
                      ? 'Regenerate'
                      : 'Improve my answer'}
                  {upgradesLocked && (
                    <PlusLockChip className="bg-white/15 border-white/40 text-white" />
                  )}
                </button>
              )}
              {/* The comparison is the point: the rewrite is an EDIT of the
                  student's own answer, and reading it as a block of prose hides
                  the handful of words that earned the extra mark. */}
              {revisedText && onCompareImprovement && (
                <button
                  onClick={onCompareImprovement}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[11px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-[0.98] flex items-center gap-2 backdrop-blur-sm"
                >
                  <Columns2 className="w-4 h-4" />
                  Compare with mine
                </button>
              )}
              {revisedText && (
                <button
                  onClick={() => onUseRevisedAnswer(stripHtmlTags(revisedText))}
                  className="px-6 py-3 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 border-2 border-transparent hover:border-white/50 text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-[0.98] shadow-xl flex items-center gap-2"
                >
                  <span>Use This Answer</span>
                  <ArrowUpCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* The surface token, not a hand-picked hex. `#0f1420` was the one
              colour on this page that could not follow a theme change. */}
          <div className="p-6 sm:p-8 bg-white dark:bg-[rgb(var(--color-bg-surface))] relative z-10">
            {revisedText ? (
              <div className="prose prose-slate dark:prose-invert max-w-none font-serif text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-200">
                {renderFormattedText(revisedText, prompt.keywords, prompt.verb)}
              </div>
            ) : (
              <div className="flex flex-col items-center text-center gap-3 py-6 no-print">
                <Zap className={`w-8 h-8 ${exemplarConfig.text} opacity-60`} />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Your answer, rewritten one mark higher — in your own words
                </p>
                <p className="max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Band 6 Plus rewrites what you wrote to reach {exemplarMark}/{prompt.totalMarks},
                  keeping your structure and voice, and shows you the changes side by side so you
                  can see exactly what the extra mark was for.
                </p>
                <button
                  onClick={() => requestUpgrade('answerUpgrades')}
                  className={`mt-1 px-6 py-3 rounded-xl text-white text-[11px] font-black uppercase tracking-widest shadow-lg bg-gradient-to-r ${exemplarConfig.gradient} hover:scale-105 active:scale-[0.98] transition-all`}
                >
                  See what Plus unlocks
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Feedback Footer */}
      <div className="mt-4 flex justify-center no-print">
        <div className="w-full max-w-2xl bg-slate-50 dark:bg-white/5 rounded-3xl p-1 border border-slate-200/80 dark:border-white/10">
          <ResponseFeedback
            onFeedbackSubmit={onFeedbackSubmit}
            existingFeedback={result.userFeedback}
          />
        </div>
      </div>
    </div>
  );
};

export default EvaluationDisplay;
