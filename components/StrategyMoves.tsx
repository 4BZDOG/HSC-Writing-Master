import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import { ladderBandVars } from './LadderRow';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import { displayStepText, type TipMove } from '../utils/strategyTip';
import WordChip from './WordChip';

/**
 * Where the tip is drawn. The verb sheet reads it as a document: sentence-case
 * subheads, the lead at body size. The writing area draws the same parts under
 * the verb's row, smaller, with the tracked section heads it has always had.
 * Only the type scale differs; the structure is one piece of markup.
 */
export type StrategyMovesVariant = 'sheet' | 'worked';

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
  /** Defaults to the verb sheet's scale. */
  variant?: StrategyMovesVariant;
}

const sectionClass = 'py-4 first:pt-0 last:pb-0';

/** Sentence case, not the tracked caps `.t-section` gives: these are the parts of
 *  one answer, and the caps read as a list of separate panels. The writing area
 *  keeps `.t-section` because it sits in a smaller card with a caption above it.
 *  A function, not a table: the prose constants it reads are imports, and an
 *  import read at module init can sit on a chunk cycle. */
const scaleFor = (variant: StrategyMovesVariant) =>
  variant === 'worked'
    ? {
        Heading: 'h3' as const,
        subheading: 't-section text-[rgb(var(--color-text-primary))]',
        // Every step is the same size and ink. The lead used to be set larger and
        // darker than the steps after it, which read as two kinds of text in one
        // list; the numbered badge is the only thing that marks the order now.
        // The measure caps the text, not the card: the card takes the row's width
        // and a line of this serif stops at about 70 letters. The cap is in `ch`
        // (52ch at 14px is about 70 letters in Newsreader; 70ch would be about 95).
        lead: `pt-1 text-sm leading-relaxed text-[rgb(var(--color-text-primary))] max-w-[52ch]`,
        step: `pt-1 text-sm leading-relaxed text-[rgb(var(--color-text-primary))] max-w-[52ch]`,
        badge: { lead: 'h-6 w-6 text-xs', step: 'h-6 w-6 text-xs' },
        // No `text-pretty` in the worked card. These are a line or two in a card
        // narrower than the measure, and Safari's `pretty` evens every line of a
        // short paragraph rather than only the last, so on an iPhone each step
        // stopped well short of the card's edge. `wrap` is the plain fill.
        wrap: '',
        example: `text-sm leading-relaxed max-w-[52ch]`,
        watch: `text-sm leading-relaxed max-w-[52ch]`,
      }
    : {
        Heading: 'h4' as const,
        subheading: 'text-sm font-semibold text-[rgb(var(--color-text-primary))]',
        lead: 'pt-0.5 t-body text-[rgb(var(--color-text-primary))]',
        step: 'pt-1 text-base leading-relaxed text-[rgb(var(--color-text-secondary))]',
        badge: { lead: 'h-7 w-7 text-sm', step: 'h-6 w-6 text-xs' },
        wrap: PROSE_FLOW,
        example: `${PROSE_BLOCK} t-body`,
        watch: `${PROSE_FLOW} text-base leading-relaxed`,
      };

/**
 * How a verb's tip is laid out, as the four parts a student works through:
 * Method, Words to use, Sentence shape and Watch for.
 *
 * The caller derives the parts with `splitMethodMoves` and `collectStrategyDetail`.
 *
 * The worked card lays them out in two columns from `md` up: Method and Words to
 * use on the left, Sentence shape and Watch for on the right, with a rule between
 * them. Below `md`, or when there is nothing for the right column, the parts stack
 * in one column. The verb sheet keeps its single column, with no card around it.
 */
const StrategyMoves: React.FC<StrategyMovesProps> = ({
  method,
  terms,
  examples,
  watch,
  band,
  onInsertWord,
  variant = 'sheet',
}) => {
  const config = getBandConfig(band);
  const bandStyle = ladderBandVars(band);
  const scale = scaleFor(variant);
  const { Heading } = scale;
  const worked = variant === 'worked';

  // The rules between the parts. Light uses the border token, which is slate-500
  // there, the card's own edge. Dark's token is pure white, brighter than the
  // card's white/40 edge, so the rules step down to white/20.
  const divider = 'divide-[rgb(var(--color-border-secondary))] dark:divide-white/20';
  const edge = 'border-[rgb(var(--color-border-secondary))] dark:border-white/20';

  const methodSection = method.length > 0 && (
    <section key="method" className={sectionClass}>
      <Heading className={scale.subheading}>Method</Heading>
      {worked && method.length === 1 ? (
        // One step is a sentence, not a numbered list of one. It stays a
        // paragraph, so the text is still read as the method.
        <p className={`mt-3 min-w-0 font-serif ${scale.wrap} ${scale.lead}`}>
          {displayStepText(method[0].text)}
        </p>
      ) : (
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
                      isLead ? scale.badge.lead : scale.badge.step
                    }`}
                  >
                    {i + 1}
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="my-1 w-px flex-1 bg-[rgb(var(--color-border-secondary))] dark:bg-white/20"
                    />
                  )}
                </div>
                <p
                  className={`min-w-0 font-serif ${scale.wrap} ${
                    isLead ? scale.lead : scale.step
                  } ${isLast ? '' : 'pb-4'}`}
                >
                  {displayStepText(move.text)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  const wordsSection = terms.length > 0 && (
    <section key="words" className={sectionClass}>
      <Heading className={scale.subheading}>Words to use</Heading>
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
  );

  const shapeSection = examples.length > 0 && (
    <section key="shape" className={sectionClass}>
      <Heading className={scale.subheading}>Sentence shape</Heading>
      <div className="mt-3 flex flex-col gap-3">
        {examples.map((text) => (
          <blockquote
            key={text}
            className={`border-l-2 border-[rgb(var(--color-border-primary))] pl-3 font-serif italic text-[rgb(var(--color-text-secondary))] ${scale.example}`}
          >
            {text}
          </blockquote>
        ))}
      </div>
    </section>
  );

  const watchSection = watch.length > 0 && (
    <section key="watch" className={sectionClass}>
      <Heading className={`${scale.subheading} flex items-center gap-2`}>
        <AlertTriangle
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        />
        Watch for
      </Heading>
      <ul className="mt-3 flex flex-col gap-2">
        {watch.map((move) => (
          <li
            key={move.text}
            className={`font-serif text-[rgb(var(--color-text-secondary))] ${scale.watch}`}
          >
            {move.text}
          </li>
        ))}
      </ul>
    </section>
  );

  // The verb sheet is one column, as it always was.
  if (!worked) {
    return (
      <>
        {methodSection}
        {wordsSection}
        {shapeSection}
        {watchSection}
      </>
    );
  }

  const left = [methodSection, wordsSection].filter(Boolean);
  const right = [shapeSection, watchSection].filter(Boolean);

  // Nothing for the right column: Method and its words take the full width,
  // as one column with rules between the parts.
  if (left.length === 0 || right.length === 0) {
    return <div className={`divide-y ${divider}`}>{[...left, ...right]}</div>;
  }

  // Two columns from `md`. Below it the right column follows the left after a
  // rule, and the left keeps a gap above that rule, so the stacked card reads the
  // same as the single column it replaces.
  return (
    <div className="md:grid md:grid-cols-2">
      <div className={`divide-y ${divider} pb-4 md:pb-0 md:pr-6 md:border-r ${edge}`}>{left}</div>
      <div className={`divide-y ${divider} border-t pt-4 md:border-t-0 md:pt-0 md:pl-6 ${edge}`}>
        {right}
      </div>
    </div>
  );
};

export default StrategyMoves;
