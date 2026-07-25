import React from 'react';
import { CheckCircle2, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { InsightTone, WritingInsight } from '../utils/writingAnalysis';

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

interface LiveInsightsProps {
  insights: WritingInsight[];
}

/**
 * Live, actionable writing feedback, shown directly beneath the writing
 * surface. These are while-writing prompts, so they sit within a glance of the
 * caret rather than inside the metrics dashboard further down the page — a
 * student should never have to scroll to find out what to fix next.
 */
const LiveInsights: React.FC<LiveInsightsProps> = React.memo(({ insights }) => {
  if (insights.length === 0) return null;

  return (
    <div className="clip-stable rounded-[24px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[rgb(var(--color-bg-surface))] shadow-sm overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
        <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-400" />
        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
          Live Insights
        </h4>
      </div>
      <ul className="flex flex-col gap-2 px-4 pb-4">
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
  );
});

LiveInsights.displayName = 'LiveInsights';
export default LiveInsights;
