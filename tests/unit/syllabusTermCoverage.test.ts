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
 * carry at least one must-use term, and 35.1% of all listed terms are must-use.
 * If a content import moves these legitimately, re-measure and move the bounds
 * in one commit that says so.
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
    // Measured at 77.3%. Below 70% the matcher has stopped seeing questions it
    // used to; above 85% it is promoting terms nothing really names.
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.85);
  });

  it('keeps the split meaningful — a minority of terms are must-use', () => {
    const terms = all.reduce((n, row) => n + row.terms.length, 0);
    const mustUse = all.reduce((n, row) => n + row.mustUse.length, 0);
    const share = mustUse / terms;
    // Measured at 35.1%. Past half, "must-use" has stopped distinguishing
    // anything and the panel's two groups say the same thing.
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.5);
  });
});
