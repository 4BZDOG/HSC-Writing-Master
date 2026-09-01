import React from 'react';
import { DotPoint, Prompt } from '../../../types';
import MicroLabel from '../../MicroLabel';
import {
  TreeNode,
  isEmptyDotPoint,
  isFlagged,
  needsSamples,
  needsOutcomes,
  qualityOf,
} from './auditModel';

/**
 * The Content Audit Studio's small presentational pieces — the instrument
 * metric readout, the coloured bulk-action button, the filter chip, and the
 * per-row gap badges. Extracted from ContentAuditModal so the modal file holds
 * orchestration rather than also being the definition site for its chrome.
 */

export const InstrumentMetric = ({
  label,
  value,
  subValue,
  colorClass,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  colorClass: string;
}) => (
  <div className="flex flex-col gap-1 px-4 md:px-8 py-3 md:py-4 border-r border-white/5 light:border-slate-200 last:border-r-0">
    <MicroLabel
      size={9}
      tracking="0.3"
      className="text-white/50 light:text-slate-500 whitespace-nowrap"
    >
      {label}
    </MicroLabel>
    <div className="flex items-baseline gap-2">
      <span className={`text-4xl font-black tracking-tighter tabular-nums ${colorClass}`}>
        {value}
      </span>
      {subValue && (
        <span className="text-xs font-bold text-white/10 light:text-slate-300 uppercase tracking-widest">
          {subValue}
        </span>
      )}
    </div>
  </div>
);

const AUDIT_BTN_BASE =
  'px-4 h-11 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.12em] shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all disabled:opacity-25 disabled:grayscale disabled:shadow-none';

export const AuditActionButton = ({
  onClick,
  disabled,
  title,
  colourClass,
  label,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  colourClass: string;
  label: string;
  icon?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`${AUDIT_BTN_BASE} ${colourClass}${icon ? ' flex items-center gap-1.5' : ''}`}
  >
    {icon}
    {label}
  </button>
);

const FILTER_CHIP_BASE =
  'group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4';

export const FilterChip = ({
  active,
  activeStyle,
  idleStyle,
  label,
  count,
  title,
  onClick,
}: {
  active: boolean;
  activeStyle: string;
  idleStyle: string;
  label: string;
  count: number;
  title?: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`${FILTER_CHIP_BASE} ${active ? activeStyle : idleStyle}`}
  >
    <span>{label}</span>
    <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
      {count}
    </span>
  </button>
);

const GAP_BADGE_BASE =
  'px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-wider whitespace-nowrap';

/**
 * Inline data-quality flags on tree rows, colour-matched to the filter chips
 * above, so problem content is identifiable while browsing — not only after
 * toggling a filter.
 */
export const GapBadges: React.FC<{ node: TreeNode }> = ({ node }) => {
  const badges: { label: string; tone: string; title: string }[] = [];

  if (node.type === 'dotPoint') {
    const dp = node.dataRef as DotPoint;
    if (node.verbInfo) {
      const tierColour =
        node.verbInfo.tier >= 4
          ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
          : node.verbInfo.tier >= 3
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            : 'bg-slate-500/10 border-slate-500/30 text-slate-400';
      badges.push({
        label: `T${node.verbInfo.tier}`,
        tone: tierColour,
        title: `${node.verbInfo.term} — Bloom's tier ${node.verbInfo.tier}`,
      });
    }
    if (dp.focusAreas && dp.focusAreas.length > 0) {
      badges.push({
        label: `${dp.focusAreas.length} FA`,
        tone: 'bg-teal-500/10 border-teal-500/30 text-teal-400',
        title: `${dp.focusAreas.length} focus area${dp.focusAreas.length === 1 ? '' : 's'}: ${dp.focusAreas.slice(0, 3).join(', ')}${dp.focusAreas.length > 3 ? '…' : ''}`,
      });
    }
  }
  if (isEmptyDotPoint(node))
    badges.push({
      label: 'No Questions',
      tone: 'bg-red-500/10 border-red-500/30 text-red-400',
      title: 'This dot point has no questions yet',
    });
  if (isFlagged(node)) {
    const p = node.dataRef as Prompt;
    const reason =
      p.contentFlag?.status === 'open'
        ? p.contentFlag.reason
        : (p.sampleAnswers || []).find((sa) => sa.contentFlag?.status === 'open')?.contentFlag
            ?.reason;
    badges.push({
      label: 'Flagged',
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      title: reason ? `Flagged by a user: ${reason}` : 'Flagged by a user for review',
    });
  }
  if (node.type === 'prompt') {
    if (node.stats.missingMarkingCriteria > 0)
      badges.push({
        label: 'No Rubric',
        tone: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
        title: 'No marking guide',
      });
    else if (node.stats.rubricNotDescending > 0)
      badges.push({
        label: 'Rubric ⚠',
        tone: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        title: 'Non-standard rubric format (marks not in descending bands)',
      });
    if (needsSamples(node))
      badges.push({
        label: 'No Samples',
        tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        title: 'No sample answers',
      });
    if (needsOutcomes(node))
      badges.push({
        label: 'No Outcomes',
        tone: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
        title: 'No syllabus outcomes linked',
      });
    const q = qualityOf(node);
    if (q !== null)
      badges.push({
        label: `AI ${q}`,
        tone:
          q >= 75
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : q >= 50
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        title:
          (node.dataRef as Prompt).qualityNotes ||
          'AI quality pre-screen score (advisory — review the content itself)',
      });
  }

  if (badges.length === 0) return null;
  return (
    <span className="hidden md:flex items-center gap-1.5 shrink-0">
      {badges.map((b) => (
        <span key={b.label} title={b.title} className={`${GAP_BADGE_BASE} ${b.tone}`}>
          {b.label}
        </span>
      ))}
    </span>
  );
};
