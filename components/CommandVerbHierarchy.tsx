
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS } from '../data/commandTerms';
import { ChevronDown, Layers, Sparkles } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface CommandVerbHierarchyProps {
  currentVerb?: PromptVerb;
}

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({ currentVerb }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [hasAutoScrolled, setHasAutoScrolled] = useState(false);
  
  const tierRefs = useRef<HTMLDivElement[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const { sortedVerbsByGroup, currentTermInfo } = useMemo(() => {
    const allVerbs = Array.from(commandTerms.values());
    const current = currentVerb ? commandTerms.get(currentVerb) : null;
    
    const groups = TIER_GROUPS.map(group => ({
      ...group,
      verbs: allVerbs.filter(verb => verb.tier === group.tier)
        .sort((a, b) => a.term.localeCompare(b.term)),
    }));

    return { sortedVerbsByGroup: groups, currentTermInfo: current };
  }, [currentVerb]);

  // Auto-scroll to current tier
  useEffect(() => {
    if (currentTermInfo && !hasAutoScrolled && scrollContainerRef.current) {
      const currentTierIndex = currentTermInfo.tier - 1;
      const tierElement = tierRefs.current[currentTierIndex];
      const container = scrollContainerRef.current;
      
      if (tierElement && container) {
        setTimeout(() => {
          const elementLeft = tierElement.offsetLeft;
          const elementWidth = tierElement.offsetWidth;
          const containerWidth = container.offsetWidth;
          
          // Calculate center position
          const scrollLeft = elementLeft - (containerWidth / 2) + (elementWidth / 2);
          
          container.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
          });
          setHasAutoScrolled(true);
        }, 300);
      }
    }
  }, [currentTermInfo, hasAutoScrolled, isOpen]);

  // Reset auto-scroll when verb changes
  useEffect(() => {
      setHasAutoScrolled(false);
      if(!isOpen && currentVerb) setIsOpen(true);
  }, [currentVerb]);

  const currentTierConfig = currentTermInfo ? getBandConfig(currentTermInfo.tier) : getBandConfig(1);

  // Closed State Spectrum Bar
  const SpectrumSummary = () => (
      <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-600 hidden sm:block">
            Levels 1-6: Retrieving to Evaluating
          </div>
          <div className="flex items-center h-2 w-24 rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-300 ml-2">
             {[1,2,3,4,5,6].map(tier => {
                 const config = getBandConfig(tier);
                 return (
                    <div key={tier} className={`flex-1 h-full ${config.solidBg}`} title={`Tier ${tier}`} />
                 )
             })}
          </div>
      </div>
  );

  return (
    <div className={`
      rounded-2xl overflow-hidden
      border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300
      bg-[rgb(var(--color-bg-surface))]/60 light:bg-white backdrop-blur-md
      shadow-lg light:shadow-xl transition-all duration-300 ease-out
      hover:border-[rgb(var(--color-border-secondary))]/30 light:hover:border-slate-400
      animate-fade-in hover-lift
    `}>
      {/* Header Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full p-4 flex items-center justify-between
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50
          hover:bg-[rgb(var(--color-bg-surface-light))]/30 light:hover:bg-slate-50
        `}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
            bg-gradient-to-br from-[rgb(var(--color-bg-surface-elevated))] to-[rgb(var(--color-bg-surface))] light:from-slate-100 light:to-white shadow-inner border border-[rgb(var(--color-border-secondary))] light:border-slate-200
            ${currentTermInfo ? `ring-1 ring-[rgb(var(--color-border-accent))]` : ''}
          `} style={currentTermInfo ? { background: `linear-gradient(135deg, ${currentTierConfig.solidBg.replace('bg-', '')}33, transparent)` } : {}}>
            <Layers className={`w-5 h-5 ${currentTermInfo ? 'text-white light:text-slate-900' : 'text-gray-400 light:text-slate-400'}`} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
              Cognitive Verb Hierarchy
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
                {currentTermInfo ? (
                     <span className={`text-xs font-medium ${currentTierConfig.text} flex items-center gap-1.5`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${currentTierConfig.solidBg}`}></span>
                        Active: {currentVerb}
                     </span>
                ) : (
                    !isOpen ? <SpectrumSummary /> : <span className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">Explore NESA Verbs</span>
                )}
            </div>
          </div>
        </div>
        <ChevronDown className={`
          w-5 h-5 text-[rgb(var(--color-text-muted))] light:text-slate-400
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'rotate-180' : ''}
        `} />
      </button>

      {/* Expanded Content */}
      <div className={`
        transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden
        ${isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="p-4 pt-0 space-y-5">
          
          {/* Active Verb Hero Card */}
          {currentTermInfo && (
            <div className={`
              relative overflow-hidden rounded-xl p-5
              border-2 ${currentTierConfig.border}
              ${currentTierConfig.bg}
              shadow-lg ${currentTierConfig.glow}
              animate-fade-in-up-sm
              transition-transform duration-300 hover:scale-[1.01]
            `}>
               {/* Decorative Background Blur */}
               <div className={`absolute -right-20 -top-20 w-64 h-64 bg-gradient-to-br ${currentTierConfig.gradient} opacity-10 blur-[60px] rounded-full pointer-events-none`} />

              <div className="relative z-10 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-6 items-center">
                {/* Icon Column - Use Solid Color to prevent white-out */}
                <div className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
                  ${currentTierConfig.solidBg} border ${currentTierConfig.border}
                  shadow-lg
                `}>
                  <Sparkles className={`w-7 h-7 text-white`} />
                </div>
                
                {/* Content Column */}
                <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <h4 className={`text-2xl font-black tracking-tight text-white light:text-slate-900`}>
                            {currentVerb}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${currentTierConfig.border} ${currentTierConfig.iconBg} ${currentTierConfig.text} uppercase tracking-widest light:shadow-sm`}>
                            Tier {currentTermInfo.tier}
                        </span>
                    </div>
                    
                    <p className="text-sm text-[rgb(var(--color-text-primary))] light:text-slate-700 font-medium leading-relaxed opacity-90">
                        {currentTermInfo.definition}
                    </p>
                </div>

                {/* Stats Column */}
                <div className="flex md:flex-col gap-4 md:gap-3 md:border-l md:pl-6 border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300/50 md:text-right md:items-end">
                    <div>
                        <span className="text-[9px] text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider font-bold block mb-0.5">Mark Range</span>
                        <span className={`text-base font-mono font-black ${currentTierConfig.text}`}>{currentTermInfo.markRange.join('-')}</span>
                    </div>
                     <div>
                        <span className="text-[9px] text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider font-bold block mb-0.5">Target Band</span>
                        <span className={`text-base font-mono font-black ${currentTierConfig.text}`}>{currentTermInfo.targetBands}</span>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* Horizontal Scroll Tier List - Compact Cards with Scrollable Content */}
          <div className="relative group/scroll -mx-2">
             {/* Fade masks for scroll indication */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[rgb(var(--color-bg-surface-elevated))] to-transparent z-10 pointer-events-none sm:hidden"></div>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[rgb(var(--color-bg-surface-elevated))] to-transparent z-10 pointer-events-none sm:hidden"></div>

            <div 
                className="flex overflow-x-auto gap-3 pb-4 pt-2 snap-x snap-mandatory px-2 scrollbar-hide"
                ref={scrollContainerRef}
            >
              {sortedVerbsByGroup.map((group, index) => {
                const isCurrentTier = currentTermInfo?.tier === group.tier;
                const tierConfig = getBandConfig(group.tier);

                return (
                  <div 
                    key={group.tier}
                    ref={el => { if (el) tierRefs.current[index] = el; }}
                    className={`
                      flex-shrink-0 w-[260px] h-[200px] snap-center relative overflow-hidden
                      rounded-xl border-2 transition-all duration-300 ease-out
                      flex flex-col hover-scale
                      ${isCurrentTier 
                        ? `${tierConfig.bg} ${tierConfig.border} shadow-lg scale-[1.02] ring-1 ${tierConfig.ring}` 
                        : `bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 hover:bg-[rgb(var(--color-bg-surface-inset))]/50 light:hover:bg-slate-100 hover:border-white/20 light:hover:border-slate-300 hover:shadow-md`
                      }
                    `}
                  >
                    {/* Tier Header - Compact fixed height */}
                    <div className={`
                        px-4 py-3 border-b relative flex items-center gap-3 flex-shrink-0 h-[70px]
                        ${isCurrentTier ? `${tierConfig.border} border-opacity-30` : `border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200`}
                    `}>
                        <div className="text-3xl select-none filter drop-shadow-md transform transition-transform hover:scale-110 cursor-default flex-shrink-0">
                            {group.emoji}
                        </div>

                        <div className="min-w-0">
                            <div className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${tierConfig.text}`}>
                                Tier {group.tier}
                            </div>
                            <div className={`text-sm font-bold leading-tight truncate ${isCurrentTier ? 'text-white light:text-slate-900' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600'}`} title={group.title}>
                                {group.title}
                            </div>
                        </div>
                    </div>

                    {/* Verb List - Vertically Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-white">
                        <div className="flex flex-wrap gap-1.5 content-start">
                            {group.verbs.map(verb => {
                                const isSelected = verb.term === currentVerb;
                                return (
                                    <div 
                                        key={verb.term}
                                        className={`
                                            px-2 py-1 rounded-md text-[10px] font-bold border transition-all duration-200 select-none cursor-default
                                            ${isSelected 
                                                ? `bg-gradient-to-r ${tierConfig.gradient} text-white border-transparent shadow-sm` 
                                                : `bg-[rgb(var(--color-bg-surface))]/50 light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 hover:border-[rgb(var(--color-border-primary))]`
                                            }
                                        `}
                                        title={verb.definition}
                                    >
                                        {verb.term}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Subtle Footer Accent */}
                    <div className={`h-1 w-full bg-gradient-to-r ${tierConfig.gradient} opacity-30 flex-shrink-0`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandVerbHierarchy;
