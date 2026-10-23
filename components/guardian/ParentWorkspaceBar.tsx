import React from 'react';

/**
 * The way back from the question workspace to a parent's dashboard. Shown only
 * to a parent who chose "Browse questions", above the normal header.
 */
const ParentWorkspaceBar: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="relative z-10 border-b border-secondary bg-surface-elevated">
    <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
      <p className="text-sm text-secondary">
        You are browsing questions. Your children’s progress is on your dashboard.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="t-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl border border-secondary bg-surface text-primary can-hover:hover:bg-surface-inset touch-manipulation select-none transition-colors"
      >
        Back to your children
      </button>
    </div>
  </div>
);

export default ParentWorkspaceBar;
