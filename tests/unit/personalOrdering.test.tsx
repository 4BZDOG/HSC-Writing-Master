import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { fetchMyAttempts, AttemptSummary } from '../../services/responseService';
import {
  mostRecentAttempt,
  suggestNextQuestion,
  AttemptRecord,
} from '../../utils/personalOrdering';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * Every other move in the volume strategy makes a long list easier to READ.
 * Personal ordering is the only one that makes it shorter for THIS reader, and
 * it costs them nothing to set: the marks were already being stored, and
 * nothing read them back into the picker.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

vi.mock('../../services/responseService', () => ({
  fetchMyAttempts: vi.fn(),
}));

const mockFetch = vi.mocked(fetchMyAttempts);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

// --- The rule ---------------------------------------------------------------

const q = (id: string, tier: number, marks: number) => ({ id, tier, marks });

const attempt = (mark: number | null, at: string): AttemptRecord => ({
  mark,
  band: null,
  attemptedAt: at,
});

describe('choosing the next question', () => {
  const ladder = [q('t2a', 2, 3), q('t3a', 3, 4), q('t4a', 4, 6), q('t4b', 4, 8), q('t5a', 5, 8)];

  it('says nothing at all until there is a history to speak from', () => {
    expect(suggestNextQuestion(ladder, new Map())).toBeNull();
  });

  it('steps up a tier after a solid result', () => {
    const attempts = new Map([['t3a', attempt(3, '2026-05-01')]]); // 3/4 = 75%
    const suggestion = suggestNextQuestion(ladder, attempts);
    expect(suggestion).toMatchObject({ reason: 'step-up', fromTier: 3 });
    // The gentler of the two tier-4 questions — same rung, less writing.
    expect(suggestion?.id).toBe('t4a');
  });

  it('stays at the same tier after a shaky one', () => {
    // 1/4 is not an argument for a harder question.
    const attempts = new Map([['t3a', attempt(1, '2026-05-01')]]);
    expect(suggestNextQuestion(ladder, attempts)).toMatchObject({
      reason: 'consolidate',
      fromTier: 3,
    });
  });

  it('treats an unscored attempt as not yet demonstrated', () => {
    const attempts = new Map([['t3a', attempt(null, '2026-05-01')]]);
    expect(suggestNextQuestion(ladder, attempts)?.reason).toBe('consolidate');
  });

  it('never points at a question that already has a mark on it', () => {
    const attempts = new Map([
      ['t3a', attempt(4, '2026-05-01')],
      ['t4a', attempt(5, '2026-05-02')],
      ['t4b', attempt(7, '2026-05-03')],
    ]);
    // Last result was a strong 7/8 at tier 4, so tier 5 — and both tier-4
    // questions are spent anyway.
    expect(suggestNextQuestion(ladder, attempts)?.id).toBe('t5a');
  });

  it('reads the most recent attempt, not the first one it finds', () => {
    const attempts = new Map([
      ['t4b', attempt(8, '2026-05-09')],
      ['t2a', attempt(1, '2026-05-10')],
    ]);
    // The later, weaker tier-2 attempt is the one that counts.
    expect(mostRecentAttempt(ladder, attempts)?.question.id).toBe('t2a');
    expect(suggestNextQuestion(ladder, attempts)).toMatchObject({
      reason: 'consolidate',
      fromTier: 2,
    });
  });

  it('offers the nearest rung down rather than nothing', () => {
    const attempts = new Map([['t5a', attempt(8, '2026-05-01')]]);
    // A step up from tier 5 wants tier 6, and there is none — so the closest
    // unattempted question below it, because silence is not an answer.
    expect(suggestNextQuestion(ladder, attempts)?.id).toBe('t4a');
  });

  it('falls silent once every question here is answered', () => {
    const attempts = new Map(ladder.map((item) => [item.id, attempt(5, '2026-05-01')]));
    expect(suggestNextQuestion(ladder, attempts)).toBeNull();
  });
});

// --- The picker -------------------------------------------------------------

const makePrompt = (id: string, question: string, verb: string, totalMarks: number): Prompt =>
  ({ id, question, verb: verb as PromptVerb, totalMarks }) as Prompt;

const prompts: Prompt[] = [
  makePrompt('p1', 'Identify two input devices.', 'IDENTIFY', 2),
  makePrompt('p2', 'Outline the fetch-execute cycle.', 'OUTLINE', 3),
  makePrompt('p3', 'Describe the role of a compiler.', 'DESCRIBE', 4),
  makePrompt('p4', 'Explain how caching reduces latency.', 'EXPLAIN', 5),
  makePrompt('p5', 'Analyse the impact of automation.', 'ANALYSE', 6),
  makePrompt('p6', 'Assess the value of automated testing.', 'ASSESS', 8),
  makePrompt('p7', 'Evaluate the merits of agile delivery.', 'EVALUATE', 9),
];

const courses: Course[] = [
  {
    id: 'c1',
    name: 'Software Engineering',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Programming for the Web',
        subTopics: [
          {
            id: 's1',
            name: 'Web Systems',
            dotPoints: [{ id: 'd1', description: 'Explore web programming.', prompts }],
          },
        ],
      },
    ],
  },
];

const statePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
};

const noop = vi.fn();

const props = {
  courses,
  statePath,
  onPathChange: noop,
  onAddCourse: noop,
  onAddSubTopic: noop,
  onGeneratePrompt: noop,
  onManualEntry: noop,
  onEditOutcomes: noop,
  onOpenDataManager: noop,
  onRenameItem: noop,
  onDeleteItem: noop,
  onAddTopicFromSyllabus: noop,
  onAddTopicWithContent: noop,
  onGenerateDotPoints: noop,
  onImportTopic: noop,
  onImportSyllabus: noop,
  newlyAddedIds: new Set<string>(),
  userRole: 'user' as const,
};

const summary = (promptId: string, mark: number, at: string): AttemptSummary => ({
  promptId,
  mark,
  band: null,
  attemptedAt: at,
});

/**
 * Renders and opens the question list. The picker paints impersonally first and
 * personalises when the marks arrive, so every assertion below is an async
 * `findBy` against the SECOND paint.
 */
const renderPicker = async (attempts: [string, AttemptSummary][]): Promise<HTMLElement> => {
  mockFetch.mockResolvedValue(new Map(attempts));
  render(<PromptSelector {...props} />);
  fireEvent.click(screen.getByText('Select Question...').closest('button') as HTMLElement);
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  return screen.getByRole('listbox');
};

/**
 * The group headings, in order, as the open list currently shows them.
 *
 * Read off the group's `aria-label` rather than the visible heading's text: the
 * runs are real ARIA groups and the label is the authoritative string, while
 * the heading a sighted reader sees is `aria-hidden` decoration of it.
 */
const headings = (list: HTMLElement): string[] =>
  within(list)
    .getAllByRole('group')
    .map((g) => g.getAttribute('aria-label') ?? '');

describe('the question picker, once it knows how the reader went', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Map());
  });

  it('carries on exactly as before when there is no history', async () => {
    const list = await renderPicker([]);

    expect(within(list).queryByText(/Suggested next/)).toBeNull();
    expect(within(list).queryByText(/You: /)).toBeNull();
    expect(screen.queryByRole('button', { name: /not yet attempted/i })).toBeNull();
  });

  it('puts the reader’s own mark on a question they have answered', async () => {
    const list = await renderPicker([['p3', summary('p3', 3, '2026-05-01')]]);

    const mark = await within(list).findByText('You: 3/4');
    expect(mark.closest('li')?.textContent).toMatch(/role of a compiler/i);
  });

  it('leads with one step on, and says why', async () => {
    // 3/4 on a tier-2 Describe is solid, so the ladder moves up.
    const list = await renderPicker([['p3', summary('p3', 3, '2026-05-01')]]);

    await within(list).findByText(/Suggested next/);
    expect(headings(list)[0]).toMatch(/Suggested next · one step on from Define/i);

    // The suggestion is the first row, and it appears once — a question in two
    // groups at once would read as a bug.
    const rows = within(list).getAllByRole('option');
    expect(rows[0].textContent).toMatch(/caching reduces latency/i);
    expect(within(list).getAllByText(/caching reduces latency/i)).toHaveLength(1);
  });

  it('offers more practice at the same tier after a weak result', async () => {
    const list = await renderPicker([['p5', summary('p5', 1, '2026-05-01')]]);

    await within(list).findByText(/Suggested next/);
    expect(headings(list)[0]).toMatch(/Suggested next · more practice at Analyse/i);
  });

  it('can hide what has already been answered, and says it is doing so', async () => {
    const list = await renderPicker([
      ['p1', summary('p1', 2, '2026-05-01')],
      ['p3', summary('p3', 3, '2026-05-02')],
    ]);
    await within(list).findByText('You: 2/2');

    fireEvent.click(screen.getByRole('button', { name: /refine/i }));
    fireEvent.click(await screen.findByRole('button', { name: /not yet attempted/i }));

    expect(screen.getByText('5 of 7 shown')).toBeTruthy();
    expect(within(list).queryByText(/two input devices/i)).toBeNull();
  });
});
