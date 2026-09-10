import { describe, it, expect } from 'vitest';
import { buildLlmSeedInstructions, buildSeedExportFile } from '../../utils/llmSeedBrief';
import { analyzeAndSanitizeImportData, getLLMImportTemplate } from '../../utils/dataManagerUtils';
import { commandTermsList } from '../../data/commandTerms';
import type { Course } from '../../types';

/**
 * An export is a seeding brief as well as a backup.
 *
 * A teacher filling a course with an external LLM hands it a file. The file was
 * a bare array of courses, so the model could see the SHAPE and had to guess
 * every rule that shape does not carry — which verbs are legal, how a marking
 * guide is written line by line, which terms belong on a question's list. The
 * rules now travel in the file, and the round trip is what makes that safe:
 * whatever the model returns must still import.
 */
const course = (): Course =>
  ({
    id: 'c1',
    name: 'HSC Software Engineering',
    outcomes: [{ code: 'SE-12-01', description: 'applies structured processes' }],
    topics: [
      {
        id: 't1',
        name: 'Software automation',
        subTopics: [
          {
            id: 's1',
            name: 'Testing and debugging',
            dotPoints: [
              {
                id: 'd1',
                description: 'apply testing methodologies to a software solution',
                prompts: [
                  {
                    id: 'p1',
                    question: 'Assess the effectiveness of automated unit testing.',
                    verb: 'ASSESS',
                    totalMarks: 6,
                    keywords: ['automated unit testing', 'regression testing'],
                    linkedOutcomes: ['SE-12-01'],
                    markingCriteria: '6 marks: Makes a judgement.',
                    sampleAnswers: [],
                    isPastHSC: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }) as unknown as Course;

describe('the authoring brief an export carries', () => {
  it('imports back through the app, brief and all', () => {
    const file = JSON.parse(buildSeedExportFile([course()]));
    expect(file._instructions_for_llm).toBeTruthy();

    const analysed = analyzeAndSanitizeImportData(file);
    expect(analysed.type).toBe('courses');
    expect(analysed.data[0].name).toBe('HSC Software Engineering');
    expect(analysed.data[0].topics[0].subTopics[0].dotPoints[0].prompts[0].question).toBe(
      'Assess the effectiveness of automated unit testing.'
    );
  });

  it('derives the verb list from the app rather than restating it', () => {
    const listed = Object.values(buildLlmSeedInstructions().VERBS.TYPICAL_MARKS).join(', ');
    // Every canonical verb, with the mark range the app itself enforces.
    commandTermsList.forEach((verb) => {
      expect(listed).toContain(`${verb.term} ${verb.markRange[0]}-${verb.markRange[1]}`);
    });
  });

  it('states the rules a bare array cannot carry', () => {
    const brief = buildLlmSeedInstructions();
    // The must-use split is derived by matching terms back against the
    // question's own context, so a model writing terms in different words
    // breaks it silently — the brief has to say so.
    expect(brief.SYLLABUS_TERMS.MUST_USE_FIRST).toMatch(/must-use/i);
    expect(brief.SAMPLE_ANSWERS.TERMS).toMatch(/must-use/i);
    expect(brief.MARKING_CRITERIA.SHAPE).toMatch(/lines/i);
  });

  it('gives the empty template the same rules plus the shape to fill', () => {
    const template = JSON.parse(getLLMImportTemplate());
    expect(template.data).toEqual([]);
    expect(template._instructions_for_llm.SYLLABUS_TERMS.MUST_USE_FIRST).toBeTruthy();

    const shapedPrompt =
      template._instructions_for_llm.SHAPE.topics[0].subTopics[0].dotPoints[0].prompts[0];
    ['question', 'verb', 'totalMarks', 'markingCriteria', 'keywords', 'sampleAnswers'].forEach(
      (field) => expect(shapedPrompt).toHaveProperty(field)
    );
  });
});
