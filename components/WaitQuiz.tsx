import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { quizDeck } from '../utils/waitQuiz';

/**
 * A quick check for the AI waits, so the reader has something to do while the
 * marker works rather than only something to read. A note is read and then
 * forgotten; a question the reader has to answer is remembered, and a 20–40
 * second wait is about long enough for two or three of them. Marking carries
 * it most of all, because that is the wait a student sits through with the
 * most at stake.
 *
 * The questions come from utils/waitQuiz.ts, which follows the NESA glossary of
 * key words, the same glossary the marking prompts follow, so the quiz cannot
 * teach a meaning the marker would not accept. A wrong answer is one of the
 * verbs students most often mix up (describe for explain, compare for
 * contrast), and once an answer is picked the verb's own wait tip is shown as
 * the reason.
 *
 * The streak of right answers is kept in sessionStorage, so it carries from one
 * wait to the next within a session. Storage can throw (private windows, blocked
 * site data), so every read and write is guarded and the streak falls back to
 * memory: the card still plays, it just forgets the streak on reload.
 *
 * Only the answer line is a live region, and it changes only when the reader
 * answers, never on the wait's clock, so it does not talk over the card's own
 * status line. The quiz is native buttons in a section. After an answer, focus
 * moves to "Next question", and after that to the new question's first choice,
 * but only when the reader was already inside the card, so the quiz never takes
 * focus from something else on the page.
 */

/** The session key for the run of right answers, shared by every wait in the tab. */
const STREAK_KEY = 'band6:wait-quiz-streak';

const readStreak = (): number => {
  try {
    const n = Number(window.sessionStorage.getItem(STREAK_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    // Storage refused the read: start the streak from nothing.
    return 0;
  }
};

const writeStreak = (value: number): void => {
  try {
    window.sessionStorage.setItem(STREAK_KEY, String(value));
  } catch {
    // Storage refused the write: the streak still counts in memory for this wait.
  }
};

export interface WaitQuizProps {
  /**
   * The command verb the wait is marking, if any. Its question comes first,
   * because it is the verb the student is waiting on. Left out, the quiz is
   * simply a shuffled run of verbs.
   */
  verb?: string;
  /**
   * The wait's ink colour, for the rule down the card's left edge. Any CSS
   * colour: the rule is mixed with the page through `color-mix`, not by
   * appending an alpha to the value, so a theme token works as well as a hex.
   */
  accent: string;
  /** Extra classes for the card, e.g. to let a short wait drop it. */
  className?: string;
}

const WaitQuiz: React.FC<WaitQuizProps> = ({ verb, accent, className }) => {
  const headingId = useId();
  const promptId = useId();
  const deck = useMemo(() => quizDeck(verb), [verb]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [streak, setStreak] = useState(readStreak);
  const rootRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // Set when "Next question" is pressed from the keyboard's position inside the
  // card: the button unmounts with the answer, so focus would fall to the page.
  const refocusRef = useRef(false);

  // Once an answer lands, move focus to "Next question" if the reader was
  // already inside the card. The choice they picked stays in the DOM (only
  // aria-disabled), so the check can read focus here, after the render.
  useEffect(() => {
    if (picked === null) return;
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) nextRef.current?.focus();
  }, [picked]);

  // The new question's first choice takes focus that "Next question" held.
  useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    groupRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [index]);

  if (deck.length === 0) return null;

  const question = deck[index % deck.length];
  const answered = picked !== null;
  const right = answered && picked === question.answerIndex;
  // Sentence choices (the verb shape) read best as a list; verb choices are
  // short, so they sit in three columns.
  const sentences = question.shape === 'verb';

  const choose = (choice: number): void => {
    if (picked !== null) return;
    const next = choice === question.answerIndex ? streak + 1 : 0;
    writeStreak(next);
    setStreak(next);
    setPicked(choice);
  };

  const advance = (): void => {
    refocusRef.current = !!rootRef.current?.contains(document.activeElement);
    setIndex((i) => (i + 1) % deck.length);
    setPicked(null);
  };

  const choiceClasses = (i: number): string => {
    const base =
      'rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]';
    const align = sentences ? 'text-left' : 'text-center font-medium';
    if (!answered) {
      return `${base} ${align} cursor-pointer border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-[rgb(var(--color-accent))]`;
    }
    if (i === question.answerIndex) {
      return `${base} ${align} cursor-default border-emerald-500/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300`;
    }
    if (i === picked) {
      return `${base} ${align} cursor-default border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300`;
    }
    return `${base} ${align} cursor-default border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 opacity-60`;
  };

  return (
    <section
      ref={rootRef}
      aria-labelledby={headingId}
      className={`cursor-auto rounded-xl bg-surface-inset px-4 py-3.5 text-left ${className ?? ''}`}
      style={{
        boxShadow: `inset 2px 0 0 color-mix(in srgb, ${accent} 55%, transparent)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={headingId} className="t-label text-slate-800 dark:text-slate-200">
          Quick check
        </h4>
        {streak >= 2 && (
          <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {streak} right in a row
          </span>
        )}
      </div>

      {/* Keyed by index, so each new question mounts afresh and fades in. */}
      <div key={index} className="animate-fade-in">
        <p
          id={promptId}
          className="mt-2 text-[15px] font-medium leading-snug text-slate-900 dark:text-slate-100"
        >
          {question.prompt}
        </p>
        <div
          ref={groupRef}
          role="group"
          aria-labelledby={promptId}
          className={`mt-3 ${sentences ? 'flex flex-col gap-2' : 'grid grid-cols-3 gap-2'}`}
        >
          {question.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              // aria-disabled, not disabled: a disabled button drops keyboard
              // focus, and the reader is still moving through the choices.
              aria-disabled={answered ? 'true' : undefined}
              onClick={() => choose(i)}
              className={choiceClasses(i)}
            >
              <span className={`flex items-start gap-2 ${sentences ? '' : 'justify-center'}`}>
                {answered && i === question.answerIndex && (
                  <Check className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                {answered && i === picked && i !== question.answerIndex && (
                  <X className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span>{choice}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="mt-3">
        {answered && (
          <>
            <p
              className={`text-sm font-semibold ${
                right ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              }`}
            >
              {right
                ? 'Right.'
                : question.shape === 'meaning'
                  ? `Not quite. It’s “${question.verb}”.`
                  : 'Not quite.'}
            </p>
            {question.reason && (
              <p className="mt-1 font-serif italic text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                {question.reason}
              </p>
            )}
          </>
        )}
      </div>

      {answered && (
        <button
          ref={nextRef}
          type="button"
          onClick={advance}
          className="mt-2 text-sm font-semibold text-[rgb(var(--color-accent-ink))] hover:underline underline-offset-4 cursor-pointer"
        >
          Next question
        </button>
      )}
    </section>
  );
};

export default WaitQuiz;
