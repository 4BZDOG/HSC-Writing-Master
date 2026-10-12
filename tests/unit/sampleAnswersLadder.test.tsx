import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { MarkingGuidePanel } from '../../components/ReferenceMaterials';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { requestOpenExemplar } from '../../utils/ladderLink';
import {
  LADDER_CRITERION,
  LADDER_DISCLOSURE,
  LADDER_EDGE_SHUT,
  LADDER_GUTTER,
  LADDER_ROW,
} from '../../utils/ladderChrome';
import { getBandRgb } from '../../utils/renderUtils';
import { readSupportUsage, resetSupportEngagement } from '../../utils/supportEngagement';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * The two halves of the mark ladder, held together.
 *
 * The Marking Guide and the Sample Answers panel are two views of one ladder. Rendered
 * side by side from one prompt, a mark must draw the same gutter in both, the criterion
 * the note quotes must be the criterion the guide prints, and a guide row's "Model
 * answer" must open the matching level and focus it.
 */

vi.mock('../../services/geminiService', () => ({
  generateRubricForPrompt: vi.fn(),
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

const GUIDE = [
  '6 marks: Explains the membrane in detail, with a worked example',
  '5 marks: Explains the membrane with accurate examples',
  '4 marks: Explains the membrane with accurate detail',
  '3 marks: Describes the membrane with some accuracy',
  '2 marks: Identifies one feature of the membrane',
  '1 mark: Makes a general statement about the membrane',
].join('\n');

const sample = (mark: number, over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id: `s${mark}-${over.source ?? 'AI'}`,
    mark,
    band: mark,
    answer: `Model at ${mark}.`,
    source: 'AI',
    ...over,
  }) as SampleAnswer;

const makePrompt = (id: string, sampleAnswers: SampleAnswer[]): Prompt =>
  ({
    id,
    question: 'Explain how the cell membrane regulates transport.',
    verb: 'EXPLAIN' as PromptVerb,
    totalMarks: 6,
    keywords: [],
    markingCriteria: GUIDE,
    linkedOutcomes: [],
    sampleAnswers,
  }) as unknown as Prompt;

const TIER = getCommandTermInfo('EXPLAIN' as PromptVerb).tier;

const renderBoth = (prompt: Prompt, options: { defaultCollapsed?: boolean } = {}) =>
  render(
    <>
      <div data-testid="guide">
        <MarkingGuidePanel prompt={prompt} userRole="user" onMarkingCriteriaChange={vi.fn()} />
      </div>
      <div data-testid="samples">
        <SampleAnswersAccordion
          prompt={prompt}
          onSampleAnswerGenerated={vi.fn()}
          onDeleteSampleAnswer={vi.fn()}
          onUpdateSampleAnswer={vi.fn()}
          userRole="user"
          defaultCollapsed={options.defaultCollapsed ?? true}
        />
      </div>
    </>
  );

const guideToggle = () => screen.getByRole('button', { name: /^Marking Guide/ });
const samplesToggle = () => screen.getByRole('button', { name: /^Sample Answers/ });

/** A level's disclosure in the Sample Answers panel, by the mark it names first. */
const levelOf = (mark: number): HTMLElement =>
  within(screen.getByTestId('samples')).getByRole('button', {
    name: new RegExp(`^${mark}/6 marks`),
  });

/** The gutter of a row, by the first class it shares with every gutter. */
const gutterIn = (scope: HTMLElement, mark: string): HTMLElement => {
  const gutters = Array.from(
    scope.querySelectorAll<HTMLElement>(`[class*="${LADDER_GUTTER.split(' ')[0]}"]`)
  );
  // The figure's own text is the mark; its total ("/6") is a child of the figure.
  const found = gutters.find((g) => g.firstElementChild?.firstChild?.textContent === mark);
  if (!found) throw new Error(`no gutter for mark ${mark}`);
  return found;
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  resetSupportEngagement();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a mark draws the same gutter in the guide and in the exemplars', () => {
  const prompt = makePrompt('p-parity', [sample(5), sample(3), sample(1)]);

  it('gives mark 5 the same mark, caption, band and edge on both panels', () => {
    renderBoth(prompt, { defaultCollapsed: false });
    fireEvent.click(guideToggle());

    const guideGutter = gutterIn(screen.getByTestId('guide'), '5');
    const sampleGutter = gutterIn(screen.getByTestId('samples'), '5');
    // The gutter's text is the mark over the total, then the band beneath it.
    const band = getBandForMark(5, 6, TIER);
    expect(guideGutter.textContent).toBe(`5/6Band ${band}`);
    expect(sampleGutter.textContent).toBe(`5/6Band ${band}`);
    // The same classes, so the same width, radius, type and band wash.
    expect(sampleGutter.className).toBe(guideGutter.className);
    expect(sampleGutter.style.getPropertyValue('--band-rgb')).toBe(
      guideGutter.style.getPropertyValue('--band-rgb')
    );
    expect(sampleGutter.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(band));
  });

  it('gives the row the same edge and the same shape on both panels', () => {
    renderBoth(prompt, { defaultCollapsed: false });
    fireEvent.click(guideToggle());

    const guideRow = gutterIn(screen.getByTestId('guide'), '5').parentElement!;
    const sampleRow = levelOf(5).closest('[data-exemplar-row]') as HTMLElement;
    expect(guideRow.className).toContain(LADDER_ROW.split(' ')[0]);
    expect(sampleRow.className).toContain(LADDER_ROW.split(' ')[0]);
    expect(sampleRow.classList.contains(LADDER_EDGE_SHUT)).toBe(true);
    expect(guideRow.classList.contains(LADDER_EDGE_SHUT)).toBe(true);
    expect(sampleRow.className.split(' ').filter((c) => c.startsWith('rounded'))).toEqual(
      guideRow.className.split(' ').filter((c) => c.startsWith('rounded'))
    );
  });

  it('gives the two panels one header anatomy: the same title row height and icon tile', () => {
    renderBoth(prompt);
    const guideRow = guideToggle().parentElement!;
    const sampleRow = samplesToggle().parentElement!;
    expect(sampleRow.className).toContain(
      guideRow.className.split(' ').find((c) => c.startsWith('min-h-'))!
    );
    // Both are hero tiles, so both are the 40px tile.
    expect(samplesToggle().querySelector('.w-10')!.className).toBe(
      guideToggle().querySelector('.w-10')!.className
    );
  });
});

describe('the note quotes the criterion the guide prints for that mark', () => {
  it('quotes the same criterion as the guide row, word for word', () => {
    const prompt = makePrompt('p-quote', [sample(5)]);
    renderBoth(prompt, { defaultCollapsed: false });
    fireEvent.click(guideToggle());
    fireEvent.click(levelOf(5));

    // The criterion's words are split across spans where the command verb is marked, so
    // the comparison is of the whole criterion block, not of one text node.
    const guideBlock = Array.from(
      screen.getByTestId('guide').querySelectorAll<HTMLElement>(`[class="${LADDER_CRITERION}"]`)
    ).find((el) => el.textContent?.includes('with accurate examples'));
    const note = screen
      .getByRole('group', { name: 'Marking criterion' })
      .querySelector(`[class="${LADDER_CRITERION}"]`) as HTMLElement;
    expect(guideBlock).toBeTruthy();
    expect(note).toBeTruthy();
    expect(note.textContent).toBe(guideBlock!.textContent);
  });

  it('draws no note for a level the guide has no row for', () => {
    const prompt = makePrompt('p-none', [sample(4)]);
    prompt.markingCriteria = '6 marks: Explains the membrane in detail';
    renderBoth(prompt, { defaultCollapsed: false });
    fireEvent.click(levelOf(4));
    expect(screen.queryByRole('group', { name: 'Marking criterion' })).toBeNull();
  });
});

describe('a guide row’s "Model answer" opens the matching level here', () => {
  const prompt = makePrompt('p-cross', [sample(6), sample(4), sample(1)]);

  it('opens the panel, the level, and focuses its disclosure, from the guide’s own control', () => {
    renderBoth(prompt);
    fireEvent.click(guideToggle());
    expect(samplesToggle().getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 4 marks' }));

    expect(samplesToggle().getAttribute('aria-expanded')).toBe('true');
    expect(levelOf(4).getAttribute('aria-expanded')).toBe('true');
    expect(levelOf(6).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(levelOf(4));
  });

  it('brings the level into view, smoothly, unless the student asks for less motion', () => {
    renderBoth(prompt);
    fireEvent.click(guideToggle());
    fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 4 marks' }));
    const scroll = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('scrolls without animation when the student prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    try {
      renderBoth(prompt);
      fireEvent.click(guideToggle());
      fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 4 marks' }));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        behavior: 'auto',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records the panel as read, as it is when the student opens it themselves', () => {
    renderBoth(prompt);
    fireEvent.click(guideToggle());
    fireEvent.click(screen.getByRole('button', { name: 'See the model answer for 4 marks' }));
    expect(readSupportUsage('p-cross').opened).toContain('sampleAnswers');
  });

  it('opens the nearest level below a mark it has no exemplar for', () => {
    renderBoth(prompt);
    act(() => requestOpenExemplar('p-cross', 5));
    expect(levelOf(4).getAttribute('aria-expanded')).toBe('true');
    expect(samplesToggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the nearest level above when nothing sits below the mark', () => {
    renderBoth(prompt);
    act(() => requestOpenExemplar('p-cross', 0));
    expect(levelOf(1).getAttribute('aria-expanded')).toBe('true');
  });

  it('ignores a request for a question that is not on screen', () => {
    renderBoth(prompt);
    act(() => requestOpenExemplar('some-other-question', 4));
    expect(samplesToggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(document.body);
  });

  it('does nothing when the question has no exemplars at all', () => {
    renderBoth(makePrompt('p-empty', []));
    act(() => requestOpenExemplar('p-empty', 4));
    expect(samplesToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves focus where the student has gone once the cross-link has been acted on', () => {
    renderBoth(prompt);
    act(() => requestOpenExemplar('p-cross', 4));
    expect(document.activeElement).toBe(levelOf(4));
    // A later render with no new request does not pull focus back to the level.
    const other = samplesToggle();
    other.focus();
    fireEvent.click(levelOf(6));
    expect(document.activeElement).toBe(other);
  });
});

describe('the disclosure in a level is still a native button', () => {
  it('keeps the whole-body target the ladder names', () => {
    renderBoth(makePrompt('p-target', [sample(6)]), { defaultCollapsed: false });
    expect(levelOf(6).tagName).toBe('BUTTON');
    expect(levelOf(6).getAttribute('type')).toBe('button');
    for (const token of LADDER_DISCLOSURE.split(' ').filter((t) => t === 'p-3' || t === 'block')) {
      expect(levelOf(6).className).toContain(token);
    }
  });
});
