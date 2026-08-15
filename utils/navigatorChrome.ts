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
 * New code here is `dark:`-first: light is the base, `dark:` carries the
 * override (DesignSpec §2, "Which variant to write in new code"). The project's
 * own `light:` variant stays valid elsewhere and the tier config keeps it, so a
 * rendered `className` in this component legitimately contains both idioms —
 * but nothing in THIS file may, and `tests/unit/navigatorChrome.test.tsx` pins
 * that with a sweep that no longer exempts a single constant.
 *
 * Where a colour is genuinely the same in both themes — a brand gradient, the
 * emerald a white tick has to sit on — the pair is written out with the same
 * value on both sides rather than left bare. The sweep reads class strings, not
 * intent, and saying it out loud is what lets it read this file at all; it is
 * also the only form in which "this is deliberate" survives the next edit.
 */

import type { ComboboxColor } from '../components/Combobox';

/** Which rung of the ladder. The five names are the five levels of the syllabus
 *  tree — never a colour, so that no call site can read a hue as a claim. */
export type NavigatorLevel = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'question';

export interface NavigatorLevelChrome {
  /** The rail node's ring when this step is the current one. Painted on the
   *  page background, over the rail line. */
  node: string;
  /** The step header's icon tile. Painted on the step box. */
  icon: string;
  /** The 2px leading edge down the active step's left side. Painted on the step
   *  box; `NAV_STEP_EDGE` supplies the geometry and the gradient direction. */
  edge: string;
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
 * rows rendered inside the Question step.
 *
 * That collision is why each level now owns three small surfaces instead of a
 * whole box. A step used to be a hue-bordered, hue-shadowed panel, so the eye
 * read five walls of colour with a tier scale running down the inside of the
 * last one. What survives is a ring on the rail node, a 28px icon tile and a
 * 2px leading edge — enough to tell two adjacent steps apart at a glance, too
 * little to look like a claim about difficulty.
 */
export const NAV_LEVELS: Record<NavigatorLevel, NavigatorLevelChrome> = {
  course: {
    node: 'bg-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] dark:bg-[rgb(var(--color-bg-surface))] dark:border-blue-400',
    icon: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    edge: 'from-blue-500 to-blue-400 dark:from-blue-400 dark:to-blue-500',
    combobox: 'blue',
  },
  topic: {
    node: 'bg-white border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)] dark:bg-[rgb(var(--color-bg-surface))] dark:border-purple-400',
    icon: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
    edge: 'from-purple-500 to-purple-400 dark:from-purple-400 dark:to-purple-500',
    combobox: 'purple',
  },
  subTopic: {
    node: 'bg-white border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)] dark:bg-[rgb(var(--color-bg-surface))] dark:border-teal-400',
    icon: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
    edge: 'from-teal-500 to-teal-400 dark:from-teal-400 dark:to-teal-500',
    combobox: 'teal',
  },
  dotPoint: {
    node: 'bg-white border-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)] dark:bg-[rgb(var(--color-bg-surface))] dark:border-pink-400',
    icon: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20',
    edge: 'from-pink-500 to-pink-400 dark:from-pink-400 dark:to-pink-500',
    combobox: 'pink',
  },
  question: {
    node: 'bg-white border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)] dark:bg-[rgb(var(--color-bg-surface))] dark:border-amber-400',
    icon: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    edge: 'from-amber-500 to-amber-400 dark:from-amber-400 dark:to-amber-500',
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
  'absolute left-[1.35rem] md:left-[2.35rem] top-0 bottom-0 w-px bg-slate-400 dark:bg-white/5 z-0';

/** The slot each rail node sits in, hung off the left edge of a step box. */
export const NAV_NODE_SLOT =
  'absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center';

/** Every rail node, in all three states. Painted on the page background. */
export const NAV_NODE_BASE =
  'absolute -left-[0.95rem] top-1/2 -translate-y-1/2 rounded-full transition-all duration-500 z-10 flex items-center justify-center';

/**
 * A step the reader has finished: an emerald tick, one semantic everywhere.
 *
 * The fill is `emerald-600` in BOTH themes and is written as an explicit pair
 * for that reason. It is not decoration: the tick inside it is white, and white
 * on `emerald-500` measures 2.54:1 against the 3:1 floor a non-text glyph has to
 * clear. `emerald-600` takes it to 3.77:1, and there is no theme in which the
 * weaker green would be right. Only the ring around it lightens in the dark,
 * where a `-700` rim would disappear into the page.
 */
export const NAV_NODE_COMPLETE =
  'w-[1.15rem] h-[1.15rem] bg-emerald-600 border-2 border-emerald-700/50 ' +
  'shadow-[0_0_10px_rgba(5,150,105,0.45)] dark:bg-emerald-600 dark:border-emerald-400/60';

/** The step the reader is standing on. Its ring is the level's hue and arrives
 *  from `NAV_LEVELS[level].node` at the call site. */
export const NAV_NODE_CURRENT = 'w-4 h-4 border-2 scale-125';

/** A step not yet reached: hollow, and dimmed by scale more than by opacity.
 *
 *  `opacity-50` was doing most of the de-emphasis and taking the node's rim with
 *  it; the hollow fill and `scale-90` already say "not there yet", so the
 *  opacity only has to finish the sentence (the verb ribbon's D-E, same
 *  argument). Painted on the page background. */
export const NAV_NODE_UPCOMING =
  'w-4 h-4 border-2 scale-90 opacity-60 ' +
  'bg-slate-200 border-slate-400 dark:bg-[rgb(var(--color-bg-surface))] dark:border-white/20';

/** One step's outer container, which carries its z-index and the gap to the
 *  step below. Painted on the page background. */
export const NAV_STEP_CONTAINER = 'relative transition-all duration-500 ease-in-out w-full';

/**
 * The step box the reader is working in. Neutral glass, in both themes.
 *
 * It used to be a hue-bordered, hue-shadowed panel — `border-2 border-blue-500`
 * over `light:bg-white`, five of them stacked down the page — which put the
 * level's decorative colour on the largest surface in the component and left
 * nothing for the colours that mean something. The hue now lives on
 * `NAV_STEP_EDGE`, the rail node and the header tile; the box carries elevation
 * instead, which is what actually says "this is the one you are working in".
 *
 * `scale-[1.01]` went with it: under `index.css`'s `overflow-x: clip` it clipped
 * the box's own right edge by half a percent, and once the box has a shadow of
 * its own it was buying nothing. Painted on the page background.
 */
export const NAV_STEP_BOX_ACTIVE =
  'relative w-full rounded-2xl py-6 px-6 z-20 border transition-all duration-500 ease-out ' +
  'bg-white border-slate-300 shadow-xl shadow-slate-900/5 ' +
  'dark:bg-[rgb(var(--color-bg-surface))] dark:border-white/10 dark:shadow-lg dark:shadow-black/30';

/** A step already chosen, folded down to a single row. It keeps no hue at all —
 *  a finished step is not where the reader is looking, and the rail node beside
 *  it is already an emerald tick. Painted on the page background. */
export const NAV_STEP_BOX_DONE =
  'relative w-full rounded-2xl py-3 px-4 z-10 border transition-all duration-500 ease-out ' +
  'bg-white/70 border-slate-200 shadow-sm ' +
  'dark:bg-[rgb(var(--color-bg-surface))]/60 dark:border-white/5 dark:shadow-none';

/** Edge-lighting down the active step, and where the level hue went. The
 *  gradient itself arrives from `NAV_LEVELS[level].edge` at the call site.
 *  Rendered on the active step only — a chosen step is not a place, so it has
 *  nothing to mark. Painted on the step box. */
export const NAV_STEP_EDGE =
  'absolute inset-y-4 left-0 w-0.5 rounded-full pointer-events-none bg-gradient-to-b';

/** The icon tile beside that name. Its fill arrives from
 *  `NAV_LEVELS[level].icon`. Painted on the step box. */
export const NAV_STEP_HEADER_TILE = 'p-1.5 rounded-md';

/** "COURSE", "TOPIC", "QUESTION" — the step's own name, drawn while the level
 *  is unchosen. Painted on the step box. */
export const NAV_STEP_HEADER_LABEL =
  'text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white';

/** The small square buttons in each step's action cluster — rename, delete,
 *  import, generate. Their fill and text arrive from `NAV_ACTION_VARIANTS`.
 *  Painted on the step box. */
export const NAV_ACTION_BUTTON =
  'relative p-2 rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 border flex items-center gap-1.5';

/**
 * What each action button is for, in colour. Painted on the step box.
 *
 * The washes are one stop deeper in the light theme than the alpha the dark
 * theme wears, per DesignSpec §2's first parity rule: `bg-amber-400/10` over a
 * white step box is a two-percent difference and effectively is not there, so
 * these buttons had no fill at all in the light theme.
 *
 * `locked` and `special` are the only two that carry a visible label — "Import
 * Syllabus", "From Syllabus", "Add from Syllabus", "Generate" — so they are the
 * only two whose text has to clear the 4.5:1 floor rather than the 3:1 an icon
 * gets, and `amber-600` measured 2.86:1 on the amber-100 wash. `amber-700` is
 * 4.51:1, which passes by a hundredth and is not a margin; `amber-800` is
 * 6.37:1 and is what these wear. Both figures are the browser's, read off this
 * wash after it stopped being an invisible alpha.
 *
 * `danger` keeps `red-600`: it is icon-only, so its floor is 3:1 rather than
 * 4.5, and it clears it. Do not "fix" it into inconsistency.
 *
 * `primary` is the product's brand gradient, which is the same colour in both
 * themes (§2) and appears on four other surfaces; its pair is written out with
 * identical values rather than split.
 */
export const NAV_ACTION_VARIANTS: Record<
  'default' | 'danger' | 'special' | 'primary' | 'vault' | 'locked',
  string
> = {
  locked:
    'bg-amber-100 border-amber-300 text-amber-800 ' +
    'dark:bg-amber-400/10 dark:border-amber-400/40 dark:text-amber-500',
  danger:
    'bg-red-100 border-red-200 text-red-600 ' +
    'dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400',
  special:
    'bg-amber-100 border-amber-200 text-amber-800 ' +
    'dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-yellow-400',
  primary:
    'bg-gradient-to-r from-indigo-500 to-sky-500 border-transparent text-white shadow-md ' +
    'dark:from-indigo-500 dark:to-sky-500 dark:text-white',
  vault:
    'bg-blue-50 border-blue-300 text-blue-700 ' +
    'dark:bg-blue-600/10 dark:border-blue-600/20 dark:text-blue-400',
  default:
    'bg-white border-slate-400 text-slate-600 ' +
    'dark:bg-[rgb(var(--color-bg-surface-inset))] dark:border-white/5 dark:text-[rgb(var(--color-text-secondary))]',
};

/** The inline "new topic" editor that opens inside the Topic step. Painted on
 *  the step box. */
export const NAV_INLINE_PANEL =
  'mt-3 p-4 rounded-2xl bg-slate-50 border border-purple-200 dark:bg-white/5 dark:border-purple-500/20 animate-fade-in';

/** Its name field and its syllabus-text field. Painted on the inline panel; the
 *  field itself adds `font-medium` and the textarea adds `resize-y`. */
export const NAV_INLINE_INPUT =
  'w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 ' +
  'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-500 focus:ring-purple-500/40 ' +
  'dark:bg-white/10 dark:border-white/10 dark:text-[rgb(var(--color-text-primary))] ' +
  'dark:placeholder:text-[rgb(var(--color-text-muted))] dark:focus:ring-purple-400/40';

/** One chosen focus area, under the dot-point pickers. Painted on the step
 *  box. */
export const NAV_FOCUS_PILL =
  'flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ' +
  'bg-emerald-100 text-emerald-800 border-emerald-300 ' +
  'dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20';

/** The icon tile at the head of an option row in any of the pickers. Geometry
 *  only: its hue is the row's own and is interpolated at the call site, which is
 *  also where the one mismatch lives — the sub-topic rows are indigo while the
 *  sub-topic step is teal. Painted on the picker's dropdown surface. */
export const NAV_OPTION_TILE = 'p-1.5 rounded-md border flex-shrink-0';
