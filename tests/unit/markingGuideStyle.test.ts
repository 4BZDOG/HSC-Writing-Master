import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commandTermsList } from '../../data/commandTerms';
import {
  guideLadderProblem,
  isCriterionOpener,
  guideStyleProblem,
  normaliseGuideRows,
} from '../../utils/markingGuideLadder';
import { formatMarkingCriteria } from '../../utils/dataManagerUtils';
import { isNonStandardRubric } from '../../components/admin/contentAudit/auditModel';
import { normaliseCourseGuides, runMigrations } from '../../utils/storageUtils';
import { stampShipped } from '../../utils/shippedCourseStamp';
import type { Course } from '../../types';

/**
 * An HSC marking guideline is a ladder of performance descriptors, highest mark
 * first, each opening with a capitalised verb in the third person. Courses
 * written from a stale brief arrived as lower-case fragments, noun phrases and
 * passives, and some as ascending lists; the app now rejects and repairs them.
 */

const GOOD = [
  '4 marks: Provides a detailed explanation of caching, using specific terminology',
  '3 marks: Provides a sound explanation of caching with some specific detail',
  '2 marks: Outlines the main features of caching',
  '1 mark: Identifies a relevant feature of caching',
].join('\n');

describe('guideStyleProblem', () => {
  it('accepts rows that open with a third-person verb, an adverb on one, or a bottom-row opener', () => {
    expect(guideStyleProblem(GOOD)).toBeNull();
    expect(
      guideStyleProblem(
        '2 marks: Correctly calculates the ratio\n1 mark: Minimal relevant response'
      )
    ).toBeNull();
    expect(
      guideStyleProblem('2 marks: Discusses both sides\n1 mark: Assesses one side')
    ).toBeNull();
    expect(
      guideStyleProblem('2 marks: Accurately explains the cause\n1 mark: No relevant response')
    ).toBeNull();
  });

  it.each([
    ['a lower-case fragment', '2 marks: explains the cause\n1 mark: names a cause'],
    ['a noun phrase', '2 marks: A clear contrast of both approaches\n1 mark: Identifies one'],
    ['a passive', '2 marks: Provides a reason\n1 mark: one factor is identified'],
    ['a number', '2 marks: Two causes are explained\n1 mark: Identifies one cause'],
    ['a noun in -sis', '2 marks: Analysis of the data\n1 mark: Identifies a trend'],
  ])('rejects %s', (_label, guide) => {
    expect(guideStyleProblem(guide)).toMatch(/opens with/);
  });

  it('is part of the ladder check, so every generation and audit path enforces it', () => {
    expect(guideLadderProblem(GOOD, 4, 4)).toBeNull();
    const lower = GOOD.replace('3 marks: Provides', '3 marks: provides');
    expect(guideLadderProblem(lower, 4, 4)).toMatch(/3-mark row opens with "provides"/);
  });
});

describe('normaliseGuideRows', () => {
  it('puts rows highest mark first and capitalises each criterion', () => {
    const climbing =
      '1 mark: identifies a feature\n2 marks: outlines the features\n3 marks: describes the features';
    expect(normaliseGuideRows(climbing)).toBe(
      '3 marks: Describes the features\n2 marks: Outlines the features\n1 mark: Identifies a feature'
    );
  });

  it('strips bullets and bold and writes labels one way', () => {
    expect(
      normaliseGuideRows('- **5–6 marks**: Makes a judgement\n• 1 marks: Minimal response')
    ).toBe('5-6 marks: Makes a judgement\n1 mark: Minimal response');
  });

  it('drops a closing full stop, as NESA criteria are not full sentences', () => {
    expect(normaliseGuideRows('2 marks: Provides a reason.\n1 mark: Identifies one.')).toBe(
      '2 marks: Provides a reason\n1 mark: Identifies one'
    );
  });

  it('never changes wording and is idempotent', () => {
    expect(normaliseGuideRows(GOOD)).toBe(GOOD);
    const once = normaliseGuideRows('2 marks: b one\n4 marks: a two');
    expect(normaliseGuideRows(once)).toBe(once);
  });

  it('leaves text that is not purely rows alone', () => {
    const preamble = 'Marking guide:\n2 marks: a\n1 mark: b';
    expect(normaliseGuideRows(preamble)).toBe(preamble);
    const wrapped = '2 marks: provides a long\nreason spread over two lines\n1 mark: names one';
    expect(normaliseGuideRows(wrapped)).toBe(wrapped);
  });

  it('is applied by formatMarkingCriteria, so every import and AI path emits the same shape', () => {
    expect(formatMarkingCriteria('1 mark: names one\n2 marks: gives two')).toBe(
      '2 marks: Gives two\n1 mark: Names one'
    );
  });
});

describe('the content audit', () => {
  it('flags a guide whose rows are descending but not HSC-style', () => {
    expect(
      isNonStandardRubric('2 marks: explains the cause well enough\n1 mark: names one cause only')
    ).toBe(true);
    expect(isNonStandardRubric(GOOD)).toBe(false);
  });
});

describe('the 2.14.0 migration', () => {
  const course = (id: string, guide: string): Course => ({
    id,
    name: id,
    outcomes: [],
    topics: [
      {
        id: 't',
        name: 'T',
        subTopics: [
          {
            id: 's',
            name: 'S',
            dotPoints: [
              {
                id: 'd',
                description: 'describe x',
                prompts: [
                  {
                    id: 'p',
                    question: 'Describe x.',
                    verb: 'DESCRIBE',
                    totalMarks: 2,
                    markingCriteria: guide,
                    sampleAnswers: [],
                  } as unknown as Course['topics'][0]['subTopics'][0]['dotPoints'][0]['prompts'][0],
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const guideOf = (c: Course) => c.topics[0].subTopics[0].dotPoints[0].prompts[0].markingCriteria;
  const STALE = '1 mark: names one\n2 marks: describes two';
  const FIXED = '2 marks: Describes two\n1 mark: Names one';

  it('repairs the guides of courses the user owns', () => {
    expect(guideOf(normaliseCourseGuides([course('mine', STALE)])[0])).toBe(FIXED);
  });

  it('leaves an unedited copy of a shipped course for the sync to replace', () => {
    const shipped = stampShipped(course('shipped', STALE));
    expect(guideOf(normaliseCourseGuides([shipped])[0])).toBe(STALE);
  });

  it('repairs an edited copy, which the sync keeps', () => {
    const edited = { ...stampShipped(course('shipped', STALE)), name: 'edited by me' };
    expect(guideOf(normaliseCourseGuides([edited])[0])).toBe(FIXED);
  });

  it('runs for a library saved at 2.13.0 and not for one saved at 2.14.0', () => {
    expect(guideOf(runMigrations([course('mine', STALE)], '2.13.0')[0])).toBe(FIXED);
    expect(guideOf(runMigrations([course('mine', STALE)], '2.14.0')[0])).toBe(STALE);
  });
});

describe("each command verb's generic marking guide", () => {
  // Shown to students in the verb guide and given to the marker when a question
  // has no guide of its own, so it has to read like a marking guideline too.
  it.each(commandTermsList.map((t) => [t.term, t.genericMarkingGuide] as const))(
    '%s runs highest mark first, in performance-descriptor wording',
    (_term, rows) => {
      const parsed = rows.map((row) => row.match(/^(\d+)(?:[-–]\d+|\+)?\s*marks?:\s*(.+)$/));
      parsed.forEach((m, i) => expect(m, rows[i]).not.toBeNull());
      const tops = parsed.map((m) => parseInt(m![1], 10));
      tops.forEach((n, i) => i > 0 && expect(n, rows.join(' | ')).toBeLessThan(tops[i - 1]));
      parsed.forEach((m) => expect(isCriterionOpener(m![2].split(/\s+/)[0]), m![2]).toBe(true));
    }
  );
});

describe('the Software Engineering backup in projectDocs', () => {
  // An older, divergent copy of the course, kept for the questions the shipped
  // course does not have. It used to carry additive bullet lists ("… (1 mark)")
  // that no longer parse as a ladder.
  const guides: { id: string; guide: string }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (typeof o.markingCriteria === 'string' && typeof o.id === 'string')
        guides.push({ id: o.id, guide: o.markingCriteria });
      Object.values(o).forEach(walk);
    }
  };
  walk(JSON.parse(fs.readFileSync('projectDocs/HSCSoftwareEngineering_AllTopics.json', 'utf8')));

  it('has guides that are descending rows in HSC style', () => {
    expect(guides.length).toBeGreaterThan(200);
    const bad = guides
      .filter(({ guide }) => isNonStandardRubric(guide) || guide.trim() === '')
      .map(({ id }) => id);
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
