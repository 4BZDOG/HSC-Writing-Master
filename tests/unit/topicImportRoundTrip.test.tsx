import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TopicImportModal from '../../components/TopicImportModal';
import { buildTopicExportPayload } from '../../utils/dataManagerUtils';
import type { Course } from '../../types';

/**
 * Regression coverage for the Studio's export-then-reimport round trip
 * (projectDocs/SyllabusAuditImportDeleteImprovements_Plan.md, Steps 2-3).
 *
 * `buildTopicExportPayload` — used by both the Data Manager's Export tab and
 * the Audit Studio's own "Export JSON" button — returns a `Course[]` (one
 * course wrapping one topic), matching `ExportFlow.tsx`'s existing
 * single-topic export shape. `TopicImportModal.handleFileDrop` originally
 * accepted only a bare `Topic` object (`analysis.type === 'topic'`), so
 * feeding that exact export back into the Studio's own "Import JSON…" button
 * failed with "The imported file is not a valid single topic object." — a
 * broken round trip caught by a manual end-to-end pass, not by unit tests,
 * because nothing previously drove `TopicImportModal`'s file input with a
 * real export payload. This test does.
 */

const fixtureCourse: Course = {
  id: 'course-1',
  name: 'Fixture Course',
  outcomes: [{ code: 'FC-1', description: 'A real outcome' }],
  topics: [
    {
      id: 'topic-1',
      name: 'Fixture Topic',
      subTopics: [
        {
          id: 'st-1',
          name: 'Fixture SubTopic',
          dotPoints: [
            {
              id: 'dp-1',
              description: 'explain a covered dot point',
              focusAreas: ['worked examples'],
              prompts: [
                {
                  id: 'pr-1',
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
} as unknown as Course;

const makeJsonFile = (data: unknown, name = 'exported-topic.json') =>
  new File([JSON.stringify(data)], name, { type: 'application/json' });

describe('TopicImportModal — reimports its own Studio export', () => {
  afterEach(() => cleanup());

  it('accepts the Course[] shape buildTopicExportPayload produces, previewing a merge into the matching existing topic', async () => {
    const exported = buildTopicExportPayload([fixtureCourse], 'course-1', 'topic-1');
    expect(exported).toHaveLength(1);
    expect(exported[0].topics).toHaveLength(1);

    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        courseName="Fixture Course"
        existingTopics={fixtureCourse.topics}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput, { target: { files: [makeJsonFile(exported)] } });

    // Reaches the merge-plan preview — not the "not a valid single topic
    // object" error — and correctly identifies the existing topic it will
    // merge into (matched by id, since ids weren't regenerated here).
    await waitFor(() => {
      expect(screen.getByText(/will merge into "fixture topic"/i)).toBeTruthy();
    });
    expect(screen.queryByText(/not a valid single topic object/i)).toBeFalsy();
  });

  it('still rejects a genuinely invalid file (not topic-shaped, not a single-topic Course[])', async () => {
    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        courseName="Fixture Course"
        existingTopics={fixtureCourse.topics}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeJsonFile({ not: 'a topic' })] } });

    await waitFor(() => {
      expect(screen.getByText(/not a valid single topic object/i)).toBeTruthy();
    });
  });

  it('rejects a Course[] export that bundles more than one topic (not a single-topic unit)', async () => {
    const multiTopicCourse: Course = {
      ...fixtureCourse,
      topics: [
        ...fixtureCourse.topics,
        { id: 'topic-2', name: 'Second Topic', subTopics: [] },
      ],
    } as unknown as Course;

    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        courseName="Fixture Course"
        existingTopics={fixtureCourse.topics}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeJsonFile([multiTopicCourse])] } });

    await waitFor(() => {
      expect(screen.getByText(/not a valid single topic object/i)).toBeTruthy();
    });
  });
});
