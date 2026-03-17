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
  renderFormattedText,
  stripHtmlTags,
  escapeRegExp,
  getKeywordVariants,
  BandConfig,
} from '../utils/renderUtils';
import {
  CheckCircle,
  XCircle,
  BookOpen,
  Repeat,
  BarChart,
  Hash,
  Award,
  Sparkles,
  AlertTriangle,
  Trophy,
  ClipboardList,
  FileDown,
  Loader2,
  Save,
  ArrowUpCircle,
  ChevronRight,
  AlertCircle,
  Settings,
  FileText,
  FileQuestion,
  Quote,
  Target,
  RefreshCw,
  Copy,
  Check,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Lightbulb,
} from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import ResponseFeedback from './ResponseFeedback';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';
import PdfConfigModal, { PdfConfig } from './PdfConfigModal';

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
    className={`bg-white dark:bg-white/5 rounded-3xl p-5 border border-slate-100 dark:border-white/5 shadow-sm flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-all duration-300`}
  >
    <div className="flex justify-between items-start mb-2">
      <div
        className={`p-2.5 rounded-2xl ${theme.bg} ${theme.text} group-hover:scale-110 transition-transform duration-300`}
      >
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
        {label}
      </h4>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {value}
        </span>
        {subtext && (
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {subtext}
          </span>
        )}
      </div>
    </div>
  </div>
);

// Added interface and used React.FC to correctly allow standard props like 'key' in JSX
interface CriteriaRowProps {
  criterion: EvaluationCriterion;
  maxMark: number;
  mark: number;
  feedback: string;
  bandConfig: any;
  prompt: Prompt;
}

const CriteriaRow: React.FC<CriteriaRowProps> = ({
  criterion,
  maxMark,
  mark,
  feedback,
  bandConfig,
  prompt,
}) => {
  const percentage = maxMark > 0 ? (mark / maxMark) * 100 : 0;
  const isSuccess = percentage === 100;
  const isFailure = percentage === 0;

  return (
    <div className="group relative p-6 rounded-3xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-all duration-300 shadow-sm hover:shadow-md CriteriaRow">
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
  breadcrumbs?: string[];
  onSaveToSamples?: () => void;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
  userName?: string;
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
}) => {
  const bandConfig = getBandConfig(result.overallBand);
  const termInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const reportRef = useRef<HTMLDivElement>(null);

  const revisedText = useMemo(() => {
    if (!result.revisedAnswer) return '';
    return typeof result.revisedAnswer === 'string'
      ? result.revisedAnswer
      : result.revisedAnswer.text;
  }, [result.revisedAnswer]);

  const exemplarBand = useMemo(() => {
    if (typeof result.revisedAnswer === 'object' && result.revisedAnswer.band) {
      return result.revisedAnswer.band;
    }
    return Math.min(6, result.overallBand + 1);
  }, [result.revisedAnswer, result.overallBand]);

  const exemplarConfig = getBandConfig(exemplarBand);

  // Calculations for metrics
  const wordCount = useMemo(
    () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
    [userAnswer]
  );
  const { keywordsUsedCount } = useMemo(() => {
    const used = (prompt.keywords || []).filter((kw) => {
      const variants = getKeywordVariants(kw);
      return variants.some((v) =>
        new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(userAnswer.toLowerCase())
      );
    });
    return { keywordsUsedCount: used.length };
  }, [userAnswer, prompt.keywords]);

  return (
    <div ref={reportRef} className="flex flex-col gap-8 max-w-5xl mx-auto pb-20 EvaluationDisplay">
      {isImproving && (
        <div className="absolute inset-0 bg-white/80 dark:bg-[#0a0f1a]/80 backdrop-blur-md flex items-center justify-center z-50 rounded-[32px] h-full transition-all duration-500 no-print">
          <div className="w-full max-w-md transform scale-100 animate-in fade-in zoom-in duration-300">
            <LoadingIndicator
              messages={[
                'Synthesising higher-order concepts...',
                'Refining syllabus terminology...',
                'Restructuring for Band ' + exemplarBand + '...',
              ]}
              duration={12}
              band={exemplarBand}
            />
          </div>
        </div>
      )}

      {/* Hero Question Context */}
      <div className="pt-2 pb-6 px-2">
        <div className="flex items-center gap-3 mb-4 opacity-60">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{prompt.verb}</span>
          <div className="h-px w-8 bg-current"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            {prompt.totalMarks} Marks
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-serif font-medium text-slate-900 dark:text-white leading-tight">
          {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
        </h2>
      </div>

      {/* Score & Metrics Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Vibrant Placard */}
        <div
          className={`lg:col-span-7 relative rounded-[40px] overflow-hidden p-8 md:p-10 shadow-2xl transition-all duration-500 bg-gradient-to-br ${bandConfig.gradient}`}
        >
          <MeshOverlay opacity="opacity-[0.15]" />

          <div className="relative z-10 flex flex-col justify-between h-full gap-8 text-white">
            <div className="flex justify-between items-start">
              <div>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 mb-4 shadow-sm backdrop-blur-md bg-white/20`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Band {result.overallBand} Performance
                  </span>
                </div>
                <h1 className="text-7xl font-black tracking-tighter leading-none">
                  {result.overallMark}
                  <span className="text-4xl font-medium align-top opacity-60">
                    /{prompt.totalMarks}
                  </span>
                </h1>
                <p className="text-sm font-bold opacity-80 mt-2 tracking-wide uppercase">
                  Assessment Score
                </p>
              </div>
              <div
                className={`w-20 h-20 rounded-[24px] flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/20 shadow-xl no-print`}
              >
                {result.overallBand >= 5 ? (
                  <Trophy className="w-10 h-10 text-white" />
                ) : result.overallBand >= 3 ? (
                  <Target className="w-10 h-10 text-white" />
                ) : (
                  <AlertTriangle className="w-10 h-10 text-white" />
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 no-print">
              <button
                onClick={() => window.print()}
                className="px-5 py-3 rounded-2xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold shadow-sm transition-all hover:scale-105 border border-white/20 backdrop-blur-sm flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" /> Export PDF
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
          </div>
        </div>

        {/* Kanban Metrics */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex-1">
            <MetricCard
              label="Cognitive Tier"
              value={`Tier ${termInfo.tier}`}
              subtext={prompt.verb}
              icon={Sparkles}
              theme={bandConfig}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1">
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

      {/* Quick Coach Tip Banner */}
      {result.quickTip && (
        <div
          className={`
              mt-2 p-5 rounded-[24px] border-2 border-dashed
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
                className="flex gap-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                <span>{renderFormattedText(s, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-8 rounded-[32px] bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-500/20 shadow-sm">
          <h4 className="font-bold text-rose-700 dark:text-rose-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-6">
            <XCircle className="w-4 h-4" /> Areas for Growth
          </h4>
          <ul className="space-y-4">
            {result.improvements.map((im, i) => (
              <li
                key={i}
                className="flex gap-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                <span>{renderFormattedText(im, prompt.keywords)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Criteria Breakdown */}
      <section>
        <div className="flex items-center gap-3 mb-6 no-print">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
            Criteria Breakdown
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {result.criteria.map((criterion, idx) => (
            <CriteriaRow
              key={idx}
              criterion={criterion}
              maxMark={criterion.maxMark}
              mark={criterion.mark}
              feedback={criterion.feedback}
              bandConfig={bandConfig}
              prompt={prompt}
            />
          ))}
        </div>
      </section>

      {/* Improved Response (Exemplar) */}
      {revisedText && (
        <section
          className={`relative rounded-[40px] border-2 ${exemplarConfig.border} overflow-hidden shadow-2xl transition-all duration-500 group mt-8`}
        >
          <div
            className={`absolute inset-0 ${exemplarConfig.bg} opacity-[0.03] pointer-events-none no-print`}
          />
          <MeshOverlay />

          <div
            className={`px-10 py-6 bg-gradient-to-r ${exemplarConfig.gradient} flex flex-wrap justify-between items-center gap-6 relative z-10`}
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

            <div className="flex gap-3 no-print">
              {result.overallBand < 6 && (
                <button
                  onClick={onImproveAnswer}
                  disabled={isImproving}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[11px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-2 backdrop-blur-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isImproving ? 'animate-spin' : ''}`} />
                  {isImproving ? 'Regenerating...' : 'Regenerate'}
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

          <div className="p-10 bg-white dark:bg-[#0f1420] relative z-10">
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
