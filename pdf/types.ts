import type { ToastType } from '../hooks/useToast';
import type { IconName } from './icons';
// pdf/types.ts
//
// Shared types for the client-side vector-PDF exporter. These deliberately
// avoid importing jsPDF so the pure layout/text modules can be unit-tested
// under Node without a DOM or the (lazily loaded) engine present.

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
 * A styled run WITHIN a line of text — several sit side by side on one
 * baseline. That is what distinguishes it from a `TextRun`, which styles a
 * whole paragraph. Built by `pdf/inline.ts`; declared here so the layout and
 * drawing types can name it without importing that module.
 */
export interface InlineSpan {
  text: string;
  style: FontStyle;
  /** RGB triple 0-255. Absent means "the block's colour". */
  color?: [number, number, number];
}

/**
 * Geometry of the result strip, shared by the measurer (layout) and the drawer
 * (orchestrator) so the strip is always tall enough for its contents. All *Pt
 * values are base point sizes (pre-scale); *Mm values are base mm.
 *
 * It spans the full content width in three cells — the mark, the band it sits
 * on, and the metrics. It used to be a single-column box, which meant the
 * column beside it was structurally guaranteed to be empty: nothing else could
 * flow there, because the full-width band under it started below the box.
 */
export const SCORE_SUMMARY = {
  innerPadBaseMm: 4,
  accentBarBaseMm: 1.8,
  /** The mark itself — the largest thing on the page after the question. */
  chipPt: 26,
  labelPt: 7,
  /** "BAND 4 · SOUND". */
  bandPt: 10.5,
  metricPt: 8.5,
  labelLineFactor: 1.6,
  metricsLineFactor: 1.45,
  /** Width of the mark cell and the metrics cell; the band cell takes the rest. */
  markCellBaseMm: 44,
  metricCellBaseMm: 44,
  cellGapBaseMm: 6,
  /** Hairline between cells, so the three read as one instrument. */
  cellRuleBaseMm: 0.25,
};

/**
 * The bounding box drawn round the question, and round the two long responses.
 *
 * Paper has no hover state and no scroll position: a reader coming back to the
 * page needs the question, their own words and the better answer to be findable
 * without reading any of them. A frame does that where a heading alone does not.
 */
export const PANEL = {
  padXBaseMm: 3.6,
  padYBaseMm: 3.2,
  radiusBaseMm: 1.8,
  borderBaseMm: 0.3,
  /** How far the panel fill is mixed from its accent towards paper white. */
  fillMix: 0.94,
  /** The same for a borderless tint, which has no frame to sit inside. */
  tintMix: 0.92,
};

/**
 * The oblique applied to a display heading.
 *
 * The app sets its card titles in uppercase black italic (`CARD_HEADER_TITLE`),
 * and the printed report answers to the same voice — but the embedded Inter
 * carries normal and bold only, and adding an italic face would put another
 * ~340KB into every exported file. A shear of the text matrix is what a PDF
 * producer does for a synthetic oblique, and at 12 degrees it reads as the same
 * heading rather than as a different font.
 */
export const DISPLAY = {
  shear: Math.tan((12 * Math.PI) / 180),
  /** Uppercase display type needs its letters opened up a little. */
  letterSpacingEm: 0.02,
};

/** Section-heading furniture: the icon, its gap, and the rule under the row. */
export const HEADING = {
  iconBaseMm: 3.5,
  iconGapBaseMm: 1.8,
  ruleGapBaseMm: 1.2,
  ruleWeightBaseMm: 0.25,
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
 * The proportion meter drawn under a criterion's title — how much of that
 * criterion's marks the response actually earned.
 *
 * "3 / 4" is a fact a reader has to do arithmetic on, and a page of them is a
 * page of arithmetic; the same fact as a filled track is read at a glance, and
 * a column of tracks shows at once which criterion let the response down. It
 * costs about 2.5mm per criterion.
 */
export const METER = {
  heightBaseMm: 1.3,
  gapAboveBaseMm: 1.2,
  gapBelowBaseMm: 1.4,
  /** Fully earned, most of the way there, and short of it. */
  strongRatio: 0.85,
  fairRatio: 0.5,
};

/**
 * The band scale under the score summary: six segments, the achieved one
 * filled and the rest outlined. A mark out of 8 means little on its own — what
 * a student and a teacher both want to know is where that sits on the band
 * ladder, and where the next band starts.
 */
export const BAND_SCALE = {
  segments: 6,
  heightBaseMm: 2.4,
  gapBaseMm: 1.8,
  segmentGapBaseMm: 0.8,
  labelPt: 5.5,
};

/**
 * Ruled writing lines for handwritten marker notes. Print-first: the report
 * comes off the printer into a conversation with a student, and the teacher
 * needs somewhere to write during it.
 */
export const RULE_LINES = {
  gapBaseMm: 6,
  inset: 0.5,
  /**
   * A ceiling on how far `flexibleRules` will grow. Space a teacher can write in
   * is worth having; a page ruled from head to foot is a notebook, not a report.
   */
  maxFlexible: 14,
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
  /**
   * The same content resolved into styled inline spans — **bold** emphasis,
   * syllabus keywords, the command verb. Present on runs that carry model prose;
   * when it is, the run is measured and drawn span by span so the printed page
   * reads in the same voice as the screen. `text` stays alongside it as the
   * plain fallback (and as what a caller comparing content should read).
   */
  spans?: InlineSpan[];
}

/** Block kinds the orchestrator knows how to draw. */
export type BlockKind =
  | 'masthead'
  | 'questionCard'
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
  /**
   * Proportion earned, drawn as a filled track under the block's label. The
   * chip states it in numerals; this makes a column of criteria comparable at
   * a glance (see METER).
   */
  meter?: { value: number; max: number };
  /**
   * Draw this block across the full content width (both columns + the gap)
   * rather than confined to one column. The long prose sections — the question,
   * the student response, and the improved response — read better full-width
   * than in a narrow column. The layout engine flows such blocks as a
   * full-width "band" that interrupts the two-column flow (see flowBlocks).
   */
  fullWidth?: boolean;
  /** Band reached, drawn as a segmented ladder (see BAND_SCALE). */
  bandScale?: number;
  /**
   * Number of rungs to draw on the band ladder — the question's target (max
   * achievable) band. A lower-tier question caps below 6; absent means the full
   * six-band ladder. See BAND_SCALE.
   */
  bandScaleMax?: number;
  /**
   * Draw this list item's marker as an empty tick box rather than a bullet —
   * for the next steps, which are meant to be worked through and ticked off.
   */
  checkbox?: boolean;
  /** Blank ruled lines drawn under the block, for handwritten notes. */
  ruleLines?: number;
  /**
   * Grow `ruleLines` to fill whatever column space the block lands in.
   *
   * The notes are deliberately empty, so their height is not content — it is
   * however much room is going. Fixed at eight rules they either overflowed the
   * page they landed on or started a fresh one and left it 90% white; grown to
   * fit, they take the space that was going to be blank anyway and hand it to
   * the teacher as somewhere to write.
   */
  flexibleRules?: boolean;
  /**
   * The glyph drawn to the left of a heading (see `pdf/icons.ts`). A second way
   * to recognise a section at a glance; never the only way, since the heading
   * beside it says the same thing in words.
   */
  icon?: IconName;
  /**
   * Set the block's text as a DISPLAY heading — uppercase, bold, sheared into
   * an oblique — the way the app sets its card titles. Reserved for the
   * report's own section headings, so a reader can tell the report's voice from
   * the marker's at a glance.
   */
  display?: boolean;
  /**
   * Draw a bounding box behind and around the block: a hairline border, a
   * radius, and a fill mixed from `panelAccent` towards paper white. The block's
   * measured padding already includes the panel's inset, so a panelled block
   * takes exactly the room its frame needs.
   */
  panel?: boolean;
  /** The panel's border and fill hue. Falls back to the block's accent. */
  panelAccent?: [number, number, number];
  /**
   * A quieter second line under the block's main text, in muted colour — the
   * syllabus trail under the question. Part of the same block so the frame
   * round the question can never separate from the trail that qualifies it.
   */
  subText?: string;
  /** A right-aligned chip drawn in the block's eyebrow row, e.g. "6 MARKS". */
  eyebrow?: string;
  /** The eyebrow's right-hand half, e.g. the command verb. */
  eyebrowChip?: string;
  /**
   * The label as styled runs, so a criterion title carries the same syllabus
   * highlighting its feedback does. `label` stays alongside as the plain
   * fallback and as what a caller comparing content should read.
   */
  labelRuns?: TextRun[];
  /**
   * Draw this marker in the gutter beside the item's first line — the − of a
   * sentence the rewrite replaced, or the + of what replaced it. In the gutter
   * rather than prefixed to the text, because as text it landed on the first
   * wrapped line only and the tail of a wrapped change printed as an unmarked
   * line that read like a heading.
   */
  diffMarker?: string;
  /** Draw dashed Name / Class / Date rules in the block's right-hand half. */
  fields?: boolean;
  /**
   * Never let a column or page break fall between this block and the next.
   *
   * A diff pair is one thought in two blocks: the sentence the student wrote and
   * the sentence it became. Split across a column boundary the reader has to
   * hold the first half in their head while their eye travels to the top of the
   * next column, which is the one thing the pair exists to spare them.
   */
  keepWithNext?: boolean;
  /**
   * Draw the panel as a tint alone, no border. For the diff rows, where a frame
   * round every row would out-weigh the text inside it.
   */
  panelBorderless?: boolean;
  /**
   * Draw this list item's marker as a tick rather than a bullet — evidence the
   * response already shows, against the empty box of a thing still to do.
   */
  tick?: boolean;
}

/** A block with a computed rendered height (mm) at a given scale. */
export interface MeasuredBlock extends ContentBlock {
  /** Total rendered height in mm including padding. */
  height: number;
  /** Pre-wrapped lines per run (parallel to `runs`). */
  wrapped: string[][];
  /**
   * The same wrapped lines as styled spans, for runs that carry `spans`
   * (`null` for the rest). Parallel to `wrapped` down to the individual line,
   * and derived from the SAME wrap — so splitting a block across columns can
   * slice both by one set of indices and the drawer can never paint a different
   * set of line breaks from the ones that were measured.
   */
  wrappedRich?: (InlineSpan[][] | null)[];
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
  /** Pre-wrapped `subText` lines (the syllabus trail under the question). */
  subWrapped?: string[];
  /** Pre-wrapped label lines as styled spans, when `labelRuns` carried them. */
  labelWrappedRich?: InlineSpan[][] | null;
  /**
   * Height (mm) of anything sitting between the label and the body — today the
   * criterion's proportion meter. Resolved once at measure time so splitting
   * and drawing use the same number as the measurement did.
   */
  labelExtraMm?: number;
}

/**
 * Result of placing a block during the column-major flow.
 *
 * `column` and `top` are mutable: the balancing pass moves a run of blocks from
 * the foot of the first column to the head of the second once a band's extent
 * is known, which cannot be decided while the band is still being flowed.
 */
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
  /**
   * Width in mm of `text` at `fontPt`/`style`.
   *
   * Needed to wrap a line whose styles change part-way along it: bold is wider
   * than regular at the same size, so measuring the plain text and hoping puts
   * a word or two per line past the column edge — which, in a two-column
   * layout, lands in the gutter or over the footer.
   */
  measure(text: string, fontPt: number, style: FontStyle): number;
}

/** Minimal structural view of a jsPDF document instance (lazily loaded). */
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
  circle(x: number, y: number, r: number, style?: string): JsPdfLike;
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
  /**
   * The graphics-state + transform trio, used for one thing: shearing the
   * display headings into an oblique. The bundled Inter has no italic face, and
   * a second embedded font for headings would cost more than the effect is
   * worth — see `DISPLAY` and `drawDisplayLine`.
   */
  saveGraphicsState?(): JsPdfLike;
  restoreGraphicsState?(): JsPdfLike;
  setCurrentTransformationMatrix?(matrix: unknown): JsPdfLike;
  Matrix?: new (a: number, b: number, c: number, d: number, e: number, f: number) => unknown;
  /** Document bookmarks, so a multi-page report has an outline to jump by. */
  outline?: { add(parent: unknown, title: string, options: { pageNumber: number }): unknown };
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
export type ToastFn = (message: string, type?: ToastType) => void;

/** Progress callback for the export overlay. */
export type ProgressFn = (fraction: number, label: string) => void;
