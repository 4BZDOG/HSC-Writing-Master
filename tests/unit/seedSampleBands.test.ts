import { describe, it, expect } from 'vitest';
import { preseededCourses } from '../../data/seedData';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';

/**
 * `SampleAnswer.band` is a CACHE of the Verb Gate, not a fact of its own.
 *
 * Three parts of the app already say so. The v2.4.0 migration rewrites it from
 * `getBandForMark` (`recalculateSampleAnswerBands` in `utils/storageUtils.ts`);
 * `RecalibrateSamplesModal` reports `sample.band !== derivedBand` as a mismatch
 * to repair; and the content audit writes the strict band over it. Every
 * surface that DISPLAYS a band derives it — `SampleAnswersAccordion` computes
 * `calculatedBand` per mark level and paints the placard from that.
 *
 * The bundled seed never meets any of them. Migrations run against STORED
 * courses at a version boundary, and `preseededCourses` is imported at the
 * current `DATA_VERSION`, so `recalculateSampleAnswerBands` has never touched
 * it. Four of its six samples were written `band: 6` on the pre-Verb-Gate
 * assumption that full marks means Band 6 — including a 4/4 DESCRIBE, a Tier 2
 * verb that caps at Band 2. Nothing displayed that number, so it sat there
 * until `SampleAnswerRevisionModal` — the one reader that trusted the stored
 * value — opened a fully purple Band 6 dialog from an orange Band 2 row.
 *
 * That modal now derives its band like everything else, so this is a
 * data-hygiene guard rather than the fix: it keeps the seed honest for the
 * three readers that still take the stored value at face value (the edit
 * form's initial value, `utils/exemplarAudit.ts`, and the recalibrate panel's
 * mismatch report, which would otherwise flag content we ship ourselves).
 *
 * SCOPE. This covers `data/seedData.ts` only. The shipped curriculum under
 * `public/courseData/` has the same defect at a different scale — 536 of its
 * 821 samples disagree with the Verb Gate — and is deliberately NOT asserted
 * here, because fixing it is a data migration, not a test. Those are currently
 * harmless for the same reason the seed's were: nothing renders the stored
 * number. Widen this test when they are corrected.
 */

const everySample = () => {
  const out: { band: number; derived: number; where: string }[] = [];
  for (const course of preseededCourses) {
    for (const topic of course.topics ?? []) {
      for (const subTopic of topic.subTopics ?? []) {
        for (const dotPoint of subTopic.dotPoints ?? []) {
          for (const prompt of dotPoint.prompts ?? []) {
            const tier = getCommandTermInfo(prompt.verb).tier;
            for (const sample of prompt.sampleAnswers ?? []) {
              out.push({
                band: sample.band,
                derived: getBandForMark(sample.mark, prompt.totalMarks, tier),
                where: `${sample.id} (${sample.mark}/${prompt.totalMarks} ${prompt.verb}, tier ${tier})`,
              });
            }
          }
        }
      }
    }
  }
  return out;
};

describe('the bundled seed stores the band the Verb Gate derives', () => {
  it('has samples to check at all', () => {
    // A silent zero here would make the assertion below vacuous — which is how
    // the byte-ceiling guard in checkEagerChunks passed while summing nothing.
    expect(everySample().length).toBeGreaterThan(0);
  });

  it('agrees with getBandForMark on every sample', () => {
    const wrong = everySample()
      .filter(({ band, derived }) => band !== derived)
      .map(({ band, derived, where }) => `${where}: stored ${band}, derived ${derived}`);

    expect(
      wrong,
      'A sample answer stores a band the Verb Gate does not agree with. The stored ' +
        'value is a cache of getBandForMark(mark, totalMarks, verb tier) — the mark ' +
        'and the command verb decide the band, and a full-mark answer to a low-tier ' +
        'verb does NOT reach Band 6. Correct the `band` in data/seedData.ts rather ' +
        'than the formula.'
    ).toEqual([]);
  });
});
