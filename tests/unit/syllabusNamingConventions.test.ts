import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * The navigator text of every shipped course, held to one convention.
 *
 * A course is named for its subject, with no "HSC " prefix. A topic carries no
 * year prefix or "11–12" suffix, because the year control says the year and a
 * Year 11 and a Year 12 topic may share a name. Core topics are plain names, and
 * option topics are "<group>: <title>" with one group label. Sub-topics are
 * sentence case. Dot points and outcomes read cleanly: a capital, single spaces,
 * curly apostrophes, no trailing full stop, and NESA's lower-case verb form for an
 * outcome. Topic names are unique within each year of a course.
 *
 * Every course and topic file the manifest lists is checked, so a new file that
 * breaks a rule fails here with the text that broke it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = Record<string, any>;

const ROOT = join(process.cwd(), 'public/courseData');

const manifest: { entries: Array<{ file: string; type?: string }> } = JSON.parse(
  readFileSync(join(ROOT, 'manifest.json'), 'utf8')
);
const courseEntries = manifest.entries.filter((e) => e.type === 'course');
const topicEntries = manifest.entries.filter((e) => e.type === 'topic');

const readJson = (file: string): any => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

interface Course {
  file: string;
  name: string;
  topics: Node[];
  outcomes: Node[];
}

const courses: Course[] = courseEntries.flatMap(({ file }) => {
  const parsed = readJson(file);
  const roots: Node[] = Array.isArray(parsed) ? parsed : [parsed];
  return roots.map((c) => ({
    file,
    name: String(c.name ?? ''),
    topics: c.topics ?? [],
    outcomes: c.outcomes ?? [],
  }));
});

/** A topic file holds one topic that the manifest says belongs to a course. */
const topicFiles: Array<{ file: string; topic: Node }> = topicEntries.map(({ file }) => ({
  file,
  topic: readJson(file),
}));

type Kind = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'outcome';
interface Item {
  where: string;
  kind: Kind;
  text: string;
}

const topicItems = (where: string, topic: Node): Item[] => {
  const items: Item[] = [{ where, kind: 'topic', text: String(topic.name ?? '') }];
  for (const subTopic of topic.subTopics ?? []) {
    const at = `${where} › ${topic.name} › ${subTopic.name}`;
    items.push({ where: at, kind: 'subTopic', text: String(subTopic.name ?? '') });
    for (const dotPoint of subTopic.dotPoints ?? []) {
      items.push({ where: at, kind: 'dotPoint', text: String(dotPoint.description ?? '') });
    }
  }
  return items;
};

const courseItems = (course: Course): Item[] => {
  const items: Item[] = [{ where: course.file, kind: 'course', text: course.name }];
  for (const topic of course.topics)
    items.push(...topicItems(`${course.file} (${course.name})`, topic));
  for (const outcome of course.outcomes) {
    items.push({
      where: `${course.file} (${course.name}) outcome ${outcome.code}`,
      kind: 'outcome',
      text: String(outcome.description ?? ''),
    });
  }
  return items;
};

const allItems: Item[] = [
  ...courses.flatMap(courseItems),
  ...topicFiles.flatMap(({ file, topic }) => topicItems(file, topic)),
];

/** The violations of one rule across the items of the given kinds, one readable line each. */
const violations = (kinds: Kind[], check: (text: string, kind: Kind) => string[]): string[] =>
  allItems
    .filter((item) => kinds.includes(item.kind))
    .flatMap((item) =>
      check(item.text, item.kind).map((fault) => `${item.where}: ${fault} — "${item.text}"`)
    );

// ---- The checks. Each returns the faults in one piece of text. ----

const hygiene = (text: string): string[] => {
  const faults: string[] = [];
  if (text !== text.trim()) faults.push('leading or trailing space');
  if (/ {2,}/.test(text)) faults.push('double space');
  if (/[\u00a0\u202f]/.test(text)) faults.push('non-breaking space');
  if (/\p{L}'\p{L}/u.test(text)) faults.push('straight apostrophe between letters (use ’)');
  return faults;
};

const courseName = (text: string): string[] =>
  /^HSC\b/i.test(text.trim()) ? ['starts with "HSC" (a course is named for its subject)'] : [];

/** Rule 2: the year control and the breadcrumb already say the year. */
const topicYear = (text: string): string[] => {
  const faults: string[] = [];
  if (/^Year 1[12]\b/.test(text)) faults.push('year prefix (the year control says the year)');
  if (/\s11\s*[–-]\s*12$/.test(text)) faults.push('"11–12" suffix');
  return faults;
};

/** Rule 3: core topics are plain names; an option topic has one group label. */
const topicGroup = (text: string): string[] => {
  const faults: string[] = [];
  if (/\(core\)/i.test(text) || /^Core study:/i.test(text))
    faults.push('core marker ("(core)" or "Core study:"): a core topic is a plain name');
  // One colon separates an option's group from its title. A case study's NESA title can
  // carry a colon of its own after "(List A): ", so that second colon is allowed.
  const colons = (text.match(/:/g) ?? []).length;
  if (colons > 1 && !/^[^:]+\(List [A-Z]\): /.test(text))
    faults.push('more than one colon (option topics are "<group>: <title>")');
  return faults;
};

const subTopicName = (text: string): string[] => {
  const faults: string[] = [];
  if (!/^(\p{Lu}|\d)/u.test(text)) faults.push('does not start with a capital letter');
  if (/[:.]$/.test(text.trim())) faults.push('ends with a colon or full stop');
  return faults;
};

const dotPoint = (text: string): string[] => {
  const faults: string[] = [];
  // A numeral opens some NESA sentences ("21st-century archaeology …"), so a digit counts as a capital here, and
  // an opening quotation mark may come first ("‘Adolescence’ as a social construct …").
  if (!/^[‘“]?(\p{Lu}|\d)/u.test(text)) faults.push('does not start with a capital letter');
  // A multi-sentence paragraph (an elective's description) may end with a full stop.
  if (!text.includes('. ') && text.trim().endsWith('.')) faults.push('ends with a full stop');
  return faults;
};

const outcome = (text: string): string[] => {
  if (/^\p{Lu}[\p{Ll} ]*: /u.test(text)) return ['starts with a skill label ("Analysis: ")'];
  if (!/^\p{Ll}/u.test(text)) return ['does not start with NESA\'s lower-case verb ("explains …")'];
  return [];
};

// ---- The tests. ----

describe('shipped navigator text follows the naming convention', () => {
  it('reads every course and topic file the manifest lists', () => {
    expect(courses.length).toBe(courseEntries.length);
    expect(topicFiles.length).toBe(topicEntries.length);
    expect(courses.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Biology', 'Software Engineering', 'Modern History'])
    );
    expect(allItems.filter((i) => i.kind === 'dotPoint').length).toBeGreaterThan(1000);
  });

  it('uses single spaces, no non-breaking spaces and curly apostrophes everywhere', () => {
    expect(violations(['course', 'topic', 'subTopic', 'dotPoint', 'outcome'], hygiene)).toEqual([]);
  });

  it('rule 1: a course is named for its subject, with no HSC prefix', () => {
    expect(violations(['course'], courseName)).toEqual([]);
  });

  it('rule 2: a topic has no year prefix or 11–12 suffix', () => {
    expect(violations(['topic'], topicYear)).toEqual([]);
  });

  it('rule 3: core topics are plain names, and an option topic has one group label', () => {
    expect(violations(['topic'], topicGroup)).toEqual([]);
  });

  it('rule 4: sub-topic names are sentence case, with no trailing colon or full stop', () => {
    expect(violations(['subTopic'], subTopicName)).toEqual([]);
  });

  it('rule 5: dot points start with a capital and take no trailing full stop', () => {
    expect(violations(['dotPoint'], dotPoint)).toEqual([]);
  });

  it("rule 6: outcome descriptions use NESA's lower-case verb form, with no skill label", () => {
    expect(violations(['outcome'], outcome)).toEqual([]);
  });

  it('topic names are unique within each year of a course', () => {
    const clashes = courses.flatMap((course) => {
      const seen = new Map<string, string>();
      const found: string[] = [];
      for (const topic of course.topics) {
        const year = topic.year ?? 'year12';
        const key = `${year}|${String(topic.name).trim().toLowerCase()}`;
        if (seen.has(key)) {
          found.push(`${course.file} (${course.name}), ${year}: "${topic.name}" appears twice`);
        }
        seen.set(key, String(topic.name));
      }
      return found;
    });
    expect(clashes).toEqual([]);
  });
});
