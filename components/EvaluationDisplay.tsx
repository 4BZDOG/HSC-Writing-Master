import React, { useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { getCommandTermInfo, getBandForMark } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import ResponseFeedback from './ResponseFeedback';
import { exportEvaluationPdf } from '../pdf';
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
  icon: any;
  theme: BandConfig;
}) => (
  <div
    className={`bg-white dark:bg-white/5 rounded-3xl p-4 sm:p-5 border border-slate-100 dark:border-white/5 shadow-sm flex flex-col gap-3 h-full relative overflow-hidden group hover:shadow-md transition-all duration-300`}
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
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">
        {label}
      </h4>
    </div>
    <div className="flex items-baseline gap-1.5 mt-auto">
      <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
        {value}
      </span>
      {subtext && (
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
    <div className="bg-white dark:bg-white/5 rounded-3xl p-4 sm:p-5 border border-slate-100 dark:border-white/5 shadow-sm flex flex-col justify-between gap-3 h-full relative overflow-hidden group hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-2.5">
        <div
          className={`p-2 rounded-xl shrink-0 ${goalConfig.bg} ${goalConfig.text} group-hover:scale-110 transition-transform duration-300`}
        >
          <Trophy className="w-4 h-4" />
        </div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">
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
        <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Now Band {currentBand} · {getBandName(currentBand)}
        </p>
      </div>
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
      className="group relative p-6 rounded-3xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-all duration-300 shadow-sm hover:shadow-md animate-fade-in-up-sm CriteriaRow"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 pr-4 leading-snug flex-1">
          {criterion.criterion}
        </h4>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shrink-0 ${isSuccess ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : isFailure ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'}`}
        >
          <span>{mark}</span>
          <span className="opacity-40">/</span>
          <span>{maxMark}</span>
        </div>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-slate-200 dark:bg-white/10 group-hover:bg-indigo-500 transition-colors no-print"></div>
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 pl-4 font-medium">
          {renderFormattedText(feedback, prompt.keywords, prompt.verb)}
        </p>
      </div>
    </div>
  );
};

interface EvaluationDisplayProps {
  result: EvaluationResult;
  prompt: Prompt;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  userAnswer?: string;
  onSaveToSamples?: () => void;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
  userName?: string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({
  result,
  prompt,
  onUseRevisedAnswer,
  onImproveAnswer,
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

  const revisedText = useMemo(() => {
    if (!result.revisedAnswer) return '';
    return typeof result.revisedAnswer === 'string'
      ? result.revisedAnswer
      : result.revisedAnswer.text;
  }, [result.revisedAnswer]);

  // The question's tier caps how high an exemplar can realistically sit.
  const maxBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, termInfo.tier),
    [prompt.totalMarks, termInfo.tier]
  );

  const exemplarBand = useMemo(() => {
    // An AI-reported band is clamped to the question's ceiling too — the Verb
    // Gate applies to every band figure shown, including model output.
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.band) {
      return Math.min(maxBand, result.revisedAnswer.band);
    }
    return Math.min(maxBand, result.overallBand + 1);
  }, [result.revisedAnswer, result.overallBand, maxBand]);

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
          studentAnswer: userAnswer.trim() || undefined,
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
          revisedAnswer: revisedText || undefined,
          exemplarBand,
          wordCount,
          keywordsUsed: keywordsUsedCount,
          keywordsTotal: prompt.keywords?.length || 0,
        },
        filename: `HSC-${prompt.verb}-Band${result.overallBand}-Feedback`,
        subtitle: hierarchy
          ? `${hierarchy.topic} — ${hierarchy.subTopic}`
          : 'Marking Feedback Report',
        onToast: showToast,
        onProgress: (_fraction, label) => setExportStatus(label),
      });
    } catch {
      // The exporter already surfaces a toast on engine-load failure.
    } finally {
      setIsExporting(false);
      setExportStatus('');
    }
  };

  return (
    <div
      ref={reportRef}
      className="relative flex flex-col gap-8 max-w-5xl mx-auto pb-20 EvaluationDisplay"
    >
      <AiBusyOverlay show={isImproving} rounded="rounded-[32px]">
        <LoadingIndicator
          task="generation"
          message={`Upgrading to Band ${exemplarBand}`}
          messages={[
            'Synthesising higher-order concepts...',
            'Refining syllabus terminology...',
            'Restructuring for Band ' + exemplarBand + '...',
          ]}
          duration={12}
          band={exemplarBand}
        />
      </AiBusyOverlay>

      {/* Hero Question Context — left edge aligns with the cards below it, and
          the trail/meta/question sit on a tightening rhythm so the question
          reads as the heading of the whole report. */}
      <header className="flex flex-col gap-3">
        {syllabusTrail.length > 0 && (
          <nav
            aria-label="Syllabus location"
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-slate-500 dark:text-slate-400"
          >
            {syllabusTrail.map((segment, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider truncate max-w-[16rem]"
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
          className={`clip-stable lg:col-span-7 relative rounded-[32px] overflow-hidden p-7 sm:p-8 shadow-xl transition-all duration-500 bg-gradient-to-br ${bandConfig.gradient}`}
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
                  <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-none">
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
              <button
                onClick={pdfLocked ? () => requestUpgrade('pdfExport') : handleExportPdf}
                disabled={isExporting}
                aria-busy={isExporting}
                title={
                  pdfLocked ? 'PDF export is part of Band 6 Plus — tap to learn more' : undefined
                }
                className={`px-5 py-3 rounded-2xl text-white text-xs font-bold shadow-sm transition-all hover:scale-105 border backdrop-blur-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${
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

      {/* Student Response — included so the report can be shared with a
          teacher as a self-contained record of what was actually submitted. */}
      {userAnswer.trim() && (
        <section className="rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                <PenLine className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {userName}'s Response
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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

      {/* Quick Coach Tip Banner */}
      {result.quickTip && (
        <div
          className={`
              mt-2 p-5 rounded-3xl border-2 border-dashed
              flex items-start gap-4 animate-fade-in
              ${bandConfig.bg} ${bandConfig.border}
          `}
        >
          <div
            className={`p-2.5 rounded-xl ${bandConfig.iconBg} ${bandConfig.border} shadow-sm shrink-0`}
          >
            <Lightbulb className={`w-5 h-5 ${bandConfig.text}`} />
          </div>
          <div className="pt-0.5">
            <span
              className={`text-[10px] font-black uppercase tracking-[0.2em] ${bandConfig.text} block mb-1`}
            >
              Coach's Tip
            </span>
            <p className={`text-sm font-bold leading-snug ${bandConfig.text} opacity-90`}>
              {result.quickTip}
            </p>
          </div>
        </div>
      )}

      {/* Marker's Commentary */}
      <section className="relative my-4">
        <div className="flex items-center gap-4 mb-6">
          <div className={`h-px flex-1 ${bandConfig.bg} opacity-50`}></div>
          <h3 className={`text-xs font-bold uppercase tracking-[0.3em] ${bandConfig.text}`}>
            Marker's Commentary
          </h3>
          <div className={`h-px flex-1 ${bandConfig.bg} opacity-50`}></div>
        </div>

        <div className="px-8 py-2 relative">
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b ${bandConfig.gradient} opacity-50`}
          ></div>
          <Quote
            className={`absolute top-0 left-4 w-6 h-6 ${bandConfig.text} opacity-20 transform -scale-x-100 no-print`}
          />
          <div className="prose prose-lg prose-slate dark:prose-invert max-w-none font-serif italic text-xl leading-relaxed text-slate-700 dark:text-slate-300 pl-6">
            {renderFormattedText(result.overallFeedback, prompt.keywords, prompt.verb)}
          </div>
        </div>
      </section>

      {/* Strengths & Growth */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-8 rounded-[32px] bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
          <h4 className="font-bold text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-6">
            <CheckCircle className="w-4 h-4" /> Strong Evidence
          </h4>
          <ul className="space-y-4">
            {result.strengths.map((s, i) => (
              <li
                key={i}
                className="flex gap-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed group animate-fade-in-up-sm"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                <span>{renderFormattedText(s, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* The improvement path is REDACTED server-side for the free tier
            (api/_lib/entitlements.ts replaces it with the upgrade
            placeholder), so it has to carry the same lock treatment as the
            criteria below. Without it a free user reads
            "Upgrade to see this feedback." as if it were the marker's actual
            advice, with nothing to click. */}
        <div className="relative p-8 rounded-[32px] bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-500/20 shadow-sm">
          <h4 className="font-bold text-rose-700 dark:text-rose-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-6">
            <XCircle className="w-4 h-4" /> Areas for Growth
            {feedbackLocked && <PlusLockChip />}
          </h4>
          {feedbackLocked && (
            <ContentLockOverlay
              feature="fullFeedback"
              message="Your improvement path is a Plus feature"
            />
          )}
          <ul
            className={`space-y-4 ${feedbackLocked ? 'blur-sm select-none pointer-events-none' : ''}`}
          >
            {result.improvements.map((im, i) => (
              <li
                key={i}
                className="flex gap-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed group animate-fade-in-up-sm"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                <span>{renderFormattedText(im, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Criteria Breakdown */}
      <section className="relative">
        <div className="flex items-center gap-3 mb-6 no-print">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
            Criteria Breakdown
          </h3>
          {feedbackLocked && <PlusLockChip />}
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

      {/* Improved Response (Exemplar) */}
      {revisedText && (
        <section
          className={`clip-stable relative rounded-[32px] border-2 ${exemplarConfig.border} overflow-hidden shadow-xl transition-all duration-500 group mt-8`}
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
                <h4 className="text-lg font-black uppercase tracking-tight text-white">
                  Improved Response
                </h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest">
                    Band {exemplarBand} Standard
                  </span>
                  {result.overallBand < exemplarBand && (
                    <span className="px-2 py-0.5 rounded-lg bg-white/20 text-white text-[9px] font-black uppercase tracking-wider backdrop-blur-sm no-print">
                      Upgrade Available
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              {result.overallBand < maxBand && (
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
                  className={`px-5 py-3 rounded-xl text-white border text-[11px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-2 backdrop-blur-sm ${
                    upgradesLocked
                      ? 'bg-amber-400/15 hover:bg-amber-400/25 border-amber-300/50'
                      : 'bg-white/10 hover:bg-white/20 border-white/20'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${isImproving ? 'animate-spin' : ''}`} />
                  {isImproving ? 'Regenerating...' : 'Regenerate'}
                  {upgradesLocked && (
                    <PlusLockChip className="bg-white/15 border-white/40 text-white" />
                  )}
                </button>
              )}
              <button
                onClick={() => onUseRevisedAnswer(stripHtmlTags(revisedText))}
                className="px-6 py-3 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 border-2 border-transparent hover:border-white/50 text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl flex items-center gap-2"
              >
                <span>Use This Answer</span>
                <ArrowUpCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-8 bg-white dark:bg-[#0f1420] relative z-10">
            <div className="prose prose-lg prose-slate dark:prose-invert max-w-none font-serif leading-loose text-slate-800 dark:text-slate-200">
              {renderFormattedText(revisedText, prompt.keywords, prompt.verb)}
            </div>
          </div>
        </section>
      )}

      {/* Feedback Footer */}
      <div className="mt-8 flex justify-center no-print">
        <div className="w-full max-w-2xl bg-slate-50 dark:bg-white/5 rounded-3xl p-1 border border-slate-200 dark:border-white/5">
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
