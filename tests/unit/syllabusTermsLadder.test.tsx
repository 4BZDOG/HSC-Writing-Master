import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import KeywordEditor from '../../components/KeywordEditor';
import { Prompt, PromptVerb, UserRole } from '../../types';
import { getBandConfig } from '../../utils/renderUtils';
import { LADDER_FILL, LADDER_FILL_QUIET, LADDER_TOOL_INPUT } from '../../utils/ladderChrome';
import { TERM_PILL_KEY_USED, TERM_PILL_MAIN, TERM_PILL_REMOVE } from '../../utils/termChrome';

/**
 * The Syllabus Terms panel, drawn as the mark ladder's rows (DesignSpec §3).
 *
 * Two rows, one per group, each with its count in a gutter in the question's band:
 * the key terms solid, the supporting terms quiet. Each term is a pill, two controls
 * side by side and never one inside the other. A curator gets a toolbar in the
 * guide's family; a student gets none. Behaviour that predates the redesign —
 * click-to-insert, the add and remove, the plan's lock on the AI tools — is pinned
 * in keywordGrouping.test.tsx and studioGateConsistency.test.tsx.
 */

vi.mock('../../services/geminiService', () => ({}));

afterEach(cleanup);

const DOT_POINT =
  'Assess the risks and hazards of a fieldwork investigation, and the controls that manage them.';

/** EVALUATE is Tier 6, so a 6-mark question's ceiling is Band 6 (purple). */
const prompt = (keywords: string[]): Prompt =>
  ({
    id: 'p1',
    question: 'Evaluate the risks of the proposed fieldwork.',
    verb: 'EVALUATE' as PromptVerb,
    totalMarks: 6,
    keywords,
    linkedOutcomes: [],
    sampleAnswers: [],
    isPastHSC: false,
  }) as Prompt;

const KEY = ['risk', 'hazard', 'fieldwork'];
const SUPPORT = ['Likelihood', 'Mitigation', 'Consequence'];

interface Options {
  role?: UserRole;
  keywords?: string[];
  userAnswer?: string;
  onAddWord?: (word: string) => void;
  onKeywordsChange?: (keywords: string[]) => void;
}

const renderPanel = ({
  role = 'user',
  keywords = [...KEY, ...SUPPORT],
  userAnswer = '',
  onAddWord = vi.fn(),
  onKeywordsChange = vi.fn(),
}: Options = {}) =>
  render(
    <KeywordEditor
      prompt={prompt(keywords)}
      onKeywordsChange={onKeywordsChange}
      isEnriching={false}
      onRegenerate={vi.fn()}
      isRegenerating={false}
      regenerateError={null}
      onSuggest={vi.fn()}
      isSuggesting={false}
      suggestError={null}
      userRole={role}
      userAnswer={userAnswer}
      onAddWord={onAddWord}
      dotPointText={DOT_POINT}
    />
  );

const keyGroup = () => screen.getByRole('group', { name: /named in the question or syllabus/i });
const supportGroup = () => screen.getByRole('group', { name: /^supporting terms$/i });

/** A group's ladder row: the group is the body's child, the body the row's child. */
const rowOf = (group: HTMLElement): HTMLElement => group.parentElement!.parentElement!;

/** The gutter's figure as a reader sees it: "3/3". */
const figureOf = (row: HTMLElement): string =>
  row.querySelector('[class*="font-mono"]')?.textContent ?? '';

/** The pill that carries a term's text, and the button that is the term itself. */
const pillFor = (term: string): HTMLButtonElement =>
  screen.getByText(term).closest('button') as HTMLButtonElement;

describe('Syllabus Terms: two rows, each counted in its own gutter', () => {
  it('draws the key row solid and counts it: 3/3 Key terms, all used', () => {
    renderPanel({
      userAnswer: 'A risk and a hazard of the fieldwork, each assessed in turn.',
    });
    const row = rowOf(keyGroup());
    expect(figureOf(row)).toBe('3/3');
    expect(within(row).getByText('Key terms')).toBeTruthy();
    // The solid row is the band's own fill, the strongest of the ladder's rows.
    expect(row.className).toContain(LADDER_FILL);
    expect(row.className).not.toContain(LADDER_FILL_QUIET);
  });

  it('draws the supporting row quiet and counts it: 0/3 Supporting', () => {
    renderPanel({
      userAnswer: 'A risk and a hazard of the fieldwork, each assessed in turn.',
    });
    const row = rowOf(supportGroup());
    expect(figureOf(row)).toBe('0/3');
    expect(within(row).getByText('Supporting')).toBeTruthy();
    expect(row.className).toContain(LADDER_FILL_QUIET);
    expect(row.className).not.toContain(` ${LADDER_FILL} `);
  });

  it('colours both rows from the question’s ceiling band, never a literal', () => {
    const { container } = renderPanel();
    const config = getBandConfig(6);
    const key = rowOf(keyGroup());
    // The gutter is the band's solid ground; the figure is its solid ink.
    const gutter = key.firstElementChild as HTMLElement;
    const figure = gutter.querySelector('[class*="font-mono"]') as HTMLElement;
    expect(gutter.className).toContain('band-solid');
    expect(figure.className).not.toMatch(/text-(white|yellow-950)/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});

describe('Syllabus Terms: the pills', () => {
  it('shows a used key term covered: a tick, and the band’s deeper pastel', () => {
    renderPanel({ userAnswer: 'The risk is clear.' });
    const used = pillFor('risk');
    const frame = used.parentElement as HTMLElement;
    expect(used.querySelector('svg')).not.toBeNull();
    expect(frame.className).toContain(TERM_PILL_KEY_USED);
    expect(frame.className).not.toContain('band-solid');
  });

  it('leaves an unused term open: a dot, and no tick', () => {
    renderPanel({ userAnswer: 'The risk is clear.' });
    const open = pillFor('hazard');
    const frame = open.parentElement as HTMLElement;
    expect(open.querySelector('svg')).toBeNull();
    expect(open.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(frame.className).not.toContain('band-solid');
  });

  it('gives every pill a 44px touch target on a phone', () => {
    renderPanel();
    expect(TERM_PILL_MAIN).toContain('min-h-11');
    expect(TERM_PILL_MAIN).toContain('sm:min-h-8');
    expect(pillFor('risk').className).toContain('min-h-11');
  });

  it('gives a curator’s remove control a 44px target on a phone, both ways', () => {
    expect(TERM_PILL_REMOVE).toContain('min-w-11');
    expect(TERM_PILL_REMOVE).toContain('min-h-11');
    expect(TERM_PILL_REMOVE).toContain('sm:min-w-6');
    expect(TERM_PILL_REMOVE).toContain('sm:min-h-8');
  });

  it('never nests a control inside a control', () => {
    const { container } = renderPanel({ role: 'teacher' });
    expect(container.querySelectorAll('button button').length).toBe(0);
    // The remove control is a sibling of the term, not a child of it.
    const remove = screen.getByRole('button', { name: 'Remove risk' });
    expect(remove.parentElement).toBe(pillFor('risk').parentElement);
    expect(remove.className).toBe(TERM_PILL_REMOVE);
  });

  it('inserts a term on click, the same as the writing area’s insert', () => {
    const onAddWord = vi.fn();
    renderPanel({ onAddWord });
    fireEvent.click(pillFor('Mitigation'));
    expect(onAddWord).toHaveBeenCalledWith('Mitigation');
  });

  it('keeps the title that says which level names a key term', () => {
    renderPanel();
    expect(pillFor('risk')).toHaveProperty('title', 'Named in the question — a must-use term');
    expect(pillFor('Mitigation')).toHaveProperty(
      'title',
      'Supporting term — click to add it to your answer'
    );
  });
});

describe('Syllabus Terms: the toolbar, by role', () => {
  it('gives a student no toolbar at all', () => {
    renderPanel({ role: 'user' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add term' })).toBeNull();
    expect(screen.queryByTitle(/Suggest with AI/)).toBeNull();
    expect(screen.queryByTitle(/Regenerate all/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove risk' })).toBeNull();
  });

  it('gives a curator the add field, the add button, and the two AI tools', () => {
    renderPanel({ role: 'teacher' });
    const input = screen.getByRole('textbox', { name: 'New syllabus term' });
    expect(input.getAttribute('placeholder')).toBe('Add new term…');
    expect(input.className).toBe(LADDER_TOOL_INPUT);
    expect(screen.getByRole('button', { name: 'Add term' })).toBeTruthy();
    expect(screen.getByTitle(/Suggest with AI/)).toBeTruthy();
    expect(screen.getByTitle(/Regenerate all/)).toBeTruthy();
  });

  it('adds a term from the curator’s field', () => {
    const onKeywordsChange = vi.fn();
    renderPanel({ role: 'teacher', onKeywordsChange });
    const input = screen.getByRole('textbox', { name: 'New syllabus term' });
    fireEvent.change(input, { target: { value: 'Probability' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onKeywordsChange).toHaveBeenCalledWith([...KEY, ...SUPPORT, 'Probability']);
  });

  it('removes a term from its own remove control', () => {
    const onKeywordsChange = vi.fn();
    renderPanel({ role: 'teacher', onKeywordsChange });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mitigation' }));
    expect(onKeywordsChange).toHaveBeenCalledWith(
      [...KEY, ...SUPPORT].filter((kw) => kw !== 'Mitigation')
    );
  });

  it('does not let a student remove a term even by clicking the pill', () => {
    const onKeywordsChange = vi.fn();
    renderPanel({ role: 'user', onKeywordsChange });
    fireEvent.click(pillFor('Mitigation'));
    expect(onKeywordsChange).not.toHaveBeenCalled();
  });
});

describe('Syllabus Terms: the caption and the empty state', () => {
  it('carries one quiet caption that names the band the terms are for', () => {
    renderPanel();
    expect(screen.getByText('Weave the key terms into a Band 6 response.')).toBeTruthy();
  });

  it('gives an empty panel the guide’s empty well, and says what closes the gap for a curator', () => {
    renderPanel({ role: 'teacher', keywords: [] });
    expect(
      screen.getByText('No syllabus terms yet — add one above, or start with AI Suggest.')
    ).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('tells a student the empty panel is the teacher’s to fill', () => {
    renderPanel({ role: 'user', keywords: [] });
    expect(
      screen.getByText('No syllabus terms for this question yet. Your teacher can add them.')
    ).toBeTruthy();
  });
});
