import React from 'react';
import { BackgroundTask } from '../types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface BackgroundTaskIndicatorProps {
  task: BackgroundTask | null;
}

const BackgroundTaskIndicator: React.FC<BackgroundTaskIndicatorProps> = ({ task }) => {
  if (!task) {
    return null;
  }

  const getStatusConfig = () => {
    switch (task.status) {
      case 'running':
        return {
          icon: <Loader2 className="w-4 h-4 text-[rgb(var(--color-accent))] animate-spin" />,
          borderColor: 'border-[rgb(var(--color-accent))]/30',
          progressBar:
            'bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))]',
          textColor: 'text-[rgb(var(--color-text-primary))]',
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          borderColor: 'border-emerald-500/30',
          progressBar: 'bg-emerald-500',
          textColor: 'text-emerald-100',
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4 text-red-400" />,
          borderColor: 'border-red-500/30',
          progressBar: 'bg-red-500',
          textColor: 'text-red-100',
        };
      default:
        return {
          icon: null,
          borderColor: 'border-gray-500/30',
          progressBar: 'bg-gray-500',
          textColor: 'text-gray-300',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`
        fixed bottom-20 right-4 z-[400]
        w-80 p-4 rounded-xl
        bg-[rgb(var(--color-bg-surface-elevated))]/80 backdrop-blur-md
        border ${config.borderColor}
        shadow-lg shadow-black/20
        animate-slide-in hover-lift
    `}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="p-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 shrink-0">
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between items-start">
            <h4 className={`text-sm font-bold ${config.textColor} truncate leading-tight`}>
              {task.name}
            </h4>
            <span className="text-[10px] font-mono text-[rgb(var(--color-text-muted))] ml-2">
              {Math.round(task.progress)}%
            </span>
          </div>
          <p className="text-xs text-[rgb(var(--color-text-muted))] truncate mt-0.5">
            {task.message}
          </p>
          {task.status === 'error' && task.error && (
            <p className="text-[10px] text-red-400 mt-1 leading-tight break-words bg-red-900/20 p-1.5 rounded border border-red-500/20">
              {task.error}
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-[rgb(var(--color-bg-surface-inset))] rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]/50">
        <div
          className={`h-full rounded-full transition-all duration-300 relative overflow-hidden ${config.progressBar}`}
          style={{ width: `${task.progress}%` }}
        >
          {task.status === 'running' && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
    </div>
  );
};

export default BackgroundTaskIndicator;
