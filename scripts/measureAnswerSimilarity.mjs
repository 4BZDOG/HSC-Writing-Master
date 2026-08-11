/**
 * Where does the near-duplicate threshold actually belong?
 *
 * `utils/answerSimilarity.ts` holds a batch back when a generated exemplar
 * scores at or above NEAR_DUPLICATE_THRESHOLD against one already sitting at
 * the same mark. That number was set from two sentences written by hand, which
 * is the right way to start and the wrong place to stop: too low and a teacher
 * is asked to judge every generation until they stop reading the panel; too
 * high and the check never fires.
 *
 * This measures the distribution over whatever course JSON it is given —
 * exports from the Data Vault, or the courses shipped in `public/courseData`.
 * Three populations, because the threshold has to separate the first from the
 * other two:
 *
 *   SAME MARK      two exemplars at one mark on one question. The population
 *                  the check exists to catch, and the only one it looks at.
 *   SAME QUESTION  different marks on one question — the ladder. Frequently
 *                  close in wording by design, and must NOT be flagged.
 *   UNRELATED      different questions. The floor: whatever two answers in one
 *                  subject share simply by being about that subject.
 *
 * Run: node scripts/measureAnswerSimilarity.mjs [file.json …]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// A copy of utils/answerSimilarity.ts, deliberately: this script must be able
// to measure a CANDIDATE metric without the app having adopted it yet. Keep the
// two in step when the real one changes.
const comparableWords = (text) =>
  (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase()
    .match(/[a-z0-9']+/g) ?? [];

const bigrams = (words) => {
  const set = new Set();
  for (let i = 0; i < words.length - 1; i++) set.add(`${words[i]} ${words[i + 1]}`);
  return set;
};

const similarity = (a, b) => {
  const wa = comparableWords(a);
  const wb = comparableWords(b);
  if (!wa.length || !wb.length) return 0;
  const sa = wa.length > 1 && wb.length > 1 ? bigrams(wa) : new Set(wa);
  const sb = wa.length > 1 && wb.length > 1 ? bigrams(wb) : new Set(wb);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const g of sa) if (sb.has(g)) shared++;
  return shared / (sa.size + sb.size - shared);
};

/** Every prompt in a course file, whatever the nesting looks like. */
const collectPrompts = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectPrompts(n, out));
    return out;
  }
  if (Array.isArray(node.sampleAnswers) && node.sampleAnswers.length > 0) out.push(node);
  Object.values(node).forEach((v) => collectPrompts(v, out));
  return out;
};

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : NaN;

const describe = (name, values) => {
  if (!values.length) {
    console.log(`${name.padEnd(14)} no pairs`);
    return;
  }
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((t, v) => t + v, 0) / s.length;
  console.log(
    `${name.padEnd(14)} n=${String(s.length).padStart(6)}  ` +
      `mean ${mean.toFixed(3)}  p50 ${percentile(s, 0.5).toFixed(3)}  ` +
      `p90 ${percentile(s, 0.9).toFixed(3)}  p99 ${percentile(s, 0.99).toFixed(3)}  ` +
      `max ${s[s.length - 1].toFixed(3)}`
  );
};

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      ...readdirSync(join(ROOT, 'public/courseData'))
        .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
        .map((f) => join(ROOT, 'public/courseData', f)),
    ];

const sameMark = [];
const sameQuestion = [];
const unrelated = [];
const allAnswers = [];

for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`skipped ${file}: ${e.message}`);
    continue;
  }
  for (const prompt of collectPrompts(parsed)) {
    const answers = prompt.sampleAnswers.filter((a) => a?.answer?.trim());
    answers.forEach((a) => allAnswers.push(a.answer));
    for (let i = 0; i < answers.length; i++) {
      for (let j = i + 1; j < answers.length; j++) {
        const score = similarity(answers[i].answer, answers[j].answer);
        (answers[i].mark === answers[j].mark ? sameMark : sameQuestion).push(score);
      }
    }
  }
}

// A bounded sample of cross-question pairs — the full cross product is millions.
for (let i = 0; i < Math.min(allAnswers.length, 400); i++) {
  for (let j = i + 1; j < Math.min(allAnswers.length, 400); j++) {
    unrelated.push(similarity(allAnswers[i], allAnswers[j]));
  }
}

console.log(`\n${allAnswers.length} exemplars from ${files.length} file(s)\n`);
describe('SAME MARK', sameMark);
describe('SAME QUESTION', sameQuestion);
describe('UNRELATED', unrelated);

const THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.6];
console.log('\nWhat each threshold would flag:');
for (const t of THRESHOLDS) {
  const caught = sameMark.filter((v) => v >= t).length;
  const ladder = sameQuestion.filter((v) => v >= t).length;
  const noise = unrelated.filter((v) => v >= t).length;
  console.log(
    `  ${t.toFixed(2)}  same-mark ${String(caught).padStart(5)}/${sameMark.length}` +
      `   ladder(false) ${String(ladder).padStart(5)}/${sameQuestion.length}` +
      `   unrelated(false) ${String(noise).padStart(6)}/${unrelated.length}`
  );
}
console.log(
  '\nOnly SAME MARK is ever tested by the app; the other two are shown to say ' +
    'how much room there is before a threshold starts catching them.\n'
);
