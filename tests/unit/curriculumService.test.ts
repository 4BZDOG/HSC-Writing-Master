import { describe, it, expect } from 'vitest';
import { assembleCourses, type CurriculumRows } from '../../services/curriculumService';

const emptyRows = (): CurriculumRows => ({
  courses: [],
  outcomes: [],
  topics: [],
  subTopics: [],
  dotPoints: [],
  prompts: [],
  sampleAnswers: [],
});

describe('assembleCourses (Supabase relational rows -> Course[])', () => {
  it('returns an empty array when there are no courses', () => {
    expect(assembleCourses(emptyRows())).toEqual([]);
  });

  it('wires the full hierarchy together by foreign key', () => {
    const rows: CurriculumRows = {
      courses: [{ id: 'c-uuid', legacy_id: 'course-1', name: 'Software', subject: 'TAS' }],
      outcomes: [{ course_id: 'c-uuid', code: 'O1', description: 'Outcome one', position: 0 }],
      topics: [
        {
          id: 't-uuid',
          course_id: 'c-uuid',
          legacy_id: 'topic-1',
          name: 'Topic',
          position: 0,
          band_descriptors: [
            { band: 6, label: 'Band 6', shortLabel: 'B6', description: 'Top band' },
          ],
        },
      ],
      subTopics: [
        { id: 's-uuid', topic_id: 't-uuid', legacy_id: 'sub-1', name: 'Sub', position: 0 },
      ],
      dotPoints: [
        {
          id: 'd-uuid',
          sub_topic_id: 's-uuid',
          legacy_id: 'dp-1',
          description: 'Dot',
          position: 0,
        },
      ],
      prompts: [
        {
          id: 'p-uuid',
          dot_point_id: 'd-uuid',
          legacy_id: 'prompt-1',
          question: 'Explain X',
          highlighted_question: null,
          total_marks: 5,
          verb: 'EXPLAIN',
          scenario: null,
          marking_criteria: 'criteria',
          linked_outcomes: ['O1'],
          related_topics: [],
          prerequisite_knowledge: [],
          marker_notes: [],
          common_student_errors: [],
          keywords: ['x'],
          target_performance_bands: [5, 6],
          estimated_time: '10 min',
          is_past_hsc: true,
          hsc_year: 2023,
          hsc_question_number: '12a',
        },
      ],
      sampleAnswers: [
        {
          id: 'a-uuid',
          prompt_id: 'p-uuid',
          legacy_id: 'ans-1',
          band: 5,
          mark: 4,
          answer: 'An answer',
          source: 'HSC_EXEMPLAR',
          feedback: 'good',
          quick_tip: 'tip',
        },
      ],
    };

    const courses = assembleCourses(rows);
    expect(courses).toHaveLength(1);

    const course = courses[0];
    // legacy_id is preferred as the app-facing id.
    expect(course.id).toBe('course-1');
    expect(course.subject).toBe('TAS');
    expect(course.outcomes).toEqual([{ code: 'O1', description: 'Outcome one' }]);

    const topic = course.topics[0];
    expect(topic.id).toBe('topic-1');
    expect(topic.performanceBandDescriptors?.[0].band).toBe(6);

    const prompt = topic.subTopics[0].dotPoints[0].prompts[0];
    expect(prompt.id).toBe('prompt-1');
    expect(prompt.totalMarks).toBe(5);
    expect(prompt.isPastHSC).toBe(true);
    expect(prompt.hscYear).toBe(2023);
    expect(prompt.linkedOutcomes).toEqual(['O1']);

    const answer = prompt.sampleAnswers?.[0];
    expect(answer?.id).toBe('ans-1');
    expect(answer?.source).toBe('HSC_EXEMPLAR');
    expect(answer?.quickTip).toBe('tip');
  });

  it('orders children by their position column', () => {
    const rows = emptyRows();
    rows.courses = [{ id: 'c', legacy_id: null, name: 'C', subject: null }];
    rows.topics = [
      {
        id: 't2',
        course_id: 'c',
        legacy_id: null,
        name: 'Second',
        position: 1,
        band_descriptors: null,
      },
      {
        id: 't1',
        course_id: 'c',
        legacy_id: null,
        name: 'First',
        position: 0,
        band_descriptors: null,
      },
    ];

    const [course] = assembleCourses(rows);
    expect(course.topics.map((t) => t.name)).toEqual(['First', 'Second']);
    // No legacy_id → app id falls back to the DB uuid.
    expect(course.id).toBe('c');
  });

  it('dedupes prompts that share an app id (e.g. a re-contributed legacy id)', () => {
    const rows = emptyRows();
    rows.courses = [{ id: 'c', legacy_id: null, name: 'C', subject: null }];
    rows.topics = [
      { id: 't', course_id: 'c', legacy_id: null, name: 'T', position: 0, band_descriptors: null },
    ];
    rows.subTopics = [{ id: 's', topic_id: 't', legacy_id: null, name: 'S', position: 0 }];
    rows.dotPoints = [
      { id: 'd', sub_topic_id: 's', legacy_id: null, description: 'D', position: 0 },
    ];
    const basePrompt = {
      dot_point_id: 'd',
      legacy_id: 'prompt-dup',
      question: 'Q',
      highlighted_question: null,
      total_marks: 0,
      verb: 'EXPLAIN',
      scenario: null,
      marking_criteria: null,
      linked_outcomes: [],
      related_topics: [],
      prerequisite_knowledge: [],
      marker_notes: [],
      common_student_errors: [],
      keywords: [],
      target_performance_bands: [],
      estimated_time: null,
      is_past_hsc: false,
      hsc_year: null,
      hsc_question_number: null,
    };
    // Two DB rows, different uuids, same legacy_id → same app id.
    rows.prompts = [
      { ...basePrompt, id: 'p-uuid-1' },
      { ...basePrompt, id: 'p-uuid-2' },
    ];

    const prompts = assembleCourses(rows)[0].topics[0].subTopics[0].dotPoints[0].prompts;
    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe('prompt-dup');
  });

  it('defaults a missing verb and null sample-answer source to safe values', () => {
    const rows = emptyRows();
    rows.courses = [{ id: 'c', legacy_id: null, name: 'C', subject: null }];
    rows.topics = [
      { id: 't', course_id: 'c', legacy_id: null, name: 'T', position: 0, band_descriptors: null },
    ];
    rows.subTopics = [{ id: 's', topic_id: 't', legacy_id: null, name: 'S', position: 0 }];
    rows.dotPoints = [
      { id: 'd', sub_topic_id: 's', legacy_id: null, description: 'D', position: 0 },
    ];
    rows.prompts = [
      {
        id: 'p',
        dot_point_id: 'd',
        legacy_id: null,
        question: 'Q',
        highlighted_question: null,
        total_marks: 0,
        verb: null,
        scenario: null,
        marking_criteria: null,
        linked_outcomes: [],
        related_topics: [],
        prerequisite_knowledge: [],
        marker_notes: [],
        common_student_errors: [],
        keywords: [],
        target_performance_bands: [],
        estimated_time: null,
        is_past_hsc: false,
        hsc_year: null,
        hsc_question_number: null,
      },
    ];
    rows.sampleAnswers = [
      {
        id: 'a',
        prompt_id: 'p',
        legacy_id: null,
        band: 3,
        mark: 2,
        answer: 'A',
        source: null,
        feedback: null,
        quick_tip: null,
      },
    ];

    const prompt = assembleCourses(rows)[0].topics[0].subTopics[0].dotPoints[0].prompts[0];
    expect(prompt.verb).toBe('EXPLAIN');
    expect(prompt.sampleAnswers?.[0].source).toBe('AI');
  });

  /**
   * The year survives the round trip, and Year 12 stays spelled as the absence
   * of a year — a null column, a database without the column at all, and a
   * local JSON export with no field all have to arrive as the same thing.
   */
  it('carries the year of a topic and an outcome, and reads null as Year 12', () => {
    const rows = emptyRows();
    rows.courses = [{ id: 'c', legacy_id: null, name: 'C', subject: null }];
    rows.outcomes = [
      { course_id: 'c', code: 'BI-11-01', description: 'Prelim', position: 0, year: 'year11' },
      { course_id: 'c', code: 'BI-12-01', description: 'HSC', position: 1, year: null },
      // A deployment that has not applied §23: the column is not in the row.
      { course_id: 'c', code: 'BI-12-02', description: 'HSC two', position: 2 },
    ];
    rows.topics = [
      {
        id: 't11',
        course_id: 'c',
        legacy_id: null,
        name: 'Cells',
        position: 0,
        band_descriptors: null,
        year: 'year11',
      },
      {
        id: 't12',
        course_id: 'c',
        legacy_id: null,
        name: 'Heredity',
        position: 1,
        band_descriptors: null,
        year: null,
      },
    ];

    const [course] = assembleCourses(rows);
    expect(course.topics.map((t) => t.year)).toEqual(['year11', undefined]);
    expect(course.outcomes.map((o) => o.year)).toEqual(['year11', undefined, undefined]);
    // Not `year: undefined` — the key is absent, so an export of HSC content is
    // byte-identical to one made before the column existed.
    expect('year' in course.outcomes[1]).toBe(false);
    expect('year' in course.topics[1]).toBe(false);
  });
});
