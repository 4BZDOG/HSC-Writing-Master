import React, { useEffect, useMemo, useState, useRef } from 'react';
import AiWaitGlyph, { WAIT_INK } from './AiWaitGlyph';
import AiBusyOverlay from './AiBusyOverlay';
import WaitNoteFigure from './WaitNoteFigure';
import { verbTipFor, waitNotes } from '../utils/waitTips';
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
/** The sticky app header's height, plus a little air: the loader must sit clear of it. */
const HEADER_CLEARANCE_PX = 80;

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
 *
 * `verb` is the question's command verb. Its tip leads the notes (see
 * `waitNotes`), so the card never explains a verb the question did not ask for.
 */
const EvaluationProgressBar: React.FC<{ verb?: string }> = ({ verb }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<EvalProgressPhase>('started');
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  // Read at render, not at module scope — `npm run check:eager-reads` holds
  // that line, since an import read during module init is how a chunk cycle
  // renders the page blank.
  const notes = useMemo(() => waitNotes('evaluation', verb), [verb]);
  // A verb with its own tip opens on that tip, since it is the one about what
  // the student is waiting on. Otherwise the opening note is random, so the
  // same card does not always open on the same sentence.
  const [noteOffset] = useState(() =>
    verbTipFor(verb) !== undefined ? 0 : Math.floor(Math.random() * notes.length)
  );
  const startRef = useRef(Date.now());
  const contentRef = useRef<HTMLDivElement>(null);

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

  // On a phone the page stays scrolled where Evaluate was pressed, which can
  // leave the heading and bar under the sticky app header. The veil covers the
  // whole writing card, often far taller than the screen, so centring the veil
  // itself could leave its middle off-screen. The content block is what has to
  // be seen, so that is what is centred. Only when it is not already clear: a
  // loader in view does not move.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const r = el.getBoundingClientRect();
    const clear = r.top >= HEADER_CLEARANCE_PX && r.bottom <= window.innerHeight;
    if (clear) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, []);

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
  const note = notes[(noteOffset + Math.floor(elapsedSec / TIP_SECONDS)) % notes.length];

  // The veil is the shared AiBusyOverlay, so this wait is the same object as
  // every other one. It is laid over the writing card's body, below the header
  // (see Editor), which is why its bottom corners take the card's INNER radius
  // and its top edge is the header's own edge.
  return (
    <AiBusyOverlay show rounded="rounded-b-surface-inner">
      <div ref={contentRef} className="flex flex-col items-center gap-5 text-center">
        <AiWaitGlyph task="evaluation" accent={WAIT_INK} />

        <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1">
          <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Marking your response
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{statusLine}</p>
        </div>

        <div className="w-full max-w-sm space-y-2">
          <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full w-full rounded-full animate-progress-indeterminate transition-colors duration-500 ${
                isRetrying || isFallback ? 'bg-amber-500' : 'bg-[rgb(var(--color-accent))]'
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
            live region, so it is never announced on its own clock. No results
            chart here: this is the wait where the student's own band is decided. */}
        <div className="w-full max-w-sm">
          <WaitNoteFigure key={note.text} note={note} accent={WAIT_INK} />
        </div>
      </div>
    </AiBusyOverlay>
  );
};

export default EvaluationProgressBar;
