import { describe, it, expect, beforeEach } from 'vitest';
import { buildEvaluationBlocks, EvaluationExportData } from '../../pdf/buildBlocks';
import { measureBlock, meterHeight, bandScaleHeight, ruleLinesHeight } from '../../pdf/layout';
import { ContentBlock, TextMeasurer, MM_PER_PT } from '../../pdf/types';
import {
  DEFAULT_PDF_PREFERENCES,
  MAX_COPIES,
  readPdfPreferences,
  writePdfPreferences,
} from '../../utils/pdfExportPreferences';

/**
 * What the report says, and whether the layout has reserved room for it.
 *
 * A drawn thing the measurer did not account for is the worst kind of bug this
 * exporter can have: the column flow is measure-then-place, so an unmeasured
 * meter or ruled line does not push content down — it paints over whatever is
 * already there, or over the footer.
 */

const measurer: TextMeasurer = {
  wrap: (text, maxWidthMm) => {
    const perLine = Math.max(8, Math.floor(maxWidthMm * 2.2));
    const words = text.split(/\s+/).filter(Boolean);
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
  lineHeight: (fontPt, factor) => fontPt * factor * MM_PER_PT,
};

const data = (over: Partial<EvaluationExportData> = {}): EvaluationExportData => ({
  question: 'Describe the key steps involved in DNA replication.',
  verb: 'DESCRIBE',
  totalMarks: 6,
  overallMark: 4,
  overallBand: 4,
  overallFeedback: 'A sound response.',
  strengths: ['Correct sequence.'],
  improvements: ['Name the enzymes.', 'Use the syllabus term.'],
  criteria: [{ criterion: 'Accuracy', mark: 2, maxMark: 3, feedback: 'Mostly right.' }],
  ...over,
});

const find = (blocks: ContentBlock[], predicate: (b: ContentBlock) => boolean) =>
  blocks.find(predicate);

describe('the report says what it means', () => {
  it('gives every criterion a meter matching its chip', () => {
    const blocks = buildEvaluationBlocks(data());
    const criterion = find(blocks, (b) => b.kind === 'criterion')!;

    expect(criterion.chip).toBe('2 / 3');
    expect(criterion.meter).toEqual({ value: 2, max: 3 });
  });

  it('puts the band reached on a ladder beside the score', () => {
    const blocks = buildEvaluationBlocks(data({ overallBand: 5 }));
    const score = find(blocks, (b) => b.kind === 'scoreSummary')!;

    expect(score.bandScale).toBe(5);
  });

  // The next steps are a list of things to do, so they are drawn as boxes to
  // tick. Strong evidence is a list of things already done, so it is not.
  it('makes the next steps tickable and leaves the strengths as bullets', () => {
    const blocks = buildEvaluationBlocks(data());
    const items = blocks.filter((b) => b.kind === 'listItem');

    expect(items.filter((b) => b.checkbox)).toHaveLength(2);
    expect(items.filter((b) => !b.checkbox)).toHaveLength(1);
    expect(find(blocks, (b) => /next steps/i.test(b.runs[0]?.text ?? ''))).toBeTruthy();
  });

  it('leaves ruled space for a marker only when asked', () => {
    const without = buildEvaluationBlocks(data());
    expect(without.some((b) => b.ruleLines)).toBe(false);

    const withNotes = buildEvaluationBlocks(data({ markerNotes: true }));
    const notes = find(withNotes, (b) => !!b.ruleLines)!;
    expect(notes.ruleLines).toBeGreaterThan(0);
    expect(find(withNotes, (b) => /marker/i.test(b.runs[0]?.text ?? ''))).toBeTruthy();
  });
});

describe('the layout reserves room for it', () => {
  const measure = (block: ContentBlock, pScale = 1) => measureBlock(block, measurer, 80, pScale);

  it('makes a criterion taller by exactly its meter', () => {
    const [withMeter] = buildEvaluationBlocks(data()).filter((b) => b.kind === 'criterion');
    const without = { ...withMeter, meter: undefined };

    const tall = measure(withMeter).height;
    const short = measure(without).height;

    expect(tall - short).toBeCloseTo(meterHeight(withMeter, 1), 5);
    expect(tall).toBeGreaterThan(short);
  });

  it('records the meter height on the block, so drawing cannot guess', () => {
    const [criterion] = buildEvaluationBlocks(data()).filter((b) => b.kind === 'criterion');
    expect(measure(criterion).labelExtraMm).toBeCloseTo(meterHeight(criterion, 1), 5);
  });

  it('makes the score box taller by exactly its band ladder', () => {
    const score = find(buildEvaluationBlocks(data()), (b) => b.kind === 'scoreSummary')!;
    const without = { ...score, bandScale: undefined };

    expect(measure(score).height - measure(without).height).toBeCloseTo(
      bandScaleHeight(score, 1),
      5
    );
  });

  it('reserves the ruled lines', () => {
    const notes = find(buildEvaluationBlocks(data({ markerNotes: true })), (b) => !!b.ruleLines)!;
    const without = { ...notes, ruleLines: undefined };

    expect(measure(notes).height - measure(without).height).toBeCloseTo(
      ruleLinesHeight(notes, 1),
      5
    );
  });

  it('scales the extras with the page, like everything else', () => {
    const [criterion] = buildEvaluationBlocks(data()).filter((b) => b.kind === 'criterion');
    expect(meterHeight(criterion, 0.75)).toBeCloseTo(meterHeight(criterion, 1) * 0.75, 5);
  });

  it('costs nothing when a block carries no extras', () => {
    const plain: ContentBlock = { kind: 'paragraph', id: 'p', runs: [] };
    expect(meterHeight(plain, 1)).toBe(0);
    expect(bandScaleHeight(plain, 1)).toBe(0);
    expect(ruleLinesHeight(plain, 1)).toBe(0);
  });
});

describe('export preferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts from sensible defaults', () => {
    expect(readPdfPreferences()).toEqual(DEFAULT_PDF_PREFERENCES);
  });

  it('remembers what a teacher chose', () => {
    writePdfPreferences({
      pageSize: 'letter',
      includeResponse: false,
      markerNotes: true,
      showFields: false,
      copies: 12,
    });

    expect(readPdfPreferences()).toEqual({
      pageSize: 'letter',
      includeResponse: false,
      markerNotes: true,
      showFields: false,
      copies: 12,
    });
  });

  it('clamps a copy count that would render for a minute', () => {
    writePdfPreferences({ ...DEFAULT_PDF_PREFERENCES, copies: 5000 });
    expect(readPdfPreferences().copies).toBe(MAX_COPIES);

    writePdfPreferences({ ...DEFAULT_PDF_PREFERENCES, copies: 0 });
    expect(readPdfPreferences().copies).toBe(1);
  });

  // A corrupt preference must never be the reason a report cannot be exported.
  it('falls back field by field on damaged storage', () => {
    window.localStorage.setItem('hsc.pdfExportPreferences', '{"pageSize":"foolscap"');
    expect(readPdfPreferences()).toEqual(DEFAULT_PDF_PREFERENCES);

    window.localStorage.setItem('hsc.pdfExportPreferences', '{"pageSize":"foolscap","copies":"x"}');
    const prefs = readPdfPreferences();
    expect(prefs.pageSize).toBe('a4');
    expect(prefs.copies).toBe(1);
  });
});
