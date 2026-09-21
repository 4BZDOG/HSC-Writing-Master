import React, { useMemo } from 'react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';
import { parseStrategyTip, type TipSegment } from '../utils/strategyTip';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';
import type { PromptVerb } from '../types';

/**
 * One command verb's strategy — the method for answering it, set as a brief
 * rather than as a tip list.
 *
 * It is set in Newsreader, the face §1 of the spec chose "to simulate the
 * gravity of an official examination paper" and the same face the writing
 * surface uses. The advice about how to write reads in the voice of the thing
 * being written.
 *
 * ## It no longer draws itself on the writing surface
 *
 * This component used to have two scales. `panel` is what survives: the brief
 * inside a disclosure, above the writing area. `page` drew the same brief as a
 * `pointer-events-none` layer ON the blank writing surface, sharing its
 * padding so the verb sat exactly where the student's first word would go.
 *
 * That cost more than it looks. The placeholder had to be turned transparent
 * while it showed, so a blank page carried no invitation to write at all; a
 * click to start put the caret behind the verb's first letterform, which the
 * call site's own comment acknowledged and accepted; and the layer had to
 * MEASURE the card and drop its own content to fit, so the version a student
 * met first was the version missing the checks. All of it vanished at the
 * first keystroke — so the student who wanted the advice lost it the instant
 * they acted on it.
 *
 * The writing surface belongs to the student. The verb's meaning now sits in
 * the strategy row's own header, where it stays readable while they draft, and
 * the method lives here, one click away and available at any point. With the
 * page scale went `room`, the measure-and-trim effect, the trimmed state and
 * the surface-padding constant — all of which existed only to squeeze this
 * into a box it should not have been in.
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

interface StrategyBriefProps {
  verb: PromptVerb;
  /**
   * Whether the brief states the verb's definition for itself, which depends
   * on what the surface around it has already said.
   *
   * - `definition` — the definition, then the method. For a surface that names
   *   the verb but not its meaning.
   * - `none` — the method alone. Both call sites are now this: the editor's
   *   strategy row carries the definition in its own header, and the verb
   *   ribbon's detail card sets it under the term as a heading. Keeping the
   *   option is what stops the next surface having to choose between repeating
   *   the definition and forking this component.
   *
   * The rule goes with the definition: it separates what the verb MEANS from
   * how to answer it, and with nothing above it is a line drawn for its own
   * sake.
   */
  lead?: 'definition' | 'none';
  className?: string;
}

/** The detail hanging off a move: a template to copy, or the words to use. */
const MoveDetail: React.FC<{ detail: TipDetail[]; accent: string }> = ({ detail, accent }) => (
  <>
    {detail.map((segment, i) =>
      segment.kind === 'example' ? (
        <p
          key={i}
          className={`font-serif italic ${PROSE_FLOW} border-l-2 border-current/20 pl-3 text-[rgb(var(--color-text-secondary))] mt-2 text-xs leading-relaxed`}
        >
          {segment.text}
        </p>
      ) : (
        // The words themselves, set apart by spacing and colour rather than
        // boxed into chips: they are words to write, not controls to press.
        <p key={i} className={`font-serif flex flex-wrap ${accent} mt-2 gap-x-3.5 gap-y-1 text-xs`}>
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
  lead: leadMode = 'none',
  className = '',
}) => {
  const info = useMemo(() => getCommandTermInfo(verb), [verb]);
  const moves = useMemo(() => groupTip(parseStrategyTip(info.tip)), [info.tip]);
  // The question's own tier colour, the same hue the writing surface, the verb
  // ribbon and the question card are already painted in.
  const accent = useMemo(() => getBandConfig(info.tier).text, [info.tier]);

  const [lead, ...checks] = moves;
  const showDefinition = leadMode === 'definition';

  return (
    <div className={`max-w-[52ch] ${className}`}>
      {showDefinition && (
        <>
          <p
            className={`font-serif ${PROSE_BLOCK} text-[rgb(var(--color-text-secondary))] text-[13px] leading-relaxed`}
          >
            {info.definition}
          </p>
          <div aria-hidden="true" className="h-px bg-[rgb(var(--color-border-secondary))] my-3" />
        </>
      )}

      {lead && (
        <>
          <p
            className={`font-serif ${PROSE_FLOW} text-[rgb(var(--color-text-primary))] text-[13px] leading-relaxed`}
          >
            {lead.text}
          </p>
          <MoveDetail detail={lead.detail} accent={accent} />

          {/* The checks on the method above, not more instructions beside it.
              Indented past the lead's left edge and set a step down in size and
              tone, which is the whole of what marks them as subordinate. */}
          {checks.length > 0 && (
            <div className="border-l-2 border-[rgb(var(--color-border-secondary))] mt-2.5 pl-3 space-y-1.5">
              {checks.map((move, i) => (
                <div key={i}>
                  <p
                    className={`font-serif ${PROSE_FLOW} text-[rgb(var(--color-text-muted))] leading-relaxed text-xs`}
                  >
                    {move.text}
                  </p>
                  <MoveDetail detail={move.detail} accent={accent} />
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
