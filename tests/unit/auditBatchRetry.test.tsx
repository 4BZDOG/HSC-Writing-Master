import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import * as geminiService from '../../services/geminiService';
import type { Course } from '../../types';

/**
 * Two things an admin does after the batch is built: pick up what a run
 * dropped, and select a run of rows without clicking each one.
 *
 * A batch of two hundred that ends "184 succeeded, 16 failed" used to leave the
 * failures recoverable only by reading a scrolling log and matching task
 * descriptions back to questions by eye. And a selection was one click per row,
 * on a screen whose whole job is running one action over a lot of content.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => false };
});

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof geminiService>();
  return { ...actual, screenContentQuality: vi.fn() };
});

const prompt = (id: string, question: string) => ({
  id,
  question,
  totalMarks: 4,
  verb: 'Explain',
  linkedOutcomes: ['FC-1'],
  keywords: [],
  markingCriteria: '4 marks: full\n3 marks: most\n1-2 marks: some',
  sampleAnswers: [],
});

const fixture: Course[] = [
  {
    id: 'c1',
    name: 'Retry Course',
    outcomes: [{ code: 'FC-1', description: 'An outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Retry Topic',
        subTopics: [
          {
            id: 'st1',
            name: 'Retry SubTopic',
            dotPoints: [
              {
                id: 'dp1',
                description: 'the first dot point',
                prompts: [prompt('pr1', 'Explain the first thing.')],
              },
              {
                id: 'dp2',
                description: 'the second dot point',
                prompts: [prompt('pr2', 'Explain the second thing.')],
              },
            ],
          },
        ],
      },
    ],
  },
] as unknown as Course[];

// One prompt, so the batch is a single task — `runBatchOperations` skips its
// pacing gap before the first call of a run, which keeps this test honest at
// real time rather than needing fake timers around a 1.5s sleep.
const onePromptFixture: Course[] = [
  {
    ...fixture[0],
    topics: [
      {
        ...fixture[0].topics[0],
        subTopics: [
          {
            ...fixture[0].topics[0].subTopics[0],
            dotPoints: [fixture[0].topics[0].subTopics[0].dotPoints[0]],
          },
        ],
      },
    ],
  },
] as unknown as Course[];

const renderStudio = (courses: Course[]) =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={courses}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
    />
  );

beforeEach(() => {
  vi.mocked(geminiService.screenContentQuality).mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Content Audit Studio — picking up what a run dropped', () => {
  it('offers the failures back as a retry, and clears it once they pass', async () => {
    // `screenContentQuality` swallows its own errors and returns null, which
    // the task turns into a failure — the same shape a rate limit takes.
    vi.mocked(geminiService.screenContentQuality)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ score: 72, notes: 'Reads well.' });

    renderStudio(onePromptFixture);
    fireEvent.click(screen.getByLabelText('Select Retry Course'));
    fireEvent.click(screen.getByText('Score Quality (1)'));

    const retry = await screen.findByRole(
      'button',
      { name: /retry failed \(1\)/i },
      { timeout: 15000 }
    );
    expect(retry).toBeTruthy();

    fireEvent.click(retry);

    // The second attempt succeeds, so there is nothing left to offer.
    await vi.waitFor(
      () => expect(screen.queryByRole('button', { name: /retry failed/i })).toBeNull(),
      { timeout: 15000 }
    );
    expect(geminiService.screenContentQuality).toHaveBeenCalledTimes(2);
  }, 40000);

  it('shows no retry when the run had no failures', async () => {
    vi.mocked(geminiService.screenContentQuality).mockResolvedValue({
      score: 72,
      notes: 'Reads well.',
    });

    renderStudio(onePromptFixture);
    fireEvent.click(screen.getByLabelText('Select Retry Course'));
    fireEvent.click(screen.getByText('Score Quality (1)'));

    await vi.waitFor(() => expect(geminiService.screenContentQuality).toHaveBeenCalled(), {
      timeout: 15000,
    });
    await vi.waitFor(
      () => expect(screen.queryByRole('button', { name: /score quality \(1\)/i })).toBeTruthy(),
      { timeout: 15000 }
    );
    expect(screen.queryByRole('button', { name: /retry failed/i })).toBeNull();
  }, 40000);
});

describe('Content Audit Studio — selecting a run of rows', () => {
  it('shift-clicking a second row takes everything on screen between the two', () => {
    renderStudio(fixture);
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

    fireEvent.click(screen.getByLabelText('Select the first dot point'));
    expect(screen.getByRole('button', { name: /clear selection \(2\)/i })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Select Explain the second thing.'), { shiftKey: true });

    // dp1 + pr1 + dp2 + pr2 — the two dot points and the questions under them,
    // and nothing above the anchor.
    expect(screen.getByRole('button', { name: /clear selection \(4\)/i })).toBeTruthy();
    expect(screen.getByText('2 dot points · 2 questions')).toBeTruthy();
  });

  it('never deselects: extending a selection can only add to it', () => {
    renderStudio(fixture);
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

    // Take the whole course, then shift-click a row inside it. Every row is
    // ticked at this point, so the control reads "Deselect …" — which is
    // exactly the click that would lose work if extending could subtract.
    fireEvent.click(screen.getByLabelText('Select Retry Course'));
    const all = screen.getByRole('button', { name: /clear selection \((\d+)\)/i }).textContent;

    fireEvent.click(screen.getByLabelText('Deselect the second dot point'), { shiftKey: true });
    expect(screen.getByRole('button', { name: /clear selection/i }).textContent).toBe(all);
  });

  it('falls back to a plain tick when there is no anchor to reach back to', () => {
    renderStudio(fixture);
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

    // A shift-click as the very first action has nothing to extend from, so it
    // behaves as an ordinary tick rather than selecting from the top of the
    // tree to here.
    fireEvent.click(screen.getByLabelText('Select the second dot point'), { shiftKey: true });
    expect(screen.getByRole('button', { name: /clear selection \(2\)/i })).toBeTruthy();
  });
});
