import { describe, it, expect, vi } from 'vitest';
import type { JsPdfLike } from '../../pdf/types';
import type { EvaluationExportData } from '../../pdf/buildBlocks';
import { COLORS } from '../../pdf/buildBlocks';

/**
 * The styling has to survive the whole pipeline, not just the parser.
 *
 * `buildBlocks` → `measureBlocks` → `splitOversized` → `flowBlocks` → the
 * drawer is five hops, and the spans are carried as a side-channel parallel to
 * the plain lines. A break anywhere in that chain fails silently: the drawer
 * falls back to the plain path and the report prints exactly as it did before,
 * with nothing to indicate that the emphasis was dropped on the way. So this
 * drives the real orchestrator against a recording engine and reads back what
 * was actually painted.
 */

interface Painted {
  text: string;
  style: string;
  color: [number, number, number];
}

const recordingDoc = () => {
  const painted: Painted[] = [];
  let style = 'normal';
  let color: [number, number, number] = [0, 0, 0];
  const self: Record<string, unknown> = {};
  const chain =
    () =>
    (..._args: unknown[]) =>
      self as unknown as JsPdfLike;

  Object.assign(self, {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: chain(),
    setPage: chain(),
    setFont: (_family: string, s?: string) => {
      style = s ?? 'normal';
      return self as unknown as JsPdfLike;
    },
    setFontSize: chain(),
    setTextColor: (r: number, g: number, b: number) => {
      color = [r, g, b];
      return self as unknown as JsPdfLike;
    },
    setDrawColor: chain(),
    setFillColor: chain(),
    setLineWidth: chain(),
    setLineDashPattern: chain(),
    text: (t: string | string[]) => {
      const value = Array.isArray(t) ? t.join(' ') : String(t);
      painted.push({ text: value, style, color });
      return self as unknown as JsPdfLike;
    },
    line: chain(),
    rect: chain(),
    roundedRect: chain(),
    circle: chain(),
    // The transform trio the display headings shear with, and the outline the
    // report bookmarks itself into.
    saveGraphicsState: chain(),
    restoreGraphicsState: chain(),
    setCurrentTransformationMatrix: chain(),
    Matrix: function Matrix() {},
    outline: { add: () => ({}) },
    splitTextToSize: (text: string, maxWidth: number) => {
      const perLine = Math.max(8, Math.floor(maxWidth * 2.2));
      const words = String(text).split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > perLine) {
          if (line) lines.push(line.trim());
          line = w;
        } else line = (line + ' ' + w).trim();
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    },
    getTextWidth: (t: string) => String(t).length * 0.45,
    addImage: chain(),
    addFileToVFS: chain(),
    addFont: chain(),
    getFontList: () => ({}),
    setGState: chain(),
    GState: function GState() {},
    setProperties: chain(),
    save: () => {},
  });

  return { doc: self as unknown as JsPdfLike, painted };
};

let current = recordingDoc();

vi.mock('../../pdf/fontLoader', () => ({
  FONT_FAMILY: 'Inter',
  loadJsPdf: vi.fn(async () => {
    return function JsPDF() {
      current = recordingDoc();
      return current.doc;
    } as unknown as new () => JsPdfLike;
  }),
  // True, so bold is not degraded away by the helvetica fallback path — the
  // real export registers Inter in normal AND bold.
  loadInterFont: vi.fn(async () => true),
}));

const { exportEvaluationPdf } = await import('../../pdf/exportEvaluation');

const data = (over: Partial<EvaluationExportData> = {}): EvaluationExportData => ({
  question: 'Analyse the effect of caching on latency.',
  verb: 'Analyse',
  totalMarks: 8,
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'You describe caching but never **analyse** its effect on latency.',
  quickTip: 'Name the mechanism.',
  strengths: ['Defines caching'],
  improvements: ['Link the **mechanism** to the outcome'],
  criteria: [{ criterion: 'Analysis', mark: 2, maxMark: 4, feedback: 'Thin on **cause**.' }],
  studentAnswer: 'Caching stores data so latency falls.',
  keywords: ['latency', 'caching'],
  ...over,
});

const runExport = async (over: Partial<EvaluationExportData> = {}) => {
  await exportEvaluationPdf({ data: data(over), onToast: vi.fn() });
  return current.painted;
};

describe('the exported page is painted in the app’s voice', () => {
  it('paints the marker’s emphasis in bold', async () => {
    const painted = await runExport();

    const bold = painted.filter((p) => p.style === 'bold').map((p) => p.text);
    expect(bold).toContain('analyse');
    expect(bold).toContain('mechanism');
    expect(bold).toContain('cause');
  });

  it('paints syllabus terms in the keyword colour', async () => {
    const painted = await runExport();

    const keyworded = painted
      .filter((p) => p.color.join() === COLORS.keyword.join())
      .map((p) => p.text.trim());

    expect(keyworded).toContain('latency');
    expect(keyworded).toContain('Caching');
  });

  it('paints the command verb in its own colour, not the keyword colour', async () => {
    const painted = await runExport();

    const verbPainted = painted.find((p) => p.text.trim() === 'Analyse');
    expect(verbPainted?.color).toEqual(COLORS.verb);
  });

  it('leaves the surrounding prose in body colour', async () => {
    const painted = await runExport();

    const surrounding = painted.find((p) => p.text.includes('You describe'));
    expect(surrounding?.color).toEqual(COLORS.body);
    expect(surrounding?.style).toBe('normal');
  });

  it('never paints the markup itself', async () => {
    const painted = await runExport();

    expect(painted.every((p) => !p.text.includes('**'))).toBe(true);
  });

  it('falls back to flat body text when the report carries no keywords', async () => {
    const painted = await runExport({ keywords: undefined });

    expect(painted.some((p) => p.color.join() === COLORS.keyword.join())).toBe(false);
    // The marker's own emphasis is not a syllabus feature, so it stays.
    expect(painted.some((p) => p.style === 'bold' && p.text === 'analyse')).toBe(true);
  });
});
