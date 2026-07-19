import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt, WritingMode } from '../types';
import {
  BAND_METRICS,
  getCommandTermInfo,
  getBandForMark,
  getRecommendedTime,
  getExpectedTerms,
} from '../data/commandTerms';
import { getBandConfig, textContainsKeyword, BandConfig } from '../utils/renderUtils';
import { analyzeText, buildWritingInsights, InsightTone } from '../utils/writingAnalysis';
import {
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Target,
  BarChart3,
  Clock3,
  Type,
  Check,
  Sparkles,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Info,
  GraduationCap,
  AlignLeft,
} from 'lucide-react';

const TONE_STYLES: Record<
  InsightTone,
  { container: string; icon: string; Icon: React.ElementType }
> = {
  positive: {
    container:
      'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/20',
    icon: 'text-emerald-500 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  warning: {
    container: 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-500/20',
    icon: 'text-amber-500 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    container: 'bg-sky-50/60 dark:bg-sky-900/10 border-sky-200 dark:border-sky-500/20',
    icon: 'text-sky-500 dark:text-sky-400',
    Icon: Info,
  },
};

interface PillProps {
  label: string;
  active: boolean;
  theme?: BandConfig;
  onClick?: () => void;
}

const StatBox: React.FC<{
  label: string;
  value: string | number;
  colorClass: string;
  icon: React.ElementType;
}> = ({ label, value, colorClass, icon: Icon }) => (
  <div className="flex-1 flex flex-col items-center justify-center py-3 border-r-2 border-slate-200 dark:border-white/10 last:border-r-0 transition-colors">
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
    <span className={`text-xl font-black tabular-nums tracking-tight ${colorClass}`}>{value}</span>
  </div>
);

/** Compact structural stat (paragraphs / sentences / sentence length). */
const StructureTile: React.FC<{
  label: string;
  value: string | number;
  alert?: boolean;
  title?: string;
}> = ({ label, value, alert = false, title }) => (
  <div
    title={title}
    className={`rounded-2xl border p-3 text-center transition-colors duration-300 ${
      alert
        ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-900/10'
        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]'
    }`}
  >
    <span className="block text-lg font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
      {value}
    </span>
    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
      {label}
    </span>
  </div>
);

const Pill: React.FC<PillProps> = React.memo(({ label, active, theme, onClick }) => {
  const interactiveStyle = onClick
    ? 'cursor-pointer hover:scale-[1.02] active:scale-95'
    : 'cursor-default';

  const baseStyle = `inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-tight transition-all duration-300 border ${interactiveStyle}`;

  let colorStyle =
    'bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20';

  if (active && theme) {
    colorStyle = `${theme.bg} ${theme.text} ${theme.border} shadow-sm`;
  } else if (active) {
    colorStyle =
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-sm';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${baseStyle} ${colorStyle}`}
    >
      {active ? (
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      ) : (
        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      )}
      <span>{label}</span>
    </button>
  );
});

interface WritingMetricsDashboardProps {
  userAnswer: string;
  prompt: Prompt;
  onAddWord: (word: string) => void;
  writingMode?: WritingMode;
}

export const WritingMetricsDashboard: React.FC<WritingMetricsDashboardProps> = React.memo(
  ({ userAnswer, prompt, onAddWord, writingMode = 'coach' }) => {
    // Exam Mode: no live feedback — just the essentials (words + a running
    // countdown). The syllabus %, insights, term tracker and connectors are all
    // coaching aids and stay hidden.
    const isExamMode = writingMode === 'exam';
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
    const wordCount = useMemo(
      () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
      [userAnswer]
    );
    const charCount = useMemo(() => userAnswer.length, [userAnswer]);
    const recommendedTime = useMemo(
      () => getRecommendedTime(prompt.totalMarks, commandTermInfo),
      [prompt.totalMarks, commandTermInfo]
    );
    const expectedTerms = useMemo(
      () => getExpectedTerms(prompt.totalMarks, commandTermInfo),
      [prompt.totalMarks, commandTermInfo]
    );
    const [remainingTime, setRemainingTime] = useState(recommendedTime);

    // Reset the clock whenever the question or the mode changes. Keyed on the
    // prompt id (not just the recommended time) so switching between two
    // questions worth the same marks still restarts the countdown. In Exam
    // Mode the countdown auto-starts — you're "under exam conditions" the
    // moment you switch in; in Coach Mode it waits for Play.
    useEffect(() => {
      setRemainingTime(recommendedTime);
      setIsTimerActive(isExamMode);
    }, [prompt.id, recommendedTime, isExamMode]);
    useEffect(() => {
      if (!isTimerActive) return;
      timerIntervalRef.current = setInterval(() => {
        setRemainingTime((p) => {
          if (p <= 1) {
            setIsTimerActive(false);
            return 0;
          }
          return p - 1;
        });
      }, 1000);
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    }, [isTimerActive]);

    const progressInfo = useMemo(() => {
      // Single source of truth for the tier ceiling — same helper the marking
      // path and the marking-criteria panel use, so the live target band can't
      // drift from the band a student is actually awarded.
      const maxBand = getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier);
      const targetMetric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
      // Guard against a malformed/zero-mark prompt producing a 0 target,
      // which would turn the percentage into NaN and render "NaN%".
      const targetCount = Math.max(
        1,
        Math.ceil(prompt.totalMarks * targetMetric.wordCountMultiplier.min)
      );
      return {
        targetLabel: `Band ${maxBand}`,
        targetCount,
        percentage: Math.min(100, (wordCount / targetCount) * 100),
        currentBandColor: getBandConfig(maxBand),
      };
    }, [prompt.totalMarks, commandTermInfo.tier, wordCount]);

    const keywordStats = useMemo(() => {
      const keywords = prompt.keywords || [];
      // Shares the highlighter's matcher, so the coverage score always agrees
      // with what the student sees highlighted in the writing area.
      const used = keywords.filter((kw) => textContainsKeyword(userAnswer, kw));
      return {
        used,
        missed: keywords.filter((kw) => !used.includes(kw)),
        score: keywords.length ? Math.round((used.length / keywords.length) * 100) : 0,
      };
    }, [userAnswer, prompt.keywords]);

    // Structural anatomy of the draft — shared by the Structure panel and the
    // live insights, so both always describe the same text.
    const analysis = useMemo(() => analyzeText(userAnswer), [userAnswer]);

    // Live, prioritised, actionable writing feedback.
    const insights = useMemo(
      () =>
        buildWritingInsights({
          analysis,
          targetWordCount: progressInfo.targetCount,
          targetLabel: progressInfo.targetLabel,
          keywordsTotal: prompt.keywords?.length || 0,
          keywordsUsed: keywordStats.used.length,
          missingKeywords: keywordStats.missed,
          expectedTerms,
          tier: commandTermInfo.tier,
          charCount,
          charRange: commandTermInfo.charRange,
        }),
      [analysis, progressInfo, prompt.keywords, keywordStats, expectedTerms, commandTermInfo, charCount]
    );

    const formatTime = (s: number) =>
      `${Math.floor(s / 60)
        .toString()
        .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
      <div className="clip-stable rounded-[32px] border-2 border-slate-300 dark:border-white/20 bg-white dark:bg-black/40 overflow-hidden shadow-2xl transition-all duration-500">
        <div className="flex flex-col sm:flex-row items-stretch border-b-2 border-slate-300 dark:border-white/10">
          <div className="flex flex-1 items-center bg-slate-50 dark:bg-black/60">
            {isExamMode ? (
              <StatBox
                label="Mode"
                value="Exam"
                colorClass="text-red-500 dark:text-red-400"
                icon={GraduationCap}
              />
            ) : (
              <StatBox
                label="Syllabus"
                value={`${keywordStats.score}%`}
                colorClass="text-emerald-600 dark:text-emerald-400"
                icon={Target}
              />
            )}
            <StatBox
              label="Words"
              value={wordCount}
              colorClass="text-slate-900 dark:text-white"
              icon={Type}
            />
            <StatBox
              label="Timer"
              value={formatTime(remainingTime)}
              colorClass={
                remainingTime === 0
                  ? 'text-red-500'
                  : remainingTime < 60 && isTimerActive
                    ? 'text-red-500 animate-pulse'
                    : 'text-sky-600 dark:text-sky-400'
              }
              icon={Clock3}
            />
          </div>

          <div className="flex items-center gap-3 px-5 py-3 sm:py-0 border-t-2 sm:border-t-0 sm:border-l-2 border-slate-300 dark:border-white/10 bg-white dark:bg-black/40">
            <div className="flex gap-1.5 bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10">
              <button
                onClick={() => setIsTimerActive(!isTimerActive)}
                disabled={remainingTime === 0}
                aria-label={isTimerActive ? 'Pause timer' : 'Start timer'}
                title={isTimerActive ? 'Pause timer' : 'Start timer'}
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {isTimerActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  setIsTimerActive(false);
                  setRemainingTime(recommendedTime);
                }}
                aria-label="Reset timer"
                title="Reset timer"
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            {!isExamMode && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? 'Expand writing metrics' : 'Collapse writing metrics'}
                aria-expanded={!isCollapsed}
                title={isCollapsed ? 'Expand metrics' : 'Collapse metrics'}
                className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
              >
                <ChevronDown
                  className={`w-5 h-5 transition-transform duration-500 ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Improved Smooth Expansion Container — all live-feedback panels; hidden
            entirely under Exam conditions. */}
        <div
          className={`grid transition-all duration-500 ease-in-out ${isCollapsed || isExamMode ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        >
          <div className="overflow-hidden">
            <div className="p-4 sm:p-8 space-y-8 bg-white dark:bg-transparent">
              <div className="p-4 sm:p-6 rounded-[28px] border-2 border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-black/30 shadow-inner">
                <div className="flex items-center justify-between gap-4 mb-4 px-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest sm:tracking-[0.3em] text-slate-500 dark:text-slate-400 truncate">
                      Target Standard: {progressInfo.targetLabel}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    {Math.round(progressInfo.percentage)}% Capacity
                  </span>
                </div>
                <div className="h-2.5 bg-slate-200 dark:bg-black/40 rounded-full overflow-hidden border border-slate-300/50 dark:border-white/10">
                  <div
                    className={`h-full bg-gradient-to-r ${progressInfo.currentBandColor.gradient} transition-all duration-1000 ease-out`}
                    style={{ width: `${progressInfo.percentage}%` }}
                  />
                </div>
              </div>

              {insights.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-1">
                    <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                      Live Insights
                    </h4>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {insights.map((insight, i) => {
                      const tone = TONE_STYLES[insight.tone];
                      const ToneIcon = tone.Icon;
                      return (
                        <li
                          key={insight.id}
                          className={`flex items-start gap-3 p-3 rounded-2xl border animate-fade-in-up-sm ${tone.container}`}
                          style={{ animationDelay: `${Math.min(i, 4) * 50}ms` }}
                        >
                          <ToneIcon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.icon}`} />
                          <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                            {insight.message}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                        Syllabus Terms
                      </h4>
                    </div>
                    {(prompt.keywords?.length || 0) > 0 && (
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          keywordStats.missed.length === 0
                            ? `${progressInfo.currentBandColor.bg} ${progressInfo.currentBandColor.text} ${progressInfo.currentBandColor.border}`
                            : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                        }`}
                        title={`Terms detected (${expectedTerms}+ expected for this verb/marks)`}
                      >
                        {keywordStats.used.length}/{prompt.keywords?.length || 0}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {keywordStats.used.map((kw) => (
                      <Pill
                        key={kw}
                        label={kw}
                        active={true}
                        theme={progressInfo.currentBandColor}
                        onClick={() => onAddWord(kw)}
                      />
                    ))}
                    {keywordStats.missed.map((kw) => (
                      <Pill key={kw} label={kw} active={false} onClick={() => onAddWord(kw)} />
                    ))}
                    {prompt.keywords?.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic">No terms defined</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 px-1">
                    <AlignLeft className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                      Structure
                    </h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StructureTile
                      label="Paragraphs"
                      value={analysis.wordCount > 0 ? analysis.paragraphCount : '—'}
                    />
                    <StructureTile
                      label="Sentences"
                      value={analysis.wordCount > 0 ? analysis.sentenceCount : '—'}
                    />
                    <StructureTile
                      label="Avg Words"
                      value={analysis.wordCount > 0 ? analysis.avgWordsPerSentence : '—'}
                      alert={analysis.avgWordsPerSentence > 30}
                      title={
                        analysis.avgWordsPerSentence > 30
                          ? 'Sentences are running long — HSC markers reward clear, controlled sentences'
                          : 'Average words per sentence'
                      }
                    />
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 px-1">
                    {analysis.wordCount === 0
                      ? 'Structure updates live as you write.'
                      : analysis.longestSentenceWords > 45
                        ? `Longest sentence: ${analysis.longestSentenceWords} words — consider splitting it.`
                        : `Longest sentence: ${analysis.longestSentenceWords} words.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

WritingMetricsDashboard.displayName = 'WritingMetricsDashboard';
export default WritingMetricsDashboard;
