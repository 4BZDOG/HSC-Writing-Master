// pdf/reportGeometry.ts
//
// Measurement for the progress report's block kinds: the height each block takes
// at a given page scale, and every coordinate it is drawn at. Pure — the text
// measurer is injected, so this runs under Node and is unit-tested directly.
//
// `layout.ts` calls `measureReportBlock` from its own `measureBlock` and stores the
// result on the measured block; `reportDraw.ts` reads it back. Nothing is re-derived
// at draw time, so a label cannot be drawn a line lower than it was measured.
//
// Coordinates are relative to the block's content box (its top-left after the
// block's own top padding), in mm at the scale they were measured at.

import {
  BAR_LIST,
  BlockKind,
  ContentBlock,
  DISPLAY,
  LINE_CHART,
  MM_PER_PT,
  STAT_STRIP,
  TABLE,
  TextMeasurer,
} from './types';
import type { BarListData, LineChartData, StatStripData } from './reportBlocks';
import type {
  BarListLayout,
  BoxLayout,
  CellDrawing,
  ChartLabelLayout,
  ChartPointLayout,
  ColumnKind,
  LineChartLayout,
  ReportBlockLayout,
  StatCellLayout,
  StatStripLayout,
  TableCell,
  TableCellLayout,
  TableColumn,
  TableRow,
  TableHeaderLayout,
  TableLayout,
  TableRowLayout,
  TextLineLayout,
} from './reportBlocks';
import type { ReportTrendPoint } from './reportModel';
import { getBandName } from '../utils/renderUtils';
import {
  formatAttempts,
  formatBand,
  formatChange,
  formatInt,
  formatPercent,
  formatShortDate,
  parseTime,
} from './reportFormat';

/** The block kinds this module measures and the drawer paints. */
export const isReportKind = (kind: BlockKind): boolean =>
  kind === 'statStrip' ||
  kind === 'lineChart' ||
  kind === 'barList' ||
  kind === 'table' ||
  kind === 'heatmap';

// The baseline convention the marking report uses (see exportEvaluation's ASCENT):
// a baseline sits this fraction of an em below the top of its line box.
const ASCENT = 0.82;
// A lowercase-free capital's half height as a fraction of the em, for centring
// a line of text on a rule or a bar.
const HALF_CAP = 0.36;

const ELLIPSIS = '…';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The band a point is drawn in: rounded, and held to the six rungs of the ladder. */
const bandKey = (band: number): number => clamp(Math.round(band), 1, 6);

const ascentOf = (pt: number): number => pt * MM_PER_PT * ASCENT;

/** Width (mm) of a DISPLAY line: uppercase, bold, opened up by the tracking. */
export const displayWidth = (text: string, pt: number, m: TextMeasurer): number => {
  const upper = text.toUpperCase();
  return m.measure(upper, pt, 'bold') + upper.length * pt * MM_PER_PT * DISPLAY.letterSpacingEm;
};

/**
 * The longest prefix of `text` that fits `maxWidthMm` once an ellipsis is added,
 * or the text itself when it already fits. `widthOf` is the measure the caller
 * will draw with, so the fit is against what will actually be printed.
 */
export const fitToWidth = (
  text: string,
  maxWidthMm: number,
  widthOf: (s: string) => number
): string => {
  if (!text) return '';
  if (widthOf(text) <= maxWidthMm) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (widthOf(text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidthMm) lo = mid;
    else hi = mid - 1;
  }
  const kept = text.slice(0, lo).trimEnd();
  if (kept) return kept + ELLIPSIS;
  return widthOf(ELLIPSIS) <= maxWidthMm ? ELLIPSIS : '';
};

// ---------------------------------------------------------------------------
// Result strip
// ---------------------------------------------------------------------------

/**
 * The result strip: cells of equal width across the full width, a display label,
 * a value, and up to two lines of hint. The value takes one size for the whole
 * strip — the largest that every value fits its cell at — so the cells line up.
 */
export const measureStatStrip = (
  data: StatStripData,
  m: TextMeasurer,
  width: number,
  s: number
): { height: number; layout: StatStripLayout } => {
  const cells = data.cells;
  const cellW = width / Math.max(1, cells.length);
  const padX = STAT_STRIP.padXBaseMm * s;
  const padY = STAT_STRIP.padYBaseMm * s;
  const textW = Math.max(1, cellW - padX * 2);
  const labelPt = STAT_STRIP.labelPt * s;
  const hintPt = STAT_STRIP.hintPt * s;
  const valueMaxPt = STAT_STRIP.valuePt * s;
  const valueMinPt = STAT_STRIP.valueMinPt * s;

  let valuePt = valueMaxPt;
  for (const cell of cells) {
    const w = m.measure(cell.value, valueMaxPt, 'bold');
    if (w > textW) valuePt = Math.min(valuePt, Math.max(valueMinPt, (valueMaxPt * textW) / w));
  }

  const labelLH = labelPt * MM_PER_PT * 1.3;
  const valueLH = valuePt * MM_PER_PT * 1.25;
  const hintLH = hintPt * MM_PER_PT * 1.3;
  const gap1 = STAT_STRIP.labelGapBaseMm * s;
  const gap2 = STAT_STRIP.valueGapBaseMm * s;

  const prepared = cells.map((cell) => {
    const label = fitToWidth(cell.label, textW, (t) => displayWidth(t, labelPt, m));
    const value = fitToWidth(cell.value, textW, (t) => m.measure(t, valuePt, 'bold'));
    const hintText = (cell.hint ?? '').trim();
    let hintLines = hintText ? m.wrap(hintText, textW, hintPt, 'normal') : [];
    if (hintLines.length > STAT_STRIP.hintMaxLines) {
      const keep = hintLines.slice(0, STAT_STRIP.hintMaxLines - 1);
      const rest = hintLines.slice(STAT_STRIP.hintMaxLines - 1).join(' ');
      hintLines = [...keep, fitToWidth(rest, textW, (t) => m.measure(t, hintPt, 'normal'))];
    }
    return { label, value, hintLines };
  });

  const hintRows = Math.max(0, ...prepared.map((p) => p.hintLines.length));
  const contentH = labelLH + gap1 + valueLH + (hintRows ? gap2 + hintRows * hintLH : 0);
  const height = padY * 2 + contentH;

  const laid: StatCellLayout[] = prepared.map((p, i) => {
    const cellX = i * cellW;
    return {
      x: cellX,
      textX: cellX + padX,
      label: p.label,
      labelBaseline: padY + ascentOf(labelPt),
      value: p.value,
      valueBaseline: padY + labelLH + gap1 + ascentOf(valuePt),
      hintLines: p.hintLines,
      hintBaseline: padY + labelLH + gap1 + valueLH + gap2 + ascentOf(hintPt),
    };
  });

  return {
    height,
    layout: { kind: 'statStrip', width, height, cells: laid, labelPt, valuePt, hintPt },
  };
};

// ---------------------------------------------------------------------------
// Progress chart
// ---------------------------------------------------------------------------

/** The x position of each point, in time order, inside the plot's inner edges. */
const chartPointX = (
  index: number,
  count: number,
  time: number,
  firstTime: number,
  lastTime: number,
  innerLeft: number,
  innerW: number,
  innerRight: number
): number => {
  if (count === 1) return (innerLeft + innerRight) / 2;
  if (lastTime > firstTime)
    return innerLeft + ((time - firstTime) / (lastTime - firstTime)) * innerW;
  // Every point on one instant: spread them in order, or they stack on one spot.
  return innerLeft + (index / (count - 1)) * innerW;
};

/**
 * Progress over time on the band ladder.
 *
 * The y axis is the six bands, each with a gridline and its name; the x axis is
 * time, labelled at its first and last attempt. Each scored point is drawn in the
 * band it reached and the segments between them take the band of the point they
 * arrive at. A null band is not drawn and breaks the line, so an unscored week
 * never reads as a fall to zero. Nothing is drawn at a NaN coordinate: a point
 * whose date will not parse is dropped, not placed at the origin.
 */
export const measureLineChart = (
  data: LineChartData,
  m: TextMeasurer,
  width: number,
  s: number
): { height: number; layout: LineChartLayout } => {
  const labelPt = LINE_CHART.labelPt * s;
  const xLabelPt = LINE_CHART.xLabelPt * s;
  const captionPt = LINE_CHART.captionPt * s;
  const plotH = LINE_CHART.plotHeightBaseMm * s;
  const gutterGap = LINE_CHART.gutterGapBaseMm * s;
  const edgeInset = LINE_CHART.edgeInsetBaseMm * s;
  const averageLabelPt = LINE_CHART.averageLabelPt * s;

  const bandLabel = (b: number) => `${b}  ${getBandName(b)}`;
  const widest = Math.max(
    ...[1, 2, 3, 4, 5, 6].map((b) => m.measure(bandLabel(b), labelPt, 'normal'))
  );
  // The widest band name, the gap to the plot, and the same again as margin at the
  // page edge — so the longest name ("Outstanding") never runs off the left.
  const gutter = Math.max(LINE_CHART.gutterMinBaseMm * s, widest + gutterGap * 2);

  const top = LINE_CHART.topInsetBaseMm * s;
  const plot = {
    left: gutter,
    right: Math.max(
      gutter + 10 * s,
      width - LINE_CHART.averageGutterBaseMm * s - LINE_CHART.rightInsetBaseMm * s
    ),
    top,
    bottom: top + plotH,
  };

  const yOf = (band: number): number => {
    const b = clamp(band, LINE_CHART.bandMin, LINE_CHART.bandMax);
    return (
      plot.top + ((LINE_CHART.bandMax - b) / (LINE_CHART.bandMax - LINE_CHART.bandMin)) * plotH
    );
  };

  const gridlines = [1, 2, 3, 4, 5, 6].map((band) => {
    const y = yOf(band);
    return {
      band,
      y,
      label: bandLabel(band),
      labelX: plot.left - gutterGap,
      baseline: y + labelPt * MM_PER_PT * HALF_CAP,
    };
  });

  // Only points with a usable date take part; the rest carry no place on the axis.
  const timed = data.points
    .map((p: ReportTrendPoint) => ({ p, t: parseTime(p.at) }))
    .filter((x): x is { p: ReportTrendPoint; t: number } => x.t !== null)
    .sort((a, b) => a.t - b.t);

  const count = timed.length;
  const firstTime = count ? timed[0].t : 0;
  const lastTime = count ? timed[count - 1].t : 0;
  const innerLeft = plot.left + edgeInset;
  const innerRight = Math.max(innerLeft, plot.right - edgeInset);
  const innerW = innerRight - innerLeft;

  const polylines: ChartPointLayout[][] = [];
  let current: ChartPointLayout[] = [];
  timed.forEach(({ p, t }, i) => {
    if (p.band === null || !Number.isFinite(p.band)) {
      if (current.length) polylines.push(current);
      current = [];
      return;
    }
    const x = chartPointX(i, count, t, firstTime, lastTime, innerLeft, innerW, innerRight);
    const y = yOf(p.band);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    current.push({ x, y, band: bandKey(p.band) });
  });
  if (current.length) polylines.push(current);
  const points = polylines.flat();

  const avg =
    data.averageBand !== null && Number.isFinite(data.averageBand) ? data.averageBand : null;
  // The label sits in the margin past the plot's right edge, centred on the line,
  // so no point or segment can run under it.
  const averageLabelLH = averageLabelPt * MM_PER_PT * 1.3;
  const average =
    avg === null
      ? null
      : {
          y: yOf(avg),
          labelX: plot.right + gutterGap,
          lines: [
            {
              text: 'All-time',
              baseline: yOf(avg) - averageLabelLH / 2 + ascentOf(averageLabelPt),
            },
            {
              text: `average ${formatBand(avg)}`,
              baseline: yOf(avg) + averageLabelLH / 2 + ascentOf(averageLabelPt),
            },
          ],
        };

  const xLabelBaseline = plot.bottom + LINE_CHART.xLabelGapBaseMm * s + ascentOf(xLabelPt);
  const xLabels: ChartLabelLayout[] = [];
  if (count === 1) {
    xLabels.push({
      text: formatShortDate(timed[0].p.at, true),
      x: (innerLeft + innerRight) / 2,
      baseline: xLabelBaseline,
      align: 'center',
    });
  } else if (count > 1 && lastTime > firstTime) {
    const sameYear = new Date(firstTime).getFullYear() === new Date(lastTime).getFullYear();
    xLabels.push(
      {
        text: formatShortDate(timed[0].p.at, !sameYear),
        x: innerLeft,
        baseline: xLabelBaseline,
        align: 'left',
      },
      {
        text: formatShortDate(timed[count - 1].p.at, true),
        x: innerRight,
        baseline: xLabelBaseline,
        align: 'right',
      }
    );
  } else if (count > 1) {
    xLabels.push({
      text: formatShortDate(timed[0].p.at, true),
      x: (innerLeft + innerRight) / 2,
      baseline: xLabelBaseline,
      align: 'center',
    });
  }

  const emptyLabel: ChartLabelLayout | null =
    count === 0 || points.length === 0
      ? {
          text: 'No marked answers in this period',
          x: (plot.left + plot.right) / 2,
          baseline: plot.top + plotH / 2 + captionPt * MM_PER_PT * HALF_CAP,
          align: 'center',
        }
      : null;

  const captionText = (data.caption ?? '').trim();
  const captionLH = captionPt * MM_PER_PT * 1.3;
  const xLabelRowBottom = plot.bottom + LINE_CHART.xLabelGapBaseMm * s + xLabelPt * MM_PER_PT * 1.3;
  const captionLines = captionText ? m.wrap(captionText, width, captionPt, 'normal') : [];
  const captionTop = xLabelRowBottom + LINE_CHART.captionGapBaseMm * s;
  const captionBaseline = captionTop + ascentOf(captionPt);
  const height = captionLines.length
    ? captionTop + captionLines.length * captionLH
    : xLabelRowBottom;

  return {
    height,
    layout: {
      kind: 'lineChart',
      width,
      height,
      plot,
      gridlines,
      polylines,
      points,
      average,
      xLabels,
      emptyLabel,
      captionLines,
      captionBaseline,
      captionPt,
      labelPt,
      xLabelPt,
    },
  };
};

// ---------------------------------------------------------------------------
// Bar list
// ---------------------------------------------------------------------------

/**
 * One row per item: the label in its column, a track filled to the share of the
 * marks on offer, and the value flush right. A row with no attempts keeps its
 * track — drawn dashed and empty — and says "Not attempted" where the value goes.
 */
export const measureBarList = (
  data: BarListData,
  m: TextMeasurer,
  width: number,
  s: number
): { height: number; layout: BarListLayout } => {
  const rowH = BAR_LIST.rowHeightBaseMm * s;
  const labelW = BAR_LIST.labelWidthBaseMm * s;
  const valueW = BAR_LIST.valueWidthBaseMm * s;
  const gap = BAR_LIST.gapBaseMm * s;
  const barH = BAR_LIST.barHeightBaseMm * s;
  const labelPt = BAR_LIST.labelPt * s;
  const valuePt = BAR_LIST.valuePt * s;

  const trackX = labelW + gap;
  const trackWidth = Math.max(1, width - labelW - valueW - gap * 2);

  const rows = data.rows.map((row, i) => {
    const top = i * rowH;
    const mid = top + rowH / 2;
    const share = row.share !== null && Number.isFinite(row.share) ? clamp(row.share, 0, 1) : null;
    const notAttempted = row.attempts <= 0 || share === null;
    const valueText = notAttempted
      ? 'Not attempted'
      : `${formatPercent(share)} · ${formatAttempts(row.attempts)}`;
    return {
      label: fitToWidth(row.label, labelW, (t) => m.measure(t, labelPt, 'normal')),
      labelBaseline: mid + labelPt * MM_PER_PT * HALF_CAP,
      value: fitToWidth(valueText, valueW, (t) => m.measure(t, valuePt, 'normal')),
      valueBaseline: mid + valuePt * MM_PER_PT * HALF_CAP,
      barY: top + (rowH - barH) / 2,
      fillWidth: notAttempted || share === null ? 0 : share * trackWidth,
      notAttempted,
    };
  });

  const height = rows.length * rowH;
  return {
    height,
    layout: {
      kind: 'barList',
      width,
      height,
      rowHeight: rowH,
      trackX,
      trackWidth,
      barHeight: barH,
      rows,
      labelPt,
      valuePt,
    },
  };
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Measure a report block at `width` (the full content width, for the report's
 * blocks). A block with no payload of its kind measures as nothing, so a
 * mismatched block is skipped rather than drawn wrongly.
 */
export const measureReportBlock = (
  block: ContentBlock,
  m: TextMeasurer,
  width: number,
  s: number
): { height: number; layout?: ReportBlockLayout } => {
  const data = block.report;
  if (!data) return { height: 0 };
  if (block.kind === 'statStrip' && data.type === 'statStrip') {
    if (!data.cells.length) return { height: 0 };
    return measureStatStrip(data, m, width, s);
  }
  if (block.kind === 'lineChart' && data.type === 'lineChart') {
    return measureLineChart(data, m, width, s);
  }
  if (block.kind === 'barList' && data.type === 'barList') {
    if (!data.rows.length) return { height: 0 };
    return measureBarList(data, m, width, s);
  }
  if (block.kind === 'table' && data.type === 'table') {
    return measureGrid('table', data, m, width, s);
  }
  if (block.kind === 'heatmap' && data.type === 'heatmap') {
    return measureGrid('heatmap', data, m, width, s);
  }
  return { height: 0 };
};

// ---------------------------------------------------------------------------
// Tables and the tier heatmap
// ---------------------------------------------------------------------------

const clampBandUnit = (band: number): number => clamp(band, LINE_CHART.bandMin, LINE_CHART.bandMax);

/** The band a cell is shaded or chipped in: rounded and held to the six rungs. */
const rungOf = (band: number): number => clamp(Math.round(band), 1, 6);

/**
 * A heat share, 0–1, as the band it is shaded in: 0 is Band 1 and 1 is Band 6, so
 * the ramp is the band palette and the printed percentage is the measure.
 */
export const heatBand = (share: number): number => rungOf(1 + clamp(share, 0, 1) * 5);

/** Where a line of text anchors inside its cell, measured from the cell's left edge. */
const anchorX = (align: 'left' | 'center' | 'right', colW: number, pad: number): number =>
  align === 'right' ? colW - pad : align === 'center' ? colW / 2 : pad;

/** Word-wraps a display label (uppercase, tracked) to `maxWidthMm`, cutting any single word that cannot fit. */
export const wrapDisplay = (
  text: string,
  maxWidthMm: number,
  pt: number,
  m: TextMeasurer
): string[] => {
  const width = (t: string) => displayWidth(t, pt, m);
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (line && width(trial) > maxWidthMm) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => fitToWidth(l, maxWidthMm, width));
};

/** A name, wrapped to at most `TABLE.maxNameLines` lines, the last ellipsised if it still runs on. */
const wrapName = (text: string, maxWidthMm: number, pt: number, m: TextMeasurer): string[] => {
  const lines = m.wrap(text, maxWidthMm, pt, 'normal');
  const max = TABLE.maxNameLines;
  if (lines.length <= max) return lines;
  const keep = lines.slice(0, max - 1);
  const rest = lines.slice(max - 1).join(' ');
  return [...keep, fitToWidth(rest, maxWidthMm, (t) => m.measure(t, pt, 'normal'))];
};

/** What a cell measures to, and how to place it once its row's height is known. */
interface CellBuild {
  contentH: number;
  build: (rowH: number) => CellDrawing;
}

const emptyCell = (align: 'left' | 'center' | 'right', colW: number, s: number): CellBuild => {
  const pt = TABLE.bodyPt * s;
  const lh = pt * MM_PER_PT * TABLE.bodyLineFactor;
  const pad = TABLE.padXBaseMm * s;
  return {
    contentH: lh,
    build: (rowH) => ({
      kind: 'empty',
      line: {
        text: '—',
        fontPt: pt,
        x: anchorX(align, colW, pad),
        baseline: (rowH - lh) / 2 + ascentOf(pt),
        align,
        tone: 'muted',
      },
    }),
  };
};

/** A single line of value text, placed on the row's centre line. */
const valueCell = (
  text: string,
  tone: TextLineLayout['tone'],
  align: 'left' | 'center' | 'right',
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  const pt = TABLE.bodyPt * s;
  const lh = pt * MM_PER_PT * TABLE.bodyLineFactor;
  const pad = TABLE.padXBaseMm * s;
  const shown = fitToWidth(text, Math.max(1, colW - 2 * pad), (t) => m.measure(t, pt, 'normal'));
  return {
    contentH: lh,
    build: (rowH) => ({
      kind: 'lines',
      lines: [
        {
          text: shown,
          fontPt: pt,
          x: anchorX(align, colW, pad),
          baseline: (rowH - lh) / 2 + ascentOf(pt),
          align,
          tone,
        },
      ],
    }),
  };
};

const textCell = (
  cell: Extract<TableCell, { type: 'text' }>,
  align: 'left' | 'center' | 'right',
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  const pt = TABLE.bodyPt * s;
  const subPt = TABLE.subPt * s;
  const lh = pt * MM_PER_PT * TABLE.bodyLineFactor;
  const subLh = subPt * MM_PER_PT * TABLE.subLineFactor;
  const subGap = TABLE.subGapBaseMm * s;
  const pad = TABLE.padXBaseMm * s;
  const textW = Math.max(1, colW - 2 * pad);
  const names = wrapName(cell.text, textW, pt, m);
  const sub = cell.sublabel
    ? fitToWidth(cell.sublabel, textW, (t) => m.measure(t, subPt, 'normal'))
    : '';
  const contentH = names.length * lh + (sub ? subGap + subLh : 0);
  return {
    contentH,
    build: (rowH) => {
      const top = (rowH - contentH) / 2;
      const lines: TextLineLayout[] = names.map((t, i) => ({
        text: t,
        fontPt: pt,
        x: anchorX(align, colW, pad),
        baseline: top + i * lh + ascentOf(pt),
        align,
        tone: 'ink',
      }));
      if (sub) {
        lines.push({
          text: sub,
          fontPt: subPt,
          x: anchorX(align, colW, pad),
          baseline: top + names.length * lh + subGap + ascentOf(subPt),
          align,
          tone: 'muted',
        });
      }
      return { kind: 'lines', lines };
    },
  };
};

/** A share with a thin bar beside it. The percentage is always printed. */
const barCell = (value: number | null, colW: number, m: TextMeasurer, s: number): CellBuild => {
  const pt = TABLE.bodyPt * s;
  const lh = pt * MM_PER_PT * TABLE.bodyLineFactor;
  const pad = TABLE.padXBaseMm * s;
  const textW = Math.max(1, colW - 2 * pad);
  const reserve = m.measure('100%', pt, 'normal');
  const gap = TABLE.barGapBaseMm * s;
  const trackW = Math.max(1, textW - reserve - gap);
  const barH = TABLE.barHeightBaseMm * s;
  const share = value !== null && Number.isFinite(value) ? clamp(value, 0, 1) : null;
  return {
    contentH: lh,
    build: (rowH) => {
      const top = (rowH - lh) / 2;
      const track: BoxLayout = { x: pad, y: rowH / 2 - barH / 2, width: trackW, height: barH };
      return {
        kind: 'bar',
        track,
        fillWidth: share === null ? 0 : share * trackW,
        line: {
          text: share === null ? '—' : formatPercent(share),
          fontPt: pt,
          x: colW - pad,
          baseline: top + ascentOf(pt),
          align: 'right',
          tone: share === null ? 'muted' : 'ink',
        },
      };
    },
  };
};

/** A band as a small chip reading "Band n", so the number is printed as well as the colour. */
const chipCell = (
  value: number | null,
  align: 'left' | 'center' | 'right',
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  if (value === null || !Number.isFinite(value)) return emptyCell(align, colW, s);
  const band = rungOf(value);
  const pt = TABLE.chipPt * s;
  const pad = TABLE.padXBaseMm * s;
  const text = `Band ${band}`;
  const w = m.measure(text, pt, 'bold') + 2 * TABLE.chipPadXBaseMm * s;
  const h = TABLE.chipHeightBaseMm * s;
  return {
    contentH: h,
    build: (rowH) => {
      const x = align === 'right' ? colW - pad - w : align === 'center' ? (colW - w) / 2 : pad;
      const y = (rowH - h) / 2;
      return {
        kind: 'chip',
        band,
        box: { x, y, width: w, height: h },
        line: {
          text,
          fontPt: pt,
          x: x + w / 2,
          baseline: y + h / 2 + pt * MM_PER_PT * HALF_CAP,
          align: 'center',
          bold: true,
          tone: 'ink',
        },
      };
    },
  };
};

/** Up to twelve weekly means on the band ladder. A gap breaks the line; one point is a dot. */
const sparkCell = (
  points: (number | null)[],
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  const pad = TABLE.padXBaseMm * s;
  const boxW = Math.max(1, colW - 2 * pad);
  const h = TABLE.sparkHeightBaseMm * s;
  const inset = TABLE.sparkInsetBaseMm * s;
  const innerW = Math.max(1, boxW - 2 * inset);
  const n = points.length;
  const yOf = (band: number) =>
    ((LINE_CHART.bandMax - clampBandUnit(band)) / (LINE_CHART.bandMax - LINE_CHART.bandMin)) * h;
  const xOf = (i: number) => (n <= 1 ? boxW / 2 : inset + (i / (n - 1)) * innerW);
  const scored: ChartPointLayout[] = [];
  const polylines: ChartPointLayout[][] = [];
  let run: ChartPointLayout[] = [];
  points.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (run.length) polylines.push(run);
      run = [];
      return;
    }
    const pt = { x: xOf(i), y: yOf(v), band: rungOf(v) };
    scored.push(pt);
    run.push(pt);
  });
  if (run.length) polylines.push(run);
  if (!scored.length) return valueCell('—', 'muted', 'center', colW, m, s);
  return {
    contentH: h,
    build: (rowH) => {
      const y = (rowH - h) / 2;
      const box: BoxLayout = { x: pad, y, width: boxW, height: h };
      return {
        kind: 'spark',
        box,
        polylines,
        points: scored,
      };
    },
  };
};

/** A share in one tier: shaded in its band's tint, with the percentage printed in ink. */
const heatCell = (value: number | null, colW: number, s: number): CellBuild => {
  if (value === null || !Number.isFinite(value)) return emptyCell('center', colW, s);
  const band = heatBand(value);
  const pt = TABLE.heatPt * s;
  const inset = TABLE.heatInsetBaseMm * s;
  const text = formatPercent(value);
  return {
    contentH: 0,
    build: (rowH) => ({
      kind: 'heat',
      band,
      box: {
        x: inset,
        y: inset,
        width: Math.max(1, colW - 2 * inset),
        height: Math.max(1, rowH - 2 * inset),
      },
      line: {
        text,
        fontPt: pt,
        x: colW / 2,
        baseline: rowH / 2 + pt * MM_PER_PT * HALF_CAP,
        align: 'center',
        tone: 'ink',
      },
    }),
  };
};

/** A change in band, as an arrow and a number. A fall is the one thing here drawn in rose. */
const changeCell = (
  value: number | null,
  align: 'left' | 'center' | 'right',
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  const rounded = value === null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
  const tone: TextLineLayout['tone'] =
    rounded === null || rounded === 0 ? 'muted' : rounded > 0 ? 'body' : 'rose';
  return valueCell(formatChange(value), tone, align, colW, m, s);
};

/** One cell, built for its column. A cell whose type does not match its column is an em dash, not a guess. */
const buildCell = (
  cell: TableCell | undefined,
  column: TableColumn,
  colW: number,
  m: TextMeasurer,
  s: number
): CellBuild => {
  const align = column.align;
  if (!cell || cell.type !== (column.kind as ColumnKind)) return emptyCell(align, colW, s);
  switch (cell.type) {
    case 'text':
      return textCell(cell, align, colW, m, s);
    case 'number':
      return valueCell(formatInt(cell.value), 'ink', align, colW, m, s);
    case 'percent':
      return valueCell(
        cell.value === null || !Number.isFinite(cell.value) ? '—' : formatPercent(cell.value),
        cell.value === null ? 'muted' : 'ink',
        align,
        colW,
        m,
        s
      );
    case 'bar':
      return barCell(cell.value, colW, m, s);
    case 'band':
      return chipCell(cell.value, align, colW, m, s);
    case 'sparkline':
      return sparkCell(cell.points, colW, m, s);
    case 'date':
      return valueCell(
        cell.iso ? formatShortDate(cell.iso, true) || '—' : '—',
        cell.iso ? 'body' : 'muted',
        align,
        colW,
        m,
        s
      );
    case 'change':
      return changeCell(cell.value, align, colW, m, s);
    case 'heat':
      return heatCell(cell.value, colW, s);
    default:
      return emptyCell(align, colW, s);
  }
};

/** A group heading row: the course over its topics. Its continuation form says so. */
const groupRow = (label: string, width: number, m: TextMeasurer, s: number): TableRowLayout => {
  const pt = TABLE.groupPt * s;
  const pad = TABLE.padXBaseMm * s;
  const h = TABLE.groupHeightBaseMm * s;
  const textW = Math.max(1, width - 2 * pad);
  const measureOf = (t: string) => displayWidth(t, pt, m);
  return {
    type: 'group',
    height: h,
    label: fitToWidth(label, textW, measureOf),
    continuedLabel: fitToWidth(`${label} (continued)`, textW, measureOf),
    labelBaseline: h - 2.2 * s,
    cells: [],
    shaded: false,
  };
};

/** The header: display labels, wrapped to as many lines as their column needs. */
const headerOf = (
  columns: TableColumn[],
  widths: number[],
  m: TextMeasurer,
  s: number
): TableHeaderLayout => {
  const pt = TABLE.headerPt * s;
  const lh = pt * MM_PER_PT * TABLE.headerLineFactor;
  const pad = TABLE.padXBaseMm * s;
  const gap = TABLE.headerGapBaseMm * s;
  const wrapped = columns.map((c, i) =>
    wrapDisplay(c.header, Math.max(1, widths[i] - 2 * pad), pt, m)
  );
  const lines = Math.max(1, ...wrapped.map((l) => l.length));
  const height = TABLE.padYBaseMm * s * 2 + lines * lh + gap;
  const cells = columns.map((c, i) => {
    const colW = widths[i];
    return {
      x: widths.slice(0, i).reduce((a, b) => a + b, 0),
      width: colW,
      align: 'left' as const,
      lines: wrapped[i].map((text, k) => {
        const w = displayWidth(text, pt, m);
        const x =
          c.align === 'right' ? colW - pad - w : c.align === 'center' ? (colW - w) / 2 : pad;
        return {
          text,
          fontPt: pt,
          x,
          baseline: TABLE.padYBaseMm * s + k * lh + ascentOf(pt),
          align: 'left' as const,
          tone: 'muted' as const,
        };
      }),
    };
  });
  return { height, cells, labelPt: pt };
};

/** Measure one body row: its cells, and the height of the tallest of them, never less than the row minimum. */
const bodyRowOf = (
  cells: TableCell[],
  columns: TableColumn[],
  widths: number[],
  group: string | undefined,
  shaded: boolean,
  m: TextMeasurer,
  s: number
): TableRowLayout => {
  const builds = columns.map((c, i) => buildCell(cells[i], c, widths[i], m, s));
  const pad = TABLE.padYBaseMm * s;
  const rowH = Math.max(
    TABLE.minRowBaseMm * s,
    Math.max(0, ...builds.map((b) => b.contentH)) + 2 * pad
  );
  let x = 0;
  const laid: TableCellLayout[] = builds.map((b, i) => {
    const cell = { x, width: widths[i], drawing: b.build(rowH) };
    x += widths[i];
    return cell;
  });
  return { type: 'body', height: rowH, cells: laid, group, shaded };
};

/**
 * Measure a table or heatmap at `width`. Every row's height is fixed here, from its
 * cells, so a split can sum heights without measuring text again.
 */
export const measureGrid = (
  kind: 'table' | 'heatmap',
  data: { columns: TableColumn[]; rows: TableRow[]; zebra?: boolean },
  m: TextMeasurer,
  width: number,
  s: number
): { height: number; layout: TableLayout } => {
  const columns = data.columns;
  const totalWeight = columns.reduce((sum, c) => sum + Math.max(0.01, c.widthWeight), 0) || 1;
  const widths = columns.map((c) => (width * Math.max(0.01, c.widthWeight)) / totalWeight);
  const header = headerOf(columns, widths, m, s);

  const rows: TableRowLayout[] = [];
  let group: string | undefined;
  let bodyIndex = 0;
  for (const row of data.rows) {
    if (row.type === 'group') {
      group = row.label;
      rows.push(groupRow(row.label, width, m, s));
      continue;
    }
    const shaded = !!data.zebra && bodyIndex % 2 === 1;
    rows.push(bodyRowOf(row.cells, columns, widths, group, shaded, m, s));
    bodyIndex += 1;
  }

  const bodyRows = rows.filter((r) => r.type === 'body').length;
  const height = header.height + rows.reduce((sum, r) => sum + r.height, 0);
  return {
    height,
    layout: {
      kind,
      width,
      height,
      header,
      rows,
      bodyRows,
      zebra: !!data.zebra,
      bodyPt: TABLE.bodyPt * s,
      subPt: TABLE.subPt * s,
      continued: false,
    },
  };
};

/**
 * The least room a table can start in: its header and the rows up to the second
 * body row (or the whole table, when it has fewer). A heading is kept with this,
 * so it never stands alone over a header at a page foot.
 */
export const gridMinimumHeight = (layout: TableLayout): number => {
  const need = Math.min(TABLE.MIN_HEAD_ROWS, layout.bodyRows);
  let total = layout.header.height;
  let bodies = 0;
  for (const row of layout.rows) {
    if (bodies >= need) break;
    total += row.height;
    if (row.type === 'body') bodies += 1;
  }
  return total;
};

/**
 * Split a table between rows so the head fits `available` mm, or return null to
 * move the whole table. The head keeps at least `MIN_HEAD_ROWS` body rows and
 * never ends on a group heading; the tail keeps at least `MIN_TAIL_ROWS` and, when
 * a group carries on, begins with that group's heading labelled "(continued)".
 * Each fragment repeats the header. Body rows are conserved exactly.
 */
export const splitGridLayout = (
  layout: TableLayout,
  available: number
): [TableLayout, TableLayout] | null => {
  const minHead = TABLE.MIN_HEAD_ROWS;
  const minTail = TABLE.MIN_TAIL_ROWS;
  if (layout.bodyRows < minHead + minTail) return null;

  const { rows } = layout;
  const bodiesIn = (end: number) => rows.slice(0, end).filter((r) => r.type === 'body').length;
  const heightOf = (end: number) => rows.slice(0, end).reduce((sum, r) => sum + r.height, 0);

  // The longest run of whole rows that fits.
  let cut = 0;
  let used = layout.header.height;
  for (let i = 0; i < rows.length; i++) {
    if (used + rows[i].height > available + 1e-6) break;
    used += rows[i].height;
    cut = i + 1;
  }
  // A heading never ends a fragment on its own.
  while (cut > 0 && rows[cut - 1].type === 'group') cut -= 1;

  // Keep the tail from standing on too few rows: give the head's last rows back.
  const keep = layout.bodyRows - minTail;
  if (bodiesIn(cut) > keep) {
    if (keep < minHead) return null;
    while (cut > 0 && bodiesIn(cut) > keep) cut -= 1;
    while (cut > 0 && rows[cut - 1].type === 'group') cut -= 1;
  }
  const headBodies = bodiesIn(cut);
  if (headBodies < minHead || layout.bodyRows - headBodies < minTail) return null;
  used = layout.header.height + heightOf(cut);

  // A group that carries on across the break restates its heading, marked as such.
  let owner = -1;
  for (let i = 0; i < cut; i++) if (rows[i].type === 'group') owner = i;
  const tailRows = rows.slice(cut);
  const firstTail = tailRows[0];
  const carriesOn =
    owner >= 0 && firstTail && firstTail.type === 'body' && firstTail.group === rows[owner].label;
  const restated: TableRowLayout[] = carriesOn
    ? [
        {
          ...rows[owner],
          label: rows[owner].continuedLabel ?? rows[owner].label,
        },
      ]
    : [];
  const tailBody =
    tailRows.reduce((sum, r) => sum + r.height, 0) + restated.reduce((a, r) => a + r.height, 0);

  const head: TableLayout = {
    ...layout,
    rows: rows.slice(0, cut),
    bodyRows: headBodies,
    height: used,
  };
  const tail: TableLayout = {
    ...layout,
    rows: [...restated, ...tailRows],
    bodyRows: layout.bodyRows - headBodies,
    height: layout.header.height + tailBody,
    continued: true,
  };
  return [head, tail];
};
