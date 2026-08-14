/**
 * The syllabus navigator's class vocabulary, in the same shape as
 * `utils/headerChrome.ts`, `utils/verbRibbonChrome.ts` and `utils/cardChrome.ts`.
 *
 * This file holds the navigator's own chrome. Everything tier-coloured stays
 * interpolated from `getTierScaleConfig(tier)` at the question-row call site:
 * baking six tiers into constants here would duplicate `utils/renderUtils.ts`,
 * which `tests/unit/bandColors.test.ts` pins and a dozen other surfaces share. So
 * a rendered `className` in this component is one of these constants plus a tier
 * config's strings, and the tier config is written in the older `light:` idiom on
 * purpose — it is not being migrated.
 *
 * Each constant records what it is painted ON, because that is the question
 * DesignSpec §2 asks of every colour and it is not answerable from the class
 * string alone.
 *
 * The values below are the ones the navigator has always worn, lifted out of the
 * JSX unchanged so that the redesign that follows is a diff of values in one
 * file rather than a diff of a 1500-line component. They are therefore still in
 * the OLD `light:` idiom; `tests/unit/navigatorChrome.test.tsx` sweeps for the
 * new one and names every constant still to be converted in an `exempt` set that
 * the tokenising step has to empty.
 */

import type { ComboboxColor } from '../components/Combobox';

/** Which rung of the ladder. The five names are the five levels of the syllabus
 *  tree — never a colour, so that no call site can read a hue as a claim. */
export type NavigatorLevel = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'question';

export interface NavigatorLevelChrome {
  /** The active step box's border. Painted on the page background. */
  activeBorder: string;
  /** The active step box's shadow tint. Painted on the page background. */
  activeShadow: string;
  /** The chosen step box's border, once the box has shrunk. */
  selectedBorder: string;
  /** The rail node's ring when this step is the current one. Painted on the
   *  page background, over the rail line. */
  node: string;
  /** The step header's icon tile. Painted on the step box. */
  icon: string;
  /** Which `Combobox` palette this level's pickers use. The second
   *  hand-maintained copy of this palette lives in `Combobox.colorStyles`;
   *  naming it here at least puts the two in one place. */
  combobox: ComboboxColor;
}

/**
 * The five levels' chrome, keyed by level rather than by colour.
 *
 * It used to be a `Record<string, any>` keyed by hue — `THEMES.blue`,
 * `THEMES.purple` — with a sixth `green` entry that nothing read. Two things
 * follow from keying it by level instead: `green` cannot survive, because there
 * is no level called green; and a call site now says which rung it is drawing
 * rather than which colour it wants.
 *
 * The hues themselves are decoration and not a claim. Course, Topic, Sub-Topic
 * and Dot Point are containers, not cognitive demand — `getBandConfig` encodes
 * demand and `tests/unit/bandColors.test.ts` pins it — so blue here does NOT
 * mean what blue means on a tier chip, even though tier 5 wears the same hue on
 * rows rendered inside the amber Question step.
 */
export const NAV_LEVELS: Record<NavigatorLevel, NavigatorLevelChrome> = {
  course: {
    activeBorder: 'border-blue-500/30 light:border-blue-600',
    activeShadow: 'shadow-blue-900/10',
    selectedBorder: 'border-blue-500/20',
    node: 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]',
    icon: 'bg-blue-500/10 text-blue-400 light:bg-blue-100 light:text-blue-700 border-blue-500/20',
    combobox: 'blue',
  },
  topic: {
    activeBorder: 'border-purple-500/30 light:border-purple-600',
    activeShadow: 'shadow-purple-900/10',
    selectedBorder: 'border-purple-500/20',
    node: 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]',
    icon: 'bg-purple-500/10 text-purple-400 light:bg-purple-100 light:text-purple-700 border-purple-500/20',
    combobox: 'purple',
  },
  subTopic: {
    activeBorder: 'border-teal-500/30 light:border-teal-600',
    activeShadow: 'shadow-teal-900/10',
    selectedBorder: 'border-teal-500/20',
    node: 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]',
    icon: 'bg-teal-500/10 text-teal-400 light:bg-teal-100 light:text-teal-700 border-teal-500/20',
    combobox: 'teal',
  },
  dotPoint: {
    activeBorder: 'border-pink-500/30 light:border-pink-600',
    activeShadow: 'shadow-pink-900/10',
    selectedBorder: 'border-pink-500/20',
    node: 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)]',
    icon: 'bg-pink-500/10 text-pink-400 light:bg-pink-100 light:text-pink-700 border-pink-500/20',
    combobox: 'pink',
  },
  question: {
    activeBorder: 'border-amber-500/30 light:border-amber-600',
    activeShadow: 'shadow-amber-900/10',
    selectedBorder: 'border-amber-500/20',
    node: 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    icon: 'bg-amber-500/10 text-amber-400 light:bg-amber-100 light:text-amber-700 border-amber-500/20',
    combobox: 'amber',
  },
};

/** The navigator's left gutter, which the rail line and the rail nodes are both
 *  positioned from. They do not currently agree: the nodes sit at a negative
 *  viewport coordinate below `md` and are clipped away by `index.css`'s
 *  `overflow-x: clip`. Change one, change all three. */
export const NAV_GUTTER = 'pl-4 md:pl-12';

/** The navigator's outermost box. Painted on the page background. */
export const NAV_ROOT = `flex flex-col ${NAV_GUTTER} relative animate-fade-in`;

/** The vertical rail behind the five nodes. Painted on the page background, and
 *  decorative — what it depicts is said in words by each step's own name. */
export const NAV_RAIL_LINE =
  'absolute left-[1.35rem] md:left-[2.35rem] top-0 bottom-0 w-px bg-white/5 light:bg-slate-400 z-0';

/** The slot each rail node sits in, hung off the left edge of a step box. */
export const NAV_NODE_SLOT =
  'absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center';

/** Every rail node, in all three states. Painted on the page background. */
export const NAV_NODE_BASE =
  'absolute -left-[0.95rem] top-1/2 -translate-y-1/2 rounded-full transition-all duration-500 z-10 flex items-center justify-center';

/** A step the reader has finished: an emerald tick, one semantic everywhere.
 *  The tick itself is `text-white` on `bg-emerald-500`, which measures 2.54:1
 *  against the 3:1 floor an icon has to clear. */
export const NAV_NODE_COMPLETE =
  'w-[1.15rem] h-[1.15rem] bg-emerald-500 border-2 border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.45)]';

/** The step the reader is standing on. Its ring is the level's hue and arrives
 *  from `NAV_LEVELS[level].node` at the call site. */
export const NAV_NODE_CURRENT = 'w-4 h-4 border-2 scale-125';

/** A step not yet reached: hollow, and dimmed by both opacity and scale. */
export const NAV_NODE_UPCOMING =
  'w-4 h-4 border-2 bg-[rgb(var(--color-bg-surface))] light:bg-slate-200 border-white/20 light:border-slate-400 scale-90 opacity-50';

/** One step's outer container, which carries its z-index and the gap to the
 *  step below. Painted on the page background. */
export const NAV_STEP_CONTAINER = 'relative transition-all duration-500 ease-in-out w-full';

/** The step box the reader is working in. Its border and shadow tint arrive
 *  from `NAV_LEVELS[level]` at the call site. Painted on the page background. */
export const NAV_STEP_BOX_ACTIVE =
  'relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 shadow-xl py-6 px-6 scale-[1.01] z-20';

/** A step already chosen, folded down to a single row. Its border arrives from
 *  `NAV_LEVELS[level].selectedBorder`. Painted on the page background. */
export const NAV_STEP_BOX_DONE =
  'relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface))]/60 light:bg-white border light:border-slate-300 light:shadow-sm py-3 px-4 z-10';

/** The icon tile beside that name. Its fill arrives from
 *  `NAV_LEVELS[level].icon`. Painted on the step box. */
export const NAV_STEP_HEADER_TILE = 'p-1.5 rounded-md';

/** "COURSE", "TOPIC", "QUESTION" — the step's own name, drawn while the level
 *  is unchosen. Painted on the step box. */
export const NAV_STEP_HEADER_LABEL =
  'text-xs font-black uppercase tracking-widest text-[rgb(var(--color-text-primary))] light:text-slate-900';

/** The small square buttons in each step's action cluster — rename, delete,
 *  import, generate. Their fill and text arrive from `NAV_ACTION_VARIANTS`.
 *  Painted on the step box. */
export const NAV_ACTION_BUTTON =
  'relative p-2 rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 border flex items-center gap-1.5';

/**
 * What each action button is for, in colour. Painted on the step box.
 *
 * `locked` and `special` are the only two that carry a visible label — "Import
 * Syllabus", "From Syllabus", "Add from Syllabus", "Generate" — so they are the
 * only two whose text has to clear the 4.5:1 floor rather than the 3:1 an icon
 * gets. `light:text-amber-600` on their amber wash measures 3.03:1 and is a
 * defect. `danger`'s `light:text-red-600` measures 4.23:1 and is icon-only, so
 * it clears its floor and must be left alone.
 */
export const NAV_ACTION_VARIANTS: Record<
  'default' | 'danger' | 'special' | 'primary' | 'vault' | 'locked',
  string
> = {
  locked: 'bg-amber-400/10 border-amber-400/40 text-amber-500 light:text-amber-600',
  danger: 'bg-red-500/10 border-red-500/20 text-red-400 light:text-red-600',
  special: 'bg-amber-500/10 border-amber-500/20 text-yellow-400 light:text-amber-600',
  primary: 'bg-gradient-to-r from-indigo-500 to-sky-500 border-transparent text-white shadow-md',
  vault:
    'bg-blue-600/10 light:bg-blue-50 border-blue-600/20 light:border-blue-300 text-blue-400 light:text-blue-700',
  default:
    'bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-white/5 light:border-slate-400 text-[rgb(var(--color-text-secondary))] light:text-slate-600',
};

/** The inline "new topic" editor that opens inside the Topic step. Painted on
 *  the step box. */
export const NAV_INLINE_PANEL =
  'mt-3 p-4 rounded-2xl bg-white/5 light:bg-slate-50 border border-purple-500/20 light:border-purple-200 animate-fade-in';

/** Its name field and its syllabus-text field. Painted on the inline panel; the
 *  field itself adds `font-medium` and the textarea adds `resize-y`. */
export const NAV_INLINE_INPUT =
  'w-full px-3 py-2 rounded-xl bg-white/10 light:bg-white border border-white/10 light:border-slate-200 text-sm text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-purple-500/40';

/** One chosen focus area, under the dot-point pickers. Painted on the step
 *  box. */
export const NAV_FOCUS_PILL =
  'flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 light:text-emerald-800 text-[10px] font-black uppercase border border-emerald-500/20';

/** The icon tile at the head of an option row in any of the pickers. Geometry
 *  only: its hue is the row's own and is interpolated at the call site, which is
 *  also where the one mismatch lives — the sub-topic rows are indigo while the
 *  sub-topic step is teal. Painted on the picker's dropdown surface. */
export const NAV_OPTION_TILE = 'p-1.5 rounded-md border flex-shrink-0';
