import React from 'react';
import { getBandConfig, getBandRgb } from '../utils/renderUtils';
import {
  LADDER_BODY,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_FILL,
  LADDER_FOOTER,
  LADDER_GUTTER,
  LADDER_GUTTER_CAPTION,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_MARK_LONG,
  LADDER_GUTTER_MARK_MEDIUM,
  LADDER_GUTTER_TOTAL,
  LADDER_GUTTER_TOTAL_LONG,
  LADDER_ROW,
} from '../utils/ladderChrome';

/**
 * One rung of the mark ladder: a solid gutter that says which mark or band the row
 * is, and a body that says what earns it.
 *
 * Every colour comes from the band. The row sets `--band-rgb` from `getBandRgb`,
 * which the `band-edge`, `band-fill` and hero classes in `index.css` read; the
 * gutter's solid fill and its ink come from `getBandConfig(band)` (`solidBg` and
 * `solidText`, the pairs `bandColors.test.ts` holds at AA). Nothing here names a
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
}) => {
  const config = getBandConfig(band);
  // The figure steps down as it lengthens, so it always fits the gutter: "5/6" and
  // "3–4/6" at the usual size, "7–8/10" one step down, and "10–12/12", eight
  // characters, at the smallest with its total smaller again.
  const figureLength = markLabel.length + (total === undefined ? 0 : String(total).length + 1);
  const long = figureLength > 7;
  const markClass =
    figureLength <= 5
      ? LADDER_GUTTER_MARK
      : figureLength <= 7
        ? LADDER_GUTTER_MARK_MEDIUM
        : LADDER_GUTTER_MARK_LONG;
  const totalClass = long ? LADDER_GUTTER_TOTAL_LONG : LADDER_GUTTER_TOTAL;
  return (
    <div
      style={ladderBandVars(band)}
      className={`${LADDER_GUTTER} ${config.solidBg} ${edgeClass(edge)}`}
    >
      <span className={`${markClass} ${config.solidText}`}>
        {markLabel}
        {total !== undefined && <span className={totalClass}>/{total}</span>}
      </span>
      {bandCaption !== false && (
        <span className={`${LADDER_GUTTER_CAPTION} ${config.solidText}`}>
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
}

const LadderRow: React.FC<LadderRowProps> = ({
  band,
  markLabel,
  total,
  bandCaption,
  children,
  footer,
  edge = 'shut',
}) => (
  <div style={ladderBandVars(band)} className={`${LADDER_ROW} ${edgeClass(edge)} ${LADDER_FILL}`}>
    <LadderRowGutter
      band={band}
      markLabel={markLabel}
      total={total}
      bandCaption={bandCaption}
      edge={edge}
    />
    <div className={LADDER_BODY}>
      {children}
      {footer && <div className={LADDER_FOOTER}>{footer}</div>}
    </div>
  </div>
);

export default LadderRow;
