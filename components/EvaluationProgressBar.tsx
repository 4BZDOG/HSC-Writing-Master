import React, { useEffect, useState, useRef } from 'react';
import { PenLine } from 'lucide-react';
import AiWaitGlyph from './AiWaitGlyph';
import { WAIT_TIPS } from '../utils/waitTips';
import { acquireAiBusy } from '../utils/aiBusySignal';
import {
  subscribeEvalProgress,
  type EvalProgressEvent,
  type EvalProgressPhase,
} from '../services/aiCore';

/**
 * What the marker is doing, from the real events `services/aiCore` emits —
 * unlike the steps on the generic card, these are reported, not paced.
 * Retries and fallbacks keep the event's own message, because that is the one
 * that names the attempt or the model being switched to.
 */
const PHASE_MESSAGES: Record<EvalProgressPhase, string> = {
  started: 'Getting your response ready',
  sending: 'Sending it to the marker',
  waiting: 'The marker is reading your response',
  retrying: 'Trying again',
  fallback: 'Switching to another model',
  parsing: 'Writing up your feedback',
  done: 'Done',
  error: 'Something went wrong',
};

/** Marking usually lands inside this; past it, the card says so. */
const USUAL_SECONDS = 40;
const TIP_SECONDS = 9;

const formatTime = (sec: number): string =>
  sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;

/**
 * The wait after a student presses Evaluate — the most-seen wait in the app.
 *
 * It shares its drawing with the generic card (AiWaitGlyph's weighing ladder:
 * a marker's caret hopping between bands) and its notes (utils/waitTips), but
 * its status line is real: it listens to the evaluation's own progress events
 * and says when it is retrying or has switched model. It used to rotate
 * invented hints ("Calibrating with benchmarks…") over the top of those real
 * states once five seconds had passed.
 */
const EvaluationProgressBar: React.FC = () => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<EvalProgressPhase>('started');
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  // Read at render, not at module scope — `npm run check:eager-reads` holds
  // that line, since an import read during module init is how a chunk cycle
  // renders the page blank.
  const tips = WAIT_TIPS.evaluation;
  const [tipOffset] = useState(() => Math.floor(Math.random() * tips.length));
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
      setEventMessage(event.message || null);
    });
    return unsub;
  }, []);

  useEffect(() => acquireAiBusy(), []);

  const isRetrying = phase === 'retrying';
  const isFallback = phase === 'fallback';
  // 'sending' is followed by nothing until the reply lands, so after a few
  // seconds the honest description is that the marker has it.
  const shownPhase: EvalProgressPhase = phase === 'sending' && elapsedSec >= 3 ? 'waiting' : phase;
  const statusLine =
    (isRetrying || isFallback) && eventMessage
      ? eventMessage.replace(/\.{3}$/, '')
      : PHASE_MESSAGES[shownPhase];
  const overdue = elapsedSec > USUAL_SECONDS;
  const tip = tips[(tipOffset + Math.floor(elapsedSec / TIP_SECONDS)) % tips.length];

  return (
    // Same veil recipe as AiBusyOverlay so the most-seen wait in the app looks
    // like every other one.
    <div className="absolute inset-0 rounded-[inherit] bg-white/80 dark:bg-[rgb(var(--color-bg-base))]/75 backdrop-blur-xl z-50 flex flex-col items-center justify-center gap-5 px-6 animate-fade-in">
      <AiWaitGlyph task="evaluation" accent="#6366f1" />

      <div role="status" aria-live="polite" aria-atomic="true" className="text-center space-y-1">
        <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Marking your response
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{statusLine}</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full w-full rounded-full animate-progress-indeterminate transition-colors duration-500 ${
              isRetrying || isFallback ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
          />
        </div>
        <p className="flex justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>{formatTime(elapsedSec)}</span>
          <span className="text-right">
            {overdue
              ? 'Longer than usual. A detailed answer takes more reading.'
              : 'Usually 20 to 40 seconds'}
          </span>
        </p>
      </div>

      {/* A marker's note in the margin while the real one works. Outside the
          live region, so it is never announced on its own clock. */}
      <figure
        key={tip}
        className="w-full max-w-sm flex gap-3 pl-3 border-l-2 border-indigo-500/40 animate-fade-in"
      >
        <PenLine
          className="w-4 h-4 mt-1 shrink-0 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        />
        <blockquote className="font-serif italic text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          {tip}
        </blockquote>
      </figure>
    </div>
  );
};

export default EvaluationProgressBar;
