import React, { useMemo, useState, useEffect, useRef } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS, getTierTargetBand } from '../data/commandTerms';
import { ChevronDown, AlignLeft, Sparkles } from 'lucide-react';
import { getTierScaleConfig } from '../utils/renderUtils';
import StrategyTip from './StrategyTip';

interface CommandVerbHierarchyProps {
  currentVerb?: PromptVerb;
}

const MeshOverlay = ({ opacity = 'opacity-[0.03]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const COGNITIVE_STEPS = [
  { label: 'Remember', tier: 1 },
  { label: 'Describe', tier: 2 },
  { label: 'Explain', tier: 3 },
  { label: 'Analyse', tier: 4 },
  { label: 'Argue', tier: 5 },
  { label: 'Evaluate', tier: 6 },
];

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({ currentVerb }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeVerb, setActiveVerb] = useState<PromptVerb | undefined>(currentVerb);

  const tierRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // A new question re-opens the reference so its verb is explained — unless
  // the reader has folded the ribbon away, in which case it stays folded.
  // Before, a deliberate collapse was undone by the very next question, and
  // the only way to keep it shut was to re-collapse it every single time.
  const collapsedByUser = useRef(false);

  useEffect(() => {
    if (currentVerb) {
      setActiveVerb(currentVerb);
      if (!collapsedByUser.current) setIsOpen(true);
    }
  }, [currentVerb]);

  const toggleOpen = () =>
    setIsOpen((open) => {
      collapsedByUser.current = open;
      return !open;
    });

  const { sortedVerbsByGroup, activeTermInfo } = useMemo(() => {
    const allVerbs = Array.from(commandTerms.values());
    const current = activeVerb
      ? commandTerms.get(activeVerb)
      : currentVerb
        ? commandTerms.get(currentVerb)
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
    // jsdom (and very old browsers) have no Element.scrollTo — fall back to
    // the property, which is what scrollTo sets anyway.
    if (typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      strip.scrollLeft = target;
    }
  }, [activeTermInfo, isOpen]);

  // Colour the ribbon on the distinct tier-identity scale (Tier 1 red …
  // Tier 6 purple) so every level of the ladder reads as its own step — the
  // band-target mapping collapsed Tiers 5 and 6 into the same purple.
  const activeConfig = activeTermInfo ? getTierScaleConfig(activeTermInfo.tier) : null;

  const headerGradientClass = activeConfig
    ? `bg-gradient-to-r ${activeConfig.gradient}`
    : 'bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700';

  const headerTextClass = activeConfig ? 'text-white' : 'text-slate-700 dark:text-slate-200';
  const headerIconBg = activeConfig
    ? 'bg-white/20 border-white/30'
    : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600';

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
    <div className="clip-stable relative overflow-hidden transition-all duration-700 ease-out animate-fade-in">
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
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} the HSC command verb hierarchy reference`}
        className={`
            w-full px-0 py-3 sm:py-3.5 min-h-[60px] sm:min-h-[64px] flex items-center justify-between gap-3 relative z-10 overflow-hidden transition-all duration-500 group/header rounded-xl
            ${headerGradientClass} ${headerTextClass}
            ${isOpen ? '' : 'hover:brightness-105'}
        `}
      >
        <MeshOverlay opacity="opacity-10" />

        <div className="flex items-center gap-3 relative z-10 px-4 sm:px-5 min-w-0">
          <div
            className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border shadow-md group-hover/header:scale-110 transition-transform ${headerIconBg}`}
          >
            <AlignLeft className="w-5 h-5" />
          </div>
          <div className="text-left min-w-0">
            {/* Truncates rather than wraps: an ellipsis on a title the reader
                already knows costs nothing, a second line costs the lock. */}
            <h3 className="text-sm sm:text-base font-black tracking-tight leading-none truncate">
              HSC Command Verb Hierarchy
            </h3>
            <span className="block truncate text-[9px] font-black uppercase tracking-[0.2em] opacity-70">
              Reference • {sortedVerbsByGroup.length} Bands
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 relative z-10 px-4 sm:px-5 shrink-0">
          {activeTermInfo && (
            <div className="hidden sm:flex items-center gap-3 animate-fade-in">
              <span className="text-[10px] font-black opacity-60 uppercase tracking-widest whitespace-nowrap">
                Selected:
              </span>
              <div className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap bg-white/20 border border-white/30 backdrop-blur-md shadow-sm">
                {activeTermInfo.term}
              </div>
            </div>
          )}
          <div
            className={`w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center border border-white/10 transition-transform duration-500 ${isOpen ? 'rotate-180 bg-black/20 dark:bg-white/20' : ''}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      </button>

      {/* Collapsible Content */}
      <div
        className={`transition-all duration-700 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1600px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="py-4 space-y-4">
          {/* Active Verb Detail Card */}
          {activeTermInfo && activeConfig && (
            <div
              className={`clip-stable relative overflow-hidden rounded-2xl p-5 border ${activeConfig.border} ${activeConfig.bg} shadow-lg animate-fade-in-up transition-all duration-500 group/hero`}
            >
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
                        <h4 className="text-3xl font-black tracking-tighter text-white light:text-slate-900 uppercase italic leading-none">
                          {activeTermInfo.term}
                        </h4>
                        <div
                          className={`px-3 py-0.5 rounded-full border font-black text-[9px] uppercase tracking-widest shadow-sm ${activeConfig.bg} ${activeConfig.text} ${activeConfig.border}`}
                        >
                          Band {activeTermInfo.tier}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 max-w-xl leading-relaxed opacity-90">
                        {activeTermInfo.definition}
                      </p>
                      <StrategyTip
                        tip={activeTermInfo.tip}
                        className="max-w-xl mt-2"
                        accentClass="text-[rgb(var(--color-text-muted))] light:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-black/10 light:bg-slate-100 px-5 py-3 rounded-2xl border border-white/10 light:border-slate-300 backdrop-blur-md self-stretch md:self-auto justify-center shadow-inner flex-wrap">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-slate-500 light:text-slate-600 uppercase tracking-widest font-black mb-0.5">
                        Marks
                      </span>
                      <span className={`text-lg font-black ${activeConfig.text}`}>
                        {activeTermInfo.markRange.join('-')}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-black/10 light:bg-slate-300" />
                    <div
                      className="flex flex-col items-center"
                      title={`The cognitive demand of ${activeTermInfo.term} caps a response at Band ${getTierTargetBand(activeTermInfo.tier)}`}
                    >
                      <span className="text-[9px] text-slate-500 light:text-slate-600 uppercase tracking-widest font-black mb-0.5">
                        Band Cap
                      </span>
                      <span className={`text-lg font-black ${activeConfig.text}`}>
                        {getTierTargetBand(activeTermInfo.tier)}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-black/10 light:bg-slate-300" />
                    <div className="flex flex-col items-center" title="Recommended writing time">
                      <span className="text-[9px] text-slate-500 light:text-slate-600 uppercase tracking-widest font-black mb-0.5">
                        Time
                      </span>
                      <span className={`text-lg font-black ${activeConfig.text}`}>
                        {activeTermInfo.timeRange.join('-')}m
                      </span>
                    </div>
                    <div className="w-px h-8 bg-black/10 light:bg-slate-300 hidden sm:block" />
                    <div
                      className="hidden sm:flex flex-col items-center"
                      title="Expected syllabus terms"
                    >
                      <span className="text-[9px] text-slate-500 light:text-slate-600 uppercase tracking-widest font-black mb-0.5">
                        Terms
                      </span>
                      <span className={`text-lg font-black ${activeConfig.text}`}>
                        {activeTermInfo.syllabusTerms.join('-')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tier Cards Scroll Area */}
          <div className="relative group/scroll">
            <div
              className="flex overflow-x-auto gap-4 pb-4 pt-2 snap-x snap-mandatory scrollbar-hide"
              ref={scrollContainerRef}
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
                    cardStyle = `scale-110 z-20 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] opacity-100 ring-4 ring-slate-900/10 dark:ring-white/5 ${transformOrigin}`;
                  } else {
                    // Added colored border specific to the tier for visual cue
                    cardStyle = `scale-90 opacity-50 light:opacity-70 hover:opacity-100 hover:scale-95 border-2 ${tierConfig.border} z-0 ${transformOrigin}`;
                  }
                }

                return (
                  <div
                    key={group.tier}
                    ref={(el) => {
                      tierRefs.current[index] = el;
                    }}
                    className={`
                      clip-stable flex-shrink-0 w-[260px] min-h-[256px] snap-center relative overflow-hidden rounded-2xl border transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col group/card
                      ${
                        isCurrentTier
                          ? `${tierConfig.border} ${tierConfig.bg} light:bg-white`
                          : `bg-white/[0.03] light:bg-white border-white/5 light:border-slate-300 light:shadow-sm`
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
                      header, which has nothing interactive in it. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                      }}
                      aria-pressed={isCurrentTier}
                      title={`Show the ${group.title} verbs — up to Band ${group.maxBand}`}
                      className={`w-full text-left px-6 py-4 border-b relative flex items-center gap-4 flex-shrink-0 cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${isCurrentTier ? `bg-gradient-to-r ${tierConfig.gradient} border-white/10 text-white` : `${tierConfig.bg} border-white/5 light:border-slate-200`}`}
                    >
                      <div className="text-4xl filter drop-shadow-lg transform transition-transform duration-500 group-hover/card:scale-110">
                        {group.emoji}
                      </div>
                      <div className="min-w-0">
                        <span
                          className={`text-[10px] font-black uppercase tracking-[0.2em] block mb-0.5 truncate ${isCurrentTier ? 'opacity-70' : tierConfig.text + ' opacity-60'}`}
                        >
                          Band {group.maxBand} ceiling
                        </span>
                        <h4
                          className={`text-sm font-black truncate tracking-tight ${isCurrentTier ? 'text-white' : tierConfig.text}`}
                        >
                          {group.title}
                        </h4>
                      </div>
                    </button>

                    {/* What this cognitive level actually asks of the writer. */}
                    <p
                      className={`px-6 pt-3 text-[11px] font-medium leading-snug relative z-10 ${isCurrentTier ? 'text-[rgb(var(--color-text-primary))] light:text-slate-700' : 'text-[rgb(var(--color-text-muted))] light:text-slate-500'}`}
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
                          return (
                            <button
                              key={verb.term}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveVerb(verb.term);
                              }}
                              className={`
                                            px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all duration-300
                                            ${
                                              isSelected
                                                ? `${tierConfig.solidBg} text-white shadow-lg scale-105 border-transparent`
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
          <div className="flex justify-between items-end gap-4 mb-3 px-1">
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] whitespace-nowrap">
              Basic Recall
            </span>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] hidden sm:block">
              Explain & Compare
            </span>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] hidden sm:block">
              Analyse & Apply
            </span>
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest sm:tracking-[0.2em] whitespace-nowrap">
              Evaluate & Create
            </span>
          </div>

          {/* Progress Bar Track */}
          <div className="relative h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden mb-4">
            {/* Background Ticks for visual measurement */}
            {/* Measurement ticks. White-on-white in light mode meant the
                track had no gradations at all there, so the same bar read as a
                measured scale in dark and a plain pill in light. */}
            <div className="absolute inset-0 flex justify-between px-[16%]">
              <div className="w-px h-full bg-slate-400/50 dark:bg-white/20" />
              <div className="w-px h-full bg-slate-400/50 dark:bg-white/20" />
              <div className="w-px h-full bg-slate-400/50 dark:bg-white/20" />
              <div className="w-px h-full bg-slate-400/50 dark:bg-white/20" />
            </div>

            <div
              className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out bg-gradient-to-r ${activeConfig ? activeConfig.gradient : 'from-slate-400 to-slate-500'}`}
              style={{ width: `${activeTermInfo ? (activeTermInfo.tier / 6) * 100 : 0}%` }}
            />
          </div>

          <div className="flex justify-between items-center relative">
            {COGNITIVE_STEPS.map((step, idx) => {
              const isActive = activeTermInfo && activeTermInfo.tier >= step.tier;
              const isCurrent = activeTermInfo && activeTermInfo.tier === step.tier;
              const stepConfig = getTierScaleConfig(step.tier);

              return (
                <React.Fragment key={step.tier}>
                  {/* Visual Cut-off / Threshold Marker between Tier 3 (Apply) and Tier 4 (Analyse) */}
                  {idx === 3 && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-8 bottom-0 w-px border-r-2 border-dashed border-slate-300/30 dark:border-white/10 z-0 flex flex-col items-center justify-start pointer-events-none">
                      <div className="hidden sm:block bg-[rgb(var(--color-bg-surface))] text-[8px] font-black uppercase tracking-widest text-slate-400 px-2 py-0.5 rounded-full border border-slate-300 dark:border-white/10 shadow-sm whitespace-nowrap mb-2 transform -translate-y-1/2">
                        Deep Learning Threshold
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    aria-label={`Highlight band ${step.tier} — ${step.label}`}
                    className="flex flex-col items-center gap-3 relative z-10 group/step cursor-pointer"
                    onClick={() => {
                      const group = sortedVerbsByGroup.find((g) => g.tier === step.tier);
                      if (group && group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                    }}
                  >
                    <div
                      className={`
                                    w-4 h-4 rounded-full border-2 transition-all duration-500 relative
                                    ${isActive ? `${stepConfig.solidBg} border-transparent scale-125` : 'bg-slate-300 dark:bg-slate-700 border-slate-400/40 dark:border-white/10'}
                                    ${isCurrent ? 'ring-4 ring-slate-900/10 dark:ring-white/20 scale-150 shadow-lg' : ''}
                                 `}
                    >
                      {/* Pulsing Animation for Current Step */}
                      {isCurrent && (
                        <span
                          className={`absolute inset-0 rounded-full animate-ping opacity-75 ${stepConfig.solidBg}`}
                        ></span>
                      )}
                    </div>
                    {/* On phones six tracked labels collide into one another, so
                        only the current step keeps its label below sm. */}
                    <span
                      className={`
                                    text-[9px] font-bold uppercase tracking-wider sm:tracking-widest transition-all duration-300
                                    ${isCurrent ? stepConfig.text : 'hidden sm:block text-slate-500 dark:text-slate-400 opacity-70 group-hover/step:opacity-100'}
                                 `}
                    >
                      {step.label}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom divider */}
      <div className={dividerClass} />
    </div>
  );
};

export default CommandVerbHierarchy;
