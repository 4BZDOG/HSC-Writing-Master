import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt } from '../types';
import { BAND_METRICS, getCommandTermInfo, TIER_GROUPS } from '../data/commandTerms';
import { escapeRegExp, getBandConfig, getKeywordVariants, BandConfig } from '../utils/renderUtils';
import {
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Target,
  Zap,
  BarChart3,
  Clock3,
  Type,
  Check,
  Sparkles,
} from 'lucide-react';

interface PillProps {
  label: string;
  active: boolean;
  theme?: BandConfig;
  onClick?: () => void;
  icon?: 'target' | 'zap';
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

const Pill: React.FC<PillProps> = React.memo(({ label, active, theme, onClick, icon }) => {
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
        <div
          className={`w-1 h-1 rounded-full ${icon === 'zap' ? 'bg-indigo-400' : 'bg-slate-300 dark:bg-slate-600'}`}
        />
      )}
      <span>{label}</span>
    </button>
  );
});

interface WritingMetricsDashboardProps {
  userAnswer: string;
  prompt: Prompt;
  onAddWord: (word: string) => void;
}

export const WritingMetricsDashboard: React.FC<WritingMetricsDashboardProps> = React.memo(
  ({ userAnswer, prompt, onAddWord }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
    const wordCount = useMemo(
      () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
      [userAnswer]
    );
    const recommendedTime = useMemo(
      () => Math.round(prompt.totalMarks * 1.5 * 60),
      [prompt.totalMarks]
    );
    const [remainingTime, setRemainingTime] = useState(recommendedTime);

    useEffect(() => {
      setRemainingTime(recommendedTime);
      setIsTimerActive(false);
    }, [recommendedTime]);
    useEffect(() => {
      if (isTimerActive && remainingTime > 0) {
        timerIntervalRef.current = setInterval(
          () => setRemainingTime((p) => Math.max(0, p - 1)),
          1000
        );
      }
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    }, [isTimerActive, remainingTime]);

    const progressInfo = useMemo(() => {
      const tierGroup = TIER_GROUPS.find((g) => g.tier === commandTermInfo.tier);
      const maxBand = tierGroup ? tierGroup.maxBand : 6;
      const targetMetric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
      const targetCount = Math.ceil(prompt.totalMarks * targetMetric.wordCountMultiplier.min);
      return {
        targetLabel: `Band ${maxBand}`,
        targetCount,
        percentage: Math.min(100, (wordCount / targetCount) * 100),
        currentBandColor: getBandConfig(maxBand),
      };
    }, [prompt.totalMarks, commandTermInfo.tier, wordCount]);

    const keywordStats = useMemo(() => {
      const keywords = prompt.keywords || [];
      const used = keywords.filter((kw) => {
        const variants = getKeywordVariants(kw);
        return variants.some((v) =>
          new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(userAnswer.toLowerCase())
        );
      });
      return {
        used,
        missed: keywords.filter((kw) => !used.includes(kw)),
        score: keywords.length ? Math.round((used.length / keywords.length) * 100) : 0,
      };
    }, [userAnswer, prompt.keywords]);

    const formatTime = (s: number) =>
      `${Math.floor(s / 60)
        .toString()
        .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
      <div className="rounded-[32px] border-2 border-slate-300 dark:border-white/20 bg-white dark:bg-black/40 overflow-hidden shadow-2xl transition-all duration-500">
        <div className="flex flex-col sm:flex-row items-stretch border-b-2 border-slate-300 dark:border-white/10">
          <div className="flex flex-1 items-center bg-slate-50 dark:bg-black/60">
            <StatBox
              label="Syllabus"
              value={`${keywordStats.score}%`}
              colorClass="text-emerald-600 dark:text-emerald-400"
              icon={Target}
            />
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
                remainingTime < 60 && isTimerActive
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
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90"
              >
                {isTimerActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setRemainingTime(recommendedTime)}
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <ChevronDown
                className={`w-5 h-5 transition-transform duration-500 ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Improved Smooth Expansion Container */}
        <div
          className={`grid transition-all duration-500 ease-in-out ${isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        >
          <div className="overflow-hidden">
            <div className="p-8 space-y-8 bg-white dark:bg-transparent">
              <div className="p-6 rounded-[28px] border-2 border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-black/30 shadow-inner">
                <div className="flex items-center justify-between mb-4 px-1">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                      Target Standard: {progressInfo.targetLabel}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 px-1">
                    <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                      Syllabus Terms
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {keywordStats.used.map((kw) => (
                      <Pill key={kw} label={kw} active={true} onClick={() => onAddWord(kw)} />
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
                    <Zap className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                      Logic Connectors
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {getCommandTermInfo(prompt.verb).structuralKeywords?.map((kw) => {
                      const isUsed = userAnswer.toLowerCase().includes(kw.toLowerCase());
                      return (
                        <Pill
                          key={kw}
                          label={kw}
                          active={isUsed}
                          theme={
                            isUsed ? getBandConfig(getCommandTermInfo(prompt.verb).tier) : undefined
                          }
                          onClick={() => onAddWord(kw)}
                          icon="zap"
                        />
                      );
                    })}
                  </div>
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
