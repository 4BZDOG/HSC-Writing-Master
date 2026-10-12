import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { KEYWORD_HIGHLIGHT_CLASS, VERB_HIGHLIGHT_CLASS } from '../../utils/renderUtils';
import { LADDER_EDGE_OPEN } from '../../utils/ladderChrome';
import { SAMPLE_PAGE, SAMPLE_ZONES } from '../../utils/sampleAnswerChrome';
import type { Prompt, PromptVerb, SampleAnswer, UserRole } from '../../types';

/**
 * The open row is three labelled zones, read top to bottom: the criterion that earns
 * the mark, the answer on its paper, and the marker's commentary on the desk outside
 * the paper. These hold the order, the labels, the separation between the answer and
 * the commentary, and the highlighting the commentary now shares with the feedback.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));

const GUIDE = [
  '6 marks: Explains the membrane in detail, with a worked example',
  '4 marks: Explains the membrane with accurate detail',
  '2 marks: Identifies one feature of the membrane',
].join('\n');

const ANSWER = 'The membrane controls transport across the cell.';
const TIP = 'Explain how the membrane controls transport, then link it to the question.';
const FEEDBACK = 'Explain the membrane with accurate detail.';

const sample = (over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({ id: 's4', answer: ANSWER, mark: 4, band: 2, source: 'AI', ...over }) as SampleAnswer;

interface OpenOptions {
  sampleAnswers: SampleAnswer[];
  mark?: number;
  markingCriteria?: string;
  keywords?: string[];
  verb?: PromptVerb;
  userRole?: UserRole;
  onUseSampleAnswer?: (text: string) => void;
}

/** Renders the panel open, with the level at `mark` opened. */
const renderOpen = (options: OpenOptions) => {
  const prompt = {
    id: 'p-zones',
    question: 'Explain how the cell membrane regulates transport.',
    verb: options.verb ?? ('EXPLAIN' as PromptVerb),
    totalMarks: 6,
    keywords: options.keywords ?? ['membrane'],
    markingCriteria: options.markingCriteria ?? GUIDE,
    sampleAnswers: options.sampleAnswers,
  } as unknown as Prompt;
  const { container } = render(
    <SampleAnswersAccordion
      prompt={prompt}
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      onUseSampleAnswer={options.onUseSampleAnswer}
      userRole={options.userRole ?? 'user'}
      defaultCollapsed={false}
    />
  );
  const mark = options.mark ?? 4;
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${mark}/6 marks`) }));
  const row = container.querySelector<HTMLElement>('[data-exemplar-row]')!;
  return { container, row };
};

/** A zone of the open row, by the label it is named with. */
const zone = (row: HTMLElement, name: string): HTMLElement =>
  within(row).getByRole('group', { name });

/** The highlighted runs of a class inside a root, as their text. */
const highlighted = (root: ParentNode, className: string): string[] =>
  Array.from(root.querySelectorAll('span'))
    .filter((n) => n.getAttribute('class') === className)
    .map((n) => n.textContent ?? '');

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the open row is three labelled zones, in reading order', () => {
  it('names them criterion, answer and commentary, top to bottom', () => {
    const { row } = renderOpen({
      sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })],
    });
    const groups = within(row).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Marking criterion',
      'Model answer',
      "Marker's commentary",
    ]);
    // Each zone's label is written on the zone itself, so it reads as a heading as well.
    expect(zone(row, 'Marking criterion').textContent).toContain('Marking criterion');
    expect(zone(row, 'Model answer').textContent).toContain('Model answer');
    expect(zone(row, "Marker's commentary").textContent).toContain("Marker's commentary");
  });

  it('stacks the zones in one column with sixteen pixels between them', () => {
    const { row } = renderOpen({
      sampleAnswers: [sample({ quickTip: TIP })],
    });
    expect(SAMPLE_ZONES).toContain('gap-4');
    const column = zone(row, 'Model answer').parentElement!;
    expect(column.className).toBe(SAMPLE_ZONES);
    expect(zone(row, 'Marking criterion').parentElement).toBe(column);
    expect(zone(row, "Marker's commentary").parentElement).toBe(column);
  });

  it('gives the criterion zone the strong band edge, as the guide’s own row has', () => {
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    expect(zone(row, 'Marking criterion').classList.contains(LADDER_EDGE_OPEN)).toBe(true);
  });
});

describe('the answer and the commentary are kept apart', () => {
  it('holds the answer and the commentary as siblings, neither inside the other', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const answer = zone(row, 'Model answer');
    const commentary = zone(row, "Marker's commentary");
    const criterion = zone(row, 'Marking criterion');
    expect(answer.contains(commentary)).toBe(false);
    expect(commentary.contains(answer)).toBe(false);
    expect(criterion.contains(answer)).toBe(false);
    expect(criterion.contains(commentary)).toBe(false);
  });

  it('puts the exemplar on the paper, and keeps the notes off it', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const answer = zone(row, 'Model answer');
    const paper = answer.querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    expect(paper).toBeTruthy();
    expect(paper.textContent).toContain(ANSWER);
    expect(paper.textContent).not.toContain(TIP);
    expect(paper.textContent).not.toContain(FEEDBACK);
    const commentary = zone(row, "Marker's commentary");
    expect(commentary.querySelector(`[class="${SAMPLE_PAGE}"]`)).toBeNull();
    expect(commentary.textContent).toContain(TIP);
    expect(commentary.textContent).toContain(FEEDBACK);
    expect(commentary.textContent).not.toContain(ANSWER);
  });

  it('keeps the metrics and the actions on the paper’s own foot, not in the commentary', () => {
    const { row } = renderOpen({
      userRole: 'teacher',
      onUseSampleAnswer: vi.fn(),
      sampleAnswers: [sample({ quickTip: TIP })],
    });
    const paper = zone(row, 'Model answer').querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    expect(within(paper).getByRole('button', { name: /^copy$/i })).toBeTruthy();
    expect(
      within(zone(row, "Marker's commentary")).queryByRole('button', { name: /^copy$/i })
    ).toBeNull();
  });

  it('labels the paper with its length and its source, on its own top bar', () => {
    const { row } = renderOpen({
      sampleAnswers: [sample({ answer: 'Five words in this one.', source: 'USER' })],
    });
    const paper = zone(row, 'Model answer').querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    const bar = paper.firstElementChild as HTMLElement;
    expect(within(bar).getByText('Model answer')).toBeTruthy();
    expect(within(bar).getByText('5 words')).toBeTruthy();
    expect(within(bar).getByText('Student')).toBeTruthy();
    // The source moved out of the header, so it is named once, on the paper.
    expect(within(row).getAllByText('Student')).toHaveLength(1);
  });

  it('omits the commentary when neither note was written', () => {
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    expect(within(row).queryByRole('group', { name: "Marker's commentary" })).toBeNull();
  });
});

describe('the criterion zone and the commentary highlight the verb and the terms', () => {
  it('highlights the command verb and the syllabus term in the Coach’s Tip', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP })] });
    const tipNote = within(zone(row, "Marker's commentary"))
      .getByText("Coach's Tip")
      .closest('.border-l-2') as HTMLElement;
    expect(highlighted(tipNote, VERB_HIGHLIGHT_CLASS)).toEqual(['Explain']);
    expect(highlighted(tipNote, KEYWORD_HIGHLIGHT_CLASS)).toContain('membrane');
  });

  it('highlights the verb and the terms in the Feedback the same way', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ feedback: FEEDBACK })] });
    const feedbackNote = within(zone(row, "Marker's commentary"))
      .getByText('Feedback')
      .closest('.border-l-2') as HTMLElement;
    expect(highlighted(feedbackNote, VERB_HIGHLIGHT_CLASS)).toEqual(['Explain']);
    expect(highlighted(feedbackNote, KEYWORD_HIGHLIGHT_CLASS)).toContain('membrane');
  });

  it('highlights the verb in the criterion the guide states for the level', () => {
    const { row } = renderOpen({
      mark: 4,
      sampleAnswers: [sample()],
      markingCriteria: '4 marks: Explains the membrane with accurate detail',
    });
    const criterion = zone(row, 'Marking criterion');
    expect(highlighted(criterion, VERB_HIGHLIGHT_CLASS)).toEqual(['Explains']);
  });
});

describe('a locked exemplar keeps its card in the answer zone, and shows no commentary', () => {
  it('shows the lock on the paper, and nothing of the commentary', () => {
    const { row } = renderOpen({
      userRole: 'teacher',
      sampleAnswers: [
        sample({
          answer: '',
          withheld: true,
          quickTip: 'Hidden tip.',
          feedback: 'Hidden feedback.',
        }),
      ],
    });
    const answer = zone(row, 'Model answer');
    expect(within(answer).getByText('Locked')).toBeTruthy();
    expect(answer.textContent).toMatch(/A Band \d exemplar at 4\/6/);
    expect(within(answer).getByRole('button', { name: /unlock with/i })).toBeTruthy();
    expect(within(row).queryByRole('group', { name: "Marker's commentary" })).toBeNull();
    expect(row.textContent).not.toContain('Hidden tip.');
    expect(row.textContent).not.toContain('Hidden feedback.');
  });
});

describe('the exemplar selector is a tablist, and the paper is its panel', () => {
  const three = [
    sample({ id: 'a', source: 'HSC_EXEMPLAR', answer: 'One two three.' }),
    sample({ id: 'b', source: 'USER', answer: 'Four five six.' }),
    sample({ id: 'c', source: 'AI', answer: 'Seven eight nine.' }),
  ];

  it('keeps only the selected tab in the tab order', () => {
    const { row } = renderOpen({ sampleAnswers: three });
    const tabs = within(zone(row, 'Model answer')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('moves the selection and the focus with the arrow keys, Home and End', () => {
    const { row } = renderOpen({ sampleAnswers: three });
    const tablist = within(zone(row, 'Model answer')).getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[2]);

    // Past the last tab, the arrow wraps to the first.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('names the paper as the panel of the selected tab', () => {
    const { row } = renderOpen({ sampleAnswers: three });
    const tabs = within(zone(row, 'Model answer')).getAllByRole('tab');
    const paper = zone(row, 'Model answer').querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    expect(paper.getAttribute('role')).toBe('tabpanel');
    expect(paper.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    fireEvent.click(tabs[1]);
    expect(paper.getAttribute('aria-labelledby')).toBe(tabs[1].id);
    expect(paper.textContent).toContain('Four five six.');
  });

  it('keeps the "more" fold outside the tablist, which owns only its tabs', () => {
    const many = [1, 2, 3, 4, 5].map((n) => sample({ id: `m${n}`, answer: `Exemplar ${n}.` }));
    const { row } = renderOpen({ sampleAnswers: many });
    const tablist = within(zone(row, 'Model answer')).getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(4);
    const more = within(zone(row, 'Model answer')).getByRole('button', { name: /\+1 more/i });
    expect(tablist.contains(more)).toBe(false);
  });
});

describe('copying the exemplar says "Copied" only when the browser did copy it', () => {
  const stubClipboard = (writeText: (text: string) => Promise<void>) => {
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  };

  it('says "Copied" once the clipboard has taken the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    const copy = within(zone(row, 'Model answer')).getByRole('button', { name: /^copy$/i });
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalledWith(ANSWER);
    expect(copy.textContent).toContain('Copied');
  });

  it('leaves the label alone, and raises nothing, when the browser refuses the clipboard', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    stubClipboard(writeText);
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    const copy = within(zone(row, 'Model answer')).getByRole('button', { name: /^copy$/i });
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalled();
    expect(copy.textContent).not.toContain('Copied');
    expect(copy.textContent).toContain('Copy');
  });
});
