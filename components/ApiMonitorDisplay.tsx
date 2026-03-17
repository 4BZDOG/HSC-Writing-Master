import React, { useState } from 'react';
import { Zap, Hash, BarChart, X, RotateCcw } from 'lucide-react';
import { useApiMonitor } from '../hooks/useApiMonitor';
import { apiMonitor } from '../services/geminiService';

const formatTokens = (tokens: number): string => {
  if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
};

const ApiMonitorDisplay: React.FC = () => {
  const { sessionCalls, sessionTokens, totalCalls, totalTokens } = useApiMonitor();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleResetSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    apiMonitor.resetSession();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[500] select-none font-sans">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="
            flex items-center gap-4 px-4 py-2 rounded-full 
            bg-[rgb(var(--color-bg-surface-elevated))]/80 backdrop-blur-md 
            border border-[rgb(var(--color-border-accent))]/30
            shadow-lg hover:shadow-[rgb(var(--color-accent))]/20 hover:border-[rgb(var(--color-border-accent))]/60
            transition-all duration-300 animate-fade-in 
            text-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent-glow))]
            hover-lift
          "
          title="Show API Usage Details"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Zap className="w-3.5 h-3.5" />
            <span className="font-mono">{sessionCalls}</span>
          </div>
          <div className="w-px h-3 bg-[rgb(var(--color-border-secondary))]" />
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Hash className="w-3.5 h-3.5" />
            <span className="font-mono">{formatTokens(sessionTokens)}</span>
          </div>
        </button>
      ) : (
        <div
          className="
            w-72 p-5 rounded-2xl 
            bg-[rgb(var(--color-bg-surface-elevated))]/90 backdrop-blur-xl 
            border border-[rgb(var(--color-border-accent))]/30
            shadow-2xl animate-fade-in-up ring-1 ring-[rgb(var(--color-accent))]/10
          "
          role="dialog"
          aria-labelledby="api-monitor-title"
        >
          <div className="flex justify-between items-center mb-4 border-b border-[rgb(var(--color-border-secondary))]/50 pb-3">
            <h3
              id="api-monitor-title"
              className="flex items-center gap-2 text-sm font-black text-[rgb(var(--color-accent))] uppercase tracking-wide"
            >
              <BarChart className="w-4 h-4" />
              API Telemetry
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-muted))] hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 rounded-xl p-3 border border-[rgb(var(--color-border-secondary))]/30">
              <div className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Current Session
              </div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] font-medium">
                  Requests
                </span>
                <span className="font-mono text-sm font-bold text-white">{sessionCalls}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] font-medium">
                  Tokens
                </span>
                <span className="font-mono text-sm font-bold text-[rgb(var(--color-accent))]">
                  {formatTokens(sessionTokens)}
                </span>
              </div>
            </div>

            <div className="px-3 pt-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-dim))]">Lifetime Calls</span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
                  {totalCalls}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-dim))]">Lifetime Tokens</span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
                  {formatTokens(totalTokens)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleResetSession}
            className="w-full mt-4 text-xs font-bold flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-secondary))] hover:text-white hover:bg-[rgb(var(--color-border-secondary))] transition-all active:scale-95 hover:shadow-md border border-[rgb(var(--color-border-secondary))]/30"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Session Metrics
          </button>
        </div>
      )}
    </div>
  );
};

export default ApiMonitorDisplay;
