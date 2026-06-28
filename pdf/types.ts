// pdf/types.ts
//
// Shared types for the client-side vector-PDF exporter. These deliberately
// avoid importing jsPDF so the pure layout/text modules can be unit-tested
// under Node without a DOM or the (lazily CDN-loaded) engine present.

/** Supported physical page sizes (portrait), in millimetres. */
export type PageSizeName = 'a4' | 'letter';

export interface PageDimensions {
  width: number;
  height: number;
}

/** Page geometry in millimetres. Margins are intentionally NOT scaled. */
export const PAGE_DIMENSIONS: Record<PageSizeName, PageDimensions> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export const PAGE_MARGIN_MM = 10;

/** Points-per-millimetre conversion (1 pt = 1/72 inch, 1 inch = 25.4 mm). */
export const PT_PER_MM = 72 / 25.4;
export const MM_PER_PT = 25.4 / 72;

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

/**
 * Geometry of the score-summary box, shared by the measurer (layout) and the
 * drawer (orchestrator) so the box is always tall enough for its contents.
 * All *Pt values are base point sizes (pre-scale); *Mm values are base mm.
 */
export const SCORE_SUMMARY = {
  innerPadBaseMm: 3,
  accentBarBaseMm: 1.6,
  chipPt: 17,
  labelPt: 7,
  labelLineFactor: 1.6,
  metricsLineFactor: 1.3,
  chipReserveBaseMm: 22,
};

/**
 * Shared indentation / accent-bar geometry (base mm, pre-scale) used by both
 * the measurer and the drawer so list bullets, criterion text, and accented
 * paragraphs align and wrap to the same width.
 */
export const LAYOUT = {
  /** Indent for bullets, criterion label/feedback, and accented paragraphs. */
  contentIndentBaseMm: 4,
  /** Width of the left accent bar drawn in the indent gutter. */
  accentBarBaseMm: 0.9,
  /** Criterion chip reserve so the title wraps before the mark chip. */
  criterionChipReserveBaseMm: 18,
};

/**
 * A logical run of styled text within a block. Text uses the app's in-house
 * markup (**bold**, *italic*, ^sup, _sub) which `toText()` converts to
 * selectable Unicode at draw time.
 */
export interface TextRun {
  text: string;
  /** Base point size BEFORE multiplying by the page scale factor. */
  baseFontPt: number;
  style?: FontStyle;
  /** RGB triple 0-255. */
  color?: [number, number, number];
  /** Extra leading multiplier applied to this run's line height. */
  lineHeightFactor?: number;
}

/** Block kinds the orchestrator knows how to draw. */
export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'scoreSummary'
  | 'listItem'
  | 'criterion'
  | 'divider'
  | 'spacer';

/**
 * A measured-but-not-yet-placed unit of content. `buildBlocks` produces these
 * (DOM-free); `measureBlocks` fills in `height`.
 */
export interface ContentBlock {
  kind: BlockKind;
  /** Stable id for debugging / numbering. */
  id: string;
  /** Primary styled runs (most blocks are single-run paragraphs). */
  runs: TextRun[];
  /** Optional label, e.g. criterion title or "1." prefix. */
  label?: string;
  /** Optional right-aligned chip, e.g. "3 / 4". */
  chip?: string;
  /** Vertical padding above/below the block content, base mm (pre-scale). */
  basePadTop?: number;
  basePadBottom?: number;
  /** When true the block may be split across columns/pages (long prose). */
  breakable?: boolean;
  /** Accent colour for rules / bars associated with the block. */
  accent?: [number, number, number];
}

/** A block with a computed rendered height (mm) at a given scale. */
export interface MeasuredBlock extends ContentBlock {
  /** Total rendered height in mm including padding. */
  height: number;
  /** Pre-wrapped lines per run (parallel to `runs`). */
  wrapped: string[][];
  /** Top padding resolved to mm (basePadTop * pScale). */
  padTopMm: number;
  /** Bottom padding resolved to mm (basePadBottom * pScale). */
  padBottomMm: number;
  /** Line height (mm) of the primary run — used for drawing and splitting. */
  lineHeightMm: number;
  /** Horizontal indent (mm) applied to body text; matches the wrap width. */
  textIndentMm: number;
  /** Pre-wrapped label lines (criterion titles can span multiple lines). */
  labelWrapped?: string[];
}

/** Result of placing a block during the column-major flow. */
export interface PlacedBlock {
  block: MeasuredBlock;
  /** 0-based page index. */
  page: number;
  /** 0-based column index within the page. */
  column: number;
  /** Top offset (mm) within the column content area. */
  top: number;
}

/** Column layout geometry used by the pure flow algorithm. */
export interface ColumnGeometry {
  columnsPerPage: number;
  /** Usable height of a single column in mm (page height − margins − header − footer). */
  columnHeight: number;
  /** Usable width of a single column in mm. */
  columnWidth: number;
  /** Horizontal gap between columns in mm. */
  columnGap: number;
  /** Left edge (mm) of the first column. */
  contentLeft: number;
  /** Top edge (mm) where column content begins (below the header). */
  contentTop: number;
}

/**
 * Abstraction over text measurement so layout stays DOM/engine free and
 * unit-testable. The orchestrator supplies a jsPDF-backed implementation; tests
 * supply deterministic fakes.
 */
export interface TextMeasurer {
  /** Wrap `text` to `maxWidthMm` at `fontPt`/`style`, returning the lines. */
  wrap(text: string, maxWidthMm: number, fontPt: number, style: FontStyle): string[];
  /** Height in mm of a single line at `fontPt` with the given leading. */
  lineHeight(fontPt: number, lineHeightFactor: number): number;
}

/** Minimal structural view of a jsPDF document instance (CDN-loaded). */
export interface JsPdfLike {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  addPage(): JsPdfLike;
  setPage(n: number): JsPdfLike;
  setFont(family: string, style?: string): JsPdfLike;
  setFontSize(size: number): JsPdfLike;
  setTextColor(r: number, g: number, b: number): JsPdfLike;
  setDrawColor(r: number, g: number, b: number): JsPdfLike;
  setFillColor(r: number, g: number, b: number): JsPdfLike;
  setLineWidth(w: number): JsPdfLike;
  setLineDashPattern(pattern: number[], phase: number): JsPdfLike;
  text(text: string | string[], x: number, y: number, opts?: Record<string, unknown>): JsPdfLike;
  line(x1: number, y1: number, x2: number, y2: number): JsPdfLike;
  rect(x: number, y: number, w: number, h: number, style?: string): JsPdfLike;
  roundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rx: number,
    ry: number,
    style?: string
  ): JsPdfLike;
  splitTextToSize(text: string, maxWidth: number, opts?: Record<string, unknown>): string[];
  getTextWidth(text: string): number;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): JsPdfLike;
  addFileToVFS(filename: string, data: string): JsPdfLike;
  addFont(filename: string, family: string, style: string): JsPdfLike;
  getFontList(): Record<string, string[]>;
  setGState(gState: unknown): JsPdfLike;
  GState: new (opts: { opacity: number }) => unknown;
  setProperties(props: {
    title?: string;
    subject?: string;
    author?: string;
    keywords?: string;
    creator?: string;
  }): JsPdfLike;
  save(filename: string): void;
}

/** Toast sink: integrates with a host app or falls back to a DOM toast. */
export type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

/** Progress callback for the export overlay. */
export type ProgressFn = (fraction: number, label: string) => void;
