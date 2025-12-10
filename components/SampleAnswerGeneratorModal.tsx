
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { generateSampleAnswer } from '../services/geminiService';
import { getCommandTermInfo, getBandForMark, TIER_GROUPS } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import { X, Sparkles, AlertTriangle, Info, Check, Plus, Target, Award } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface SampleAnswerGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  onSampleAnswerGenerated: (newAnswer: SampleAnswer) => void;
}

const SampleAnswerGeneratorModal: React.FC<SampleAnswerGeneratorModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onSampleAnswerGenerated,
}) => {
  const [selectedMark, setSelectedMark] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  
  // Map existing counts per mark
  const existingCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (prompt.sampleAnswers || []).forEach(sa => {
      counts.set(sa.mark, (counts.get(sa.mark) || 0) + 1);
    });
    return counts;
  }, [prompt.sampleAnswers]);
  
  const tierInfo = useMemo(() => TIER_GROUPS.find(t => t.tier === commandTermInfo.tier), [commandTermInfo.tier]);

  // Generate options for every possible mark (0 to Total)
  const markOptions = useMemo(() => {
    return Array.from({ length: prompt.totalMarks + 1 }, (_, i) => i).map(mark => {
      const band = getBandForMark(mark, prompt.totalMarks, commandTermInfo.tier);
      const count = existingCounts.get(mark) || 0;
      
      return {
        mark,
        band,
        count
      };
    });
  }, [prompt.totalMarks, existingCounts, commandTermInfo.tier]);

  useEffect(() => {
    if (isOpen) {
      // Default to full marks if not set
      if (selectedMark === null) {
          setSelectedMark(prompt.totalMarks);
      }
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen, prompt.totalMarks]);

  const handleGenerate = async () => {
    if (selectedMark === null) return;

    setIsLoading(true);
    setError(null);
    try {
      const newAnswer = await generateSampleAnswer(
        prompt,
        selectedMark,
        [] 
      );
      onSampleAnswerGenerated(newAnswer);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate sample answer.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;
  
  const selectedBand = selectedMark !== null ? getBandForMark(selectedMark, prompt.totalMarks, commandTermInfo.tier) : 1;
  
  // Use the band config of the SELECTED mark to theme the modal
  const activeBandConfig = getBandConfig(selectedBand);
  
  // Determine if the band is capped by the tier
  const potentialBand = selectedMark !== null ? getBandForMark(selectedMark, prompt.totalMarks, 6) : 1;
  const isCapped = tierInfo && selectedBand < potentialBand;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" 
      onClick={handleClose}
    >
      <div 
        className={`
          bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl 
          w-full max-w-3xl border-2 ${activeBandConfig.border} border-opacity-50
          animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]
          ${activeBandConfig.glow}
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero Header */}
        <div className={`relative px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] overflow-hidden`}>
            {/* Dynamic Background Gradient */}
            <div className={`absolute inset-0 opacity-10 bg-gradient-to-r ${activeBandConfig.gradient}`} />
            
            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                    <div className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg
                        bg-gradient-to-br ${activeBandConfig.gradient} text-white
                    `}>
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Generate Sample Answer</h2>
                        <div className="flex items-center gap-2 mt-1 text-sm font-medium text-[rgb(var(--color-text-secondary))]">
                            <span className={`px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider bg-white/10 border border-white/20`}>
                                Tier {commandTermInfo.tier}
                            </span>
                            <span className="opacity-50">•</span>
                            <span className="opacity-80">{tierInfo?.title}</span>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={handleClose} 
                    disabled={isLoading}
                    className="p-2 rounded-xl hover:bg-white/10 text-[rgb(var(--color-text-muted))] hover:text-white transition-colors disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Content Layout */}
        <div className="flex flex-col flex-1 overflow-hidden p-8 space-y-8">
            
            {/* Mark Selection Grid */}
            <div>
                 <h3 className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Target className="w-3.5 h-3.5" /> Select Target Mark
                 </h3>
                 
                 <div className="flex flex-wrap gap-3">
                    {markOptions.map((option) => {
                        const optionBandConfig = getBandConfig(option.band);
                        const isSelected = selectedMark === option.mark;
                        const hasAnswers = option.count > 0;
                        
                        return (
                            <button
                                key={option.mark}
                                onClick={() => !isLoading && setSelectedMark(option.mark)}
                                disabled={isLoading}
                                className={`
                                    relative w-16 h-20 rounded-2xl border-2 transition-all duration-200 ease-out
                                    flex flex-col items-center justify-center gap-1 group
                                    ${isSelected
                                        ? `${optionBandConfig.bg} ${optionBandConfig.border} ${optionBandConfig.glow} transform scale-110 z-10 shadow-lg`
                                        : `bg-[rgb(var(--color-bg-surface-inset))]/50 border-[rgb(var(--color-border-secondary))]/50 opacity-70 hover:opacity-100 hover:scale-105 hover:border-[rgb(var(--color-border-secondary))]`
                                    }
                                `}
                            >
                                <span className={`text-2xl font-black font-mono ${isSelected ? optionBandConfig.text : 'text-[rgb(var(--color-text-secondary))]'}`}>
                                    {option.mark}
                                </span>
                                <span className={`text-[9px] font-black uppercase tracking-wider ${isSelected ? optionBandConfig.text : 'text-[rgb(var(--color-text-muted))]'}`}>
                                    Band {option.band}
                                </span>
                                
                                {/* Indicators */}
                                {hasAnswers && !isSelected && (
                                    <div className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 bg-[rgb(var(--color-bg-surface))] rounded-full text-[9px] border border-[rgb(var(--color-border-secondary))] shadow-sm text-emerald-400">
                                        <Check className="w-2.5 h-2.5" />
                                    </div>
                                )}
                                {isSelected && (
                                     <div className={`absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full text-white shadow-md bg-gradient-to-br ${optionBandConfig.gradient}`}>
                                        <Plus className="w-3 h-3" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                 </div>
            </div>
            
            {/* Context Panel */}
            <div className={`
                flex-1 rounded-2xl border p-6 relative overflow-hidden transition-all duration-500
                ${selectedMark !== null 
                    ? `${activeBandConfig.bg} ${activeBandConfig.border}` 
                    : 'bg-[rgb(var(--color-bg-surface-inset))]/30 border-[rgb(var(--color-border-secondary))] border-dashed'
                }
            `}>
                {selectedMark !== null ? (
                    <div className="animate-fade-in relative z-10">
                         <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className={`
                                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm
                                bg-[rgb(var(--color-bg-surface))] border ${activeBandConfig.border} ${activeBandConfig.text}
                            `}>
                                <Award className="w-3.5 h-3.5" />
                                Expected Result: Band {selectedBand}
                            </span>
                            
                            {isCapped && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Tier Capped
                                </span>
                            )}
                         </div>
                         
                         <p className={`text-sm leading-relaxed font-medium ${activeBandConfig.text} opacity-90 max-w-xl`}>
                            The AI will generate a response specifically tailored to achieve <strong>{selectedMark}/{prompt.totalMarks} marks</strong>. 
                            {selectedMark === 0 
                                ? " This simulates a non-attempt or a response that completely fails to address the criteria." 
                                : ` It will demonstrate the depth, terminology, and structure expected of a Band ${selectedBand} student for this '${prompt.verb}' question.`
                            }
                         </p>

                         {isCapped && selectedMark > 0 && (
                             <div className="mt-4 p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 text-amber-200/80 text-xs leading-relaxed flex gap-3">
                                 <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                                 <div>
                                     <strong className="text-amber-400 block mb-1">Why is this capped?</strong>
                                     The verb '{prompt.verb}' (Tier {commandTermInfo.tier}) limits the maximum complexity. Even with full marks, the response inherently represents a Band {tierInfo?.maxBand} level of cognitive skill.
                                 </div>
                             </div>
                         )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                        <Info className="w-10 h-10 mb-3" />
                        <p className="text-sm font-medium">Select a mark above to configure the generator.</p>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-500/50 bg-red-500/10 flex items-start gap-3 animate-fade-in">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-red-400">Generation Failed</p>
                        <p className="text-xs text-red-300 mt-1 opacity-90">{error}</p>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface))]/80 backdrop-blur-md">
            <button 
                onClick={handleGenerate}
                disabled={isLoading || selectedMark === null}
                className={`
                    w-full py-4 px-6 rounded-xl font-bold text-white text-base tracking-wide
                    transition-all duration-300 flex items-center justify-center gap-3
                    shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0
                    ${selectedMark === null 
                        ? 'bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-muted))] cursor-not-allowed' 
                        : `bg-gradient-to-r ${activeBandConfig.gradient} shadow-[rgba(0,0,0,0.2)] hover:shadow-[rgb(var(--color-accent))/0.2]`
                    }
                `}
            >
                {isLoading ? (
                        <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Crafting Response...</span>
                        </>
                ) : (
                        <>
                        <Sparkles className="w-5 h-5" />
                        <span>Generate Band {selectedBand} Answer</span>
                        </>
                )}
            </button>
        </div>
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
            <div className="w-full max-w-md mx-8">
              <LoadingIndicator 
                messages={[
                  `Analysing '${prompt.verb}' requirements...`,
                  `Targeting ${selectedMark}/${prompt.totalMarks} marks...`,
                  `Calibrating for Band ${selectedBand} standard...`,
                  'Drafting response content...',
                  'Validating against NESA criteria...',
                ]} 
                duration={8}
                band={selectedBand}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SampleAnswerGeneratorModal;
