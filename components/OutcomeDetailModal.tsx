import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { renderFormattedText, getTierScaleConfig } from '../utils/renderUtils';
import { AlertCircle, Target, X, Sparkles, Loader2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface OutcomeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  outcome: CourseOutcome;
  question: string;
  tier?: number;
}

const OutcomeDetailModal: React.FC<OutcomeDetailModalProps> = ({
  isOpen,
  onClose,
  outcome,
  question,
  tier = 3,
}) => {
  useEscapeKey(isOpen, onClose);
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bandConfig = useMemo(() => getTierScaleConfig(tier), [tier]);

  const fetchExplanation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setExplanation('');
    try {
      const result = await explainOutcomeInContext(question, outcome);
      setExplanation(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not fetch explanation.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [question, outcome]);

  useEffect(() => {
    if (isOpen) {
      fetchExplanation();
    }
  }, [isOpen, fetchExplanation]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className={`
          clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] shadow-2xl
          w-full max-w-2xl border ${bandConfig.border}
          animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`
            px-6 py-5 border-b ${bandConfig.border}
            bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden
        `}
        >
          <div
            className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/30">
                <Target className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">
                  Syllabus Outcome
                </h2>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70 mt-0.5">
                  {outcome.code}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 transition-all duration-200 flex items-center justify-center backdrop-blur-sm mt-0.5"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <div
            className={`
                p-5 rounded-2xl border ${bandConfig.border}
                ${bandConfig.bg} relative
            `}
          >
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2.5">
              Syllabus Description
            </h3>
            <p className="text-[rgb(var(--color-text-primary))] light:text-slate-800 text-base sm:text-lg leading-relaxed font-medium">
              {outcome.description}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg ${bandConfig.bg} flex items-center justify-center`}>
                <Sparkles className={`w-3.5 h-3.5 ${bandConfig.text}`} />
              </div>
              <span className="text-sm font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-tight">
                Relevance to this Question
              </span>
            </div>

            <div className={`bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 p-5 rounded-2xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 min-h-[120px]`}>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <Loader2 className={`w-7 h-7 animate-spin ${bandConfig.text}`} />
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${bandConfig.text} opacity-70 animate-pulse`}>
                    Analysing syllabus context...
                  </p>
                </div>
              ) : error ? (
                <div className="bg-red-900/20 light:bg-red-50 p-4 rounded-xl border border-red-500/30 light:border-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-300 light:text-red-800 font-bold">
                      Analysis Failed
                    </p>
                    <p className="text-xs text-red-400/80 light:text-red-600/80 mt-1">{error}</p>
                    <button
                      onClick={fetchExplanation}
                      className="mt-2 text-xs font-bold text-red-300 light:text-red-600 hover:text-white light:hover:text-red-800 underline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 leading-relaxed">
                  {explanation && renderFormattedText(explanation)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end rounded-b-[32px]">
          <button
            onClick={onClose}
            className={`
                py-2.5 px-6 rounded-xl font-black text-sm text-white tracking-tight
                bg-gradient-to-r ${bandConfig.gradient}
                hover:shadow-lg active:scale-[0.97] transition-all
            `}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OutcomeDetailModal;
