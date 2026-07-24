import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { renderFormattedText, getTierScaleConfig, BAND_HEX } from '../utils/renderUtils';
import {
  AlertCircle,
  Target,
  X,
  Sparkles,
  Loader2,
  FileQuestion,
  ChevronRight,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import type { PromptVerb } from '../types';

interface OutcomeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  outcome: CourseOutcome;
  question: string;
  tier?: number;
  verb?: PromptVerb;
  totalMarks?: number;
  breadcrumb?: string[];
}

const OutcomeDetailModal: React.FC<OutcomeDetailModalProps> = ({
  isOpen,
  onClose,
  outcome,
  question,
  tier = 3,
  verb,
  totalMarks,
  breadcrumb,
}) => {
  useEscapeKey(isOpen, onClose);
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bandConfig = useMemo(() => getTierScaleConfig(tier), [tier]);
  const verbInfo = useMemo(() => (verb ? getCommandTermInfo(verb) : null), [verb]);
  const targetBand = useMemo(
    () => (totalMarks && verbInfo ? getTargetBand(totalMarks, verbInfo.tier) : tier),
    [totalMarks, verbInfo, tier]
  );
  const bandHex = BAND_HEX[targetBand as keyof typeof BAND_HEX] || BAND_HEX[3];

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
      className="fixed inset-0 bg-black/60 light:bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[28px] shadow-2xl light:shadow-xl w-full max-w-2xl border border-white/10 light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact header */}
        <div
          className={`px-5 sm:px-6 py-4 border-b border-white/10 light:border-slate-200 bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0`}
        >
          <div
            className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/20 flex-shrink-0">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white tracking-tight leading-tight">
                  {outcome.code}
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60 mt-0.5">
                  Syllabus Outcome
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center flex-shrink-0"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Question context */}
          <div className="rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border border-white/5 light:border-slate-200 p-4">
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-[rgb(var(--color-text-dim))] light:text-slate-400 flex-shrink-0" />
                    )}
                    <span className="text-[10px] font-bold text-[rgb(var(--color-text-dim))] light:text-slate-400 uppercase tracking-wider truncate max-w-[140px]">
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className="flex items-start gap-3">
              <FileQuestion className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-snug">
                  {question}
                </p>
                {verb && totalMarks && (
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: bandHex }}
                    >
                      {verbInfo?.term || verb}
                    </span>
                    <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      {totalMarks} {totalMarks === 1 ? 'mark' : 'marks'} · Band {targetBand}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Outcome description */}
          <div className={`rounded-xl border ${bandConfig.border} ${bandConfig.bg} p-4`}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2">
              What Students Must Demonstrate
            </p>
            <div className="flex items-start gap-3">
              <Target className={`w-4 h-4 ${bandConfig.text} flex-shrink-0 mt-0.5`} />
              <p className="text-[rgb(var(--color-text-primary))] light:text-slate-800 text-sm sm:text-base leading-relaxed font-semibold italic">
                {outcome.description}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 light:via-slate-200 to-transparent" />
            <Sparkles className={`w-3 h-3 ${bandConfig.text} opacity-40`} />
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 light:via-slate-200 to-transparent" />
          </div>

          {/* AI relevance */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-6 h-6 rounded-md ${bandConfig.bg} flex items-center justify-center`}
              >
                <Sparkles className={`w-3 h-3 ${bandConfig.text}`} />
              </div>
              <span className="text-xs font-black text-[rgb(var(--color-text-primary))] light:text-slate-800 tracking-tight">
                How This Outcome Connects
              </span>
            </div>

            <div className="bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 p-4 rounded-xl border border-white/5 light:border-slate-200 min-h-[100px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-28 gap-2.5">
                  <Loader2 className={`w-6 h-6 animate-spin ${bandConfig.text}`} />
                  <p
                    className={`text-[10px] font-black uppercase tracking-[0.15em] ${bandConfig.text} opacity-60 animate-pulse`}
                  >
                    Analysing context...
                  </p>
                </div>
              ) : error ? (
                <div className="bg-red-500/10 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 light:text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-300 light:text-red-700 font-bold">
                      Analysis Failed
                    </p>
                    <p className="text-[11px] text-red-400/70 light:text-red-600/70 mt-0.5">
                      {error}
                    </p>
                    <button
                      onClick={fetchExplanation}
                      className="mt-1.5 text-[11px] font-bold text-red-300 light:text-red-600 hover:text-white light:hover:text-red-800 underline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed">
                  {explanation && renderFormattedText(explanation)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50 border-t border-white/5 light:border-slate-200 flex justify-end rounded-b-[28px] flex-shrink-0">
          <button
            onClick={onClose}
            className={`py-2 px-5 rounded-lg font-bold text-sm text-white tracking-tight bg-gradient-to-r ${bandConfig.gradient} hover:shadow-lg active:scale-[0.97] transition-all`}
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
