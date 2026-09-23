/**
 * Single source of truth for the curriculum-level colour palette.
 *
 * The five journey levels (course → topic → sub-topic → dot point → prompt)
 * each own one clearly separated hue: blue → purple → teal → pink → amber.
 * Completion is a SEPARATE semantic (an emerald tick on the rail), so a
 * level's hue never doubles as a status light — `COMPLETION_HUE` is kept out
 * of the per-level map on purpose.
 *
 * This canonical mapping is consumed by `components/PromptSelector.tsx` (the
 * journey navigator) and `components/admin/ContentAuditModal.tsx` (the content
 * tree icon tints), so both colour curriculum levels identically.
 *
 * Bundle-safety: every value below is a plain string literal. Do NOT derive a
 * class name from an imported constant at module scope, and do NOT build one
 * with a template literal — Tailwind can only see complete literal class names
 * when it scans this file, so anything computed would be purged from the CSS.
 */

/** The five levels of the syllabus path, outermost first. */
export type CurriculumLevel = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';

/** The canonical hue names — one per level, deliberately excluding emerald. */
export type LevelHue = 'blue' | 'purple' | 'teal' | 'pink' | 'amber';

/**
 * The canonical level → hue mapping. This is the definition every other
 * colour-by-level lookup derives from.
 */
export const LEVEL_HUE: Record<CurriculumLevel, LevelHue> = {
  course: 'blue',
  topic: 'purple',
  subTopic: 'teal',
  dotPoint: 'pink',
  prompt: 'amber',
};

/**
 * A single-class icon tint (`text-*-400`) per level, for a plain coloured
 * glyph such as a tree-node icon. Written out as full literals rather than
 * derived from `LEVEL_HUE` so Tailwind keeps every class in the bundle.
 */
export const LEVEL_ICON_TINT: Record<CurriculumLevel, string> = {
  course: 'text-blue-400',
  topic: 'text-purple-400',
  subTopic: 'text-teal-400',
  dotPoint: 'text-pink-400',
  prompt: 'text-amber-400',
};

/**
 * The small icon tile that stands for a level — on every option in the
 * navigator's pickers, and on each step's header. Tinted fill, glyph and edge,
 * both themes.
 *
 * These were written out by hand at each of six sites and had drifted: the
 * sub-topic's tile was indigo while its picker, its rail node and this file
 * all said teal. The tile is the ONE place a chosen level still carries its hue
 * now that the chosen row itself is neutral, so it has to be right.
 * Full literals, for the same Tailwind reason as above.
 */
export const LEVEL_TILE: Record<CurriculumLevel, string> = {
  course:
    'bg-blue-500/15 text-blue-400 border-blue-500/25 light:bg-blue-100 light:text-blue-700 light:border-blue-200',
  topic:
    'bg-purple-500/15 text-purple-400 border-purple-500/25 light:bg-purple-100 light:text-purple-700 light:border-purple-200',
  subTopic:
    'bg-teal-500/15 text-teal-400 border-teal-500/25 light:bg-teal-100 light:text-teal-700 light:border-teal-200',
  dotPoint:
    'bg-pink-500/15 text-pink-400 border-pink-500/25 light:bg-pink-100 light:text-pink-700 light:border-pink-200',
  prompt:
    'bg-amber-500/15 text-amber-400 border-amber-500/25 light:bg-amber-100 light:text-amber-700 light:border-amber-200',
};

/**
 * The completion status hue — deliberately NOT one of the level hues, so a
 * "done" tick can never be mistaken for a level's own colour.
 */
export const COMPLETION_HUE = 'emerald' as const;

/** The canonical hue name for a curriculum level. */
export const getLevelHue = (level: CurriculumLevel): LevelHue => LEVEL_HUE[level];

/** The single-class `text-*-400` icon tint for a curriculum level. */
export const getLevelIconTint = (level: CurriculumLevel): string => LEVEL_ICON_TINT[level];
