
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, CourseOutcome, CommandTermInfo, PromptVerb } from '../types';
import { generateNewPrompt } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import { getCommandTermsForMarks, TIER_GROUPS, extractCommandVerb, commandTermsList, getCommandTermInfo } from '../data/commandTerms';
import { X, Sparkles, Target, Hash, ChevronRight, Briefcase, Brain, Clock, Scale, Users, Coins, Wrench, Trophy, Info, ListFilter, Loader2 } from 'lucide-react';
import { getBandConfig, escapeRegExp } from '../utils/renderUtils';

interface PromptGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptGenerated: (newPrompt: Prompt) => void;
  courseName: string;
  topicName: string;
  subTopicName?: string;
  dotPoint: string;
  marks: number;
  courseOutcomes: CourseOutcome[];
  selectedFocusItems?: string[]; 
}

const SCENARIO_TYPES = [
    { id: 'random', label: 'Surprise Me', icon: Sparkles, desc: 'AI selects the best fit' },
    { id: 'temporal', label: 'Time Pressure', icon: Clock, desc: 'Deadlines, urgent response' },
    { id: 'financial', label: 'Financial', icon: Coins, desc: 'Budget limits, ROI' },
    { id: 'ethical', label: 'Ethical', icon: Scale, desc: 'Dilemmas, moral hazard' },
    { id: 'stakeholder', label: 'Stakeholder', icon: Users, desc: 'Conflicting interests' },
    { id: 'technical', label: 'Technical', icon: Wrench, desc: 'Legacy systems, constraints' },
    { id: 'regulatory', label: 'Regulatory', icon: Briefcase, desc: 'Compliance, laws' },
];

const SKILL_FOCUS_OPTIONS = [
    { id: 'balanced', label: 'Balanced', desc: 'Equal focus on content and application.' },
    { id: 'application', label: 'Application', desc: 'Focus on applying concepts to the scenario.' },
    { id: 'analysis', label: 'Analysis', desc: 'Deep dive into relationships and causes.' },
    { id: 'evaluation', label: 'Evaluation', desc: 'Critical judgement and assessment.' },
];

const PromptGeneratorModal: React.FC<PromptGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  onPromptGenerated, 
  courseName, 
  topicName, 
  subTopicName,
  dotPoint, 
  marks: initialMarks, 
  courseOutcomes, 
  selectedFocusItems = []
}) => {
  const MAX_GENERATOR_MARKS = 15;
  const [marks, setMarks] = useState(initialMarks > MAX_GENERATOR_MARKS ? 7 : initialMarks);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const [selectedTier, setSelectedTier] = useState<number>(4);
  const [selectedSpecificVerb, setSelectedSpecificVerb] = useState<PromptVerb | null>(null);
  const [targetBand, setTargetBand] = useState<number>(6);
  
  const [scenarioType, setScenarioType] = useState<string>('random');
  const [skillFocus, setSkillFocus] = useState<string>('balanced');

  const syllabusVerbInfo = useMemo(() => extractCommandVerb(dotPoint), [dotPoint]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  useEffect(() => {
      if (isOpen) {
          const defaultTier = syllabusVerbInfo?.tier || 4;
          const defaultVerb = syllabusVerbInfo?.term || null;
          const suggestedMark = initialMarks || (defaultTier === 1 ? 2 : defaultTier === 2 ? 3 : defaultTier === 3 ? 4 : defaultTier === 4 ? 5 : defaultTier === 5 ? 7 : 8);

          setMarks(suggestedMark);
          setSelectedTier(defaultTier);
          setSelectedSpecificVerb(defaultVerb as PromptVerb);
          
          setScenarioType('random');
          setSkillFocus('balanced');
          setTargetBand(6);
          setError(null);
          setIsLoading(false);
      }
  }, [isOpen, syllabusVerbInfo, initialMarks]);

  const verbsForCurrentTier = useMemo(() => {
      return commandTermsList.filter(v => v.tier === selectedTier);
  }, [selectedTier]);

  useEffect(() => {
      if (verbsForCurrentTier.length > 0) {
          const currentVerbIsValid = verbsForCurrentTier.some(v => v.term === selectedSpecificVerb);
          if (!currentVerbIsValid) {
              setSelectedSpecificVerb(verbsForCurrentTier[0].term);
          }
      }
  }, [selectedTier, verbsForCurrentTier, selectedSpecificVerb]);

  const activeBandConfig = getBandConfig(selectedTier);
  const targetBandConfig = getBandConfig(targetBand);
  const activeTierInfo = TIER_GROUPS.find(g => g.tier === selectedTier);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let verbsToUse: CommandTermInfo[] = [];
      if (selectedSpecificVerb) {
          const v = getCommandTermInfo(selectedSpecificVerb);
          if (v) verbsToUse = [v];
      } 
      
      if (verbsToUse.length === 0 && verbsForCurrentTier.length > 0) {
          const v = getCommandTermInfo(verbsForCurrentTier[0].term);
          verbsToUse = [v];
      }

      // Enhanced context for focus sub-items
      const focusInstruction = selectedFocusItems.length > 0 
          ? `. Focus the question and scenario explicitly on the following specific sub-components or examples of the dot point: ${selectedFocusItems.join(', ')}. The marking criteria MUST reflect these focus areas.`
          : "";

      const prompt = await generateNewPrompt(
        courseName,
        topicName,
        dotPoint + focusInstruction, // Injected focus
        marks,
        verbsToUse,
        courseOutcomes,
        scenarioType,
        skillFocus,
        targetBand
      );
      onPromptGenerated(prompt);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const renderHighlightedSyllabus = () => {
      if (!syllabusVerbInfo) return dotPoint;
      const parts = dotPoint.split(new RegExp(`(${escapeRegExp(syllabusVerbInfo.term)})`, 'i'));
      const verbConfig = getBandConfig(syllabusVerbInfo.tier);
      
      return (
          <span>
              {parts.map((part, i) => 
                  part.toLowerCase() === syllabusVerbInfo.term.toLowerCase() ? (
                      <span key={i} className={`relative inline-block px-1.5 py-0.5 mx-1 rounded-md shadow-sm bg-gradient-to-r ${verbConfig.gradient} text-white font-black tracking-wide transform -skew-x-3 decoration-clone`}>
                        <span className="block transform skew-x-3">{part.toUpperCase()}</span>
                      </span>
                  ) : (
                      <span key={i} className="text-[rgb(var(--color-text-secondary))] light:text-slate-700 font-medium">{part}</span>
                  )
              )}
          </span>
      );
  };

  if (!isOpen || !mounted || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" onClick={handleClose}>
      <div className="bg-[rgb(var(--color-bg-base))] light:bg-white rounded-[40px] shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 animate-fade-in-up overflow-hidden flex flex-col max-h-[95vh] relative" onClick={(e) => e.stopPropagation()}>
        <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${activeBandConfig.gradient} opacity-10 light:opacity-5 blur-[100px] pointer-events-none transition-colors duration-700`} />

        <div className="px-10 py-8 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-between items-start relative z-10 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 backdrop-blur-sm">
             <div>
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg shadow-[rgb(var(--color-accent))/0.3]">
                        <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white light:text-slate-900 tracking-tighter italic uppercase leading-none">Generate Question</h2>
                        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-400 mt-1 block">AI Assistant</span>
                    </div>
                 </div>
                 <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500 ml-1 opacity-60">
                    <span>{courseName}</span>
                    <ChevronRight className="w-3 h-3 opacity-30" />
                    <span>{topicName}</span>
                    {subTopicName && (
                        <>
                            <ChevronRight className="w-3 h-3 opacity-30" />
                            <span className="text-indigo-400">{subTopicName}</span>
                        </>
                    )}
                 </div>
             </div>
             <button onClick={handleClose} disabled={isLoading} className="p-4 rounded-full hover:bg-white/10 light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-400 hover:text-white transition-colors"><X className="w-8 h-8" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10 relative z-10 custom-scrollbar">
            {/* Syllabus Context */}
            <div className="rounded-[32px] border p-8 relative overflow-hidden group transition-all duration-500 shadow-2xl bg-black/20 border-white/5">
                 <div className="flex flex-col gap-6 relative z-10">
                     <div className="flex flex-wrap items-center gap-3">
                         <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-white/5 text-[rgb(var(--color-text-secondary))] border border-white/10 shadow-inner">
                             <Hash className="w-3.5 h-3.5 text-indigo-400" />
                             <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Core Syllabus Element</span>
                         </div>
                         {selectedFocusItems.length > 0 && (
                            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-900/10">
                                <ListFilter className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Active Focus: {selectedFocusItems.length} Refinement{selectedFocusItems.length > 1 ? 's' : ''}</span>
                            </div>
                         )}
                     </div>
                     <p className="text-xl sm:text-2xl font-serif leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-800">{renderHighlightedSyllabus()}</p>
                     
                     {selectedFocusItems.length > 0 && (
                         <div className="flex flex-wrap gap-2 pt-2">
                             {selectedFocusItems.map(item => (
                                 <span key={item} className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest italic">{item}</span>
                             ))}
                         </div>
                     )}
                 </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-10">
                    <section>
                        <div className="flex justify-between items-end mb-6">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">Settings</span>
                                <h4 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
                                    <Target className="w-5 h-5 text-indigo-400" /> Mark Allocation
                                </h4>
                            </div>
                            <div className="text-right">
                                <span className={`text-4xl font-black ${activeBandConfig.text} tracking-tighter tabular-nums`}>{marks}</span>
                                <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-widest ml-2 italic opacity-40">Value</span>
                            </div>
                        </div>
                        <div className="h-4 bg-black/40 rounded-full border border-white/5 p-1 shadow-inner relative group/slider">
                            <input 
                                type="range" 
                                min="1" 
                                max={MAX_GENERATOR_MARKS} 
                                value={marks} 
                                onChange={(e) => setMarks(Number(e.target.value))} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                            />
                            <div className={`h-full bg-gradient-to-r ${activeBandConfig.gradient} rounded-full transition-all duration-300 relative`} style={{ width: `${(marks / MAX_GENERATOR_MARKS) * 100}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl scale-125 group-hover/slider:scale-150 transition-transform" />
                            </div>
                        </div>
                    </section>

                    <section>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20 mb-4 block">Cognitive Tiering</span>
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3 mb-6">
                            <Brain className="w-5 h-5 text-purple-400" /> Processing Level
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                            {TIER_GROUPS.map((tier) => {
                                const isSelected = selectedTier === tier.tier;
                                const config = getBandConfig(tier.tier);
                                return (
                                    <button key={tier.tier} onClick={() => setSelectedTier(tier.tier)} className={`group relative p-5 rounded-[24px] border text-left transition-all duration-500 ${isSelected ? `${config.bg} ${config.border} shadow-2xl scale-[1.03]` : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05] hover:border-white/10'}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="text-2xl transition-transform duration-500 group-hover:scale-125">{tier.emoji}</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest ${isSelected ? config.text : 'text-white/20'}`}>T{tier.tier}</span>
                                        </div>
                                        <div className={`text-[10px] font-bold leading-tight uppercase tracking-widest ${isSelected ? 'text-white' : 'text-slate-500'}`}>{tier.title}</div>
                                        {isSelected && <div className="absolute bottom-2 right-4 w-1 h-1 rounded-full bg-current animate-pulse" />}
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                </div>

                <div className="space-y-10">
                    <section>
                         <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20 mb-4 block">Scenario Settings</span>
                         <h4 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3 mb-6">
                            <Briefcase className="w-5 h-5 text-blue-400" /> Scenario Context
                         </h4>
                         <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-2">
                             {SCENARIO_TYPES.map(type => (
                                 <button key={type.id} onClick={() => setScenarioType(type.id)} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${scenarioType === type.id ? 'bg-blue-500/10 border-blue-500/30 shadow-xl' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]'}`}>
                                     <div className={`p-2 rounded-xl flex-shrink-0 transition-colors ${scenarioType === type.id ? 'bg-blue-500 text-white shadow-lg' : 'bg-black/20 text-slate-500'}`}><type.icon className="w-4 h-4" /></div>
                                     <div className="min-w-0">
                                         <div className={`text-[10px] font-bold uppercase tracking-widest ${scenarioType === type.id ? 'text-white' : 'text-slate-400'}`}>{type.label}</div>
                                         <div className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter truncate">{type.desc}</div>
                                     </div>
                                 </button>
                             ))}
                         </div>
                    </section>
                    
                    <section className={`p-6 rounded-[32px] border transition-all duration-700 ${activeBandConfig.bg} ${activeBandConfig.border} shadow-2xl`}>
                        <div className="flex justify-between items-center mb-6">
                            <label className={`text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-3 ${activeBandConfig.text}`}>
                                <Trophy className="w-5 h-5" /> Synthesis Target
                            </label>
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-white/10 ${activeBandConfig.text} border ${activeBandConfig.border}`}>Band {targetBand} Standard</span>
                        </div>
                        <div className="relative h-14 flex items-center px-4">
                            <div className="absolute inset-x-8 h-1 top-1/2 -translate-y-1/2 rounded-full bg-black/20 shadow-inner" />
                            <div className="absolute inset-x-8 flex justify-between">
                                {[1, 2, 3, 4, 5, 6].map(b => {
                                    const bConf = getBandConfig(b);
                                    const isTarget = targetBand === b;
                                    return (
                                        <button key={b} onClick={() => setTargetBand(b)} className={`relative z-10 w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-500 transform ${isTarget ? `${bConf.solidBg} text-white shadow-2xl scale-125 rotate-6 border border-white/20` : 'bg-black/40 text-slate-500 hover:scale-110 hover:text-white border border-white/5'}`}>
                                            {b}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
            
            <section className="pt-6 border-t border-white/5">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3 mb-6">
                    <Wrench className="w-5 h-5 text-amber-400" /> Command Verb
                </h4>
                <div className="flex flex-wrap gap-2 p-6 bg-black/40 rounded-[32px] border border-white/5 shadow-inner">
                    {verbsForCurrentTier.map(verb => (
                        <button key={verb.term} onClick={() => setSelectedSpecificVerb(verb.term)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 border ${selectedSpecificVerb === verb.term ? `${activeBandConfig.bg} ${activeBandConfig.border} ${activeBandConfig.text} shadow-xl scale-105` : 'bg-white/5 border-transparent text-slate-500 hover:text-white hover:border-white/10'}`}>{verb.term}</button>
                    ))}
                </div>
            </section>
        </div>

        {/* Global Footer Controls */}
        <div className="px-10 py-8 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-3xl border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6 shrink-0 z-20 shadow-[0_-32px_64px_-16px_rgba(0,0,0,0.4)]">
             <div className="flex-1 w-full sm:w-auto p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                 <div className="p-2 rounded-xl bg-indigo-500/10">
                     <Info className="w-5 h-5 text-indigo-400" />
                 </div>
                 <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 block mb-1">Configuration Valid</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                        Constructing a <strong className="text-white">{marks}-mark {activeTierInfo?.title}</strong> task.
                        {selectedFocusItems.length > 0 && <span className="text-emerald-400"> (Focus enabled for {selectedFocusItems.length} items)</span>}
                    </p>
                 </div>
             </div>
             
             <div className="flex gap-4 w-full sm:w-auto justify-end">
                <button onClick={handleClose} disabled={isLoading} className="px-8 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-white transition-all disabled:opacity-50">Cancel</button>
                <button onClick={handleGenerate} disabled={isLoading} className={`group px-10 py-4 rounded-[20px] font-bold text-xs uppercase tracking-[0.2em] text-white shadow-2xl bg-gradient-to-r ${activeBandConfig.gradient} hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-70 flex items-center gap-3`}>
                    {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Generating...</span></> : <><Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" /><span>Generate</span></>}
                </button>
             </div>
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-3xl flex items-center justify-center z-[100] animate-fade-in">
            <div className="w-full max-w-md mx-8"><LoadingIndicator messages={[`Focusing on ${selectedFocusItems.length > 0 ? 'specified items' : 'syllabus context'}...`, `Parsing '${selectedSpecificVerb}' cognitive requirements...`, `Modelling ${scenarioType} constraint set...`, `Synthesising marking rubric...`, `Calibrating Band ${targetBand} sample output...`]} duration={12} band={selectedTier} /></div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PromptGeneratorModal;
