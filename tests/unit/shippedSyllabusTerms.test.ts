import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { offSyllabusTermCount } from '../../components/admin/contentAudit/auditModel';

/**
 * Tidy Terms was applied to the shipped seed in 2.59.0, so the Off-Syllabus
 * Terms filter in the Content Studio should read zero on every shipped
 * question. This is the same measurement the filter makes (`offSyllabusTermCount`
 * with the dot point's text), held at zero, so a new seed question or a rule
 * change that puts non-terms back is caught here rather than in the studio.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = join(process.cwd(), 'public/courseData');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

describe('shipped syllabus terms', () => {
  it('has no off-syllabus term left on any shipped prompt', () => {
    const failing: string[] = [];
    for (const entry of manifest.entries.filter((e: any) => e.type === 'course')) {
      const courses = JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8'));
      for (const course of courses)
        for (const topic of course.topics ?? [])
          for (const sub of topic.subTopics ?? [])
            for (const dp of sub.dotPoints ?? [])
              for (const prompt of dp.prompts ?? []) {
                if (offSyllabusTermCount(prompt, dp.description) > 0) failing.push(prompt.id);
              }
    }
    expect(failing).toEqual([]);
  });
});
