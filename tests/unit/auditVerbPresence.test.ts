import { describe, it, expect } from 'vitest';
import {
  buildAuditTree,
  verbNotInQuestion,
  verbIsMistagged,
  TreeNode,
} from '../../components/admin/contentAudit/auditModel';
import { getCommandTermInfo } from '../../data/commandTerms';
import { Course, PromptVerb } from '../../types';

/**
 * The Content Audit now asks whether a question uses the verb it is tagged with.
 *
 * Nothing asked before, which is how twelve questions shipped carrying a verb
 * their own text never uses — five opening with "Analyse" tagged CLARIFY, a
 * tier 2 term, so a full-mark response could reach Band 2 and no further. The
 * band ceiling is the damage; the uncoloured verb is only the visible half.
 *
 * It flags rather than fixes. Which verb governs "Convert this length … and
 * justify …" is a marker's call.
 */

const course = (verb: PromptVerb, question: string, totalMarks = 4): Course =>
  ({
    id: 'c1',
    name: 'Course',
    outcomes: [{ code: 'X-1', description: 'd' }],
    topics: [
      {
        id: 't1',
        name: 'Topic',
        subTopics: [
          {
            id: 's1',
            name: 'Sub',
            dotPoints: [
              {
                id: 'd1',
                description: 'Dot point',
                prompts: [
                  {
                    id: 'p1',
                    question,
                    verb,
                    totalMarks,
                    keywords: [],
                    linkedOutcomes: [],
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

const promptNode = (c: Course): TreeNode => {
  const find = (n: TreeNode): TreeNode | undefined =>
    n.type === 'prompt' ? n : (n.children ?? []).map(find).find(Boolean);
  const node = buildAuditTree([c]).map(find).find(Boolean);
  if (!node) throw new Error('no prompt node in the tree');
  return node;
};

describe('audit: the verb the question does not use', () => {
  it('flags a question whose recorded verb is absent from it', () => {
    // The exact shape that shipped: tagged CLARIFY, text says "Analyse".
    const node = promptNode(
      course('CLARIFY' as PromptVerb, 'Analyse the relationship between asbestos and mesothelioma.')
    );
    expect(node.stats.verbNotInQuestion).toBe(1);
    expect(verbNotInQuestion(node)).toBe(true);
  });

  it('does not flag a question that uses its verb', () => {
    const node = promptNode(course('ANALYSE' as PromptVerb, 'Analyse the relationship.'));
    expect(node.stats.verbNotInQuestion).toBe(0);
    expect(verbNotInQuestion(node)).toBe(false);
  });

  it('accepts the verb in an inflected form', () => {
    // Shares `createKeywordRegex` with the highlighter, so the flag and the
    // colour can never disagree about what counts as present.
    const node = promptNode(
      course('IDENTIFY' as PromptVerb, 'Having identified the enzyme, explain its role.')
    );
    expect(node.stats.verbNotInQuestion).toBe(0);
  });

  it('rolls the count up through every level, so a filter finds it', () => {
    const tree = buildAuditTree([course('CLARIFY' as PromptVerb, 'Analyse the relationship.')]);
    // Found by type rather than by index: the tree's depth is the model's
    // business, and a test that hard-codes it breaks on an unrelated change.
    const byType = (n: TreeNode, type: string): TreeNode | undefined =>
      n.type === type ? n : (n.children ?? []).map((c) => byType(c, type)).find(Boolean);
    for (const level of ['course', 'topic', 'subTopic', 'dotPoint']) {
      const node = tree.map((n) => byType(n, level)).find(Boolean);
      expect(node, `no ${level} node`).toBeDefined();
      expect(node!.stats.verbNotInQuestion, `${level} did not roll the count up`).toBe(1);
    }
  });
});

/**
 * The length floor. A question of 7 marks or more has to carry a verb of a
 * matching tier (`minimumTierForMarks`), so a long question can open with a
 * lower verb and still be correctly tagged with the higher one it needs.
 * Flagging that would be the rule fighting the playbook.
 */
describe('audit: a verb tag the length floor requires is not a mistag', () => {
  it('does not flag a 20-mark "Analyse how…" tagged DISCUSS', () => {
    const node = promptNode(
      course(
        'DISCUSS' as PromptVerb,
        'Analyse how the composer builds tension across the extract.',
        20
      )
    );
    expect(node.stats.verbNotInQuestion).toBe(0);
  });

  it('does not flag a 20-mark "To what extent…" tagged ASSESS (verbless stem)', () => {
    const node = promptNode(
      course('ASSESS' as PromptVerb, 'To what extent did the reforms change rural life?', 20)
    );
    expect(node.stats.verbNotInQuestion).toBe(0);
  });

  it('does not flag an "In what ways…" stem that mentions "the extract"', () => {
    // "extract" here is a noun mid-sentence, and the stem opens with no command verb.
    const node = promptNode(
      course(
        'DISCUSS' as PromptVerb,
        'In what ways is this closing scene, and the extract as a whole, a resolution?',
        20
      )
    );
    expect(node.stats.verbNotInQuestion).toBe(0);
  });

  it('does not flag a 10-mark "Compare…" tagged ANALYSE (Compare is below the floor)', () => {
    // COMPARE is Tier 3 and a 10-mark question needs Tier 4, so ANALYSE is the stand-in.
    const node = promptNode(
      course('ANALYSE' as PromptVerb, 'Compare the two perspectives on the treaty.', 10)
    );
    expect(node.stats.verbNotInQuestion).toBe(0);
  });

  it('still flags a 3-mark "Analyse…" tagged CLARIFY (no floor at 3 marks)', () => {
    const node = promptNode(
      course('CLARIFY' as PromptVerb, 'Analyse the relationship between the two.', 3)
    );
    expect(node.stats.verbNotInQuestion).toBe(1);
  });

  it('flags a 15-mark "Evaluate…" tagged DISCUSS, because EVALUATE is Tier 6 (above the Tier 5 floor)', () => {
    expect(getCommandTermInfo('EVALUATE' as PromptVerb).tier).toBe(6);
    expect(getCommandTermInfo('DISCUSS' as PromptVerb).tier).toBe(5);
    const node = promptNode(
      course('DISCUSS' as PromptVerb, 'Evaluate the success of the policy.', 15)
    );
    expect(node.stats.verbNotInQuestion).toBe(1);
  });
});

describe('audit: verbIsMistagged', () => {
  it('ignores a leading quotation mark before the opening verb', () => {
    expect(verbIsMistagged('"Analyse the extract."', 'CLARIFY', 3)).toBe(true);
    expect(verbIsMistagged('"Analyse the extract."', 'ANALYSE', 3)).toBe(false);
  });

  it('is never true when the tagged verb appears in the question', () => {
    expect(verbIsMistagged('Explain, then analyse the data.', 'ANALYSE', 3)).toBe(false);
  });

  it('is false for a stem with no command verb at all', () => {
    expect(verbIsMistagged('The reasons for the war were many.', 'EXPLAIN', 3)).toBe(false);
  });
});
