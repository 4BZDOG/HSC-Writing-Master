import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import * as contributionService from '../../services/contributionService';
import type { Course } from '../../types';

/**
 * The audit studio's repairs land in local storage first; in remote mode the
 * admin pushes them to the shared Supabase library through the sanctioned
 * contribution write path, as `pending` — the review queue stays the only
 * road to `approved`. These tests pin that loop: a batch repair queues the
 * touched prompt in the outbox, syncing pushes prompt + samples with status
 * 'pending', and success empties the outbox.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

vi.mock('../../services/contributionService', async (importOriginal) => {
  const actual = await importOriginal<typeof contributionService>();
  return {
    ...actual,
    savePromptContribution: vi.fn().mockResolvedValue('uuid-prompt'),
    saveSampleAnswerContribution: vi.fn().mockResolvedValue('uuid-answer'),
  };
});

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    generateRubricForPrompt: vi.fn().mockResolvedValue('Criteria\n4 marks: excellent'),
  };
});

const fixture: Course[] = [
  {
    id: 'c1',
    name: 'Sync Course',
    outcomes: [{ code: 'FC-1', description: 'An outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Sync Topic',
        subTopics: [
          {
            id: 'st1',
            name: 'Sync SubTopic',
            dotPoints: [
              {
                id: 'dp1',
                description: 'explain a covered dot point',
                prompts: [
                  {
                    id: 'pr1',
                    question: 'Explain the sync concept.',
                    totalMarks: 4,
                    verb: 'Explain',
                    linkedOutcomes: ['FC-1'],
                    keywords: ['sync'],
                    scenario: 'A scenario long enough to count as enriched.',
                    sampleAnswers: [
                      {
                        id: 'sa1',
                        band: 3,
                        mark: 3,
                        answer:
                          'A sample answer that is comfortably longer than thirty characters.',
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
] as unknown as Course[];

afterEach(cleanup);

describe('Content Audit Studio — sync repairs to the shared library', () => {
  it('queues repaired prompts and pushes them (with samples) as pending contributions', async () => {
    render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={vi.fn()}
      />
    );

    // Nothing repaired yet → no sync button even in remote mode.
    expect(screen.queryByRole('button', { name: /sync to library/i })).toBeNull();

    // Repair the prompt's rubric (it has none) via a real batch run.
    fireEvent.click(screen.getByLabelText('Select Sync Course'));
    fireEvent.click(screen.getByText('Rubrics (1)'));

    // The batch has a 1.5s pre-task delay; wait for the outbox to fill.
    const syncBtn = await screen.findByRole(
      'button',
      { name: /sync to library \(1\)/i },
      { timeout: 8000 }
    );
    expect(contributionService.savePromptContribution).not.toHaveBeenCalled();

    // Push to the shared library.
    fireEvent.click(syncBtn);
    await waitFor(
      () =>
        expect(contributionService.savePromptContribution).toHaveBeenCalledWith(
          'dp1',
          expect.objectContaining({ id: 'pr1' }),
          'pending'
        ),
      { timeout: 8000 }
    );
    // Its sample answers ride along, also pending.
    await waitFor(() =>
      expect(contributionService.saveSampleAnswerContribution).toHaveBeenCalledWith(
        'pr1',
        expect.objectContaining({ id: 'sa1' }),
        'pending'
      )
    );

    // Outbox drained on success → button disappears.
    await waitFor(
      () => expect(screen.queryByRole('button', { name: /sync to library/i })).toBeNull(),
      { timeout: 8000 }
    );
  }, 30000);

  it('keeps failed pushes in the outbox for retry', async () => {
    vi.mocked(contributionService.savePromptContribution).mockRejectedValueOnce(
      new Error('You must be signed in to contribute content.')
    );

    render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Select Sync Course'));
    fireEvent.click(screen.getByText('Rubrics (1)'));
    const syncBtn = await screen.findByRole(
      'button',
      { name: /sync to library \(1\)/i },
      { timeout: 8000 }
    );

    fireEvent.click(syncBtn);
    await waitFor(
      () => expect(contributionService.savePromptContribution).toHaveBeenCalledTimes(1),
      { timeout: 8000 }
    );

    // The failed item is still queued — the button remains with count 1.
    await waitFor(
      () =>
        expect(screen.queryByRole('button', { name: /sync to library \(1\)/i })).not.toBeNull(),
      { timeout: 8000 }
    );
  }, 30000);
});
