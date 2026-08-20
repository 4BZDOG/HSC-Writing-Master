import React, { useMemo, useState, useEffect, useRef, useId } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS, getTierTargetBand, tierShortLabel } from '../data/commandTerms';
import { ChevronDown, AlignLeft, Sparkles } from 'lucide-react';
import { getBandHex, getBandName, getTierScaleConfig } from '../utils/renderUtils';
import StrategyTip from './StrategyTip';
import MeshOverlay from './MeshOverlay';
import {
  RIBBON_CHEVRON_CHIP,
  RIBBON_DETAIL_CARD,
  RIBBON_DETAIL_DEFINITION,
  RIBBON_DETAIL_TERM,
  RIBBON_DETAIL_TIER_CHIP,
  RIBBON_DETAIL_TIP_ACCENT,
  RIBBON_HEADER_BAR,
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TITLE,
  RIBBON_ROOT,
  RIBBON_SELECTED_CHIP,
  RIBBON_SELECTED_LABEL,
  RIBBON_STAT_CAPTION,
  RIBBON_STAT_DIVIDER,
  RIBBON_STAT_LABEL,
  RIBBON_STAT_TRAY,
  RIBBON_STAT_VALUE,
  RIBBON_STRIP,
  RIBBON_STRIP_FADE_LEFT,
  RIBBON_STRIP_FADE_RIGHT,
  RIBBON_TIER_CARD,
  RIBBON_TIER_CARD_CURRENT,
  RIBBON_TIER_CARD_DIMMED,
  RIBBON_TIER_CARD_IDLE,
  RIBBON_TIER_HEADER,
  RIBBON_TIER_HEADER_LABEL,
  RIBBON_TIER_HEADER_TITLE,
  RIBBON_TIER_SUBTITLE,
  RIBBON_TIER_SUBTITLE_CURRENT,
  RIBBON_TIER_SUBTITLE_IDLE,
  RIBBON_TIER_UNDERLINE,
  RIBBON_SPECTRUM_BOUNDARY,
  RIBBON_SPECTRUM_DORMANT,
  RIBBON_SPECTRUM_DOT_BLOOM,
  RIBBON_SPECTRUM_EDGE,
  RIBBON_SPECTRUM_IGNITION,
  RIBBON_SPECTRUM_LIT,
  RIBBON_SPECTRUM_SCALE_BAND,
  RIBBON_SPECTRUM_SCALE_RAIL,
  RIBBON_SPECTRUM_SCALE_SPAN,
  RIBBON_TIMELINE_CUE,
  RIBBON_TIMELINE_CUE_BAND,
  RIBBON_TIMELINE_CUE_SIDE,
  RIBBON_TIMELINE_CUE_TIER,
  RIBBON_TIMELINE_DOT,
  RIBBON_TIMELINE_STEP_LABEL,
  RIBBON_TIMELINE_STEP_LABEL_IDLE,
  RIBBON_TIMELINE_THRESHOLD_CHIP,
  RIBBON_TIMELINE_TRACK,
  RIBBON_VERB_CHIP,
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
   * beneath the breadcrumb, where the page is a writing surface and seven
   * hundred pixels of reference unfolding above it would undo the fold.
   *
   * `true` by default, which is the browsing behaviour, unchanged.
   */
  defaultOpen?: boolean;
}

/**
 * The footer's geometry, in one place, because the two halves of it used to
 * disagree.
 *
 * The bar filled to `tier / 6` while the six dots were laid out by
 * `justify-between`, which puts each dot's centre wherever the six label texts
 * happen to leave it — and below `sm` five of those labels are not rendered at
 * all, so the dots MOVED depending on which tier was current. The fill and the
 * dots were never on the same scale, and one of them was not a scale.
 *
 * One geometry now: band `i` owns `[(i-1)/6, i/6]`, its dot sits at the centre
 * of that band, and the fill to `tier / 6` therefore lights band `tier` whole,
 * with its dot inside the lit region.
 */
const TIER_STEPS = [1, 2, 3, 4, 5, 6];

/** The tier the Deep Learning Threshold sits above: the 3/4 boundary is where
 *  `getTierTargetBand` stops returning 3, and where the Verb Gate's Band 3 cap
 *  stops being the ceiling. Written once, read by the rail, the boundary notch
 *  and the cue. */
const DEEP_LEARNING_TIER = 3;

/** The chip's own words, so the cue can point at the marker on the bar without
 *  a second hand-written copy of its label. */
const THRESHOLD_LABEL = 'Deep Learning Threshold';

/** A percentage with trailing zeros trimmed, so tier 6 clips by `0%` rather
 *  than by `0.000%`. */
const pct = (value: number): string => `${Number(value.toFixed(3))}%`;

/** The left edge of band `tier`, as a percentage of the track. */
const bandStart = (tier: number): number => ((tier - 1) / 6) * 100;

/** The centre of band `tier` — where its dot and its colour stop both sit. */
const bandCentre = (tier: number): number => ((2 * tier - 1) / 12) * 100;

/** One band's share of the track. */
const BAND_WIDTH = 100 / 6;

/**
 * The outermost two step labels, nudged inwards on a phone.
 *
 * Tier 1's dot sits at 8.333% — about 24px into a 320px screen — and its label
 * is a 64px box centred on it, so six of those pixels are off the left edge of
 * the panel, which is `overflow-hidden`. It only bites below `sm`, where the
 * current step is the only label rendered at all, so the nudge is confined
 * there: the dots themselves never move, at any width.
 */
const edgeLabelNudge = (tier: number): string =>
  tier === 1
    ? 'translate-x-4 sm:translate-x-0'
    : tier === 6
      ? '-translate-x-4 sm:translate-x-0'
      : '';

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({
  currentVerb,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeVerb, setActiveVerb] = useState<PromptVerb | undefined>(currentVerb);
  const panelId = useId();

  const tierRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (!isOpen || !activeTermInfo) return;
    const strip = scrollContainerRef.current;
    const activeCard = tierRefs.current[activeTermInfo.tier - 1];
    if (!strip || !activeCard) return;

    const tier = activeTermInfo.tier;
    const isFirst = tier === 1;
    const isLast = tier === TIER_GROUPS.length;
    const left = isFirst
      ? 0
      : isLast
        ? strip.scrollWidth
        : activeCard.offsetLeft - (strip.clientWidth - activeCard.offsetWidth) / 2;

    const target = Math.max(0, left);
    // index.css sets `scroll-behavior: auto !important` under reduced motion,
    // but that property does not govern the JS `behavior` option — a reader who
    // has asked for no animation still got the smooth slide.
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom (and very old browsers) have no Element.scrollTo — fall back to
    // the property, which is what scrollTo sets anyway.
    if (typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      strip.scrollLeft = target;
    }
  }, [activeTermInfo, isOpen]);

  // Colour the ribbon on the distinct tier-identity scale (Tier 1 red …
  // Tier 6 purple) so every level of the ladder reads as its own step — the
  // band-target mapping collapsed Tiers 5 and 6 into the same purple.
  const activeConfig = activeTermInfo ? getTierScaleConfig(activeTermInfo.tier) : null;

  // The six-colour wash the footer's spectrum is painted from.
  //
  // Built HERE, in the component body, and not at module scope: a template
  // literal that dereferences an import while a module initialises can throw
  // `Cannot access 'X' before initialization` in a production build, which
  // `projectDocs/bundleSafety.md` documents and `npm run check:eager-reads`
  // gates on. `useMemo` with no dependencies is the honest shape — the stops
  // are constants, they are just constants that must be read late.
  //
  // Every stop is `getBandHex(i)`, never a literal. `BAND_HEX` is the single
  // source of truth for what a band is coloured, pinned by
  // `tests/unit/bandColors.test.ts`, and the dead `CognitiveSpectrum.tsx` this
  // replaces held a hard-coded fourth copy of exactly these six values.
  //
  // The stops sit at band CENTRES rather than at the boundaries between bands.
  // Six flat blocks would be the traffic lights this redesign exists to
  // replace; centres put each dot on its own canonical hex and let each
  // transition happen across a boundary, so the bar reads as one wash.
  const spectrum = useMemo(
    () =>
      `linear-gradient(to right, ${getBandHex(1)} 0%, ` +
      TIER_STEPS.map((tier) => `${getBandHex(tier)} ${pct(bandCentre(tier))}`).join(', ') +
      `, ${getBandHex(6)} 100%)`,
    []
  );

  // How far along the ladder the reader is. The one part of the old geometry
  // that was already right.
  const litPercent = activeTermInfo ? (activeTermInfo.tier / 6) * 100 : 0;

  // The tier group behind the active verb — the source of every word in the cue
  // line below, so none of it is written out a second time here.
  const activeGroup = activeTermInfo
    ? sortedVerbsByGroup.find((group) => group.tier === activeTermInfo.tier)
    : undefined;

  /** A tier's full title, from the same array the strip is built from. Falls
   *  back to the short label rather than to a literal.
   *
   *  In the body, not at module scope: it dereferences `TIER_GROUPS` through
   *  `sortedVerbsByGroup`, and a module-scope read of an imported value is the
   *  `Cannot access 'X' before initialization` failure `projectDocs/bundleSafety.md`
   *  documents and `npm run check:eager-reads` gates on. */
  const tierTitle = (tier: number): string =>
    sortedVerbsByGroup.find((group) => group.tier === tier)?.title ?? tierShortLabel(tier);

  // The tier no longer paints the whole bar; it paints the 36px tile and the
  // 2px underline beneath it. `solidText` rather than `text-white` because
  // tier 3's fill is yellow — that is the pairing `getBandConfig` returns a
  // `solidText` field for, and white on it is 1.9:1. The `border-white/20` sits
  // on a solid tier fill, so it reads the same in both themes and takes no
  // `dark:` partner (DesignSpec §2, rule 2); the slate branch is not on a fill
  // and does take one.
  const headerTileClass = activeConfig
    ? `${activeConfig.solidBg} ${activeConfig.solidText} border-white/20`
    : 'bg-slate-200 text-slate-500 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-white/10';

  // Hairline used above the header, above the footer, and below the ribbon —
  // slightly stronger when a verb is selected so the ribbon reads as active.
  const dividerClass = `h-px bg-gradient-to-r from-transparent ${activeConfig ? 'via-[rgb(var(--color-border-secondary))]/60' : 'via-[rgb(var(--color-border-secondary))]/40'} to-transparent`;

  return (
    // Full page width, flush with everything else in the column — the
    // breadcrumb, the question card and the reference rail all start at the
    // container's edge. This used to carry PromptSelector's `pl-4 md:pl-12`
    // rail gutter so it lined up with the syllabus dropdowns directly above,
    // but that gutter exists to make room for the navigator's step rail, and
    // the ribbon has no step on it: all the indent did was set the ribbon 48px
    // in from every other block on the page.
    <div className={RIBBON_ROOT}>
      {/* Top divider */}
      <div className={dividerClass} />

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
        className={RIBBON_HEADER_BAR}
      >
        <MeshOverlay opacity="opacity-10" />
        {/* Where the tier gradient went: a hairline along the bar's own bottom
            edge, lit only when there is a tier to state. */}
        {activeConfig && (
          <div className={`${RIBBON_TIER_UNDERLINE} ${activeConfig.gradient}`} aria-hidden="true" />
        )}

        <div className="flex items-center gap-3 relative z-10 px-4 sm:px-5 min-w-0">
          <div className={`${RIBBON_HEADER_TILE} ${headerTileClass}`}>
            <AlignLeft className="w-5 h-5" />
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
              Reference • {sortedVerbsByGroup.length} cognitive tiers
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-10 px-4 sm:px-5 shrink-0">
          {activeTermInfo && (
            <div className="hidden sm:flex items-center gap-3 animate-fade-in">
              <span className={RIBBON_SELECTED_LABEL}>Selected:</span>
              <div
                className={`${RIBBON_SELECTED_CHIP} ${activeConfig?.bg ?? ''} ${activeConfig?.text ?? ''} ${activeConfig?.border ?? ''}`}
              >
                {activeTermInfo.term}
              </div>
            </div>
          )}
          <div
            className={`${RIBBON_CHEVRON_CHIP} ${isOpen ? 'rotate-180 bg-black/20 dark:bg-white/20' : ''}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      </button>

      {/* Collapsible Content.

          A grid-rows transition rather than a max-height one. The old
          `max-h-[1600px]` was a guess, and a wrong one: the panel is about
          700px tall, so the first half of every 700ms collapse travelled
          through height the element does not occupy — the ribbon appeared to
          hang and then snap shut. `1fr` animates to whatever the content
          actually needs and has no number in it to get wrong. The
          `overflow-hidden` moves onto the inner wrapper, which is what makes
          `0fr` clip rather than overflow.

          `inert` while collapsed, because zero height is not zero REACH. Fifty
          controls live in here — six tier headers, thirty-eight verb chips and
          six timeline steps — and every one of them stayed in the tab order
          and in the accessibility tree while the ribbon was visually shut. It
          costs nothing visually, unlike hiding the content, which would fight
          the animation. */}
      <div
        id={panelId}
        inert={!isOpen}
        className={`grid transition-all duration-700 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="py-4 space-y-4">
            {/* Active Verb Detail Card */}
            {activeTermInfo && activeConfig && (
              <div className={`${RIBBON_DETAIL_CARD} ${activeConfig.border} ${activeConfig.bg}`}>
                <MeshOverlay opacity="opacity-[0.06]" />
                <div
                  className={`absolute -right-20 -top-20 w-80 h-80 bg-gradient-to-br ${activeConfig.gradient} opacity-10 blur-[80px] rounded-full pointer-events-none group-hover/hero:opacity-20 transition-opacity duration-700`}
                />

                <div className="relative z-10 flex flex-col gap-5">
                  <div className="flex flex-col md:flex-row gap-5 justify-between items-start md:items-center">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${activeConfig.gradient} border border-white/20 shadow-lg transform transition-transform duration-700 group-hover/hero:rotate-6`}
                      >
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className={RIBBON_DETAIL_TERM}>{activeTermInfo.term}</h4>
                          {/* The tier, said as the tier. This chip used to read
                              `Band {tier}` while the tray six inches to the
                              right read `Band Cap {getTierTargetBand(tier)}` —
                              provably the same integer, twice, under two
                              labels. The band statement stays in the tray,
                              where the caption below can explain it; the chip
                              names the rung of the ladder instead, with the
                              label derived rather than written out again. */}
                          <div
                            className={`${RIBBON_DETAIL_TIER_CHIP} ${activeConfig.bg} ${activeConfig.text} ${activeConfig.border}`}
                          >
                            Tier {activeTermInfo.tier} · {tierShortLabel(activeTermInfo.tier)}
                          </div>
                        </div>
                        <p className={RIBBON_DETAIL_DEFINITION}>{activeTermInfo.definition}</p>
                        <StrategyTip
                          tip={activeTermInfo.tip}
                          className="max-w-xl mt-2"
                          accentClass={RIBBON_DETAIL_TIP_ACCENT}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 self-stretch md:self-auto">
                      <div className={RIBBON_STAT_TRAY}>
                        <div className="flex flex-col items-center">
                          <span className={RIBBON_STAT_LABEL}>Marks</span>
                          <span className={`${RIBBON_STAT_VALUE} ${activeConfig.text}`}>
                            {activeTermInfo.markRange.join('-')}
                          </span>
                        </div>
                        <div className={RIBBON_STAT_DIVIDER} />
                        <div className="flex flex-col items-center">
                          <span className={RIBBON_STAT_LABEL}>Band Cap</span>
                          <span className={`${RIBBON_STAT_VALUE} ${activeConfig.text}`}>
                            {getTierTargetBand(activeTermInfo.tier)}
                          </span>
                        </div>
                        <div className={RIBBON_STAT_DIVIDER} />
                        <div
                          className="flex flex-col items-center"
                          title="Recommended writing time"
                        >
                          <span className={RIBBON_STAT_LABEL}>Time</span>
                          <span className={`${RIBBON_STAT_VALUE} ${activeConfig.text}`}>
                            {activeTermInfo.timeRange.join('-')}m
                          </span>
                        </div>
                        <div className={`${RIBBON_STAT_DIVIDER} hidden sm:block`} />
                        <div
                          className="hidden sm:flex flex-col items-center"
                          title="Expected syllabus terms"
                        >
                          <span className={RIBBON_STAT_LABEL}>Terms</span>
                          <span className={`${RIBBON_STAT_VALUE} ${activeConfig.text}`}>
                            {activeTermInfo.syllabusTerms.join('-')}
                          </span>
                        </div>
                      </div>

                      {/* "Band Cap" is the one label in this tray a student
                          will not already know, and its explanation used to
                          live in a `title` on a `<div>` with no `tabindex` —
                          unreachable by keyboard, absent on touch. It is a
                          line of text now. */}
                      {/* Plural rather than "A {TERM} question": eleven of the
                          thirty-eight verbs begin with a vowel, and "A
                          EXPLAIN question" is what that sentence renders for
                          every one of them. */}
                      <p className={RIBBON_STAT_CAPTION}>
                        {activeTermInfo.term} questions cap a response at Band{' '}
                        {getTierTargetBand(activeTermInfo.tier)}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tier Cards Scroll Area.

                The wrapper used to be a bare `relative` holding nothing. It
                holds the two edge fades now, which are the only thing telling
                a reader there is more strip to the right: `scrollbar-hide`
                took the scrollbar away and put nothing back, on six 260px
                cards that overflow at nearly every width.

                The scroller itself is named. Without a role a screen-reader
                user met 44 buttons in a flat list with nothing saying they are
                one horizontal ladder from tier 1 to tier 6. */}
            <div className="relative group/scroll">
              <div className={RIBBON_STRIP_FADE_LEFT} aria-hidden="true" />
              <div className={RIBBON_STRIP_FADE_RIGHT} aria-hidden="true" />
              <div
                className={RIBBON_STRIP}
                ref={scrollContainerRef}
                role="group"
                aria-label="Cognitive tier ladder, tier 1 to tier 6"
              >
                {sortedVerbsByGroup.map((group, index) => {
                  const isCurrentTier = activeTermInfo?.tier === group.tier;
                  const tierConfig = getTierScaleConfig(group.tier);

                  // Determine transform origin to keep edges aligned when scaling
                  const isFirst = index === 0;
                  const isLast = index === sortedVerbsByGroup.length - 1;
                  const transformOrigin = isFirst
                    ? 'origin-left'
                    : isLast
                      ? 'origin-right'
                      : 'origin-center';

                  // Dynamic Styling for Focus Effect
                  let cardStyle = 'scale-100 opacity-100'; // Default
                  if (activeTermInfo) {
                    if (isCurrentTier) {
                      cardStyle = `${RIBBON_TIER_CARD_CURRENT} ${transformOrigin}`;
                    } else {
                      // Added colored border specific to the tier for visual cue
                      cardStyle = `${RIBBON_TIER_CARD_DIMMED} ${tierConfig.border} z-0 ${transformOrigin}`;
                    }
                  }

                  return (
                    <div
                      key={group.tier}
                      ref={(el) => {
                        tierRefs.current[index] = el;
                      }}
                      className={`
                      ${RIBBON_TIER_CARD}
                      ${
                        isCurrentTier
                          ? `${tierConfig.border} ${tierConfig.bg} light:bg-white`
                          : RIBBON_TIER_CARD_IDLE
                      }
                      ${cardStyle}
                    `}
                    >
                      {isCurrentTier && (
                        <div
                          className={`absolute inset-0 opacity-10 bg-gradient-to-br ${tierConfig.gradient} pointer-events-none`}
                        />
                      )}

                      {/* Add a faint glow of the tier color even when inactive to serve as visual cue */}
                      {!isCurrentTier && (
                        <div
                          className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${tierConfig.gradient} pointer-events-none`}
                        />
                      )}

                      <MeshOverlay opacity={isCurrentTier ? 'opacity-[0.06]' : 'opacity-[0.02]'} />

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
                        className={`${RIBBON_TIER_HEADER} ${isCurrentTier ? `bg-gradient-to-r ${tierConfig.gradient} border-white/10 ${tierConfig.solidText}` : `${tierConfig.bg} border-white/5 light:border-slate-200`}`}
                      >
                        <div className="text-4xl filter drop-shadow-lg transform transition-transform duration-500 group-hover/card:scale-110">
                          {group.emoji}
                        </div>
                        <div className="min-w-0">
                          {/* No opacity on either branch. Through `opacity-60`
                              — on a card that is itself dimmed to 90% — the
                              tier's own `-900` text measured 2.97:1 on tier 6
                              and worse below it, and there was no darker step
                              in the shared config to reach for. Ten pixels
                              against the title's fourteen is what makes an
                              eyebrow read as one. */}
                          <span
                            className={`${RIBBON_TIER_HEADER_LABEL} ${isCurrentTier ? '' : tierConfig.text}`}
                          >
                            Band {group.maxBand} ceiling
                          </span>
                          <h4
                            className={`${RIBBON_TIER_HEADER_TITLE} ${isCurrentTier ? tierConfig.solidText : tierConfig.text}`}
                          >
                            {group.title}
                          </h4>
                        </div>
                      </button>

                      {/* What this cognitive level actually asks of the writer. */}
                      <p
                        className={`${RIBBON_TIER_SUBTITLE} ${isCurrentTier ? RIBBON_TIER_SUBTITLE_CURRENT : RIBBON_TIER_SUBTITLE_IDLE}`}
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
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cognitive Timeline Footer */}
          <div className="relative z-20">
            <div className={dividerClass} />
          </div>
          <div className="py-4 relative z-20 transition-colors duration-500">
            {/* The cue line — what the spectrum says, in words.

                It replaced four hand-written labels (`Basic Recall`, `Explain
                & Compare`, `Analyse & Apply`, `Evaluate & Create`) which were
                a fifth copy of a vocabulary this component already derives
                everywhere else. This comment used to call them SPAN labels and
                say they named spans rather than tiers; that was wrong, and it
                is the reason nobody could see how to derive them. `Explain &
                Compare` and `Analyse & Apply` are byte-identical to
                `TIER_GROUPS[2].title` and `TIER_GROUPS[3].title`; the other two
                are paraphrases of `TIER_GROUPS[0].title` and
                `TIER_GROUPS[5].title`. The row was four TIER titles — tiers 1,
                3, 4 and 6, the floor, the two sides of the Deep Learning
                Threshold and the ceiling — with tiers 2 and 5 dropped, and
                `justify-between` put none of them over the tier it named.

                They are back, derived, as the scale rail above the track: the
                two SPANS those four rungs bound, which is the only partition of
                the six tiers this app's own logic supports.

                Every fragment here is sourced: the tier's own title and
                subtitle, `getTierTargetBand`, `getBandName`. "Band Cap" rather
                than "ceiling" because that is the wording the ribbon already
                uses for this number, in the stat tray above and in
                `projectDocs/commandVerbs.md`, which is the record of what a
                student is told about a command verb.

                `role="status"`, which is polite, not `aria-live="assertive"`:
                changing question is ordinary navigation, and assertive
                interrupts a student mid-sentence. Rendered unconditionally,
                including the no-verb case, because a live region has to exist
                before it can change — and the no-verb string names no tier, so
                the component still says nothing about a verb it does not
                recognise.

                The live region is the LEDE ONLY — the tier and its band cap
                — and the tail sits outside it, in the same sentence and the
                same visible line. A `status` region announces its whole
                content on every change, and the lede is the part that actually
                changed and the part a reader needs: "Tier 4 · Analyse & Apply ·
                Band Cap 4 · Sound".

                That tail used to be the tier's full prose subtitle, 44–96
                characters of elaboration, and the comment here claimed the cue
                held "the only copy of it while the tier strip above is shut".
                That was never true. The strip has no shut state of its own: the
                footer and the strip are siblings under the same
                `overflow-hidden` wrapper inside the same `inert`-gated panel,
                so `RIBBON_TIER_SUBTITLE` renders `group.subtitle` for every
                tier whenever this line is on screen at all. Nothing reachable
                was lost by deleting the footer's copy.

                What replaces it is structure rather than prose: which side of
                the Deep Learning Threshold the reader's tier falls on, in 32
                characters, pointing at the chip on the bar 20px below. It stays
                outside the live region for the same reason the subtitle did —
                it is the same string for three tiers running, and a `status`
                re-announces everything it contains. */}
            <p className={RIBBON_TIMELINE_CUE}>
              <span role="status">
                {activeTermInfo && activeConfig ? (
                  <>
                    <span className={`${RIBBON_TIMELINE_CUE_TIER} ${activeConfig.text}`}>
                      Tier {activeTermInfo.tier} · {activeGroup?.title}
                    </span>
                    {' · '}
                    <span className={RIBBON_TIMELINE_CUE_BAND}>
                      Band Cap {getTierTargetBand(activeTermInfo.tier)} ·{' '}
                      {getBandName(getTierTargetBand(activeTermInfo.tier))}
                    </span>
                  </>
                ) : (
                  'Choose a command verb to light the spectrum.'
                )}
              </span>
              {activeTermInfo && (
                <span className={RIBBON_TIMELINE_CUE_SIDE}>
                  {' — '}
                  {activeTermInfo.tier > DEEP_LEARNING_TIER ? 'Above' : 'Below'} the{' '}
                  {THRESHOLD_LABEL}
                </span>
              )}
            </p>

            {/* The spectrum.

                Two layers of the same gradient: the whole journey at low
                opacity, and the same thing at full strength clipped to the
                reader's tier. Clipped with `clip-path: inset()` and not sized
                with `width` — a percentage width rescales a gradient into that
                width, so at tier 3 all six colours would be crushed into half
                a bar and every colour would move as the tier changed.

                The leading edge and the ignition flare sit OUTSIDE the track,
                because the track has to clip the spectrum (`overflow-hidden`)
                and a box-shadow or a bloom is the one thing that must not be
                clipped. */}
            <div className="relative mb-4">
              {/* The scale rail.

                  The arc four hand-written labels used to draw — `Basic
                  Recall`, `Explain & Compare`, `Analyse & Apply`, `Evaluate &
                  Create` — derived this time. Those four were not span labels:
                  two were byte-identical to a `TIER_GROUPS` title and two were
                  paraphrases of one, so the row was four TIER titles (1, 3, 4,
                  6) with two tiers dropped, laid out by `justify-between` so
                  none of them sat over the tier it named.

                  Tiers 1, 3, 4 and 6 are the floor, the two sides of the Deep
                  Learning Threshold, and the ceiling. That intent survives here
                  as the two SPANS those rungs bound, which is the only
                  partition of the six tiers the app's own logic supports: the
                  3/4 boundary is where `getBandForMark` stops being able to
                  return Band 4, and it is the Verb Gate's cap.

                  Naming the tiers again, one per rung, is what the dot row
                  below already does from `tierShortLabel`. This names the two
                  halves.

                  An en dash and not an arrow: `tests/e2e/support/contrast.ts`
                  skips every node inside `[aria-hidden="true"]`, so an arrow
                  glyph would want a hide that quietly takes this whole block of
                  text out of the light-theme audit. A dash reads as a range and
                  needs no hiding.

                  The full titles arrive at `xl`, not at `lg`. Measured in
                  Chromium: the right-hand caption is 441px at full length, and
                  at 1024px it starts 51px INSIDE the threshold chip — the chip
                  ate "ANALYS" and the rail read as a fragment. The three rungs
                  the ladder actually has are `sm` short labels (131px), `md`
                  short labels plus the band caps (245px, 21px of air at 768),
                  and `xl` full titles plus the band caps (359/441px, 155px and
                  76px of air at 1280). */}
              <div className={RIBBON_SPECTRUM_SCALE_RAIL}>
                <span className={RIBBON_SPECTRUM_SCALE_SPAN}>
                  <span className="xl:hidden">
                    {tierShortLabel(1)} – {tierShortLabel(DEEP_LEARNING_TIER)}
                  </span>
                  <span className="hidden xl:inline">
                    {tierTitle(1)} – {tierTitle(DEEP_LEARNING_TIER)}
                  </span>
                  <span
                    className={`${RIBBON_SPECTRUM_SCALE_BAND} ${getTierScaleConfig(DEEP_LEARNING_TIER).text}`}
                  >
                    {' · '}Band Caps {getTierTargetBand(1)}–{getTierTargetBand(DEEP_LEARNING_TIER)}
                  </span>
                </span>

                <span className={RIBBON_SPECTRUM_SCALE_SPAN}>
                  <span className="xl:hidden">
                    {tierShortLabel(DEEP_LEARNING_TIER + 1)} – {tierShortLabel(TIER_STEPS.length)}
                  </span>
                  <span className="hidden xl:inline">
                    {tierTitle(DEEP_LEARNING_TIER + 1)} – {tierTitle(TIER_STEPS.length)}
                  </span>
                  <span
                    className={`${RIBBON_SPECTRUM_SCALE_BAND} ${getTierScaleConfig(DEEP_LEARNING_TIER + 1).text}`}
                  >
                    {' · '}Band Caps {getTierTargetBand(DEEP_LEARNING_TIER + 1)}–
                    {getTierTargetBand(TIER_STEPS.length)}
                  </span>
                </span>
              </div>

              <div className={RIBBON_TIMELINE_TRACK}>
                <div
                  aria-hidden="true"
                  className={RIBBON_SPECTRUM_DORMANT}
                  style={{ backgroundImage: spectrum }}
                />
                <div
                  aria-hidden="true"
                  className={RIBBON_SPECTRUM_LIT}
                  style={{
                    backgroundImage: spectrum,
                    clipPath: `inset(0 ${pct(100 - litPercent)} 0 0)`,
                  }}
                />

                {/* The five boundaries between six tiers, in the page's own
                    background colour so they read as gaps cut into the
                    spectrum.

                    Four hairlines of 2px and one SLOT of 8px at the 3/4
                    boundary. The spectrum runs continuously through four
                    boundaries and is cut at the fifth, which is "a step up in
                    kind, not degree" said in the one language a bar has. The
                    dashed rule below descends through the middle of the slot,
                    so the rule and the break read as one object — a gate.

                    Side effect, and the intended one: at tier 3 the leading
                    edge is at 50%, so the playhead comes to rest INSIDE the
                    slot. It stops at the gate. */}
                {[1, 2, 3, 4, 5].map((boundary) => (
                  <div
                    key={boundary}
                    aria-hidden="true"
                    className={`${RIBBON_SPECTRUM_BOUNDARY} ${boundary === DEEP_LEARNING_TIER ? 'w-2' : 'w-0.5'}`}
                    style={{ left: pct((boundary / 6) * 100) }}
                  />
                ))}
              </div>

              {activeTermInfo && (
                <>
                  {/* The band just reached, igniting. `key` on the tier so
                      React remounts it and the one-shot replays on every
                      change — no rAF, no `element.animate`, so the global
                      reduced-motion block in index.css genuinely disables it,
                      and its final frame is `opacity: 0` so a reader who has
                      asked for no motion is left with nothing burned in. */}
                  <div
                    key={activeTermInfo.tier}
                    aria-hidden="true"
                    className={`${RIBBON_SPECTRUM_IGNITION} animate-tier-ignite`}
                    style={{
                      left: pct(bandStart(activeTermInfo.tier)),
                      width: pct(BAND_WIDTH),
                      backgroundColor: getBandHex(activeTermInfo.tier),
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className={RIBBON_SPECTRUM_EDGE}
                    style={{
                      left: pct(litPercent),
                      boxShadow: `0 0 10px 2px ${getBandHex(activeTermInfo.tier)}66`,
                    }}
                  />
                </>
              )}
            </div>

            {/* The tier ladder along the footer.

                These six steps used to be a hand-written array — Remember,
                Describe, Explain, Analyse, Argue, Evaluate — which is a FOURTH
                copy of the tier labels and had drifted at two of the six:
                tier 2 is Define, tier 5 is Discuss. `tierShortLabel`'s doc
                comment is a written record of exactly this happening twice
                before in the admin components, where each wrong label named
                another tier that also appeared in the same table, so the
                mistake read as self-consistent. The strip beside this one is
                already the tiers; iterating it is one fewer place to drift. */}
            <div className="relative h-10">
              {/* The threshold marker, between tier 3 (Explain & Compare) and
                  tier 4 (Analyse & Apply). It used to be commented as sitting
                  between "Tier 3 (Apply)" and "Tier 4 (Analyse)" — Apply is a
                  tier-4 verb.

                  Rendered ONCE, here, rather than inside the map on
                  `idx === 3`. It marks a tier boundary, not the fourth element
                  of an array: reorder `TIER_GROUPS` and the `idx` form moved
                  this rule to whichever tier landed fourth while the boundary
                  notch on the bar — keyed on `DEEP_LEARNING_TIER` — stayed
                  where it was, silently. Its `left` is now the same expression
                  the notch uses, so the rule and the slot cannot drift apart
                  either.

                  `border-slate-300/30` was effectively nothing on the light
                  page — a 30% slate hairline on near-white — so the one
                  annotation here that names something a student could not
                  deduce was invisible in half the app. The contrast suite walks
                  text nodes and cannot see a border, which is why it went
                  unreported. */}
              <div
                style={{ left: pct((DEEP_LEARNING_TIER / TIER_STEPS.length) * 100) }}
                className="absolute -translate-x-1/2 -top-11 bottom-0 w-px border-r-2 border-dashed border-slate-400 dark:border-white/25 z-0 flex flex-col items-center justify-start pointer-events-none"
              >
                <div className={RIBBON_TIMELINE_THRESHOLD_CHIP}>{THRESHOLD_LABEL}</div>
              </div>

              {sortedVerbsByGroup.map((group) => {
                const tier = group.tier;
                const label = tierShortLabel(tier);
                const isActive = activeTermInfo && activeTermInfo.tier >= tier;
                const isCurrent = activeTermInfo && activeTermInfo.tier === tier;
                const stepConfig = getTierScaleConfig(tier);

                return (
                  <button
                    key={tier}
                    type="button"
                    // "Highlight band n" was wrong twice over: the button
                    // selects the tier's first verb rather than highlighting
                    // anything, and what it selects is a tier, not a band.
                    aria-label={`Show tier ${tier} verbs — ${label}`}
                    // Absolutely placed at the centre of its own band, so a
                    // dot sits under the colour it names. They used to be
                    // laid out by `justify-between`, which put each dot
                    // wherever six label widths left it — and since five of
                    // the six labels are `hidden` below `sm`, the dots moved
                    // whenever the current tier changed.
                    style={{ left: pct(bandCentre(tier)) }}
                    className="absolute top-0 -translate-x-1/2 w-16 flex flex-col items-center gap-3 z-10 group/step cursor-pointer"
                    onClick={() => {
                      if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                    }}
                  >
                    <div
                      className={`
                                    ${RIBBON_TIMELINE_DOT}
                                    ${isActive ? `${stepConfig.solidBg} border-transparent scale-125` : 'bg-slate-300 dark:bg-slate-700 border-slate-400/40 dark:border-white/10'}
                                    ${isCurrent ? 'ring-4 ring-slate-900/10 dark:ring-white/20 scale-150 shadow-lg' : ''}
                                 `}
                    >
                      {/* This was `animate-ping`, which is `1s infinite`,
                            on a strip that is mounted for the whole session —
                            so it animated behind every student for as long as
                            they wrote. It is a one-shot now, keyed on the tier
                            so it replays when the question changes and then
                            stops.

                            Its own one-shot, though, not the spectrum's: the
                            band's flare stretches 2.4x vertically and not at
                            all horizontally, which is the shape of a bar
                            lighting up and the shape of a teardrop on a
                            circle. `dot-bloom` scales uniformly, at the same
                            900ms on the same curve, so the dot and its band
                            still ignite as one event. */}
                      {isCurrent && (
                        <span
                          key={activeTermInfo?.tier}
                          aria-hidden="true"
                          className={`${RIBBON_SPECTRUM_DOT_BLOOM} ${stepConfig.solidBg}`}
                        ></span>
                      )}
                    </div>
                    {/* On phones six tracked labels collide into one another, so
                        only the current step keeps its label below sm.

                        The five that are not current used to be `slate-500` at
                        `opacity-70`, which measured 2.66:1 on the page — the
                        largest single group of failures the contrast suite
                        found once it could see this component at all. */}
                    <span
                      className={`${RIBBON_TIMELINE_STEP_LABEL} ${isCurrent ? stepConfig.text : RIBBON_TIMELINE_STEP_LABEL_IDLE} ${edgeLabelNudge(tier)}`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom divider */}
      <div className={dividerClass} />
    </div>
  );
};

export default CommandVerbHierarchy;
