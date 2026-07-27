import { describe, it, expect } from 'vitest';
import {
  analyzeAndSanitizeImportData,
  checkForDuplicateIds,
  findConflicts,
  filterDataBySelection,
  buildTree,
  generateValidationReport,
  regenerateTopicIds,
  getLLMImportTemplate,
} from '../../utils/dataManagerUtils';
import { Course, Prompt, PromptVerb, Topic } from '../../types';

/**
 * The import path, which is how a teacher's whole course arrives — from a file
 * they were handed, from an LLM, or from a colleague's export. Everything here
 * runs before the data reaches storage, so a mistake is the difference between
 * a course loading and a course being silently mangled.
 */

const makePrompt = (overrides: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the process.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    sampleAnswers: [],
    ...overrides,
  }) as Prompt;

const makeTopic = (id = 't1', name = 'Topic'): Topic => ({
  id,
  name,
  subTopics: [{ id: `${id}-s1`, name: 'Sub', dotPoints: [{ id: `${id}-d1`, description: 'Dot', prompts: [makePrompt()] }] }],
});

const makeCourse = (id = 'c1', name = 'Course'): Course => ({
  id,
  name,
  outcomes: [],
  topics: [makeTopic(`${id}-t1`)],
});

describe('analyzeAndSanitizeImportData', () => {
  it('accepts a plain array of courses', () => {
    const result = analyzeAndSanitizeImportData([makeCourse()]);

    expect(result.type).toBe('courses');
    expect(result.data).toHaveLength(1);
  });

  it('accepts a single course object', () => {
    const result = analyzeAndSanitizeImportData(makeCourse());

    expect(result.type).toBe('courses');
    expect(result.data[0].name).toBe('Course');
  });

  // A topic file and a course file are both bare objects, and every field of
  // the course schema has a default — so a topic used to parse as a course
  // with `topics: []`, quietly importing an empty course and discarding every
  // sub-topic, dot point and question in the file.
  it('recognises a bare topic as a topic, not an empty course', () => {
    const result = analyzeAndSanitizeImportData(makeTopic());

    expect(result.type).toBe('topic');
    expect(result.data.name).toBe('Topic');
    expect(result.data.subTopics[0].dotPoints[0].prompts).toHaveLength(1);
  });

  // One question with no mark value used to reject the whole file, because the
  // array is parsed as a unit — painful in a hand-written or LLM-authored
  // import of several hundred questions.
  it('repairs a question with no mark value instead of failing the import', () => {
    const result = analyzeAndSanitizeImportData([
      {
        id: 'c1',
        name: 'Course',
        outcomes: [],
        topics: [
          {
            id: 't1',
            name: 'T',
            subTopics: [
              {
                id: 's1',
                name: 'S',
                dotPoints: [
                  { id: 'd1', description: 'D', prompts: [{ id: 'p1', question: 'Assess it.' }] },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(result.type).toBe('courses');
    const prompt = result.data[0].topics[0].subTopics[0].dotPoints[0].prompts[0];
    expect(prompt.totalMarks).toBeGreaterThan(0);
  });

  // Both shapes an LLM is asked to produce — the template it is given wraps
  // the courses, and a hand-written file usually does not.
  it('unwraps the LLM template envelope', () => {
    const result = analyzeAndSanitizeImportData({
      _instructions_for_llm: 'Fill this in',
      data: [makeCourse()],
    });

    expect(result.type).toBe('courses');
    expect(result.data).toHaveLength(1);
  });

  it('unwraps a { courses: [...] } wrapper', () => {
    const result = analyzeAndSanitizeImportData({ courses: [makeCourse()] });

    expect(result.type).toBe('courses');
    expect(result.data).toHaveLength(1);
  });

  // Two courses sharing an id would overwrite each other on save, so the
  // import is refused rather than half-applied.
  it('refuses a file with duplicate course ids', () => {
    const result = analyzeAndSanitizeImportData([makeCourse('dup'), makeCourse('dup')]);

    expect(result.type).toBe('invalid');
    expect(result.error).toMatch(/duplicate/i);
  });

  it('refuses something that is not curriculum at all', () => {
    expect(analyzeAndSanitizeImportData('a string').type).toBe('invalid');
    expect(analyzeAndSanitizeImportData(42).type).toBe('invalid');
    expect(analyzeAndSanitizeImportData(null).type).toBe('invalid');
  });

  it('canonicalises verbs and marks on the way in', () => {
    const result = analyzeAndSanitizeImportData([
      {
        id: 'c1',
        name: 'Course',
        outcomes: [],
        topics: [
          {
            id: 't1',
            name: 'T',
            subTopics: [
              {
                id: 's1',
                name: 'S',
                dotPoints: [
                  {
                    id: 'd1',
                    description: 'D',
                    // A verb in the wrong case and no marks at all: the two
                    // fields every band ceiling and tier colour derives from.
                    prompts: [{ id: 'p1', question: 'Evaluate the impact.', verb: 'evaluate' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const prompt = result.data[0].topics[0].subTopics[0].dotPoints[0].prompts[0];
    expect(prompt.verb).toBe('EVALUATE');
    expect(prompt.totalMarks).toBeGreaterThan(0);
  });

  it('recalculates sample-answer bands rather than trusting the file', () => {
    const result = analyzeAndSanitizeImportData([
      {
        ...makeCourse(),
        topics: [
          {
            id: 't1',
            name: 'T',
            subTopics: [
              {
                id: 's1',
                name: 'S',
                dotPoints: [
                  {
                    id: 'd1',
                    description: 'D',
                    prompts: [
                      makePrompt({
                        sampleAnswers: [
                          {
                            id: 'sa1',
                            answer: 'x',
                            mark: 4,
                            band: 99, // nonsense from the file
                            source: 'AI',
                            feedback: '',
                          },
                        ],
                      }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const band =
      result.data[0].topics[0].subTopics[0].dotPoints[0].prompts[0].sampleAnswers[0].band;
    expect(band).toBeLessThanOrEqual(6);
  });
});

describe('duplicate and conflict detection', () => {
  it('names every repeated course id', () => {
    expect(checkForDuplicateIds([makeCourse('a'), makeCourse('b'), makeCourse('a')])).toEqual(['a']);
  });

  it('finds nothing in a clean list', () => {
    expect(checkForDuplicateIds([makeCourse('a'), makeCourse('b')])).toEqual([]);
  });

  it('reports which imported courses already exist', () => {
    const conflicts = findConflicts([makeCourse('a'), makeCourse('c')], [makeCourse('a')]);

    expect(conflicts.map((c) => c.id)).toEqual(['a']);
  });
});

describe('filterDataBySelection', () => {
  const courses = [makeCourse('c1'), makeCourse('c2')];

  it('keeps only the chosen course', () => {
    const filtered = filterDataBySelection(courses, new Set(['c1']));

    expect(filtered.map((c) => c.id)).toEqual(['c1']);
  });

  it('keeps a course when only one of its dot points is chosen', () => {
    const filtered = filterDataBySelection(courses, new Set(['c1-t1-d1']));

    expect(filtered).toHaveLength(1);
    expect(filtered[0].topics[0].subTopics[0].dotPoints).toHaveLength(1);
  });

  it('returns nothing when nothing is chosen', () => {
    expect(filterDataBySelection(courses, new Set())).toEqual([]);
  });
});

describe('buildTree', () => {
  it('mirrors the course hierarchy', () => {
    const [tree] = buildTree([makeCourse('c1')]);

    expect(tree.type).toBe('course');
    expect(tree.children?.[0].type).toBe('topic');
    expect(tree.children?.[0].children?.[0].type).toBe('subTopic');
    expect(tree.children?.[0].children?.[0].children?.[0].type).toBe('dotPoint');
  });

  it('copes with a course that has no topics', () => {
    const [tree] = buildTree([{ id: 'c1', name: 'Empty', outcomes: [], topics: [] }]);

    expect(tree.children).toEqual([]);
  });
});

describe('regenerateTopicIds', () => {
  it('gives every level a new id, so an import cannot collide with what is there', () => {
    const original = makeTopic('t1');
    const regenerated = regenerateTopicIds(original);

    expect(regenerated.id).not.toBe(original.id);
    expect(regenerated.subTopics[0].id).not.toBe(original.subTopics[0].id);
    expect(regenerated.subTopics[0].dotPoints[0].id).not.toBe(original.subTopics[0].dotPoints[0].id);
    expect(regenerated.subTopics[0].dotPoints[0].prompts[0].id).not.toBe('p1');
  });

  it('keeps the content it renumbers', () => {
    const regenerated = regenerateTopicIds(makeTopic('t1', 'Heredity'));

    expect(regenerated.name).toBe('Heredity');
    expect(regenerated.subTopics[0].dotPoints[0].prompts[0].question).toBe(
      'Describe the process.'
    );
  });
});

describe('generateValidationReport', () => {
  it('counts the tree', () => {
    const report = generateValidationReport([makeCourse('c1'), makeCourse('c2')]);

    expect(report.stats.totalCourses).toBe(2);
    expect(report.stats.totalTopics).toBe(2);
    expect(report.stats.totalPrompts).toBe(2);
  });

  it('counts how many prompts carry exemplars and keywords', () => {
    const course = makeCourse('c1');
    course.topics[0].subTopics[0].dotPoints[0].prompts = [
      makePrompt({ id: 'bare' }),
      makePrompt({
        id: 'rich',
        keywords: ['mitosis'],
        sampleAnswers: [
          { id: 'sa', answer: 'x', mark: 4, band: 4, source: 'AI', feedback: '' },
        ],
      }),
    ];

    const report = generateValidationReport([course]);

    expect(report.stats.totalPrompts).toBe(2);
    expect(report.stats.promptsWithKeywords).toBe(1);
    expect(report.stats.promptsWithSampleAnswers).toBe(1);
  });

  it('survives an empty library', () => {
    const report = generateValidationReport([]);

    expect(report.stats.totalCourses).toBe(0);
    expect(report.stats.averagePromptsPerDotPoint).toBe(0);
  });
});

describe('getLLMImportTemplate', () => {
  // The template is handed to a model verbatim; if it stops round-tripping
  // through the importer, every LLM-built course fails on arrival.
  it('produces something the importer accepts', () => {
    const result = analyzeAndSanitizeImportData(JSON.parse(getLLMImportTemplate()));

    expect(result.type).toBe('courses');
  });
});
