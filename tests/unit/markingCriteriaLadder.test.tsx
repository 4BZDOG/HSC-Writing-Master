import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import MarkingCriteriaAccordion from '../../components/MarkingCriteriaAccordion';
import { formatMarkingCriteria } from '../../utils/dataManagerUtils';
import { getBandRgb } from '../../utils/renderUtils';
import { Prompt, PromptVerb } from '../../types';
import { LADDER_READING } from '../../utils/ladderChrome';

/**
 * A marking guide is only useful as the descending HSC ladder — one row per
 * mark value or band, worst to best. Every shape below is one a model has
 * actually returned instead, and each used to collapse into a single
 * undifferentiated block of prose in the accordion. These tests pin the
 * normalisation that recovers the ladder.
 */

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: vi.fn(),
}));

afterEach(cleanup);

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Analyse the impact of caching on system performance.',
    verb: 'ANALYSE' as PromptVerb,
    totalMarks: 8,
    keywords: [],
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
    ...over,
  }) as Prompt;

const renderCriteria = (criteria: string, over: Partial<Prompt> = {}) =>
  render(
    <MarkingCriteriaAccordion
      prompt={prompt(over)}
      markingCriteria={criteria}
      onSave={() => {}}
      band={4}
      userRole="user"
      embedded
    />
  );

describe('formatMarkingCriteria recovers the descending ladder', () => {
  it('restores rows a model separated with the literal characters backslash-n', () => {
    const raw =
      '8 marks: Comprehensive analysis.\\n6-7 marks: Thorough analysis.\\n1-2 marks: Basic.';

    const out = formatMarkingCriteria(raw);

    expect(out).not.toContain('\\n');
    expect(out.split('\n')).toHaveLength(3);
    expect(out.split('\n')[1]).toBe('6-7 marks: Thorough analysis');
  });

  it('leaves an escape sequence alone in a rubric that already has real rows', () => {
    // This is a computing app: "\n" is a thing a criterion legitimately names.
    const raw = '2 marks: Terminates each record with \\n.\n1 mark: Writes the record.';

    expect(formatMarkingCriteria(raw).split('\n')).toHaveLength(2);
  });

  it('splits a rubric that arrived as one run-on paragraph', () => {
    const raw =
      '8 marks: Comprehensive analysis of caching. 6-7 marks: Thorough analysis with minor gaps. ' +
      '3-5 marks: Sound description only. 1-2 marks: Elementary statements.';

    const lines = formatMarkingCriteria(raw).split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('8 marks: Comprehensive analysis of caching');
    expect(lines[3]).toBe('1-2 marks: Elementary statements');
  });

  it('leaves a mark value quoted mid-sentence alone', () => {
    const raw = '2 marks: Identifies two features. Each feature is worth 1 mark to the marker.';

    expect(formatMarkingCriteria(raw).split('\n')).toHaveLength(1);
  });

  it('unwraps a markdown table into mark rows and drops its scaffolding', () => {
    const raw = [
      '| Marks | Criteria |',
      '|-------|----------|',
      '| 8 | Comprehensive analysis |',
      '| 6-7 | Thorough analysis |',
    ].join('\n');

    const lines = formatMarkingCriteria(raw).split('\n');

    expect(lines).toEqual(['8: Comprehensive analysis', '6-7: Thorough analysis']);
  });

  it('promotes the mark range out of a band-led row', () => {
    const raw = 'Band 6 (7-8 marks): Comprehensive, sustained analysis.';

    expect(formatMarkingCriteria(raw)).toBe(
      '7-8 marks: (Band 6) Comprehensive, sustained analysis'
    );
  });

  it('strips a code fence the model wrapped the rubric in', () => {
    const raw = '```\n2 marks: Two features.\n1 mark: One feature.\n```';

    expect(formatMarkingCriteria(raw)).toBe('2 marks: Two features\n1 mark: One feature');
  });
});

describe('the accordion renders a row per mark level', () => {
  it('splits escaped-newline rubrics into separate rows', () => {
    renderCriteria('8 marks: Comprehensive analysis.\\n6-7 marks: Thorough analysis.');

    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('6–7')).toBeTruthy();
    expect(screen.getByText(/Comprehensive analysis/)).toBeTruthy();
    expect(screen.getByText(/Thorough analysis/)).toBeTruthy();
  });

  it('keeps the criteria that follow a bracketed mark value', () => {
    renderCriteria('Band 5 (6 marks) — Thorough analysis with clear relationships.');

    expect(screen.getByText(/Thorough analysis with clear relationships/)).toBeTruthy();
  });

  it('appends a wrapped continuation line to the row above it', () => {
    renderCriteria('Describes both features (2 marks)\nwith a relevant example.');

    expect(screen.getByText(/with a relevant example/)).toBeTruthy();
  });

  /**
   * A rubric row can be written with a band label rather than a mark. The band
   * it is DRAWN as has to be one this question can award, or the guide paints a
   * colour the exemplar ladder never shows at the same mark.
   */
  it('snaps a band-labelled row onto the ladder this question can award', () => {
    // A 4-mark Evaluate is the outlier this rule exists for: Tier 6, so the
    // ladder runs 4/4 Band 6 down to 1/4 Band 3 and Band 2 is unreachable.
    // The row belongs at mark 1, where the exemplar is Band 3 — so the row is
    // Band 3 too, and both are drawn yellow.
    const { container } = renderCriteria('Band 2: Elementary statements only.', {
      verb: 'EVALUATE' as PromptVerb,
      totalMarks: 4,
    });

    expect(screen.getByText('Band 3')).toBeTruthy();
    expect(screen.queryByText('Band 2')).toBeNull();
    const row = container.querySelector('div.items-stretch') as HTMLElement;
    expect(row.className).toContain('band-fill');
    expect(row.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
  });

  it('leaves a band-labelled row alone when the question can award that band', () => {
    // Same verb, enough marks to spread: Band 2 is a real rung here, so the
    // row keeps the number its author wrote and its own orange.
    const { container } = renderCriteria('Band 2: Elementary statements only.', {
      verb: 'EVALUATE' as PromptVerb,
      totalMarks: 6,
    });

    expect(screen.getByText('Band 2')).toBeTruthy();
    const row = container.querySelector('div.items-stretch') as HTMLElement;
    expect(row.className).toContain('band-fill');
    expect(row.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(2));
  });

  /**
   * The ladder has to READ as a ladder in both themes, and it paints itself
   * entirely from `getBandConfig` — so a level's row carries the band's fill in
   * both, not just its border. See `bandColors.test.ts` for the light-tint
   * regression that made this worth pinning.
   */
  it('paints every level with its own band fill and a solid gutter, not just a border', () => {
    const { container } = renderCriteria(
      '8 marks: Comprehensive analysis.\\n6-7 marks: Thorough analysis.\\n1-2 marks: Elementary.'
    );

    const rows = Array.from(container.querySelectorAll('div.items-stretch')) as HTMLElement[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // The row's fill is `band-fill`, a gradient drawn from `--band-rgb` in both
      // themes, so a row is coloured by its band and not by a light wash that only
      // the dark theme could show. This is the regression the test exists for.
      expect(row.className).toContain('band-fill');

      // The gutter is the band's SOLID colour, so the figure is read against a full
      // band and not against the row's tint.
      const gutter = row.querySelector('.border-r') as HTMLElement;
      expect(gutter.className).toContain('band-solid');

      // The edge is band-derived, not the raw `-500/50` token: drawn at full
      // saturation round a filled row it is the loudest thing on the row. `band-edge`
      // takes 35% of the band's hue from `--band-rgb`.
      expect(row.className).toContain('band-edge');
      expect(row.style.getPropertyValue('--band-rgb')).toMatch(/^\d+ \d+ \d+$/);
    }
  });
});

/**
 * The criteria read at the ladder's reading size, the one an exemplar's preview is set in.
 *
 * The guide's rows and the Sample Answers rows are one ladder, so a criterion and a
 * preview share the serif, the size, the leading and the ink (`LADDER_READING`). The
 * command-term guide keeps `.t-body`, which is its own glossary and not a ladder row.
 */
// Found by the token itself, not a literal size class, so retuning the reading size in
// `LADDER_READING` cannot make these tests find nothing.
const READING_SELECTOR = LADDER_READING.split(' ')
  .slice(0, 2)
  .map((c) => `.${c.replace(/[[\]]/g, '\\$&')}`)
  .join('');

describe('the criteria read at the ladder’s reading size', () => {
  it('sets each criterion row in the shared reading token, not a caption size', () => {
    const { container } = renderCriteria('8 marks: Comprehensive analysis.\n6 marks: Thorough.');
    const rows = container.querySelectorAll<HTMLElement>(READING_SELECTOR);
    expect(rows.length, 'no criterion row carries the reading token').toBeGreaterThan(0);
    for (const row of rows) {
      for (const token of LADDER_READING.split(' ')) {
        expect(row.className.split(' '), `a criterion row lost \`${token}\``).toContain(token);
      }
      expect(row.className).not.toMatch(/text-\[(9|10|11|12)px\]|text-xs\b|t-label/);
    }
  });

  it('keeps the prose fallback in the same reading face as a row', () => {
    // The branch taken when the criteria do not parse into a ladder.
    const { container } = renderCriteria(
      'For full marks the response must clearly relate structure to function throughout.'
    );
    const fallback = container.querySelector<HTMLElement>(READING_SELECTOR);
    expect(fallback, 'the fallback prose is not in the reading face').not.toBeNull();
    for (const token of LADDER_READING.split(' ')) {
      expect(fallback!.className.split(' ')).toContain(token);
    }
  });
});
