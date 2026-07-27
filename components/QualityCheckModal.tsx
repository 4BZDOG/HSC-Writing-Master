import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QualityCheckResult } from '../types';
import { performQualityCheck } from '../services/geminiService';
import {
  X,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Check,
} from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface QualityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  contentType: 'question' | 'code';
  onUpdateContent?: (newContent: string) => void;
}

const QualityCheckModal: React.FC<QualityCheckModalProps> = ({
  isOpen,
  onClose,
  content,
  contentType,
  onUpdateContent,
}) => {
  // Escape closes this modal like every other modal surface.
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<QualityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && content) {
      // Reset state before running new check to avoid stale data flash
      setResult(null);
      setError(null);
      setIsLoading(true);
      runCheck();
    }
  }, [isOpen, content]);

  const runCheck = async () => {
    try {
      const checkResult = await performQualityCheck(content, contentType);
      setResult(checkResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform quality check.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoFix = () => {
    if (result?.refinedContent && onUpdateContent) {
      onUpdateContent(result.refinedContent);
      onClose();
    }
  };

  if (!isOpen) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'WARN':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'FAIL':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Content Quality Check
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Automated review against best practices
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <LoadingIndicator
                task="enrichment"
                message="Running quality check"
                messages={[
                  'Parsing content...',
                  'Checking syntax...',
                  'Validating against standards...',
                ]}
                duration={5}
                band={4}
              />
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg border border-red-500/50 light:border-red-200 bg-red-500/10 light:bg-red-50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 light:text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400 light:text-red-600">Check Failed</p>
                <p className="text-xs text-red-300 light:text-red-500 mt-1">{error}</p>
                <button
                  onClick={() => {
                    setIsLoading(true);
                    runCheck();
                  }}
                  className="mt-3 text-xs font-bold text-white bg-red-600/50 hover:bg-red-600 px-3 py-1.5 rounded transition"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : result ? (
            <div className="space-y-6 animate-fade-in">
              {/* Score Card */}
              <div
                className={`p-5 rounded-xl border ${getStatusColor(result.status)} flex items-center gap-5`}
              >
                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-[rgb(var(--color-bg-surface-inset))]"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className={
                        result.status === 'PASS'
                          ? 'text-green-500'
                          : result.status === 'WARN'
                            ? 'text-amber-500'
                            : 'text-red-500'
                      }
                      strokeDasharray={`${result.score}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  </svg>
                  <span className="absolute text-lg font-bold font-mono">{result.score}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-bold px-2 py-0.5 rounded ${getStatusColor(result.status)}`}
                    >
                      {result.status}
                    </span>
                    <span className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                      Quality Score
                    </span>
                  </div>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed">
                    {result.summary}
                  </p>
                </div>
              </div>

              {/* Issues List */}
              <div>
                <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] mb-3 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Findings (
                  {result.issues.length})
                </h3>

                {result.issues.length === 0 ? (
                  <div className="p-4 rounded-lg bg-green-500/5 light:bg-green-50 border border-green-500/20 light:border-green-200 text-green-300 light:text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" /> No issues found. The content meets all
                    quality standards.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.issues.map((issue, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 border border-[rgb(var(--color-border-secondary))] hover:border-[rgb(var(--color-border-primary))] transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${issue.severity === 'critical' ? 'bg-red-500 shadow-[0_0_5px_red]' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'}`}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[rgb(var(--color-text-primary))]">
                              {issue.message}
                            </p>
                            <p className="text-xs text-[rgb(var(--color-text-muted))] mt-1.5 flex items-start gap-1.5">
                              <span className="bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] px-1.5 rounded font-bold uppercase text-[10px] tracking-wide pt-0.5">
                                Fix
                              </span>
                              {issue.suggestion}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-between items-center flex-shrink-0">
          <div className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-400 italic">
            Review generated by Gemini 2.5 Pro
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Close
            </button>
            {result?.refinedContent && onUpdateContent && (
              <button
                onClick={handleAutoFix}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-95 transition flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Apply Auto-Fixes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QualityCheckModal;
