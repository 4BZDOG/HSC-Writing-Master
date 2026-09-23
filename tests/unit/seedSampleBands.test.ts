import { describe, it, expect } from 'vitest';
import { preseededCourses } from '../../data/seedData';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getBandForMark, getCommandTermInfo, commandTerms } from '../../data/commandTerms';
import { wholeSampleMark } from '../../utils/dataManagerUtils';
import type { Course, PromptVerb, Topic } from '../../types';

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
 * SCOPE. It now covers the shipped curriculum under `public/courseData/` as
 * well. Those files were left out while 675 of their samples disagreed, on the
 * grounds that nothing rendered the stored number. Something did not render it
 * but did READ it: `supabase/seed.mjs` uploads these files as they are, and the
 * Supabase paywall withholds a sample answer by its stored band
 * (`sample_answer_withheld(band, …)`), while the app labels and locks it by the
 * derived one — so the server and the screen disagreed about which exemplars a
 * free student could read. `scripts/canonicaliseCourseData.mts` corrected them;
 * this keeps them corrected.
 */

/** Every course the app ships, from the seed and from `public/courseData/`. */
const shippedCourses = (): { file: string; courses: Course[] }[] => {
  const dir = join(process.cwd(), 'public', 'courseData');
  const files = [
    ...readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
      .map((f) => {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return { file: f, courses: (Array.isArray(data) ? data : [data]) as Course[] };
      }),
    ...readdirSync(join(dir, 'topics'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const topic = JSON.parse(readFileSync(join(dir, 'topics', f), 'utf8')) as Topic;
        return { file: `topics/${f}`, courses: [{ topics: [topic] } as unknown as Course] };
      }),
  ];
  return [{ file: 'data/seedData.ts', courses: preseededCourses }, ...files];
};

const everySample = () => {
  const out: { band: number; derived: number; where: string }[] = [];
  for (const course of shippedCourses().flatMap(({ courses }) => courses)) {
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
        'than the formula — `npx tsx scripts/canonicaliseCourseData.mts` does it for ' +
        'the files under public/courseData.'
    ).toEqual([]);
  });
});

/**
 * The marker awards whole marks, and `sample_answers.mark` is an integer column:
 * 32 shipped samples at 1.5/3 stopped `supabase/seed.mjs` at the first of them,
 * and their derived bands came out as 1.5 and 3.5.
 */
describe('every shipped sample answer has a mark its question can award', () => {
  it('is a whole number from 0 to the question total', () => {
    const bad: string[] = [];
    for (const { file, courses } of shippedCourses())
      for (const course of courses)
        for (const topic of course.topics ?? [])
          for (const subTopic of topic.subTopics ?? [])
            for (const dotPoint of subTopic.dotPoints ?? [])
              for (const prompt of dotPoint.prompts ?? [])
                for (const sample of prompt.sampleAnswers ?? [])
                  if (
                    !Number.isInteger(sample.mark) ||
                    sample.mark < 0 ||
                    sample.mark > prompt.totalMarks
                  )
                    bad.push(`${file}: ${sample.mark}/${prompt.totalMarks} — ${sample.id}`);
    expect(bad, 'Run `npm run content:canonicalise` and re-mark any it rounds down.').toEqual([]);
  });

  it('rounds a half mark down and keeps a mark inside the question', () => {
    expect(wholeSampleMark(1.5, 3)).toBe(1);
    expect(wholeSampleMark('2', 3)).toBe(2);
    expect(wholeSampleMark(7, 5)).toBe(5);
    expect(wholeSampleMark(-1, 5)).toBe(0);
    expect(wholeSampleMark(undefined, 5)).toBe(0);
  });
});

/**
 * A question with no recognisable command verb is marked against a verb the
 * app has to guess, and the database the seed writes stores no verb at all.
 * The canonicaliser writes the verb the app would infer and lists it for a
 * curator to confirm; this keeps a file from shipping without one.
 */
describe('every shipped question names its command verb', () => {
  it('stores a verb the app recognises', () => {
    const missing: string[] = [];
    for (const { file, courses } of shippedCourses()) {
      for (const course of courses)
        for (const topic of course.topics ?? [])
          for (const subTopic of topic.subTopics ?? [])
            for (const dotPoint of subTopic.dotPoints ?? [])
              for (const prompt of dotPoint.prompts ?? [])
                if (!commandTerms.has(prompt.verb as PromptVerb))
                  missing.push(`${file}: ${String(prompt.verb)} — ${prompt.question.slice(0, 60)}`);
    }
    expect(
      missing,
      'Run `npx tsx scripts/canonicaliseCourseData.mts` and confirm the verbs it infers.'
    ).toEqual([]);
  });
});
