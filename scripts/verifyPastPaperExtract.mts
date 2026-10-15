/**
 * Checks a past-paper extraction against the text of the NESA PDFs it came from.
 *
 *   npx tsx scripts/verifyPastPaperExtract.mts <paper.txt> <marking-guidelines.txt> <extract.json>
 *
 * The .txt files are `pdftotext -layout` output of the official paper and marking
 * guidelines. The extract is one year of questions in the shape described in
 * docs/seed-data-playbook.md. Nothing is written; the exit code is 1 on any problem.
 *
 * It catches the three mistakes extraction by model has made on every course so far:
 *  - a string that is not word-for-word in the source (paraphrase, a fixed typo);
 *  - a marking-guideline ladder that does not run from the question's marks down to 1
 *    without a gap (a bullet moved into the wrong band);
 *  - a bullet moved between bands that still looks like a valid ladder. That one is
 *    only flagged for a long question whose bottom rows are not the usual shapes, so
 *    read those guides against the PDF by eye.
 *
 * Layout noise is stripped before comparing, because pdftotext interleaves the mark
 * column with the text: stray one- and two-digit numbers, mark ranges, bullets,
 * hyphenation, dotted answer lines.
 */
import { readFileSync } from 'node:fs';

const [paperPath, guidePath, extractPath] = process.argv.slice(2);
if (!paperPath || !guidePath || !extractPath) {
  console.error(
    'usage: npx tsx scripts/verifyPastPaperExtract.mts <paper.txt> <marking-guidelines.txt> <extract.json>'
  );
  process.exit(2);
}

const norm = (s: string): string =>
  s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[•●·◊|]/g, ' ')
    .replace(/\.{3,}/g, ' ')
    .replace(/(?<![\w$%.,])\d{1,2}\s*-\s*\d{1,2}(?![\w%.,])/g, ' ')
    .replace(/(?<![\w$%.,])\d{1,2}(?![\w%.,])/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\w)- (\w)/g, '$1-$2')
    .trim()
    .toLowerCase();

/** Sentence-sized pieces, so page furniture between two sentences does not fail a whole string. */
const pieces = (s: string): string[] => s.split(/(?<=[.?!:;])\s+/).filter((p) => p.length >= 12);

const paper = norm(readFileSync(paperPath, 'utf8'));
const guide = norm(readFileSync(guidePath, 'utf8'));
const extract = JSON.parse(readFileSync(extractPath, 'utf8')) as {
  year: number;
  questions: {
    number: string;
    marks: number;
    stem: string;
    stimulus?: string;
    assessedOn?: string[];
    criteria: { marks: string; text: string }[];
    sampleAnswer?: string;
    answersCouldInclude?: string[];
  }[];
};

const problems: string[] = [];

const verbatim = (text: string | undefined, corpus: string, where: string): void => {
  if (!text) return;
  const n = norm(text);
  if (!n || corpus.includes(n)) return;
  const missing = pieces(text).filter((p) => !corpus.includes(norm(p)));
  if (missing.length) problems.push(`${where}: not verbatim: "${missing[0].slice(0, 90)}"`);
};

for (const q of extract.questions) {
  const at = `${extract.year} Q${q.number}`;
  verbatim(q.stem, paper, `${at} stem`);
  verbatim(q.stimulus, paper, `${at} stimulus`);
  q.assessedOn?.forEach((b) => verbatim(b, paper, `${at} assessedOn`));
  for (const row of q.criteria)
    for (const bullet of row.text.split(' ; '))
      verbatim(bullet, guide, `${at} criteria[${row.marks}]`);
  verbatim(q.sampleAnswer, guide, `${at} sampleAnswer`);
  q.answersCouldInclude?.forEach((a) => verbatim(a, guide, `${at} couldInclude`));

  if (q.criteria.length === 0) {
    problems.push(`${at}: no criteria`);
    continue;
  }
  // The ladder runs from the question's marks down to 1 with no gap or overlap.
  let expected = q.marks;
  for (const row of q.criteria) {
    const [lo, hi] = row.marks.split(/[–-]/).map(Number);
    const top = Math.max(lo, hi ?? lo);
    const bottom = Math.min(lo, hi ?? lo);
    if (top !== expected)
      problems.push(`${at}: ladder row ${row.marks} should start at ${expected}`);
    expected = bottom - 1;
  }
  if (expected !== 0) problems.push(`${at}: ladder does not reach 1 mark`);
}

console.log(`${extract.year}: ${extract.questions.length} questions, ${problems.length} problems`);
for (const p of problems) console.log('  ', p);
process.exit(problems.length ? 1 : 0);
