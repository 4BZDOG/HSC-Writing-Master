import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { KEYWORD_HIGHLIGHT_CLASS, VERB_HIGHLIGHT_CLASS } from '../../utils/renderUtils';
import { LADDER_SOLID } from '../../utils/ladderChrome';
import {
  SAMPLE_CRITERION_LABEL_FULL,
  SAMPLE_CRITERION_LABEL_SHORT,
  SAMPLE_CRITERION_LINK,
  SAMPLE_NOTE_TEXT,
  SAMPLE_PAGE,
  SAMPLE_PAGE_BAR,
  SAMPLE_ZONES,
} from '../../utils/sampleAnswerChrome';
import { getBandRgb } from '../../utils/renderUtils';
import { OPEN_CRITERION_EVENT, type OpenCriterionDetail } from '../../utils/ladderLink';
import type { Prompt, PromptVerb, SampleAnswer, UserRole } from '../../types';

/**
 * The open row is two labelled zones, read top to bottom: the answer on its paper, whose
 * head is the band's solid bar, and the marker's commentary on the desk outside the paper.
 * The marking criterion is no longer repeated inside the row: the paper's head carries a
 * jump to it in the Marking Guide. These hold the order, the labels (the commentary has
 * ONE), the separation between the answer and the commentary, the italics, and the
 * highlighting the commentary shares with the feedback.
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
  const disclosure = screen.getByRole('button', { name: new RegExp(`^${mark}/6 marks`) });
  fireEvent.click(disclosure);
  const row = disclosure.closest<HTMLElement>('[data-exemplar-row]')!;
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

describe('the open row is two labelled zones, in reading order', () => {
  it('names them answer and commentary, top to bottom, and no longer repeats the criterion', () => {
    const { row } = renderOpen({
      sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })],
    });
    const groups = within(row).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Model answer',
      "Marker's commentary",
    ]);
    expect(within(row).queryByRole('group', { name: 'Marking criterion' })).toBeNull();
    // The criterion's own words are the guide's to print, not the exemplar row's.
    expect(row.textContent).not.toContain('Explains the membrane with accurate detail');
    // Each zone's label is written on the zone itself, so it reads as a heading as well.
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
    expect(zone(row, "Marker's commentary").parentElement).toBe(column);
  });

  it('heads the paper with the band’s solid bar, "Model answer · 4/6"', () => {
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    const paper = zone(row, 'Model answer').querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    const bar = paper.firstElementChild as HTMLElement;
    expect(bar.className).toBe(`${SAMPLE_PAGE_BAR} ${LADDER_SOLID}`);
    expect(bar.textContent).toContain('Model answer');
    expect(bar.textContent).toContain('4/6');
    // The bar reads the band from the row, so it is the band's solid, not a fixed colour.
    expect(row.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(2));
  });

  it('takes the bar’s colour from the band of the mark: a different band, a different colour', () => {
    // EXPLAIN is tier 3: a 6/6 answer sits in a higher band than a 2/6 one.
    const both = [sample({ id: 'top', mark: 6 }), sample({ id: 'low', mark: 2 })];
    const top = renderOpen({ mark: 6, sampleAnswers: both }).row.style.getPropertyValue(
      '--band-rgb'
    );
    cleanup();
    const low = renderOpen({ mark: 2, sampleAnswers: both }).row.style.getPropertyValue(
      '--band-rgb'
    );
    expect(top).toMatch(/^\d+ \d+ \d+$/);
    expect(low).toMatch(/^\d+ \d+ \d+$/);
    expect(low).not.toBe(top);
  });
});

describe('the paper’s head jumps to the marking criterion in the Marking Guide', () => {
  const heard = (): { details: OpenCriterionDetail[]; stop: () => void } => {
    const details: OpenCriterionDetail[] = [];
    const listener = (e: Event) => details.push((e as CustomEvent<OpenCriterionDetail>).detail);
    window.addEventListener(OPEN_CRITERION_EVENT, listener);
    return { details, stop: () => window.removeEventListener(OPEN_CRITERION_EVENT, listener) };
  };

  it('offers "View marking criterion" on the bar, with the list-check glyph, named for the mark', () => {
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    const bar = (zone(row, 'Model answer').querySelector(`[class="${SAMPLE_PAGE}"]`) as HTMLElement)
      .firstElementChild as HTMLElement;
    const button = within(bar).getByRole('button', { name: 'View marking criterion for 4 marks' });
    expect(button.className).toBe(SAMPLE_CRITERION_LINK);
    // Two labels, one shown at a time by the head's width (index.css); the name is the aria-label.
    const full = button.querySelector(`.${SAMPLE_CRITERION_LABEL_FULL}`);
    const short = button.querySelector(`.${SAMPLE_CRITERION_LABEL_SHORT}`);
    expect(full?.textContent).toBe('View marking criterion');
    expect(short?.textContent).toBe('Criterion');
    expect(button.querySelector('svg.lucide-list-checks')).toBeTruthy();
    expect(button.getAttribute('type')).toBe('button');
  });

  it('asks the guide for the row at this mark, and nothing else', () => {
    const { row } = renderOpen({ sampleAnswers: [sample()] });
    const { details, stop } = heard();
    try {
      fireEvent.click(within(row).getByRole('button', { name: /view marking criterion/i }));
    } finally {
      stop();
    }
    expect(details).toEqual([{ promptId: 'p-zones', mark: 4 }]);
  });

  it('draws no jump when the guide has no row for the level', () => {
    const { row } = renderOpen({
      mark: 4,
      sampleAnswers: [sample()],
      markingCriteria: '6 marks: Explains the membrane in detail',
    });
    expect(within(row).queryByRole('button', { name: /view marking criterion/i })).toBeNull();
  });

  it('keeps the jump on a locked exemplar too: the criterion is the same', () => {
    const { row } = renderOpen({
      sampleAnswers: [sample({ answer: '', withheld: true })],
    });
    expect(within(row).getByRole('button', { name: /view marking criterion/i })).toBeTruthy();
  });
});

describe('the marker’s commentary has one label, and is read in italics', () => {
  it('names the commentary once: the feedback has no label of its own, and the tip keeps its own', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const commentary = zone(row, "Marker's commentary");
    expect(within(commentary).getAllByText("Marker's commentary")).toHaveLength(1);
    // No second heading for the same thing: no "Feedback" label beside the zone label.
    expect(within(commentary).queryByText('Feedback')).toBeNull();
    // The Coach's Tip is a different thing, so it is named.
    expect(within(commentary).getAllByText("Coach's Tip")).toHaveLength(1);
    // The fold toggle still reads Hide/Show Feedback.
    expect(within(commentary).getByRole('button', { name: 'Hide Feedback' })).toBeTruthy();
  });

  it('puts the feedback directly under the one label, and the tip after it', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const commentary = zone(row, "Marker's commentary");
    const feedback = commentary.querySelector<HTMLElement>('[data-note="feedback"]')!;
    const tip = commentary.querySelector<HTMLElement>('[data-note="tip"]')!;
    const label = within(commentary).getByText("Marker's commentary");
    expect(feedback.textContent).toBe(FEEDBACK);
    expect(label.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(feedback.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('italicises the feedback and the tip, and keeps the answer upright', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const commentary = zone(row, "Marker's commentary");
    expect(SAMPLE_NOTE_TEXT).toContain('italic');
    const feedback = commentary.querySelector<HTMLElement>('[data-note="feedback"]')!;
    expect(feedback.classList.contains('italic')).toBe(true);
    const tipText = commentary.querySelector<HTMLElement>('[data-note="tip"] .italic')!;
    expect(tipText.textContent).toContain('Explain how the membrane controls transport');
    const paper = zone(row, 'Model answer').querySelector<HTMLElement>(`[class="${SAMPLE_PAGE}"]`)!;
    expect(paper.querySelector('.italic')).toBeNull();
  });

  it('shows a commentary with only a tip, labelled once, and one with only feedback', () => {
    const tipOnly = renderOpen({ sampleAnswers: [sample({ quickTip: TIP })] });
    const tipCommentary = zone(tipOnly.row, "Marker's commentary");
    expect(tipCommentary.querySelector('[data-note="feedback"]')).toBeNull();
    expect(within(tipCommentary).getAllByText("Marker's commentary")).toHaveLength(1);
    cleanup();
    const feedbackOnly = renderOpen({ sampleAnswers: [sample({ feedback: FEEDBACK })] });
    const feedbackCommentary = zone(feedbackOnly.row, "Marker's commentary");
    expect(feedbackCommentary.querySelector('[data-note="tip"]')).toBeNull();
    expect(within(feedbackCommentary).queryByText("Coach's Tip")).toBeNull();
  });
});

describe('the answer and the commentary are kept apart', () => {
  it('holds the answer and the commentary as siblings, neither inside the other', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP, feedback: FEEDBACK })] });
    const answer = zone(row, 'Model answer');
    const commentary = zone(row, "Marker's commentary");
    expect(answer.contains(commentary)).toBe(false);
    expect(commentary.contains(answer)).toBe(false);
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

describe('the commentary highlights the verb and the terms, and keeps them legible in italics', () => {
  it('highlights the command verb and the syllabus term in the Coach’s Tip', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ quickTip: TIP })] });
    const tipNote = zone(row, "Marker's commentary").querySelector<HTMLElement>(
      '[data-note="tip"]'
    )!;
    expect(highlighted(tipNote, VERB_HIGHLIGHT_CLASS)).toEqual(['Explain']);
    expect(highlighted(tipNote, KEYWORD_HIGHLIGHT_CLASS)).toContain('membrane');
  });

  it('highlights the verb and the terms in the feedback the same way', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ feedback: FEEDBACK })] });
    const feedback = zone(row, "Marker's commentary").querySelector<HTMLElement>(
      '[data-note="feedback"]'
    )!;
    expect(highlighted(feedback, VERB_HIGHLIGHT_CLASS)).toEqual(['Explain']);
    expect(highlighted(feedback, KEYWORD_HIGHLIGHT_CLASS)).toContain('membrane');
  });

  it('keeps the highlights inside the italic run, in the sans face that has a real italic at their weight', () => {
    const { row } = renderOpen({ sampleAnswers: [sample({ feedback: FEEDBACK })] });
    const feedback = zone(row, "Marker's commentary").querySelector<HTMLElement>(
      '[data-note="feedback"]'
    )!;
    const term = Array.from(feedback.querySelectorAll('span')).find(
      (n) => n.getAttribute('class') === KEYWORD_HIGHLIGHT_CLASS
    )!;
    expect(term.closest('.italic')).toBe(feedback);
    // The highlights set their own weight, never a font family, so they inherit the note's
    // sans face: Inter carries a real italic at every weight, where Newsreader's regular
    // italic would drop a semibold term back to regular.
    expect(KEYWORD_HIGHLIGHT_CLASS).toContain('font-semibold');
    expect(feedback.className).not.toContain('font-serif');
    expect(term.className).not.toContain('not-italic');
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
    expect(within(answer).getByRole('button', { name: /upgrade to band 6 plus/i })).toBeTruthy();
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
