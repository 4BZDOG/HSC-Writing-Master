import { describe, it, expect } from 'vitest';
import { allQuestions } from './support/shippedCourseData';
import { getCommandTermInfo } from '../../data/commandTerms';
import { questionCeilingBand, parseMarkingCriteria } from '../../utils/markingGuideParse';
import { promptBandForMark } from '../../utils/guideBands';
import type { Prompt, PromptVerb } from '../../types';

/**
 * One colour per question. The Writing Prompt draws a question in its verb tier's
 * colour (`getTierScaleConfig(tier)` in PromptDisplay); the Syllabus Terms, Marking
 * Guide and Sample Answers panels draw it in `questionCeilingBand`. For two days in
 * October 2026 a 20-mark DISCUSS was blue on the card and purple beside it. Every
 * shipped question is held to the two agreeing, and every exemplar to the band of
 * the guide row that holds it.
 */
describe('one band colour per question', () => {
  const questions = allQuestions();

  it('has questions to check', () => {
    expect(questions.length).toBeGreaterThan(1000);
  });

  it('draws the reference panels in the Writing Prompt’s tier colour', () => {
    const off = questions
      .filter(({ prompt }) => {
        const tier = getCommandTermInfo(prompt.verb as PromptVerb).tier;
        return questionCeilingBand(prompt.totalMarks, prompt.verb as PromptVerb) !== tier;
      })
      .map(({ prompt }) => `${prompt.id} (${prompt.totalMarks} ${prompt.verb})`);
    expect(off).toEqual([]);
  });

  it('puts every exemplar in the band of the guide row that holds its mark', () => {
    const off: string[] = [];
    for (const { prompt } of questions) {
      const tier = getCommandTermInfo(prompt.verb as PromptVerb).tier;
      const rows = parseMarkingCriteria(prompt.markingCriteria ?? '', prompt.totalMarks, tier);
      for (const sa of prompt.sampleAnswers ?? []) {
        const row = rows.find(
          (r) =>
            !r.markLabel.startsWith('Band') &&
            sa.mark >= r.markRange[0] &&
            sa.mark <= r.markRange[1]
        );
        if (row && promptBandForMark(prompt as Prompt, sa.mark) !== row.band) {
          off.push(
            `${sa.id}: ${sa.mark}/${prompt.totalMarks} row ${row.markLabel} is Band ${row.band}`
          );
        }
      }
    }
    expect(off).toEqual([]);
  });
});
