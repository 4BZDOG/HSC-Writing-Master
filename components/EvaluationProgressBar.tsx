import React, { useEffect, useMemo, useState, useRef } from 'react';
import { WAIT_INK } from './AiWaitGlyph';
import AiBusyOverlay from './AiBusyOverlay';
import WaitNoteFigure from './WaitNoteFigure';
import WaitQuiz from './WaitQuiz';
import { WaitCard, WaitClock, WaitStage, WaitTrack } from './LoadingIndicator';
import { waitNotes } from '../utils/waitTips';
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

/**
 * The track's three segments are the three real stages of a marking wait: the
 * response going out, the marker reading it, and the feedback being written up.
 * A retry or fallback happens while the marker is reading, so it stays on the
 * middle segment, and the amber colour says it is a second attempt.
 */
const segmentFor = (phase: EvalProgressPhase): number => {
  if (phase === 'started' || phase === 'sending') return 0;
  if (phase === 'parsing' || phase === 'done') return 2;
  return 1;
};

/** Marking usually lands inside this; past it, the card says so. */
const USUAL_SECONDS = 40;
const TIP_SECONDS = 9;
/** The sticky app header's height, plus a little air: the loader must sit clear of it. */
const HEADER_CLEARANCE_PX = 80;

/**
 * The wait after a student presses Evaluate — the most-seen wait in the app.
 *
 * It is the same card as the generic wait (WaitCard, WaitStage, WaitTrack,
 * WaitClock from LoadingIndicator), with its own wording, and it carries the
 * quick check (WaitQuiz) so the student has a question to answer while the
 * marker works. Its status line is real: it listens to the evaluation's own
 * progress events and says when it is retrying or has switched model. It used
 * to rotate invented hints ("Calibrating with benchmarks…") over the top of
 * those real states once five seconds had passed.
 *
 * `verb` is the question's command verb. The quick check opens on a question
 * about it, so the card never quizzes a verb the question did not ask for. The
 * margin notes leave the verb out: its tip comes through the quick check's
 * first question instead, as the reason shown once the student has had a go,
 * so the answer is not given away before they try.
 */
const EvaluationProgressBar: React.FC<{ verb?: string }> = ({ verb }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<EvalProgressPhase>('started');
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  // Read at render, not at module scope — `npm run check:eager-reads` holds
  // that line, since an import read during module init is how a chunk cycle
  // renders the page blank.
  const notes = useMemo(() => waitNotes('evaluation'), []);
  // A random opening note, so the same card does not always open on the same
  // sentence. The verb's own tip is deliberately not among these notes.
  const [noteOffset] = useState(() => Math.floor(Math.random() * notes.length));
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
  // leave the heading and track under the sticky app header. The veil covers the
  // whole writing card, often far taller than the screen, so centring the veil
  // itself could leave its middle off-screen. The card is what has to be seen, so
  // that is what is centred. Only when it is not already clear: a loader in view
  // does not move.
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
  // and its top edge is the header's own edge. The card sits inside the veil and
  // is held to its height, so on a phone it scrolls rather than running off.
  return (
    <AiBusyOverlay show rounded="rounded-b-surface-inner">
      <WaitCard accent={WAIT_INK} cardRef={contentRef}>
        <WaitStage task="evaluation" accent={WAIT_INK} />

        <div className="ai-wait-body flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="min-w-0 flex-1 text-left"
            >
              <h3 className="ai-wait-title text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Marking your response
              </h3>
              <p className="mt-1 text-sm font-medium text-[rgb(var(--color-accent-ink))]">
                <span className="ai-wait-step-text">{statusLine}</span>
              </p>
            </div>

            <WaitClock
              elapsed={elapsedSec}
              usual="Usually 20–40s"
              overdue={overdue}
              overdueText="Longer than usual. A detailed answer takes more reading."
            />
          </div>

          <WaitTrack
            count={3}
            active={segmentFor(shownPhase)}
            ink={WAIT_INK}
            amber={isRetrying || isFallback}
          />

          <WaitQuiz verb={verb} accent={WAIT_INK} className="ai-wait-quiz" />

          {/* A marker's note in the margin while the real one works. Outside the
              live region, so it is never announced on its own clock. No results
              chart here: this is the wait where the student's own band is decided. */}
          <WaitNoteFigure
            key={note.text}
            note={note}
            accent={WAIT_INK}
            className="ai-wait-note ai-wait-note-with-quiz"
          />
        </div>
      </WaitCard>
    </AiBusyOverlay>
  );
};

export default EvaluationProgressBar;
