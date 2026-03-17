import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Prompt } from '../types';
import { renderFormattedText, stripHtmlTags, getBandConfig } from '../utils/renderUtils';
import { Sparkles, Copy, ArrowRight, X, Check, User as UserIcon } from 'lucide-react';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';

interface ImprovementReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  improvedAnswer: string;
  originalAnswer?: string | null;
  originalPrompt: Prompt;
  targetBand: number;
  onApply: (text: string) => void;
}

const ImprovementReviewModal: React.FC<ImprovementReviewModalProps> = ({
  isOpen,
  onClose,
  improvedAnswer,
  originalAnswer,
  originalPrompt,
  targetBand,
  onApply,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const bandConfig = getBandConfig(targetBand);

  const improvedMetrics = useAnswerMetrics(improvedAnswer, originalPrompt.keywords);
  const originalMetrics = useAnswerMetrics(originalAnswer || '', originalPrompt.keywords);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(stripHtmlTags(improvedAnswer));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApply = () => {
    onApply(stripHtmlTags(improvedAnswer));
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[1300] p-4"
      onClick={onClose}
    >
      <div
        className={`
          bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl 
          w-full max-w-6xl border-2 ${bandConfig.border} border-opacity-50
          animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0`}
        >
          {/* Cubic Mesh Texture Overlay */}
          <div
            className="absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  AI Improvement Suggestion
                </h2>
                <div className="flex items-center gap-2 text-white/90 font-medium text-sm">
                  <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
                    Review Changes
                  </span>
                  <span>•</span>
                  <span>Targeting Band {targetBand} Standard</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 flex items-center justify-center group backdrop-blur-sm"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {originalAnswer ? (
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 min-h-0 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50">
              <div className="px-6 py-3 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-100 flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
                  <h3 className="text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 uppercase tracking-wider">
                    Your Original Answer
                  </h3>
                </div>
                <AnswerMetricsDisplay
                  metrics={originalMetrics}
                  showLabel={false}
                  className="scale-90 origin-left opacity-70"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="prose prose-sm sm:prose-base max-w-none text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed font-serif opacity-80 whitespace-pre-wrap">
                  {renderFormattedText(
                    originalAnswer,
                    originalPrompt.keywords,
                    originalPrompt.verb
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50">
              <p className="text-[rgb(var(--color-text-muted))] light:text-slate-400 text-sm italic">
                Original answer not available.
              </p>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 bg-[rgb(var(--color-bg-surface))] light:bg-white">
            <div
              className={`px-6 py-3 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-opacity-10 ${bandConfig.bg} flex flex-col gap-2 flex-shrink-0`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${bandConfig.text}`} />
                <h3 className={`text-xs font-bold uppercase tracking-wider ${bandConfig.text}`}>
                  AI Improved Version
                </h3>
              </div>
              <AnswerMetricsDisplay
                metrics={improvedMetrics}
                showLabel={false}
                className="scale-90 origin-left"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="prose prose-sm sm:prose-base max-w-none text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-relaxed font-serif whitespace-pre-wrap">
                {renderFormattedText(improvedAnswer, originalPrompt.keywords, originalPrompt.verb)}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
          <div className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 hidden sm:block">
            <p className="flex items-center gap-2">
              <Check className="w-3 h-3 text-green-400" />
              Both versions have been auto-saved to Sample Answers.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-none py-2.5 px-5 rounded-xl font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 transition-all hover-scale flex items-center justify-center gap-2 shadow-sm"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {isCopied ? 'Copied' : 'Copy Text'}
            </button>

            <button
              onClick={handleApply}
              className={`
                        flex-1 sm:flex-none py-2.5 px-8 rounded-xl font-bold text-white shadow-lg
                        bg-gradient-to-r ${bandConfig.gradient}
                        hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                        transition-all duration-200 flex items-center justify-center gap-2
                    `}
            >
              <span>Replace My Answer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImprovementReviewModal;
