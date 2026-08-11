/**
 * Refining a long question list — the second half of the volume strategy
 * (projectDocs/contentVolumeStrategy.md).
 *
 * Grouping by cognitive tier answers "which KIND of question is this" while the
 * list is being read. It does nothing for the reader who already knows the kind
 * they want: a student with fifteen minutes wants the short ones, a student
 * revising for Section III wants the extended ones, and neither wants to scroll
 * past the other's questions to find them. That is a filter, not an ordering.
 *
 * Two rules the rest of the strategy also lives by apply here:
 *
 *   - **Nothing is hidden that the reader did not hide.** A filter is only ever
 *     set by a person, starts at the widest possible range, and always states
 *     how many questions it is holding back. This is the opposite of a cap.
 *   - **The bounds come from the content.** A dot point whose questions are all
 *     4–6 marks gets a 4–6 slider, not a 1–20 one with dead space at both ends,
 *     and a dot point with a single tier gets no difficulty slider at all —
 *     there is nothing to choose between.
 *
 * Difficulty here means the COGNITIVE TIER of the command term, not the mark
 * value. A 6-mark "Describe" is longer than a 4-mark "Evaluate"; only the
 * second one demands judgement. The tier is what changes the writing, so it is
 * the axis the difficulty control moves along — with marks as its own separate
 * axis for the reader who is really choosing by how long they have.
 */
import { tierShortLabel } from '../data/commandTerms';

/** The filterable facets of one question, as the picker already derives them. */
export interface QuestionFacet {
  id: string;
  /** Cognitive tier of the command term, 1–6. */
  tier: number;
  marks: number;
  /** Provenance — a past HSC question is a different thing from a generated one. */
  isPastHsc?: boolean;
  /** Whether the reader has already answered this one (personal ordering). */
  attempted?: boolean;
}

/** An inclusive `[low, high]` pair. Both controls and bounds use this shape. */
export type Range = [number, number];

/**
 * What the questions under one dot point actually span. Every control is sized
 * from this, so a range that cannot vary is never given a slider.
 */
export interface QuestionBounds {
  tier: Range;
  marks: Range;
  hasPastHsc: boolean;
  /**
   * Whether any of these questions has been attempted. False in local mode and
   * for a reader with no history, where "not yet attempted" would filter on a
   * distinction that does not exist yet.
   */
  hasAttempts: boolean;
  total: number;
}

export interface QuestionFilter {
  tier: Range;
  marks: Range;
  /** Past-HSC questions only. Ignored when the dot point holds none. */
  pastHscOnly: boolean;
  /** Hide the questions the reader has already answered. */
  unattemptedOnly: boolean;
}

const EMPTY_BOUNDS: QuestionBounds = {
  tier: [1, 6],
  marks: [1, 1],
  hasPastHsc: false,
  hasAttempts: false,
  total: 0,
};

/** Clamp `v` into `[lo, hi]`, tolerating an inverted pair. */
const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, Math.min(lo, hi)), Math.max(lo, hi));

/** The span the supplied questions occupy on each axis. */
export const describeQuestions = (facets: QuestionFacet[]): QuestionBounds => {
  if (facets.length === 0) return { ...EMPTY_BOUNDS };

  let tierLow = Infinity;
  let tierHigh = -Infinity;
  let markLow = Infinity;
  let markHigh = -Infinity;
  let hasPastHsc = false;
  let hasAttempts = false;

  for (const f of facets) {
    const tier = clamp(Math.round(f.tier) || 1, 1, 6);
    // A question with no usable mark value still has to sit somewhere on the
    // axis, or it would drop out of a filter nobody set.
    const marks = Math.max(1, Math.round(f.marks) || 1);
    tierLow = Math.min(tierLow, tier);
    tierHigh = Math.max(tierHigh, tier);
    markLow = Math.min(markLow, marks);
    markHigh = Math.max(markHigh, marks);
    if (f.isPastHsc) hasPastHsc = true;
    if (f.attempted) hasAttempts = true;
  }

  return {
    tier: [tierLow, tierHigh],
    marks: [markLow, markHigh],
    hasPastHsc,
    hasAttempts,
    total: facets.length,
  };
};

/** The filter that hides nothing — where every dot point starts. */
export const widestFilter = (bounds: QuestionBounds): QuestionFilter => ({
  tier: [...bounds.tier] as Range,
  marks: [...bounds.marks] as Range,
  pastHscOnly: false,
  unattemptedOnly: false,
});

/**
 * Re-fit a filter to a different set of questions.
 *
 * Called when the content under the filter changes — a new dot point, or a
 * question generated into the current one. Ranges are clamped rather than
 * reset so a deliberate "extended responses only" survives a new question
 * arriving, and a toggle whose subject no longer exists is dropped rather than
 * left silently filtering against nothing.
 */
export const clampFilter = (filter: QuestionFilter, bounds: QuestionBounds): QuestionFilter => {
  const fit = (range: Range, within: Range): Range => {
    const lo = clamp(range[0], within[0], within[1]);
    const hi = clamp(range[1], within[0], within[1]);
    return lo <= hi ? [lo, hi] : [within[0], within[1]];
  };
  return {
    tier: fit(filter.tier, bounds.tier),
    marks: fit(filter.marks, bounds.marks),
    pastHscOnly: filter.pastHscOnly && bounds.hasPastHsc,
    unattemptedOnly: filter.unattemptedOnly && bounds.hasAttempts,
  };
};

/** True when the filter is holding anything back — i.e. worth announcing. */
export const isFilterActive = (filter: QuestionFilter, bounds: QuestionBounds): boolean =>
  filter.pastHscOnly ||
  filter.unattemptedOnly ||
  filter.tier[0] > bounds.tier[0] ||
  filter.tier[1] < bounds.tier[1] ||
  filter.marks[0] > bounds.marks[0] ||
  filter.marks[1] < bounds.marks[1];

export const matchesFilter = (facet: QuestionFacet, filter: QuestionFilter): boolean => {
  const tier = clamp(Math.round(facet.tier) || 1, 1, 6);
  const marks = Math.max(1, Math.round(facet.marks) || 1);
  if (tier < filter.tier[0] || tier > filter.tier[1]) return false;
  if (marks < filter.marks[0] || marks > filter.marks[1]) return false;
  if (filter.pastHscOnly && !facet.isPastHsc) return false;
  if (filter.unattemptedOnly && facet.attempted) return false;
  return true;
};

/**
 * Apply the filter, never dropping the question the user is currently on.
 *
 * A selected question that fell out of its own picker would leave the closed
 * control showing a placeholder while the workspace beside it displays the
 * question — the picker would be lying about what is on screen. Keeping it
 * costs one row and keeps the two honest with each other.
 */
export const applyQuestionFilter = <T extends QuestionFacet>(
  items: T[],
  filter: QuestionFilter,
  keepId?: string
): T[] => items.filter((item) => item.id === keepId || matchesFilter(item, filter));

/**
 * The active filter in words, one phrase per axis — for the collapsed state,
 * where the controls themselves are out of sight. A filter whose effects are
 * visible but whose cause is not is how a picker comes to look broken.
 */
export const summariseFilter = (filter: QuestionFilter, bounds: QuestionBounds): string[] => {
  const parts: string[] = [];

  const [tierLo, tierHi] = filter.tier;
  if (tierLo > bounds.tier[0] || tierHi < bounds.tier[1]) {
    parts.push(
      tierLo === tierHi
        ? tierShortLabel(tierLo)
        : `${tierShortLabel(tierLo)} → ${tierShortLabel(tierHi)}`
    );
  }

  const [markLo, markHi] = filter.marks;
  if (markLo > bounds.marks[0] || markHi < bounds.marks[1]) {
    parts.push(markLo === markHi ? `${markLo} marks` : `${markLo}–${markHi} marks`);
  }

  if (filter.pastHscOnly) parts.push('Past HSC only');
  if (filter.unattemptedOnly) parts.push('Not yet attempted');

  return parts;
};
