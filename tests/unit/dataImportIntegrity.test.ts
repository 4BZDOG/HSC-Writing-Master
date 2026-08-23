import { describe, it, expect } from 'vitest';
import {
  analyzeAndSanitizeImportData,
  checkForDuplicateIds,
  findConflicts,
  filterDataBySelection,
  buildTree,
  generateValidationReport,
  regenerateTopicIds,
  reconcileImportedTopicIds,
  getLLMImportTemplate,
  buildTopicExportPayload,
  previewTopicMergePlan,
  mergeTopicContents,
  mergeOrAddTopic,
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

/**
 * The whole point of Steps 2-3: export a topic, improve the JSON by hand (or
 * with an external tool), reimport it, and land back on the SAME structure
 * with the edit applied — no duplicate topics/sub-topics/dot points/prompts.
 */
describe('export → external edit → reimport round trip', () => {
  it('applies the mutated field and adds the new question with no duplicates', () => {
    const course: Course = {
      id: 'course-bio',
      name: 'Biology',
      outcomes: [],
      topics: [
        {
          id: 'topic-cells',
          name: 'Cells',
          subTopics: [
            {
              id: 'st-structure',
              name: 'Cell Structure',
              dotPoints: [
                {
                  id: 'dp-membrane',
                  description: 'Investigate membrane transport',
                  focusAreas: ['osmosis'],
                  prompts: [makePrompt({ id: 'p-existing', question: 'Explain membrane transport.' })],
                },
              ],
            },
          ],
        },
      ],
    };

    // 1. Export the topic (Step 2's helper) — this is what a teacher downloads.
    const exported = buildTopicExportPayload([course], 'course-bio', 'topic-cells');
    expect(exported).toHaveLength(1);

    // 2. Simulate an external edit on the exported JS object: change a dot
    //    point's focusAreas and add one new question, exactly as a teacher
    //    hand-editing the downloaded file would.
    const editedTopic = JSON.parse(JSON.stringify(exported[0].topics[0])) as Topic;
    editedTopic.subTopics[0].dotPoints[0].focusAreas = ['osmosis', 'active transport'];
    editedTopic.subTopics[0].dotPoints[0].prompts.push(
      makePrompt({ id: 'p-brand-new', question: 'Describe active transport.' })
    );

    // 3. Feed it back through the sanitizer, as the real import path does.
    const analysis = analyzeAndSanitizeImportData(editedTopic);
    expect(analysis.type).toBe('topic');
    const sanitizedTopic = analysis.data as Topic;

    // 4. Preview the merge plan before applying it.
    const plan = previewTopicMergePlan([course.topics[0]], sanitizedTopic);
    expect(plan.matchedTopic?.id).toBe('topic-cells');
    expect(plan.matchedSubTopics).toBe(1);
    expect(plan.matchedDotPoints).toBe(1);
    expect(plan.matchedPrompts).toBe(1); // the existing question, matched by text
    expect(plan.newPrompts).toBe(1); // the newly added question

    // 5. Actually apply the merge (what confirming the import does).
    const merged = mergeTopicContents(course.topics[0], sanitizedTopic);

    // No duplicate structure anywhere.
    expect(merged.subTopics).toHaveLength(1);
    expect(merged.subTopics[0].dotPoints).toHaveLength(1);
    expect(merged.subTopics[0].dotPoints[0].prompts).toHaveLength(2);
    const questions = merged.subTopics[0].dotPoints[0].prompts.map((p) => p.question);
    expect(new Set(questions).size).toBe(2);

    // The externally-edited field wins.
    expect(merged.subTopics[0].dotPoints[0].focusAreas).toEqual(['osmosis', 'active transport']);
    // The new question landed.
    expect(questions).toContain('Describe active transport.');
  });
});

/**
 * Regression coverage for the reimport-duplication bug: `regenerateTopicIds`
 * used to run on EVERY reimport, unconditionally wiping the topic's id and
 * every subTopic/dotPoint/prompt/sampleAnswer id inside it before the merge
 * ran. `previewTopicMergePlan` (what the user sees and consents to) always
 * ran on the RAW imported topic with its ORIGINAL ids intact, so the two
 * were keyed off different identities. As long as an external edit left the
 * matching-key text (a dot point's `description`, a prompt's `question`)
 * untouched, id-wiping didn't matter because the merge's text fallback still
 * found the match. But the single most ordinary external edit — reword a dot
 * point or a question — changes exactly that field, so the wiped-id imported
 * node could no longer be matched by id OR text, and landed as a brand-new
 * duplicate sibling instead of updating the existing node in place.
 *
 * `reconcileImportedTopicIds` replaces `regenerateTopicIds` at the two
 * Studio/navigator reimport call sites (`components/AppModals.tsx`,
 * `components/admin/ContentAuditModal.tsx`). These tests run the exact
 * pipeline those call sites now run — `reconcileImportedTopicIds` followed
 * by `mergeOrAddTopic` — against a realistic export-edit-reimport cycle,
 * where the "edit" only touches text (ids are exactly what `buildTopicExportPayload`
 * exported, since an external text edit has no reason to touch an id field).
 * A regenerateTopicIds-based pipeline fed the same input would wipe those
 * ids and reproduce the duplicate, which is what these tests would catch if
 * the fix at either call site were ever reverted.
 */
describe('reconcileImportedTopicIds', () => {
  const buildExistingTopic = (): Topic => ({
    id: 'topic-cells',
    name: 'Cells',
    subTopics: [
      {
        id: 'st-structure',
        name: 'Cell Structure',
        dotPoints: [
          {
            id: 'dp-membrane',
            description: 'Investigate membrane transport',
            prompts: [
              makePrompt({ id: 'p-membrane-1', question: 'Explain membrane transport.' }),
            ],
          },
          {
            id: 'dp-osmosis',
            description: 'Investigate osmosis',
            prompts: [makePrompt({ id: 'p-osmosis-1', question: 'Describe osmosis.' })],
          },
        ],
      },
    ],
  });

  const allIds = (topic: Topic): string[] => {
    const ids: string[] = [topic.id];
    topic.subTopics.forEach((st) => {
      ids.push(st.id);
      st.dotPoints.forEach((dp) => {
        ids.push(dp.id);
        dp.prompts.forEach((p) => {
          ids.push(p.id);
          (p.sampleAnswers || []).forEach((sa) => ids.push(sa.id));
        });
      });
    });
    return ids;
  };

  // 1. Reword a dot point's `description` — the matching-key field — and
  // confirm the reimport updates the existing dot point in place instead of
  // duplicating it. This is the exact edit that reproduced the live bug.
  it('updates an existing dot point in place when its description is reworded, instead of duplicating it', () => {
    const existingTopic = buildExistingTopic();
    const course: Course = { id: 'course-bio', name: 'Biology', outcomes: [], topics: [existingTopic] };

    const exported = buildTopicExportPayload([course], 'course-bio', 'topic-cells');
    const editedTopic = JSON.parse(JSON.stringify(exported[0].topics[0])) as Topic;
    editedTopic.subTopics[0].dotPoints[0].description =
      'Investigate membrane transport across the cell membrane';

    const reconciled = reconcileImportedTopicIds(editedTopic, [existingTopic]);

    // The matched dot point keeps its original id, because reconciliation
    // found it by id (unchanged) rather than falling back to text.
    expect(reconciled.subTopics[0].dotPoints[0].id).toBe('dp-membrane');

    const targetTopics = [buildExistingTopic()];
    const merged = mergeOrAddTopic(targetTopics, reconciled);

    // Exactly 2 dot points — the reworded one merged in place, not a 3rd.
    expect(merged.subTopics).toHaveLength(1);
    expect(merged.subTopics[0].dotPoints).toHaveLength(2);

    const membraneDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-membrane');
    expect(membraneDP?.description).toBe('Investigate membrane transport across the cell membrane');
    // Its prompt is intact, not duplicated.
    expect(membraneDP?.prompts).toHaveLength(1);
    expect(membraneDP?.prompts[0].question).toBe('Explain membrane transport.');

    // The untouched dot point and its prompt are unchanged.
    const osmosisDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-osmosis');
    expect(osmosisDP?.description).toBe('Investigate osmosis');
    expect(osmosisDP?.prompts).toHaveLength(1);
    expect(osmosisDP?.prompts[0].question).toBe('Describe osmosis.');
  });

  // 2. Reword a prompt's `question` — the matching-key field one level
  // deeper — inside an otherwise-matched dot point.
  it('updates an existing prompt in place when its question is reworded, instead of duplicating it', () => {
    const existingTopic = buildExistingTopic();
    const course: Course = { id: 'course-bio', name: 'Biology', outcomes: [], topics: [existingTopic] };

    const exported = buildTopicExportPayload([course], 'course-bio', 'topic-cells');
    const editedTopic = JSON.parse(JSON.stringify(exported[0].topics[0])) as Topic;
    editedTopic.subTopics[0].dotPoints[1].prompts[0].question = 'Explain the process of osmosis.';

    const reconciled = reconcileImportedTopicIds(editedTopic, [existingTopic]);
    expect(reconciled.subTopics[0].dotPoints[1].prompts[0].id).toBe('p-osmosis-1');

    const targetTopics = [buildExistingTopic()];
    const merged = mergeOrAddTopic(targetTopics, reconciled);

    expect(merged.subTopics[0].dotPoints).toHaveLength(2);
    const osmosisDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-osmosis');
    // Exactly 1 prompt — updated in place, not a 2nd duplicate question.
    expect(osmosisDP?.prompts).toHaveLength(1);
    expect(osmosisDP?.prompts[0].question).toBe('Explain the process of osmosis.');

    // The unrelated dot point is unaffected.
    const membraneDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-membrane');
    expect(membraneDP?.prompts).toHaveLength(1);
    expect(membraneDP?.prompts[0].question).toBe('Explain membrane transport.');
  });

  // 3. A genuinely new dot point (no id or text match anywhere in the
  // existing topic) must still be pushed in as new, with a fresh id that
  // doesn't collide with anything already in the tree — not folded into an
  // unrelated existing node.
  it('gives a genuinely new dot point a fresh, collision-free id and adds it without merging into something unrelated', () => {
    const existingTopic = buildExistingTopic();
    const course: Course = { id: 'course-bio', name: 'Biology', outcomes: [], topics: [existingTopic] };

    const exported = buildTopicExportPayload([course], 'course-bio', 'topic-cells');
    const editedTopic = JSON.parse(JSON.stringify(exported[0].topics[0])) as Topic;
    editedTopic.subTopics[0].dotPoints.push({
      id: 'hand-typed-placeholder-id',
      description: 'Investigate active transport',
      prompts: [makePrompt({ id: 'hand-typed-prompt-id', question: 'Describe active transport.' })],
    });

    const existingIds = allIds(buildExistingTopic());
    const reconciled = reconcileImportedTopicIds(editedTopic, [existingTopic]);
    const newDP = reconciled.subTopics[0].dotPoints[2];

    // Fresh id, not the hand-typed placeholder and not a collision with
    // anything already in the tree.
    expect(newDP.id).not.toBe('hand-typed-placeholder-id');
    expect(existingIds).not.toContain(newDP.id);
    expect(newDP.prompts[0].id).not.toBe('hand-typed-prompt-id');
    expect(existingIds).not.toContain(newDP.prompts[0].id);

    const targetTopics = [buildExistingTopic()];
    const merged = mergeOrAddTopic(targetTopics, reconciled);

    // 3 dot points now: the 2 originals, untouched, plus the new one.
    expect(merged.subTopics[0].dotPoints).toHaveLength(3);
    const membraneDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-membrane');
    const osmosisDP = merged.subTopics[0].dotPoints.find((dp) => dp.id === 'dp-osmosis');
    expect(membraneDP?.description).toBe('Investigate membrane transport');
    expect(osmosisDP?.description).toBe('Investigate osmosis');

    const activeTransportDP = merged.subTopics[0].dotPoints.find(
      (dp) => dp.description === 'Investigate active transport'
    );
    expect(activeTransportDP).toBeDefined();
    expect(activeTransportDP?.prompts).toHaveLength(1);
    expect(activeTransportDP?.prompts[0].question).toBe('Describe active transport.');
  });

  // A topic with no match at all (e.g. importing into a course that has
  // never seen this topic before) must still get an entirely fresh id tree,
  // same guarantee `regenerateTopicIds` has always given brand-new imports.
  it('gives a topic with no match a completely fresh id tree, same as regenerateTopicIds', () => {
    const brandNewTopic = makeTopic('brand-new', 'Genetics');
    const reconciled = reconcileImportedTopicIds(brandNewTopic, [buildExistingTopic()]);

    expect(reconciled.id).not.toBe(brandNewTopic.id);
    expect(reconciled.subTopics[0].id).not.toBe(brandNewTopic.subTopics[0].id);
    expect(reconciled.subTopics[0].dotPoints[0].id).not.toBe(
      brandNewTopic.subTopics[0].dotPoints[0].id
    );
    expect(reconciled.subTopics[0].dotPoints[0].prompts[0].id).not.toBe('p1');
    // Content survives the renumbering.
    expect(reconciled.name).toBe('Genetics');
    expect(reconciled.subTopics[0].dotPoints[0].prompts[0].question).toBe(
      'Describe the process.'
    );
  });

  it('does not mutate the existing topics or the imported topic', () => {
    const existingTopic = buildExistingTopic();
    const existingTopicSnapshot = JSON.parse(JSON.stringify(existingTopic));
    const editedTopic = JSON.parse(JSON.stringify(existingTopic)) as Topic;
    editedTopic.subTopics[0].dotPoints[0].description = 'A reworded description';
    const editedTopicSnapshot = JSON.parse(JSON.stringify(editedTopic));

    reconcileImportedTopicIds(editedTopic, [existingTopic]);

    expect(existingTopic).toEqual(existingTopicSnapshot);
    expect(editedTopic).toEqual(editedTopicSnapshot);
  });
});
