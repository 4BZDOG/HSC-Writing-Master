import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal from '../../components/admin/ContentAuditModal';
import { buildAuditTree, facultyNodeId } from '../../components/admin/contentAudit/auditModel';
import type { Course } from '../../types';

/**
 * The studio groups the library by faculty.
 *
 * The ask behind it was "let me work on all the science subjects at once",
 * which with courses at the top of the tree meant ticking each one and hoping
 * none was missed. These tests pin the three things that makes true: the tree
 * has a faculty level, ticking one cascades to every course in it, and the
 * destructive action resolves a faculty — which has no course id of its own —
 * to the courses underneath rather than throwing or silently doing nothing.
 */

const course = (id: string, name: string, subject?: string): Course =>
  ({
    id,
    name,
    subject,
    outcomes: [{ code: `${id.toUpperCase()}-1`, description: 'An outcome' }],
    topics: [
      {
        id: `${id}-t1`,
        name: `${name} Topic`,
        subTopics: [
          {
            id: `${id}-st1`,
            name: `${name} SubTopic`,
            dotPoints: [
              {
                id: `${id}-dp1`,
                description: `explain something in ${name}`,
                prompts: [
                  {
                    id: `${id}-p1`,
                    question: `Explain the ${name} concept.`,
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
  }) as unknown as Course;

// Two faculties, and a TAS course declared BEFORE the Science ones so the
// canonical ordering is doing real work rather than agreeing with input order.
const fixture: Course[] = [
  course('se', 'HSC Software Engineering'),
  course('bio', 'HSC Biology'),
  course('chem', 'HSC Chemistry'),
];

const renderStudio = (courses: Course[] = fixture, updateCourses = vi.fn()) =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={courses}
      updateCourses={updateCourses}
      showToast={vi.fn()}
    />
  );

afterEach(cleanup);

describe('buildAuditTree — faculty is the top level', () => {
  it('groups courses under the faculty they belong to, in the canonical order', () => {
    const tree = buildAuditTree(fixture);

    expect(tree.map((n) => n.label)).toEqual(['Science', 'TAS']);
    expect(tree.every((n) => n.type === 'faculty')).toBe(true);
    expect(tree[0].id).toBe(facultyNodeId('Science'));
    expect(tree[0].children?.map((c) => c.label)).toEqual(['HSC Biology', 'HSC Chemistry']);
    expect(tree[1].children?.map((c) => c.label)).toEqual(['HSC Software Engineering']);
  });

  it('shows only the faculties that have a course', () => {
    // An empty rail of the eight NSW faculties would say nothing about this
    // library, so a faculty with no courses is not a row.
    const tree = buildAuditTree([course('bio', 'HSC Biology')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('Science');
  });

  it('rolls its courses up into one set of figures', () => {
    const [science] = buildAuditTree(fixture);
    expect(science.stats.questions).toBe(2); // Biology + Chemistry
    expect(science.stats.totalDotPoints).toBe(2);
    expect(science.stats.missingSamples).toBe(2);
    expect(science.stats.missingOutcomes).toBe(2);
  });

  it('honours a recorded subject over the course name', () => {
    const tree = buildAuditTree([course('bio', 'HSC Biology', 'TAS')]);
    expect(tree.map((n) => n.label)).toEqual(['TAS']);
  });

  it('leaves a faculty without a syllabus path of its own', () => {
    // Nothing downstream may read `path.courseId` off a faculty and get a
    // course id that is really one of its children's.
    const [science] = buildAuditTree(fixture);
    expect(science.path).toEqual({});
  });
});

describe('the studio — working a whole faculty', () => {
  it('opens with the faculties and their courses expanded', () => {
    renderStudio();
    expect(screen.getByText('Science')).toBeTruthy();
    expect(screen.getByText('HSC Biology')).toBeTruthy();
    // Topics stay folded, as they did before faculties existed.
    expect(screen.queryByText('HSC Biology Topic')).toBeTruthy();
    expect(screen.queryByText('Explain the HSC Biology concept.')).toBeNull();
  });

  it('selects every course in a faculty from the faculty row', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Select the whole Science faculty'));

    // faculty + 2 courses + 2 topics + 2 sub-topics + 2 dot points + 2 prompts
    expect(screen.getByRole('button', { name: /clear selection \(11\)/i })).toBeTruthy();
    // Both Science questions are targeted; the TAS one is not.
    expect(screen.getByText('Draft Samples (2)')).toBeTruthy();
    expect(screen.getByText('Link Outcomes (2)')).toBeTruthy();
  });

  it('says what is selected rather than only how much', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Select the whole Science faculty'));
    expect(screen.getByText('1 faculty · 2 courses · 2 questions')).toBeTruthy();
  });

  it('resolves a selected faculty to its courses when clearing questions', () => {
    let draftState: Course[] = JSON.parse(JSON.stringify(fixture));
    const updateCourses = vi.fn((updater: (draft: Course[]) => Course[] | void) => {
      const result = updater(draftState);
      if (result) draftState = result;
    });
    renderStudio(fixture, updateCourses);

    fireEvent.click(screen.getByLabelText('Select the whole Science faculty'));
    fireEvent.click(screen.getByRole('button', { name: /clear questions \(2\)/i }));

    // Two scopes, because a faculty is not a scope `clearQuestionsInScope` can
    // take — it is the two courses under it.
    expect(
      screen.getByText(/across the 2 selected scopes \("HSC Biology", "HSC Chemistry"\)/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^clear questions$/i }));

    expect(
      draftState.find((c) => c.id === 'bio')!.topics[0].subTopics[0].dotPoints[0].prompts
    ).toEqual([]);
    expect(
      draftState.find((c) => c.id === 'chem')!.topics[0].subTopics[0].dotPoints[0].prompts
    ).toEqual([]);
    // The TAS course was never in scope.
    expect(
      draftState.find((c) => c.id === 'se')!.topics[0].subTopics[0].dotPoints[0].prompts
    ).toHaveLength(1);
  });

  it('cannot export a faculty — that is a course or a topic', () => {
    renderStudio();
    fireEvent.click(screen.getByLabelText('Select the whole Science faculty'));
    expect(
      (screen.getByRole('button', { name: /export json/i }) as HTMLButtonElement).disabled
    ).toBe(true);
    // Selecting one course underneath resolves an export target again.
    fireEvent.click(screen.getByLabelText('Deselect the whole Science faculty'));
    fireEvent.click(screen.getByLabelText('Select HSC Biology'));
    expect(
      (screen.getByRole('button', { name: /export json/i }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});

describe('the studio — selecting what a search found', () => {
  it('offers Select All Filtered for a plain search, and takes only the rows that matched', () => {
    renderStudio();
    fireEvent.change(screen.getByLabelText(/search the curriculum/i), {
      target: { value: 'Chemistry' },
    });

    fireEvent.click(screen.getByRole('button', { name: /select all filtered/i }));

    // The course, its topic, its sub-topic, its dot point and its question all
    // carry "Chemistry" in their own label; the Science band above them does
    // not, and selecting it would have widened every action to the whole
    // faculty.
    expect(screen.getByRole('button', { name: /clear selection \(5\)/i })).toBeTruthy();
    expect(screen.getByText('1 course · 1 topic · 1 question')).toBeTruthy();
  });
});
