import React, { useMemo, useState, useEffect, useRef, useId } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS, getTierTargetBand, tierShortLabel } from '../data/commandTerms';
import { ChevronDown, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { tierIcon } from '../utils/verbTierIcon';
import {
  getBandHex,
  getBandInkRgb,
  getBandDeepInkRgb,
  getBandName,
  getBandRgb,
  getTierScaleConfig,
} from '../utils/renderUtils';
import StrategyBrief from './StrategyBrief';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import MeshOverlay from './MeshOverlay';
import { PANEL_ROW_MIN_H } from '../utils/panelStyles';
import {
  RIBBON_DRAWER,
  RIBBON_PAGER,
  RIBBON_PAGER_ARROW,
  RIBBON_PAGER_DOT,
  RIBBON_PAGER_MARK,
  RIBBON_PAGER_MARK_CENTRED,
  RIBBON_PAGER_MARK_IDLE,
  RIBBON_PAGER_MARK_SELECTED,
  RIBBON_INK_AURA,
  RIBBON_INK_AURA_LEAVING,
  RIBBON_INK_GLOW,
  RIBBON_INK_GLOW_LEAVING,
  RIBBON_INK_MESH_BOX,
  RIBBON_INK_CAPTION,
  RIBBON_INK_CEILING,
  RIBBON_INK_DEFINITION,
  RIBBON_INK_HERO,
  RIBBON_INK_SCALE_RAIL,
  RIBBON_INK_SCALE_SPAN,
  RIBBON_INK_SCOREBOARD,
  RIBBON_INK_STAIR,
  RIBBON_INK_STAIR_COLUMN,
  RIBBON_INK_STAIR_IGNITION,
  RIBBON_INK_STAIR_NUMERAL,
  RIBBON_INK_STAIR_STEP,
  RIBBON_INK_STAT_CELL,
  RIBBON_INK_STAT_LABEL,
  RIBBON_INK_STAT_VALUE,
  RIBBON_INK_STEP_LABEL,
  RIBBON_INK_STEP_LABEL_IDLE,
  RIBBON_INK_THRESHOLD_CHIP,
  RIBBON_INK_THRESHOLD_RULE,
  RIBBON_INK_TIER_CHIP,
  RIBBON_INK_VERB,
  RIBBON_INK_VERB_GLOW,
  RIBBON_INK_VERB_RULE,
  RIBBON_INK_VERB_STAGE,
  RIBBON_FRAME,
  RIBBON_HEADER_BAR,
  RIBBON_HEADER_CHEVRON_OPEN,
  RIBBON_HEADER_CHEVRON_SHUT,
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TILE_NEUTRAL,
  RIBBON_HEADER_TITLE,
  RIBBON_MINI_BAR_UNLIT,
  RIBBON_MINI_STAIR,
  RIBBON_PANEL,
  RIBBON_ROOT,
  RIBBON_SELECTED_CHIP,
  RIBBON_SELECTED_LABEL,
  RIBBON_STRIP,
  RIBBON_STRIP_FADE_END,
  RIBBON_STRIP_FADE_START,
  RIBBON_STRIP_FRAME,
  RIBBON_TIER_CARD,
  RIBBON_TIER_CARD_CURRENT,
  RIBBON_TIER_CARD_RECEDED,
  RIBBON_TIER_BAND,
  RIBBON_TIER_BAND_IDLE,
  RIBBON_TIER_BAND_SELECTED,
  RIBBON_TIER_CARD_IDLE,
  RIBBON_TIER_HALO,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_HEADER_IDLE,
  RIBBON_TIER_HEADER_SELECTED,
  RIBBON_TIER_HEADER_TITLE,
  RIBBON_TIER_ICON,
  RIBBON_TIER_ICON_IDLE,
  RIBBON_TIER_ICON_SELECTED,
  RIBBON_TIER_SLOT,
  RIBBON_TIER_SUBTITLE,
  RIBBON_TIER_SUBTITLE_CURRENT,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_VERB_CHIP,
  RIBBON_VERB_CHIP_IDLE,
  ribbonVerbSize,
} from '../utils/verbRibbonChrome';

interface CommandVerbHierarchyProps {
  currentVerb?: PromptVerb;
  /**
   * Whether the ribbon belongs open in the state it is being rendered in.
   *
   * The ribbon used to be unmounted the moment a question was chosen, because
   * it lived inside the expanded navigator and choosing a question folds that
   * away — so the reference that explains a question's command verb ceased to
   * exist at the exact moment there was a verb to explain. It now renders in
   * both states, and this prop is how the two differ: open beside the syllabus
   * dropdowns, where the reader is browsing and the page is a chooser; shut
   * beneath the breadcrumb, where the page is a writing surface and a
   * thousand pixels of reference unfolding above it would undo the fold.
   *
   * `true` by default, which is the browsing behaviour, unchanged.
   */
  defaultOpen?: boolean;
  /**
   * The current question's own band ceiling (`Prompt.bandCeiling`), when its
   * course sets one: a Standard English composition is Band 5 although COMPOSE
   * is a Tier 6 verb, and an Advanced 20-mark DISCUSS is Band 6. While the
   * ribbon shows that question's verb, its light, staircase and Band Cap follow
   * the question, so the ribbon, the Writing Prompt and the writing area are one
   * colour. The verb stays in its own tier's card, and a sentence says why the
   * cap differs. Choosing any other verb shows that verb's own cap.
   */
  currentBandCeiling?: number;
}

/**
 * The staircase's geometry, in one place, because the halves of the old bar's
 * used to disagree.
 *
 * The bar filled to `tier / 6` while the six dots were laid out by
 * `justify-between`, which puts each dot's centre wherever the six label texts
 * happen to leave it — and below `sm` five of those labels are not rendered at
 * all, so the dots MOVED depending on which tier was current. The fill and the
 * dots were never on the same scale, and one of them was not a scale.
 *
 * One geometry now: band `i` owns `[(i-1)/6, i/6]`, its step is centred on that
 * band, and the columns that are lit are therefore exactly the bands the verb's
 * ceiling lets through.
 */
const TIER_STEPS = [1, 2, 3, 4, 5, 6];

/** The tier the Deep Learning Threshold sits above: the 3/4 boundary is where
 *  `getTierTargetBand` stops returning 3, and where the Verb Gate's Band 3 cap
 *  stops being the ceiling. Written once, read by the rail and the rule. */
const DEEP_LEARNING_TIER = 3;

/** The chip's own words, so the cue can point at the marker on the staircase
 *  without a second hand-written copy of its label. */
const THRESHOLD_LABEL = 'Deep Learning Threshold';

/**
 * The two sides of the threshold, in the words a student is addressed in
 * everywhere else on this page.
 *
 * They replace the rail's two derived tier-span captions, which named tiers 1
 * and 3 on the left and 4 and 6 on the right. Those names were not wrong; they
 * were the third statement of the same thing on one screen. The staircase names
 * all six tiers from `tierShortLabel`, and the tier strip below names them again
 * on six card headers. What nothing said was the only thing the threshold is
 * FOR: that everything left of it can be answered by recalling and recounting,
 * and everything right of it cannot.
 *
 * Hand-written, which the rail's own history is a warning about — four literal
 * labels drifted out of step with the tier data twice. So they live here,
 * beside `DEEP_LEARNING_TIER` and the label of the gate they describe, rather
 * than inline in the JSX: these are not tier names and cannot drift from tier
 * data, but they can drift from the boundary, and the boundary is this
 * constant. Move the gate and the captions are the next line to read.
 */
const THRESHOLD_SIDE_BELOW = 'Show what you know';
const THRESHOLD_SIDE_ABOVE = 'Use what you know';

/**
 * The light the stage is lit with when no verb is chosen. A cool slate, so an
 * empty ribbon is the same object with its colour switched off rather than a
 * different one — and so it is nobody's tier: red would say "Band 1" to a
 * student who has chosen nothing.
 */
const NEUTRAL_RGB = '100 116 139';

/** The same neutral as TEXT on the light stage: slate-600, where the slate-500
 *  above is 4.5 on white and no more. */
const NEUTRAL_INK_RGB = '71 85 105';

/**
 * The stage's light, as two pools: one top left behind the verb, one low on the
 * right under the staircase. Built from `--band-rgb`, which the root sets, so it
 * is the question's own tier colour at two strengths — the palette handed to
 * CSS, not a copy of it.
 */
const AURA =
  'radial-gradient(56rem 26rem at 0% 0%, rgb(var(--band-rgb) / var(--aura-1)), transparent 72%), ' +
  'radial-gradient(38rem 22rem at 100% 44rem, rgb(var(--band-rgb) / var(--aura-2)), transparent 70%), ' +
  // A faint tint of the tier over the whole stage. Zero in the dark theme, where the
  // two pools above are the light; in the light theme they are pastels on a pale
  // sheet and need something under them to keep it from reading as washed out.
  'linear-gradient(rgb(var(--band-rgb) / var(--aura-wash)), rgb(var(--band-rgb) / var(--aura-wash)))';

/** A percentage with trailing zeros trimmed, so tier 6 clips by `0%` rather
 *  than by `0.000%`. */
const pct = (value: number): string => `${Number(value.toFixed(3))}%`;

/** The centre of band `tier` — where its step is centred, and so its column,
 *  its numeral and its label. */
const bandCentre = (tier: number): number => ((2 * tier - 1) / 12) * 100;

/** One band's share of the staircase. */
const BAND_WIDTH = 100 / 6;

/**
 * How tall a tier's column stands, as a fraction of the tallest.
 *
 * Tier 1 is 28% and tier 6 is 100%, in even steps. Not proportional to the tier
 * number: a column a sixth as tall as the top one is a sliver, and the first
 * rung has to be tall enough to read, to carry its numeral and to be hit with a
 * thumb.
 */
/** How long each column waits for the one to its left, when the staircase builds
 *  itself on opening — and how long after its own column starts the flare fires,
 *  which is when the rise is nearly done. Milliseconds, in one place, so the two
 *  cannot drift: move the stagger and the flare moves with it. */
const STAIR_STAGGER_MS = 60;
const STAIR_FLARE_AFTER_MS = 450;

/** How long the staircase waits to begin building once the ribbon is opened.
 *  The panel takes 420ms to unfold (`RIBBON_PANEL`) and the staircase sits in
 *  its top half, so starting the rise on the same frame meant the first columns
 *  were two-thirds up before the reader could see them, and the one orchestrated
 *  moment this surface has was spent behind the panel's own clip. It also put
 *  two animations on the same frames as a layout animation, which is exactly
 *  when a phone drops one. The delay is the stagger's offset, so the flare — set
 *  from the same two constants — keeps its place after its column. */
const STAIR_OPEN_OFFSET_MS = 160;

/** How long the outgoing light stays mounted while the new tier's fades in. A
 *  little over the animation (`fade-out` is 500ms) so it is never removed on a
 *  frame it is still visible, and the timer is only housekeeping: the layer ends
 *  at opacity 0 whether or not it is removed. */
const AURA_CROSSFADE_MS = 600;

const columnFraction = (tier: number): number =>
  Number((0.28 + (0.72 * (tier - 1)) / 5).toFixed(3));

/** Where the tier strip is: whether there is more of it to either side, and the index of
 *  the tier whose card sits nearest its middle. Read by the fades and the pager. */
type StripPosition = { atStart: boolean; atEnd: boolean; centred: number };

/** The strip's scroll position, kept inside what it can scroll. */
const clampScroll = (strip: HTMLElement, left: number): number =>
  Math.min(Math.max(0, left), Math.max(0, strip.scrollWidth - strip.clientWidth));

/** The position that puts `card` in the middle of the strip. One formula for every tier: the
 *  strip's padding lets the first and the last reach the middle too (`RIBBON_STRIP`). */
const centredLeft = (strip: HTMLElement, card: HTMLElement): number =>
  clampScroll(strip, card.offsetLeft - (strip.clientWidth - card.offsetWidth) / 2);

/** The position that puts the middle of the strip's content in the middle of the strip. */
const midpointLeft = (strip: HTMLElement): number =>
  clampScroll(strip, (strip.scrollWidth - strip.clientWidth) / 2);

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll the strip, and only the strip. jsdom and very old browsers have no `Element.scrollTo`;
 *  the property is what it sets anyway. A position within 2px of where the strip is is not moved
 *  to, so a settled strip is not told to move again. */
const settleStrip = (strip: HTMLElement, left: number, instant: boolean): void => {
  if (Math.abs(strip.scrollLeft - left) < 2) return;
  if (typeof strip.scrollTo === 'function') {
    // index.css sets `scroll-behavior: auto !important` under reduced motion, but that does not
    // govern the JS `behavior` option, so the reader who asked for no animation is asked here too.
    strip.scrollTo({ left, behavior: instant ? 'auto' : 'smooth' });
  } else {
    strip.scrollLeft = left;
  }
};

/** Read the strip's position. Nothing is written. */
const readStrip = (strip: HTMLElement, cells: (HTMLElement | null)[]): StripPosition => {
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const middle = strip.scrollLeft + strip.clientWidth / 2;
  let centred = 0;
  let nearest = Infinity;
  cells.forEach((cell, index) => {
    if (!cell) return;
    const distance = Math.abs(cell.offsetLeft + cell.offsetWidth / 2 - middle);
    if (distance < nearest) {
      nearest = distance;
      centred = index;
    }
  });
  return { atStart: strip.scrollLeft <= 1, atEnd: strip.scrollLeft >= max - 1, centred };
};

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({
  currentVerb,
  defaultOpen = true,
  currentBandCeiling,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeVerb, setActiveVerb] = useState<PromptVerb | undefined>(currentVerb);
  const panelId = useId();

  // Counts the times the ribbon has been OPENED, so the one-shots that make up
  // its reveal — the verb settling in, its rule, the ceiling, the staircase
  // building — are keyed on it and play when the reader can see them.
  //
  // They used to be keyed on the verb alone, which fires them when a question
  // loads. Beneath the breadcrumb the ribbon is shut at that moment (that is the
  // point of it being shut there), so every one of them finished unseen and the
  // reader opened a page that was already at rest. Closing does not count: a
  // reveal that replayed as the panel folded away would be a flash of content
  // fading in while it collapsed.
  const [revealKey, setRevealKey] = useState(defaultOpen ? 1 : 0);
  const wasOpen = useRef(defaultOpen);

  const tierRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The tier the strip was last scrolled to, and whether it was open then: the
  // auto-scroll below uses them to tell "the reader changed tier" from "the
  // reader tapped another chip on the card they are already looking at".
  const scrolled = useRef<{ tier: number | null; open: boolean; placed: boolean }>({
    tier: null,
    open: false,
    placed: false,
  });
  // The header buttons, for the arrow keys that move between tiers.
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Where the strip is, for the fades and the pager. Written by the scroll listener below, and
  // mirrored in a ref so a measurement only sets state when something has changed.
  const [stripPos, setStripPos] = useState<StripPosition>({
    atStart: true,
    atEnd: false,
    centred: 0,
  });
  const stripPosRef = useRef(stripPos);
  // A mouse drag on the strip: the press, once it has moved more than 6px, and whether the click
  // that follows its release is to be swallowed.
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startLeft: number;
    active: boolean;
  } | null>(null);
  const dropClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  // A new question re-opens the reference so its verb is explained — unless
  // the reader has folded the ribbon away, in which case it stays folded.
  // Before, a deliberate collapse was undone by the very next question, and
  // the only way to keep it shut was to re-collapse it every single time.
  const collapsedByUser = useRef(false);

  // `defaultOpen` is followed, not merely sampled at mount. The navigator folds
  // in an effect of its own AFTER the first paint, so a component that only read
  // this once would mount open — in the one state it has to be shut — and stay
  // that way. Following it also makes the fold read as a single gesture: the
  // navigator collapses to a breadcrumb and the reference collapses with it, and
  // pressing "Change" brings both back.
  //
  // The remembered collapse resets here, and only here: moving between browsing
  // and writing is itself a decision about how much reference belongs on the
  // page, so it outranks the last one made in the other state.
  useEffect(() => {
    collapsedByUser.current = false;
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (currentVerb) {
      setActiveVerb(currentVerb);
      // Only where the ribbon is meant to be open. Beneath the breadcrumb a new
      // question must not unfold it — that is the whole point of it being shut
      // there — but the selection still follows the question either way, so
      // opening it by hand shows the verb that is actually on screen.
      if (defaultOpen && !collapsedByUser.current) setIsOpen(true);
    }
  }, [currentVerb, defaultOpen]);

  useEffect(() => {
    if (isOpen && !wasOpen.current) setRevealKey((count) => count + 1);
    wasOpen.current = isOpen;
  }, [isOpen]);

  const toggleOpen = () =>
    setIsOpen((open) => {
      collapsedByUser.current = open;
      return !open;
    });

  const { sortedVerbsByGroup, activeTermInfo } = useMemo(() => {
    const allVerbs = Array.from(commandTerms.values());
    // `commandTerms.get` is exact-case only, and verbs reach the app from model
    // output and stored prompts in whatever case they were saved with — see the
    // note on getCommandTermInfo, which was written for this bug. A miss here
    // does not show the wrong verb, it shows no verb at all: no detail card, no
    // tier highlight, no progress bar.
    //
    // The case fix is taken; getCommandTermInfo's EXPLAIN fallback deliberately
    // is not. Everywhere else that fallback degrades something incidental — a
    // colour, a mark range. Here the content IS the claim "your verb is X, it
    // caps you at Band N, spend this long on it", and an unrecognised verb would
    // render that claim in full, confidently, about a verb nobody asked for.
    // Showing nothing is the honest answer, and it is a state this component
    // already draws.
    const verb = activeVerb ?? currentVerb;
    const current = verb
      ? (commandTerms.get(verb) ?? commandTerms.get(verb.toUpperCase() as PromptVerb) ?? null)
      : null;

    const groups = TIER_GROUPS.map((group) => ({
      ...group,
      verbs: allVerbs
        .filter((verb) => verb.tier === group.tier)
        .sort((a, b) => a.term.localeCompare(b.term)),
    }));

    return { sortedVerbsByGroup: groups, activeTermInfo: current };
  }, [activeVerb, currentVerb]);

  // Bring the selected tier into the middle of the strip.
  //
  // Done by scrolling the strip itself, never with `scrollIntoView`, which would also
  // scroll the page. The ribbon sits below the navigator, so picking a question used to
  // move the WINDOW down to it. Setting `scrollLeft` moves only the strip.
  //
  // Four cases are not a glide, because each one used to be one and each felt like the
  // strip fighting the reader:
  //  - the ribbon has only just opened, or this is the first position it has had. The
  //    strip is mid-unfold and behind the panel's clip, so a slide is invisible work
  //    competing with the open. It is put in place instantly.
  //  - the reader tapped another chip on the SAME tier. Their finger has just lifted from
  //    a card where they want it, and centring it under them is the strip moving for a
  //    reason they never gave. A change of tier is different: that is the reader moving,
  //    and the new tier is centred even when it was already in view.
  //  - no verb is chosen. The strip rests at its midpoint, so the tier 3 / tier 4 boundary
  //    is in the middle and the cards fill both sides. It is not re-centred on each change.
  //  - the strip is already where it would be sent (see `settleStrip`).
  useEffect(() => {
    const previous = scrolled.current;
    const reopened = isOpen && !previous.open;
    scrolled.current = { tier: previous.tier, open: isOpen, placed: previous.placed };
    if (!isOpen) return;
    const strip = scrollContainerRef.current;
    if (!strip) return;

    if (!activeTermInfo) {
      if (!previous.placed || reopened) {
        settleStrip(strip, midpointLeft(strip), true);
        scrolled.current = { ...scrolled.current, placed: true };
      }
      return;
    }

    const tier = activeTermInfo.tier;
    const card = tierRefs.current[tier - 1];
    if (!card) return;
    const sameTier = previous.tier === tier;
    scrolled.current = { tier, open: true, placed: true };
    if (sameTier && previous.open) return;

    const instant = prefersReducedMotion() || !previous.placed || reopened;
    settleStrip(strip, centredLeft(strip, card), instant);
  }, [activeTermInfo, isOpen]);

  // The strip's position, for the fades and the pager. One passive listener and one
  // ResizeObserver, both throttled to a frame, and both torn down with the strip. The
  // strip is always mounted (the drawer is there whether the ribbon is open or not), so
  // this runs once.
  useEffect(() => {
    const strip = scrollContainerRef.current;
    if (!strip) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = readStrip(strip, tierRefs.current);
      const current = stripPosRef.current;
      if (
        current.atStart === next.atStart &&
        current.atEnd === next.atEnd &&
        current.centred === next.centred
      ) {
        return;
      }
      stripPosRef.current = next;
      setStripPos(next);
    };
    const schedule = () => {
      if (frame) return;
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(measure);
      else measure();
    };
    strip.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(strip);
    measure();
    return () => {
      strip.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, []);

  // The centre padding is a share of the strip's width, so a resize (a window
  // drag, a rotated phone) leaves `scrollLeft` where it was and the selected
  // card somewhere else. Put it back in the middle, without a glide: the strip
  // did not move by anyone's hand. Width only, so a height change is not a cue.
  const activeTierRef = useRef<number | null>(null);
  activeTierRef.current = activeTermInfo?.tier ?? null;
  useEffect(() => {
    const strip = scrollContainerRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    let width = strip.clientWidth;
    const observer = new ResizeObserver(() => {
      if (strip.clientWidth === width) return;
      width = strip.clientWidth;
      const tier = activeTierRef.current;
      const card = tier ? tierRefs.current[tier - 1] : null;
      settleStrip(strip, card ? centredLeft(strip, card) : midpointLeft(strip), true);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  // The pager and the arrow keys browse: they centre a tier in the strip. They do not select.
  const centreTier = (index: number) => {
    const strip = scrollContainerRef.current;
    const card = tierRefs.current[index];
    if (!strip || !card) return;
    settleStrip(strip, centredLeft(strip, card), prefersReducedMotion());
  };

  // Mouse drag scrolls the strip. A press that stays within 6px is a click and reaches the
  // headers and chips untouched. Only a drag takes pointer capture, because capture taken on
  // the press would steal the click from the buttons. Touch and pen are not handled here: they
  // scroll natively.
  const onStripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dropClick.current = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: event.currentTarget.scrollLeft,
      active: false,
    };
  };
  const onStripPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) <= 6) return;
      drag.active = true;
      // jsdom has no pointer capture, so the call is guarded.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    }
    event.currentTarget.scrollLeft = drag.startLeft - dx;
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    // The click that follows a release belongs to the drag, not to whatever is under the pointer.
    dropClick.current = true;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  };
  const onStripClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dropClick.current) return;
    dropClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  // The tier headers are a row of controls, so the arrow keys move between them, as they do
  // between tabs. Focus only: selection still needs Enter or Space. The tier is centred too,
  // because the browser's own scroll-into-view only brings the header to the strip's edge.
  const onTierKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TIER_GROUPS.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    if (target < 0 || target > last || target === index) return;
    headerRefs.current[target]?.focus();
    centreTier(target);
  };

  // The tier the stage is lit to: the verb's own, or the question's ceiling
  // while the verb on show is the question's (see `currentBandCeiling`). The
  // verb's card and its Tier chip keep `activeTermInfo.tier`; everything that
  // states a band or carries the question's colour reads this.
  const showsQuestionVerb =
    !!activeTermInfo && !!currentVerb && activeTermInfo.term === currentVerb.toUpperCase();
  const courseCeiling =
    showsQuestionVerb && currentBandCeiling && currentBandCeiling !== activeTermInfo?.tier
      ? currentBandCeiling
      : undefined;
  const capTier = courseCeiling ?? activeTermInfo?.tier;

  // Colour the ribbon on the distinct tier-identity scale (Tier 1 red …
  // Tier 6 purple) so every level of the ladder reads as its own step — the
  // band-target mapping collapsed Tiers 5 and 6 into the same purple.
  const activeConfig = capTier ? getTierScaleConfig(capTier) : null;
  const activeTier = capTier;

  // The stage's one hue, handed to CSS once as a custom property: the aura, the
  // verb's glow and rule, the chip and the numbers all draw from it at the alpha
  // they need. `getBandRgb` derives from `BAND_HEX`, which is also what the
  // staircase's columns are painted from, so the light on the verb and the
  // column under it state one colour between them.
  const bandRgb = activeTier ? getBandRgb(activeTier) : NEUTRAL_RGB;
  // The tier's hue as text, for the light stage (`--band-text` in index.css).
  const bandInkRgb = activeTier ? getBandInkRgb(activeTier) : NEUTRAL_INK_RGB;
  // The deeper shade, for the current step's name, which sits on the stage tint.
  const bandDeepInkRgb = activeTier ? getBandDeepInkRgb(activeTier) : NEUTRAL_INK_RGB;

  // The light the stage has just left, kept mounted while it fades out under the
  // new one fading in. The aura is keyed on the tier so the new light is a fresh
  // element and replays its fade — but a re-keyed element takes the old one away
  // on the same frame, so every change of tier dipped the stage to bare black and
  // came back up. Two layers whose opacities sum to one do not dip.
  //
  // Derived during render rather than in an effect: an effect would commit one
  // frame with neither layer before the leaving one was mounted, which is the
  // flicker this exists to remove.
  const [aura, setAura] = useState<{ tier: number | undefined; leavingRgb: string | null }>({
    tier: activeTier,
    leavingRgb: null,
  });
  if (aura.tier !== activeTier) {
    setAura({
      tier: activeTier,
      leavingRgb: aura.tier ? getBandRgb(aura.tier) : NEUTRAL_RGB,
    });
  }
  useEffect(() => {
    if (!aura.leavingRgb) return;
    const id = window.setTimeout(
      () => setAura((current) => ({ ...current, leavingRgb: null })),
      AURA_CROSSFADE_MS
    );
    return () => window.clearTimeout(id);
  }, [aura.leavingRgb]);

  // The tier group behind the active verb — the source of every word in the
  // announcement below, so none of it is written out a second time here.
  const activeGroup = activeTermInfo
    ? sortedVerbsByGroup.find((group) => group.tier === activeTermInfo.tier)
    : undefined;

  // The tier is carried by the 32px tile while the ribbon is shut, and by the
  // lit stage once it is open. `solidText` rather than `text-white` because
  // tier 3's fill is yellow — that is the pairing `getBandConfig` returns a
  // `solidText` field for, and white on it is 1.9:1. The `border-white/20` sits
  // on a solid tier fill, so it reads the same in both themes; the neutral
  // branch is a white-alpha well on the stage's own ground.
  const headerTileClass = activeConfig
    ? `${activeConfig.solidBg} ${activeConfig.solidText} border-white/45`
    : RIBBON_HEADER_TILE_NEUTRAL;

  return (
    // The hero. A stage with a palette per theme — spotlit near-black in the dark
    // theme, a soft light sheet in the light one — with a tier-lit edge and a glow
    // beneath it, so the one object on the page that explains what a student's
    // verb costs them is also the one object that cannot be missed. The border
    // is inline because it is drawn from `--band-rgb`; with no verb chosen it is
    // not set and the stage keeps its neutral edge from `RIBBON_ROOT`, and there
    // is no glow.
    //
    // The glow is a sibling in a wrapper rather than a shadow on the stage:
    // see `RIBBON_INK_GLOW`.
    <div className={RIBBON_FRAME}>
      {aura.leavingRgb && (
        <div
          key="leaving-glow"
          className={RIBBON_INK_GLOW_LEAVING}
          style={{ '--band-rgb': aura.leavingRgb } as React.CSSProperties}
          aria-hidden="true"
        />
      )}
      {activeTier && (
        <div
          key={activeTier}
          className={RIBBON_INK_GLOW}
          style={{ '--band-rgb': bandRgb } as React.CSSProperties}
          aria-hidden="true"
        />
      )}
      <div
        className={RIBBON_ROOT}
        style={
          {
            '--band-rgb': bandRgb,
            '--band-ink': bandInkRgb,
            '--band-ink-deep': bandDeepInkRgb,
            // The tier's edge is a 1px border at full strength plus a 1px outline
            // drawn just inside it, so the frame reads as a 2px tier line. The
            // outline is what makes it 2px without moving the content: a wider
            // border would take a pixel off every side of the stage.
            ...(activeTier
              ? {
                  borderColor: 'rgb(var(--band-rgb) / 0.8)',
                  outline: '1px solid rgb(var(--band-rgb) / 0.8)',
                  outlineOffset: '-1px',
                }
              : {}),
          } as React.CSSProperties
        }
      >
        {/* The light. Keyed on the tier so a verb of another tier cross-fades it
          in rather than snapping it. A sibling of the content, never an ancestor
          of any text — see the note on RIBBON_INK_AURA. */}
        {aura.leavingRgb && (
          <div
            key="leaving"
            className={RIBBON_INK_AURA_LEAVING}
            style={{ '--band-rgb': aura.leavingRgb, backgroundImage: AURA } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
        <div
          key={activeTier ?? 'none'}
          className={RIBBON_INK_AURA}
          style={{ backgroundImage: AURA }}
          aria-hidden="true"
        />
        <MeshOverlay plain darkOnly box={RIBBON_INK_MESH_BOX} opacity="opacity-[0.035]" />

        {/* Header Button.

          The height is LOCKED, and it takes both halves of that to hold.
          `min-h` stops it shrinking; the `whitespace-nowrap` / `truncate`
          below stop it growing. Without them the header was a different height
          for a handful of verbs: the terms run from three characters to
          thirteen (DIFFERENTIATE), a long one widened the "Selected" chip, the
          wider chip squeezed the title beside it, and the title wrapped to a
          second line. Nothing about the ribbon's chrome should move when the
          question changes — it is the one element on the page meant to sit
          still and be a reference. */}
        <button
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} the HSC command verb hierarchy reference`}
          className={`${RIBBON_HEADER_BAR} ${PANEL_ROW_MIN_H}`}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className={`${RIBBON_HEADER_TILE} ${headerTileClass}`}>
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-left min-w-0">
              {/* Truncates rather than wraps: an ellipsis on a title the reader
                already knows costs nothing, a second line costs the lock. */}
              <h3 className={RIBBON_HEADER_TITLE}>HSC Command Verb Hierarchy</h3>
              {/* "Bands" counted TIER_GROUPS and called them bands. The two are
                1:1 — every tier's maxBand is its own number, and
                bandColors.test.ts pins that — so it was not false, only the
                conflation `tierShortLabel`'s doc comment exists to warn
                about. What is being counted here is tiers. */}
              <span className={RIBBON_HEADER_SUBLABEL}>
                Reference · {sortedVerbsByGroup.length} cognitive tiers
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {activeTermInfo && (
              <>
                {/* Said in words only while the ribbon is shut. Open, the verb is
                  set at 96px a few inches below, and a chip repeating it in the
                  bar is the same fact twice on one screen. It stays in the
                  document either way: only its display changes. */}
                <div className="hidden sm:group-aria-[expanded=false]/header:flex items-center gap-2.5 animate-fade-in">
                  <span className={RIBBON_SELECTED_LABEL}>Selected:</span>
                  <div className={RIBBON_SELECTED_CHIP}>{activeTermInfo.term}</div>
                </div>
                {/* The ceiling in miniature: six bars, lit to the tier. What the
                  staircase says, small enough to say it while the ribbon is
                  shut, which is when most students see it. Decorative, so
                  hidden from assistive tech — the chip and the live region say
                  the same in words. */}
                <span className={RIBBON_MINI_STAIR} aria-hidden="true">
                  {TIER_STEPS.map((step) => (
                    <span
                      key={step}
                      // The lit bars are the tier's own colour in both themes;
                      // the unlit ones are a class, because white alpha reads
                      // on the dark bar and is invisible on the white one.
                      className={`w-1 rounded-full ${step <= (capTier ?? 0) ? '' : RIBBON_MINI_BAR_UNLIT}`}
                      style={{
                        height: `${5 + (step - 1) * 2.2}px`,
                        ...(step <= (capTier ?? 0)
                          ? { backgroundColor: `rgb(${getBandRgb(step)})` }
                          : {}),
                      }}
                    />
                  ))}
                </span>
              </>
            )}
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? `rotate-180 ${RIBBON_HEADER_CHEVRON_OPEN}` : RIBBON_HEADER_CHEVRON_SHUT}`}
            />
          </div>
        </button>

        {/* Collapsible Content.

          A grid-rows transition rather than a max-height one. The old
          `max-h-[1600px]` was a guess, and a wrong one: the panel is about
          700px tall, so the first half of every collapse travelled through
          height the element does not occupy — the ribbon appeared to hang and
          then snap shut. `1fr` animates to whatever the content actually
          needs and has no number in it to get wrong. The `overflow-hidden`
          moves onto the inner wrapper, which is what makes `0fr` clip rather
          than overflow.

          `inert` while collapsed, because zero height is not zero REACH. Fifty
          controls live in here — six tier headers, thirty-eight verb chips and
          six staircase steps — and every one of them stayed in the tab order
          and in the accessibility tree while the ribbon was visually shut. It
          costs nothing visually, unlike hiding the content, which would fight
          the animation. */}
        <div
          id={panelId}
          inert={!isOpen}
          className={`${RIBBON_PANEL} ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className={RIBBON_INK_HERO}>
              {/* The verb. */}
              <div className="min-w-0">
                {activeTermInfo ? (
                  // Keyed on the verb, so choosing another replays the one
                  // orchestrated moment this surface has: the chip, the word, its
                  // rule and the brief settle in together, and the aura and the
                  // ceiling answer on the same beat. Nothing here loops.
                  <div key={`${activeTermInfo.term}:${revealKey}`} className="animate-verb-swap">
                    {/* The tier, said as the tier. This chip used to read
                      `Band {tier}` while the tray six inches to the right read
                      `Band Cap {getTierTargetBand(tier)}` — provably the same
                      integer, twice, under two labels. The band statement
                      lives in the scoreboard and the staircase, where the
                      sentence beside them can explain it; the chip names the
                      rung of the ladder instead, with the label derived rather
                      than written out again. */}
                    <div className={RIBBON_INK_TIER_CHIP}>
                      Tier {activeTermInfo.tier} · {tierShortLabel(activeTermInfo.tier)}
                    </div>
                    <div className={RIBBON_INK_VERB_STAGE}>
                      <span className={RIBBON_INK_VERB_GLOW} aria-hidden="true" />
                      <h4 className={`${RIBBON_INK_VERB} ${ribbonVerbSize(activeTermInfo.term)}`}>
                        {activeTermInfo.term}
                      </h4>
                    </div>
                    <div className={RIBBON_INK_VERB_RULE} aria-hidden="true" />
                    <p className={`${RIBBON_INK_DEFINITION} ${PROSE_BLOCK}`}>
                      {activeTermInfo.definition}
                    </p>
                    {/* The same brief the writing page and the strategy row
                      render, so a student meets one shape of advice rather
                      than two — set for a dark ground, which the tone says.

                      Headless: the term is already the heading above, and the
                      definition is the line directly over this. */}
                    <StrategyBrief
                      verb={activeTermInfo.term}
                      lead="none"
                      tone="ink"
                      className="mt-4"
                    />
                  </div>
                ) : (
                  // Not a dead end. State what is missing and what closes the
                  // gap — and claim nothing about a verb nobody chose, which is
                  // also the state an unrecognised verb lands in.
                  <div>
                    <h4 className={`${RIBBON_INK_VERB} text-4xl sm:text-5xl xl:text-6xl`}>
                      Choose a verb
                    </h4>
                    <p className={`${RIBBON_INK_DEFINITION} ${PROSE_BLOCK}`}>
                      Every command verb sets a ceiling on how far a response can go. Pick one below
                      to see what it asks for.
                    </p>
                  </div>
                )}
              </div>

              {/* The staircase: what the verb costs. */}
              <div className="min-w-0 flex flex-col gap-5">
                {activeTermInfo && (
                  // The point of the whole ribbon, as a headline. It used to be a
                  // 10px line under a tray: "Band Cap" is the one label a student
                  // will not already know, and its explanation lived in a `title`
                  // on a `<div>` with no `tabindex` — unreachable by keyboard,
                  // absent on touch — before it was text, and was still the
                  // smallest type on the surface. Plural rather than "A {TERM}
                  // question": eleven of the thirty-eight verbs begin with a
                  // vowel, and "A EXPLAIN question" is what that sentence renders
                  // for every one of them.
                  <p className={`${RIBBON_INK_CAPTION} ${PROSE_FLOW}`}>
                    {courseCeiling
                      ? `In this course, this ${activeTermInfo.term} question caps a response at Band ${getTierTargetBand(courseCeiling)}.`
                      : `${activeTermInfo.term} questions cap a response at Band ${getTierTargetBand(activeTermInfo.tier)}.`}
                  </p>
                )}

                <div>
                  {/* The announcement, and nothing visible.

                    A screen-reader user has none of the visual statements — the
                    lit columns, the ceiling, the verb's size — and this region
                    is the only thing that tells them the tier changed when the
                    question did. Sighted readers lose nothing; nobody loses the
                    announcement.

                    The LEDE only. The threshold clause is outside the region
                    because it is the same string for three tiers running and a
                    `status` re-announces its whole content on every change —
                    moving between tiers 4, 5 and 6 would have replayed "Above
                    the Deep Learning Threshold" each time, speech carrying no
                    news.

                    Rendered in the no-verb state as well. A live region has to
                    be in the document before it can change, or the first change
                    is the mount and nothing is spoken. */}
                  <p className="sr-only" role="status">
                    {activeTermInfo && activeConfig
                      ? `Tier ${activeTermInfo.tier} · ${activeGroup?.title} · ${getBandName(
                          getTierTargetBand(capTier ?? activeTermInfo.tier)
                        )}`
                      : 'Choose a command verb to see what it caps.'}
                  </p>

                  {/* The scale rail: the two sides of the gate, and the gate.

                    It is a row in the flow, and the chip is positioned at 50% of
                    THIS row — the same 50% the threshold rule below takes from
                    `DEEP_LEARNING_TIER` — so the two cannot drift.

                    What the captions say is what the gate MEANS, which nothing
                    else here says: everything left of it can be answered by
                    recalling and recounting, and everything right of it cannot.

                    The arrows point away from the threshold, and are CSS borders
                    rather than glyphs: the contrast sweep skips `aria-hidden`
                    subtrees, so an arrow character would have taken its caption
                    out of the audit. A zero-size bordered box holds no text node,
                    so it hides on its own. */}
                  <div className={RIBBON_INK_SCALE_RAIL}>
                    <span className={RIBBON_INK_SCALE_SPAN}>
                      <span aria-hidden="true" className="scale-arrow scale-arrow-left" />
                      <span className="ml-1.5">{THRESHOLD_SIDE_BELOW}</span>
                    </span>

                    <span className={RIBBON_INK_THRESHOLD_CHIP}>{THRESHOLD_LABEL}</span>

                    <span className={RIBBON_INK_SCALE_SPAN}>
                      <span className="mr-1.5">{THRESHOLD_SIDE_ABOVE}</span>
                      <span aria-hidden="true" className="scale-arrow scale-arrow-right" />
                    </span>
                  </div>

                  {/* The columns.

                    Six steps rising from tier 1 to tier 6. The ones a student
                    can reach with this verb stand in their tiers' hues; the
                    ones above the ceiling are hatched and dashed — there, and
                    out of reach. Each step is a button that is the column, its
                    band numeral and its tier name together, so what a student
                    aims at is what they are looking at.

                    Every colour is the tier's own, from `--tier-rgb`, set on the
                    step from `getBandRgb` — so the palette is still written down
                    once. The dashed line is the ceiling. */}
                  <div key={revealKey} className={RIBBON_INK_STAIR}>
                    <div
                      className={RIBBON_INK_THRESHOLD_RULE}
                      style={{ left: pct((DEEP_LEARNING_TIER / TIER_STEPS.length) * 100) }}
                      aria-hidden="true"
                    />

                    {activeTier && (
                      // Keyed on the tier so React remounts it and it draws in
                      // again on every change — no rAF, no `element.animate`, so
                      // the global reduced-motion block in index.css genuinely
                      // disables it, and its last frame is full length so a reader
                      // who has asked for no motion is left with the whole line.
                      <div
                        key={`${activeTier}:${revealKey}`}
                        aria-hidden="true"
                        className={RIBBON_INK_CEILING}
                        style={{
                          bottom: `calc(var(--label) + var(--plot) * ${columnFraction(activeTier)})`,
                          borderColor: 'rgb(var(--band-text))',
                        }}
                      />
                    )}

                    {sortedVerbsByGroup.map((group) => {
                      const tier = group.tier;
                      const label = tierShortLabel(tier);
                      const isReachable = activeTier !== undefined && tier <= activeTier;
                      const isCurrent = activeTier === tier;
                      const columnDelay = `${STAIR_OPEN_OFFSET_MS + (tier - 1) * STAIR_STAGGER_MS}ms`;

                      return (
                        <button
                          key={tier}
                          type="button"
                          // "Highlight band n" was wrong twice over: the button
                          // selects the tier's first verb rather than highlighting
                          // anything, and what it selects is a tier, not a band.
                          aria-label={`Show tier ${tier} verbs — ${label}`}
                          // Centred on its own band, so a column stands under the
                          // colour it names. They used to be laid out by
                          // `justify-between`, which put each wherever six label
                          // widths left it — and since five of the six labels are
                          // `hidden` below `sm`, they moved whenever the current
                          // tier changed.
                          style={
                            {
                              left: pct(bandCentre(tier)),
                              width: `calc(${pct(BAND_WIDTH)} - 0.5rem)`,
                              '--tier-rgb': getBandRgb(tier),
                            } as React.CSSProperties
                          }
                          className={RIBBON_INK_STAIR_STEP}
                          onClick={() => {
                            if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                          }}
                        >
                          <span
                            className={`${RIBBON_INK_STAIR_NUMERAL} ${isReachable ? 'text-[rgb(var(--stage-ink))]' : 'text-[rgb(var(--stage-ink-3))]'}`}
                          >
                            {tier}
                          </span>
                          <span
                            className={RIBBON_INK_STAIR_COLUMN}
                            style={
                              isReachable
                                ? {
                                    animationDelay: columnDelay,
                                    height: `calc(var(--plot) * ${columnFraction(tier)})`,
                                    backgroundImage: `linear-gradient(to top, rgb(var(--tier-rgb) / var(${isCurrent ? '--col-cur-lo' : '--col-lo'})), rgb(var(--tier-rgb) / var(${isCurrent ? '--col-cur-hi' : '--col-hi'})))`,
                                    boxShadow: isCurrent
                                      ? '0 0 40px -4px rgb(var(--tier-rgb) / var(--col-glow)), inset 0 3px 0 rgb(255 255 255 / 0.6)'
                                      : 'inset 0 2px 0 rgb(var(--tier-rgb))',
                                  }
                                : {
                                    animationDelay: columnDelay,
                                    height: `calc(var(--plot) * ${columnFraction(tier)})`,
                                    backgroundImage:
                                      'repeating-linear-gradient(135deg, rgb(var(--stage-line) / var(--hatch-fill)) 0 2px, transparent 2px 9px)',
                                    border: '1px dashed rgb(var(--stage-line) / var(--hatch-edge))',
                                    borderBottom: 0,
                                  }
                            }
                          >
                            {/* The band just reached, igniting. `key` on the tier so
                              React remounts it and the one-shot replays on every
                              change; its final frame is `opacity: 0`, so a reader
                              who has asked for no motion is left with nothing
                              burned in. */}
                            {isCurrent && (
                              <span
                                key={`${tier}:${revealKey}`}
                                aria-hidden="true"
                                className={RIBBON_INK_STAIR_IGNITION}
                                style={{
                                  backgroundColor: getBandHex(tier),
                                  // After its own column has finished rising, so
                                  // the flare lands on a column that is there.
                                  animationDelay: `${STAIR_OPEN_OFFSET_MS + (tier - 1) * STAIR_STAGGER_MS + STAIR_FLARE_AFTER_MS}ms`,
                                }}
                              />
                            )}
                          </span>
                          {/* On phones six tracked labels collide into one
                            another, so only the current step keeps its name
                            below sm. */}
                          <span
                            className={`${RIBBON_INK_STEP_LABEL} ${isCurrent ? 'text-[rgb(var(--band-label))]' : RIBBON_INK_STEP_LABEL_IDLE}`}
                          >
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* The scoreboard: what this verb is worth, in telemetry. Under the
                staircase it belongs with — the ceiling says how far a response
                can go, and these say what it is worth and how long to spend —
                so the two columns come out the same height and neither is left
                holding a band of empty stage. */}
                {activeTermInfo && (
                  <div className={RIBBON_INK_SCOREBOARD}>
                    <div className={RIBBON_INK_STAT_CELL}>
                      <span className={RIBBON_INK_STAT_LABEL}>Marks</span>
                      <span className={RIBBON_INK_STAT_VALUE}>
                        {activeTermInfo.markRange.join('–')}
                      </span>
                    </div>
                    <div className={RIBBON_INK_STAT_CELL}>
                      <span className={RIBBON_INK_STAT_LABEL}>Band Cap</span>
                      <span className={RIBBON_INK_STAT_VALUE}>
                        {getTierTargetBand(capTier ?? activeTermInfo.tier)}
                      </span>
                    </div>
                    <div className={RIBBON_INK_STAT_CELL} title="Recommended writing time">
                      <span className={RIBBON_INK_STAT_LABEL}>Time</span>
                      <span className={RIBBON_INK_STAT_VALUE}>
                        {/* "4–7 min", not "4-7m": beside a "Marks" figure, a bare m
                        read as marks as easily as minutes. The unit is set a
                        size down, so the figure keeps the scoreboard's scale
                        and the cell holds one line at four across — at the
                        figure's own size "4–7 min" was wider than its cell and
                        wrapped. */}
                        {activeTermInfo.timeRange.join('–')}
                        <span className="ml-1.5 text-sm font-bold">min</span>
                      </span>
                    </div>
                    <div className={RIBBON_INK_STAT_CELL} title="Expected syllabus terms">
                      <span className={RIBBON_INK_STAT_LABEL}>Terms</span>
                      <span className={RIBBON_INK_STAT_VALUE}>
                        {activeTermInfo.syllabusTerms.join('–')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* The drawer: every verb, by tier. */}
            <div className={RIBBON_DRAWER}>
              {/* The tier strip. A carousel of the six cards, with the selected one in the
                middle; see `RIBBON_STRIP` for why it is one at every width.

                The scroller is named. Without a role a screen-reader user met 38
                buttons in a flat list with nothing saying they are one horizontal
                ladder from tier 1 to tier 6. The edge fades are sibling overlays of
                the scroller, not a mask on it (see `.strip-fade` in `index.css`), and
                they follow the scroll position through the two data attributes below. */}
              <div
                className={RIBBON_STRIP_FRAME}
                data-at-start={stripPos.atStart}
                data-at-end={stripPos.atEnd}
              >
                <div
                  className={RIBBON_STRIP}
                  ref={scrollContainerRef}
                  role="group"
                  aria-label="Cognitive tier ladder, tier 1 to tier 6"
                  data-dragging={dragging ? '' : undefined}
                  onPointerDown={onStripPointerDown}
                  onPointerMove={onStripPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClickCapture={onStripClickCapture}
                >
                  {sortedVerbsByGroup.map((group, index) => {
                    const isCurrentTier = activeTermInfo?.tier === group.tier;
                    const tierConfig = getTierScaleConfig(group.tier);
                    const TierIcon = tierIcon(group.tier);

                    // The selected card and the rest differ in their fill, their stacking and
                    // their halo, and in nothing else: each is the same box. See the constants
                    // in `utils/verbRibbonChrome.ts`.
                    const cardStyle = isCurrentTier
                      ? RIBBON_TIER_CARD_CURRENT
                      : RIBBON_TIER_CARD_RECEDED;

                    return (
                      <div
                        key={group.tier}
                        ref={(el) => {
                          tierRefs.current[index] = el;
                        }}
                        // The tier's colour, handed to CSS once as a custom
                        // property, so the border and the halo can each take the
                        // alpha they need without either being written down
                        // twice. `getBandRgb` derives from `BAND_HEX`, which is
                        // the palette the staircase above is painted from — so
                        // the selected card and the lit column state one colour
                        // between them rather than two.
                        //
                        // The cell holds the property, so it reaches the card and
                        // the halo alike. It is also the box the auto-scroll
                        // measures: it owns the width and the snap point.
                        style={{ '--band-rgb': getBandRgb(group.tier) } as React.CSSProperties}
                        className={RIBBON_TIER_SLOT}
                      >
                        {/* The card's edge is the tier's own hue at a whisper, and at a statement on
                        the selected card. Its fill is the band gradient on the selected card
                        (`RIBBON_TIER_CARD_CURRENT`) and the neutral surface on the rest. */}
                        <div
                          className={`
                      ${RIBBON_TIER_CARD}
                      ${isCurrentTier ? 'band-edge-strong' : 'band-edge'}
                      ${isCurrentTier ? '' : RIBBON_TIER_CARD_IDLE}
                      ${cardStyle}
                    `}
                        >
                          {/* The mesh is for the card the reader is on. At 2% on the
                          other five it painted nothing anyone could see, and it
                          was five more composited layers on a page that is
                          mounted for the whole session. The same goes for the
                          idle cards' 3% gradient: the tint in the header and
                          the tier's own border already say whose card it is. */}
                          {isCurrentTier && <MeshOverlay plain opacity="opacity-[0.04]" />}

                          {/* The card's header is the "select this tier" control.
                      The whole card used to carry the onClick as a bare div:
                      no keyboard focus, no role, invisible to a screen reader.
                      It cannot become a button itself — the verb chips inside
                      it are buttons already — so the shortcut lives on the
                      header, which has nothing interactive in it.

                      The selected header is the band's own hue at full strength,
                      under slate-950, not the tier's gradient under `solidText`:
                      white was under 4.5:1 on five of the six hues, and on
                      the light stage the gradients could not carry any single
                      ink. It has the mark ladder's sheen on it, and no shade
                      under its text. See `RIBBON_TIER_HEADER_SELECTED`. */}
                          <button
                            ref={(el) => {
                              headerRefs.current[index] = el;
                            }}
                            type="button"
                            onKeyDown={(event) => onTierKey(event, index)}
                            onClick={() => {
                              if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                            }}
                            aria-pressed={isCurrentTier}
                            title={`Show the ${group.title} verbs — up to Band ${group.maxBand}`}
                            className={`${RIBBON_TIER_HEADER} ${isCurrentTier ? RIBBON_TIER_HEADER_SELECTED : RIBBON_TIER_HEADER_IDLE}`}
                          >
                            {/* The icon tile: the app's own line icon, in row one at the left. On the selected
                            card it is white alpha over the solid header, with a slate-950 glyph; on the
                            others it is the tier's own tint, with the tier's text step as the glyph. */}
                            <div
                              className={`${RIBBON_TIER_ICON} ${isCurrentTier ? RIBBON_TIER_ICON_SELECTED : `${RIBBON_TIER_ICON_IDLE} ${tierConfig.text}`}`}
                              aria-hidden="true"
                            >
                              <TierIcon className="w-4 h-4" />
                            </div>
                            {/* The NAME, which is what the button says first. It is in row two,
                            across the header, and the header's floor reserves its lines so the
                            six names sit on one baseline whatever their length. */}
                            <h4
                              className={`${RIBBON_TIER_HEADER_TITLE} ${isCurrentTier ? '' : tierConfig.text}`}
                            >
                              {group.title}
                            </h4>
                            {/* The ceiling, as a chip in row one at the right. The visible form is
                            "≤ B2", which is the compact form of "Up to Band 2"; the words themselves
                            are for a screen reader, and they are what the button's name reads as
                            after the tier name. The chip is not a control. No opacity on either
                            branch: see `RIBBON_TIER_BAND_IDLE`. */}
                            <span
                              className={`${RIBBON_TIER_BAND} ${isCurrentTier ? RIBBON_TIER_BAND_SELECTED : `${RIBBON_TIER_BAND_IDLE} ${tierConfig.text}`}`}
                            >
                              <span aria-hidden="true">≤ B{group.maxBand}</span>
                              <span className="sr-only">Up to Band {group.maxBand}</span>
                            </span>
                          </button>

                          {/* What this cognitive level actually asks of the writer. */}
                          <p
                            className={`${RIBBON_TIER_SUBTITLE} ${PROSE_BLOCK} ${isCurrentTier ? RIBBON_TIER_SUBTITLE_CURRENT : RIBBON_TIER_SUBTITLE_IDLE}`}
                          >
                            {group.subtitle}
                          </p>

                          {/* No fixed card height. At a hard 256px the biggest tier
                      (eight verbs, five rows of chips) had its last row sliced
                      in half by the card edge, which reads as broken rather
                      than as "scroll for more" — and no single magic number
                      survives a change to the verb list or the reader's text
                      size. The strip is a flex row, so leaving the height to
                      the content makes every card as tall as the tallest one
                      for free. The scroll stays as the safety net. */}
                          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 custom-scrollbar relative z-10">
                            <div className="flex flex-wrap gap-2 justify-start content-start">
                              {group.verbs.map((verb) => {
                                const isSelected = verb.term === activeVerb;
                                // The selected chip's fill is the tier's solid one,
                                // so its text is the tier's `solidText` — white on
                                // tier 3's yellow was 1.92:1. One cell is still
                                // short after this and it is not this component's:
                                // `text-yellow-900` on `light:bg-amber-500` is
                                // 4.04:1, a defect in the shared token that Step 7
                                // of the ribbon plan fixes in `getBandConfig`.
                                return (
                                  <button
                                    key={verb.term}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveVerb(verb.term);
                                    }}
                                    className={`
                                            ${RIBBON_VERB_CHIP}
                                            ${
                                              isSelected
                                                ? `${tierConfig.solidBg} ${tierConfig.solidText} shadow-lg scale-105 border-transparent`
                                                : `${RIBBON_VERB_CHIP_IDLE} ${tierConfig.text}`
                                            }
                                        `}
                                  >
                                    {verb.term}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        {/* The halo: the selected tier's ring and glow, faded in
                        and out. See `RIBBON_TIER_HALO` for why this is a layer
                        of its own and not a transition on the card. */}
                        <span
                          aria-hidden="true"
                          className={`${RIBBON_TIER_HALO} ${isCurrentTier ? 'opacity-100' : 'opacity-0'}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <span className={RIBBON_STRIP_FADE_START} aria-hidden="true" />
                <span className={RIBBON_STRIP_FADE_END} aria-hidden="true" />
              </div>

              {/* The pager: one dot per tier, the centred one a pill, and a chevron either side.
                It browses the strip and selects nothing. It is hidden from assistive tech, and
                its buttons are out of the tab order, because the tier headers already give a
                keyboard or screen-reader user this movement, and a pointer convenience should
                not add tab stops beside them. */}
              <div className={RIBBON_PAGER} aria-hidden="true">
                <button
                  type="button"
                  tabIndex={-1}
                  title="Previous tier"
                  disabled={stripPos.centred <= 0}
                  onClick={() => centreTier(Math.max(0, stripPos.centred - 1))}
                  className={RIBBON_PAGER_ARROW}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {sortedVerbsByGroup.map((group, index) => {
                  const isCentred = stripPos.centred === index;
                  const isSelected = activeTermInfo?.tier === group.tier;
                  return (
                    <button
                      key={group.tier}
                      type="button"
                      tabIndex={-1}
                      title={group.title}
                      onClick={() => centreTier(index)}
                      className={RIBBON_PAGER_DOT}
                      style={{ '--band-rgb': getBandRgb(group.tier) } as React.CSSProperties}
                    >
                      <span
                        className={`${RIBBON_PAGER_MARK} ${isCentred ? RIBBON_PAGER_MARK_CENTRED : RIBBON_PAGER_MARK_IDLE} ${isSelected ? RIBBON_PAGER_MARK_SELECTED : ''}`}
                      />
                    </button>
                  );
                })}
                <button
                  type="button"
                  tabIndex={-1}
                  title="Next tier"
                  disabled={stripPos.centred >= sortedVerbsByGroup.length - 1}
                  onClick={() =>
                    centreTier(Math.min(sortedVerbsByGroup.length - 1, stripPos.centred + 1))
                  }
                  className={RIBBON_PAGER_ARROW}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandVerbHierarchy;
