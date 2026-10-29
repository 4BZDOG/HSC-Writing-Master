import React, { useId, useMemo } from 'react';
import { ChevronDown, ListOrdered } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandRgb, getTierScaleConfig } from '../utils/renderUtils';
import { tierIcon } from '../utils/verbTierIcon';
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

  const TierIcon = tierIcon(info.tier);
  const bandConfig = getTierScaleConfig(info.tier);

  // The row sits on the writing well, not on the paper above it, and wears the
  // question's tier the way the verb ribbon's cards do: the tier's icon in a
  // tinted tile, a wash of the tier hue running in from a solid rule on the left
  // edge (`.verb-brief`). Without them it was a line of small print with nothing
  // to say it was the verb the question is built on.
  //
  // One grid, two shapes. On a phone the tile, the verb and the button share the
  // first line and the meaning takes the full width beneath, so it never wraps
  // around a button. From `sm` the tile spans both lines, the verb and its
  // meaning stack in the middle, and the button is centred on the right.
  return (
    <div
      style={bandStyle}
      className="verb-brief band-edge border-t bg-[rgb(var(--color-bg-surface-inset))]"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 pl-5 pr-4 sm:pl-7 sm:pr-6 py-3">
        <span
          aria-hidden="true"
          className={`ribbon-tier-tile row-start-1 sm:row-span-2 size-10 shrink-0 rounded-tile border flex items-center justify-center ${bandConfig.text}`}
        >
          <TierIcon className="w-5 h-5" />
        </span>
        <span className="t-label row-start-1 col-start-2 min-w-0 text-[rgb(var(--color-text-primary))]">
          {info.term}
        </span>
        {/* The meaning, in the reading face. It wraps rather than truncating:
            it is the sentence a student most needs. Plain wrapping, not
            `text-balance`: balanced, a one-sentence meaning split into two
            half-width lines and left the right of the row empty. */}
        <p className="row-start-2 col-span-3 sm:col-span-1 sm:col-start-2 min-w-0 font-serif text-[13px] leading-snug text-[rgb(var(--color-text-secondary))]">
          {info.definition}
        </p>
        {hasBody && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="t-label row-start-1 col-start-3 sm:row-span-2 justify-self-end shrink-0 inline-flex items-center gap-1.5 h-11 sm:h-8 pl-2.5 pr-2 rounded-full border border-[rgb(var(--band-rgb)/0.7)] bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-primary))] shadow-sm hover:bg-[rgb(var(--band-rgb)/0.14)] transition-colors motion-reduce:transition-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <PanelReadChip show={read && !open} />
            <ListOrdered className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {/* Icon-only below 375px, where the label left the verb beside it
                too little room: "IDENTIFY" ran under the button at 320px. The
                name stays whole for a screen reader. */}
            <span className="max-[374px]:sr-only">How to answer</span>
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
              {/* The card takes the row's width. It used to stop at 36rem, which
                  left the right of the verb row empty on a desktop; the line
                  length is capped on the text inside (see StrategyMoves), so a
                  wider card does not make the steps any harder to read. */}
              <div className="rounded-panel border border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-elevated))] p-4 sm:p-5 divide-y divide-[rgb(var(--color-border-secondary))]">
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
