
import React from 'react';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';

interface LoadingSpinnerProps {
  message: string | null;
  error?: string | null;
  isError?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, error, isError = false }) => {
  return (
    <div className="relative bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-200 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 min-w-[300px] max-w-md text-center">
      
      {/* Icon */}
      <div className="relative">
        <div className={`w-16 h-16 rounded-full border-4 ${isError ? 'border-red-500/20' : 'border-[rgb(var(--color-bg-surface-inset))] light:border-slate-100'}`}></div>
        {isError ? (
            <div className="absolute inset-0 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500 animate-bounce" />
            </div>
        ) : (
            <>
                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-[rgb(var(--color-accent))] border-r-[rgb(var(--color-primary))] border-b-transparent border-l-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[rgb(var(--color-accent))] light:text-indigo-500 animate-pulse" />
                </div>
            </>
        )}
      </div>

      {/* Text Content */}
      <div className="space-y-2">
        <h3 className={`text-lg font-bold tracking-tight ${isError ? 'text-red-400 light:text-red-600' : 'text-[rgb(var(--color-text-primary))] light:text-slate-900'}`}>
          {isError ? 'Error' : 'AI Processing'}
        </h3>
        <p className={`text-sm font-medium animate-pulse ${isError ? 'text-red-300 light:text-red-700' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600'}`}>
          {isError ? error : message}
        </p>
      </div>

      {/* Decorative Progress Bar (Hide on error) */}
      <div className={`w-full h-1 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 rounded-full overflow-hidden transition-opacity ${isError ? 'opacity-0' : 'opacity-100'}`}>
        <div className="h-full bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] w-1/2 animate-shimmer rounded-full"></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
