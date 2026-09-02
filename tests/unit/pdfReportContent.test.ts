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
  // Inverse of `wrap`'s char budget above, so a rich (span-wrapped) run breaks
  // at the same places the plain one does.
  measure: (text) => text.length / 2.2,
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

  it('caps the ladder at the question target band and clamps the value to it', () => {
    // A Band-4-ceiling question: the ladder stops at 4, not 6, and the value
    // can never exceed the ceiling even if overallBand is passed higher.
    const score = find(
      buildEvaluationBlocks(data({ overallBand: 4, targetBand: 4 })),
      (b) => b.kind === 'scoreSummary'
    )!;
    expect(score.bandScaleMax).toBe(4);
    expect(score.bandScale).toBe(4);

    const clamped = find(
      buildEvaluationBlocks(data({ overallBand: 6, targetBand: 3 })),
      (b) => b.kind === 'scoreSummary'
    )!;
    expect(clamped.bandScaleMax).toBe(3);
    expect(clamped.bandScale).toBe(3);
  });

  it('draws the full six-rung ladder when no target band is given', () => {
    const score = find(
      buildEvaluationBlocks(data({ overallBand: 4 })),
      (b) => b.kind === 'scoreSummary'
    )!;
    expect(score.bandScaleMax).toBe(6);
    expect(score.bandScale).toBe(4);
  });

  it('spans the prose sections full width and keeps the analysis in columns', () => {
    const blocks = buildEvaluationBlocks(
      data({ studentAnswer: 'My answer.', revisedAnswer: 'A better answer.' })
    );
    // The long prose — question, student response, improved response — is
    // flagged fullWidth so it spans the page.
    const q = find(blocks, (b) => b.id.startsWith('q'))!;
    const ans = find(blocks, (b) => b.id.startsWith('ans'))!;
    const rev = find(blocks, (b) => b.id.startsWith('rev'))!;
    expect(q.fullWidth).toBe(true);
    expect(ans.fullWidth).toBe(true);
    expect(rev.fullWidth).toBe(true);
    // The analytical sections stay in the two-column flow.
    const score = find(blocks, (b) => b.kind === 'scoreSummary')!;
    const criterion = find(blocks, (b) => b.kind === 'criterion')!;
    // The result strip spans too: as a single-column box it guaranteed an empty
    // column beside it, because the full-width band under it began below the box.
    expect(score.fullWidth).toBe(true);
    expect(criterion.fullWidth).toBeFalsy();
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

  // The "What changed" section is an edit map of the student's own answer. It
  // must never leave a silent gap: a revision of only minor word-swaps filters
  // to zero substantial rows, but the student still deserves the heading, the
  // stats, and a pointer — not blank space that reads as "nothing changed".
  const hasHeading = (blocks: ContentBlock[], re: RegExp) =>
    blocks.some((b) => b.kind === 'heading' && re.test(b.runs[0]?.text ?? ''));
  const hasText = (blocks: ContentBlock[], re: RegExp) =>
    blocks.some((b) => b.runs.some((r) => re.test(r.text ?? '')));

  it('lists the substantial edits when the revision made real changes', () => {
    const blocks = buildEvaluationBlocks(
      data({
        studentAnswer: 'The cat sat.',
        revisedAnswer: 'The cat sat quietly on the warm mat by the fire.',
      })
    );
    expect(hasHeading(blocks, /what changed/i)).toBe(true);
    expect(blocks.some((b) => b.id.startsWith('chgnew-'))).toBe(true);
    expect(hasText(blocks, /reworks the response throughout/i)).toBe(false);
  });

  it('still prints the section (with guidance) when every edit is a minor swap', () => {
    // "The" -> "A" is a function-word swap: stats count it, but it filters out
    // of substantiveChanges, so there are no rows to print.
    const blocks = buildEvaluationBlocks(
      data({ studentAnswer: 'The cat sat on the mat.', revisedAnswer: 'A cat sat on the mat.' })
    );
    expect(hasHeading(blocks, /what changed/i)).toBe(true);
    expect(hasText(blocks, /reworks the response throughout/i)).toBe(true);
    expect(blocks.some((b) => b.id.startsWith('chgnew-'))).toBe(false);
  });

  it('omits the section entirely when the answer was not revised', () => {
    const same = 'The cat sat on the mat.';
    const blocks = buildEvaluationBlocks(data({ studentAnswer: same, revisedAnswer: same }));
    expect(hasHeading(blocks, /what changed/i)).toBe(false);
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

  it('never lets the band ladder outgrow the strip it sits in', () => {
    // The strip is as tall as its tallest cell, and the ladder lives in the
    // band cell. Height no longer grows one-for-one with the ladder — the mark
    // beside it can be taller — but the strip must always have room for it, or
    // the ladder paints over the block below.
    const score = find(buildEvaluationBlocks(data()), (b) => b.kind === 'scoreSummary')!;
    const without = { ...score, bandScale: undefined };
    const measured = measure(score);

    expect(measured.height).toBeGreaterThanOrEqual(measure(without).height);
    expect(measured.height).toBeGreaterThan(bandScaleHeight(score, 1));
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

describe('the wrap does not invent punctuation', () => {
  /**
   * A wrap that lands a lone "." on its own line reads as a hard return the
   * marker never typed. It is the wrap's doing, not the text's, so the wrap
   * undoes it.
   */
  const narrow: TextMeasurer = {
    // Breaks before the final full stop on purpose.
    wrap: (text) => {
      const trimmed = text.trim();
      return trimmed.endsWith('.') ? [trimmed.slice(0, -1).trim(), '.'] : [trimmed];
    },
    lineHeight: (fontPt, factor) => fontPt * factor * MM_PER_PT,
    measure: (text) => text.length / 2.2,
  };

  it('rejoins a stranded closing mark with the line before it', () => {
    const block: ContentBlock = {
      kind: 'paragraph',
      id: 'p',
      runs: [{ text: 'Weigh the trade-off between security and usability.', baseFontPt: 9 }],
    };

    const measured = measureBlock(block, narrow, 60, 1);

    expect(measured.wrapped[0]).toEqual(['Weigh the trade-off between security and usability.']);
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
