import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import type { Course } from '../../types';

/**
 * The audit counts a question's outcome links against its OWN year.
 *
 * A Year 11 question carrying an HSC outcome code is a link that needs fixing.
 * Counting it as linked hides the one thing the audit exists to surface — and
 * the audit's own linking task now narrows to the year, so what it flags here
 * it can also repair.
 */

const prompt = (id: string, linkedOutcomes: string[]) => ({
  id,
  question: 'Explain the fixture concept.',
  totalMarks: 4,
  verb: 'Explain',
  linkedOutcomes,
  keywords: ['k'],
  scenario: 'A scenario long enough to count.',
  markingCriteria: 'A rubric long enough to count as present for this test.',
  sampleAnswers: [{ answer: 'A sample answer long enough to be counted as real.' }],
});

const topic = (id: string, name: string, linked: string[], year?: 'year11') => ({
  id,
  name,
  ...(year ? { year } : {}),
  subTopics: [
    {
      id: `st-${id}`,
      name: `Sub ${name}`,
      dotPoints: [
        { id: `dp-${id}`, description: 'explain a covered dot point', prompts: [prompt(`p-${id}`, linked)] },
      ],
    },
  ],
});

const renderStudio = (courses: Course[]) =>
  render(
    <ContentAuditModal
      isOpen
      onClose={vi.fn()}
      courses={courses}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
    />
  );

const expandTo = (topicName: string) => {
  fireEvent.click(screen.getByLabelText(`Expand ${topicName}`));
  fireEvent.click(screen.getByLabelText(`Expand Sub ${topicName}`));
  fireEvent.click(screen.getByLabelText('Expand explain a covered dot point'));
};

afterEach(cleanup);

describe('the audit reads outcome links against the question’s year', () => {
  it('flags a Year 11 question linked only to an HSC outcome', () => {
    const courses = [
      {
        id: 'c1',
        name: 'Fixture Course',
        outcomes: [
          { code: 'BI-12-01', description: 'HSC outcome' },
          { code: 'BI-11-01', description: 'Prelim outcome', year: 'year11' },
        ],
        topics: [topic('t11', 'Prelim Topic', ['BI-12-01'], 'year11')],
      },
    ] as unknown as Course[];

    renderStudio(courses);
    expandTo('Prelim Topic');

    expect(screen.getByText('No Outcomes')).toBeTruthy();
  });

  it('accepts the same question once it is linked to its own year’s outcome', () => {
    const courses = [
      {
        id: 'c1',
        name: 'Fixture Course',
        outcomes: [
          { code: 'BI-12-01', description: 'HSC outcome' },
          { code: 'BI-11-01', description: 'Prelim outcome', year: 'year11' },
        ],
        topics: [topic('t11', 'Prelim Topic', ['BI-11-01'], 'year11')],
      },
    ] as unknown as Course[];

    renderStudio(courses);
    expandTo('Prelim Topic');

    expect(screen.queryByText('No Outcomes')).toBeNull();
  });

  it('audits a course that has never labelled its outcomes exactly as before', () => {
    // The lenient filter: nothing declares a year, so every outcome counts in
    // both years and this course is read precisely as it was pre-split.
    const courses = [
      {
        id: 'c1',
        name: 'Fixture Course',
        outcomes: [{ code: 'BI-12-01', description: 'An outcome' }],
        topics: [topic('t11', 'Prelim Topic', ['BI-12-01'], 'year11')],
      },
    ] as unknown as Course[];

    renderStudio(courses);
    expandTo('Prelim Topic');

    expect(screen.queryByText('No Outcomes')).toBeNull();
  });
});
