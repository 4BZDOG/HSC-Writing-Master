import React from 'react';
import { DotPoint } from '../../../types';
import { TreeNode } from './auditModel';
import { GapBadges } from './AuditPieces';
import { LEVEL_ICON_TINT } from '../../../utils/levelColors';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Hash,
  Layers,
  PieChart,
  Square,
  Target,
} from 'lucide-react';

/**
 * One row of the audit tree.
 *
 * Split out and memoised. The tree draws around 1,500 rows for the three
 * shipped courses, and every one of them used to be rebuilt whenever anything
 * in the studio changed — a keystroke in the search box, a single checkbox, a
 * batch task finishing. The props here are the node plus two booleans, and the
 * node's identity only changes when Immer actually replaces the entity behind
 * it, so ticking one row now re-renders that row rather than the library.
 *
 * The handlers take the id back rather than closing over it, so the parent can
 * hold them stable across renders — a callback rebuilt per row would defeat the
 * memo it is passed to.
 */
interface AuditTreeRowProps {
  node: TreeNode;
  level: number;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
}

const AuditTreeRowInner: React.FC<AuditTreeRowProps> = ({
  node,
  level,
  isSelected,
  isExpanded,
  hasChildren,
  onToggleSelect,
  onToggleExpand,
}) => {
  const coveragePct =
    node.stats.totalDotPoints > 0
      ? Math.round((node.stats.coveredDotPoints / node.stats.totalDotPoints) * 100)
      : 0;
  const coverageColor =
    coveragePct < 50 ? 'text-red-400' : coveragePct < 80 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div
      className={`flex items-center py-2.5 px-6 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-all group border-b border-white/5 light:border-slate-200 ${isSelected ? 'bg-indigo-500/5 light:bg-indigo-50' : ''}`}
      style={{ paddingLeft: `${level * 24 + 16}px` }}
    >
      <button
        onClick={() => onToggleSelect(node.id, !isSelected)}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} ${node.label}`}
        aria-pressed={isSelected}
        className={`mr-4 transition-all ${isSelected ? 'opacity-100 scale-110' : 'opacity-60 group-hover:opacity-100'}`}
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4 text-indigo-400" />
        ) : (
          <Square className="w-4 h-4 text-slate-500" />
        )}
      </button>
      <button
        onClick={() => onToggleExpand(node.id)}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
        aria-hidden={!hasChildren}
        tabIndex={hasChildren ? undefined : -1}
        className={`mr-2 p-1 text-slate-500 ${hasChildren ? 'visible' : 'invisible'}`}
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        {node.type === 'course' && <BookOpen className={`w-4 h-4 ${LEVEL_ICON_TINT.course}`} />}
        {node.type === 'topic' && <Layers className={`w-4 h-4 ${LEVEL_ICON_TINT.topic}`} />}
        {node.type === 'subTopic' && <Folder className={`w-4 h-4 ${LEVEL_ICON_TINT.subTopic}`} />}
        {node.type === 'dotPoint' &&
          ((node.dataRef as DotPoint).focusAreas?.length ? (
            <Target className={`w-4 h-4 ${LEVEL_ICON_TINT.dotPoint}`} />
          ) : (
            <Hash className="w-4 h-4 text-slate-600" />
          ))}
        {node.type === 'prompt' && <FileText className={`w-4 h-4 ${LEVEL_ICON_TINT.prompt}`} />}
        <span
          className={`text-sm truncate font-medium ${node.type === 'course' || node.type === 'topic' ? 'font-black text-white light:text-slate-900 tracking-tight' : 'text-slate-300 light:text-slate-700'}`}
        >
          {node.label}
        </span>
        <GapBadges node={node} />
      </div>
      {node.type !== 'prompt' && (
        <div
          title={`${node.stats.coveredDotPoints} of ${node.stats.totalDotPoints} dot points have at least one question`}
          className={`t-label hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-white/5 light:border-slate-200 ${coverageColor} bg-black/20 light:bg-slate-100`}
        >
          <PieChart className="w-3 h-3" /> {coveragePct}%
        </div>
      )}
      {node.type !== 'prompt' && (
        <div className="flex items-center gap-6 ml-4 text-[10px] font-bold text-slate-500 font-mono">
          <div className="w-12 text-right" title={`${node.stats.questions} questions`}>
            {node.stats.questions} Q
          </div>
          <div className="w-12 text-right" title={`${node.stats.samples} sample answers`}>
            {node.stats.samples} S
          </div>
        </div>
      )}
    </div>
  );
};

const AuditTreeRow = React.memo(AuditTreeRowInner);
AuditTreeRow.displayName = 'AuditTreeRow';

export default AuditTreeRow;
