
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { PromptVerb } from '../types';
import { commandTerms, TIER_GROUPS } from '../data/commandTerms';
import { ChevronDown, AlignLeft, Sparkles, MoveRight, ArrowRight, BrainCircuit, Lock } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface CommandVerbHierarchyProps {
  currentVerb?: PromptVerb;
}

const MeshOverlay = ({ opacity = "opacity-[0.03]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

const COGNITIVE_STEPS = [
    { label: "Recall", tier: 1 },
    { label: "Describe", tier: 2 },
    { label: "Apply", tier: 3 },
    { label: "Analyse", tier: 4 },
    { label: "Synthesise", tier: 5 },
    { label: "Evaluate", tier: 6 }
];

const CommandVerbHierarchy: React.FC<CommandVerbHierarchyProps> = ({ currentVerb }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeVerb, setActiveVerb] = useState<PromptVerb | undefined>(currentVerb);
  
  const tierRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
      if (currentVerb) {
        setActiveVerb(currentVerb);
        if (!isOpen) setIsOpen(true);
      }
  }, [currentVerb]);

  const { sortedVerbsByGroup, activeTermInfo } = useMemo(() => {
    const allVerbs = Array.from(commandTerms.values());
    const current = activeVerb ? commandTerms.get(activeVerb) : (currentVerb ? commandTerms.get(currentVerb) : null);
    
    const groups = TIER_GROUPS.map(group => ({
      ...group,
      verbs: allVerbs.filter(verb => verb.tier === group.tier)
        .sort((a, b) => a.term.localeCompare(b.term)),
    }));

    return { sortedVerbsByGroup: groups, activeTermInfo: current };
  }, [activeVerb, currentVerb]);

  // Enhanced Auto-Scroll: Aligns cards based on position (Start for T1, End for T6, Center for others)
  useEffect(() => {
    if (activeTermInfo && tierRefs.current[activeTermInfo.tier - 1]) {
        const activeCard = tierRefs.current[activeTermInfo.tier - 1];
        if (activeCard) {
            let alignment: ScrollLogicalPosition = 'center';
            if (activeTermInfo.tier === 1) alignment = 'start';
            else if (activeTermInfo.tier === 6) alignment = 'end';

            activeCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: alignment
            });
        }
    }
  }, [activeTermInfo, isOpen]);

  const activeConfig = activeTermInfo ? getBandConfig(activeTermInfo.tier) : null;
  
  const containerBorderClass = activeConfig 
    ? activeConfig.border 
    : 'border-slate-300 dark:border-slate-700';
    
  const headerGradientClass = activeConfig
    ? `bg-gradient-to-r ${activeConfig.gradient}`
    : 'bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700';

  const headerTextClass = activeConfig ? 'text-white' : 'text-slate-700 dark:text-slate-200';
  const headerIconBg = activeConfig ? 'bg-white/20 border-white/30' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600';

  return (
    <div className={`relative overflow-hidden rounded-[32px] border-4 ${containerBorderClass} bg-[rgb(var(--color-bg-surface))]/60 light:bg-white/90 backdrop-blur-3xl shadow-xl transition-all duration-700 ease-out animate-fade-in`}>
      
      {/* Header Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
            w-full px-8 py-5 flex items-center justify-between relative z-10 overflow-hidden min-h-[90px] transition-all duration-500 group/header
            ${headerGradientClass} ${headerTextClass}
            ${isOpen ? '' : 'hover:brightness-105'}
        `}
      >
        <MeshOverlay opacity="opacity-10" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-lg group-hover/header:scale-110 transition-transform ${headerIconBg}`}>
            <AlignLeft className="w-6 h-6" />
          </div>
          <div className="text-left">
            <h3 className="text-lg md:text-xl font-black tracking-tight leading-none flex items-center gap-2">
                HSC Command Verb Hierarchy
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                    Reference • {sortedVerbsByGroup.length} Levels
                 </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 relative z-10">
            {activeTermInfo && (
                <div className="hidden sm:flex items-center gap-3 animate-fade-in">
                    <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">Selected:</span>
                    <div className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/20 border border-white/30 backdrop-blur-md shadow-sm">
                        {activeVerb}
                    </div>
                </div>
            )}
            <div className={`w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center border border-white/10 transition-transform duration-500 ${isOpen ? 'rotate-180 bg-black/20 dark:bg-white/20' : ''}`}>
                 <ChevronDown className="w-4 h-4" />
            </div>
        </div>
      </button>

      {/* Collapsible Content */}
      <div className={`transition-all duration-700 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="p-6 space-y-5">
          
          {/* Active Verb Detail Card */}
          {activeTermInfo && activeConfig && (
            <div className={`relative overflow-hidden rounded-[32px] p-6 border-2 ${activeConfig.border} ${activeConfig.bg} shadow-2xl animate-fade-in-up transition-all duration-500 group/hero`}>
               <MeshOverlay opacity="opacity-[0.06]" />
               <div className={`absolute -right-20 -top-20 w-80 h-80 bg-gradient-to-br ${activeConfig.gradient} opacity-10 blur-[80px] rounded-full pointer-events-none group-hover/hero:opacity-20 transition-opacity duration-700`} />

              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                    <div className="flex items-center gap-5">
                        <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${activeConfig.gradient} border border-white/20 shadow-2xl transform transition-transform duration-700 group-hover/hero:rotate-6`}>
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <div>
                             <div className="flex items-center gap-3 mb-1">
                                <h4 className="text-3xl font-black tracking-tighter text-white light:text-slate-900 uppercase italic leading-none">{activeVerb}</h4>
                                <div className={`px-3 py-0.5 rounded-full border font-black text-[9px] uppercase tracking-widest shadow-sm ${activeConfig.bg} ${activeConfig.text} ${activeConfig.border}`}>
                                    Level {activeTermInfo.tier}
                                </div>
                             </div>
                             <p className="text-sm font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 max-w-xl leading-relaxed opacity-90">{activeTermInfo.definition}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 bg-black/10 light:bg-white/60 px-5 py-3 rounded-2xl border border-white/10 backdrop-blur-md self-stretch md:self-auto justify-center shadow-inner">
                         <div className="flex flex-col items-center">
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black mb-0.5">Mark Range</span>
                            <span className={`text-lg font-black ${activeConfig.text}`}>{activeTermInfo.markRange.join('-')}</span>
                        </div>
                        <div className="w-px h-8 bg-black/10 light:bg-slate-300" />
                         <div className="flex flex-col items-center">
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black mb-0.5">Target Band</span>
                            <span className={`text-lg font-black ${activeConfig.text}`}>{activeTermInfo.targetBands}</span>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* Tier Cards Scroll Area */}
          <div className="relative group/scroll py-2">
            <div className="flex overflow-x-auto gap-5 pb-6 pt-4 px-0 snap-x snap-mandatory scrollbar-hide" ref={scrollContainerRef}>
              {sortedVerbsByGroup.map((group, index) => {
                const isCurrentTier = activeTermInfo?.tier === group.tier;
                const tierConfig = getBandConfig(group.tier);
                
                // Determine transform origin to keep edges aligned when scaling
                const isFirst = index === 0;
                const isLast = index === sortedVerbsByGroup.length - 1;
                const transformOrigin = isFirst ? 'origin-left' : isLast ? 'origin-right' : 'origin-center';

                // Dynamic Styling for Focus Effect
                let cardStyle = "scale-100 opacity-100"; // Default
                if (activeTermInfo) {
                    if (isCurrentTier) {
                        cardStyle = `scale-110 z-20 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] opacity-100 ring-4 ring-white/10 dark:ring-white/5 ${transformOrigin}`; 
                    } else {
                        // Added colored border specific to the tier for visual cue
                        cardStyle = `scale-90 opacity-50 hover:opacity-100 hover:scale-95 border-2 ${tierConfig.border} border-opacity-30 hover:border-opacity-100 z-0 ${transformOrigin}`;
                    }
                }

                return (
                  <div 
                    key={group.tier}
                    ref={el => { tierRefs.current[index] = el; }}
                    onClick={() => { if (group.verbs.length > 0) setActiveVerb(group.verbs[0].term); }}
                    className={`
                      flex-shrink-0 w-[280px] h-[240px] snap-center relative overflow-hidden rounded-[32px] border-2 transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) cursor-pointer flex flex-col group/card
                      ${isCurrentTier 
                        ? `${tierConfig.border} ${tierConfig.bg} light:bg-white` 
                        : `bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200`
                      }
                      ${cardStyle}
                    `}
                  >
                    {isCurrentTier && <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${tierConfig.gradient} pointer-events-none`} />}
                    
                    {/* Add a faint glow of the tier color even when inactive to serve as visual cue */}
                    {!isCurrentTier && <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${tierConfig.gradient} pointer-events-none`} />}

                    <MeshOverlay opacity={isCurrentTier ? "opacity-[0.06]" : "opacity-[0.02]"} />
                    
                    <div className={`px-6 py-4 border-b relative flex items-center gap-4 flex-shrink-0 ${isCurrentTier ? `bg-gradient-to-r ${tierConfig.gradient} border-white/10 text-white` : `${tierConfig.bg} border-white/5`}`}>
                        <div className="text-4xl filter drop-shadow-lg transform transition-transform duration-500 group-hover/card:scale-110">{group.emoji}</div>
                        <div className="min-w-0">
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] block mb-0.5 ${isCurrentTier ? 'opacity-70' : tierConfig.text + ' opacity-60'}`}>Tier {group.tier}</span>
                            <h4 className={`text-sm font-black truncate tracking-tight ${isCurrentTier ? 'text-white' : tierConfig.text}`}>{group.title}</h4>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-10">
                        <div className="flex flex-wrap gap-2 justify-center content-start">
                            {group.verbs.map(verb => {
                                const isSelected = verb.term === activeVerb;
                                return (
                                    <button 
                                        key={verb.term}
                                        onClick={(e) => { e.stopPropagation(); setActiveVerb(verb.term); }}
                                        className={`
                                            px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all duration-300
                                            ${isSelected 
                                                ? `${tierConfig.solidBg} text-white shadow-lg scale-105 border-transparent` 
                                                : `bg-transparent border ${tierConfig.border} ${tierConfig.text} hover:${tierConfig.bg} hover:border-opacity-80`
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
        <div className={`px-10 py-6 bg-[rgb(var(--color-bg-surface-inset))]/30 border-t-2 backdrop-blur-md relative z-20 transition-colors duration-500 ${activeConfig ? activeConfig.border : 'border-slate-200'}`}>
             <div className="flex justify-between items-end mb-4 px-1">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Basic Recall</span>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hidden sm:block">Application</span>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hidden sm:block">Analysis</span>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Creation & Synthesis</span>
             </div>
             
             {/* Progress Bar Track */}
             <div className="relative h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden mb-6">
                 {/* Background Ticks for visual measurement */}
                 <div className="absolute inset-0 flex justify-between px-[16%]">
                    <div className="w-px h-full bg-white/20" />
                    <div className="w-px h-full bg-white/20" />
                    <div className="w-px h-full bg-white/20" />
                    <div className="w-px h-full bg-white/20" />
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
                     const stepConfig = getBandConfig(step.tier);
                     
                     return (
                         <React.Fragment key={step.tier}>
                            {/* Visual Cut-off / Threshold Marker between Tier 3 (Apply) and Tier 4 (Analyse) */}
                            {idx === 3 && (
                                <div className="absolute left-1/2 -translate-x-1/2 -top-8 bottom-0 w-px border-r-2 border-dashed border-slate-300/30 dark:border-white/10 z-0 flex flex-col items-center justify-start pointer-events-none">
                                    <div className="bg-[rgb(var(--color-bg-surface))] text-[8px] font-black uppercase tracking-widest text-slate-400 px-2 py-0.5 rounded-full border border-slate-200/20 shadow-sm whitespace-nowrap mb-2 transform -translate-y-1/2">
                                        Deep Learning Threshold
                                    </div>
                                </div>
                            )}

                             <div 
                                className="flex flex-col items-center gap-3 relative z-10 group/step cursor-pointer" 
                                onClick={() => {
                                     const group = sortedVerbsByGroup.find(g => g.tier === step.tier);
                                     if (group && group.verbs.length > 0) setActiveVerb(group.verbs[0].term);
                                }}
                             >
                                 <div className={`
                                    w-4 h-4 rounded-full border-2 transition-all duration-500 relative
                                    ${isActive ? `${stepConfig.solidBg} border-transparent scale-125` : 'bg-slate-300 dark:bg-slate-700 border-white/10'}
                                    ${isCurrent ? 'ring-4 ring-white/20 scale-150 shadow-lg' : ''}
                                 `}>
                                     {/* Pulsing Animation for Current Step */}
                                     {isCurrent && (
                                         <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${stepConfig.solidBg}`}></span>
                                     )}
                                 </div>
                                 <span className={`
                                    text-[9px] font-bold uppercase tracking-widest transition-all duration-300
                                    ${isCurrent ? stepConfig.text : 'text-slate-400 opacity-50 group-hover/step:opacity-100'}
                                 `}>
                                     {step.label}
                                 </span>
                             </div>
                         </React.Fragment>
                     );
                 })}
                 
                 {/* Connection Line (Visual Only) */}
                 <div className="absolute top-2 left-2 right-2 h-0.5 bg-transparent -z-10" /> 
             </div>
        </div>
      </div>
    </div>
  );
};

export default CommandVerbHierarchy;
