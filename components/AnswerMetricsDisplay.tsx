
import React from 'react';
import { Hash, Target } from 'lucide-react';

interface AnswerMetrics {
  wordCount: number;
  keywordStats: { found: number; total: number; percentage: number };
  colourStage: { emoji: string; label: string };
}

interface AnswerMetricsDisplayProps {
  metrics: AnswerMetrics;
  showLabel?: boolean;
  className?: string;
}

const AnswerMetricsDisplay: React.FC<AnswerMetricsDisplayProps> = ({ metrics, showLabel = true, className = '' }) => {
  const { wordCount, keywordStats, colourStage } = metrics;
  return (
    <div className={`flex items-center flex-wrap gap-3 ${className}`}>
      <span className='text-[10px] font-bold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] px-2.5 py-1 rounded-md font-mono flex items-center justify-center gap-1.5 text-center shadow-sm'>
        <Hash className="w-3 h-3" />
        {wordCount} words
      </span>
      
      {keywordStats.total > 0 && (
        <span className='text-[10px] font-bold text-[rgb(var(--color-text-secondary))] bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] px-2.5 py-1 rounded-md flex items-center justify-center gap-1.5 text-center shadow-sm'>
          <Target className="w-3 h-3" />
          <span className='font-mono'>{keywordStats.found}/{keywordStats.total} keywords</span>
          {showLabel && <span className='hidden sm:inline text-[rgb(var(--color-text-dim))] font-sans ml-1'>({colourStage.label})</span>}
        </span>
      )}
    </div>
  );
};

export default AnswerMetricsDisplay;
