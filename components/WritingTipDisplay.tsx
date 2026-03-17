import React from 'react';

interface WritingTipDisplayProps {
  tip: string | null;
  onClose: () => void;
  className?: string;
}

const WritingTipDisplay: React.FC<WritingTipDisplayProps> = ({ tip, onClose, className = '' }) => {
  if (!tip) {
    return null;
  }

  return (
    <div
      className={`relative w-full p-4 bg-[rgb(var(--color-bg-surface-elevated))] border border-[rgb(var(--color-accent))]/50 rounded-lg shadow-2xl z-50 animate-fade-in-up-sm ${className}`}
      role="tooltip"
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-[rgb(var(--color-text-muted))] hover:text-white transition-colors"
        aria-label="Close tip"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
      <div className="flex items-start">
        <div className="flex-shrink-0 text-[rgb(var(--color-accent))] text-xl mr-3">💡</div>
        <p className="text-sm text-[rgb(var(--color-text-primary))]">{tip}</p>
      </div>

      {/* Upward pointing triangle border (Outline) */}
      <div className="absolute top-[-6px] right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[rgb(var(--color-accent))]/50"></div>
      {/* Upward pointing triangle fill (Background) */}
      <div className="absolute top-[-4px] right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[rgb(var(--color-bg-surface-elevated))]"></div>
    </div>
  );
};

export default WritingTipDisplay;
