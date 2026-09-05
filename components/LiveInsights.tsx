import React, { useId, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, Lightbulb, ChevronDown } from 'lucide-react';
import { InsightTone, WritingInsight } from '../utils/writingAnalysis';
import { PANEL_HEADER_CLOSED, PANEL_HEADER_OPEN, PANEL_SURFACE } from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';

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
  /** Folded by default, like every other panel under the writing area. The
   *  summary line carries the news while it is shut. */
  defaultCollapsed?: boolean;
}

/**
 * Live, actionable writing feedback, shown directly beneath the writing
 * surface. These are while-writing prompts, so they sit within a glance of the
 * caret rather than inside the metrics dashboard further down the page — a
 * student should never have to scroll to find out what to fix next.
 *
 * Collapsible, like every other panel around it (the reference rail's
 * accordions, the exemplars, the metrics strip). The summary line survives the
 * fold: with the panel shut a student still sees how many things are waiting
 * and whether any of them is a warning, so folding it away is a choice rather
 * than a blindfold.
 */
const LiveInsights: React.FC<LiveInsightsProps> = React.memo(
  ({ insights, defaultCollapsed = true }) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const panelId = useId();
    // No reset key: this panel is about the student's own draft, which follows
    // them rather than belonging to one question.
    const opened = useOpenedOnce(!isCollapsed);

    const summary = useMemo(() => {
      const toFix = insights.filter((i) => i.tone === 'warning').length;
      if (insights.length === 0) return '';
      if (toFix > 0) return `${toFix} to work on`;
      return `${insights.length} note${insights.length === 1 ? '' : 's'}`;
    }, [insights]);

    if (insights.length === 0) return null;

    return (
      <div className={`${PANEL_SURFACE} animate-fade-in`}>
        <button
          onClick={() => setIsCollapsed((c) => !c)}
          aria-expanded={!isCollapsed}
          aria-controls={panelId}
          className={`w-full py-3.5 px-5 flex items-center gap-4 text-left transition-all ${
            isCollapsed ? PANEL_HEADER_CLOSED : PANEL_HEADER_OPEN
          }`}
        >
          {/* Same icon-tile treatment as the reference rail's accordions and
              the exemplars panel — a bare icon here made this row visibly
              shorter than its neighbours, the "close but not quite aligned"
              a glance down the column used to catch. */}
          <div
            className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border transition-all duration-500 ${
              isCollapsed
                ? 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'
                : 'bg-amber-500 border-amber-400/40 text-white shadow-lg'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
          </div>
          {/* A span, not a heading: the row IS the disclosure control, and the
              rail's other panels label themselves the same way. */}
          <span className="text-left">
            <span
              className={`t-label block ${
                isCollapsed
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              Live Insights
            </span>
            <span className="t-label block text-slate-500 dark:text-slate-400 opacity-80">
              {summary}
            </span>
          </span>
          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
            <PanelReadChip show={opened && isCollapsed} />
            <ChevronDown
              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-500 ${
                isCollapsed ? '' : 'rotate-180 text-slate-900 dark:text-white'
              }`}
            />
          </div>
        </button>

        <div
          id={panelId}
          inert={isCollapsed}
          className={`grid transition-all duration-500 ease-in-out ${
            isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          }`}
        >
          <div className="overflow-hidden">
            <ul className="flex flex-col gap-2 px-4 pt-1 pb-4">
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
        </div>
      </div>
    );
  }
);

LiveInsights.displayName = 'LiveInsights';
export default LiveInsights;
