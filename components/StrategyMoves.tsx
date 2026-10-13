import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import { ladderBandVars } from './LadderRow';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import type { TipMove } from '../utils/strategyTip';
import WordChip from './WordChip';

interface StrategyMovesProps {
  /** The lead move first, then the steps that follow it. */
  method: TipMove[];
  /** Words the tip offers to write with, in the order it gives them. */
  terms: string[];
  /** Sentence templates the tip gives to copy the shape of. */
  examples: string[];
  /** Moves that name a cost or a caveat rather than a step to take. */
  watch: TipMove[];
  /** The band the step numbers are drawn in: the verb's own colour. */
  band: number;
  /** Given, each word is a chip that does something with it. Left out, the words are plain. */
  onInsertWord?: (word: string) => void;
}

const sectionClass = 'py-4 first:pt-0 last:pb-0';
/** Sentence case, not the tracked caps `.t-section` gives: these are the parts of
 *  one answer, and the caps read as a list of separate panels. */
const subheadingClass = 'text-sm font-semibold text-[rgb(var(--color-text-primary))]';

/**
 * How a verb's tip is laid out, as the four parts a student works through:
 * Method, Words to use, Sentence shape and Watch for.
 *
 * This is the same reading of the tip as `HowToAnswer` (the caller derives the
 * parts with `splitMethodMoves` and `collectStrategyDetail`), drawn for a sheet
 * that is read rather than worked beside. It renders the sections without a
 * container, so the caller can put them in whichever card it needs.
 */
const StrategyMoves: React.FC<StrategyMovesProps> = ({
  method,
  terms,
  examples,
  watch,
  band,
  onInsertWord,
}) => {
  const config = getBandConfig(band);
  const bandStyle = ladderBandVars(band);

  return (
    <>
      {method.length > 0 && (
        <section className={sectionClass}>
          <h4 className={subheadingClass}>Method</h4>
          <ol className="mt-3 flex flex-col">
            {method.map((move, i) => {
              const isLead = i === 0;
              const isLast = i === method.length - 1;
              return (
                <li key={move.text} className="flex gap-3">
                  <div className="flex shrink-0 flex-col items-center">
                    <span
                      style={bandStyle}
                      className={`band-edge flex items-center justify-center rounded-full border font-mono font-bold tabular-nums ${config.text} ${
                        isLead ? 'h-7 w-7 text-sm' : 'h-6 w-6 text-xs'
                      }`}
                    >
                      {i + 1}
                    </span>
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="my-1 w-px flex-1 bg-[rgb(var(--color-border-secondary))]"
                      />
                    )}
                  </div>
                  <p
                    className={`min-w-0 font-serif ${PROSE_FLOW} ${
                      isLead
                        ? 'pt-0.5 t-body text-[rgb(var(--color-text-primary))]'
                        : 'pt-1 text-base leading-relaxed text-[rgb(var(--color-text-secondary))]'
                    } ${isLast ? '' : 'pb-4'}`}
                  >
                    {move.text}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {terms.length > 0 && (
        <section className={sectionClass}>
          <h4 className={subheadingClass}>Words to use</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((word) =>
              onInsertWord ? (
                <WordChip key={word} word={word} onInsert={onInsertWord} />
              ) : (
                <span
                  key={word}
                  className="t-label inline-flex items-center min-h-11 sm:min-h-8 px-3 rounded-full border border-[rgb(var(--color-border-primary))] text-[rgb(var(--color-text-primary))]"
                >
                  {word}
                </span>
              )
            )}
          </div>
        </section>
      )}

      {examples.length > 0 && (
        <section className={sectionClass}>
          <h4 className={subheadingClass}>Sentence shape</h4>
          <div className="mt-3 flex flex-col gap-3">
            {examples.map((text) => (
              <blockquote
                key={text}
                className={`border-l-2 border-[rgb(var(--color-border-primary))] pl-3 font-serif italic ${PROSE_BLOCK} t-body text-[rgb(var(--color-text-secondary))]`}
              >
                {text}
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {watch.length > 0 && (
        <section className={sectionClass}>
          <h4 className={`${subheadingClass} flex items-center gap-2`}>
            <AlertTriangle
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            Watch for
          </h4>
          <ul className="mt-3 flex flex-col gap-2">
            {watch.map((move) => (
              <li
                key={move.text}
                className={`font-serif ${PROSE_FLOW} text-base leading-relaxed text-[rgb(var(--color-text-secondary))]`}
              >
                {move.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

export default StrategyMoves;
