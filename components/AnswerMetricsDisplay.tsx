
import React, { useMemo } from 'react';
import { Hash, Target } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface AnswerMetrics {
  wordCount: number;
  keywordStats: { found: number; total: number; percentage: number };
  colourStage: { emoji: string; label: string };
}

interface AnswerMetricsDisplayProps {
  metrics: AnswerMetrics;
  showLabel?: boolean;
  className?: string;
  tier?: number; // Added to support dynamic coloring
}

const AnswerMetricsDisplay: React.FC<AnswerMetricsDisplayProps> = ({ metrics, showLabel = true, className = '', tier }) => {
  const { wordCount, keywordStats, colourStage } = metrics;
  
  // Resolve theme based on tier or default to neutral slate
  const theme = useMemo(() => {
    if (tier) {
        const config = getBandConfig(tier);
        return {
            bg: config.bg,
            border: config.border,
            text: config.text,
            icon: 'opacity-70'
        };
    }
    return {
        bg: 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-white',
        border: 'border-[rgb(var(--color-border-secondary))] light:border-slate-400',
        text: 'text-[rgb(var(--color-text-muted))] light:text-slate-600',
        icon: 'text-slate-400'
    };
  }, [tier]);

  return (
    <div className={`flex items-center flex-wrap gap-2 ${className}`}>
      <span className={`text-[10px] font-bold ${theme.text} ${theme.bg} border ${theme.border} px-2.5 py-1 rounded-lg font-mono flex items-center justify-center gap-1.5 text-center shadow-sm transition-colors duration-300`}>
        <Hash className={`w-3 h-3 ${theme.icon}`} />
        {wordCount} words
      </span>
      
      {keywordStats.total > 0 && (
        <span className={`text-[10px] font-bold ${theme.text} ${theme.bg} border ${theme.border} px-2.5 py-1 rounded-lg flex items-center justify-center gap-1.5 text-center shadow-sm transition-colors duration-300`}>
          <Target className={`w-3 h-3 ${theme.icon}`} />
          <span className='font-mono'>{keywordStats.found}/{keywordStats.total} keywords</span>
          {showLabel && <span className='hidden sm:inline opacity-70 font-sans ml-1'>({colourStage.label})</span>}
        </span>
      )}
    </div>
  );
};

export default AnswerMetricsDisplay;
