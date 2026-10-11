import { describe, it, expect } from 'vitest';
import { toOwnAttempts, type OwnEventRow } from '../../utils/profileHistory';

/**
 * The curriculum embed on the student's own history: how `toOwnAttempts` maps
 * the nested `prompts → dot_points → sub_topics → topics → courses` join that
 * `fetchMyReportHistory` selects. PostgREST returns each many-to-one level as an
 * object (or, when it guesses wrongly, a one-element array), and RLS can hide any
 * level, which arrives as null.
 */

const at = '2026-09-08T10:00:00Z';

const fullRow = (prompts: OwnEventRow['prompts']): OwnEventRow => ({
  mark: 4,
  band: 3,
  word_count: 150,
  created_at: at,
  prompts,
});

const nested = (overrides: Record<string, unknown> = {}) => ({
  verb: 'explain',
  total_marks: 6,
  dot_points: {
    sub_topics: {
      topics: {
        name: '  Networks  ',
        courses: { id: 'uuid-ec', legacy_id: 'course-ec-01', name: 'Enterprise Computing' },
      },
    },
  },
  ...overrides,
});

describe('toOwnAttempts without the curriculum option (the profile read)', () => {
  it('leaves course and topic out entirely, so the profile shape is unchanged', () => {
    const [a] = toOwnAttempts([fullRow(nested())]);
    expect(a).toEqual({
      at,
      band: 3,
      mark: 4,
      totalMarks: 6,
      verb: 'EXPLAIN',
      wordCount: 150,
    });
    expect('course' in a).toBe(false);
    expect('topic' in a).toBe(false);
  });
});

describe('toOwnAttempts with { curriculum: true }', () => {
  it('maps the course and topic from an object-shaped embed at every level', () => {
    const [a] = toOwnAttempts([fullRow(nested())], { curriculum: true });
    expect(a.course).toEqual({
      id: 'uuid-ec',
      legacyId: 'course-ec-01',
      name: 'Enterprise Computing',
    });
    expect(a.topic).toEqual({
      name: 'Networks',
      course: { id: 'uuid-ec', legacyId: 'course-ec-01', name: 'Enterprise Computing' },
    });
  });

  it('maps the same chain when PostgREST sends each level as a one-element array', () => {
    const [a] = toOwnAttempts(
      [
        fullRow([
          {
            verb: 'EXPLAIN',
            total_marks: 6,
            dot_points: [
              {
                sub_topics: [
                  {
                    topics: [
                      {
                        name: 'Networks',
                        courses: [{ id: 'uuid-ec', legacy_id: 'course-ec-01', name: 'EC' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]),
      ],
      { curriculum: true }
    );
    expect(a.course).toEqual({ id: 'uuid-ec', legacyId: 'course-ec-01', name: 'EC' });
    expect(a.topic?.name).toBe('Networks');
    expect(a.topic?.course?.name).toBe('EC');
  });

  it('answers null for the course and topic when RLS hides the question', () => {
    const [a] = toOwnAttempts([fullRow(null)], { curriculum: true });
    expect(a.course).toBeNull();
    expect(a.topic).toBeNull();
    // The rest of the attempt is still there.
    expect(a.verb).toBeNull();
    expect(a.band).toBe(3);
  });

  it('keeps the topic but nulls its course when only the course level is hidden', () => {
    const [a] = toOwnAttempts(
      [
        fullRow(
          nested({
            dot_points: { sub_topics: { topics: { name: 'Networks', courses: null } } },
          })
        ),
      ],
      { curriculum: true }
    );
    expect(a.course).toBeNull();
    expect(a.topic).toEqual({ name: 'Networks', course: null });
  });

  it('nulls the topic when the sub-topic level is hidden, and never invents a course', () => {
    const [a] = toOwnAttempts([fullRow(nested({ dot_points: { sub_topics: null } }))], {
      curriculum: true,
    });
    expect(a.topic).toBeNull();
    expect(a.course).toBeNull();
  });

  it('treats a blank or missing name as unknown rather than as an empty label', () => {
    const [a] = toOwnAttempts(
      [
        fullRow(
          nested({
            dot_points: {
              sub_topics: {
                topics: { name: '   ', courses: { id: 'u', legacy_id: '', name: null } },
              },
            },
          })
        ),
      ],
      { curriculum: true }
    );
    expect(a.topic?.name).toBeNull();
    expect(a.course).toEqual({ id: 'u', legacyId: null, name: null });
  });

  it('still drops a row with no usable timestamp under the curriculum option', () => {
    const out = toOwnAttempts([{ ...fullRow(nested()), created_at: 'not a date' }], {
      curriculum: true,
    });
    expect(out).toEqual([]);
  });
});
