// pdf/helpers.ts
//
// Drawing helpers that operate on a (CDN-loaded) jsPDF document. Pure text
// transforms live in ./text and are re-exported here so callers have one
// import surface. Anything DOM-dependent (emoji canvas, toast) is guarded.

import { FontStyle, JsPdfLike, MM_PER_PT, TextMeasurer } from './types';
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
}

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

  for (const raw of lines) {
    const line = opts.customFontAvailable ? raw : degradeToAscii(raw);
    if (containsEmoji(line)) {
      const img = renderEmojiToImage(line, fontPt, opts.emojiSupersample ?? 3);
      if (img) {
        let imgX = x;
        if (align === 'center') imgX = x - img.widthMm / 2;
        else if (align === 'right') imgX = x - img.widthMm;
        // y is a baseline; nudge the image up so it sits on the text line.
        doc.addImage(
          img.dataUrl,
          'PNG',
          imgX,
          cursorY - img.heightMm * 0.8,
          img.widthMm,
          img.heightMm
        );
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
// Header
// ---------------------------------------------------------------------------

const HEADER = {
  titlePt: 15,
  subtitlePt: 9.5,
  instructionPt: 8.5,
  fieldPt: 7.5,
};

/** Reserved header height (mm) for a given scale — kept in sync with drawHeader. */
export const headerReserve = (pScale: number): number => {
  const title = HEADER.titlePt * 1.2 * MM_PER_PT * pScale;
  const subtitle = HEADER.subtitlePt * 1.4 * MM_PER_PT * pScale;
  const instruction = HEADER.instructionPt * 1.6 * MM_PER_PT * pScale;
  return title + subtitle + instruction + 4 * pScale; // + divider gap
};

export interface HeaderOptions extends TextStyleCtx {
  title: string;
  subtitle?: string;
  instruction?: string;
  accent: [number, number, number];
  pScale: number;
  margin: number;
  pageWidth: number;
  showFields?: boolean;
}

/**
 * Draw the page header: uppercase bold title, italic subtitle, an accent bar to
 * the left of the instruction line (bar height derived from cap-height so it
 * aligns to the text), a horizontal divider, and optional dashed Name/Class/Date
 * fill-in fields top-right. Returns the Y at which body content should begin.
 */
export const drawHeader = (doc: JsPdfLike, opts: HeaderOptions): number => {
  const { pScale, margin, pageWidth, accent } = opts;
  const ink: [number, number, number] = [17, 24, 39];
  const muted: [number, number, number] = [107, 114, 128];
  let y = margin + HEADER.titlePt * MM_PER_PT * pScale;

  // Title.
  drawText(doc, opts.title, {
    ...opts,
    x: margin,
    y,
    fontPt: HEADER.titlePt * pScale,
    style: 'bold',
    color: ink,
  });

  // Name / Class / Date fields (dashed underlines), top-right.
  if (opts.showFields) {
    const fieldPt = HEADER.fieldPt * pScale;
    const labels = ['Name', 'Class', 'Date'];
    const lineW = 26 * pScale;
    const labelGap = 2 * pScale;
    let fy = margin + HEADER.fieldPt * MM_PER_PT * pScale;
    doc.setDrawColor(muted[0], muted[1], muted[2]);
    doc.setLineWidth(0.2 * pScale);
    for (const label of labels) {
      setStyleField(doc, opts, fieldPt, muted);
      const labelW = doc.getTextWidth(label + ':');
      const right = pageWidth - margin;
      const lineStart = right - lineW;
      doc.text(label + ':', lineStart - labelGap - labelW, fy, { baseline: 'alphabetic' });
      doc.setLineDashPattern([0.6 * pScale, 0.6 * pScale], 0);
      doc.line(lineStart, fy + 0.5 * pScale, right, fy + 0.5 * pScale);
      doc.setLineDashPattern([], 0);
      fy += fieldPt * 1.7 * MM_PER_PT;
    }
  }

  // Subtitle.
  if (opts.subtitle) {
    y += HEADER.subtitlePt * 1.4 * MM_PER_PT * pScale;
    drawText(doc, opts.subtitle, {
      ...opts,
      x: margin,
      y,
      fontPt: HEADER.subtitlePt * pScale,
      style: 'italic',
      color: muted,
    });
  }

  // Instruction with accent bar (bar height ≈ cap-height of the line).
  if (opts.instruction) {
    y += HEADER.instructionPt * 1.6 * MM_PER_PT * pScale;
    const capHeight = HEADER.instructionPt * 0.7 * MM_PER_PT * pScale;
    const barW = 1.2 * pScale;
    const barX = margin;
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(barX, y - capHeight, barW, capHeight, 'F');
    drawText(doc, opts.instruction, {
      ...opts,
      x: barX + barW + 2 * pScale,
      y,
      fontPt: HEADER.instructionPt * pScale,
      style: 'normal',
      color: muted,
    });
  }

  // Divider.
  y += 3 * pScale;
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.4 * pScale);
  doc.line(margin, y, pageWidth - margin, y);

  return margin + headerReserve(pScale);
};

const setStyleField = (
  doc: JsPdfLike,
  ctx: TextStyleCtx,
  fontPt: number,
  color: [number, number, number]
) => {
  doc.setFont(ctx.family, resolveFontStyle(ctx.family, 'bold', ctx.customFontAvailable));
  doc.setFontSize(fontPt);
  doc.setTextColor(color[0], color[1], color[2]);
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
}

/** Draw a small right-aligned export ID + date footer on the current page. */
export const drawFooter = (doc: JsPdfLike, opts: FooterOptions): void => {
  const fontPt = 6.5 * opts.pScale;
  const y = opts.pageHeight - opts.margin + 4 * opts.pScale;
  drawText(doc, `${opts.exportId}  ·  ${opts.dateStr}`, {
    ...opts,
    x: opts.pageWidth - opts.margin,
    y,
    fontPt,
    style: 'normal',
    color: [156, 163, 175],
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
  const opacity = opts.opacity ?? 0.06;
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
