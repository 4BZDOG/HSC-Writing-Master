// pdf/reportBlocks.ts
//
// The payloads the progress report's block kinds carry, and the geometry each one
// is measured to. Pure types: no jsPDF, no layout, no drawing — so the builder,
// the measurer and the drawer can all name them without importing each other.
//
// One optional field per block (`ContentBlock.report`), discriminated on `type`,
// rather than a dozen optional fields on the block. The measured counterpart
// (`MeasuredBlock.reportLayout`) holds every coordinate the drawer needs, computed
// once at measure time, so what is drawn is exactly what was measured.

import type { ReportStat, ReportTrendPoint } from './reportModel';

/** The result strip: four or five cells across the full content width. */
export interface StatStripData {
  type: 'statStrip';
  cells: ReportStat[];
}

/** Progress over time on the band ladder (y = Band 1–6, x = time). */
export interface LineChartData {
  type: 'lineChart';
  /** Oldest first. Points with a null band are kept for their date but not drawn. */
  points: ReportTrendPoint[];
  /** The all-time average the dashed line stands for, or null for none. */
  averageBand: number | null;
  /** Printed under the chart, in the words the builder chose. */
  caption: string;
}

/** One bar of a bar list: a share of the marks on offer, and how many attempts it stands for. */
export interface BarListRow {
  label: string;
  /** Share of the marks on offer, 0–1. Null when nothing was attempted. */
  share: number | null;
  attempts: number;
}

/** Horizontal bars, one per row, label left, value right. */
export interface BarListData {
  type: 'barList';
  rows: BarListRow[];
}

/**
 * How a table column reads its cells. The column says how its values are drawn;
 * each cell carries a value of the matching `TableCell.type`.
 */
export type ColumnKind =
  | 'text'
  | 'number'
  | 'percent'
  | 'bar'
  | 'band'
  | 'sparkline'
  | 'date'
  | 'change'
  | 'heat';

/** One column of a table or heatmap: its header, how it aligns, and its share of the width. */
export interface TableColumn {
  key: string;
  /** The header, in the words the page prints. Wrapped to as many lines as it needs. */
  header: string;
  align: 'left' | 'right' | 'center';
  /** Share of the table's width, relative to the other columns. */
  widthWeight: number;
  kind: ColumnKind;
}

/**
 * One cell. `type` matches the column's `kind`; a mismatch is drawn as an em dash
 * rather than guessed at.
 */
export type TableCell =
  /** A name, with an optional quieter second line (a course under a topic, a tier under a verb). */
  | { type: 'text'; text: string; sublabel?: string }
  /** A count, drawn right-aligned. Null is an em dash. */
  | { type: 'number'; value: number | null }
  /** A share of the marks on offer, 0–1, as a percentage. */
  | { type: 'percent'; value: number | null }
  /** A share of the marks on offer, 0–1: the percentage, with a thin bar beside it. */
  | { type: 'bar'; value: number | null }
  /** A band, drawn as a chip reading "Band n". */
  | { type: 'band'; value: number | null }
  /** Up to twelve weekly mean bands, oldest first; null is a gap in the line. */
  | { type: 'sparkline'; points: (number | null)[] }
  /** An ISO timestamp, drawn as a short date. */
  | { type: 'date'; iso: string | null }
  /** A change in band: ▲ or ▼ with the number. Zero reads as level. */
  | { type: 'change'; value: number | null }
  /** A share of marks in one tier, 0–1: shaded by its band, with the percentage printed. */
  | { type: 'heat'; value: number | null };

/**
 * One row of a table. A group row is a heading over the body rows that follow it
 * (a course over its topics); it spans the table and carries no cells.
 */
export type TableRow = { type: 'group'; label: string } | { type: 'body'; cells: TableCell[] };

/** A table: header row, body rows, optional group headings. Splits by whole rows. */
export interface TableData {
  type: 'table';
  columns: TableColumn[];
  rows: TableRow[];
  /** Shade every other body row, for a long table read across. */
  zebra?: boolean;
}

/**
 * The tier heatmap: students down, the six command-verb tiers across, each cell
 * shaded by the mark share it earned. The same grid as a table, with heat cells.
 */
export interface HeatmapData {
  type: 'heatmap';
  columns: TableColumn[];
  rows: TableRow[];
}

/** Everything a report block kind carries, discriminated on `type`. */
export type ReportBlockData = StatStripData | LineChartData | BarListData | TableData | HeatmapData;

// ---------------------------------------------------------------------------
// Measured geometry. Every number is in mm, relative to the block's content box
// (its top-left after `padTopMm`), at the page scale it was measured at.
// ---------------------------------------------------------------------------

export interface StatCellLayout {
  /** Left edge of the cell, relative to the strip's left edge. */
  x: number;
  /** Left edge of the cell's text (cell edge plus inner padding). */
  textX: number;
  /** The label, fitted to the cell with an ellipsis if it must be. */
  label: string;
  labelBaseline: number;
  /** The value, fitted to the cell. */
  value: string;
  valueBaseline: number;
  /** The hint, wrapped to at most two lines. Empty when the cell has no hint. */
  hintLines: string[];
  hintBaseline: number;
}

export interface StatStripLayout {
  kind: 'statStrip';
  width: number;
  height: number;
  cells: StatCellLayout[];
  /** Point size of the label, the value (one size for the whole strip) and the hint. */
  labelPt: number;
  valuePt: number;
  hintPt: number;
}

export interface ChartPointLayout {
  x: number;
  y: number;
  /** The band the point is drawn in: its rounded, clamped band (1–6). */
  band: number;
}

export interface ChartLabelLayout {
  text: string;
  x: number;
  baseline: number;
  align: 'left' | 'center' | 'right';
}

export interface LineChartLayout {
  kind: 'lineChart';
  width: number;
  height: number;
  /** The plot rectangle: left/right edges and the top/bottom of its y range. */
  plot: { left: number; right: number; top: number; bottom: number };
  /** Gridlines at bands 1–6: the rule's y, and the band label right-aligned at `labelX`. */
  gridlines: { band: number; y: number; label: string; labelX: number; baseline: number }[];
  /** Consecutive scored points, grouped so a null band breaks the line. */
  polylines: ChartPointLayout[][];
  /** Every drawn point, in time order. */
  points: ChartPointLayout[];
  /** The dashed average line, and its label set in the margin to its right, one line per row. */
  average: { y: number; labelX: number; lines: { text: string; baseline: number }[] } | null;
  /** Date labels under the plot: first and last, or one centred label. */
  xLabels: ChartLabelLayout[];
  /** Shown in the plot when there is no point to draw. */
  emptyLabel: ChartLabelLayout | null;
  captionLines: string[];
  captionBaseline: number;
  captionPt: number;
  labelPt: number;
  xLabelPt: number;
}

export interface BarRowLayout {
  label: string;
  labelBaseline: number;
  value: string;
  valueBaseline: number;
  /** Track top, and the filled length within the track (0 when not attempted). */
  barY: number;
  fillWidth: number;
  notAttempted: boolean;
}

export interface BarListLayout {
  kind: 'barList';
  width: number;
  height: number;
  rowHeight: number;
  /** Track geometry, relative to the list's left edge. */
  trackX: number;
  trackWidth: number;
  barHeight: number;
  rows: BarRowLayout[];
  labelPt: number;
  valuePt: number;
}

/** A rectangle in a block's content box, mm. */
export interface BoxLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of text, placed by its baseline. */
export interface TextLineLayout {
  text: string;
  /** The line's point size, mm-scaled, so the drawer sets the same size the measurer wrapped at. */
  fontPt: number;
  x: number;
  baseline: number;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  tone: 'ink' | 'body' | 'muted' | 'slate' | 'rose';
}

/**
 * What one table cell is drawn as, positioned in the cell's own box (`x` 0 is the
 * cell's left edge). The drawer switches on `kind` and never re-lays-out a cell.
 */
export type CellDrawing =
  | { kind: 'lines'; lines: TextLineLayout[] }
  | { kind: 'bar'; line: TextLineLayout; track: BoxLayout; fillWidth: number }
  | { kind: 'chip'; box: BoxLayout; line: TextLineLayout; band: number }
  | {
      kind: 'spark';
      box: BoxLayout;
      polylines: ChartPointLayout[][];
      points: ChartPointLayout[];
    }
  | { kind: 'heat'; box: BoxLayout; band: number; line: TextLineLayout }
  | { kind: 'empty'; line: TextLineLayout };

export interface TableCellLayout {
  /** Left edge within the row, and the cell's width. */
  x: number;
  width: number;
  drawing: CellDrawing;
}

export interface TableRowLayout {
  type: 'group' | 'body';
  /** The row's height, mm. Every row's height is measured, so a split can sum them. */
  height: number;
  /** A group row's heading, as drawn, and its baseline offset from the row's top. */
  label?: string;
  labelBaseline?: number;
  /** A group row's heading when its body rows carry on from a previous page. */
  continuedLabel?: string;
  /** The group a body row belongs to (its heading's text), for a split to restate it. */
  group?: string;
  /** Body rows only: the cells, left to right. */
  cells: TableCellLayout[];
  /** Body rows only: whether the row is shaded (zebra). */
  shaded: boolean;
}

export interface TableHeaderLayout {
  height: number;
  /** The header cells, one per column, with the header's lines placed by baseline. */
  cells: {
    x: number;
    width: number;
    align: 'left' | 'center' | 'right';
    lines: TextLineLayout[];
  }[];
  /** The header's type size, mm-scaled: the display labels are drawn at it. */
  labelPt: number;
}

export interface TableLayout {
  kind: 'table' | 'heatmap';
  width: number;
  /** The whole table's height: header, then every row. A fragment's height is its own. */
  height: number;
  header: TableHeaderLayout;
  rows: TableRowLayout[];
  /** Body rows in this fragment (group headings do not count). */
  bodyRows: number;
  zebra: boolean;
  /** Type sizes the body is drawn at, shared by the measurer and the drawer. */
  bodyPt: number;
  subPt: number;
  /** Whether this fragment carries the table's start (a split's continuation does not). */
  continued: boolean;
}

export type ReportBlockLayout = StatStripLayout | LineChartLayout | BarListLayout | TableLayout;
