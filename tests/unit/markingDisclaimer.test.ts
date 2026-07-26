import { describe, it, expect, vi } from 'vitest';
import { drawFooter } from '../../pdf/helpers';
import { AI_MARKING_DISCLAIMER } from '../../data/legalContent';
import { degradeToAscii } from '../../pdf/text';
import type { JsPdfLike } from '../../pdf/types';

/**
 * A mark out of 20 and a band look exactly like a real assessment result, and
 * an exported report can end up in a folder beside genuine school records. The
 * agreement makes the "this is AI practice feedback" point once, at sign-up;
 * these tests hold the line that it also travels with the mark itself.
 */

const makeDoc = () => {
  const texts: { text: string; x: number; y: number }[] = [];
  const doc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFont: vi.fn().mockReturnThis(),
    setFontSize: vi.fn().mockReturnThis(),
    setTextColor: vi.fn().mockReturnThis(),
    text: vi.fn((text: string | string[], x: number, y: number) => {
      texts.push({ text: String(text), x, y });
      return doc;
    }),
    getTextWidth: vi.fn(() => 40),
  } as unknown as JsPdfLike;
  return { doc, texts };
};

const footerOpts = {
  exportId: 'EX-1',
  dateStr: '26 Jul 2026',
  pageWidth: 210,
  pageHeight: 297,
  margin: 12,
  pScale: 1,
  family: 'helvetica',
  customFontAvailable: false,
  pageNumber: 1,
  pageTotal: 2,
};

describe('the AI marking disclaimer', () => {
  it('is a single shared constant that says what the mark is not', () => {
    // One constant, so the claim cannot be softened on screen while staying
    // firm in the PDF (or the reverse).
    expect(AI_MARKING_DISCLAIMER).toMatch(/AI/);
    expect(AI_MARKING_DISCLAIMER).toMatch(/not an official/i);
  });

  it('is drawn on a PDF page when supplied', () => {
    const { doc, texts } = makeDoc();
    drawFooter(doc, { ...footerOpts, disclaimer: AI_MARKING_DISCLAIMER });
    // The PDF layer degrades to ASCII when no custom font is embedded, so the
    // drawn string is the degraded form of the constant, not the constant.
    expect(texts.some((t) => t.text === degradeToAscii(AI_MARKING_DISCLAIMER))).toBe(true);
  });

  it('sits clear of the page-number line rather than colliding with it', () => {
    const { doc, texts } = makeDoc();
    drawFooter(doc, { ...footerOpts, disclaimer: AI_MARKING_DISCLAIMER });
    const disclaimer = texts.find((t) => t.text.startsWith('Marked by AI'))!;
    const pageLine = texts.find((t) => t.text.startsWith('Page'))!;
    // Smaller y = higher on the page: the disclaimer is its own line above.
    expect(disclaimer.y).toBeLessThan(pageLine.y);
  });

  it('leaves the footer unchanged when no disclaimer is passed', () => {
    const { doc, texts } = makeDoc();
    drawFooter(doc, footerOpts);
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => t.text.startsWith('Marked by AI'))).toBe(false);
  });
});
