import React, { useId, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ListOrdered } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig, getBandRgb } from '../utils/renderUtils';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import {
  collectStrategyDetail,
  groupStrategyMoves,
  parseStrategyTip,
  splitMethodMoves,
} from '../utils/strategyTip';
import { insertIntoDraft } from '../utils/insertIntoDraft';
import { withIndefiniteArticle } from '../utils/grammar';
import type { PromptVerb } from '../types';
import { PanelReadChip } from './PanelDisclosure';
import WordChip from './WordChip';

interface HowToAnswerProps {
  verb: PromptVerb;
  /** Whether the method card is showing. The caller holds it, because the
   *  editor also reports opening it to the marking report. */
  open: boolean;
  onToggle: () => void;
  /** Opened for this question before and shut again: the "Read" chip. */
  read: boolean;
}

const sectionClass = 'py-4 first:pt-0 last:pb-0';

/**
 * The verb's definition, and a way into how to answer it.
 *
 * The definition is content and stays on screen for the whole draft. The
 * method is behind a named button, and opens as a card beneath the row:
 *
 * - **Method**: the lead move, numbered 1, with any further steps numbered
 *   after it on a thin rule. The lead is set at reading size.
 * - **Words to use**: the terms the tip offers, each one a chip that adds the
 *   word to the draft at the caret.
 * - **Sentence shape**: any template the tip gives, set as a quotation.
 * - **Watch for**: the costs and cautions the tip names, under a warning glyph
 *   rather than as steps.
 *
 * The card is always mounted and only folds, so opening it does not shift the
 * writing area; while shut it is `inert`, so its controls are not reachable.
 */
const HowToAnswer: React.FC<HowToAnswerProps> = ({ verb, open, onToggle, read }) => {
  const panelId = useId();
  const info = useMemo(() => getCommandTermInfo(verb), [verb]);
  const moves = useMemo(() => groupStrategyMoves(parseStrategyTip(info.tip)), [info.tip]);
  const { method, watch } = useMemo(() => splitMethodMoves(moves), [moves]);
  const { terms, examples } = useMemo(() => collectStrategyDetail(moves), [moves]);
  // The question's own tier colour, through the band system. The step numbers
  // and their rule take it; nothing else on the card does.
  const band = getBandConfig(info.tier);
  const bandStyle = { '--band-rgb': getBandRgb(info.tier) } as React.CSSProperties;

  const hasBody = method.length > 0 || terms.length > 0 || examples.length > 0 || watch.length > 0;

  return (
    <div className="border-t border-[rgb(var(--color-border-secondary))]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-2.5">
        <span className="t-label order-1 shrink-0 text-[rgb(var(--color-text-primary))]">
          {info.term}
        </span>
        {/* The meaning, in the reading face. It wraps rather than truncating:
            it is the sentence a student most needs, and on a phone it takes a
            line of its own under the verb and its button. */}
        <p
          className={`order-3 basis-full sm:order-2 sm:basis-auto sm:flex-1 min-w-0 font-serif ${PROSE_BLOCK} text-[13px] leading-snug text-[rgb(var(--color-text-muted))]`}
        >
          {info.definition}
        </p>
        {hasBody && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="t-label order-2 ml-auto sm:order-3 sm:ml-0 shrink-0 inline-flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-full border border-[rgb(var(--color-border-primary))] bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors motion-reduce:transition-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelReadChip show={read && !open} />
            <ListOrdered className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>How to answer</span>
            {/* The verb is in the name, not the visible label, which already
                sits beside the term. */}
            <span className="sr-only"> {withIndefiniteArticle(info.term)} question</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>

      {hasBody && (
        <div
          id={panelId}
          inert={!open}
          className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-4 sm:px-6 pb-4">
              <div className="max-w-xl rounded-panel border border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-elevated))] p-4 sm:p-5 divide-y divide-[rgb(var(--color-border-secondary))]">
                {method.length > 0 && (
                  <section className={sectionClass}>
                    <h3 className="t-section text-[rgb(var(--color-text-primary))]">Method</h3>
                    <ol className="mt-3 flex flex-col">
                      {method.map((move, i) => {
                        const isLead = i === 0;
                        const isLast = i === method.length - 1;
                        return (
                          <li key={move.text} className="flex gap-3">
                            <div className="flex shrink-0 flex-col items-center">
                              <span
                                style={bandStyle}
                                className={`band-edge flex items-center justify-center rounded-full border font-mono font-bold tabular-nums ${band.text} ${
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
                              className={`min-w-0 font-serif ${PROSE_FLOW} leading-relaxed ${
                                isLead
                                  ? 'pt-0.5 text-base text-[rgb(var(--color-text-primary))]'
                                  : 'pt-1 text-sm text-[rgb(var(--color-text-secondary))]'
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
                    <h3 className="t-section text-[rgb(var(--color-text-primary))]">
                      Words to use
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {terms.map((word) => (
                        <WordChip key={word} word={word} onInsert={insertIntoDraft} />
                      ))}
                    </div>
                  </section>
                )}

                {examples.length > 0 && (
                  <section className={sectionClass}>
                    <h3 className="t-section text-[rgb(var(--color-text-primary))]">
                      Sentence shape
                    </h3>
                    <div className="mt-3 flex flex-col gap-3">
                      {examples.map((text) => (
                        <blockquote
                          key={text}
                          className={`border-l-2 border-[rgb(var(--color-border-primary))] pl-3 font-serif text-sm italic leading-relaxed ${PROSE_FLOW} text-[rgb(var(--color-text-secondary))]`}
                        >
                          {text}
                        </blockquote>
                      ))}
                    </div>
                  </section>
                )}

                {watch.length > 0 && (
                  <section className={sectionClass}>
                    <h3 className="t-section flex items-center gap-2 text-[rgb(var(--color-text-primary))]">
                      <AlertTriangle
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                      />
                      Watch for
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {watch.map((move) => (
                        <li
                          key={move.text}
                          className={`font-serif text-sm leading-relaxed ${PROSE_FLOW} text-[rgb(var(--color-text-secondary))]`}
                        >
                          {move.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HowToAnswer;
