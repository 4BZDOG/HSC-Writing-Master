import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, PenLine } from 'lucide-react';
import { getBandHex } from '../utils/renderUtils';
import { getSelectionSnapshot } from '../services/aiConfig';
import { getModelById } from '../services/aiModels';
import { WAIT_TIPS } from '../utils/waitTips';
import { acquireAiBusy } from '../utils/aiBusySignal';
import AiWaitGlyph from './AiWaitGlyph';

/**
 * The ONE AI progress card. Every AI-backed wait in the app renders this
 * component so waits look and behave identically everywhere:
 *  - a drawing of the task at the top (AiWaitGlyph) — the band ladder being
 *    weighed for marking, handwriting for generation, a highlighter for
 *    reading — in place of the three spinning rings every task used to share;
 *  - the steps of the task in plain words, and an honest clock: how long it
 *    has been, how long it usually takes, and a plain statement when it is
 *    running long, instead of a bar that crept to 98% and sat there;
 *  - a short note about HSC writing (utils/waitTips.ts), so the wait teaches
 *    something rather than displaying invented jargon;
 *  - the engine the task actually routes to (from the admin's AI Engine
 *    selection), and an optional `band` that inks the drawing and bar in that
 *    band's colour.
 */

export type AiTaskType = 'evaluation' | 'generation' | 'enrichment' | 'default';

interface LoadingIndicatorProps {
  message?: string | null;
  error?: string | null;
  isError?: boolean;
  /** Estimated duration in seconds. Paces the steps; when given, the card also
   *  shows it as "usually about …" and says when a wait has run past it. */
  duration?: number;
  /** Target band accent (e.g. exemplar regeneration). Uses BAND_HEX. */
  band?: number;
  /** Custom step lines; overrides the task-derived defaults. */
  messages?: string[];
  /** Explicit task type. Falls back to sniffing the message when omitted. */
  task?: AiTaskType;
}

/**
 * What the AI is asked to do, in the order it is asked, in the reader's words.
 *
 * These used to read like a pipeline log — "Optimising heuristic constraints…",
 * "Verifying output integrity…" — which sounded busy and meant nothing. The
 * steps are paced by the clock, not reported by the model, so they are worded
 * as what the marker is doing, not as proof that it has done it.
 */
const TASK_STEPS: Record<AiTaskType, string[]> = {
  evaluation: [
    'Reading your response',
    'Checking what the command verb asks for',
    'Matching it against the marking criteria',
    'Weighing up a band',
    'Writing your feedback',
  ],
  generation: [
    'Reading the syllabus outcomes',
    'Choosing a scenario',
    'Pitching it to the command verb',
    'Writing it out',
    'Drafting the marking guidelines',
  ],
  enrichment: [
    'Reading the source',
    'Picking out the key terms',
    'Checking it against the syllabus',
    'Tidying up the result',
  ],
  default: ['Sending the request', 'Waiting on the AI', 'Checking the reply', 'Nearly there'],
};

const TASK_TITLE: Record<AiTaskType, string> = {
  evaluation: 'Marking your response',
  generation: 'Writing',
  enrichment: 'Reading',
  default: 'Working on it',
};

/** Indigo-500: the neutral ink when no band is in play. */
const DEFAULT_ACCENT = '#6366f1';

/** Seconds between notes. Long enough to read one twice. */
const TIP_SECONDS = 9;

/** Infer the task type from a status message when no explicit task is given. */
const sniffTask = (message?: string | null): AiTaskType => {
  const msg = message?.toLowerCase() || '';
  if (msg.includes('evaluat') || msg.includes('marking')) return 'evaluation';
  if (msg.includes('generat') || msg.includes('drafting') || msg.includes('regenerat'))
    return 'generation';
  if (
    msg.includes('enrich') ||
    msg.includes('analyzing') ||
    msg.includes('analysing') ||
    msg.includes('parsing')
  )
    return 'enrichment';
  return 'default';
};

const formatSeconds = (sec: number): string =>
  sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message,
  error,
  isError = false,
  duration: estimate,
  band,
  messages,
  task,
}) => {
  // Without an estimate the steps are paced as a five-second job, but the card
  // does not SAY five seconds: several call sites leave it out, and "usually
  // about 5s" on a fifteen-second request would be a claim nobody made.
  const duration = estimate ?? 5;
  const hasEstimate = estimate !== undefined;
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const taskType: AiTaskType = task ?? sniffTask(message);
  const steps = messages && messages.length > 0 ? messages : TASK_STEPS[taskType];
  // Content key, NOT array identity: callers pass inline `messages` arrays, so
  // keying the effects on the array itself restarts the timer every parent
  // re-render — fast-re-rendering parents would freeze the steps on the first.
  const stepsKey = steps.join('¦');

  // A wait identified as AI work — an explicit task or a titled message. Plain
  // data loads that pass only custom step lines are not, and skip the notes,
  // the engine line and the aurora's lean.
  const isAiWait = task !== undefined || !!message;

  // The marking path routes through the 'reasoning' engine; lighter tasks
  // (parsing, suggestions) route through 'basic'. Read once per render — the
  // card only lives for the duration of one request.
  const engineLabel = useMemo(() => {
    const role = taskType === 'evaluation' || taskType === 'generation' ? 'reasoning' : 'basic';
    return getModelById(getSelectionSnapshot()[role])?.label ?? 'the AI engine';
  }, [taskType]);

  const tips = WAIT_TIPS[taskType];
  // A random first note, so the same card does not open on the same sentence.
  const [tipOffset] = useState(() => Math.floor(Math.random() * tips.length));
  const tip = tips[(tipOffset + Math.floor(elapsed / TIP_SECONDS)) % tips.length];

  // Walk the steps forward, pacing them across the expected duration and
  // holding on the last (a list that loops back reads as a glitch).
  useEffect(() => {
    setStepIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey]);
  useEffect(() => {
    if (isError || steps.length <= 1) return;
    const stepMs = Math.max(1400, Math.min(4000, (duration * 1000 * 0.85) / steps.length));
    const interval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }, stepMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, duration, isError]);

  // The clock, in whole seconds — the only thing it drives is text and a bar
  // that eases between steps anyway, so ten renders a second bought nothing.
  useEffect(() => {
    if (isError) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [isError]);

  // The background leans in for as long as a real AI wait is on screen.
  useEffect(() => {
    if (isError || !isAiWait) return;
    return acquireAiBusy();
  }, [isError, isAiWait]);

  const accent = !isError && band ? getBandHex(band) : DEFAULT_ACCENT;
  const overdue = hasEstimate && elapsed > Math.max(duration * 1.25, duration + 4);
  const progress = Math.min(92, (elapsed / Math.max(1, duration)) * 92);
  const visibleSteps = steps.slice(0, 5);

  return (
    <div
      className={`relative w-full max-w-[400px] mx-auto overflow-hidden rounded-panel shadow-lg backdrop-blur-3xl border p-8 sm:p-9 flex flex-col gap-6 animate-in ${
        isError
          ? 'bg-red-50/90 dark:bg-slate-900/90 border-red-200 dark:border-red-500/30'
          : 'bg-white/90 dark:bg-slate-900/90 border-slate-200/80 dark:border-white/10'
      }`}
    >
      {isError ? (
        <div className="h-[92px] flex items-center justify-center" aria-hidden="true">
          <div className="w-16 h-16 rounded-tile flex items-center justify-center bg-red-100 dark:bg-red-500/15">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>
      ) : (
        <AiWaitGlyph task={taskType} accent={accent} />
      )}

      {/* The one live region: the title, and the current step for a screen
          reader. The step list below is the same fact drawn for the eye, so
          it is hidden from assistive tech rather than read out twice; the
          rotating note is outside the region so it is never announced on its
          own schedule. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="text-center">
        <h3
          className={`text-lg font-semibold tracking-tight ${
            isError ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {isError ? 'The AI request did not finish' : message || TASK_TITLE[taskType]}
        </h3>
        {isError ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {error || 'Try again in a moment.'}
          </p>
        ) : (
          <p className="sr-only">
            Step {stepIndex + 1} of {visibleSteps.length}: {visibleSteps[stepIndex]}
          </p>
        )}
      </div>

      {!isError && (
        <>
          {/* The steps as a short timeline — it IS a sequence, so it is drawn
              as one: a thread down the left, filled where it has been. */}
          <ul aria-hidden="true" className="relative space-y-2 pl-1">
            <span className="absolute left-[8px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
            {visibleSteps.map((step, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending';
              return (
                <li key={i} className="relative flex items-center gap-3">
                  <span className="relative w-[10px] h-[10px] shrink-0 flex items-center justify-center">
                    {state === 'active' && (
                      <span
                        className="absolute inset-[-4px] rounded-full opacity-30 animate-ping"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    <span
                      className={`w-[10px] h-[10px] rounded-full border-2 transition-colors duration-500 ${
                        state === 'pending'
                          ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                          : ''
                      }`}
                      style={
                        state === 'pending'
                          ? undefined
                          : {
                              borderColor: accent,
                              backgroundColor: state === 'done' ? accent : 'transparent',
                            }
                      }
                    />
                  </span>
                  <span
                    className={`text-sm truncate transition-colors duration-500 ${
                      state === 'active'
                        ? 'text-slate-900 dark:text-slate-100 font-medium'
                        : state === 'done'
                          ? 'text-slate-600 dark:text-slate-400'
                          : 'text-slate-500 dark:text-slate-500'
                    }`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* An honest clock. The bar fills against the usual time and stops
              short of the end; past it, it says so in words instead of
              pretending — the one thing a long wait needs to hear. */}
          <div className="space-y-2">
            <div className="h-1 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
              {overdue || !hasEstimate ? (
                <div
                  className="h-full w-full rounded-full animate-progress-indeterminate"
                  style={{ backgroundColor: accent }}
                />
              ) : (
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress}%`, backgroundColor: accent }}
                />
              )}
            </div>
            {elapsed >= 2 && (
              <p className="flex justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>{formatSeconds(elapsed)}</span>
                {hasEstimate && (
                  <span className="text-right">
                    {overdue
                      ? 'Taking longer than usual. Still working.'
                      : `Usually about ${formatSeconds(Math.max(1, Math.round(duration)))}`}
                  </span>
                )}
              </p>
            )}
          </div>

          {isAiWait && (
            <>
              {/* The note, set as a marker's comment in the margin — in the
                  serif italic written feedback is set in — so it reads as
                  advice rather than as another status line. */}
              <figure
                key={tip}
                className="flex gap-3 pl-3 border-l-2 animate-fade-in"
                style={{ borderColor: `${accent}66` }}
              >
                <PenLine
                  className="w-4 h-4 mt-1 shrink-0 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <blockquote className="font-serif italic text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {tip}
                </blockquote>
              </figure>

              <p className="-mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                Working with {engineLabel}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default LoadingIndicator;
