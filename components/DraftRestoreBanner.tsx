import React from 'react';
import { History, X } from 'lucide-react';
import { describeAge } from '../hooks/useImportDraft';

interface DraftRestoreBannerProps {
  savedAt: number;
  /** What the draft holds, in the user's terms. */
  summary: string;
  onRestore: () => void;
  onDismiss: () => void;
}

/**
 * The offer of an unfinished import, made rather than taken.
 *
 * The age is the whole point: "3 minutes ago" is obviously the crash you just
 * had, "2 days ago" is obviously not, and nobody can tell those apart from a
 * bare "restore draft?".
 */
const DraftRestoreBanner: React.FC<DraftRestoreBannerProps> = ({
  savedAt,
  summary,
  onRestore,
  onDismiss,
}) => (
  <div className="mx-5 mt-4 px-4 py-3 rounded-xl bg-blue-500/10 light:bg-blue-50 border border-blue-500/25 light:border-blue-200 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-in">
    <div className="flex items-start gap-2.5 flex-1 min-w-0">
      <History className="w-4 h-4 text-blue-400 light:text-blue-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-blue-100 light:text-blue-900">
        You have an unfinished import from {describeAge(savedAt)} — {summary}.
      </p>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
      <button
        type="button"
        onClick={onRestore}
        className="py-1.5 px-3.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition"
      >
        Restore it
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Discard the saved draft"
        title="Discard the saved draft"
        className="p-1.5 rounded-lg text-blue-300/70 light:text-blue-500 hover:text-blue-100 light:hover:text-blue-800 hover:bg-blue-500/15 light:hover:bg-blue-100 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

export default DraftRestoreBanner;
