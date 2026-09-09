import React from 'react';
import { DotPoint, Prompt } from '../../../types';
import MicroLabel from '../../MicroLabel';
import {
  AuditTone,
  TreeNode,
  isFlagged,
  matchesFilter,
  offSyllabusTermCount,
  qualityOf,
  syllabusTermGaps,
} from './auditModel';

/**
 * The Content Audit Studio's small presentational pieces — the instrument
 * metric readout, the coloured bulk-action button, the filter chip, and the
 * per-row gap badges. Extracted from ContentAuditModal so the modal file holds
 * orchestration rather than also being the definition site for its chrome.
 */

/**
 * One colour decision per gap, used by both the filter chip and the row badge
 * that means the same thing. The two used to be written out separately at each
 * site and were described in a comment as "colour-matched to the filter chips
 * above" — a promise nothing held. Here the chip and the badge read the same
 * row, so they cannot drift apart.
 */
export const AUDIT_TONE: Record<
  AuditTone,
  { chipActive: string; chipIdle: string; badge: string; action: string; dot: string }
> = {
  red: {
    chipActive:
      'bg-red-500/20 border-red-500/40 text-red-400 light:bg-red-100 light:border-red-300 light:text-red-800 shadow-lg',
    chipIdle:
      'bg-red-500/5 border-red-500/10 text-red-400 hover:bg-red-500/10 light:bg-red-50 light:border-red-200 light:text-red-700 light:hover:bg-red-100',
    badge:
      'bg-red-500/10 border-red-500/30 text-red-400 light:bg-red-50 light:border-red-300 light:text-red-700',
    action:
      'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20 hover:text-red-200 light:bg-red-50 light:border-red-300 light:text-red-700 light:hover:bg-red-100',
    dot: 'bg-red-400 light:bg-red-600',
  },
  indigo: {
    chipActive:
      'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 light:bg-indigo-100 light:border-indigo-300 light:text-indigo-800 shadow-lg',
    chipIdle:
      'bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10 light:bg-indigo-50 light:border-indigo-200 light:text-indigo-700 light:hover:bg-indigo-100',
    badge:
      'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 light:bg-indigo-50 light:border-indigo-300 light:text-indigo-700',
    action:
      'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 light:bg-indigo-50 light:border-indigo-300 light:text-indigo-700 light:hover:bg-indigo-100',
    dot: 'bg-indigo-400 light:bg-indigo-600',
  },
  amber: {
    chipActive:
      'bg-amber-500/20 border-amber-500/40 text-amber-400 light:bg-amber-100 light:border-amber-300 light:text-amber-800 shadow-lg',
    chipIdle:
      'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10 light:bg-amber-50 light:border-amber-200 light:text-amber-700 light:hover:bg-amber-100',
    badge:
      'bg-amber-500/10 border-amber-500/30 text-amber-400 light:bg-amber-50 light:border-amber-300 light:text-amber-700',
    action:
      'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 light:bg-amber-50 light:border-amber-300 light:text-amber-700 light:hover:bg-amber-100',
    dot: 'bg-amber-400 light:bg-amber-600',
  },
  pink: {
    chipActive:
      'bg-pink-500/20 border-pink-500/40 text-pink-400 light:bg-pink-100 light:border-pink-300 light:text-pink-800 shadow-lg',
    chipIdle:
      'bg-pink-500/5 border-pink-500/10 text-pink-400 hover:bg-pink-500/10 light:bg-pink-50 light:border-pink-200 light:text-pink-700 light:hover:bg-pink-100',
    badge:
      'bg-pink-500/10 border-pink-500/30 text-pink-400 light:bg-pink-50 light:border-pink-300 light:text-pink-700',
    action:
      'bg-pink-500/10 border-pink-500/30 text-pink-300 hover:bg-pink-500/20 hover:text-pink-200 light:bg-pink-50 light:border-pink-300 light:text-pink-700 light:hover:bg-pink-100',
    dot: 'bg-pink-400 light:bg-pink-600',
  },
  orange: {
    chipActive:
      'bg-orange-500/20 border-orange-500/40 text-orange-400 light:bg-orange-100 light:border-orange-300 light:text-orange-800 shadow-lg',
    chipIdle:
      'bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10 light:bg-orange-50 light:border-orange-200 light:text-orange-700 light:hover:bg-orange-100',
    badge:
      'bg-orange-500/10 border-orange-500/30 text-orange-400 light:bg-orange-50 light:border-orange-300 light:text-orange-700',
    action:
      'bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20 hover:text-orange-200 light:bg-orange-50 light:border-orange-300 light:text-orange-700 light:hover:bg-orange-100',
    dot: 'bg-orange-400 light:bg-orange-600',
  },
  rose: {
    chipActive:
      'bg-rose-500/20 border-rose-500/40 text-rose-400 light:bg-rose-100 light:border-rose-300 light:text-rose-800 shadow-lg',
    chipIdle:
      'bg-rose-500/5 border-rose-500/10 text-rose-400 hover:bg-rose-500/10 light:bg-rose-50 light:border-rose-200 light:text-rose-700 light:hover:bg-rose-100',
    badge:
      'bg-rose-500/10 border-rose-500/30 text-rose-400 light:bg-rose-50 light:border-rose-300 light:text-rose-700',
    action:
      'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 light:bg-rose-50 light:border-rose-300 light:text-rose-700 light:hover:bg-rose-100',
    dot: 'bg-rose-400 light:bg-rose-600',
  },
  fuchsia: {
    chipActive:
      'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400 light:bg-fuchsia-100 light:border-fuchsia-300 light:text-fuchsia-800 shadow-lg',
    chipIdle:
      'bg-fuchsia-500/5 border-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/10 light:bg-fuchsia-50 light:border-fuchsia-200 light:text-fuchsia-700 light:hover:bg-fuchsia-100',
    badge:
      'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400 light:bg-fuchsia-50 light:border-fuchsia-300 light:text-fuchsia-700',
    action:
      'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/20 hover:text-fuchsia-200 light:bg-fuchsia-50 light:border-fuchsia-300 light:text-fuchsia-700 light:hover:bg-fuchsia-100',
    dot: 'bg-fuchsia-400 light:bg-fuchsia-600',
  },
  violet: {
    chipActive:
      'bg-violet-500/20 border-violet-500/40 text-violet-400 light:bg-violet-100 light:border-violet-300 light:text-violet-800 shadow-lg',
    chipIdle:
      'bg-violet-500/5 border-violet-500/10 text-violet-400 hover:bg-violet-500/10 light:bg-violet-50 light:border-violet-200 light:text-violet-700 light:hover:bg-violet-100',
    badge:
      'bg-violet-500/10 border-violet-500/30 text-violet-400 light:bg-violet-50 light:border-violet-300 light:text-violet-700',
    action:
      'bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 light:bg-violet-50 light:border-violet-300 light:text-violet-700 light:hover:bg-violet-100',
    dot: 'bg-violet-400 light:bg-violet-600',
  },
  sky: {
    chipActive:
      'bg-sky-500/20 border-sky-500/40 text-sky-400 light:bg-sky-100 light:border-sky-300 light:text-sky-800 shadow-lg',
    chipIdle:
      'bg-sky-500/5 border-sky-500/10 text-sky-400 hover:bg-sky-500/10 light:bg-sky-50 light:border-sky-200 light:text-sky-700 light:hover:bg-sky-100',
    badge:
      'bg-sky-500/10 border-sky-500/30 text-sky-400 light:bg-sky-50 light:border-sky-300 light:text-sky-700',
    action:
      'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20 hover:text-sky-200 light:bg-sky-50 light:border-sky-300 light:text-sky-700 light:hover:bg-sky-100',
    dot: 'bg-sky-400 light:bg-sky-600',
  },
  lime: {
    chipActive:
      'bg-lime-500/20 border-lime-500/40 text-lime-400 light:bg-lime-100 light:border-lime-300 light:text-lime-800 shadow-lg',
    chipIdle:
      'bg-lime-500/5 border-lime-500/10 text-lime-400 hover:bg-lime-500/10 light:bg-lime-50 light:border-lime-200 light:text-lime-700 light:hover:bg-lime-100',
    badge:
      'bg-lime-500/10 border-lime-500/30 text-lime-400 light:bg-lime-50 light:border-lime-300 light:text-lime-700',
    action:
      'bg-lime-500/10 border-lime-500/30 text-lime-300 hover:bg-lime-500/20 hover:text-lime-200 light:bg-lime-50 light:border-lime-300 light:text-lime-700 light:hover:bg-lime-100',
    dot: 'bg-lime-400 light:bg-lime-600',
  },
  teal: {
    chipActive:
      'bg-teal-500/20 border-teal-500/40 text-teal-400 light:bg-teal-100 light:border-teal-300 light:text-teal-800 shadow-lg',
    chipIdle:
      'bg-teal-500/5 border-teal-500/10 text-teal-400 hover:bg-teal-500/10 light:bg-teal-50 light:border-teal-200 light:text-teal-700 light:hover:bg-teal-100',
    badge:
      'bg-teal-500/10 border-teal-500/30 text-teal-400 light:bg-teal-50 light:border-teal-300 light:text-teal-700',
    action:
      'bg-teal-500/10 border-teal-500/30 text-teal-300 hover:bg-teal-500/20 hover:text-teal-200 light:bg-teal-50 light:border-teal-300 light:text-teal-700 light:hover:bg-teal-100',
    dot: 'bg-teal-400 light:bg-teal-600',
  },
};

export const InstrumentMetric = ({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string | number;
  colorClass: string;
}) => (
  <div className="flex flex-col px-3 md:px-5 border-r border-white/5 light:border-slate-200 last:border-r-0">
    <MicroLabel className="text-white/50 light:text-slate-500 whitespace-nowrap">
      {label}
    </MicroLabel>
    <span className={`text-2xl font-black tracking-tighter tabular-nums ${colorClass}`}>
      {value}
    </span>
  </div>
);

const AUDIT_BTN_BASE =
  't-label px-3.5 h-10 rounded-xl border transition-all active:scale-[0.98] flex items-center gap-2 disabled:opacity-30 disabled:grayscale disabled:hover:bg-transparent';

/**
 * One batch action, carrying the colour of the gap it repairs.
 *
 * The seven of these used to be seven saturated fills — indigo, sky, amber,
 * pink, purple, teal, rose — chosen per button and matching nothing. Beside a
 * gradient "Fix All Gaps" and a red "Clear Questions" that made nine filled
 * buttons in a row with no hierarchy between them, and the colour was the one
 * thing on this screen that did not mean anything: the same gap was red on the
 * chip, red on the row badge, and indigo on the button that fixed it.
 *
 * They are quiet now, and they take their tone from `AUDIT_FILTERS`, so the
 * chip you filter by, the badge on the row and the button that repairs it are
 * one colour. The single filled button left on the row is `Fix All Gaps`,
 * which is the one that runs everything.
 */
export const AuditActionButton = ({
  onClick,
  disabled,
  title,
  tone,
  label,
  count,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  tone: AuditTone;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`${AUDIT_BTN_BASE} ${AUDIT_TONE[tone].action}`}
  >
    {icon}
    {`${label} (${count})`}
  </button>
);

/**
 * One filter as a row in the control rail.
 *
 * The rail used to be ten pills laid across the top of the studio, wrapping
 * onto two and three lines as the window narrowed and pushing the tree down
 * with them. Ten filters is a list, not a row of chips: as rows their counts
 * line up in one column, so "which gap does this library have most of" is a
 * glance down that column rather than a hunt across a wrapped rail. Below `md`
 * the same rows lie down into a line that scrolls sideways — one component
 * reflowed rather than two renderings of the same ten filters, which would put
 * two controls with one name into the accessibility tree.
 *
 * A row whose count is zero stays visible but disabled: the rail's job is to
 * say where the problems are, and a row that is present and reading 0 says
 * "nothing wrong here" — which is information — where hiding it would make the
 * rail's contents shift under the cursor between runs. Clicking one used to be
 * possible and only ever produced the "No items found" screen.
 */
export const FilterRow = ({
  active,
  tone,
  label,
  count,
  title,
  onClick,
}: {
  active: boolean;
  tone: AuditTone;
  label: string;
  count: number;
  title?: string;
  onClick: () => void;
}) => {
  const empty = count === 0 && !active;
  const palette = AUDIT_TONE[tone];
  return (
    <button
      onClick={onClick}
      disabled={empty}
      title={empty ? `${title ?? label} — none found` : title}
      aria-pressed={active}
      className={`t-label shrink-0 md:w-full flex items-center gap-2.5 pl-2.5 pr-3 h-9 rounded-lg border text-left whitespace-nowrap transition-colors ${
        empty
          ? 'border-transparent text-slate-600 light:text-slate-400 cursor-default'
          : active
            ? palette.badge
            : 'border-transparent text-slate-400 light:text-slate-600 hover:bg-white/5 light:hover:bg-slate-100'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${empty ? 'bg-slate-700 light:bg-slate-300' : palette.dot}`}
      />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className="tabular-nums shrink-0 opacity-80">{count}</span>
    </button>
  );
};

/**
 * What is missing under a branch, without expanding it.
 *
 * A course, topic or sub-topic row carried a name at the left and a coverage
 * figure at the right, with nothing between them — on a wide window that was
 * most of the row. It was also the row that could not answer the question this
 * screen exists for: coverage says how many dot points have A question, and
 * says nothing about the eighty questions underneath with no marking guide.
 * Finding that out meant expanding the branch, or toggling each filter in turn
 * and reading the tree back.
 *
 * So the space between the name and the coverage bar carries the branch's own
 * tally, one figure per gap, in the same colours as the rail and the row
 * badges. Only gaps that exist are shown, coarsest first, four at most —
 * beyond four this is a table and it belongs in the tree, not on one line.
 */
export const BranchGapSummary: React.FC<{ stats: TreeNode['stats'] }> = ({ stats }) => {
  const entries: { tone: AuditTone; count: number; label: string }[] = (
    [
      {
        tone: 'red',
        count: stats.totalDotPoints - stats.coveredDotPoints,
        label: 'dot points with no questions',
      },
      {
        tone: 'indigo',
        count: stats.missingMarkingCriteria,
        label: 'questions with no marking guide',
      },
      { tone: 'amber', count: stats.missingSamples, label: 'questions with no sample answer' },
      { tone: 'pink', count: stats.missingOutcomes, label: 'questions with no outcome linked' },
      { tone: 'orange', count: stats.rubricNotDescending, label: 'non-standard marking guides' },
      {
        tone: 'rose',
        count: stats.verbNotInQuestion,
        label: 'questions whose verb is not in their own text',
      },
    ] as { tone: AuditTone; count: number; label: string }[]
  ).filter((e) => e.count > 0);

  // Nothing at all when a branch is clean. The first draft said "No gaps"
  // there, which on a healthy library is the same two words repeated down
  // fifteen hundred rows; the absence of a tally, beside a coverage bar that
  // is already full, says it without saying it.
  if (entries.length === 0) return null;

  return (
    <span className="flex items-center gap-3">
      {entries.slice(0, 4).map((e) => (
        <span
          key={e.tone}
          title={`${e.count} ${e.label}`}
          className="flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${AUDIT_TONE[e.tone].dot}`}
          />
          <span className="font-mono text-[10px] tabular-nums text-slate-400 light:text-slate-600">
            {e.count}
          </span>
        </span>
      ))}
    </span>
  );
};

const GAP_BADGE_BASE = 't-label px-1.5 py-0.5 rounded-lg border whitespace-nowrap';

/**
 * Inline data-quality flags on tree rows, colour-matched to the filter chips
 * above, so problem content is identifiable while browsing — not only after
 * toggling a filter. Memoised on the node, whose identity only changes when
 * Immer actually replaces the entity behind it, so selecting or expanding a row
 * no longer re-derives every badge in the tree.
 */
const GapBadgesInner: React.FC<{ node: TreeNode }> = ({ node }) => {
  const badges: { label: string; tone: string; title: string }[] = [];

  if (node.type === 'dotPoint') {
    const dp = node.dataRef as DotPoint;
    if (node.verbInfo) {
      const tierColour =
        node.verbInfo.tier >= 4
          ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 light:bg-purple-50 light:border-purple-300 light:text-purple-700'
          : node.verbInfo.tier >= 3
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 light:bg-sky-50 light:border-sky-300 light:text-sky-700'
            : 'bg-slate-500/10 border-slate-500/30 text-slate-400 light:bg-slate-100 light:border-slate-300 light:text-slate-600';
      badges.push({
        label: `T${node.verbInfo.tier}`,
        tone: tierColour,
        title: `${node.verbInfo.term} — Bloom's tier ${node.verbInfo.tier}`,
      });
    }
    if (dp.focusAreas && dp.focusAreas.length > 0) {
      badges.push({
        label: `${dp.focusAreas.length} FA`,
        tone: AUDIT_TONE.teal.badge,
        title: `${dp.focusAreas.length} focus area${dp.focusAreas.length === 1 ? '' : 's'}: ${dp.focusAreas.slice(0, 3).join(', ')}${dp.focusAreas.length > 3 ? '…' : ''}`,
      });
    }
  }
  if (matchesFilter(node, 'emptyDotPoints'))
    badges.push({
      label: 'No Questions',
      tone: AUDIT_TONE.red.badge,
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
      tone: AUDIT_TONE.amber.badge,
      title: reason ? `Flagged by a user: ${reason}` : 'Flagged by a user for review',
    });
  }
  if (node.type === 'prompt') {
    // The badge, the chip and the button all say "marking guide" now; this row
    // used to say "No Rubric" while the chip above it said "No Marking Guide"
    // and the button below it said "Rubrics", for one thing.
    if (matchesFilter(node, 'missingRubrics'))
      badges.push({
        label: 'No Marking Guide',
        tone: AUDIT_TONE.indigo.badge,
        title: 'No marking guide',
      });
    else if (matchesFilter(node, 'rubricNotDescending'))
      badges.push({
        label: 'Guide Format',
        tone: AUDIT_TONE.orange.badge,
        title: 'Non-standard marking guide (marks not in descending bands)',
      });
    if (matchesFilter(node, 'verbNotInQuestion'))
      badges.push({
        label: 'Verb Not In Question',
        tone: AUDIT_TONE.rose.badge,
        title: `The recorded verb "${(node.dataRef as Prompt).verb}" appears nowhere in this question — it still sets the band ceiling`,
      });
    if (matchesFilter(node, 'missingSamples'))
      badges.push({
        label: 'No Samples',
        tone: AUDIT_TONE.amber.badge,
        title: 'No sample answers',
      });
    if (matchesFilter(node, 'missingOutcomes'))
      badges.push({
        label: 'No Outcomes',
        tone: AUDIT_TONE.pink.badge,
        title: 'No syllabus outcomes linked',
      });
    const termGaps = syllabusTermGaps(node);
    if (termGaps.length > 0)
      badges.push({
        label: 'Missing Terms',
        tone: AUDIT_TONE.lime.badge,
        title: `The dot point and this question are built on ${termGaps.length === 1 ? 'a term' : 'terms'} the Syllabus Terms list leaves out: ${termGaps.join(', ')}`,
      });
    if (matchesFilter(node, 'offSyllabusTerms')) {
      const stray = offSyllabusTermCount(node.dataRef as Prompt);
      badges.push({
        label: 'Off-Syllabus Terms',
        tone: AUDIT_TONE.sky.badge,
        title: `${stray} entr${stray === 1 ? 'y' : 'ies'} in this question's Syllabus Terms list ${stray === 1 ? 'is' : 'are'} not a syllabus term — the command verb, a generic word, a connective, an over-long phrase or a duplicate`,
      });
    }
    if (matchesFilter(node, 'exemplarMismatch'))
      badges.push({
        label: 'Exemplar Mismatch',
        tone: AUDIT_TONE.violet.badge,
        title: 'A sample answer is mechanically out of step with the band it claims — worth a read',
      });
    const q = qualityOf(node);
    if (q !== null)
      badges.push({
        label: `AI ${q}`,
        tone:
          q >= 75
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 light:bg-emerald-50 light:border-emerald-300 light:text-emerald-700'
            : q >= 50
              ? AUDIT_TONE.amber.badge
              : AUDIT_TONE.fuchsia.badge,
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

export const GapBadges = React.memo(GapBadgesInner);
GapBadges.displayName = 'GapBadges';
