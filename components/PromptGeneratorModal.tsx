
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, CourseOutcome, CommandTermInfo, PromptVerb } from '../types';
import { generateNewPrompt } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import { getCommandTermsForMarks, TIER_GROUPS, extractCommandVerb, commandTermsList, getCommandTermInfo, TIER_WORD_COUNT_MULTIPLIERS } from '../data/commandTerms';
import { X, Sparkles, Target, Hash, ChevronRight, Briefcase, Brain, Clock, Scale, Users, Coins, Wrench, Trophy, Check, ArrowRight, Gauge, Info } from 'lucide-react';
import { getBandConfig, escapeRegExp } from '../utils/renderUtils';
import CognitiveSpectrum from './CognitiveSpectrum';

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
}

// Gold Standard Scenario Constraints
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
  courseOutcomes 
}) => {
  const MAX_GENERATOR_MARKS = 15;
  const [marks, setMarks] = useState(initialMarks > MAX_GENERATOR_MARKS ? 7 : initialMarks);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Independent Controls
  const [selectedTier, setSelectedTier] = useState<number>(4);
  const [selectedSpecificVerb, setSelectedSpecificVerb] = useState<PromptVerb | null>(null);
  const [targetBand, setTargetBand] = useState<number>(6); // Sample Answer Quality
  
  // New Configuration State
  const [scenarioType, setScenarioType] = useState<string>('random');
  const [skillFocus, setSkillFocus] = useState<string>('balanced');

  // Analyse Syllabus Context on Load
  const syllabusVerbInfo = useMemo(() => extractCommandVerb(dotPoint), [dotPoint]);
  
  // Initialize state when modal opens
  useEffect(() => {
      if (isOpen) {
          // Defaults: Use syllabus verb info if available, otherwise sensible defaults
          const defaultTier = syllabusVerbInfo?.tier || 4;
          const defaultVerb = syllabusVerbInfo?.term || null;
          // Map default tier to a sensible mark if no initial mark provided
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

  // Derive available verbs for the *selected tier*
  const verbsForCurrentTier = useMemo(() => {
      return commandTermsList.filter(v => v.tier === selectedTier);
  }, [selectedTier]);

  // Ensure selected verb belongs to selected tier. If not, pick first one.
  useEffect(() => {
      if (verbsForCurrentTier.length > 0) {
          const currentVerbIsValid = verbsForCurrentTier.some(v => v.term === selectedSpecificVerb);
          if (!currentVerbIsValid) {
              setSelectedSpecificVerb(verbsForCurrentTier[0].term);
          }
      }
  }, [selectedTier, verbsForCurrentTier, selectedSpecificVerb]);

  // Derived Configs for UI
  const activeBandConfig = getBandConfig(selectedTier);
  const targetBandConfig = getBandConfig(targetBand);
  const activeTierInfo = TIER_GROUPS.find(g => g.tier === selectedTier);

  // Mark Feedback Logic
  const getMarkFeedback = (m: number) => {
      if (m <= 3) return { label: "Short Answer", desc: `~${Math.round(m * 20)} words` };
      if (m <= 6) return { label: "Standard Response", desc: `~${Math.round(m * 25)} words` };
      if (m <= 9) return { label: "Extended Response", desc: `~${Math.round(m * 30)} words` };
      return { label: "Major Response", desc: `~${Math.round(m * 35)}+ words` };
  };
  const markMeta = getMarkFeedback(marks);

  const getTargetBandDesc = (b: number) => {
      if (b === 6) return "Sophisticated, sustained argument. Highly polished.";
      if (b === 5) return "Clear, detailed explanation. Good synthesis.";
      if (b === 4) return "Sound understanding. Some generalisations.";
      if (b <= 3) return "Basic or limited response. Lacks depth.";
      return "";
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Determine verbs to use - Explicitly use the one selected by user
      let verbsToUse: CommandTermInfo[] = [];
      
      if (selectedSpecificVerb) {
          const v = getCommandTermInfo(selectedSpecificVerb);
          if (v) verbsToUse = [v];
      } 
      
      // Fallback if something weird happened
      if (verbsToUse.length === 0 && verbsForCurrentTier.length > 0) {
          const v = getCommandTermInfo(verbsForCurrentTier[0].term);
          verbsToUse = [v];
      }

      const prompt = await generateNewPrompt(
        courseName,
        topicName,
        dotPoint,
        marks,
        verbsToUse,
        courseOutcomes,
        scenarioType,
        skillFocus,
        targetBand // Pass the user's desired sample answer quality
      );
      onPromptGenerated(prompt);
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
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
                      <span key={i} className={`
                        relative inline-block px-1.5 py-0.5 mx-1 rounded-md shadow-sm
                        bg-gradient-to-r ${verbConfig.gradient} text-white 
                        font-black tracking-wide transform -skew-x-3 decoration-clone
                      `}>
                        <span className="block transform skew-x-3">
                            {part.toUpperCase()}
                        </span>
                      </span>
                  ) : (
                      <span key={i} className="text-[rgb(var(--color-text-secondary))] font-medium">{part}</span>
                  )
              )}
          </span>
      );
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" onClick={handleClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-3xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[95vh] relative" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background Glow */}
        <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${activeBandConfig.gradient} opacity-10 blur-[100px] pointer-events-none transition-colors duration-700`} />

        {/* Header */}
        <div className="px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] flex justify-between items-start relative z-10">
             <div>
                 <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg shadow-[rgb(var(--color-accent))/0.3]">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">AI Question Generator</h2>
                 </div>
                 
                 {/* Breadcrumbs */}
                 <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[rgb(var(--color-text-muted))] ml-1">
                    <span className="opacity-60 hover:opacity-100 transition-opacity cursor-default flex items-center gap-1.5">
                        {courseName}
                    </span>
                    <ChevronRight className="w-3 h-3 opacity-30" />
                    <span className="opacity-60 hover:opacity-100 transition-opacity cursor-default flex items-center gap-1.5">
                        {topicName}
                    </span>
                    {subTopicName && (
                        <>
                            <ChevronRight className="w-3 h-3 opacity-30" />
                            <span className="text-[rgb(var(--color-text-secondary))] flex items-center gap-1.5 bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded border border-[rgb(var(--color-border-secondary))] shadow-sm">
                                {subTopicName}
                            </span>
                        </>
                    )}
                 </div>
             </div>
             <button 
                onClick={handleClose}
                disabled={isLoading}
                className="p-2 rounded-full hover:bg-white/10 text-[rgb(var(--color-text-muted))] hover:text-white transition-colors"
             >
                 <X className="w-6 h-6" />
             </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 relative z-10">
            
            {/* 1. Syllabus Context Placard */}
            <div className={`
                rounded-2xl border p-6 relative overflow-hidden group transition-all duration-500 shadow-lg
                bg-[rgb(var(--color-bg-surface-inset))]/30 border-[rgb(var(--color-border-secondary))]
            `}>
                 <div className="flex justify-between items-start gap-6 relative z-10">
                     <div className="flex-1">
                         <div className="flex items-center gap-2 mb-4">
                             <div className={`
                                inline-flex items-center gap-2 px-3 py-1 rounded-lg
                                bg-[rgb(var(--color-bg-surface-elevated))]
                                text-[rgb(var(--color-text-secondary))] shadow-sm border border-[rgb(var(--color-border-secondary))]
                             `}>
                                 <Hash className="w-3.5 h-3.5" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">Syllabus Context</span>
                             </div>
                         </div>
                         <p className="text-lg sm:text-xl font-serif leading-relaxed text-[rgb(var(--color-text-primary))]">
                             {renderHighlightedSyllabus()}
                         </p>
                     </div>
                 </div>
            </div>

            {/* 2. Configuration Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left: Core Question Specs */}
                <div className="space-y-8">
                    
                    {/* Mark Selector */}
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))] flex items-center gap-2">
                                <Target className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                                Question Marks
                            </label>
                            <div className="text-right">
                                <span className={`text-3xl font-black ${activeBandConfig.text} tabular-nums`}>{marks}</span>
                                <span className="text-sm font-medium text-[rgb(var(--color-text-muted))] ml-1.5">Marks</span>
                            </div>
                        </div>
                        <input 
                            type="range" 
                            min="1" 
                            max={MAX_GENERATOR_MARKS} 
                            value={marks} 
                            onChange={(e) => setMarks(Number(e.target.value))}
                            className="w-full accent-[rgb(var(--color-accent))]"
                        />
                         <div className="flex justify-between items-center mt-3 bg-[rgb(var(--color-bg-surface-inset))] px-3 py-2 rounded-lg border border-[rgb(var(--color-border-secondary))]">
                            <span className="text-xs font-bold text-[rgb(var(--color-text-primary))]">{markMeta.label}</span>
                            <span className="text-[10px] font-mono text-[rgb(var(--color-text-muted))]">{markMeta.desc}</span>
                        </div>
                    </div>

                    {/* Tier Selector */}
                    <div>
                        <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))] flex items-center gap-2 mb-4">
                            <Brain className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                            Cognitive Tier
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {TIER_GROUPS.map((tier) => {
                                const isSelected = selectedTier === tier.tier;
                                const config = getBandConfig(tier.tier);
                                return (
                                    <button
                                        key={tier.tier}
                                        onClick={() => setSelectedTier(tier.tier)}
                                        className={`
                                            p-3 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden
                                            ${isSelected 
                                                ? `${config.bg} ${config.border} ring-1 ${config.ring}` 
                                                : 'bg-[rgb(var(--color-bg-surface-inset))]/30 border-transparent hover:bg-[rgb(var(--color-bg-surface-inset))]/50'
                                            }
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xl">{tier.emoji}</span>
                                            <span className={`text-[10px] font-black uppercase ${isSelected ? config.text : 'text-[rgb(var(--color-text-muted))]'}`}>Tier {tier.tier}</span>
                                        </div>
                                        <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-[rgb(var(--color-text-primary))]' : 'text-[rgb(var(--color-text-secondary))]'}`}>
                                            {tier.title}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        {activeTierInfo && (
                             <p className="mt-3 text-xs text-[rgb(var(--color-text-muted))] italic border-l-2 border-[rgb(var(--color-border-secondary))] pl-3 py-1">
                                 "{activeTierInfo.subtitle}"
                             </p>
                        )}
                    </div>

                    {/* Verb Selector (Filtered by Tier) */}
                    <div>
                        <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))] flex items-center gap-2 mb-3">
                            <Wrench className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                            Command Verb
                        </label>
                        <div className="flex flex-wrap gap-2 p-4 bg-[rgb(var(--color-bg-surface-inset))]/30 rounded-xl border border-[rgb(var(--color-border-secondary))] max-h-40 overflow-y-auto custom-scrollbar">
                            {verbsForCurrentTier.map(verb => (
                                <button
                                    key={verb.term}
                                    onClick={() => setSelectedSpecificVerb(verb.term)}
                                    title={verb.definition}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
                                        ${selectedSpecificVerb === verb.term 
                                            ? `${activeBandConfig.bg} ${activeBandConfig.border} ${activeBandConfig.text} shadow-sm` 
                                            : 'bg-[rgb(var(--color-bg-surface))] border-transparent text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-bg-surface-elevated))]'
                                        }
                                    `}
                                >
                                    {verb.term}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Context & Output Specs */}
                <div className="space-y-8">
                    
                    {/* Scenario Constraint */}
                    <div>
                         <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))] flex items-center gap-2 mb-4">
                             <Briefcase className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                             Scenario Constraint
                         </label>
                         <div className="grid grid-cols-2 gap-2">
                             {SCENARIO_TYPES.map(type => (
                                 <button
                                    key={type.id}
                                    onClick={() => setScenarioType(type.id)}
                                    className={`
                                        flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all
                                        ${scenarioType === type.id 
                                            ? 'bg-[rgb(var(--color-bg-surface-elevated))] border-[rgb(var(--color-accent))] shadow-sm' 
                                            : 'bg-[rgb(var(--color-bg-surface-inset))]/30 border-transparent hover:bg-[rgb(var(--color-bg-surface-inset))]/50'
                                        }
                                    `}
                                 >
                                     <div className={`
                                        p-1.5 rounded-md flex-shrink-0
                                        ${scenarioType === type.id ? 'bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))]' : 'bg-black/20 text-gray-500'}
                                     `}>
                                         <type.icon className="w-3.5 h-3.5" />
                                     </div>
                                     <div className="min-w-0">
                                         <div className={`text-xs font-bold ${scenarioType === type.id ? 'text-[rgb(var(--color-text-primary))]' : 'text-[rgb(var(--color-text-secondary))]'}`}>{type.label}</div>
                                         <div className="text-[9px] text-[rgb(var(--color-text-dim))] truncate">{type.desc}</div>
                                     </div>
                                 </button>
                             ))}
                         </div>
                    </div>
                    
                    {/* Skill Focus */}
                    <div>
                         <label className="text-sm font-bold text-[rgb(var(--color-text-secondary))] flex items-center gap-2 mb-4">
                             <Brain className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                             Skill Focus
                         </label>
                         <div className="flex bg-[rgb(var(--color-bg-surface-inset))]/50 p-1 rounded-xl border border-[rgb(var(--color-border-secondary))]">
                             {SKILL_FOCUS_OPTIONS.map(opt => (
                                 <button
                                    key={opt.id}
                                    onClick={() => setSkillFocus(opt.id)}
                                    title={opt.desc}
                                    className={`
                                        flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all
                                        ${skillFocus === opt.id 
                                            ? 'bg-[rgb(var(--color-bg-surface))] text-[rgb(var(--color-text-primary))] shadow-sm' 
                                            : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]'
                                        }
                                    `}
                                 >
                                     {opt.label}
                                 </button>
                             ))}
                         </div>
                    </div>

                    {/* Target Band Selector */}
                    <div className={`p-5 rounded-xl border ${targetBandConfig.bg} ${targetBandConfig.border}`}>
                        <div className="flex justify-between items-center mb-4">
                             <label className={`text-sm font-bold flex items-center gap-2 ${targetBandConfig.text}`}>
                                 <Trophy className="w-4 h-4" />
                                 Target Sample Quality
                             </label>
                             <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/20 ${targetBandConfig.text}`}>
                                 Band {targetBand}
                             </span>
                        </div>
                        
                        <div className="relative h-12 flex items-center">
                             <div className="absolute inset-x-0 h-2 top-1/2 -translate-y-1/2 rounded-full bg-black/10"></div>
                             <div className="absolute inset-x-0 flex justify-between px-1">
                                 {[1, 2, 3, 4, 5, 6].map(b => (
                                     <button
                                        key={b}
                                        onClick={() => setTargetBand(b)}
                                        className={`
                                            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all relative z-10
                                            ${targetBand === b 
                                                ? `${getBandConfig(b).solidBg} text-white shadow-md scale-110` 
                                                : `bg-[rgb(var(--color-bg-surface))] text-[rgb(var(--color-text-muted))] border border-[rgb(var(--color-border-secondary))] hover:border-[rgb(var(--color-accent))]`
                                            }
                                        `}
                                     >
                                         {b}
                                     </button>
                                 ))}
                             </div>
                        </div>
                        <p className={`text-xs mt-2 opacity-80 ${targetBandConfig.text} font-medium`}>
                            {getTargetBandDesc(targetBand)}
                        </p>
                    </div>

                </div>

            </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-md flex flex-col sm:flex-row justify-between items-center relative z-20 gap-4">
             {/* Live Preview Summary */}
             <div className="flex-1 w-full sm:w-auto text-xs text-[rgb(var(--color-text-secondary))] bg-[rgb(var(--color-bg-surface-inset))] px-4 py-2.5 rounded-lg border border-[rgb(var(--color-border-secondary))] flex items-center gap-2">
                 <Info className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                 <span className="truncate">
                    Creating a <strong className="text-[rgb(var(--color-text-primary))]">{marks}-mark {activeTierInfo?.title}</strong> question about <strong className="text-[rgb(var(--color-text-primary))]">{topicName}</strong>.
                 </span>
             </div>

             <div className="flex gap-3 w-full sm:w-auto justify-end">
                <button 
                    onClick={handleClose} 
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-xl font-bold text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className={`
                        px-8 py-2.5 rounded-xl font-bold text-white shadow-lg
                        bg-gradient-to-r ${activeBandConfig.gradient}
                        hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                        transition-all duration-200
                        disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100
                        flex items-center gap-2
                    `}
                >
                    {isLoading ? (
                        <>
                            <Sparkles className="w-5 h-5 animate-spin" />
                            <span>Crafting Question...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-5 h-5" />
                            <span>Generate Question</span>
                        </>
                    )}
                </button>
             </div>
        </div>
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
            <div className="w-full max-w-md mx-8">
              <LoadingIndicator 
                messages={[
                  `Analysing '${selectedSpecificVerb}' requirements...`,
                  `Constructing ${scenarioType} scenario...`,
                  `Drafting ${marks}-mark criteria...`,
                  `Generating Band ${targetBand} sample...`,
                  'Validating against syllabus outcomes...',
                ]} 
                duration={12}
                band={selectedTier}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PromptGeneratorModal;
