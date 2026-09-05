import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface AiErrorNoticeProps {
  /** Heading for the error card. Defaults to a friendly generic message. */
  title?: string;
  /** The specific failure detail to surface to the user. */
  message: string;
  /** When provided, renders a "Try again" button wired to this handler. */
  onRetry?: () => void;
  /** When provided, renders a "Dismiss" button wired to this handler. */
  onDismiss?: () => void;
}

/**
 * Shared presentational error card for AI generation failures. Matches the
 * project's established red error-card token style (border-red-500/50,
 * bg-red-500/10, AlertTriangle) with the light-mode variants the hand-rolled
 * cards in the generator modals already use.
 *
 * Announced assertively to screen readers so a silent failure never goes
 * unnoticed. Purely presentational — the caller owns the retry/dismiss logic.
 */
const AiErrorNotice: React.FC<AiErrorNoticeProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  onDismiss,
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="p-4 rounded-xl border border-red-500/50 bg-red-500/10 light:bg-red-50 light:border-red-200 flex items-start gap-3 animate-fade-in"
    >
      <AlertTriangle className="w-5 h-5 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-400 light:text-red-700">{title}</p>
        <p className="text-xs text-red-300 light:text-red-600 mt-1 opacity-90">{message}</p>
        {(onRetry || onDismiss) && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-bold text-white bg-red-600/60 hover:bg-red-600 px-3 py-1.5 rounded-lg hover:scale-105 active:scale-[0.98] transition-transform"
              >
                Try again
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs font-bold text-red-300 light:text-red-600 hover:text-white light:hover:text-red-800 px-3 py-1.5 rounded-lg hover:scale-105 active:scale-[0.98] transition-transform"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiErrorNotice;
