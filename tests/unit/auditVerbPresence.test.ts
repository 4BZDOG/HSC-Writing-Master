import { describe, it, expect } from 'vitest';
import { buildAuditTree, verbNotInQuestion, TreeNode } from '../../components/admin/contentAudit/auditModel';
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

const course = (verb: PromptVerb, question: string): Course =>
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
                    totalMarks: 4,
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
