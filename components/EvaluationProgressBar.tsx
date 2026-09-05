import React, { useEffect, useState, useRef } from 'react';
import { ScanSearch } from 'lucide-react';
import {
  subscribeEvalProgress,
  type EvalProgressEvent,
  type EvalProgressPhase,
} from '../services/aiCore';

const PHASE_MESSAGES: Record<EvalProgressPhase, string> = {
  started: 'Preparing evaluation...',
  sending: 'Sending to AI marker...',
  waiting: 'AI is marking your response...',
  retrying: 'Retrying...',
  fallback: 'Switching model...',
  parsing: 'Processing results...',
  done: 'Complete!',
  error: 'Something went wrong.',
};

const WAITING_HINTS = [
  'Checking command verb demand...',
  'Comparing against rubric...',
  'Calibrating with benchmarks...',
  'Assessing syllabus keywords...',
  'Evaluating structural depth...',
  'Synthesising band justification...',
  'Generating feedback...',
];

const EvaluationProgressBar: React.FC = () => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<EvalProgressPhase>('started');
  const [statusMessage, setStatusMessage] = useState(PHASE_MESSAGES.started);
  const [hintIndex, setHintIndex] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = subscribeEvalProgress((event: EvalProgressEvent) => {
      setPhase(event.phase);
      setStatusMessage(event.message || PHASE_MESSAGES[event.phase]);
    });
    return unsub;
  }, []);

  // Only the open-ended wait rotates hints. Every other phase is a real,
  // reportable state and must show its own message — otherwise "Processing
  // results..." is masked by whichever hint happened to be on screen when the
  // response landed, and the bar keeps claiming the AI is still marking.
  const isWaiting = phase === 'started' || phase === 'sending' || phase === 'waiting';

  useEffect(() => {
    if (!isWaiting) return;
    const interval = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % WAITING_HINTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isWaiting]);

  const displayMessage = isWaiting && elapsedSec >= 5 ? WAITING_HINTS[hintIndex] : statusMessage;

  const isRetrying = phase === 'retrying';
  const isFallback = phase === 'fallback';

  const formatTime = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${displayMessage} ${formatTime(elapsedSec)} elapsed`}
      // Same veil recipe as AiBusyOverlay so the most-seen wait in the app
      // looks like every other one.
      className="absolute inset-0 rounded-[inherit] bg-white/80 dark:bg-[rgb(var(--color-bg-base))]/75 backdrop-blur-xl z-50 flex flex-col items-center justify-center gap-6 animate-fade-in"
    >
      {/* The marking spinner. Previously this wait announced itself with a
          1.5px bar and nothing else — on a projected screen it was invisible,
          and students pressed Evaluate a second time. */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/25 animate-ping" />
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/30 animate-spin-slow" />
        <div
          className="absolute inset-1 rounded-full border-[3px] border-transparent border-t-indigo-500 animate-spin"
          style={{ animationDuration: '1.5s' }}
        />
        <div className="w-14 h-14 rounded-[18px] bg-white dark:bg-slate-800 shadow-lg border border-white/40 dark:border-white/10 flex items-center justify-center">
          <ScanSearch className="w-7 h-7 text-indigo-500 dark:text-indigo-400 animate-pulse" />
        </div>
      </div>

      <div className="w-full max-w-md space-y-3 px-4">
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-colors duration-500 ${
              isRetrying || isFallback
                ? 'bg-amber-500 animate-progress-indeterminate'
                : 'bg-indigo-500 animate-progress-indeterminate'
            }`}
          />
        </div>

        {/* Status line */}
        <p className="t-label text-center font-mono text-slate-500 dark:text-slate-400">
          {displayMessage}
        </p>

        {/* Elapsed time */}
        <p className="text-center text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {formatTime(elapsedSec)}
          {elapsedSec >= 20 && (
            <span className="ml-2 text-slate-400/70 dark:text-slate-600">
              — complex evaluations can take 20-40s
            </span>
          )}
        </p>

        {/* Retry / fallback badge */}
        {(isRetrying || isFallback) && (
          <div className="flex justify-center">
            <span className="t-label inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {isFallback ? 'Switching to faster model' : 'Retrying'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaluationProgressBar;
