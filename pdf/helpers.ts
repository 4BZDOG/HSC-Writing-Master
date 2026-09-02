// pdf/helpers.ts
//
// Drawing helpers that operate on a (lazily loaded) jsPDF document. Pure text
// transforms live in ./text and are re-exported here so callers have one
// import surface. Anything DOM-dependent (emoji canvas, toast) is guarded.

import { DISPLAY, FontStyle, InlineSpan, JsPdfLike, MM_PER_PT, TextMeasurer } from './types';
import { drawIcon, type IconName } from './icons';
import { containsEmoji, degradeToAscii, toText } from './text';

export { toText, degradeToAscii, containsEmoji };

export const HELVETICA = 'helvetica';

/**
 * Resolve a logical style to one the active font actually has. The custom Inter
 * font is only registered for normal+bold, so italic variants degrade to their
 * upright weight; built-in helvetica keeps italics.
 */
export const resolveFontStyle = (
  family: string,
  style: FontStyle,
  customFontAvailable: boolean
): string => {
  if (family === HELVETICA || !customFontAvailable) return style;
  if (style === 'italic') return 'normal';
  if (style === 'bolditalic') return 'bold';
  return style;
};

export interface TextStyleCtx {
  /** 'Inter' when the custom font loaded, else 'helvetica'. */
  family: string;
  customFontAvailable: boolean;
}

const setStyle = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  fontPt: number,
  style: FontStyle,
  color: [number, number, number]
): void => {
  doc.setFont(ctx.family, resolveFontStyle(ctx.family, style, ctx.customFontAvailable));
  doc.setFontSize(fontPt);
  doc.setTextColor(color[0], color[1], color[2]);
};

// ---------------------------------------------------------------------------
// Measurement (jsPDF-backed implementation of the pure TextMeasurer)
// ---------------------------------------------------------------------------

/**
 * Build a TextMeasurer bound to a jsPDF doc. Crucially it applies the SAME
 * ASCII degradation that drawing will, so wrap widths match what gets painted.
 */
export const createMeasurer = (doc: JsPdfLike, ctx: TextStyleCtx): TextMeasurer => ({
  wrap(text, maxWidthMm, fontPt, style) {
    const t = ctx.customFontAvailable ? text : degradeToAscii(text);
    doc.setFont(ctx.family, resolveFontStyle(ctx.family, style, ctx.customFontAvailable));
    doc.setFontSize(fontPt);
    if (maxWidthMm <= 0) return [t];
    return doc.splitTextToSize(t, maxWidthMm);
  },
  lineHeight(fontPt, lineHeightFactor) {
    return fontPt * lineHeightFactor * MM_PER_PT;
  },
  measure(text, fontPt, style) {
    // Same ASCII degradation the drawing will apply, for the same reason `wrap`
    // applies it: measuring the Unicode and painting the fallback is how a line
    // ends up wider than the column it was fitted to.
    const t = ctx.customFontAvailable ? text : degradeToAscii(text);
    doc.setFont(ctx.family, resolveFontStyle(ctx.family, style, ctx.customFontAvailable));
    doc.setFontSize(fontPt);
    return doc.getTextWidth(t);
  },
});

// ---------------------------------------------------------------------------
// Emoji -> canvas PNG
// ---------------------------------------------------------------------------

const EMOJI_FONT =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif';

export interface EmojiImage {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
}

/**
 * Rasterise an emoji-bearing string to a PNG at `supersample`x using the system
 * emoji font, returning the image plus its physical size in mm. Returns null in
 * non-DOM environments or on any canvas failure.
 */
export const renderEmojiToImage = (
  text: string,
  fontPt: number,
  supersample = 3
): EmojiImage | null => {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontMm = fontPt * MM_PER_PT;
    // CSS px needed so that, after px->mm conversion, the glyph is fontMm tall.
    const fontPx = (fontMm * 96) / 25.4;
    const drawPx = fontPx * supersample;
    ctx.font = `${drawPx}px ${EMOJI_FONT}`;
    const metrics = ctx.measureText(text);
    const widthPx = Math.max(1, Math.ceil(metrics.width));
    const heightPx = Math.ceil(drawPx * 1.3);

    canvas.width = widthPx;
    canvas.height = heightPx;
    // Context resets on resize; re-apply.
    ctx.font = `${drawPx}px ${EMOJI_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, heightPx / 2);

    const pxToMm = 25.4 / (96 * supersample);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthMm: widthPx * pxToMm,
      heightMm: heightPx * pxToMm,
    };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// drawText / drawLines
// ---------------------------------------------------------------------------

export interface DrawLinesOptions extends TextStyleCtx {
  x: number;
  y: number; // baseline of the first line
  fontPt: number;
  style?: FontStyle;
  color?: [number, number, number];
  align?: 'left' | 'center' | 'right';
  lineHeightFactor?: number;
  maxWidthMm?: number;
  emojiSupersample?: number;
  /**
   * The same lines as styled spans, one array per entry in `lines`.
   *
   * When present each line is painted span by span — **bold** emphasis,
   * syllabus keywords in emerald, the command verb in the accent colour — so
   * the printed report reads in the voice the screen does. `style` and `color`
   * remain the defaults for spans that ask for neither.
   */
  richLines?: InlineSpan[][] | null;
}

/**
 * Draw one line as a sequence of styled spans, advancing the pen by each
 * span's measured width. Returns nothing: the caller owns the line advance, so
 * a styled line occupies exactly the height its plain twin would.
 */
const drawSpanLine = (
  doc: JsPdfLike,
  spans: InlineSpan[],
  x: number,
  y: number,
  opts: DrawLinesOptions
): void => {
  const { fontPt, style = 'normal', color = [0, 0, 0] } = opts;
  let cursorX = x;
  for (const span of spans) {
    const text = opts.customFontAvailable ? span.text : degradeToAscii(span.text);
    if (!text) continue;
    const spanStyle = span.style ?? style;
    setStyle(doc, opts, fontPt, spanStyle, span.color ?? color);
    doc.text(text, cursorX, y, { baseline: 'alphabetic' });
    // Re-measure under the style just used — jsPDF's getTextWidth reads the
    // CURRENT font, which setStyle has already put in place.
    cursorX += doc.getTextWidth(text);
  }
};

/**
 * Draw already-wrapped lines. Routes any emoji-bearing line through the canvas
 * raster path; others use selectable doc.text (ASCII-degraded when only the
 * built-in font is available). Returns total height consumed (mm).
 */
export const drawLines = (doc: JsPdfLike, lines: string[], opts: DrawLinesOptions): number => {
  const {
    x,
    y,
    fontPt,
    style = 'normal',
    color = [0, 0, 0],
    align = 'left',
    lineHeightFactor = 1.15,
  } = opts;
  const lineMm = fontPt * lineHeightFactor * MM_PER_PT;
  let cursorY = y;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = opts.customFontAvailable ? raw : degradeToAscii(raw);
    const spans = opts.richLines?.[i];
    // Styled path, but only where the pen starts at a known left edge. A
    // centred or right-aligned line would need the whole line's width measured
    // first, and nothing rich is drawn that way — headers and footers are the
    // aligned text, and they are plain.
    if (spans && spans.length > 0 && align === 'left' && !containsEmoji(line)) {
      drawSpanLine(doc, spans, x, cursorY, opts);
      cursorY += lineMm;
      continue;
    }
    if (containsEmoji(line)) {
      const img = renderEmojiToImage(line, fontPt, opts.emojiSupersample ?? 3);
      if (img) {
        // Clamp the raster to the available width so it can't overrun the column.
        let w = img.widthMm;
        let h = img.heightMm;
        if (opts.maxWidthMm && opts.maxWidthMm > 0 && w > opts.maxWidthMm) {
          const k = opts.maxWidthMm / w;
          w *= k;
          h *= k;
        }
        let imgX = x;
        if (align === 'center') imgX = x - w / 2;
        else if (align === 'right') imgX = x - w;
        // y is a baseline; nudge the image up so it sits on the text line.
        doc.addImage(img.dataUrl, 'PNG', imgX, cursorY - h * 0.8, w, h);
        cursorY += lineMm;
        continue;
      }
      // Fall through to text if rasterisation failed.
    }
    setStyle(doc, opts, fontPt, style, color);
    doc.text(line, x, cursorY, { align, baseline: 'alphabetic' });
    cursorY += lineMm;
  }
  return lines.length * lineMm;
};

/** Convenience for header/footer text that isn't pre-measured. */
export const drawText = (doc: JsPdfLike, text: string, opts: DrawLinesOptions): number => {
  const normalised = toText(text);
  const prepared = opts.customFontAvailable ? normalised : degradeToAscii(normalised);
  const lines =
    opts.maxWidthMm && opts.maxWidthMm > 0
      ? doc.splitTextToSize(prepared, opts.maxWidthMm)
      : [prepared];
  return drawLines(doc, lines, opts);
};

// ---------------------------------------------------------------------------
// Colour + display type
// ---------------------------------------------------------------------------

/**
 * Mix a colour towards paper white. `amount` is how far: 0 is the colour
 * itself, 1 is white.
 *
 * Used for panel fills. A tint computed here rather than an alpha fill because
 * a transparency group is one more thing a school printer's driver can decide
 * to flatten differently from the screen; a solid light colour prints as the
 * solid light colour everywhere.
 */
export const tint = (color: [number, number, number], amount: number): [number, number, number] => [
  Math.round(color[0] + (255 - color[0]) * amount),
  Math.round(color[1] + (255 - color[1]) * amount),
  Math.round(color[2] + (255 - color[2]) * amount),
];

export interface DisplayLineOptions extends TextStyleCtx {
  x: number;
  /** Baseline, in mm from the page top. */
  y: number;
  fontPt: number;
  color: [number, number, number];
  align?: 'left' | 'right';
}

/**
 * Draw one line in the report's DISPLAY voice: uppercase, bold, and sheared
 * into an oblique.
 *
 * The app sets its card titles in uppercase black italic, and the printed
 * report answers to the same voice. The embedded Inter has no italic face, and
 * a second face would add ~340KB to every exported file for eleven headings, so
 * the oblique is a shear of the text matrix — which is what a PDF producer does
 * for a synthetic italic anyway.
 *
 * The shear is applied in PDF user space, where y runs UP from the foot of the
 * page, so a glyph's horizontal offset grows with its distance from that foot.
 * The pen is pulled back by exactly that offset, or a heading near the top of
 * the page lands most of a page-width to the right of where it was measured.
 */
export const drawDisplayLine = (doc: JsPdfLike, text: string, opts: DisplayLineOptions): void => {
  const prepared = opts.customFontAvailable ? toText(text) : degradeToAscii(toText(text));
  const upper = prepared.toUpperCase();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shear = DISPLAY.shear;
  const charSpace = opts.fontPt * MM_PER_PT * DISPLAY.letterSpacingEm;

  setStyle(doc, opts, opts.fontPt, 'bold', opts.color);

  // The transform trio is an optional part of the engine's surface. Without it
  // the heading is drawn upright — the same words at the same size in the same
  // place, just not sheared. A missing oblique is a cosmetic loss; a thrown
  // exception here would take the whole export down.
  const canShear =
    typeof doc.saveGraphicsState === 'function' &&
    typeof doc.restoreGraphicsState === 'function' &&
    typeof doc.setCurrentTransformationMatrix === 'function' &&
    typeof doc.Matrix === 'function';

  const draw = (x: number) =>
    doc.text(upper, x, opts.y, {
      baseline: 'alphabetic',
      align: opts.align ?? 'left',
      charSpace,
    });

  if (!canShear) {
    draw(opts.x);
    return;
  }
  try {
    doc.saveGraphicsState();
    doc.setCurrentTransformationMatrix(new doc.Matrix(1, 0, shear, 1, 0, 0));
    draw(opts.x - shear * (pageHeight - opts.y));
  } finally {
    doc.restoreGraphicsState();
  }
};

/** Width (mm) of a display line, so a caller can right-align or rule beside it. */
export const measureDisplayLine = (
  doc: JsPdfLike,
  text: string,
  ctx: TextStyleCtx,
  fontPt: number
): number => {
  const prepared = ctx.customFontAvailable ? toText(text) : degradeToAscii(toText(text));
  const upper = prepared.toUpperCase();
  doc.setFont(ctx.family, resolveFontStyle(ctx.family, 'bold', ctx.customFontAvailable));
  doc.setFontSize(fontPt);
  return doc.getTextWidth(upper) + upper.length * fontPt * MM_PER_PT * DISPLAY.letterSpacingEm;
};

// ---------------------------------------------------------------------------
// Running head
// ---------------------------------------------------------------------------

const HEAD = {
  linePt: 7.5,
  iconMm: 3.2,
  ruleGapMm: 2.2,
  bottomGapMm: 3.5,
};

/**
 * Reserved header height (mm) for a given scale — kept in sync with
 * `drawRunningHead`.
 *
 * One compact line on EVERY page, including the first. The masthead — the
 * report's title, its subtitle and the name/class/date rules — used to be page
 * chrome, which meant its ~20mm was reserved on every page and reprinted
 * verbatim on every page. It is content, so it flows as content (see the
 * `masthead` block), and pages two and after get that space back.
 */
export const headerReserve = (pScale: number): number =>
  (HEAD.linePt * MM_PER_PT * 1.2 + HEAD.ruleGapMm + HEAD.bottomGapMm) * pScale;

export interface RunningHeadOptions extends TextStyleCtx {
  /** Left half: what this document is. */
  title: string;
  /** Right half: which question, at a glance. */
  context?: string;
  accent: [number, number, number];
  muted: [number, number, number];
  pScale: number;
  margin: number;
  pageWidth: number;
  icon?: IconName;
  /**
   * Page 1 carries the masthead, which states the report's name in full. The
   * running head repeating it directly above would be the same words twice in
   * two sizes, so on page 1 the head is the rule and the context line alone.
   */
  showTitle?: boolean;
}

/** The one-line head every page carries: what this is, and which question. */
export const drawRunningHead = (doc: JsPdfLike, opts: RunningHeadOptions): void => {
  const { pScale, margin, pageWidth } = opts;
  const pt = HEAD.linePt * pScale;
  const y = margin + pt * MM_PER_PT;
  let x = margin;

  if (opts.showTitle !== false) {
    if (opts.icon) {
      const size = HEAD.iconMm * pScale;
      drawIcon(doc, opts.icon, x, y - size * 0.85, size, opts.accent);
      x += size + 1.4 * pScale;
    }
    drawDisplayLine(doc, opts.title, { ...opts, x, y, fontPt: pt, color: opts.accent });
  }

  if (opts.context) {
    drawText(doc, opts.context, {
      ...opts,
      x: pageWidth - margin,
      y,
      fontPt: 7 * pScale,
      style: 'bold',
      color: opts.muted,
      align: 'right',
    });
  }

  // The rule separates a running head from the content under it. On page one
  // there is no running head to separate — the masthead is the content — so the
  // band carries the ident line alone and the page opens on the title.
  if (opts.showTitle !== false) {
    const ruleY = y + HEAD.ruleGapMm * pScale;
    doc.setDrawColor(opts.accent[0], opts.accent[1], opts.accent[2]);
    doc.setLineWidth(0.5 * pScale);
    doc.line(margin, ruleY, pageWidth - margin, ruleY);
  }
};

/** Dashed Name / Class / Date rules, drawn by the masthead block. */
export const drawFields = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  x: number,
  y: number,
  width: number,
  pScale: number,
  muted: [number, number, number]
): number => {
  const fieldPt = 7.5 * pScale;
  const lineW = width;
  let fy = y;
  doc.setDrawColor(muted[0], muted[1], muted[2]);
  doc.setLineWidth(0.2 * pScale);
  for (const label of ['Name', 'Class', 'Date']) {
    doc.setFont(ctx.family, resolveFontStyle(ctx.family, 'bold', ctx.customFontAvailable));
    doc.setFontSize(fieldPt);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    const labelW = doc.getTextWidth(label + ':');
    doc.text(label + ':', x, fy, { baseline: 'alphabetic' });
    doc.setLineDashPattern([0.6 * pScale, 0.6 * pScale], 0);
    doc.line(x + labelW + 1.5 * pScale, fy + 0.5 * pScale, x + lineW, fy + 0.5 * pScale);
    doc.setLineDashPattern([], 0);
    fy += fieldPt * 1.9 * MM_PER_PT;
  }
  return fy - y;
};

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export interface FooterOptions extends TextStyleCtx {
  exportId: string;
  dateStr: string;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  pScale: number;
  /** 1-based page number within the current copy. */
  pageNumber?: number;
  /** Total pages in a single copy. */
  pageTotal?: number;
  /**
   * Provenance line centred above the footer rule. An exported report leaves
   * the app and can end up in a folder next to real assessment records, so
   * every page has to say what it is.
   */
  disclaimer?: string;
}

/**
 * Footer: a left-aligned "Page X of Y" and a right-aligned export ID + date,
 * drawn on the current page, with an optional centred disclaimer above them.
 */
export const drawFooter = (doc: JsPdfLike, opts: FooterOptions): void => {
  // 7.5pt in a mid-grey, not 6.5pt in #9CA3AF. The disclaimer is the line that
  // says this is practice feedback and not a NESA result — the one line on the
  // page that must survive a photocopier and a low-brightness screen — and at
  // its old weight it cleared about 2.3:1 against white, well under WCAG AA.
  const fontPt = 7.5 * opts.pScale;
  const y = opts.pageHeight - opts.margin + 4 * opts.pScale;
  const color: [number, number, number] = [107, 114, 128]; // #6B7280, 4.8:1 on white

  if (opts.disclaimer) {
    drawText(doc, opts.disclaimer, {
      ...opts,
      x: opts.pageWidth / 2,
      // Above the page-number line so it never collides with it on a narrow
      // page, and still inside the reserved footer band.
      y: y - 3.6 * opts.pScale,
      fontPt: 7 * opts.pScale,
      style: 'normal',
      color,
      align: 'center',
    });
  }

  if (opts.pageNumber && opts.pageTotal) {
    drawText(doc, `Page ${opts.pageNumber} of ${opts.pageTotal}`, {
      ...opts,
      x: opts.margin,
      y,
      fontPt,
      style: 'normal',
      color,
      align: 'left',
    });
  }

  drawText(doc, `${opts.exportId}  ·  ${opts.dateStr}`, {
    ...opts,
    x: opts.pageWidth - opts.margin,
    y,
    fontPt,
    style: 'normal',
    color,
    align: 'right',
  });
};

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

export interface WatermarkOptions extends TextStyleCtx {
  text: string;
  pageWidth: number;
  pageHeight: number;
  opacity?: number;
}

/** Draw a centred low-opacity watermark, then restore full opacity. */
export const drawWatermark = (doc: JsPdfLike, opts: WatermarkOptions): void => {
  // 0.04, not 0.06: the mark sits behind the student's own response and the
  // rewrite, the two blocks of the document that are read closely, and at the
  // old value it was legible enough to compete with them.
  const opacity = opts.opacity ?? 0.04;
  try {
    doc.setGState(new doc.GState({ opacity }));
    doc.setFont(opts.family, resolveFontStyle(opts.family, 'bold', opts.customFontAvailable));
    doc.setFontSize(46);
    doc.setTextColor(99, 102, 241);
    doc.text(opts.text, opts.pageWidth / 2, opts.pageHeight / 2, {
      align: 'center',
      baseline: 'middle',
      angle: 35,
    });
  } finally {
    doc.setGState(new doc.GState({ opacity: 1 }));
  }
};
