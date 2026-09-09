import React from 'react';
import { DotPoint } from '../../../types';
import { FacultyGroup, TreeNode } from './auditModel';
import { BranchGapSummary, GapBadges } from './AuditPieces';
import { LEVEL_ICON_TINT } from '../../../utils/levelColors';
import {
  SUBJECT_AREA_FULL_NAME,
  SUBJECT_AREA_ICON,
  SUBJECT_AREA_ICON_TINT,
  SUBJECT_AREA_RULE,
} from '../../../utils/subjectAreas';
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Hash,
  Layers,
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
  onToggleSelect: (id: string, checked: boolean, extend: boolean) => void;
  onToggleExpand: (id: string) => void;
}

/** One indent step. The tree gained a sixth level when courses moved under
 *  their faculty, so the step came down from 24px to keep a question's text
 *  starting well left of centre. */
export const INDENT_STEP = 20;

/**
 * Faculty and course rows pin to the top of the tree while their own subtree
 * scrolls past.
 *
 * Expanded, the shipped library is around 1,500 rows: scroll into the middle of
 * one and the screen is a list of dot points and questions with nothing saying
 * which course, let alone which faculty, they belong to — and the answer is
 * hundreds of rows back up. Two levels pin, which is the two a reader loses
 * first; topics and sub-topics stay in the flow because four sticky bands would
 * be most of a short window.
 *
 * The offsets are why the heights below are fixed rather than derived from
 * padding: a course pins directly under the faculty band, so it has to know how
 * tall that band is. They are the heights those rows already had.
 */
const FACULTY_ROW_H = 'h-11'; // 44px
const BRANCH_ROW_H = 'h-9'; // 36px
const COURSE_STICKY_TOP = 'top-11'; // clears the faculty band exactly

/**
 * A pinned row scrolls over the rows behind it, so it needs a ground of its
 * own — the row's own fill is a translucent tint over the tree's background,
 * and left transparent the content underneath reads straight through it.
 */
const STICKY_GROUND = 'bg-[rgb(var(--color-bg-base))] light:bg-slate-50';

/**
 * Where the readouts start, measured from the row's left edge.
 *
 * Everything before this — the tick, the chevron, the level glyph and the name
 * — shares one bounded column, and the indent is spent out of it rather than
 * added to it, so the coverage bar and the Q/S figures land in the same place
 * on a faculty band and on a dot point five levels under it. Without the
 * subtraction each level pushed its own readouts one step further right and
 * the column zig-zagged down the page.
 */
const NAME_COLUMN_REM = 46;
const nameColumnCap = (level: number) => `calc(${NAME_COLUMN_REM}rem - ${level * INDENT_STEP}px)`;

const coverageTone = (pct: number) =>
  pct < 50 ? 'text-red-400' : pct < 80 ? 'text-amber-400' : 'text-emerald-400';

const coverageFill = (pct: number) =>
  pct < 50 ? 'bg-red-400' : pct < 80 ? 'bg-amber-400' : 'bg-emerald-400';

/**
 * How much of this branch of the syllabus carries a question, as a bar.
 *
 * This was a pill reading "100%" pinned to the right edge of a row that was
 * otherwise empty from the label across. A percentage in a pill is a number you
 * read one row at a time; a bar at a fixed width is a shape you read down a
 * column, which is the actual question being asked of this screen — which topic
 * is furthest behind. Fixed width, not stretched to fill: a bar whose length
 * depended on how long the label above it was would compare nothing.
 */
const CoverageMeter: React.FC<{ covered: number; total: number }> = ({ covered, total }) => {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return (
    <div
      className="hidden sm:flex items-center gap-2.5 shrink-0"
      title={`${covered} of ${total} dot points have at least one question`}
    >
      <div className="w-16 lg:w-28 h-1.5 rounded-full bg-white/10 light:bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${coverageFill(pct)}`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className={`font-mono text-[10px] tabular-nums w-9 text-right ${coverageTone(pct)}`}>
        {pct}%
      </span>
    </div>
  );
};

/**
 * The faculty band.
 *
 * A faculty is not a sixth syllabus level, so it does not take a sixth level
 * hue or another `Folder`-family glyph — it is the boundary a school's own
 * structure draws across the library, and it is drawn as one: the subject's
 * mark, its name in the section voice, and a rule beneath it in the faculty's
 * colour. `LEVEL_ICON_TINT`'s five levels, five hues stays intact underneath.
 */
const FacultyRow: React.FC<AuditTreeRowProps> = ({
  node,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}) => {
  const group = node.dataRef as FacultyGroup;
  const Icon = SUBJECT_AREA_ICON[group.area];
  const courseCount = group.courses.length;

  return (
    <div
      className={`relative flex items-center gap-3 ${FACULTY_ROW_H} pl-4 pr-6 border-b border-white/5 light:border-slate-200 transition-colors ${
        isSelected
          ? 'bg-indigo-500/10 light:bg-indigo-50'
          : 'bg-white/[0.02] light:bg-slate-100/70 hover:bg-white/[0.05] light:hover:bg-slate-100'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${SUBJECT_AREA_RULE[group.area]}`}
      />
      <button
        onClick={(e) => onToggleSelect(node.id, !isSelected, e.shiftKey)}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} the whole ${node.label} faculty`}
        aria-pressed={isSelected}
        className={`transition-all ${isSelected ? 'opacity-100 scale-110' : 'opacity-60 hover:opacity-100'}`}
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
        className="p-1 text-slate-500"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      <Icon className={`w-4 h-4 shrink-0 ${SUBJECT_AREA_ICON_TINT[group.area]}`} />
      <span
        className="t-section text-white light:text-slate-900 truncate"
        title={SUBJECT_AREA_FULL_NAME[group.area]}
      >
        {node.label}
      </span>
      <span className="t-label text-slate-500 whitespace-nowrap">
        {courseCount} course{courseCount === 1 ? '' : 's'}
      </span>
      <div className="flex-1 min-w-0 hidden lg:flex items-center justify-end pr-5">
        <BranchGapSummary stats={node.stats} />
      </div>
      <CoverageMeter covered={node.stats.coveredDotPoints} total={node.stats.totalDotPoints} />
      <div className="flex items-center gap-5 ml-4 text-[10px] font-bold text-slate-500 font-mono">
        <div className="w-12 text-right" title={`${node.stats.questions} questions`}>
          {node.stats.questions} Q
        </div>
        <div className="w-12 text-right" title={`${node.stats.samples} sample answers`}>
          {node.stats.samples} S
        </div>
      </div>
    </div>
  );
};

const BranchRow: React.FC<AuditTreeRowProps> = (props) => {
  const { node, level, isSelected, isExpanded, hasChildren, onToggleSelect, onToggleExpand } =
    props;

  return (
    <div
      className={`flex items-center ${BRANCH_ROW_H} pr-6 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-all group border-b border-white/5 light:border-slate-200 ${isSelected ? 'bg-indigo-500/5 light:bg-indigo-50' : ''}`}
      style={{ paddingLeft: `${level * INDENT_STEP + 16}px` }}
    >
      <button
        onClick={(e) => onToggleSelect(node.id, !isSelected, e.shiftKey)}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} ${node.label}`}
        aria-pressed={isSelected}
        className={`mr-3 transition-all ${isSelected ? 'opacity-100 scale-110' : 'opacity-60 group-hover:opacity-100'}`}
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
      <div
        className={`flex items-center gap-3 min-w-0 mr-4 ${node.type === 'prompt' ? 'flex-1' : ''}`}
        style={node.type === 'prompt' ? undefined : { maxWidth: nameColumnCap(level) }}
      >
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
          title={node.label}
          className={`text-sm truncate font-medium ${node.type === 'course' ? 'font-black text-white light:text-slate-900 tracking-tight' : node.type === 'topic' ? 'font-semibold text-white light:text-slate-900' : 'text-slate-300 light:text-slate-700'}`}
        >
          {node.label}
        </span>
        <GapBadges node={node} />
      </div>
      {node.type !== 'prompt' && (
        <div className="flex-1 min-w-0 hidden lg:flex items-center justify-end pr-5">
          <BranchGapSummary stats={node.stats} />
        </div>
      )}
      {node.type !== 'prompt' && (
        <CoverageMeter covered={node.stats.coveredDotPoints} total={node.stats.totalDotPoints} />
      )}
      {node.type !== 'prompt' && (
        <div className="flex items-center gap-5 ml-4 text-[10px] font-bold text-slate-500 font-mono">
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

/**
 * The row, plus the ground it pins to when it is one of the two levels that
 * pin. The wrapper is what carries `position: sticky`, not the row itself:
 * the row lives inside a `treeitem` that also holds its whole subtree, and
 * making THAT sticky would pin the branch rather than its heading.
 */
const AuditTreeRowInner: React.FC<AuditTreeRowProps> = (props) => {
  const row = props.node.type === 'faculty' ? <FacultyRow {...props} /> : <BranchRow {...props} />;

  if (props.node.type === 'faculty')
    return <div className={`sticky top-0 z-20 ${STICKY_GROUND}`}>{row}</div>;
  if (props.node.type === 'course')
    return <div className={`sticky ${COURSE_STICKY_TOP} z-10 ${STICKY_GROUND}`}>{row}</div>;
  return row;
};

const AuditTreeRow = React.memo(AuditTreeRowInner);
AuditTreeRow.displayName = 'AuditTreeRow';

export default AuditTreeRow;
