import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';
import { parseStrategyTip, type TipSegment } from '../utils/strategyTip';
import type { PromptVerb } from '../types';

/**
 * One command verb's strategy, set as a brief rather than as a tip list.
 *
 * The verb is the mark. A lightbulb said "here is a tip", which is the most
 * generic thing a glyph can say and was saying it in three places on one
 * screen — the coach-mode toggle, this brief and the draft check below it. The
 * verb says which verb, and NESA's command terms are the vocabulary this whole
 * app is built on, so it is also the one word a student needs to recognise
 * before writing a sentence.
 *
 * It is set in Newsreader — the face §1 of the spec chose "to simulate the
 * gravity of an official examination paper", and the same face the writing
 * surface itself uses. At page scale this brief IS the blank writing surface,
 * so the page's own voice states the instruction and then hands over.
 *
 * ## The shape of a tip
 *
 * The tips in `data/commandTerms.ts` are authored as a method followed by its
 * caveat:
 *
 *     Just name it and stop. "X is Y" is enough.        <- the method
 *     Explanations waste time and earn zero extra marks. <- what it costs you
 *
 * Rendered as two identical bullets, that relationship is thrown away and both
 * lines read as equally weighted advice. Here the first move leads at reading
 * size and the rest sit under a rule as the checks on it — the structure
 * carries the information instead of a label announcing it.
 */

/** What a point can introduce: never another point. */
type TipDetail = Exclude<TipSegment, { kind: 'point' }>;

/** A point, together with the example or term list it introduces. */
interface TipMove {
  text: string;
  detail: TipDetail[];
}

/**
 * Re-groups flat segments into moves. `parseStrategyTip` already knows that a
 * line following one that ends in a colon belongs to it; this attaches it.
 */
const groupTip = (segments: TipSegment[]): TipMove[] => {
  const moves: TipMove[] = [];
  for (const segment of segments) {
    if (segment.kind === 'point') {
      moves.push({ text: segment.text, detail: [] });
    } else if (moves.length > 0) {
      moves[moves.length - 1].detail.push(segment);
    }
  }
  return moves;
};

/** The writing surface's own top padding, which `room` includes and the brief does not. */
const SURFACE_TOP_PAD = 32;

interface StrategyBriefProps {
  verb: PromptVerb;
  /**
   * `page` sets the brief on the blank writing surface, where it is the only
   * thing on screen and can take the room. `panel` is the same brief inside
   * the strategy row's disclosure, opened mid-draft, where it is competing
   * with the student's own words for height.
   */
  scale?: 'page' | 'panel';
  /**
   * How much of the verb's identity the brief states for itself, because that
   * depends entirely on what the surface around it has already said.
   *
   * - `full` — the term, then its definition. The blank writing page, where
   *   the brief is the only thing on screen.
   * - `definition` — the definition alone. The strategy row's own header reads
   *   "DISCUSS strategy", and the brief opening underneath it with `DISCUSS`
   *   in 18px Newsreader said the word twice in two lines, the second time
   *   larger than the first. The definition is not a repeat of anything, so it
   *   stays.
   * - `none` — neither. The verb ribbon's detail card sets the term as a
   *   heading beside its tier chip with the definition directly under it, so
   *   the brief there is the method and its checks alone.
   *
   * The rule goes with whatever is above it: it separates what the verb MEANS
   * from how to answer it, and with nothing above to separate from it is a
   * line drawn for its own sake.
   */
  lead?: 'full' | 'definition' | 'none';
  /**
   * Page scale only: the measured height of the surface it is drawn on. The
   * writing card is floored by the question beside it, so this is ~200px on a
   * laptop and ~100px on a phone, and the brief trims itself to whichever it
   * is. 0 means "not measured yet" — assume there is room, because the first
   * paint is the one a student sees.
   */
  room?: number;
  className?: string;
}

/** The detail hanging off a move: a template to copy, or the words to use. */
const MoveDetail: React.FC<{ detail: TipDetail[]; accent: string; large: boolean }> = ({
  detail,
  accent,
  large,
}) => (
  <>
    {detail.map((segment, i) =>
      segment.kind === 'example' ? (
        <p
          key={i}
          className={`font-serif italic text-pretty border-l-2 border-current/20 pl-3 text-[rgb(var(--color-text-secondary))] ${
            large ? 'mt-2.5 text-[15px] leading-relaxed' : 'mt-2 text-xs leading-relaxed'
          }`}
        >
          {segment.text}
        </p>
      ) : (
        // The words themselves, set apart by spacing and colour rather than
        // boxed into chips: they are words to write, not controls to press.
        <p
          key={i}
          className={`font-serif flex flex-wrap ${accent} ${
            large ? 'mt-2.5 gap-x-5 gap-y-1 text-[15px]' : 'mt-2 gap-x-3.5 gap-y-1 text-xs'
          }`}
        >
          {segment.items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      )
    )}
  </>
);

const StrategyBrief: React.FC<StrategyBriefProps> = ({
  verb,
  scale = 'panel',
  lead: leadMode = 'full',
  room = 0,
  className = '',
}) => {
  const info = useMemo(() => getCommandTermInfo(verb), [verb]);
  const moves = useMemo(() => groupTip(parseStrategyTip(info.tip)), [info.tip]);
  // The question's own tier colour, the same hue the writing surface, the verb
  // ribbon and the question card are already painted in.
  const accent = useMemo(() => getBandConfig(info.tier).text, [info.tier]);

  const large = scale === 'page';
  const [lead, ...rest] = moves;
  const showTerm = leadMode === 'full';
  const showDefinition = leadMode !== 'none';

  // The checks on the method are the first thing to go at page scale: even on
  // a roomy card they do not fit under the method, and the row below opens the
  // whole brief including them, which is the division that row is for.
  const checks = large ? [] : rest;

  /**
   * …and on a phone, where the writing card's body is nearer 100px than 200,
   * the method goes too. What is left — the verb and what it means — is the
   * part that still finishes.
   *
   * MEASURED, not estimated. A fixed per-part budget was tried first and could
   * not work: the method is one line for DESCRIBE and three for EXPLAIN, and
   * the definition wraps differently at every card width, so any single number
   * either hid a method that would have fitted or showed one that clipped.
   *
   * It cannot oscillate. `trimmed` only ever goes false → true for a given
   * verb and room, and the reset below is what re-opens the question when
   * either changes — so the worst case is two renders, and a brief that has
   * been trimmed never measures itself back into overflowing.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [trimmed, setTrimmed] = useState(false);

  useLayoutEffect(() => {
    setTrimmed(false);
  }, [verb, room]);

  useLayoutEffect(() => {
    if (!large || trimmed || room === 0) return;
    const natural = bodyRef.current?.scrollHeight ?? 0;
    if (natural > room - SURFACE_TOP_PAD) setTrimmed(true);
  }, [large, trimmed, room]);

  const showMethod = !large || !trimmed;

  return (
    <div ref={bodyRef} className={`${large ? 'max-w-[42ch]' : 'max-w-[52ch]'} ${className}`}>
      {showTerm && (
        <p
          className={`font-serif font-bold tracking-tight leading-none ${accent} ${
            large ? 'text-3xl' : 'text-lg'
          }`}
        >
          {info.term}
        </p>
      )}
      {showDefinition && (
        <p
          className={`font-serif text-balance text-[rgb(var(--color-text-secondary))] ${
            large ? 'text-base leading-relaxed' : 'text-[13px] leading-relaxed'
          } ${showTerm ? (large ? 'mt-2.5' : 'mt-1.5') : ''}`}
        >
          {info.definition}
        </p>
      )}

      {lead && showMethod && (
        <>
          {showDefinition && (
            <div
              aria-hidden="true"
              className={`h-px bg-[rgb(var(--color-border-secondary))] ${large ? 'my-4' : 'my-3'}`}
            />
          )}
          <p
            className={`font-serif text-pretty text-[rgb(var(--color-text-primary))] ${
              large ? 'text-base leading-relaxed' : 'text-[13px] leading-relaxed'
            }`}
          >
            {lead.text}
          </p>
          <MoveDetail detail={lead.detail} accent={accent} large={large} />

          {/* The checks on the method above, not more instructions beside it.
              Indented past the lead's left edge and set a step down in size and
              tone, which is the whole of what marks them as subordinate. */}
          {checks.length > 0 && (
            <div
              className={`border-l-2 border-[rgb(var(--color-border-secondary))] ${
                large ? 'mt-4 pl-4 space-y-2' : 'mt-2.5 pl-3 space-y-1.5'
              }`}
            >
              {checks.map((move, i) => (
                <div key={i}>
                  <p
                    className={`font-serif text-pretty text-[rgb(var(--color-text-muted))] leading-relaxed ${
                      large ? 'text-[15px]' : 'text-xs'
                    }`}
                  >
                    {move.text}
                  </p>
                  <MoveDetail detail={move.detail} accent={accent} large={large} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StrategyBrief;
