import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DiscardConfirmBarProps {
  /** What is about to be lost, in the user's terms. */
  summary: string;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * The one question asked before an import modal throws work away.
 *
 * Shown in place of the footer rather than as a second dialog on top of the
 * first: a modal over a modal is where the Escape key stops meaning anything
 * predictable, and this appears at the exact moment someone is trying to leave.
 */
const DiscardConfirmBar: React.FC<DiscardConfirmBarProps> = ({ summary, onKeep, onDiscard }) => (
  <div className="px-6 py-4 bg-amber-500/10 light:bg-amber-50 border-t border-amber-500/30 light:border-amber-200 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0">
    <div className="flex items-start gap-2.5 flex-1 min-w-0">
      <AlertTriangle className="w-4 h-4 text-amber-400 light:text-amber-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-200 light:text-amber-800">
        Discard {summary}? This cannot be undone.
      </p>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
      <button
        type="button"
        onClick={onKeep}
        autoFocus
        className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
      >
        Keep editing
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition"
      >
        Discard
      </button>
    </div>
  </div>
);

export default DiscardConfirmBar;
