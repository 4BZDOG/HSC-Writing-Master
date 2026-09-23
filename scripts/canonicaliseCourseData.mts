// =============================================================================
// Bring the shipped course files into line with the rules the app applies.
// =============================================================================
//
//   npx tsx scripts/canonicaliseCourseData.mts           # rewrite in place
//   npx tsx scripts/canonicaliseCourseData.mts --check   # report, change nothing
//
// Run it after adding or editing anything under public/courseData/, and before
// `node supabase/seed.mjs`. The seed uploads these files as they are, so every
// inconsistency in them becomes a row in the database — and the database is
// where the paywall reads a sample answer's band
// (`sample_answer_withheld(band, …)` in supabase/schema.sql).
//
// It applies exactly the app's own import rules, imported rather than copied:
//
//   • `repairPromptIntegrity` — a question with no recognisable command verb
//     gets the one the app would infer at runtime (from the question text,
//     else EXPLAIN), and a missing mark value gets the verb's minimum. Those
//     are LISTED, because an inferred verb is a guess a curator should confirm.
//   • `recalculateSampleAnswerBands` — every sample answer's mark is made a
//     whole number the question can award (`wholeSampleMark`: a half mark is
//     rounded down; the database column is an integer, so a 1.5 stops the seed),
//     and every sample answer stores the band its
//     mark is worth on its own question (`getBandForMark` through the verb's
//     tier). The band is not a fact of its own; it is the mark read through the
//     Verb Gate, and a stored copy that disagrees has drifted.
//
// `tests/unit/seedSampleBands.test.ts` fails CI when a shipped file disagrees.
// =============================================================================

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recalculateSampleAnswerBands, repairPromptIntegrity } from '../utils/dataManagerUtils.ts';
import type { Course, Topic } from '../types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'courseData');
const check = process.argv.includes('--check');

const files: { path: string; kind: 'courses' | 'topic' }[] = [
  ...readdirSync(dataDir)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => ({ path: join(dataDir, f), kind: 'courses' as const })),
  ...readdirSync(join(dataDir, 'topics'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ path: join(dataDir, 'topics', f), kind: 'topic' as const })),
];

let bandsFixed = 0;
const marksFixed: string[] = [];
let filesChanged = 0;
const inferredVerbs: string[] = [];

for (const file of files) {
  const raw = readFileSync(file.path, 'utf8');
  const parsed = JSON.parse(raw);
  const courses: Course[] =
    file.kind === 'topic'
      ? [
          {
            id: 'topic-file',
            name: 'topic-file',
            outcomes: [],
            topics: [parsed as Topic],
          } as Course,
        ]
      : Array.isArray(parsed)
        ? parsed
        : [parsed];

  const repaired = recalculateSampleAnswerBands(repairPromptIntegrity(courses));

  // Report what moved, prompt by prompt, against the file as it was.
  courses.forEach((course, ci) =>
    course.topics.forEach((topic, ti) =>
      topic.subTopics.forEach((sub, si) =>
        sub.dotPoints.forEach((dp, di) =>
          dp.prompts.forEach((before, pi) => {
            const after = repaired[ci].topics[ti].subTopics[si].dotPoints[di].prompts[pi];
            if (before.verb !== after.verb) {
              inferredVerbs.push(
                `${after.verb.padEnd(11)} ${String(before.verb ?? '(none)').padEnd(10)} "${before.question.slice(0, 80)}"`
              );
            }
            (before.sampleAnswers ?? []).forEach((sa, i) => {
              const fixed = after.sampleAnswers[i];
              if (sa.band !== fixed.band) bandsFixed++;
              if (sa.mark !== fixed.mark)
                marksFixed.push(
                  `${String(sa.mark).padEnd(5)} → ${fixed.mark}/${after.totalMarks}  "${before.question.slice(0, 70)}"`
                );
            });
          })
        )
      )
    )
  );

  const out =
    file.kind === 'topic' ? repaired[0].topics[0] : Array.isArray(parsed) ? repaired : repaired[0];
  const next = JSON.stringify(out, null, 2) + (raw.endsWith('\n') ? '\n' : '');
  if (next !== raw) {
    filesChanged++;
    if (!check) writeFileSync(file.path, next);
  }
}

console.log(
  `${check ? 'Would change' : 'Changed'} ${filesChanged} of ${files.length} files: ` +
    `${marksFixed.length} sample-answer marks made whole, ` +
    `${bandsFixed} sample-answer bands re-derived from their marks, ` +
    `${inferredVerbs.length} command verbs inferred.`
);
if (marksFixed.length) {
  console.log('\nMarks made whole — a half mark is rounded down; re-mark any that deserve more:');
  for (const line of marksFixed) console.log('  ' + line);
}
if (inferredVerbs.length) {
  console.log('\nInferred verbs — confirm each, and correct the file where the guess is wrong:');
  console.log('  now        was        question');
  for (const line of inferredVerbs) console.log('  ' + line);
}
if (check && filesChanged) process.exit(1);
