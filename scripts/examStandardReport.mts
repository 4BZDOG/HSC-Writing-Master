/**
 * How far each shipped course sits from the shape of a real HSC paper.
 *
 *   npm run content:report            every course, one line each
 *   npm run content:report -- --list  also name the questions behind each count
 *
 * The indicators are the ones a real paper makes cheap to see:
 *  - exam-length: questions of 15+ marks, the extended responses a paper ends with
 *  - restating: stems that only repeat their dot point, with no task of their own
 *  - verbless: stems that open with something other than a command term
 *    ("How…", "Why…", "To what extent…"), which is how real stems are written
 *  - short-form: 7-10 mark questions, a range real papers rarely use for one part
 *  - past: questions flagged as past HSC questions
 *
 * It reads public/courseData and changes nothing; it is a work list, not a gate.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { commandTermsList } from '../data/commandTerms';

const VERBS = new Set(commandTermsList.map((t) => t.term.split(' ')[0]));
const STOP = new Set(
  'the a an of and or to in for on with by as at from is are be this that these those their its it into how what why which using use used'.split(
    ' '
  )
);
const words = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = join(process.cwd(), 'public/courseData');
const list = process.argv.includes('--list');

const rows: string[][] = [];
const named: Record<string, string[]> = {};

for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
  const course = (JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as any[])[0];
  const counts = { total: 0, examLength: 0, shortForm: 0, restating: 0, verbless: 0, past: 0 };
  for (const topic of course.topics ?? [])
    for (const sub of topic.subTopics ?? [])
      for (const dp of sub.dotPoints ?? [])
        for (const p of dp.prompts ?? []) {
          counts.total++;
          const flag = (key: keyof typeof counts) => {
            counts[key]++;
            (named[`${course.name} · ${key}`] ??= []).push(p.id);
          };
          if (p.totalMarks >= 15) counts.examLength++;
          if (p.totalMarks >= 7 && p.totalMarks <= 10) flag('shortForm');
          const stem = words(p.question);
          const dot = words(dp.description);
          const overlap = [...stem].filter((w) => dot.has(w)).length;
          if (stem.size > 0 && overlap / stem.size >= 0.7) flag('restating');
          if (!VERBS.has(String(p.question).trim().split(/\s+/)[0].toUpperCase())) flag('verbless');
          if (p.isPastHSC) counts.past++;
        }
  rows.push([
    course.name.replace('HSC ', ''),
    ...Object.values(counts).map(String),
    `${Math.round((counts.restating / counts.total) * 100)}%`,
  ]);
}

const head = [
  'course',
  'questions',
  'exam-length',
  'short-form',
  'restating',
  'verbless',
  'past',
  'restating %',
];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join('  ');
console.log(line(head));
for (const r of rows) console.log(line(r));
if (list)
  for (const [key, ids] of Object.entries(named).sort())
    console.log(`\n${key} (${ids.length})\n  ${ids.join(' ')}`);
