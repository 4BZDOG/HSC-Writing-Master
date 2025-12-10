import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { reviseSampleAnswer } from '../services/geminiService';
import { getBandForMark, getCommandTermInfo, TIER_GROUPS } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import { X, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface SampleAnswerRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  sampleToRevise: SampleAnswer;
  existingMarks: number[];
  onRevisionComplete: (revisedAnswer: SampleAnswer) => void;
}

const SampleAnswerRevisionModal: React.FC<SampleAnswerRevisionModalProps> = ({
  isOpen,
  onClose,
  prompt,
  sampleToRevise,
  existingMarks,
  onRevisionComplete,
}) => {
  const availableMarks = useMemo(() => 
    Array.from({ length: prompt.totalMarks + 1 }, (_, i) => i)
      .filter(m => m !== sampleToRevise.mark && !existingMarks.includes(m)),
    [prompt.totalMarks, sampleToRevise.mark, existingMarks]
  );
  
  const [targetMark, setTargetMark] = useState(availableMarks[0] ?? 0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bandConfig = useMemo(() => getBandConfig(sampleToRevise.band), [sampleToRevise.band]);
  
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const tierInfo = useMemo(() => TIER_GROUPS.find(t => t.tier === commandTermInfo.tier), [commandTermInfo.tier]);

  // Calculate the band for the *currently selected* target mark to display in the UI
  const targetBand = useMemo(() => getBandForMark(targetMark, prompt.totalMarks, commandTermInfo.tier), [targetMark, prompt.totalMarks, commandTermInfo.tier]);
  
  // Calculate potential band (uncapped) to detect if capping is active
  const potentialBand = useMemo(() => getBandForMark(targetMark, prompt.totalMarks, 6), [targetMark, prompt.totalMarks]);
  const isCapped = tierInfo && targetBand < potentialBand;

  useEffect(() => {
    if (isOpen) {
      setTargetMark(availableMarks[0] ?? 0);
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen, availableMarks]);

  const handleRevise = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const revisedAnswer = await reviseSampleAnswer(prompt, sampleToRevise, targetMark);
      onRevisionComplete(revisedAnswer);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revise sample answer.');
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

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" 
      onClick={handleClose}
    >
      <div 
        className={`
          bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl 
          w-full max-w-4xl border-2 ${bandConfig.border} border-opacity-50
          animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className={`
            px-6 py-5 border-b-2 ${bandConfig.border} border-opacity-40
            ${bandConfig.bg}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`
                w-10 h-10 rounded-xl bg-gradient-to-br ${bandConfig.gradient} 
                flex items-center justify-center shadow-lg
              `}>
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className={`text-xl font-bold ${bandConfig.text}`}>
                  Revise Sample Answer
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                  Rewrite this answer to achieve a different mark.
                </p>
              </div>
            </div>
            <button 
              onClick={handleClose} 
              disabled={isLoading}
              className="
                w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 
                hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 
                flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Original Answer Section */}
            <div className="flex flex-col">
              <label className={`
                block text-sm font-semibold mb-3 ${bandConfig.text}
              `}>
                Original Answer ({sampleToRevise.mark}/{prompt.totalMarks} marks)
              </label>
              <div className="
                flex-1 bg-[rgb(var(--color-bg-surface-inset))]/50 p-4 rounded-lg border border-[rgb(var(--color-border-secondary))]
                overflow-y-auto text-sm text-[rgb(var(--color-text-secondary))] font-serif
                transition-all duration-200 hover:border-opacity-50 min-h-[12rem]
              ">
                {sampleToRevise.answer}
              </div>
            </div>
            
            {/* Target Mark Section */}
            <div className="flex flex-col">
              <label htmlFor="mark-select" className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] mb-3">
                New Target Mark
              </label>
              <select
                id="mark-select"
                value={targetMark}
                onChange={e => setTargetMark(Number(e.target.value))}
                className="
                  w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] 
                  rounded-lg py-3 px-4 text-[rgb(var(--color-text-primary))]
                  focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50
                  transition-all duration-200 mb-3
                "
              >
                {availableMarks.length > 0 ? (
                  availableMarks.map(mark => {
                     const b = getBandForMark(mark, prompt.totalMarks, commandTermInfo.tier);
                     return (
                        <option key={mark} value={mark}>
                          {mark} / {prompt.totalMarks} (Band {b})
                        </option>
                      )
                  })
                ) : (
                  <option disabled>No other marks available</option>
                )}
              </select>

              {isCapped && (
                 <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs mb-3 animate-fade-in">
                     <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                     <p>
                         <strong>Tier Constraint:</strong> The verb '{prompt.verb}' (Tier {commandTermInfo.tier}) caps the maximum standard at <strong>Band {tierInfo?.maxBand}</strong>. 
                         Even with {targetMark}/{prompt.totalMarks} marks, the revised answer will be written to Band {tierInfo?.maxBand} depth, not higher.
                     </p>
                 </div>
              )}

              <p className="text-xs text-[rgb(var(--color-text-muted))] leading-relaxed">
                The AI will adjust the quality and detail of the original answer to fit the new target mark. 
                Content depth, keyword usage, and example quality will be automatically scaled.
              </p>
            </div>
          </div>
          
          {/* Error State */}
          {error && (
            <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Revision Failed</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
                <button 
                  onClick={() => setError(null)} 
                  className="text-xs text-red-400 hover:text-red-300 underline mt-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--color-text-dim))]">
            <Info className="w-3.5 h-3.5" />
            <span>Revision typically takes 8-20 seconds</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleClose} 
              disabled={isLoading}
              className="
                py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] 
                bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] 
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              Cancel
            </button>
            <button 
              onClick={handleRevise} 
              disabled={availableMarks.length === 0 || isLoading}
              className={`
                py-2.5 px-5 rounded-lg font-semibold ${bandConfig.solidText}
                bg-gradient-to-r ${bandConfig.gradient}
                hover:shadow-lg ${bandConfig.glow}
                active:scale-[0.98]
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none
                flex items-center gap-2
              `}
            >
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Revise with AI</span>
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-md mx-6">
              <LoadingIndicator 
                messages={[
                  'Analysing original response...',
                  'Adjusting quality and depth...',
                  'Aligning to new mark criteria...',
                ]} 
                duration={10}
                band={targetBand}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SampleAnswerRevisionModal;