import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { outcomesForYear, yearOfTopic } from '../../utils/syllabusYear';

/**
 * Every shipped prompt must link at least one outcome from its own year.
 *
 * A Year 12 question that links only Year 11 outcome codes is linked to no
 * outcome the course offers for its year, so the Content Studio's "No
 * Outcomes" filter flags it (the filter reads only the topic's own year,
 * through `outcomesForYear`). In 2.58.0 100 shipped
 * questions (Geography, Ancient History, English Standard) were found linked
 * only to the other year's outcomes and were re-linked. This test stops that
 * coming back unnoticed when a course is edited or added.
 *
 * Courses with no outcomes, and prompts whose year has no outcomes to link to,
 * are skipped: there is nothing valid to check them against.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = join(process.cwd(), 'public/courseData');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

const failures: string[] = [];
for (const entry of manifest.entries.filter((e: any) => e.type === 'course')) {
  const raw = JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8'));
  const courses: any[] = Array.isArray(raw) ? raw : [raw];
  for (const course of courses) {
    if (!course.outcomes?.length) continue;
    for (const topic of course.topics ?? []) {
      const year = yearOfTopic(topic);
      const valid = new Set(outcomesForYear(course, year).map((o) => o.code));
      if (valid.size === 0) continue;
      for (const sub of topic.subTopics ?? [])
        for (const dp of sub.dotPoints ?? [])
          for (const p of dp.prompts ?? []) {
            const linked: string[] = p.linkedOutcomes ?? [];
            if (!linked.some((code) => valid.has(code)))
              failures.push(
                `${course.name ?? entry.file} (${year}) ${p.id}: linked [${linked.join(', ')}]`
              );
          }
    }
  }
}

describe('shipped questions link outcomes from their own year', () => {
  it('has no prompt linked only to the other year’s outcomes', () => {
    expect(failures).toEqual([]);
  });
});
