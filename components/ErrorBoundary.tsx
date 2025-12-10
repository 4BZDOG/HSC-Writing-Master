
import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { STORAGE_KEYS } from '../utils/storageUtils';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: undefined
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.group('🚨 Error Boundary Caught Exception');
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    
    try {
        if (typeof window !== 'undefined') {
            const statePathRaw = window.localStorage.getItem(STORAGE_KEYS.STATE_PATH);
            if (statePathRaw) {
                const statePath = JSON.parse(statePathRaw);
                console.error('Current Navigation Context (StatePath):', statePath);
            } else {
                console.warn('No StatePath found in localStorage.');
            }
        }
    } catch (e) {
        console.error('Failed to retrieve debug context from storage:', e);
    }
    
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full p-6 rounded-2xl border border-red-500/30 bg-[rgb(var(--color-bg-surface))]/50 backdrop-blur-sm text-red-200 flex flex-col items-center text-center gap-4 shadow-lg animate-fade-in">
            <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 shadow-inner">
                <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-white">Component Error</h3>
                <p className="text-sm text-red-300/80 mt-2 max-w-md mx-auto font-mono bg-black/20 p-2 rounded break-words">
                    {this.state.error?.message || 'An unexpected error occurred while rendering.'}
                </p>
                <p className="text-xs text-red-400/60 mt-1">
                    Check console for debug details.
                </p>
            </div>
            <button 
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
                <RefreshCw className="w-4 h-4" />
                Try Again
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
