import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { AlertCircle, Target, X, Sparkles } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';

interface OutcomeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  outcome: CourseOutcome;
  question: string;
}

const OutcomeDetailModal: React.FC<OutcomeDetailModalProps> = ({
  isOpen,
  onClose,
  outcome,
  question,
}) => {
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bandConfig = useMemo(() => getBandConfig(6), []);

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
          bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl 
          w-full max-w-2xl border-2 ${bandConfig.border} ${bandConfig.glow}
          animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`
            px-6 py-5 border-b-2 ${bandConfig.border} border-opacity-40
            bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden
        `}
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
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Outcome Context</h2>
                <p className="text-sm text-white/80 font-mono">{outcome.code}</p>
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

        <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <div
            className={`
                p-5 rounded-xl border-2 ${bandConfig.border} border-opacity-30 
                bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 relative
            `}
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-purple-700 rounded-l-xl"></div>
            <h3 className="text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-2">
              Syllabus Description
            </h3>
            <p className="text-[rgb(var(--color-text-primary))] light:text-slate-800 text-lg leading-relaxed font-medium font-serif">
              {outcome.description}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>Relevance to this Question</span>
            </div>

            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 p-5 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 min-h-[120px] shadow-inner">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-purple-300 light:text-purple-600 animate-pulse">
                    Analysing syllabus context...
                  </p>
                </div>
              ) : error ? (
                <div className="bg-red-900/20 light:bg-red-50 p-4 rounded-lg border border-red-500/30 light:border-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-300 light:text-red-800 font-medium">
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
                <div className="prose prose-sm max-w-none text-[rgb(var(--color-text-secondary))] light:text-slate-700 leading-relaxed font-serif">
                  {explanation && renderFormattedText(explanation)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className={`
                py-2.5 px-6 rounded-xl font-bold text-white shadow-lg
                bg-gradient-to-r ${bandConfig.gradient} 
                hover:shadow-purple-500/20 active:scale-[0.98] transition-all
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
