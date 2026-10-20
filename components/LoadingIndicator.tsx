import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getBandHex } from '../utils/renderUtils';
import { getSelectionSnapshot } from '../services/aiConfig';
import { getModelById } from '../services/aiModels';
import { waitNotes } from '../utils/waitTips';
import { acquireAiBusy } from '../utils/aiBusySignal';
import AiWaitGlyph, { WAIT_INK } from './AiWaitGlyph';
import HscResultsCard from './HscResultsCard';
import WaitNoteFigure from './WaitNoteFigure';
import WaitQuiz from './WaitQuiz';

/**
 * The ONE AI progress card. Every AI-backed wait in the app renders this
 * component so waits look and behave identically everywhere:
 *  - a stage at the top of the card: a drawing of the task (AiWaitGlyph) — the
 *    band ladder being weighed for marking, handwriting for generation, a
 *    highlighter for reading — set full-bleed on the inset surface, in place of
 *    the three spinning rings every task used to share;
 *  - the current step in plain words under the title, a segmented track with one
 *    segment per step, and an honest clock: how long it has been, how long it
 *    usually takes, and a plain statement when it is running long, instead of a
 *    bar that crept to 98% and sat there;
 *  - on marking, a quick check (WaitQuiz) the reader answers while the marker
 *    works, so the wait asks something of them rather than only showing a note;
 *  - a short note about HSC writing (utils/waitTips.ts), so the wait teaches
 *    something rather than displaying invented jargon. The notes rotate between
 *    advice and the published HSC numbers (data/hscResultsFacts.ts), and on the
 *    reading waits a quiet card shows how 2025 results fell across the bands;
 *  - the engine the task actually routes to (from the admin's AI Engine
 *    selection), and an optional `band` that inks the stage's top edge, the
 *    segments and the drawing in that band's colour.
 *
 * The card sizes itself to the box it covers (the `ai-wait-stage` of
 * AiBusyOverlay or GlobalLoadingOverlay, see index.css). A wait with a quick
 * check is laid out in two columns when the box is wide and not tiny: the
 * drawing and the header on the left, the quick check on the right. In a short
 * box the drawing goes first and the quick check stays, in a compact form; only
 * a box a few lines tall gives the quick check up. A wait with no quick check
 * drops the results chart, then the note and engine line, then the step list,
 * then the clock, and last the drawing. So a wait over a small dialog is a
 * compact card rather than a tall one with its top and bottom cut off, and a
 * phone gets the full card when it has the height for it. Each part that can go
 * carries an `ai-wait-*` class for that.
 *
 * The pieces are exported (WaitCard, WaitStage, WaitTrack, WaitClock) so that
 * EvaluationProgressBar draws the same card with its own wording.
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
  /**
   * A wait that is not an AI call (reading NESA's own page data). Keeps the card
   * and its steps but leaves out the engine line and the margin notes, which
   * told a teacher "Working with Gemini" while nothing was being asked of it.
   */
  noAi?: boolean;
  /**
   * Whether the card carries the quick check (WaitQuiz) in place of the step
   * list. Defaults to on for marking, the wait a student sits through with the
   * most at stake. It is never shown on an error, a non-AI wait or `noAi`.
   */
  quiz?: boolean;
  /** The command verb being marked. The quick check opens on a question about it. */
  verb?: string;
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

/** Seconds between notes. Long enough to read one twice. */
const TIP_SECONDS = 9;

/**
 * The waits that also show the 2025 results chart: someone is reading a source
 * (syllabus pages, a quality check, a keyword pass), not waiting on their own
 * mark. Marking (`evaluation`) never shows it, because a band distribution
 * beside a student's response being marked could be taken for their own band.
 * Generation (`generation`) does not either: it is the teacher's authoring
 * wait, and the chart would be decoration on it.
 */
const RESULTS_CHART_TASKS: readonly AiTaskType[] = ['enrichment', 'default'];

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

/** The clock's face: `0:07`, `1:02`. */
const formatClock = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/**
 * How long each step is held, in ms. The steps spread across most of the usual
 * time, and no step is shorter than 1.4s or longer than 4s. The timer that walks
 * the steps and the track that fills for them both read it, so they agree.
 */
const stepDuration = (duration: number, stepCount: number): number =>
  Math.max(1400, Math.min(4000, (duration * 1000 * 0.85) / stepCount));

/**
 * The card's outer shell: the surface, the border, the scroll if the box is too
 * short, and the 3px strip along the top edge in the wait's ink. The strip is the
 * band colour for a band card and the app accent otherwise. An error keeps its
 * red treatment and has no strip, because the strip would say "in progress".
 *
 * `cardRef` lands on the card itself, which holds the whole wait, so a caller can
 * scroll the card into view. The card has no role: it is a box, not a region.
 */
export const WaitCard: React.FC<{
  accent: string;
  isError?: boolean;
  /**
   * The card carries the quick check. Its class lets index.css lay the card out
   * in two columns on a wide box, and drop the drawing before the quiz on a short one.
   */
  quiz?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  /**
   * The card's parts, in the order they stack on a narrow box: a `.ai-wait-main`
   * (the drawing and the header) and, on a quiz wait, a `.ai-wait-aside` (the
   * quick check and the note). The aside is the right-hand column when the card splits.
   */
  children: React.ReactNode;
}> = ({ accent, isError = false, quiz = false, cardRef, children }) => (
  <div
    ref={cardRef}
    className={`ai-wait-card relative w-full max-w-[440px] mx-auto overflow-x-hidden overflow-y-auto overscroll-contain rounded-panel shadow-lg border flex flex-col animate-in ${
      quiz ? 'ai-wait-has-quiz ' : ''
    }${
      isError
        ? 'bg-red-50/90 dark:bg-slate-900/90 border-red-200 dark:border-red-500/30'
        : 'bg-white/90 dark:bg-slate-900/90 border-slate-200/80 dark:border-white/10'
    }`}
    style={isError ? undefined : { borderTopColor: accent, borderTopWidth: 3 }}
  >
    {children}
  </div>
);

/**
 * The drawing, set full-bleed across the top of the card on the inset surface.
 * The `ai-wait-glyph` class is what the card's tiers shrink and hide, so the
 * stage's height is theirs to change. The drawing is scaled up inside it
 * (`ai-wait-glyph-scale`, also theirs to change), so it fills the stage rather
 * than sitting small in the middle of it, and the stage clips any overhang.
 */
export const WaitStage: React.FC<{ task: AiTaskType; accent: string }> = ({ task, accent }) => (
  <div className="ai-wait-glyph h-[136px] shrink-0 flex items-center justify-center overflow-hidden bg-surface-inset border-b border-primary">
    <div className="ai-wait-glyph-scale">
      <AiWaitGlyph task={task} accent={accent} />
    </div>
  </div>
);

interface WaitTrackProps {
  /** How many segments: one per step. */
  count: number;
  /** The segment in progress. Those before it are full; those after it are empty. */
  active: number;
  /** The colour of the finished segments and of the one filling. A CSS colour. */
  ink: string;
  /**
   * How long the active segment takes to fill, in ms. Left out, the active
   * segment is indeterminate instead: there is no usual time to fill against.
   */
  stepMs?: number;
  /** The retry and fallback phases: the indeterminate fill goes amber. */
  amber?: boolean;
}

/**
 * The wait's progress, as one segment per step rather than a single bar. A
 * finished segment is full, the one in progress fills across its own step's time,
 * and the rest are empty. When there is no usual time to fill against (or the
 * wait has run past it), the segment in progress runs the indeterminate sweep
 * instead, so the track never claims a percentage it does not know.
 *
 * The last segment fills only to 85% and holds there, with a light sheen across
 * it: the wait is not finished, and a full bar would say it was. The sheen is an
 * opacity and transform animation like the rest, and its resting frame is empty.
 *
 * Aria-hidden: the step in the live region says the same thing, and a track that
 * was read aloud on every step change would talk over it.
 */
export const WaitTrack: React.FC<WaitTrackProps> = ({
  count,
  active,
  ink,
  stepMs,
  amber = false,
}) => (
  <div aria-hidden="true" className="flex items-center gap-3">
    <div className="flex flex-1 gap-1.5 min-w-0">
      {Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        return (
          <span
            key={i}
            className="relative h-1.5 flex-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700"
          >
            {i < active && <span className="absolute inset-0" style={{ backgroundColor: ink }} />}
            {i === active &&
              (stepMs === undefined ? (
                <span
                  className={`absolute inset-0 rounded-full animate-progress-indeterminate ${
                    amber ? 'bg-amber-500' : 'bg-[rgb(var(--color-accent))]'
                  }`}
                  // The class is the marking wait's accent; the style is the band's, which wins.
                  style={amber ? undefined : { backgroundColor: ink }}
                />
              ) : (
                <>
                  <span
                    className="absolute inset-0 origin-left"
                    style={{
                      backgroundColor: ink,
                      animation: `${last ? 'wait-segment-hold' : 'wait-segment-fill'} ${stepMs}ms linear both`,
                    }}
                  />
                  {last && (
                    <span
                      className="ai-wait-segment-sheen absolute inset-y-0 left-0 w-1/3 bg-white/35"
                      style={{ animation: `wait-segment-sheen 2400ms linear ${stepMs}ms infinite` }}
                    />
                  )}
                </>
              ))}
          </span>
        );
      })}
    </div>
    <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
      {`${active + 1} of ${count}`}
    </span>
  </div>
);

/**
 * The elapsed time, large, at the right of the header. It is the one thing on the
 * card that changes every second, so it sits OUTSIDE the live region: a screen
 * reader is told the step, never the time on each tick.
 *
 * `usual` is the line under the clock when the wait has an expected time. Past
 * that time, `overdue` swaps it for a plain amber statement, which is the one
 * thing a long wait needs to hear.
 */
export const WaitClock: React.FC<{
  elapsed: number;
  usual?: string;
  overdue: boolean;
  overdueText: string;
}> = ({ elapsed, usual, overdue, overdueText }) => (
  <div className="ai-wait-clock shrink-0 text-right">
    <p className="text-2xl font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-100">
      {formatClock(elapsed)}
    </p>
    {(overdue || usual) && (
      <p
        className={`mt-1.5 text-xs ${
          overdue
            ? 'ml-auto max-w-[9rem] text-amber-700 dark:text-amber-300'
            : 'ai-wait-usual text-slate-500 dark:text-slate-400'
        }`}
      >
        {overdue ? overdueText : usual}
      </p>
    )}
  </div>
);

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message,
  error,
  isError = false,
  duration: estimate,
  band,
  messages,
  task,
  noAi = false,
  quiz,
  verb,
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
  const isAiWait = !noAi && (task !== undefined || !!message);

  // The marking path routes through the 'reasoning' engine; lighter tasks
  // (parsing, suggestions) route through 'basic'. Read once per render — the
  // card only lives for the duration of one request.
  const engineLabel = useMemo(() => {
    const role = taskType === 'evaluation' || taskType === 'generation' ? 'reasoning' : 'basic';
    return getModelById(getSelectionSnapshot()[role])?.label ?? 'the AI engine';
  }, [taskType]);

  // The quick check replaces the step list: the header and the track already say
  // where the wait is, and the upcoming steps would only compete with the question.
  const showQuiz = !isError && isAiWait && (quiz ?? taskType === 'evaluation');
  // On a quiz wait the margin note is advice only. A fact note would give away the
  // answer to a published-figure question on the card, so only advice rotates there.
  const notes = useMemo(() => {
    const all = waitNotes(taskType);
    return showQuiz ? all.filter((n) => n.kind === 'advice') : all;
  }, [taskType, showQuiz]);
  // A random first note, so the same card does not open on the same sentence.
  const [noteOffset] = useState(() => Math.floor(Math.random() * notes.length));
  const note = notes[(noteOffset + Math.floor(elapsed / TIP_SECONDS)) % notes.length];
  const showResultsChart = isAiWait && RESULTS_CHART_TASKS.includes(taskType);

  // Walk the steps forward, pacing them across the expected duration and
  // holding on the last (a list that loops back reads as a glitch).
  useEffect(() => {
    setStepIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey]);
  useEffect(() => {
    if (isError || steps.length <= 1) return;
    const interval = setInterval(
      () => {
        setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
      },
      stepDuration(duration, steps.length)
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, duration, isError]);

  // The clock, in whole seconds — the only thing it drives is text and the track
  // that fills between steps anyway, so ten renders a second bought nothing.
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

  // With no band in play the ink is the app's accent: a theme token, read at render.
  const accent = !isError && band ? getBandHex(band) : WAIT_INK;
  const overdue = hasEstimate && elapsed > Math.max(duration * 1.25, duration + 4);
  const visibleSteps = steps.slice(0, 5);
  // The timer can run one step past a short list only if the list was longer than
  // the five shown, so the display clamps to the last step it has.
  const current = Math.min(stepIndex, visibleSteps.length - 1);
  // An indeterminate segment when there is no usual time, or the wait has run past it.
  const trackStepMs = overdue || !hasEstimate ? undefined : stepDuration(duration, steps.length);

  // The margin note, the results chart and the engine line. A quiz wait keeps them
  // in the aside under the quick check; any other wait keeps them under its steps.
  const margin =
    !isError && isAiWait ? (
      <>
        {/* The note, in the margin (see WaitNoteFigure). Outside the live
            region, so it is never announced on its own clock. On a quiz wait
            it is the first thing a short box gives up. */}
        <WaitNoteFigure
          key={note.text}
          note={note}
          accent={accent}
          className={showQuiz ? 'ai-wait-note ai-wait-note-with-quiz' : 'ai-wait-note'}
        />

        {showResultsChart && (
          <div className="ai-wait-results">
            <HscResultsCard />
          </div>
        )}

        <p
          className={`ai-wait-engine text-center text-xs text-slate-500 dark:text-slate-400 ${
            showResultsChart ? '' : '-mt-2'
          }`}
        >
          Working with {engineLabel}
        </p>
      </>
    ) : null;

  return (
    <WaitCard accent={accent} isError={isError} quiz={showQuiz}>
      <div className="ai-wait-main flex min-w-0 flex-col">
        {isError ? (
          <div
            className="h-[92px] flex items-center justify-center ai-wait-glyph"
            aria-hidden="true"
          >
            <div className="w-16 h-16 rounded-tile flex items-center justify-center bg-red-100 dark:bg-red-500/15">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
        ) : (
          <WaitStage task={taskType} accent={accent} />
        )}

        <div className="ai-wait-body flex flex-col">
          <div className="flex items-start justify-between gap-4">
            {/* The one live region: the title, and the current step, which a screen
                reader hears with its "Step N of M" prefix. The rotating note is
                outside the region so it is never announced on its own schedule, and
                so is the clock, which would otherwise be read out on every tick. */}
            <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 text-left">
              <h3
                className={`ai-wait-title text-xl font-semibold tracking-tight ${
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
                <p className="mt-1 text-sm font-medium text-[rgb(var(--color-accent-ink))]">
                  <span className="sr-only">
                    Step {current + 1} of {visibleSteps.length}:{' '}
                  </span>
                  <span className="ai-wait-step-text">{visibleSteps[current]}</span>
                </p>
              )}
            </div>

            {!isError && (
              <WaitClock
                elapsed={elapsed}
                usual={
                  hasEstimate
                    ? `Usually about ${formatSeconds(Math.max(1, Math.round(duration)))}`
                    : undefined
                }
                overdue={overdue}
                overdueText="Taking longer than usual. Still working."
              />
            )}
          </div>

          {!isError && (
            <WaitTrack
              count={visibleSteps.length}
              active={current}
              ink={accent}
              stepMs={trackStepMs}
            />
          )}

          {!isError && !showQuiz && (
            /* The steps as a short timeline — it IS a sequence, so it is drawn
               as one: a thread down the left, filled where it has been. Aria-hidden,
               because the live region above already names the step. */
            <ul aria-hidden="true" className="relative space-y-2 pl-1 ai-wait-steps">
              <span className="absolute left-[8px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
              {visibleSteps.map((step, i) => {
                const state = i < current ? 'done' : i === current ? 'active' : 'pending';
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
          )}

          {!showQuiz && margin}
        </div>
      </div>

      {showQuiz && (
        <div className="ai-wait-aside flex min-w-0 flex-col border-primary">
          <WaitQuiz verb={verb} accent={accent} className="ai-wait-quiz" />
          {margin}
        </div>
      )}
    </WaitCard>
  );
};

export default LoadingIndicator;
