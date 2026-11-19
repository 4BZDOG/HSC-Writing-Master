import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  addShippedToLibrary,
  countQuestions,
  fetchShippedCatalogue,
  missingFromLibrary,
  type ShippedCourseOffer,
} from '../../utils/shippedCatalogue';
import { syncShippedCourses } from '../../hooks/useSyllabusData';
import { isUnedited, stampShipped } from '../../utils/shippedCourseStamp';
import { groupCoursesByFaculty } from '../../utils/courseGrouping';
import type { Course } from '../../types';

/**
 * The shipped catalogue behind the course library. A course left unticked in the
 * first-run picker is recorded as offered and the version sync never adds it, so
 * a returning library had no way to get it. The catalogue reads the shipped files
 * the way discovery does, so what the course library adds is what the first-run
 * picker would have added.
 */

const SHIPPED = join(process.cwd(), 'public/courseData');
const BIOLOGY = 'course-hsc-biology';
const HMS = 'course-hsc-health-and-movement-science';
const VISUAL_ARTS = 'course-hsc-visual-arts';

/** Every shipped file, served by name, as the browser would fetch them. */
const serveShipped = (omit: string[] = []) => {
  const files = Object.fromEntries(
    readdirSync(SHIPPED)
      .filter((f) => f.endsWith('.json') && !omit.includes(f))
      .map((f) => [f, readFileSync(join(SHIPPED, f), 'utf8')])
  );
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const name = String(url).split('/').pop() ?? '';
    const body = files[name];
    return body === undefined
      ? new Response('', { status: 404 })
      : new Response(body, { status: 200 });
  });
};

const manifestCourseEntries = (): Array<{ file: string; subject?: string; selected?: boolean }> =>
  JSON.parse(readFileSync(join(SHIPPED, 'manifest.json'), 'utf8')).entries.filter(
    (e: { type?: string }) => e.type !== 'topic'
  );

const offer = (id: string, name: string, subject = 'Science'): ShippedCourseOffer => ({
  id,
  name,
  subject,
  source: `${name}.json`,
  course: { id, name, outcomes: [], topics: [] } as Course,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading the shipped catalogue', () => {
  it('lists every course the manifest lists, ticked by default or not, once each', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    expect(catalogue).toHaveLength(manifestCourseEntries().length);
    expect(new Set(catalogue.map((o) => o.id)).size).toBe(catalogue.length);
    // Unticked at first run: Biology has questions, Visual Arts ships as structure only.
    expect(catalogue.map((o) => o.id)).toEqual(expect.arrayContaining([BIOLOGY, VISUAL_ARTS]));
  });

  it('files each course under the faculty the manifest gives it', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    const bySource = new Map(catalogue.map((o) => [o.source, o]));
    for (const entry of manifestCourseEntries()) {
      expect(bySource.get(entry.file)?.subject).toBe(entry.subject);
    }
    // Health and Movement Science is PDHPE's, though its name says "Science".
    expect(catalogue.find((o) => o.id === HMS)?.subject).toBe('PDHPE');
  });

  it('reads the same courses the version sync reads', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    const { shipped } = await syncShippedCourses([], new Set());
    expect(catalogue.map((o) => o.id).sort()).toEqual([...shipped.keys()].sort());
    for (const o of catalogue) expect(o.course).toEqual(shipped.get(o.id));
  });

  it('leaves out a course file it cannot read when lenient, and throws when strict', async () => {
    serveShipped(['HSCBiology.json']);
    const lenient = await fetchShippedCatalogue({ strict: false });
    expect(lenient.map((o) => o.id)).not.toContain(BIOLOGY);
    expect(lenient.length).toBe(manifestCourseEntries().length - 1);
    await expect(fetchShippedCatalogue({ strict: true })).rejects.toThrow(/HSCBiology/);
  });

  it('throws when the manifest itself cannot be read', async () => {
    serveShipped(['manifest.json']);
    await expect(fetchShippedCatalogue({ strict: false })).rejects.toThrow(/manifest/);
  });

  it('counts questions, so a structure-only course can say so', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    expect(countQuestions(catalogue.find((o) => o.id === VISUAL_ARTS)!.course)).toBe(0);
    expect(countQuestions(catalogue.find((o) => o.id === BIOLOGY)!.course)).toBeGreaterThan(0);
  });
});

describe('what the course library offers', () => {
  const catalogue = [
    offer(BIOLOGY, 'Biology'),
    offer('course-hsc-chemistry', 'Chemistry'),
    offer(HMS, 'Health and Movement Science', 'PDHPE'),
  ];

  it('leaves out a course the library holds by id', () => {
    const library = [{ id: BIOLOGY, name: 'My renamed biology', outcomes: [], topics: [] }];
    expect(missingFromLibrary(catalogue, library).map((o) => o.id)).toEqual([
      'course-hsc-chemistry',
      HMS,
    ]);
  });

  it('leaves out a course the library holds under the same name, "HSC " prefix or not', () => {
    const library = [{ id: 'imported-copy', name: 'HSC Chemistry', outcomes: [], topics: [] }];
    expect(missingFromLibrary(catalogue, library).map((o) => o.id)).toEqual([BIOLOGY, HMS]);
  });

  it('still offers a course whose only trace is a "(before refresh)" backup', () => {
    const library = [
      {
        id: `${BIOLOGY}-before-refresh`,
        name: 'Biology (before refresh)',
        supersededBy: BIOLOGY,
        outcomes: [],
        topics: [],
      } as Course,
    ];
    expect(missingFromLibrary(catalogue, library).map((o) => o.id)).toContain(BIOLOGY);
  });

  it('groups by faculty in the course picker’s order', () => {
    const groups = groupCoursesByFaculty(catalogue);
    expect(groups.map((g) => g.area)).toEqual(['PDHPE', 'Science']);
    expect(groups[1].courses.map((o) => o.name)).toEqual(['Biology', 'Chemistry']);
  });
});

describe('adding from the course library', () => {
  it('adds the course stamped as the first-run picker stamps it, under its faculty', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    const biology = catalogue.find((o) => o.id === BIOLOGY)!;
    const { courses, added } = addShippedToLibrary([], [biology]);
    expect(added).toEqual([biology]);
    expect(courses).toEqual([{ ...stampShipped(biology.course), subject: 'Science' }]);
    // Unedited, so the next sync brings it up to date like any other shipped copy.
    expect(isUnedited(courses[0])).toBe(true);
  });

  it('never duplicates a course already present, nor one chosen twice', () => {
    const existing = { id: BIOLOGY, name: 'Biology', outcomes: [], topics: [] } as Course;
    const chem = offer('course-hsc-chemistry', 'Chemistry');
    const { courses, added } = addShippedToLibrary(
      [existing],
      [offer(BIOLOGY, 'Biology'), chem, chem]
    );
    expect(added.map((o) => o.id)).toEqual(['course-hsc-chemistry']);
    expect(courses.map((c) => c.id)).toEqual([BIOLOGY, 'course-hsc-chemistry']);
    expect(courses[0]).toBe(existing);
  });

  it('does not mutate the library it is given', () => {
    const library: Course[] = [];
    addShippedToLibrary(library, [offer(BIOLOGY, 'Biology')]);
    expect(library).toEqual([]);
  });

  it('keeps an added course through the next version sync, which then leaves it alone', async () => {
    serveShipped();
    const catalogue = await fetchShippedCatalogue({ strict: false });
    const { courses } = addShippedToLibrary([], [catalogue.find((o) => o.id === BIOLOGY)!]);
    const offered = new Set(catalogue.map((o) => o.id));
    const synced = await syncShippedCourses(courses, offered);
    expect(synced.courses).toEqual(courses);
  });
});
