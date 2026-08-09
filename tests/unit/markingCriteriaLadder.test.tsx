import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import MarkingCriteriaAccordion from '../../components/MarkingCriteriaAccordion';
import { formatMarkingCriteria } from '../../utils/dataManagerUtils';
import { Prompt, PromptVerb } from '../../types';

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
      userRole="student"
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
    expect(out.split('\n')[1]).toBe('6-7 marks: Thorough analysis.');
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
    expect(lines[0]).toBe('8 marks: Comprehensive analysis of caching.');
    expect(lines[3]).toBe('1-2 marks: Elementary statements.');
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
      '7-8 marks: (Band 6) Comprehensive, sustained analysis.'
    );
  });

  it('strips a code fence the model wrapped the rubric in', () => {
    const raw = '```\n2 marks: Two features.\n1 mark: One feature.\n```';

    expect(formatMarkingCriteria(raw)).toBe('2 marks: Two features.\n1 mark: One feature.');
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
   * The ladder has to READ as a ladder in both themes, and it paints itself
   * entirely from `getBandConfig` — so a level's row carries the band's fill in
   * both, not just its border. See `bandColors.test.ts` for the light-tint
   * regression that made this worth pinning.
   */
  it('paints every level with its own band fill, not just a border', () => {
    const { container } = renderCriteria(
      '8 marks: Comprehensive analysis.\\n6-7 marks: Thorough analysis.\\n1-2 marks: Elementary.'
    );

    const rows = Array.from(container.querySelectorAll('div.items-stretch'));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // A dark wash AND a light one — a row with only the dark class is the
      // state that made the guide colourless in light mode.
      expect(row.className).toMatch(/bg-\w+-500\/10/);
      expect(row.className).toMatch(/light:bg-\w+-100/);
      expect(row.className).toMatch(/border-\w+-500\/50/);
    }
  });
});
