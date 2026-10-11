import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JsPdfLike } from '../../pdf/types';
import type { ProgressReport, ReportStudentRow } from '../../pdf/reportModel';
import { bandColor } from '../../pdf/buildBlocks';
import { allFinite, makeReport, trendOf } from './pdfReportHelpers';

/**
 * The progress-report exporter, driven end to end against a recording fake engine.
 *
 * The layout, blocks and drawing are unit-tested apart. What is pinned here is
 * the pipeline that joins them: that every number handed to the engine is finite,
 * that the footer says what the report contains, that each section is bookmarked,
 * that a failure names its stage, and that the file is named for its report.
 */

interface Call {
  name: string;
  args: unknown[];
}

interface FakeOptions {
  failText?: boolean;
  failSave?: boolean;
}

/** A jsPDF stand-in that records every drawing call it is asked to make. */
const makeDoc = (opts: FakeOptions) => {
  const calls: Call[] = [];
  const saved: string[] = [];
  const outlined: { title: string; page: number }[] = [];
  const properties: Record<string, unknown>[] = [];
  let pages = 1;
  const self: Record<string, unknown> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return self;
    };

  Object.assign(self, {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage: () => {
      pages += 1;
      return self;
    },
    setPage: record('setPage'),
    setFont: record('setFont'),
    setFontSize: record('setFontSize'),
    setTextColor: record('setTextColor'),
    setDrawColor: record('setDrawColor'),
    setFillColor: record('setFillColor'),
    setLineWidth: record('setLineWidth'),
    setLineDashPattern: record('setLineDashPattern'),
    line: record('line'),
    rect: record('rect'),
    roundedRect: record('roundedRect'),
    circle: record('circle'),
    addImage: record('addImage'),
    addFileToVFS: record('addFileToVFS'),
    addFont: record('addFont'),
    getFontList: () => ({}),
    setGState: record('setGState'),
    GState: function GState() {},
    saveGraphicsState: record('saveGraphicsState'),
    restoreGraphicsState: record('restoreGraphicsState'),
    setCurrentTransformationMatrix: record('setCurrentTransformationMatrix'),
    Matrix: function Matrix() {},
    text: (...args: unknown[]) => {
      if (opts.failText) throw new Error('The browser refused the drawing call.');
      calls.push({ name: 'text', args });
      return self;
    },
    // Deterministic wrapping, roughly two characters per millimetre.
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
    outline: {
      add: (_parent: unknown, title: string, options: { pageNumber: number }) => {
        outlined.push({ title, page: options.pageNumber });
        return {};
      },
    },
    setProperties: (p: Record<string, unknown>) => {
      properties.push(p);
      return self;
    },
    save: (name: string) => {
      if (opts.failSave) throw new Error('Download blocked by the browser.');
      saved.push(name);
    },
  });

  return {
    doc: self as unknown as JsPdfLike,
    calls,
    saved,
    outlined,
    properties,
    pageCount: () => pages,
  };
};

let current: ReturnType<typeof makeDoc>;
let docOptions: FakeOptions = {};
let engineFails = false;

vi.mock('../../pdf/fontLoader', () => ({
  FONT_FAMILY: 'Inter',
  loadJsPdf: vi.fn(async () => {
    if (engineFails)
      throw new Error('Failed to load the PDF engine. Refresh the page and try again.');
    return function JsPDF() {
      current = makeDoc(docOptions);
      return current.doc;
    } as unknown as new () => JsPdfLike;
  }),
  // Font loading is exercised in pdfFont.test; here it always falls back.
  loadInterFont: vi.fn(async () => false),
}));

const {
  exportProgressReportPdf,
  progressReportFilename,
  printsStudentNames,
  progressReportNotices,
} = await import('../../pdf/exportProgressReport');
const { PdfExportError } = await import('../../pdf/exportEvaluation');

const printed = (calls: Call[]): string[] =>
  calls.filter((c) => c.name === 'text').map((c) => String(c.args[0]));

const student = (name: string): ReportStudentRow => ({
  name,
  attempts: 4,
  avgBand: 4,
  markShare: 0.6,
  bandChange: 1,
  sparkline: [4, 4, 5],
  lastActiveAt: null,
  tierShares: [null, 0.6, null, null, null, null],
});

beforeEach(() => {
  docOptions = {};
  engineFails = false;
});

describe('progressReportFilename', () => {
  it('is HSC-Progress-Report, the subject, the course and the date', () => {
    expect(progressReportFilename(makeReport())).toBe(
      'HSC-Progress-Report-Jordan-Lee-All-courses-2026-10-11'
    );
  });

  it('names the course the report is limited to', () => {
    const report = makeReport({
      scope: { ...makeReport().scope, courseName: 'Software Engineering' },
    });
    expect(progressReportFilename(report)).toBe(
      'HSC-Progress-Report-Jordan-Lee-Software-Engineering-2026-10-11'
    );
  });

  it('makes every part filesystem-safe: accents folded, punctuation collapsed', () => {
    const report = makeReport({
      subject: { name: "Zoë O'Brien / Ms", roleLabel: 'Teacher', school: null },
    });
    const name = progressReportFilename(report);
    expect(name).toBe('HSC-Progress-Report-Zoe-O-Brien-Ms-All-courses-2026-10-11');
    expect(name).toMatch(/^[A-Za-z0-9-]+$/);
  });
});

describe('the privacy notice', () => {
  it('prints names only when the students table is drawn and the names are not replaced', () => {
    const named = makeReport({ audience: 'teacher', students: [student('A')] });
    expect(printsStudentNames(named)).toBe(true);
    expect(printsStudentNames(makeReport({ audience: 'school', students: [student('A')] }))).toBe(
      true
    );
    expect(printsStudentNames(makeReport({ audience: 'teacher', students: [] }))).toBe(false);
    expect(
      printsStudentNames(
        makeReport({ audience: 'teacher', students: [student('A')], anonymised: true })
      )
    ).toBe(false);
  });
  it('does not claim names for a student, an anonymised report, or a switched-off table', () => {
    expect(printsStudentNames(makeReport({ audience: 'student', students: [student('A')] }))).toBe(
      false
    );
    expect(
      printsStudentNames(
        makeReport({ audience: 'teacher', anonymised: true, students: [student('A')] })
      )
    ).toBe(false);
    expect(
      printsStudentNames(
        makeReport({
          audience: 'teacher',
          students: [student('A')],
          sections: { ...makeReport().sections, students: false },
        })
      )
    ).toBe(false);
    expect(printsStudentNames(makeReport({ audience: 'school' }))).toBe(false);
  });

  it('always gives the AI-marking disclaimer, and says what became of the names', () => {
    expect(progressReportNotices(makeReport()).privacy).toBeNull();
    const named = progressReportNotices(
      makeReport({ audience: 'teacher', students: [student('A')] })
    );
    expect(named.disclaimer).toMatch(/practice feedback, not an official NESA/);
    expect(named.privacy).toMatch(/Contains student names/);
    const anon = progressReportNotices(
      makeReport({ audience: 'teacher', students: [student('Student 1')], anonymised: true })
    );
    expect(anon.privacy).toMatch(/Student names have been removed/);
  });
});

describe('exporting a progress report', () => {
  it('saves the file under its report name and reports the page count', async () => {
    const toast = vi.fn();
    const result = await exportProgressReportPdf({ report: makeReport(), onToast: toast });
    expect(current.saved).toEqual(['HSC-Progress-Report-Jordan-Lee-All-courses-2026-10-11.pdf']);
    expect(result.pages).toBe(1);
    expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/exported/), 'success');
  });

  it('uses an explicit filename when one is given, sanitised as the feedback report is', async () => {
    await exportProgressReportPdf({ report: makeReport(), filename: 'My report: Term 3*' });
    expect(current.saved).toEqual(['My report Term 3.pdf']);
  });

  it('sets the document properties from the report', async () => {
    await exportProgressReportPdf({ report: makeReport() });
    const props = current.properties[0];
    expect(props.title).toBe('Progress report — Jordan Lee');
    expect(props.author).toBe('HSC Writing Coach');
    expect(String(props.keywords)).toContain('progress report');
  });

  it('draws the footer disclaimer on every page, and the privacy line for the names it prints', async () => {
    await exportProgressReportPdf({ report: makeReport() });
    expect(printed(current.calls).some((t) => t.includes('practice feedback'))).toBe(true);
    expect(printed(current.calls).some((t) => t.includes('Contains student names'))).toBe(false);

    await exportProgressReportPdf({
      report: makeReport({ audience: 'teacher', students: [student('Ava Nguyen')] }),
    });
    expect(printed(current.calls).some((t) => t.includes('Contains student names'))).toBe(true);

    await exportProgressReportPdf({
      report: makeReport({
        audience: 'teacher',
        students: [student('Student 1')],
        anonymised: true,
      }),
    });
    expect(printed(current.calls).some((t) => t.includes('Student names have been removed'))).toBe(
      true
    );
    expect(printed(current.calls).some((t) => t.includes('Contains student names'))).toBe(false);
  });
  it('bookmarks each section it draws, on the page it starts', async () => {
    await exportProgressReportPdf({ report: makeReport() });
    const titles = current.outlined.map((o) => o.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Progress over time', 'Command verb tiers', 'About this report'])
    );
    current.outlined.forEach((o) => expect(o.page).toBeGreaterThanOrEqual(1));
  });

  it('prints the running head on the second page onwards', async () => {
    await exportProgressReportPdf({
      report: makeReport({
        trend: trendOf(Array.from({ length: 60 }, (_, i) => 2 + (i % 4))),
        notes: Array.from(
          { length: 90 },
          (_, i) => `A caveat number ${i + 1} that is long enough to wrap onto a second line.`
        ),
      }),
    });
    expect(current.pageCount()).toBeGreaterThan(1);
    // The masthead title and the running head on each later page.
    const heads = printed(current.calls).filter((t) => t === 'PROGRESS REPORT');
    expect(heads.length).toBeGreaterThanOrEqual(2);
  });

  it('gives every coordinate and size it draws as a finite number', async () => {
    const reports: ProgressReport[] = [
      makeReport(),
      makeReport({ trend: [] }),
      makeReport({ trend: trendOf([4]) }),
      makeReport({
        audience: 'teacher',
        students: [student('Ava')],
        sections: makeReport().sections,
      }),
    ];
    for (const report of reports) {
      await exportProgressReportPdf({ report });
      const numeric = current.calls.filter((c) =>
        [
          'text',
          'line',
          'rect',
          'roundedRect',
          'circle',
          'setLineWidth',
          'setLineDashPattern',
        ].includes(c.name)
      );
      expect(numeric.length).toBeGreaterThan(0);
      numeric.forEach((c) => {
        const numbers = c.args.filter((a) => typeof a === 'number' || Array.isArray(a));
        expect(allFinite(numbers)).toBe(true);
      });
    }
  });

  it('paints a point in the colour of the band it reached', async () => {
    await exportProgressReportPdf({ report: makeReport({ trend: trendOf([4, 4, 5]) }) });
    const fills = current.calls.filter((c) => c.name === 'setFillColor');
    const band4 = bandColor(4);
    const band5 = bandColor(5);
    expect(fills.some((c) => c.args.join() === band4.join())).toBe(true);
    expect(fills.some((c) => c.args.join() === band5.join())).toBe(true);
  });

  it('names the stage that failed, and tells the user in a toast', async () => {
    engineFails = true;
    const toast = vi.fn();
    const err = await exportProgressReportPdf({ report: makeReport(), onToast: toast }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(PdfExportError);
    expect(err.stage).toBe('engine');
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('fails at the layout stage when the report cannot be read', async () => {
    const broken = makeReport();
    Object.defineProperty(broken, 'trend', {
      get() {
        throw new Error('the data side handed over a bad report');
      },
    });
    const err = await exportProgressReportPdf({ report: broken }).catch((e) => e);
    expect(err).toBeInstanceOf(PdfExportError);
    expect(err.stage).toBe('layout');
  });

  it('fails at the render stage when the engine refuses a drawing call', async () => {
    docOptions = { failText: true };
    const err = await exportProgressReportPdf({ report: makeReport() }).catch((e) => e);
    expect(err).toBeInstanceOf(PdfExportError);
    expect(err.stage).toBe('render');
  });

  it('fails at the save stage, with a message about the download', async () => {
    docOptions = { failSave: true };
    const toast = vi.fn();
    const err = await exportProgressReportPdf({ report: makeReport(), onToast: toast }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(PdfExportError);
    expect(err.stage).toBe('save');
    expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/download/), 'error');
  });
});
