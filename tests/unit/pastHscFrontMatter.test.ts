import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Course, Prompt, SampleAnswer } from '../../types';
import { isAnsweredOnOwnText } from '../../utils/pastHscUtils';
import { promptToRow, sampleAnswerToRow } from '../../services/contributionService';

/**
 * A past HSC question keeps the paper's front matter (paper, section, marks, time,
 * the prescribed text a part is set on) beside the question, and its scenario holds
 * only what the student reads to answer. Parts the paper sets once per text with the
 * same wording are one question on "your prescribed text".
 */

const course = (file: string): Course =>
  JSON.parse(readFileSync(join(process.cwd(), 'public/courseData', file), 'utf8'))[0];

const pastQuestions = (c: Course): Prompt[] =>
  c.topics.flatMap((t) =>
    t.subTopics.flatMap((st) => st.dotPoints.flatMap((dp) => dp.prompts.filter((p) => p.isPastHSC)))
  );

const ENGLISH = ['HSCEnglishStandard.json', 'HSCEnglishAdvanced.json'];

describe('English past questions in the seed', () => {
  for (const file of ENGLISH) {
    const questions = pastQuestions(course(file));

    it(`${file}: every question carries its paper and section`, () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const p of questions) {
        expect(p.hscSection, p.id).toMatch(/^Paper [12], Section [IV]+ — /);
        expect(p.hscSection, p.id).not.toMatch(/Question \d/);
      }
    });

    it(`${file}: no scenario opens with front matter or lists the prescribed texts`, () => {
      for (const p of questions) {
        const scenario = p.scenario ?? '';
        expect(scenario, p.id).not.toMatch(/^(Paper \d|Section [IV]+)/);
        expect(scenario, p.id).not.toMatch(/prescribed (texts|poems)[^.]{0,40} are:/);
        expect(scenario, p.id).not.toMatch(/Question \d+(\([a-z]\))? — /);
      }
    });
  }

  const standard = pastQuestions(course('HSCEnglishStandard.json'));
  const combined = standard.filter(isAnsweredOnOwnText);

  it('holds the parts set once per text with the same wording as one question each', () => {
    expect(combined.map((p) => `${p.hscYear} ${p.hscQuestionNumber}`).sort()).toEqual([
      '2021 2(a)–(i)',
      '2022 6(a)–(n)',
      '2024 1(a), (b), (d), (j)',
      '2024 1(c), (h)',
      '2024 1(e), (f), (g), (i), (k)',
    ]);
  });

  it('asks each combined question of any text, and names the text of every exemplar', () => {
    for (const p of combined) {
      expect(p.question, p.id).toMatch(/your prescribed text/);
      expect(p.hscText, p.id).toBeUndefined();
      const answers = p.sampleAnswers ?? [];
      expect(answers.length, p.id).toBeGreaterThan(3);
      for (const a of answers) expect(a.prescribedText, a.id).toBeTruthy();
      // Each text keeps its full set, so a student finds a ladder on their own text.
      const perText = new Map<string, number>();
      for (const a of answers)
        perText.set(a.prescribedText!, (perText.get(a.prescribedText!) ?? 0) + 1);
      expect(new Set(perText.values()), p.id).toEqual(new Set([3]));
    }
  });

  it('leaves no part of a combined question behind as a question of its own', () => {
    const combinedNumbers = new Set(
      combined.flatMap((p) => {
        const [base] = p.hscQuestionNumber!.split('(');
        return [...p.hscQuestionNumber!.matchAll(/\(([a-z])\)|([a-z])\)/g)].map(
          (m) => `${p.hscYear} ${base}(${m[1] ?? m[2]})`
        );
      })
    );
    const leftovers = standard.filter((p) =>
      combinedNumbers.has(`${p.hscYear} ${p.hscQuestionNumber}`)
    );
    expect(leftovers.map((p) => p.id)).toEqual([]);
  });
});

describe('Business Studies, Geography and Biology past questions', () => {
  // As each paper's cover prints it: the section, its marks, the choice when there is
  // one, and the time. These papers have one paper and untitled sections.
  const HEADING =
    /^Section (II|III|IV) \(\d+ marks\)\. (Attempt [^.]+\. )?Allow about [^.]+ for this section\.$/;

  for (const file of ['HSCBusinessStudies.json', 'HSCGeography.json', 'HSCBiology.json']) {
    it(`${file}: every question carries its section heading`, () => {
      const questions = pastQuestions(course(file));
      expect(questions.length).toBeGreaterThan(0);
      for (const p of questions) expect(p.hscSection, p.id).toMatch(HEADING);
    });
  }

  it('puts the Business Studies choice questions in Section IV, and only them', () => {
    for (const p of pastQuestions(course('HSCBusinessStudies.json'))) {
      const number = parseInt(p.hscQuestionNumber ?? '', 10);
      expect(p.hscSection!.startsWith('Section IV'), p.id).toBe(number >= 26);
    }
  });
});

describe('isAnsweredOnOwnText', () => {
  const past = (hscQuestionNumber: string, hscText?: string) =>
    ({ isPastHSC: true, hscQuestionNumber, hscText }) as Prompt;

  it('is true for a range or list of parts with no text named', () => {
    expect(isAnsweredOnOwnText(past('6(a)–(n)'))).toBe(true);
    expect(isAnsweredOnOwnText(past('1(a), (b), (d), (j)'))).toBe(true);
  });

  it('is false for a single part, a part set on a named text, or a practice question', () => {
    expect(isAnsweredOnOwnText(past('23(a)'))).toBe(false);
    expect(isAnsweredOnOwnText(past('6'))).toBe(false);
    expect(isAnsweredOnOwnText(past('6(a)–(n)', 'Drama — Arthur Miller, The Crucible'))).toBe(
      false
    );
    expect(isAnsweredOnOwnText({ hscQuestionNumber: '6(a)–(n)' } as Prompt)).toBe(false);
  });
});

describe('the front matter in Supabase rows', () => {
  const base = { id: 'p', question: 'Q?', totalMarks: 20, verb: 'DISCUSS' } as Prompt;

  it('sends the section and text when set', () => {
    const row = promptToRow(
      { ...base, isPastHSC: true, hscSection: 'Paper 2, Section I', hscText: 'Drama — X' },
      'd',
      'u',
      'private'
    );
    expect(row.hsc_section).toBe('Paper 2, Section I');
    expect(row.hsc_text).toBe('Drama — X');
  });

  it('leaves the columns out when unset, so a database without them still takes the row', () => {
    const row = promptToRow(base, 'd', 'u', 'private');
    expect('hsc_section' in row).toBe(false);
    expect('hsc_text' in row).toBe(false);
    const answer = { id: 'a', band: 5, mark: 20, answer: 'x', source: 'AI' } as SampleAnswer;
    expect('prescribed_text' in sampleAnswerToRow(answer, 'p', 'u', 'private')).toBe(false);
    expect(
      sampleAnswerToRow({ ...answer, prescribedText: 'The Crucible' }, 'p', 'u', 'private')
        .prescribed_text
    ).toBe('The Crucible');
  });
});
