import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { classifySyllabusTerms } from '../../utils/syllabusTermSource';
import { isWeakLoneTerm } from '../../utils/syllabusTermGaps';

/**
 * What the must-use rule actually does to the shipped library.
 *
 * The unit tests around `classifySyllabusTerms` pin the RULES on questions
 * written to exercise them. They cannot see the thing that matters most about a
 * matcher: how much of the real library it moves. A stemmer tweak that looks
 * harmless in isolation can promote or demote a fifth of every terms list at
 * once, and the only symptom is a panel that quietly means something different.
 *
 * So this runs the classifier over the content students actually get, and holds
 * two different kinds of line:
 *
 *  - An INVARIANT, which never needs re-baselining: no must-use term is a lone
 *    command verb or a word the whole course is written in. That was the bug —
 *    "Evaluate" ×4 and "security" ×10 marked as terms a Band 6 answer must use.
 *  - A RANGE, which does: the share of questions carrying a must-use term, and
 *    the share of terms promoted. Deliberately wide, because content is added
 *    all the time and this must fail on a CODE change, not on a course.
 *
 * Measured when set, over 418 questions carrying a terms list: 77.3% of them
 * carried at least one must-use term, and 35.1% of all listed terms were
 * must-use. If a content import moves these legitimately, re-measure and move
 * the bounds in one commit that says so.
 *
 * RE-BASELINED once, and the reason is the point of the test working. Running
 * the studio's two no-AI repairs over the shipped library — Tidy Terms removing
 * 99 entries that were not syllabus terms, Add Terms appending 151 the dot
 * point and question are built on — moved both figures, and this test is what
 * noticed. It is a legitimate move BY CONSTRUCTION: Add Terms appends terms
 * taken from the question's own sources, and a term from those sources is a
 * must-use term by definition. Now 85.4% of questions and 40.3% of terms.
 */

const ROOT = join(process.cwd(), 'public/courseData');

type AnyNode = Record<string, any>;

const courseFiles = (): string[] => {
  const files = readdirSync(ROOT)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => join(ROOT, f));
  const topics = join(ROOT, 'topics');
  if (existsSync(topics))
    files.push(
      ...readdirSync(topics)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(topics, f))
    );
  return files;
};

/** A course file holds `topics`; a topic file IS a topic. */
const topicsOf = (parsed: unknown): AnyNode[] => {
  if (Array.isArray(parsed)) return parsed.flatMap((c: AnyNode) => c.topics || []);
  const node = parsed as AnyNode;
  if (Array.isArray(node?.topics)) return node.topics;
  if (Array.isArray(node?.subTopics)) return [node];
  return [];
};

interface Row {
  question: string;
  terms: string[];
  mustUse: string[];
}

const rows = (): Row[] => {
  const out: Row[] = [];
  for (const file of courseFiles()) {
    for (const topic of topicsOf(JSON.parse(readFileSync(file, 'utf8')))) {
      for (const subTopic of topic.subTopics || []) {
        for (const dotPoint of subTopic.dotPoints || []) {
          for (const prompt of dotPoint.prompts || []) {
            const terms: string[] = (prompt.keywords || []).filter(
              (k: unknown) => typeof k === 'string' && k.trim()
            );
            if (terms.length === 0) continue;
            const named = classifySyllabusTerms(terms, {
              question: prompt.question,
              scenario: prompt.scenario,
              dotPointText: dotPoint.description,
              subTopicName: subTopic.name,
              topicName: topic.name,
            });
            out.push({
              question: String(prompt.question || ''),
              terms,
              mustUse: terms.filter((t) => named.has(t)),
            });
          }
        }
      }
    }
  }
  return out;
};

describe('must-use terms across the shipped library', () => {
  const all = rows();

  it('has content to measure', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('never promotes a lone command verb or a word the course is written in', () => {
    const offenders = all
      .flatMap((row) => row.mustUse.filter(isWeakLoneTerm).map((t) => `${t} — ${row.question}`))
      .slice(0, 10);
    expect(offenders).toEqual([]);
  });

  it('leaves most questions carrying at least one must-use term', () => {
    const withOne = all.filter((row) => row.mustUse.length > 0).length;
    const share = withOne / all.length;
    // Measured at 85.4% after the term repair (77.3% before it). Below 75% the
    // matcher has stopped seeing questions it used to; above 93% it is
    // promoting terms nothing really names — the repair cannot push it there,
    // since it only ever adds terms a source already contains.
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.93);
  });

  it('keeps the split meaningful — a minority of terms are must-use', () => {
    const terms = all.reduce((n, row) => n + row.terms.length, 0);
    const mustUse = all.reduce((n, row) => n + row.mustUse.length, 0);
    const share = mustUse / terms;
    // Measured at 40.3% after the term repair (35.1% before it). Past half,
    // "must-use" has stopped distinguishing anything and the panel's two groups
    // say the same thing — which is the line that matters, so it has not moved.
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
  });
});
