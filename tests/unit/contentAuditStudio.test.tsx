import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import { AI_MODELS } from '../../services/aiModels';
import type { Course } from '../../types';

/**
 * The audit studio's job is: make data-quality gaps visible while browsing,
 * and make the batch buttons say exactly what a click will do for the current
 * selection. These tests pin the gap badges, the selection-aware target
 * counts (including the combined Fix All Gaps), and the batch-engine picker.
 */

// One course, one topic, one sub-topic, two dot points:
//   dp-empty   → no questions at all
//   dp-full    → one prompt missing rubric + samples + outcomes
const fixture: Course[] = [
  {
    id: 'c1',
    name: 'Fixture Course',
    outcomes: [{ code: 'FC-1', description: 'A real outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Fixture Topic',
        subTopics: [
          {
            id: 'st1',
            name: 'Fixture SubTopic',
            dotPoints: [
              { id: 'dp-empty', description: 'describe an untouched dot point', prompts: [] },
              {
                id: 'dp-full',
                description: 'explain a covered dot point',
                prompts: [
                  {
                    id: 'pr1',
                    question: 'Explain the fixture concept.',
                    totalMarks: 4,
                    verb: 'Explain',
                    linkedOutcomes: [],
                    keywords: [],
                    sampleAnswers: [],
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

const renderStudio = () =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={fixture}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
    />
  );

const selectWholeCourse = () => {
  fireEvent.click(screen.getByLabelText('Select Fixture Course'));
};

afterEach(cleanup);

describe('ContentAuditModal — gap visibility and batch targeting', () => {
  it('shows inline gap badges without needing a filter', () => {
    renderStudio();
    // Tree renders collapsed below course level by default — expand down to prompts.
    fireEvent.click(screen.getByLabelText('Expand Fixture Topic'));
    fireEvent.click(screen.getByLabelText('Expand Fixture SubTopic'));
    fireEvent.click(screen.getByLabelText('Expand explain a covered dot point'));

    expect(screen.getByText('No Questions')).toBeTruthy(); // empty dot point
    expect(screen.getByText('No Rubric')).toBeTruthy();
    expect(screen.getByText('No Samples')).toBeTruthy();
    expect(screen.getByText('No Outcomes')).toBeTruthy();
  });

  it('annotates every action button with its true target count for the selection', () => {
    renderStudio();
    selectWholeCourse(); // cascades to all descendants

    expect(screen.getByText('Questions (1)')).toBeTruthy(); // 1 empty dot point
    expect(screen.getByText('Rubrics (1)')).toBeTruthy();
    expect(screen.getByText('Samples (1)')).toBeTruthy();
    expect(screen.getByText('Outcomes (1)')).toBeTruthy();
    expect(screen.getByText('Fix All Gaps (4)')).toBeTruthy(); // 1+1+1+1

    // No stored samples anywhere → recalibration has nothing to do and says so.
    const recal = screen.getByText('Recalibrate (0)').closest('button')!;
    expect((recal as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables all actions when nothing is selected', () => {
    renderStudio();
    expect(
      (screen.getByText('Fix All Gaps (0)').closest('button') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByText('Questions (0)').closest('button') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('offers every registered AI engine plus the app default for batch runs', () => {
    renderStudio();
    const select = screen.getByLabelText(/batch engine/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['default', ...AI_MODELS.map((m) => m.id)]);
    // Advanced users can switch it freely before a run.
    fireEvent.change(select, { target: { value: 'claude-sonnet' } });
    expect(select.value).toBe('claude-sonnet');
  });
});
