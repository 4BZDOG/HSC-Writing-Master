import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QualityCheckResult } from '../types';
import { performQualityCheck } from '../services/geminiService';
import { resolveTarget } from '../services/aiConfig';
import { getModelById } from '../services/aiModels';
import { X, ClipboardCheck, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import AiErrorNotice from './AiErrorNotice';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
} from '../utils/creatorChrome';

/** The shared backdrop, lifted above the modal layer this check can open over. */
const QUALITY_BACKDROP = CREATOR_BACKDROP.replace('z-modal', 'z-modal-elevated');

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
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<QualityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A monotonic token: only the most recently started run may write state, so a
  // superseded run (a retry, or a re-open on new content) can never overwrite a
  // newer one with a stale result. Also covers StrictMode double-invoke.
  const runIdRef = useRef(0);

  // Closing is blocked while a check is in flight — a stray Escape, backdrop
  // click, X or Close must not abandon a run mid-request. Mirrors the sibling
  // generator modals, which route every close through one guarded handler.
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  useEscapeKey(isOpen && !isLoading, onClose);
  useScrollLock(isOpen);

  const runCheck = async () => {
    const runId = (runIdRef.current += 1);
    // Clear any previous outcome up front: without this, a retry that SUCCEEDS
    // still fell through to the error card, because the body renders `error`
    // before `result`.
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      const checkResult = await performQualityCheck(content, contentType);
      if (runIdRef.current === runId) setResult(checkResult);
    } catch (err) {
      if (runIdRef.current === runId) {
        setError(err instanceof Error ? err.message : 'Failed to perform quality check.');
      }
    } finally {
      if (runIdRef.current === runId) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && content) {
      void runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, content, contentType]);

  const handleAutoFix = () => {
    if (result?.refinedContent && onUpdateContent) {
      onUpdateContent(result.refinedContent);
      onClose();
    }
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

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

  // The quality check routes through the 'reasoning' role, which the admin
  // engine selector can point at different providers/models — so name the engine
  // that is actually running, not a hardcoded one. Read at render (never module
  // scope) to stay clear of the eager-read bundle-safety trap.
  const reviewEngineLabel =
    getModelById(resolveTarget('reasoning').model)?.label ?? 'the selected AI engine';

  // What the prompt in `performQualityCheck` asks the model to do, in order: read
  // the content, score it, and list each issue with its fix.
  const subject = contentType === 'code' ? 'code' : 'question';

  return createPortal(
    <div className={QUALITY_BACKDROP} onClick={handleClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quality-check-title"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>{contentType === 'code' ? 'Code' : 'Question'}</p>
            <h2 id="quality-check-title" className={CREATOR_TITLE}>
              Quality check
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
            className={`${CREATOR_CLOSE} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Body */}
        <div className={CREATOR_BODY}>
          {isLoading ? (
            // A minimum height, not a fixed one: the wait card is taller than
            // 256px, and a fixed box centred it out of the top of the body.
            <div className="min-h-[16rem] py-2 flex items-center justify-center">
              <LoadingIndicator
                task="enrichment"
                message="Checking quality"
                messages={[
                  `Reading the ${subject}`,
                  'Scoring its quality',
                  'Listing the issues and how to fix them',
                ]}
                duration={5}
                band={4}
              />
            </div>
          ) : error ? (
            <AiErrorNotice title="Check failed" message={error} onRetry={() => void runCheck()} />
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
                      className={`text-sm font-bold px-2 py-0.5 rounded-lg ${getStatusColor(result.status)}`}
                    >
                      {result.status}
                    </span>
                    <span className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                      Quality score
                    </span>
                  </div>
                  <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed">
                    {result.summary}
                  </p>
                </div>
              </div>

              {/* Issues List */}
              <div>
                <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] mb-3 flex items-center gap-2">
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
                        className="p-4 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-colors group"
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
                              <span className="t-label bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] px-1.5 rounded-lg pt-0.5">
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

          <p className="mt-6 t-label text-[rgb(var(--color-text-dim))] italic">
            Review generated by {reviewEngineLabel}
          </p>
        </div>

        {/* Footer */}
        <div className={CREATOR_FOOTER}>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className={CREATOR_SECONDARY_BUTTON}
          >
            Close
          </button>
          {result?.refinedContent && onUpdateContent && (
            <button type="button" onClick={handleAutoFix} className={CREATOR_PRIMARY_BUTTON}>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Apply auto-fixes
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QualityCheckModal;
