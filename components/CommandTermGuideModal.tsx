import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { CommandTermInfo } from '../types';
import { X } from 'lucide-react';
import { escapeRegExp, getBandConfig } from '../utils/renderUtils';
import { getTierTargetBand, TIER_GROUPS } from '../data/commandTerms';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import { insertIntoDraft } from '../utils/insertIntoDraft';
import { withIndefiniteArticle } from '../utils/grammar';
import { parseGenericMarkRow } from '../utils/genericMarkRows';
import {
  collectStrategyDetail,
  groupStrategyMoves,
  parseStrategyTip,
  splitMethodMoves,
} from '../utils/strategyTip';
import {
  HERO_HEAD_WASH,
  HERO_TILE,
  LADDER_CRITERION,
  LADDER_SOLID,
  LADDER_STACK,
} from '../utils/ladderChrome';
import LadderRow, { ladderBandVars } from './LadderRow';
import StrategyMoves from './StrategyMoves';
import QuestionExpectations from './QuestionExpectations';

interface CommandTermGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  termInfo: CommandTermInfo;
  /** The question being answered, when the guide is opened from one. */
  marks?: number;
  /** The band that question reaches at full marks. Given with `marks`. */
  band?: number;
}

const sectionClass = 'mt-7 first:mt-0';
const headingClass = 'text-sm font-semibold text-[rgb(var(--color-text-primary))]';

/**
 * One figure in the guide's stat row: a mark range, a time or a length. Set as a
 * description list, so a reader using a screen reader hears each name with its
 * value. The figures keep the band's text colour and the mono face; there are no
 * boxes around them.
 */
const Stat: React.FC<{ label: string; value: string; band: string }> = ({ label, value, band }) => (
  <div>
    <dt className="t-label text-[rgb(var(--color-text-muted))]">{label}</dt>
    <dd className={`mt-0.5 font-mono font-bold tabular-nums text-lg leading-tight ${band}`}>
      {value}
    </dd>
  </div>
);

/**
 * The command verb's guide, opened from the verb in a question.
 *
 * It is a reading sheet with one job: say what the verb asks for and how to start.
 * The band-washed head names the verb and its tier; the figures and the question's
 * own marks sit under it; the method comes next, in the same parts `HowToAnswer`
 * draws it in, and the marking detail follows, as ladder rows.
 */
const CommandTermGuideModal: React.FC<CommandTermGuideModalProps> = ({
  isOpen,
  onClose,
  termInfo,
  marks,
  band,
}) => {
  // The verb's own colour: the band its tier targets. The head, the tile, the
  // step numbers and the ladder rows all read this one band.
  const bandTarget = getTierTargetBand(termInfo.tier);
  const bandConfig = getBandConfig(bandTarget);
  const tierTitle = TIER_GROUPS.find((group) => group.tier === termInfo.tier)?.title;

  const { moves, method, watch, terms, examples, words } = useMemo(() => {
    const parsed = groupStrategyMoves(parseStrategyTip(termInfo.tip));
    const split = splitMethodMoves(parsed);
    const detail = collectStrategyDetail(parsed);
    // The structural keywords used to be a separate list that repeated the
    // tip's own phrases. They are merged into the words to use, and only the ones
    // the tip does not already quote are added.
    const extras = termInfo.structuralKeywords.filter(
      (keyword) => !new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(termInfo.tip)
    );
    return {
      moves: parsed,
      method: split.method,
      watch: split.watch,
      terms: detail.terms,
      examples: detail.examples,
      words: [...new Set([...detail.terms, ...extras])],
    };
  }, [termInfo.tip, termInfo.structuralKeywords]);

  // Shared hook rather than a private listener, so this guide also registers
  // itself as an open overlay and Escape dismisses it without also exiting
  // Focus Mode underneath.
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const backdrop = useBackdropDismiss(onClose);

  if (!isOpen) return null;

  // A word added from the guide goes into the draft behind it, so the guide
  // closes: otherwise the student is left reading a sheet while the text lands
  // under a scrim they cannot see past.
  const insertWord = (word: string) => {
    insertIntoDraft(word);
    onClose();
  };

  const hasQuestion = marks !== undefined && band !== undefined;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-modal p-4"
      {...backdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-term-title"
        // `--band-rgb` once, here: custom properties inherit, so the head, the
        // tile, the edge and every ladder row draw from it without the colour
        // being handed down by hand.
        style={ladderBandVars(bandTarget)}
        className="clip-stable w-full max-w-xl max-h-[90vh] flex flex-col rounded-surface border-2 band-edge-strong bg-surface shadow-lg animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The head stays put while the body scrolls. */}
        <header
          className={`${HERO_HEAD_WASH} flex-shrink-0 px-5 sm:px-6 pt-5 pb-5 border-b border-[rgb(var(--color-border-secondary))]`}
        >
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className={`${HERO_TILE} ${LADDER_SOLID} font-mono text-lg font-bold tabular-nums`}
            >
              {termInfo.tier}
            </div>
            <div className="min-w-0 flex-1">
              {tierTitle && (
                <p className="t-label text-[rgb(var(--color-text-muted))]">{tierTitle}</p>
              )}
              <h2
                id="command-term-title"
                className="t-display mt-1 text-3xl sm:text-4xl uppercase italic leading-none tracking-tight text-[rgb(var(--color-text-primary))]"
              >
                {termInfo.term}
                <span className="sr-only"> — what the command verb asks for</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the command verb guide"
              className="flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {/* The definition takes the full width under the title, indented to the
              title's own edge, so a phone sets it in lines of its own length. */}
          <p
            className={`mt-4 pl-14 font-serif ${PROSE_FLOW} text-base sm:text-lg leading-snug text-[rgb(var(--color-text-primary))]`}
          >
            {termInfo.definition}
          </p>
        </header>

        {/* The guide as a reading document, scrolling under the head. */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 pb-8">
          {hasQuestion && (
            <section aria-labelledby="command-term-question-heading">
              <p
                id="command-term-question-heading"
                className="rounded-xl bg-[rgb(var(--color-bg-surface-inset))] px-4 py-3 text-sm leading-snug text-[rgb(var(--color-text-secondary))]"
              >
                <span className="font-semibold text-[rgb(var(--color-text-primary))]">
                  This question:
                </span>{' '}
                {marks} {marks === 1 ? 'mark' : 'marks'}. A full-mark answer reaches Band {band}.
              </p>
              {/* What that means in practice, for these marks and this verb. The
                  generic ranges below are for the verb across every question. */}
              <div className="mt-4">
                <QuestionExpectations verb={termInfo.term} marks={marks} band={band} />
              </div>
            </section>
          )}

          {hasQuestion && (
            <p className="mt-6 t-label text-[rgb(var(--color-text-muted))]">
              Across every {termInfo.term} question
            </p>
          )}
          <dl className={`${hasQuestion ? 'mt-2' : 'mt-5'} flex flex-wrap gap-x-10 gap-y-4`}>
            <Stat label="Marks" value={termInfo.markRange.join('–')} band={bandConfig.text} />
            <Stat label="Minutes" value={termInfo.timeRange.join('–')} band={bandConfig.text} />
            <Stat label="Pages" value={termInfo.pageEstimate} band={bandConfig.text} />
          </dl>

          {moves.length > 0 && (
            <section className={sectionClass}>
              <h3 className={headingClass}>
                How to answer {withIndefiniteArticle(termInfo.term)} question
              </h3>
              <div className="mt-2.5 rounded-panel border border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-elevated))] p-4 sm:p-5 divide-y divide-[rgb(var(--color-border-secondary))]">
                <StrategyMoves
                  method={method}
                  terms={words}
                  examples={examples}
                  watch={watch}
                  band={bandTarget}
                  onInsertWord={insertWord}
                />
              </div>
            </section>
          )}

          <section className={sectionClass}>
            <h3 className={headingClass}>What separates a strong answer</h3>
            <p className="mt-2 t-body text-[rgb(var(--color-text-secondary))]">
              {termInfo.bandDiscrimination}
            </p>
          </section>

          <section className={sectionClass}>
            <h3 className={headingClass}>How the marks usually fall</h3>
            <p className="mt-0.5 t-label text-[rgb(var(--color-text-dim))]">
              A general guide. Your paper’s own marking guidelines win.
            </p>
            <div className={`${LADDER_STACK} mt-3`}>
              {termInfo.genericMarkingGuide.map((line, index) => {
                const row = parseGenericMarkRow(line);
                return row ? (
                  <LadderRow
                    key={index}
                    band={bandTarget}
                    markLabel={row.marks}
                    bandCaption={false}
                    quiet
                  >
                    <p className={LADDER_CRITERION}>{row.criterion}</p>
                  </LadderRow>
                ) : (
                  <p key={index} className={`${LADDER_CRITERION} px-1`}>
                    {line}
                  </p>
                );
              })}
            </div>
          </section>

          {/* An abstract definition plus one concrete question is how a reader
              checks they have understood the definition at all. */}
          <section className={sectionClass}>
            <h3 className={headingClass}>A question that asks for this</h3>
            <blockquote
              className={`mt-2 border-l-2 border-[rgb(var(--color-border-primary))] pl-4 font-serif italic ${PROSE_BLOCK} t-body text-[rgb(var(--color-text-secondary))]`}
            >
              &ldquo;{termInfo.exampleQuestion}&rdquo;
            </blockquote>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandTermGuideModal;
