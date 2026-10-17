import React from 'react';
import { BookOpen } from 'lucide-react';
import { getBandConfig, getBandRgb } from '../utils/renderUtils';
import {
  LADDER_BODY,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_FILL,
  LADDER_FILL_QUIET,
  LADDER_FOOTER,
  LADDER_GUTTER,
  LADDER_GUTTER_NARROW,
  LADDER_GUTTER_STRIP,
  LADDER_GUTTER_CAPTION,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_MARK_MEDIUM,
  LADDER_GUTTER_TOTAL,
  LADDER_LINKED,
  LADDER_LINKED_BADGE,
  LADDER_ROW,
  LADDER_SOLID,
} from '../utils/ladderChrome';

/**
 * One rung of the mark ladder: a solid gutter that says which mark or band the row
 * is, and a body that says what earns it.
 *
 * Every colour comes from the band. The row sets `--band-rgb` from `getBandRgb`,
 * which the `band-edge`, `band-fill` and hero classes in `index.css` read; the
 * gutter's solid fill is that same colour, the verb ribbon's own tier hue, drawn by
 * `band-solid` in `index.css` with the dark ink that holds AA on all six. Nothing here names a
 * colour, so a band is one colour in both themes. Do not restate a band colour at a
 * call site, and do not reach for `bandConfig.border` in place of `band-edge`: the
 * token is a fully saturated outline and drawn round a filled row it is the loudest
 * thing on the row, once per row and again on every divider.
 */

export type LadderEdge = 'shut' | 'open';

const edgeClass = (edge: LadderEdge): string =>
  edge === 'open' ? LADDER_EDGE_OPEN : LADDER_EDGE_SHUT;

/** The band's colour as the `--band-rgb` custom property, which the edge, fill and
 *  hero classes read. Set on the row and on the gutter, so a gutter used on its own
 *  still draws its divider in the right band. Exported for a row that is built from
 *  `LadderRowGutter` and a body of its own, which must hand the band to CSS the same
 *  way. */
export const ladderBandVars = (band: number): React.CSSProperties =>
  ({ '--band-rgb': getBandRgb(band) }) as React.CSSProperties;

export interface LadderRowGutterProps {
  band: number;
  /** The mark the row is for, or a range of marks ("7–8"). A band-labelled guide row
   *  passes its mark here too, not its "Band N" label, and the band goes in the
   *  caption. */
  markLabel: string;
  /** The question's total marks. Given, the figure reads "5/6". Left out, the figure
   *  is the mark alone. */
  total?: number;
  /** The caption beneath the figure. Defaults to "Band N". Pass false where the
   *  caption would say nothing the figure does not. */
  bandCaption?: string | false;
  edge?: LadderEdge;
  /** The quiet treatment: no solid ground, so the figure and caption are the band's
   *  text colour on the row's wash. For a supporting group, under a solid row. */
  quiet?: boolean;
  /** How the gutter reads on a phone only; from `sm` it is always the full gutter.
   *  `'full'` (the default) is the gutter every caller has. `'narrow'` is 56px with the
   *  figure and caption set smaller, so a row whose body is always shown (a guide
   *  criterion, a closed exemplar's preview, a term group) gets the width. `'strip'` is
   *  a 4px band-coloured edge with the figure and caption read by a screen reader only,
   *  for an open exemplar that is full-bleed on a phone. The Sample Answers, Marking
   *  Guide and Syllabus Terms panels pass it, so the three ladders read alike. */
  phoneGutter?: 'full' | 'narrow' | 'strip';
}

/**
 * The mark column on the left of a ladder row. Exported so a row whose body is
 * something other than criterion text (the Sample Answers row's interactive
 * exemplar) can take the same gutter and sit on the same grid.
 */
export const LadderRowGutter: React.FC<LadderRowGutterProps> = ({
  band,
  markLabel,
  total,
  bandCaption,
  edge = 'shut',
  quiet = false,
  phoneGutter = 'full',
}) => {
  // The total is on its own line under the mark, so only the mark has to fit the
  // gutter's width: "5", "3–4" and "9–10" at the usual size, and a two-digit range,
  // "10–12", one step down.
  const markClass = markLabel.length <= 4 ? LADDER_GUTTER_MARK : LADDER_GUTTER_MARK_MEDIUM;
  // On a phone the narrow gutter leaves 52px inside its inset, so a four-character
  // mark (43px at 18px) and a five-character one (48px at 16px) each step down once.
  // The strip hides the figure and caption from sight (they stay in the DOM for a
  // screen reader). The variants win over the sizes above, and from `sm` the full
  // gutter's sizes apply.
  const phoneMarkClass =
    phoneGutter === 'narrow'
      ? markLabel.length <= 3
        ? ''
        : markLabel.length === 4
          ? 'max-sm:text-lg'
          : 'max-sm:text-base'
      : '';
  const phoneTotalClass = phoneGutter === 'narrow' ? 'max-sm:text-xs' : '';
  const phoneHidden = phoneGutter === 'strip' ? 'max-sm:sr-only' : '';
  const phoneCaption = phoneGutter === 'narrow' ? 'max-sm:text-[10px] max-sm:leading-none' : '';
  const gutterShape =
    phoneGutter === 'narrow'
      ? LADDER_GUTTER_NARROW
      : phoneGutter === 'strip'
        ? LADDER_GUTTER_STRIP
        : LADDER_GUTTER;
  // A quiet gutter has no ground of its own: the row's wash runs under it, and the
  // figure is the band's text step, which `getBandConfig` already holds to AA on
  // the wash. Its divider is the same band edge as a solid gutter's. A solid gutter
  // is the ribbon's tier hue (`band-solid`), whose ink it sets itself.
  const ground = quiet ? '' : LADDER_SOLID;
  const ink = quiet ? getBandConfig(band).text : '';
  return (
    <div style={ladderBandVars(band)} className={`${gutterShape} ${ground} ${edgeClass(edge)}`}>
      <span className={`${markClass} ${phoneMarkClass} ${phoneHidden} ${ink}`}>
        {markLabel}
        {total !== undefined && (
          <span className={`${LADDER_GUTTER_TOTAL} ${phoneTotalClass}`}>/{total}</span>
        )}
      </span>
      {bandCaption !== false && (
        <span className={`${LADDER_GUTTER_CAPTION} ${phoneCaption} ${phoneHidden} ${ink}`}>
          {bandCaption ?? `Band ${band}`}
        </span>
      )}
    </div>
  );
};

export interface LadderRowProps {
  band: number;
  markLabel: string;
  total?: number;
  bandCaption?: string | false;
  children: React.ReactNode;
  /** A control or line set under the body's content, inside the row. */
  footer?: React.ReactNode;
  edge?: LadderEdge;
  /** The quiet row: the band's wash in place of its full fill, with a quiet gutter. */
  quiet?: boolean;
  /** The row is the criterion of the exemplar the student has open: it is outlined in
   *  its band, haloed, and carries a badge that says so. */
  linked?: boolean;
  /** The row's DOM id, for the jump from an exemplar to its criterion. */
  id?: string;
  /** The row's element, so the guide can scroll to it and move focus to it. A row
   *  that takes a ref is also focusable by script (not by Tab). */
  rowRef?: React.Ref<HTMLDivElement>;
  /** The gutter's phone form, passed through to `LadderRowGutter`. */
  phoneGutter?: LadderRowGutterProps['phoneGutter'];
}

const LadderRow: React.FC<LadderRowProps> = ({
  band,
  markLabel,
  total,
  bandCaption,
  children,
  footer,
  edge = 'shut',
  quiet = false,
  linked = false,
  id,
  rowRef,
  phoneGutter,
}) => (
  <div
    id={id}
    ref={rowRef}
    tabIndex={rowRef ? -1 : undefined}
    data-linked={linked ? 'true' : undefined}
    style={ladderBandVars(band)}
    className={[
      LADDER_ROW,
      edgeClass(edge),
      quiet ? LADDER_FILL_QUIET : LADDER_FILL,
      linked ? LADDER_LINKED : '',
      rowRef ? 'focus:outline-none' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <LadderRowGutter
      band={band}
      markLabel={markLabel}
      total={total}
      bandCaption={bandCaption}
      edge={edge}
      quiet={quiet}
      phoneGutter={phoneGutter}
    />
    <div className={LADDER_BODY}>
      {linked && (
        <p className={LADDER_LINKED_BADGE}>
          <BookOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
          Matches the model answer you are reading
        </p>
      )}
      {children}
      {footer && <div className={LADDER_FOOTER}>{footer}</div>}
    </div>
  </div>
);

export default LadderRow;
