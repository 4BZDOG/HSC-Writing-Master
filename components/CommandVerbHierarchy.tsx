import React, { useMemo, useState, useEffect, useRef, useId } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS, getTierTargetBand, tierShortLabel } from '../data/commandTerms';
import {
  Brain,
  ChevronDown,
  Layers,
  Link2,
  NotebookPen,
  Scale,
  Search,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { getBandHex, getBandName, getBandRgb, getTierScaleConfig } from '../utils/renderUtils';
import StrategyBrief from './StrategyBrief';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import MeshOverlay from './MeshOverlay';
import { PANEL_ROW_MIN_H } from '../utils/panelStyles';
import {
  RIBBON_DRAWER,
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
  RIBBON_TIER_CARD_IDLE,
  RIBBON_TIER_HALO,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_HEADER_IDLE,
  RIBBON_TIER_HEADER_LABEL,
  RIBBON_TIER_HEADER_LABEL_IDLE,
  RIBBON_TIER_HEADER_TEXT,
  RIBBON_TIER_HEADER_TITLE,
  RIBBON_TIER_ICON,
  RIBBON_TIER_SLOT,
  RIBBON_TIER_SUBTITLE,
  RIBBON_TIER_SUBTITLE_CURRENT,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_VERB_CHIP,
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

/**
 * The stage's light, as two pools: one top left behind the verb, one low on the
 * right under the staircase. Built from `--band-rgb`, which the root sets, so it
 * is the question's own tier colour at two strengths — the palette handed to
 * CSS, not a copy of it.
 */
const AURA =
  'radial-gradient(56rem 26rem at 0% 0%, rgb(var(--band-rgb) / 0.42), transparent 72%), ' +
  'radial-gradient(38rem 22rem at 100% 44rem, rgb(var(--band-rgb) / 0.16), transparent 70%)';

/**
 * The line icon each tier wears in its card header, in place of the system emoji
 * `TIER_GROUPS` carries for the generator modal.
 *
 * A function rather than a lookup table at module scope: a table would read the
 * imported icon components while this module initialises, which is the
 * `Cannot access 'X' before initialization` shape `npm run check:eager-reads`
 * exists to catch. `TIER_GROUPS` is not edited — the emoji is the generator's —
 * so the ribbon keys on the tier number, which is the ladder's own order.
 */
const tierIcon = (tier: number): LucideIcon => {
  switch (tier) {
    case 1:
      return Brain;
    case 2:
      return NotebookPen;
    case 3:
      return Link2;
    case 4:
      return Search;
    case 5:
      return Scale;
    default:
      return Trophy;
  }
};

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

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({
  currentVerb,
  defaultOpen = true,
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
  const scrolled = useRef<{ tier: number | null; open: boolean }>({ tier: null, open: false });

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

  // Bring the active tier into view along the ribbon: first card flush left,
  // last flush right, everything else centred.
  //
  // Done by scrolling the strip itself rather than with `scrollIntoView`.
  // That API cannot be told to leave the page alone — when the ribbon sits
  // below the fold (it does, whenever the navigator is expanded), selecting a
  // question scrolled the WINDOW down to the ribbon, throwing the reader away
  // from the question they had just chosen. Setting `scrollLeft` moves only
  // the strip.
  //
  // Three cases are NOT a smooth glide to centre, because each one used to be
  // one and each felt like the strip fighting the reader:
  //  - the ribbon has only just opened, or this is the first position it has
  //    had. The strip is mid-unfold and behind the panel's clip, so a 400ms
  //    slide across it is invisible work competing with the open; it is put in
  //    place instantly.
  //  - the reader tapped another chip on a card that is already fully in view.
  //    Their finger has just lifted from a card where they want it; centring it
  //    underneath them is the strip moving for no reason they gave it.
  //  - the strip is already where it would be sent.
  useEffect(() => {
    const previous = scrolled.current;
    scrolled.current = { tier: previous.tier, open: isOpen };
    if (!isOpen || !activeTermInfo) return;
    const strip = scrollContainerRef.current;
    const activeCard = tierRefs.current[activeTermInfo.tier - 1];
    if (!strip || !activeCard) return;

    const tier = activeTermInfo.tier;
    scrolled.current = { tier, open: true };
    const isFirst = tier === 1;
    const isLast = tier === TIER_GROUPS.length;
    const left = isFirst
      ? 0
      : isLast
        ? strip.scrollWidth
        : activeCard.offsetLeft - (strip.clientWidth - activeCard.offsetWidth) / 2;

    const target = Math.max(0, left);
    if (Math.abs(strip.scrollLeft - target) < 2) return;

    const cardLeft = activeCard.offsetLeft;
    const cardRight = cardLeft + activeCard.offsetWidth;
    const fullyInView =
      cardLeft >= strip.scrollLeft && cardRight <= strip.scrollLeft + strip.clientWidth;
    if (previous.tier === tier && previous.open && fullyInView) return;

    // index.css sets `scroll-behavior: auto !important` under reduced motion,
    // but that property does not govern the JS `behavior` option — a reader who
    // has asked for no animation still got the smooth slide.
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instant = reduceMotion || previous.tier === null || !previous.open;
    // jsdom (and very old browsers) have no Element.scrollTo — fall back to
    // the property, which is what scrollTo sets anyway.
    if (typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: target, behavior: instant ? 'auto' : 'smooth' });
    } else {
      strip.scrollLeft = target;
    }
  }, [activeTermInfo, isOpen]);

  // Colour the ribbon on the distinct tier-identity scale (Tier 1 red …
  // Tier 6 purple) so every level of the ladder reads as its own step — the
  // band-target mapping collapsed Tiers 5 and 6 into the same purple.
  const activeConfig = activeTermInfo ? getTierScaleConfig(activeTermInfo.tier) : null;
  const activeTier = activeTermInfo?.tier;

  // The stage's one hue, handed to CSS once as a custom property: the aura, the
  // verb's glow and rule, the chip and the numbers all draw from it at the alpha
  // they need. `getBandRgb` derives from `BAND_HEX`, which is also what the
  // staircase's columns are painted from, so the light on the verb and the
  // column under it state one colour between them.
  const bandRgb = activeTier ? getBandRgb(activeTier) : NEUTRAL_RGB;

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
    ? `${activeConfig.solidBg} ${activeConfig.solidText} border-white/20`
    : RIBBON_HEADER_TILE_NEUTRAL;

  return (
    // The hero. A dark stage in both themes with a tier-lit edge and a glow
    // beneath it, so the one object on the page that explains what a student's
    // verb costs them is also the one object that cannot be missed. The border
    // is inline because it is drawn from `--band-rgb`; with no verb chosen it is
    // not set and the stage keeps its neutral white-alpha edge from
    // `RIBBON_ROOT`, and there is no glow.
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
            ...(activeTier ? { borderColor: 'rgb(var(--band-rgb) / 0.5)' } : {}),
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
        <MeshOverlay plain box={RIBBON_INK_MESH_BOX} opacity="opacity-[0.035]" />

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
                      className={`w-1 rounded-full ${step <= activeTermInfo.tier ? '' : RIBBON_MINI_BAR_UNLIT}`}
                      style={{
                        height: `${5 + (step - 1) * 2.2}px`,
                        ...(step <= activeTermInfo.tier
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
                    {activeTermInfo.term} questions cap a response at Band{' '}
                    {getTierTargetBand(activeTermInfo.tier)}.
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
                          getTierTargetBand(activeTermInfo.tier)
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
                          borderColor: `rgb(${getBandRgb(activeTier)})`,
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
                            className={`${RIBBON_INK_STAIR_NUMERAL} ${isReachable ? 'text-white' : 'text-slate-300'}`}
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
                                    backgroundImage: `linear-gradient(to top, rgb(var(--tier-rgb) / ${isCurrent ? 0.35 : 0.18}), rgb(var(--tier-rgb) / ${isCurrent ? 1 : 0.62}))`,
                                    boxShadow: isCurrent
                                      ? '0 0 40px -4px rgb(var(--tier-rgb) / 0.7), inset 0 3px 0 rgb(255 255 255 / 0.6)'
                                      : 'inset 0 2px 0 rgb(var(--tier-rgb) / 0.9)',
                                  }
                                : {
                                    animationDelay: columnDelay,
                                    height: `calc(var(--plot) * ${columnFraction(tier)})`,
                                    backgroundImage:
                                      'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.13) 0 2px, transparent 2px 9px)',
                                    border: '1px dashed rgb(255 255 255 / 0.3)',
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
                            className={`${RIBBON_INK_STEP_LABEL} ${isCurrent ? 'text-[rgb(var(--tier-rgb))]' : RIBBON_INK_STEP_LABEL_IDLE}`}
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
                        {getTierTargetBand(activeTermInfo.tier)}
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
              {/* Tier Cards Scroll Area.

                The scroller is named. Without a role a screen-reader user met
                44 buttons in a flat list with nothing saying they are one
                horizontal ladder from tier 1 to tier 6. The edge fades that
                tell a sighted reader there is more strip to the right are a
                mask on the scroller itself (`strip-edge-mask`), not two
                overlays in a wrapper of their own. */}
              <div className={RIBBON_STRIP_FRAME}>
                <div
                  className={RIBBON_STRIP}
                  ref={scrollContainerRef}
                  role="group"
                  aria-label="Cognitive tier ladder, tier 1 to tier 6"
                >
                  {sortedVerbsByGroup.map((group, index) => {
                    const isCurrentTier = activeTermInfo?.tier === group.tier;
                    const tierConfig = getTierScaleConfig(group.tier);
                    const TierIcon = tierIcon(group.tier);

                    // Determine transform origin to keep edges aligned when scaling
                    const isFirst = index === 0;
                    const isLast = index === sortedVerbsByGroup.length - 1;
                    const transformOrigin = isFirst
                      ? 'origin-left'
                      : isLast
                        ? 'origin-right'
                        : 'origin-center';

                    // One branch, not three. The old form had a no-selection
                    // default of `scale-100 opacity-100` that said nothing the
                    // card did not already say, and it applied the tier's border
                    // only on the five non-current cards — where, in the dark
                    // theme, `RIBBON_TIER_CARD_IDLE`'s neutral outranked it. The
                    // tier's border is now unconditional and the neutral is gone
                    // from the idle constant, so all six cards show their tier at
                    // rest in both themes, which is the ladder this strip exists
                    // to draw.
                    const cardStyle = isCurrentTier
                      ? `${RIBBON_TIER_CARD_CURRENT} ${transformOrigin}`
                      : `${RIBBON_TIER_CARD_RECEDED} ${transformOrigin}`;

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
                        <div
                          className={`
                      ${RIBBON_TIER_CARD}
                      band-edge
                      ${isCurrentTier ? `${tierConfig.bg} light:bg-white` : RIBBON_TIER_CARD_IDLE}
                      ${cardStyle}
                    `}
                        >
                          {isCurrentTier && (
                            <div
                              className={`absolute inset-0 opacity-10 bg-gradient-to-br ${tierConfig.gradient} pointer-events-none`}
                            />
                          )}

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

                      `tierConfig.solidText` rather than `text-white`, here and
                      on the title below: on tier 3 the fill is yellow and white
                      on it is 1.92:1. `getBandConfig` returns a `solidText`
                      field for exactly this, and SyllabusNavBar and
                      PromptSelector already pair the two. */}
                          <button
                            type="button"
                            onClick={() => {
                              if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                            }}
                            aria-pressed={isCurrentTier}
                            title={`Show the ${group.title} verbs — up to Band ${group.maxBand}`}
                            className={`${RIBBON_TIER_HEADER} ${isCurrentTier ? `bg-gradient-to-r ${tierConfig.gradient} border-white/10 ${tierConfig.solidText}` : RIBBON_TIER_HEADER_IDLE}`}
                          >
                            {/* A line icon in a tile, where there was a system
                            emoji. On the selected card the tile is white
                            alpha over the tier gradient — the same colour in
                            both themes, so it needs no partner — and the glyph
                            takes the card's `solidText`; on the others it is
                            the neutral well the accordions use, and the glyph
                            takes the tier's own text colour. */}
                            <div
                              className={`${RIBBON_TIER_ICON} ${isCurrentTier ? 'bg-white/25 border-white/30' : `bg-white border-slate-300 dark:bg-black/20 dark:border-white/10 ${tierConfig.text}`}`}
                              aria-hidden="true"
                            >
                              <TierIcon className="w-[18px] h-[18px] xl:w-4 xl:h-4" />
                            </div>
                            <div className={RIBBON_TIER_HEADER_TEXT}>
                              {/* The NAME first, then what it costs you.
                              The ceiling sat above as an eyebrow, so a reader
                              scanning the six cards met "Band 1 ceiling",
                              "Band 2 ceiling", "Band 3 ceiling" in a row
                              before any of the words that tell them apart.
                              This is also the order the card is spoken in. */}
                              <h4
                                className={`${RIBBON_TIER_HEADER_TITLE} ${isCurrentTier ? tierConfig.solidText : tierConfig.text}`}
                              >
                                {group.title}
                              </h4>
                              {/* No opacity on either branch. Through `opacity-60`
                              — on a card that is itself dimmed to 90% — the
                              tier's own `-900` text measured 2.97:1 on tier 6
                              and worse below it, and there was no darker step
                              in the shared config to reach for. */}
                              <span
                                className={`${RIBBON_TIER_HEADER_LABEL} ${isCurrentTier ? '' : RIBBON_TIER_HEADER_LABEL_IDLE}`}
                              >
                                {/* "Up to Band 2", visibly. A bare "Band 2" under the
                                name read as a target to anyone looking, and the
                                header's own title already said "up to". */}
                                Up to Band {group.maxBand}
                                {/* It said "Band 2" on screen and "Band 2 ceiling" to
                                a screen reader, because the limit was the whole
                                meaning and only listeners were told it. "Up to"
                                says it to everyone, so the hidden word went. */}
                              </span>
                            </div>
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
                          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-10">
                            <div className="flex flex-wrap gap-2 justify-center content-start">
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
                                                : `bg-transparent border ${tierConfig.border} ${tierConfig.text}`
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandVerbHierarchy;
