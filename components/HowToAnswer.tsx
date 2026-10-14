import React, { useId, useMemo } from 'react';
import { ChevronDown, ListOrdered } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandRgb } from '../utils/renderUtils';
import { PROSE_BLOCK } from '../utils/prose';
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
import StrategyMoves from './StrategyMoves';

interface HowToAnswerProps {
  verb: PromptVerb;
  /** Whether the method card is showing. The caller holds it, because the
   *  editor also reports opening it to the marking report. */
  open: boolean;
  onToggle: () => void;
  /** Opened for this question before and shut again: the "Read" chip. */
  read: boolean;
}

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
  // The question's own tier colour, through the band system. The row's rule
  // takes it; the step numbers in the card take it through StrategyMoves.
  const bandStyle = { '--band-rgb': getBandRgb(info.tier) } as React.CSSProperties;

  const hasBody = method.length > 0 || terms.length > 0 || examples.length > 0 || watch.length > 0;

  // The row sits on the writing well, not on the paper above it. It used to be
  // transparent, so over a white card it was a flat white strip wedged between
  // the saturated header and the grey well, joined to each by a grey hairline.
  // On the well token the strip and the writing area are one surface, and the
  // only seam left is the band-coloured rule under the header — the card's
  // own tier hue at low alpha, not a neutral line that reads as a gap.
  return (
    <div style={bandStyle} className="band-edge border-t bg-[rgb(var(--color-bg-surface-inset))]">
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
            className="t-label order-2 ml-auto sm:order-3 sm:ml-0 shrink-0 inline-flex items-center gap-1.5 h-11 sm:h-8 pl-2.5 pr-2 rounded-full border border-[rgb(var(--color-border-primary))] bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors motion-reduce:transition-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                <StrategyMoves
                  method={method}
                  terms={terms}
                  examples={examples}
                  watch={watch}
                  band={info.tier}
                  onInsertWord={insertIntoDraft}
                  variant="worked"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HowToAnswer;
