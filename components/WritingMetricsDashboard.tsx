

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt } from '../types';
import { BAND_METRICS, getCommandTermInfo, TIER_GROUPS } from '../data/commandTerms';
import { escapeRegExp, getBandConfig, getKeywordVariants, BandConfig } from '../utils/renderUtils';
import { 
  ChevronDown, Clock, Play, Pause, RotateCcw, Target, 
  CheckCircle, BrainCircuit, Link, Lightbulb, Sparkles, 
  TrendingUp, GraduationCap, AlertTriangle
} from 'lucide-react';

// Constants
const TIMER_INTERVAL = 1000;

interface WritingMetricsDashboardProps {
  userAnswer: string;
  prompt: Prompt;
  onAddWord?: (word: string) => void;
}

// --- Helper Components ---

interface PillProps {
  label: string;
  active: boolean;
  theme?: BandConfig;
  onClick?: () => void;
}

const Pill: React.FC<PillProps> = React.memo(({ label, active, theme, onClick }) => {
  // Interactive state styles
  const interactiveStyle = onClick ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default";
  
  // Base style matches KeywordEditor tags (rounded-full)
  const baseStyle = `
    inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all duration-500 
    border select-none ${interactiveStyle}
  `;

  let colorStyle = "bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 opacity-70 hover:opacity-100 hover:text-[rgb(var(--color-text-secondary))] hover:border-[rgb(var(--color-border-secondary))] light:hover:text-slate-700 light:hover:border-slate-300";

  if (active && theme) {
    // Dynamic theme based on the current Band of the essay
    colorStyle = `
      ${theme.bg} ${theme.text} ${theme.border} 
      shadow-sm hover:shadow-md ${theme.glow}
      brightness-110 hover:brightness-125
    `;
  } else if (active) {
    // Fallback active style if no theme provided
    colorStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }

  return (
    <button 
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? "Click to insert into answer" : undefined}
      className={`${baseStyle} ${colorStyle}`}
    >
      {active && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
      <span>{label}</span>
    </button>
  );
});
Pill.displayName = 'Pill';

// --- Main Component ---

export const WritingMetricsDashboard: React.FC<WritingMetricsDashboardProps> = React.memo(({ userAnswer, prompt, onAddWord }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const bandConfig = useMemo(() => getBandConfig(commandTermInfo.tier), [commandTermInfo.tier]);

  // --- Timer Logic ---
  const recommendedTime = useMemo(() => {
    if (!prompt.totalMarks) return 300;
    const marksBasedTime = Math.round(prompt.totalMarks * 1.5 * 60);
    if (prompt.estimatedTime) {
        const match = prompt.estimatedTime.match(/(\d+)/);
        if (match) {
             const minutes = parseInt(match[1], 10);
             if (!isNaN(minutes) && minutes > 0) return Math.min(marksBasedTime, Math.round(minutes * 60));
        }
    }
    return marksBasedTime;
  }, [prompt.estimatedTime, prompt.totalMarks]);

  const [remainingTime, setRemainingTime] = useState(recommendedTime);

  useEffect(() => { setRemainingTime(recommendedTime); setIsTimerActive(false); }, [recommendedTime]);

  useEffect(() => {
    if (isTimerActive && remainingTime > 0) {
      timerIntervalRef.current = setInterval(() => setRemainingTime(p => Math.max(0, p - 1)), TIMER_INTERVAL);
    } else if (remainingTime <= 0 && isTimerActive) {
      setIsTimerActive(false);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isTimerActive, remainingTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  
  // Timer progress color & width
  const timerProgress = Math.max(0, (remainingTime / recommendedTime) * 100);
  let timerColorClass = 'bg-blue-500';
  if (timerProgress < 30) timerColorClass = 'bg-amber-500';
  if (timerProgress < 10) timerColorClass = 'bg-red-500';

  // --- Word Count & Dynamic Band Targeting ---
  const wordCount = useMemo(() => userAnswer.trim().split(/\s+/).filter(Boolean).length, [userAnswer]);
  
  const progressInfo = useMemo(() => {
      // 1. Determine Max Cap based on Tier
      const tierGroup = TIER_GROUPS.find(g => g.tier === commandTermInfo.tier);
      const maxBand = tierGroup ? tierGroup.maxBand : 6;

      // 2. Create an array of stepped targets based on Marks
      const targets = BAND_METRICS
          .filter(b => b.band <= maxBand) // Only go up to the Tier Cap
          .sort((a, b) => a.band - b.band)
          .map(metric => {
              // Calculate raw target based on marks multiplier
              const rawTarget = prompt.totalMarks * metric.wordCountMultiplier.min;
              // Round to nearest 5 for cleaner UI numbers (e.g. 37 -> 40, 12 -> 15)
              const roundedTarget = Math.ceil(rawTarget / 5) * 5;
              return {
                  band: metric.band,
                  target: Math.max(roundedTarget, 10) // Minimum 10 words
              };
          });

      // 3. Find the next target
      // If we have 0 words, target Band 1.
      // If we pass Band 1, target Band 2, etc.
      let activeTarget = targets[0]; 
      let isMaxReached = false;

      for (let i = 0; i < targets.length; i++) {
          if (wordCount < targets[i].target) {
              activeTarget = targets[i];
              break;
          }
          // If we are at the last item and still haven't broken the loop, we are at max
          if (i === targets.length - 1) {
              activeTarget = targets[i];
              isMaxReached = true;
          }
      }

      const percentage = Math.min(100, (wordCount / activeTarget.target) * 100);

      return {
          targetLabel: isMaxReached ? `Band ${activeTarget.band} (Max Cap)` : `Targeting Band ${activeTarget.band}`,
          targetCount: activeTarget.target,
          percentage,
          currentBandColor: getBandConfig(activeTarget.band)
      };

  }, [prompt.totalMarks, commandTermInfo.tier, wordCount]);
  
  // --- Keyword Analysis ---
  const keywordStats = useMemo(() => {
    const keywords = (prompt.keywords || []).filter(kw => kw.trim());
    if (!keywords.length) return { used: [], missed: [], score: 0 };
    
    const answerLower = userAnswer.toLowerCase();
    const used = keywords.filter(kw => {
        const variants = getKeywordVariants(kw);
        return variants.some(v => {
            try {
                return new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(answerLower);
            } catch { return false; }
        });
    });
    
    return {
        used,
        missed: keywords.filter(kw => !used.includes(kw)),
        score: Math.round((used.length / keywords.length) * 100)
    };
  }, [userAnswer, prompt.keywords]);

  // --- Structure Analysis (Connectives) ---
  const structureStats = useMemo(() => {
    const requiredWords = commandTermInfo.structuralKeywords || [];
    if (!requiredWords.length) return { used: [], missed: [], score: 0, hasRequirements: false };

    const answerLower = userAnswer.toLowerCase();
    const used = requiredWords.filter(word => answerLower.includes(word.toLowerCase()));

    return {
        used,
        missed: requiredWords.filter(w => !used.includes(w)),
        score: Math.round((used.length / requiredWords.length) * 100),
        hasRequirements: true
    };
  }, [userAnswer, commandTermInfo]);

  // --- Live Coach Logic ---
  const liveFeedback = useMemo(() => {
    if (wordCount < 5) return { text: "Start by defining the core concept directly.", type: 'neutral' };
    
    if (progressInfo.percentage < 30) return { text: `Build your foundation. Aiming for Band ${progressInfo.targetLabel.replace(/\D/g,'')} depth.`, type: 'neutral' };
    
    if (keywordStats.score < 30) return { text: "Your response lacks specific syllabus terminology. Integrate keywords from the list.", type: 'warning' };
    
    if (structureStats.hasRequirements && structureStats.score < 30) {
        return { text: `For a '${prompt.verb}' question, use linking words like '${structureStats.missed[0]}' to structure your argument.`, type: 'warning' };
    }
    
    if (progressInfo.percentage < 80) return { text: "Good content. Expand your explanation with a concrete example.", type: 'neutral' };
    
    if (keywordStats.score < 70) return { text: "Deepen your analysis by using more precise vocabulary.", type: 'warning' };

    return { text: "Strong response. Check for clarity and flow. Ensure your final judgement is clear.", type: 'success' };
  }, [wordCount, progressInfo, keywordStats, structureStats, prompt.verb]);

  const handlePillClick = (word: string) => {
      if (onAddWord) {
          onAddWord(word);
      }
  };

  return (
    <div className={`
      rounded-xl overflow-hidden border transition-all duration-500 ease-out
      bg-[rgb(var(--color-bg-surface))]/60 backdrop-blur-xl
      light:bg-white light:shadow-lg light:border-indigo-200
      border-[rgb(var(--color-border-secondary))]/50 hover:border-[rgb(var(--color-border-secondary))] shadow-lg hover-lift
      ${isCollapsed ? '' : 'ring-1 ring-[rgb(var(--color-accent))]/10 light:ring-indigo-50'}
    `}>
      {/* --- Header --- */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`
          w-full p-4 flex items-center justify-between
          bg-[rgb(var(--color-bg-surface))]/50 hover:bg-[rgb(var(--color-bg-surface-light))]/30
          light:bg-white light:hover:bg-slate-50
          transition-all duration-300 ease-out
          group border-b border-transparent ${!isCollapsed ? 'border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200' : ''}
        `}
      >
        <div className="flex items-center gap-3 relative z-10">
           <div className={`
             p-2 rounded-lg shadow-inner flex-shrink-0
             bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))]
             light:bg-slate-100 light:border-slate-200
             text-[rgb(var(--color-accent))] group-hover:text-white light:group-hover:text-[rgb(var(--color-accent-dark))] transition-colors
           `}>
              <BrainCircuit className="w-5 h-5" />
           </div>
           <div className="text-left min-w-0">
               <h3 className="font-bold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-tight">Writing Assistant</h3>
               <span className={`text-[10px] font-medium uppercase tracking-widest block mt-0.5 transition-colors ${bandConfig.text}`}>
                 Real-time Coach
               </span>
           </div>
        </div>
        
        <div className={`
            p-1.5 rounded-lg text-[rgb(var(--color-text-muted))] light:text-slate-400
            group-hover:bg-[rgb(var(--color-bg-surface-inset))] group-hover:text-white light:group-hover:bg-slate-100 light:group-hover:text-slate-700
            transition-all duration-300
        `}>
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[800px] opacity-100'}`}>
        
        {/* --- Live Coach Banner --- */}
        <div className="px-4 pt-4">
            <div className={`
                relative p-4 rounded-xl flex items-start gap-3 overflow-hidden transition-all duration-500
                border backdrop-blur-sm
                ${liveFeedback.type === 'success' 
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100 light:text-emerald-900 light:bg-emerald-50 light:border-emerald-200' 
                    : liveFeedback.type === 'warning' 
                        ? 'bg-amber-500/5 border-amber-500/20 text-amber-100 light:text-amber-900 light:bg-amber-50 light:border-amber-200' 
                        : 'bg-blue-500/5 border-blue-500/20 text-blue-100 light:text-blue-900 light:bg-blue-50 light:border-blue-200'}
            `}>
                 {/* Ambient glow behind icon */}
                 <div className={`absolute top-0 left-0 w-16 h-16 blur-xl opacity-20 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none
                    ${liveFeedback.type === 'success' ? 'bg-emerald-500' : liveFeedback.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}
                 `}></div>

                 <div className={`
                    p-1.5 rounded-lg flex-shrink-0 z-10 border shadow-sm
                    ${liveFeedback.type === 'success' 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 light:bg-white light:text-emerald-600 light:border-emerald-300' 
                        : liveFeedback.type === 'warning' 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 light:bg-white light:text-amber-600 light:border-amber-300' 
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400 light:bg-white light:text-blue-600 light:border-blue-300'}
                 `}>
                    {liveFeedback.type === 'success' ? <Sparkles className="w-4 h-4" /> : liveFeedback.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                 </div>
                 <div className="min-w-0 z-10">
                    <p className={`text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1 ${liveFeedback.type === 'success' ? 'text-emerald-300 light:text-emerald-700' : liveFeedback.type === 'warning' ? 'text-amber-300 light:text-amber-700' : 'text-blue-300 light:text-blue-700'}`}>Coach Insight</p>
                    <p className={`text-sm font-medium leading-relaxed`}>
                        {liveFeedback.text}
                    </p>
                 </div>
            </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* --- Column 1: Metrics & Timer (4 cols) --- */}
            <div className="md:col-span-4 space-y-4">
                {/* Band Estimator */}
                <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-4 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 hover:border-[rgb(var(--color-border-primary))] light:hover:border-slate-400 transition-colors">
                    <div className="flex justify-between items-end mb-3">
                        <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5" /> Band Trajectory
                        </span>
                        <span className={`text-xs font-mono font-bold ${progressInfo.currentBandColor.text}`}>
                            {wordCount} / {progressInfo.targetCount} words
                        </span>
                    </div>
                    <div className="h-2.5 w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))] light:border-slate-300">
                        <div 
                            className={`h-full bg-gradient-to-r ${progressInfo.currentBandColor.gradient} transition-all duration-700 ease-out relative`} 
                            style={{ width: `${progressInfo.percentage}%` }} 
                        >
                             <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-[9px] text-[rgb(var(--color-text-dim))] light:text-slate-400">Depth</span>
                        <span className={`text-[9px] font-bold ${progressInfo.currentBandColor.text} bg-[rgb(var(--color-bg-surface))] light:bg-white px-1.5 py-0.5 rounded border border-[rgb(var(--color-border-secondary))] light:border-slate-200`}>
                            {progressInfo.targetLabel}
                        </span>
                    </div>
                </div>

                {/* Timer with Progress Bar */}
                <div className="flex flex-col bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-3 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 hover:border-[rgb(var(--color-border-primary))] light:hover:border-slate-400 transition-colors gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-[rgb(var(--color-bg-surface))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-200 shadow-sm ${isTimerActive ? 'text-red-400 animate-pulse border-red-500/30' : 'text-[rgb(var(--color-text-muted))] light:text-slate-400'}`}>
                                <Clock className="w-4 h-4" />
                            </div>
                            <div>
                                <span className="text-[9px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider block mb-0.5">Time Remaining</span>
                                <span className={`font-mono text-lg font-bold leading-none ${remainingTime < 60 ? 'text-red-400' : 'text-[rgb(var(--color-text-primary))] light:text-slate-900'}`}>
                                    {formatTime(remainingTime)}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => setIsTimerActive(!isTimerActive)} 
                                className="p-2 rounded-lg bg-[rgb(var(--color-bg-surface))] light:bg-white hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 transition-all hover-scale active:scale-95"
                                title={isTimerActive ? "Pause Timer" : "Start Timer"}
                            >
                                {isTimerActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </button>
                            <button 
                                onClick={() => { setIsTimerActive(false); setRemainingTime(recommendedTime); }} 
                                className="p-2 rounded-lg bg-[rgb(var(--color-bg-surface))] light:bg-white hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 transition-all hover-scale active:scale-95"
                                title="Reset Timer"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    {/* Stylish Progress Bar */}
                    <div className="h-1.5 w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 rounded-full overflow-hidden">
                        <div 
                            className={`h-full ${timerColorClass} transition-all duration-1000 ease-linear ${isTimerActive ? 'animate-shimmer' : ''}`} 
                            style={{ width: `${timerProgress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* --- Column 2: Syllabus Keywords (4 cols) --- */}
            <div className="md:col-span-4 flex flex-col">
                 <h4 className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-center gap-2 pl-1">
                    <Target className="w-3.5 h-3.5 text-emerald-400" /> Syllabus Keywords ({keywordStats.score}%)
                 </h4>
                 <div className="flex-1 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-3 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 overflow-y-auto max-h-40 scrollbar-thin scrollbar-thumb-[rgb(var(--color-border-secondary))] light:scrollbar-thumb-slate-300 scrollbar-track-transparent hover:border-[rgb(var(--color-border-primary))] light:hover:border-slate-400 transition-colors">
                    <div className="flex flex-wrap gap-2 content-start justify-center">
                        {keywordStats.used.map(kw => (
                            <Pill 
                                key={kw} 
                                label={kw} 
                                active={true} 
                                theme={progressInfo.currentBandColor} 
                                onClick={() => handlePillClick(kw)} 
                            />
                        ))}
                        {keywordStats.missed.map(kw => (
                            <Pill 
                                key={kw} 
                                label={kw} 
                                active={false} 
                                onClick={() => handlePillClick(kw)} 
                            />
                        ))}
                        {prompt.keywords?.length === 0 && <span className="text-xs text-[rgb(var(--color-text-dim))] italic text-center w-full mt-4 block">No keywords defined.</span>}
                    </div>
                 </div>
            </div>

            {/* --- Column 3: Structural Signposts (4 cols) --- */}
            <div className="md:col-span-4 flex flex-col">
                 <h4 className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-center gap-2 pl-1">
                    <Link className="w-3.5 h-3.5 text-blue-400" /> Structure: {prompt.verb}
                 </h4>
                 <div className="flex-1 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-3 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 overflow-y-auto max-h-40 scrollbar-thin scrollbar-thumb-[rgb(var(--color-border-secondary))] light:scrollbar-thumb-slate-300 scrollbar-track-transparent hover:border-[rgb(var(--color-border-primary))] light:hover:border-slate-400 transition-colors">
                     {structureStats.hasRequirements ? (
                        <div className="flex flex-wrap gap-2 content-start justify-center">
                            {structureStats.used.map(w => (
                                <Pill 
                                    key={w} 
                                    label={w} 
                                    active={true} 
                                    theme={progressInfo.currentBandColor}
                                    onClick={() => handlePillClick(w)} 
                                />
                            ))}
                            {structureStats.missed.map(w => (
                                <Pill 
                                    key={w} 
                                    label={w} 
                                    active={false} 
                                    onClick={() => handlePillClick(w)} 
                                />
                            ))}
                        </div>
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full opacity-50">
                            <span className="text-xs text-[rgb(var(--color-text-dim))] italic text-center">No structural guides for this verb.</span>
                         </div>
                     )}
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
});

WritingMetricsDashboard.displayName = 'WritingMetricsDashboard';

export default WritingMetricsDashboard;
