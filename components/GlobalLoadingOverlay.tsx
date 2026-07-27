import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import { useScrollLock } from '../hooks/useScrollLock';

interface GlobalLoadingOverlayProps {
  message: string | null;
  error?: string | null;
}

const GlobalLoadingOverlay: React.FC<GlobalLoadingOverlayProps> = ({ message, error }) => {
  const [showError, setShowError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Auto-show/hide error state
  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 5000); // 5s for reading
      return () => clearTimeout(timer);
    } else {
      setShowError(false);
    }
  }, [error]);

  const isErrorState = !!(error && showError);
  const shouldShow = message || isErrorState;

  // Nothing behind a blocking wait should move — least of all a page the
  // student can no longer interact with.
  useScrollLock(!!shouldShow);

  // Guard against rendering before body is available or component is mounted
  if (!shouldShow || !mounted || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-white/80 dark:bg-[rgb(var(--color-bg-base))]/75 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in cursor-wait">
      <div className="relative">
        {/* Animated Glow Background */}
        <div
          className={`absolute inset-0 bg-gradient-to-r ${isErrorState ? 'from-red-500 to-orange-500' : 'from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))]'} rounded-2xl blur-xl opacity-20 animate-pulse-glow`}
        ></div>

        <LoadingIndicator message={message} error={error} isError={isErrorState} />

        {/* Close button for error state */}
        {isErrorState && (
          <button
            onClick={() => setShowError(false)}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 light:hover:bg-slate-200 transition-colors text-[rgb(var(--color-text-muted))]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default GlobalLoadingOverlay;
