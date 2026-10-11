import React from 'react';
import { getBandConfig, getBandRgb } from '../utils/renderUtils';
import {
  LADDER_BODY,
  LADDER_EDGE_OPEN,
  LADDER_EDGE_SHUT,
  LADDER_FOOTER,
  LADDER_GUTTER,
  LADDER_GUTTER_CAPTION,
  LADDER_GUTTER_MARK,
  LADDER_GUTTER_MARK_LONG,
  LADDER_ROW,
} from '../utils/ladderChrome';

/**
 * One rung of the mark ladder: a gutter that says which mark or band the row is,
 * and a body that says what earns it.
 *
 * Every colour comes from the band. The row sets `--band-rgb` from `getBandRgb`,
 * which the `band-edge` classes in `index.css` read; the fill and the ink come
 * from `getBandConfig(band)`. Nothing here names a colour, so a band is one
 * colour in both themes. Do not restate a band colour at a call site, and do not
 * reach for `bandConfig.border` in place of `band-edge`: the token is a
 * fully saturated outline (solid `-600` in light) and drawn around a pale wash it
 * is the loudest thing on the row, once per row and again on every divider.
 *
 * A light tint is a band's `-100` wash and not a `-50` shade, for the reason
 * `getBandConfig` gives. Fixed at source there, so a row needs no local override.
 */

export type LadderEdge = 'shut' | 'open';

const edgeClass = (edge: LadderEdge): string =>
  edge === 'open' ? LADDER_EDGE_OPEN : LADDER_EDGE_SHUT;

/** The band's colour as the `--band-rgb` custom property, which the edge and wash
 *  classes read. Set on the row and on the gutter, so a gutter used on its own
 *  still draws its divider in the right band. */
const bandVars = (band: number): React.CSSProperties =>
  ({ '--band-rgb': getBandRgb(band) }) as React.CSSProperties;

export interface LadderRowGutterProps {
  band: number;
  /** The mark, or a range of marks ("7–8"), or a band-labelled row's "Band 3". */
  markLabel: string;
  /** The caption beneath the mark. Pass false where the label already names the
   *  band, so "Band 3" is not written twice. */
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
  bandCaption,
  edge = 'shut',
}) => {
  const config = getBandConfig(band);
  // A band-labelled row's label is "Band N", which is wider than a mark number
  // (a range such as "10–12" is not, whatever its length).
  const markClass = /^Band\b/.test(markLabel) ? LADDER_GUTTER_MARK_LONG : LADDER_GUTTER_MARK;
  return (
    <div style={bandVars(band)} className={`${LADDER_GUTTER} ${config.bg} ${edgeClass(edge)}`}>
      <span className={`${markClass} ${config.text}`}>{markLabel}</span>
      {bandCaption !== false && (
        <span className={`${LADDER_GUTTER_CAPTION} ${config.text}`}>
          {bandCaption ?? `Band ${band}`}
        </span>
      )}
    </div>
  );
};

export interface LadderRowProps {
  band: number;
  markLabel: string;
  bandCaption?: string | false;
  children: React.ReactNode;
  /** A control or line set under the body's content, inside the row. */
  footer?: React.ReactNode;
  edge?: LadderEdge;
}

const LadderRow: React.FC<LadderRowProps> = ({
  band,
  markLabel,
  bandCaption,
  children,
  footer,
  edge = 'shut',
}) => {
  const config = getBandConfig(band);
  return (
    <div style={bandVars(band)} className={`${LADDER_ROW} ${edgeClass(edge)} ${config.bg}`}>
      <LadderRowGutter band={band} markLabel={markLabel} bandCaption={bandCaption} edge={edge} />
      <div className={LADDER_BODY}>
        {children}
        {footer && <div className={LADDER_FOOTER}>{footer}</div>}
      </div>
    </div>
  );
};

export default LadderRow;
