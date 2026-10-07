import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { addMissingShippedCourses } from '../../hooks/useSyllabusData';
import { runMigrations, DATA_VERSION, RETIRED_SEED_COURSE_IDS } from '../../utils/storageUtils';
import type { Course } from '../../types';

/**
 * A returning browser keeps the library it saved. Before 2.11.0 that library
 * still held the retired Biology and template courses, and it never re-ran
 * discovery, so the new shipped courses would never have reached it. These
 * tests run the migration against the shipped files themselves.
 */

const SHIPPED = join(process.cwd(), 'public/courseData');
const NEW_COURSE_IDS = [
  'course-hsc-modern-history',
  'course-hsc-legal-studies',
  'course-hsc-business-studies',
  'course-hsc-economics',
  'course-hsc-english-advanced',
];
const SOFTWARE_ENGINEERING = 'course-a48c3436-2379-4b87-b51e-0f4b029d6c98';
const ENTERPRISE_COMPUTING = 'course-ec-01';
const BIOLOGY = 'course-3cb7f305-5233-428e-8255-566fa5c10560';
const TEMPLATE = 'course-template-01';

const course = (id: string, name: string): Course =>
  ({ id, name, outcomes: [], topics: [] }) as Course;

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the 2.11.0 library migration', () => {
  it('retires the Biology and template ids, and only those', () => {
    expect(RETIRED_SEED_COURSE_IDS).toEqual(
      expect.arrayContaining([BIOLOGY, TEMPLATE, 'course-bio-advanced', 'course-chemistry-advanced'])
    );
    expect(RETIRED_SEED_COURSE_IDS).not.toContain(SOFTWARE_ENGINEERING);
    expect(RETIRED_SEED_COURSE_IDS).not.toContain(ENTERPRISE_COMPUTING);
  });

  it('removes retired courses from a library saved before 2.11.0', () => {
    const saved = [
      course(SOFTWARE_ENGINEERING, 'HSC Software Engineering'),
      course(BIOLOGY, 'HSC Biology'),
      course(TEMPLATE, 'Template'),
      course('course-a-teachers-own', "A teacher's own course"),
    ];
    const migrated = runMigrations(saved, '2.10.0');
    expect(migrated.map((c) => c.id)).toEqual([SOFTWARE_ENGINEERING, 'course-a-teachers-own']);
  });

  it('leaves the library alone when it is already at the current version', () => {
    const saved = [course(BIOLOGY, 'HSC Biology')];
    expect(runMigrations(saved, DATA_VERSION).map((c) => c.id)).toEqual([BIOLOGY]);
  });

  it('adds the five shipped courses, drops Biology, and keeps existing courses as they are', async () => {
    serveShipped();
    const saved = [
      course(SOFTWARE_ENGINEERING, 'HSC Software Engineering (edited)'),
      course(ENTERPRISE_COMPUTING, 'HSC Enterprise Computing (edited)'),
      course(BIOLOGY, 'HSC Biology'),
      course(TEMPLATE, 'Template'),
    ];

    const migrated = runMigrations(saved, '2.10.0');
    const result = await addMissingShippedCourses(migrated);

    expect(result.complete).toBe(true);
    const ids = result.courses.map((c) => c.id);
    for (const id of NEW_COURSE_IDS) expect(ids).toContain(id);
    expect(ids).not.toContain(BIOLOGY);
    expect(ids).not.toContain(TEMPLATE);
    expect(ids.filter((id) => id === SOFTWARE_ENGINEERING)).toHaveLength(1);
    expect(result.courses.find((c) => c.id === SOFTWARE_ENGINEERING)?.name).toBe(
      'HSC Software Engineering (edited)'
    );
    expect(result.courses.find((c) => c.id === ENTERPRISE_COMPUTING)?.name).toBe(
      'HSC Enterprise Computing (edited)'
    );
  });

  it('reports incomplete and changes nothing when the manifest cannot be read', async () => {
    serveShipped(['manifest.json']);
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];

    const result = await addMissingShippedCourses(saved);

    expect(result.complete).toBe(false);
    expect(result.courses).toBe(saved);
  });

  it('reports incomplete when a shipped course file is missing, so the next load retries', async () => {
    serveShipped(['HSCModernHistory.json']);
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];

    const result = await addMissingShippedCourses(saved);

    expect(result.complete).toBe(false);
  });
});
