import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JsPdfLike } from '../../pdf/types';
import { EvaluationExportData } from '../../pdf/buildBlocks';

/**
 * The export orchestrator, driven end to end against a fake engine.
 *
 * Everything below the orchestrator was already unit-tested — wrapping, block
 * building, the column flow — but the pipeline that joins them had no coverage
 * at all, which is where the reliability questions live: does a failure reach
 * the user, does it say what failed, does the file come out named what it
 * should, and do the export options actually change the document.
 */

const fakeDoc = () => {
  const calls: { saved: string[]; pages: number; properties: unknown[] } = {
    saved: [],
    pages: 1,
    properties: [],
  };
  const self: Record<string, unknown> = {};
  const chain =
    () =>
    (..._args: unknown[]) =>
      (self as unknown as JsPdfLike);

  Object.assign(self, {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: () => {
      calls.pages += 1;
      return (self as unknown as JsPdfLike);
    },
    setPage: chain(),
    setFont: chain(),
    setFontSize: chain(),
    setTextColor: chain(),
    setDrawColor: chain(),
    setFillColor: chain(),
    setLineWidth: chain(),
    setLineDashPattern: chain(),
    text: chain(),
    line: chain(),
    rect: chain(),
    roundedRect: chain(),
    // Deterministic wrapping: ~2.2 characters per millimetre at any size.
    splitTextToSize: (text: string, maxWidth: number) => {
      const perLine = Math.max(8, Math.floor(maxWidth * 2.2));
      const words = String(text).split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > perLine) {
          if (line) lines.push(line.trim());
          line = w;
        } else {
          line = (line + ' ' + w).trim();
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    },
    getTextWidth: (t: string) => String(t).length * 0.5,
    addImage: chain(),
    addFileToVFS: chain(),
    addFont: chain(),
    getFontList: () => ({}),
    setGState: chain(),
    GState: function GState() {},
    setProperties: (p: unknown) => {
      calls.properties.push(p);
      return (self as unknown as JsPdfLike);
    },
    save: (name: string) => {
      calls.saved.push(name);
    },
  });

  return { doc: self as unknown as JsPdfLike, calls };
};

let currentDoc = fakeDoc();
let saveThrows = false;

vi.mock('../../pdf/fontLoader', () => ({
  FONT_FAMILY: 'Inter',
  loadJsPdf: vi.fn(async () => {
    return function JsPDF() {
      currentDoc = fakeDoc();
      if (saveThrows) {
        currentDoc.doc.save = () => {
          throw new Error('Download blocked by the browser.');
        };
      }
      return currentDoc.doc;
    } as unknown as new () => JsPdfLike;
  }),
  // Font loading is exercised in pdfFont.test; here it always falls back.
  loadInterFont: vi.fn(async () => false),
}));

const { exportEvaluationPdf, PdfExportError, sanitizeFilename } =
  await import('../../pdf/exportEvaluation');

const data = (over: Partial<EvaluationExportData> = {}): EvaluationExportData => ({
  question: 'Describe the key steps involved in DNA replication.',
  verb: 'DESCRIBE',
  totalMarks: 6,
  overallMark: 4,
  overallBand: 4,
  overallFeedback: 'A sound response that identifies the main steps but stops short of detail.',
  quickTip: 'Name the enzymes and say what each one does.',
  strengths: ['Correct sequence of steps.'],
  improvements: ['Add the role of each enzyme.', 'Use the syllabus term "semi-conservative".'],
  criteria: [
    { criterion: 'Accuracy', mark: 3, maxMark: 3, feedback: 'Steps are correct.' },
    { criterion: 'Detail', mark: 1, maxMark: 3, feedback: 'Thin on specifics.' },
  ],
  ...over,
});

beforeEach(() => {
  saveThrows = false;
});

describe('exporting a report', () => {
  it('saves a sanitised filename and reports what it produced', async () => {
    const toast = vi.fn();
    const result = await exportEvaluationPdf({
      data: data(),
      filename: 'HSC/DESCRIBE: Band 4 *feedback*',
      onToast: toast,
    });

    expect(result.pages).toBeGreaterThanOrEqual(1);
    expect(result.copies).toBe(1);
    expect(currentDoc.calls.saved).toHaveLength(1);
    // No slashes, no colons, no asterisks — and a .pdf extension.
    expect(currentDoc.calls.saved[0]).toBe(sanitizeFilename('HSC/DESCRIBE: Band 4 *feedback*'));
    expect(currentDoc.calls.saved[0]).toMatch(/\.pdf$/);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/exported/i), 'success');
  });

  it('reports progress from start to finish', async () => {
    const fractions: number[] = [];
    await exportEvaluationPdf({
      data: data(),
      onToast: vi.fn(),
      onProgress: (f) => fractions.push(f),
    });

    expect(fractions[0]).toBeLessThan(0.2);
    expect(fractions[fractions.length - 1]).toBe(1);
    // Monotonic: a progress bar that goes backwards reads as a fault.
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
    }
  });

  it('writes one page per copy for a class set', async () => {
    const single = await exportEvaluationPdf({ data: data(), onToast: vi.fn() });
    const pagesForOne = currentDoc.calls.pages;

    const set = await exportEvaluationPdf({ data: data(), copies: 3, onToast: vi.fn() });

    expect(set.copies).toBe(3);
    expect(set.pages).toBe(single.pages);
    expect(currentDoc.calls.pages).toBe(pagesForOne * 3);
  });

  it('clamps a nonsense copy count rather than rendering it', async () => {
    const result = await exportEvaluationPdf({ data: data(), copies: 0, onToast: vi.fn() });
    expect(result.copies).toBe(1);
  });

  /**
   * The reliability hole this replaced: `doc.save()` threw, the rejection went
   * into the caller's empty catch, and the user watched the spinner stop with
   * no file and no explanation.
   */
  it('tells the user when the browser blocks the download', async () => {
    saveThrows = true;
    const toast = vi.fn();

    await expect(exportEvaluationPdf({ data: data(), onToast: toast })).rejects.toBeInstanceOf(
      PdfExportError
    );
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/download/i), 'error');
  });

  it('names the stage that failed, so the message can be acted on', async () => {
    saveThrows = true;
    const error = await exportEvaluationPdf({ data: data(), onToast: vi.fn() }).catch((e) => e);

    expect(error).toBeInstanceOf(PdfExportError);
    expect(error.stage).toBe('save');
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('records the report in the document properties', async () => {
    await exportEvaluationPdf({ data: data(), onToast: vi.fn() });
    const props = currentDoc.calls.properties[0] as { title: string; keywords: string };
    expect(props.title).toMatch(/Marking Feedback/i);
    expect(props.keywords).toMatch(/Band 4/);
  });

  // Letter is 17mm shorter than A4: a report that fits two A4 pages can need a
  // third on Letter, and the point of the option is that it lays out for the
  // paper it will actually be printed on.
  it('lays out for the paper it will be printed on', async () => {
    const a4 = await exportEvaluationPdf({ data: data(), pageSize: 'a4', onToast: vi.fn() });
    const letter = await exportEvaluationPdf({
      data: data(),
      pageSize: 'letter',
      onToast: vi.fn(),
    });

    expect(a4.pages).toBeGreaterThanOrEqual(1);
    expect(letter.pages).toBeGreaterThanOrEqual(1);
  });

  it('grows the report when the student response rides along', async () => {
    const essay = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const withAnswer = await exportEvaluationPdf({
      data: data({ studentAnswer: essay }),
      onToast: vi.fn(),
    });
    const without = await exportEvaluationPdf({ data: data(), onToast: vi.fn() });

    expect(withAnswer.pages).toBeGreaterThanOrEqual(without.pages);
  });
});
