import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import * as geminiService from '../../services/geminiService';
import type { Course } from '../../types';

/**
 * "Low quality" detection: structural gaps are caught by the badges, but
 * content that EXISTS and is weak needs the AI pre-screen. These tests pin:
 * the Screen Quality batch action scores selected questions and stores the
 * result, and already-scored content is flagged (badge + filter chip) while
 * browsing.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof geminiService>();
  return {
    ...actual,
    screenContentQuality: vi.fn().mockResolvedValue({ score: 30, notes: 'Vague wording.' }),
  };
});

const makeFixture = (qualityScore?: number, qualityNotes?: string): Course[] =>
  [
    {
      id: 'c1',
      name: 'Screen Course',
      outcomes: [{ code: 'FC-1', description: 'An outcome' }],
      topics: [
        {
          id: 't1',
          name: 'Screen Topic',
          subTopics: [
            {
              id: 'st1',
              name: 'Screen SubTopic',
              dotPoints: [
                {
                  id: 'dp1',
                  description: 'explain a covered dot point',
                  prompts: [
                    {
                      id: 'pr1',
                      question: 'Explain the screening concept.',
                      totalMarks: 4,
                      verb: 'Explain',
                      linkedOutcomes: ['FC-1'],
                      keywords: [],
                      sampleAnswers: [],
                      ...(qualityScore !== undefined ? { qualityScore, qualityNotes } : {}),
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

const renderStudio = (courses: Course[], updateCourses = vi.fn()) => {
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={courses}
      updateCourses={updateCourses}
      showToast={vi.fn()}
    />
  );
  return updateCourses;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Content Audit Studio — AI quality screening', () => {
  it('scores every selected question and stores the result', async () => {
    const updateCourses = renderStudio(makeFixture());

    fireEvent.click(screen.getByLabelText('Select Screen Course'));
    const btn = screen.getByRole('button', { name: /screen quality \(1\)/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(
      () =>
        expect(geminiService.screenContentQuality).toHaveBeenCalledWith(
          'Explain the screening concept.',
          'question'
        ),
      { timeout: 8000 }
    );
    // The score is written back into local course data.
    await waitFor(() => expect(updateCourses).toHaveBeenCalled(), { timeout: 8000 });
  }, 30000);

  it('is disabled when the selection contains no questions', () => {
    renderStudio(makeFixture());
    const btn = screen.getByRole('button', { name: /screen quality \(0\)/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags already-scored low-quality content with a badge and filter chip', () => {
    renderStudio(makeFixture(32, 'Question is too vague to mark.'));

    // Filter chip counts it…
    expect(screen.getByText('Low Quality').closest('button')!.textContent).toContain('1');

    // …and the inline badge appears once the tree is expanded to the prompt.
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    const badge = screen.getByText('AI 32');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('title')).toBe('Question is too vague to mark.');
  });

  it('high-scoring content shows its badge but is NOT counted as low quality', () => {
    renderStudio(makeFixture(88, 'Strong question.'));
    expect(screen.getByText('Low Quality').closest('button')!.textContent).toContain('0');
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    expect(screen.getByText('AI 88')).toBeTruthy();
  });

  it('"Select All Filtered" targets low-quality content via the filter', () => {
    renderStudio(makeFixture(20));
    fireEvent.click(screen.getByText('Low Quality').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /select all filtered/i }));
    // One prompt selected → screening/regeneration actions light up for it.
    expect(screen.getByText('Screen Quality (1)')).toBeTruthy();
  });
});
