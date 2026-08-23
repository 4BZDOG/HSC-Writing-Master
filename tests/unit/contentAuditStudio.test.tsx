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

  it('expands and collapses the whole tree from the toolbar', () => {
    renderStudio();
    // Only the course level is auto-expanded — prompts are not visible yet.
    expect(screen.queryByText('Explain the fixture concept.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    expect(screen.getByText('Explain the fixture concept.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryByText('Explain the fixture concept.')).toBeNull();
    // The collapse must stick — no auto re-expand snapping it back open.
    expect(screen.queryByText('Fixture Topic')).toBeNull();
  });

  it('clears the selection from the toolbar', () => {
    renderStudio();
    selectWholeCourse();
    expect(screen.getByText('Fix All Gaps (4)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(screen.getByText('Fix All Gaps (0)')).toBeTruthy();
    // Button disappears once there is nothing to clear.
    expect(screen.queryByRole('button', { name: /clear selection/i })).toBeNull();
  });

  it('offers Export JSON only when the selection resolves to a single topic or course, and triggers a download', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === 'a') el.click = clickSpy;
        return el;
      });

    try {
      renderStudio();

      // Selecting the whole course cascades to every descendant — still one
      // exportable root, so the button stays enabled.
      selectWholeCourse();
      const exportButton = screen.getByRole('button', { name: /export json/i });
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(exportButton);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      createElementSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('offers an Import JSON entry point scoped to the selected topic/course, opening TopicImportModal with the right course context', () => {
    renderStudio();

    // Selecting the whole course resolves to exactly one importable target —
    // the course itself — same as Export JSON's single-root rule.
    selectWholeCourse();
    const importButton = screen.getByRole('button', { name: /import json/i });
    expect((importButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(importButton);

    // TopicImportModal opened, scoped to "Fixture Course" (the course the
    // selection resolved to) rather than any other course.
    expect(screen.getByRole('dialog', { name: /import a topic file/i })).toBeTruthy();
    expect(screen.getByText('into "Fixture Course"')).toBeTruthy();
  });

  it('disables Import JSON once the selection no longer resolves to one topic/course', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Expand Fixture Topic'));
    fireEvent.click(screen.getByLabelText('Expand Fixture SubTopic'));

    fireEvent.click(screen.getByLabelText('Select describe an untouched dot point'));
    const importButton = screen.getByRole('button', { name: /import json/i });
    expect((importButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Export JSON once the selection no longer resolves to one topic/course', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Expand Fixture Topic'));
    fireEvent.click(screen.getByLabelText('Expand Fixture SubTopic'));

    // Selecting a single dot point (not a topic/course) still shows the
    // button once something is selected, but it can't resolve an export
    // target, so it stays disabled.
    fireEvent.click(screen.getByLabelText('Select describe an untouched dot point'));
    const exportButton = screen.getByRole('button', { name: /export json/i });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('Clear Questions is present but disabled with nothing selected', () => {
    renderStudio();
    const btn = screen.getByRole('button', { name: /clear questions \(0\)/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Clear Questions opens a destructive confirmation naming the scope and live question count', () => {
    renderStudio();
    selectWholeCourse(); // cascades to the whole course → 1 question in the fixture

    const btn = screen.getByRole('button', { name: /clear questions \(1\)/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);

    expect(screen.getByText('Clear questions?')).toBeTruthy();
    expect(
      screen.getByText(/Delete all 1 question under "Fixture Course"\?/)
    ).toBeTruthy();
    expect(screen.getByText(/Sub-topics, dot points and the topic itself are kept/)).toBeTruthy();
  });

  it('confirming Clear Questions empties prompts under the scope via updateCourses, leaving structure and focusAreas untouched', () => {
    let draftState: Course[] = JSON.parse(JSON.stringify(fixture));
    const updateCourses = vi.fn((updater: (draft: Course[]) => Course[] | void) => {
      const result = updater(draftState);
      if (result) draftState = result;
    });

    render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={fixture}
        updateCourses={updateCourses}
        showToast={vi.fn()}
      />
    );

    selectWholeCourse();
    fireEvent.click(screen.getByRole('button', { name: /clear questions \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /^clear questions$/i }));

    expect(updateCourses).toHaveBeenCalledTimes(1);

    const topic = draftState[0].topics[0];
    const subTopic = topic.subTopics[0];
    const dpEmpty = subTopic.dotPoints.find((dp) => dp.id === 'dp-empty')!;
    const dpFull = subTopic.dotPoints.find((dp) => dp.id === 'dp-full')!;

    // Questions gone…
    expect(dpFull.prompts).toEqual([]);
    expect(dpEmpty.prompts).toEqual([]);
    // …but every bit of structure survives untouched.
    expect(draftState[0].id).toBe('c1');
    expect(draftState[0].name).toBe('Fixture Course');
    expect(topic.id).toBe('t1');
    expect(topic.name).toBe('Fixture Topic');
    expect(subTopic.id).toBe('st1');
    expect(subTopic.name).toBe('Fixture SubTopic');
    expect(dpFull.id).toBe('dp-full');
    expect(dpFull.description).toBe('explain a covered dot point');
    expect(dpEmpty.id).toBe('dp-empty');
    expect(dpEmpty.description).toBe('describe an untouched dot point');
  });

  it('cancelling the Clear Questions confirmation leaves data untouched', () => {
    const updateCourses = vi.fn();
    render(
      <ContentAuditModal
        isOpen={true}
        onClose={vi.fn()}
        courses={fixture}
        updateCourses={updateCourses}
        showToast={vi.fn()}
      />
    );

    selectWholeCourse();
    fireEvent.click(screen.getByRole('button', { name: /clear questions \(1\)/i }));
    expect(screen.getByText('Clear questions?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(updateCourses).not.toHaveBeenCalled();
    expect(screen.queryByText('Clear questions?')).toBeNull();
  });

  it('closes on Escape only while no batch is running', () => {
    const onClose = vi.fn();
    render(
      <ContentAuditModal
        isOpen={true}
        onClose={onClose}
        courses={fixture}
        updateCourses={vi.fn()}
        showToast={vi.fn()}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
