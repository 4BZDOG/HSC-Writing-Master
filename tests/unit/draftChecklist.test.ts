import { describe, it, expect } from 'vitest';
import {
  buildDraftChecklist,
  summariseChecklist,
  MAX_CHECKLIST_TERMS,
  SENTENCE_CHECK_FROM_WORDS,
  STRUCTURE_CHECK_OVER_WORDS,
} from '../../utils/draftChecklist';
import type { WritingInsight } from '../../utils/writingAnalysis';

const insight = (id: string, message = `${id} message`): WritingInsight => ({
  id,
  tone: 'info',
  message,
});

const row = (rows: ReturnType<typeof buildDraftChecklist>, id: string) =>
  rows.find((r) => r.id === id);

describe('buildDraftChecklist', () => {
  it('returns no rows for a blank draft, whatever the insights say', () => {
    expect(buildDraftChecklist({ insights: [], wordCount: 0, missingTerms: [] })).toEqual([]);
    expect(
      buildDraftChecklist({
        insights: [insight('length-short'), insight('keywords-missing')],
        wordCount: 0,
        missingTerms: ['osmosis'],
      })
    ).toEqual([]);
  });

  describe('length', () => {
    it('is present for any non-empty draft, even with nothing to say about it', () => {
      const rows = buildDraftChecklist({ insights: [], wordCount: 5, missingTerms: [] });
      expect(rows.map((r) => r.id)).toEqual(['length']);
      expect(rows[0].state).toBe('done');
      expect(rows[0].detail).toMatch(/nothing to flag/i);
    });

    it('is to do on a short draft, with the insight message as its detail', () => {
      const rows = buildDraftChecklist({
        insights: [insight('length-short', 'About 40 more words to reach full-mark length.')],
        wordCount: 60,
        missingTerms: [],
      });
      expect(row(rows, 'length')).toEqual({
        id: 'length',
        label: 'Length',
        state: 'todo',
        detail: 'About 40 more words to reach full-mark length.',
      });
    });

    it('is to do on an overlong draft', () => {
      const rows = buildDraftChecklist({
        insights: [insight('length-long', 'At 400 words this runs past the usual length.')],
        wordCount: 400,
        missingTerms: [],
      });
      expect(row(rows, 'length')?.state).toBe('todo');
      expect(row(rows, 'length')?.detail).toMatch(/400 words/);
    });

    it('is to do when the characters run over, as well as the words', () => {
      const rows = buildDraftChecklist({
        insights: [insight('chars-over', 'Longer than this verb usually needs.')],
        wordCount: 120,
        missingTerms: [],
      });
      expect(row(rows, 'length')?.state).toBe('todo');
    });

    it('is clear with the length insight message when the length is right', () => {
      const rows = buildDraftChecklist({
        insights: [insight('length-good', 'A full-mark length.')],
        wordCount: 120,
        missingTerms: [],
      });
      expect(row(rows, 'length')).toMatchObject({ state: 'done', detail: 'A full-mark length.' });
    });

    it('is clear when the analysis fell back to all-good, which has no row of its own', () => {
      const rows = buildDraftChecklist({
        insights: [insight('all-good', 'Looking strong.')],
        wordCount: 30,
        missingTerms: [],
      });
      expect(row(rows, 'length')?.state).toBe('done');
      // The fallback is generic praise; the length row says what it knows.
      expect(row(rows, 'length')?.detail).not.toMatch(/looking strong/i);
    });
  });

  describe('syllabus terms', () => {
    it('is absent when the analysis has no keyword insight', () => {
      const rows = buildDraftChecklist({
        insights: [insight('length-short')],
        wordCount: 60,
        missingTerms: ['osmosis'],
      });
      expect(row(rows, 'terms')).toBeUndefined();
    });

    it('is to do when terms are missing, offering them as chips', () => {
      const rows = buildDraftChecklist({
        insights: [insight('keywords-missing', 'Weave in 2 more syllabus terms: osmosis.')],
        wordCount: 60,
        missingTerms: ['osmosis', 'diffusion'],
      });
      expect(row(rows, 'terms')).toEqual({
        id: 'terms',
        label: 'Syllabus terms',
        state: 'todo',
        detail: 'Weave in 2 more syllabus terms: osmosis.',
        terms: ['osmosis', 'diffusion'],
      });
    });

    it('caps the chips at five, keeping the must-use terms that lead the list', () => {
      const missing = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
      const rows = buildDraftChecklist({
        insights: [insight('keywords-missing')],
        wordCount: 60,
        missingTerms: missing,
      });
      const terms = row(rows, 'terms')?.terms ?? [];
      expect(MAX_CHECKLIST_TERMS).toBe(5);
      expect(terms).toEqual(['t1', 't2', 't3', 't4', 't5']);
    });

    it('omits the chips when there is nothing missing to offer', () => {
      const rows = buildDraftChecklist({
        insights: [insight('keywords-missing')],
        wordCount: 60,
        missingTerms: [],
      });
      expect(row(rows, 'terms')?.state).toBe('todo');
      expect(row(rows, 'terms')).not.toHaveProperty('terms');
    });

    it('is clear once every term is in, with no chips', () => {
      const rows = buildDraftChecklist({
        insights: [insight('keywords-all', 'All syllabus terms covered.')],
        wordCount: 60,
        missingTerms: [],
      });
      expect(row(rows, 'terms')).toEqual({
        id: 'terms',
        label: 'Syllabus terms',
        state: 'done',
        detail: 'All syllabus terms covered.',
      });
    });

    it('is to do with the band target when every named term is in but the band expects more', () => {
      const rows = buildDraftChecklist({
        insights: [
          insight('keywords-all', 'All syllabus terms covered.'),
          insight('terms-target', 'Band 5 tasks expect 4+ syllabus terms.'),
        ],
        wordCount: 80,
        missingTerms: [],
      });
      expect(row(rows, 'terms')).toMatchObject({
        state: 'todo',
        detail: 'Band 5 tasks expect 4+ syllabus terms.',
      });
      expect(row(rows, 'terms')).not.toHaveProperty('terms');
    });

    it('prefers the missing-terms message over the band target when both fired', () => {
      const rows = buildDraftChecklist({
        insights: [
          insight('keywords-missing', 'Weave in 2 more syllabus terms.'),
          insight('terms-target', 'Band 5 tasks expect 4+ syllabus terms.'),
        ],
        wordCount: 80,
        missingTerms: ['osmosis'],
      });
      expect(row(rows, 'terms')?.detail).toBe('Weave in 2 more syllabus terms.');
    });
  });

  describe('sentences', () => {
    it('is absent below the word threshold, however long the sentences are', () => {
      const rows = buildDraftChecklist({
        insights: [insight('run-on', 'One sentence runs to 60 words.')],
        wordCount: SENTENCE_CHECK_FROM_WORDS - 1,
        missingTerms: [],
      });
      expect(row(rows, 'sentences')).toBeUndefined();
    });

    it('is present from the threshold, and clear when no sentence runs on', () => {
      const rows = buildDraftChecklist({
        insights: [],
        wordCount: SENTENCE_CHECK_FROM_WORDS,
        missingTerms: [],
      });
      expect(row(rows, 'sentences')).toMatchObject({ state: 'done' });
      expect(row(rows, 'sentences')?.detail).toMatch(/manageable/i);
    });

    it('is to do when a run-on fired, with its message', () => {
      const rows = buildDraftChecklist({
        insights: [insight('run-on', 'One sentence runs to 52 words.')],
        wordCount: 80,
        missingTerms: [],
      });
      expect(row(rows, 'sentences')).toEqual({
        id: 'sentences',
        label: 'Sentences',
        state: 'todo',
        detail: 'One sentence runs to 52 words.',
      });
    });
  });

  describe('structure', () => {
    it('is absent for a short draft with no paragraph prompt', () => {
      const rows = buildDraftChecklist({
        insights: [],
        wordCount: STRUCTURE_CHECK_OVER_WORDS,
        missingTerms: [],
      });
      expect(row(rows, 'structure')).toBeUndefined();
    });

    it('is clear once the draft is long and has paragraphs', () => {
      const rows = buildDraftChecklist({
        insights: [],
        wordCount: STRUCTURE_CHECK_OVER_WORDS + 1,
        missingTerms: [],
      });
      expect(row(rows, 'structure')).toMatchObject({ state: 'done' });
    });

    it('is to do when a long draft is one block', () => {
      const rows = buildDraftChecklist({
        insights: [insight('paragraphs', 'Break this into paragraphs.')],
        wordCount: 150,
        missingTerms: [],
      });
      expect(row(rows, 'structure')).toEqual({
        id: 'structure',
        label: 'Structure',
        state: 'todo',
        detail: 'Break this into paragraphs.',
      });
    });

    it('is to do with the section hint for a high-band draft', () => {
      const rows = buildDraftChecklist({
        insights: [insight('structure-hint', 'Use intro, body and conclusion.')],
        wordCount: 90,
        missingTerms: [],
      });
      expect(row(rows, 'structure')).toMatchObject({
        state: 'todo',
        detail: 'Use intro, body and conclusion.',
      });
    });
  });

  it('lists the rows in the order a student meets them while writing', () => {
    const rows = buildDraftChecklist({
      insights: [
        insight('keywords-missing'),
        insight('run-on'),
        insight('paragraphs'),
        insight('length-short'),
      ],
      wordCount: 150,
      missingTerms: ['osmosis'],
    });
    expect(rows.map((r) => r.id)).toEqual(['length', 'terms', 'sentences', 'structure']);
  });

  it('gives a row for each check that applies, and none for those that do not', () => {
    const rows = buildDraftChecklist({
      insights: [insight('length-good')],
      wordCount: 12,
      missingTerms: [],
    });
    expect(rows.map((r) => r.id)).toEqual(['length']);
  });
});

describe('summariseChecklist', () => {
  it('counts the clear rows against the whole list', () => {
    const rows = buildDraftChecklist({
      insights: [insight('length-short'), insight('paragraphs')],
      wordCount: 90,
      missingTerms: [],
    });
    expect(summariseChecklist(rows)).toEqual({ cleared: 1, total: 3, allClear: false });
  });

  it('is all clear when every row is, and never on an empty list', () => {
    const rows = buildDraftChecklist({
      insights: [insight('length-good'), insight('keywords-all')],
      wordCount: 60,
      missingTerms: [],
    });
    // Length, the terms and the sentence check are all clear here.
    expect(summariseChecklist(rows)).toEqual({ cleared: 3, total: 3, allClear: true });
    expect(summariseChecklist([])).toEqual({ cleared: 0, total: 0, allClear: false });
  });
});
