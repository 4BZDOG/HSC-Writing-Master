import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * An id identifies one thing.
 *
 * Software Engineering shipped with two dot points wearing `dp-1762984770472-i9mtydz`
 * — the same syllabus dot point filed under both "Designing software" and
 * "Developing secure code", sharing a question and its two exemplars — and a
 * second pair, `dp-1763034567890-ghij678`, where two GENUINELY DIFFERENT dot
 * points had been given one id. The first needed a merge, the second a fresh
 * id; the scan below cannot tell them apart, which is the point. It says
 * "these collide", and a person decides which kind it is.
 *
 * It matters because an id is the React key, the IndexedDB record, the
 * accordion `resetKey`, and per-question progress. Two rows sharing one is a
 * correctness problem before it is a content one.
 *
 * The per-topic files under `topics/` are scanned too: they ship in the
 * manifest and import independently, so fixing only the aggregated course would
 * let an import put the duplicate straight back.
 */

const ROOT = join(process.cwd(), 'public/courseData');

type AnyNode = Record<string, any>;

const courseFiles = (): string[] => {
  const files = readdirSync(ROOT)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => join(ROOT, f));
  const topics = join(ROOT, 'topics');
  if (existsSync(topics))
    files.push(...readdirSync(topics).filter((f) => f.endsWith('.json')).map((f) => join(topics, f)));
  return files;
};

/** A course file holds `topics`; a topic file IS a topic. */
const topicsOf = (parsed: unknown): AnyNode[] => {
  const roots = (Array.isArray(parsed) ? parsed : [parsed]) as AnyNode[];
  return roots.flatMap((r) => (r?.topics ? r.topics : r?.subTopics ? [r] : []));
};

describe('shipped course data: every id identifies one thing', () => {
  it.each(courseFiles().map((f) => [f.replace(ROOT + '/', ''), f]))(
    '%s has no id used twice',
    (_name, file) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
      }

      const seen: Record<string, Map<string, string[]>> = {
        subTopic: new Map(),
        dotPoint: new Map(),
        prompt: new Map(),
        sampleAnswer: new Map(),
      };
      const note = (kind: string, id: unknown, where: string) => {
        if (typeof id !== 'string' || !id) return;
        seen[kind].set(id, [...(seen[kind].get(id) ?? []), where]);
      };

      for (const topic of topicsOf(parsed))
        for (const sub of topic.subTopics ?? []) {
          note('subTopic', sub.id, sub.name);
          for (const dot of sub.dotPoints ?? []) {
            note('dotPoint', dot.id, sub.name);
            for (const prompt of dot.prompts ?? []) {
              note('prompt', prompt.id, sub.name);
              for (const sample of prompt.sampleAnswers ?? [])
                note('sampleAnswer', sample.id, prompt.id);
            }
          }
        }

      const collisions: string[] = [];
      for (const [kind, map] of Object.entries(seen))
        for (const [id, where] of map)
          if (where.length > 1) collisions.push(`${kind} ${id} appears ${where.length}x: ${where.join(' | ')}`);

      expect(collisions, collisions.join('\n')).toEqual([]);
    }
  );
});
