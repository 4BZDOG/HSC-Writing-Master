import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DATA_VERSION,
  isOlderThan,
  runMigrations,
  safeGetItem,
  safeSetItem,
  validateCourses,
  validateStatePath,
  exportDataAsJSON,
  importDataFromJSON,
} from '../../utils/storageUtils';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { Course, Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * The migration engine is the one piece of this app that rewrites a teacher's
 * saved work without being asked. It runs once, on boot, against data nobody
 * is looking at — so a mistake here is invisible until an exemplar has already
 * gone. It had no tests at all.
 */

const makeSample = (overrides: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id: 'sa-1',
    answer: 'A sample response.',
    mark: 4,
    band: 1,
    feedback: 'Solid.',
    source: 'AI',
    ...overrides,
  }) as SampleAnswer;

const makePrompt = (overrides: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the process.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    sampleAnswers: [],
    ...overrides,
  }) as Prompt;

/** A one-course tree wrapping the given prompts. */
const makeCourses = (prompts: Prompt[]): Course[] => [
  {
    id: 'c1',
    name: 'Course',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Topic',
        subTopics: [
          { id: 's1', name: 'Sub', dotPoints: [{ id: 'd1', description: 'Dot', prompts }] },
        ],
      },
    ],
  } as Course,
];

const promptsOf = (courses: Course[]) => courses[0].topics[0].subTopics[0].dotPoints[0].prompts;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('isOlderThan', () => {
  it('orders versions numerically, not as strings', () => {
    expect(isOlderThan('2.2.0', '2.4.0')).toBe(true);
    expect(isOlderThan('2.4.0', '2.2.0')).toBe(false);
    expect(isOlderThan('2.4.0', '2.4.0')).toBe(false);
  });

  // The bug this function exists for: '2.10.0' < '2.2.0' is TRUE as a string
  // comparison, because '1' sorts before '2'.
  it('does not think 2.10.0 is older than 2.2.0', () => {
    expect('2.10.0' < '2.2.0').toBe(true); // what the guards used to do
    expect(isOlderThan('2.10.0', '2.2.0')).toBe(false);
    expect(isOlderThan('2.10.0', '2.4.0')).toBe(false);
    expect(isOlderThan('2.9.0', '2.10.0')).toBe(true);
  });

  it('treats a missing or malformed version as older than everything', () => {
    expect(isOlderThan('', '2.0.0')).toBe(true);
    expect(isOlderThan(undefined as unknown as string, '2.0.0')).toBe(true);
    expect(isOlderThan('not-a-version', '2.0.0')).toBe(true);
  });

  it('compares versions of differing length', () => {
    expect(isOlderThan('2.4', '2.4.1')).toBe(true);
    expect(isOlderThan('2.4.0', '2.4')).toBe(false);
    expect(isOlderThan('3', '2.9.9')).toBe(false);
  });
});

describe('runMigrations — the guards', () => {
  // The scenario the string comparison would have broken: a user already on a
  // two-digit minor version, whose exemplars must be left exactly as they are.
  it('re-runs nothing for data already at a two-digit minor version', () => {
    const duplicated = [
      makeSample({ id: 'sa-low', answer: 'Same text.', mark: 2 }),
      makeSample({ id: 'sa-high', answer: 'Same text.', mark: 4 }),
    ];
    const courses = makeCourses([makePrompt({ sampleAnswers: duplicated })]);

    const migrated = runMigrations(courses, '2.10.0');

    // Both exemplars survive: the 2.2.2 deduplication did not re-run and
    // delete the one a teacher added afterwards.
    expect(promptsOf(migrated)[0].sampleAnswers).toHaveLength(2);
  });

  it('still applies everything to data from before versioning', () => {
    const courses = makeCourses([
      makePrompt({
        sampleAnswers: [
          makeSample({ id: 'sa-low', answer: 'Same text.', mark: 2 }),
          makeSample({ id: 'sa-high', answer: 'Same text.', mark: 4 }),
        ],
      }),
    ]);

    const migrated = runMigrations(courses, '1.0.0');

    expect(promptsOf(migrated)[0].sampleAnswers).toHaveLength(1);
    expect(promptsOf(migrated)[0].sampleAnswers?.[0].mark).toBe(2); // the lower one
  });

  it('leaves data already at the current version untouched', () => {
    const courses = makeCourses([makePrompt({ sampleAnswers: [makeSample()] })]);
    const migrated = runMigrations(courses, DATA_VERSION);

    expect(migrated).toEqual(courses);
  });

  it('never mutates the array it was handed', () => {
    const courses = makeCourses([makePrompt()]);
    const before = JSON.stringify(courses);

    runMigrations(courses, '1.0.0');

    expect(JSON.stringify(courses)).toBe(before);
  });
});

describe('runMigrations — the individual steps', () => {
  it('2.0.0: gives a dot point with no prompts an empty list', () => {
    const courses = makeCourses(undefined as unknown as Prompt[]);
    const migrated = runMigrations(courses, '1.0.0');

    expect(promptsOf(migrated)).toEqual([]);
  });

  it('2.0.1: gives every sample answer an id', () => {
    const courses = makeCourses([
      makePrompt({ sampleAnswers: [makeSample({ id: undefined as unknown as string })] }),
    ]);

    const migrated = runMigrations(courses, '2.0.0');

    expect(promptsOf(migrated)[0].sampleAnswers?.[0].id).toBeTruthy();
  });

  it('2.0.3: normalises marking criteria that arrived as an array', () => {
    const courses = makeCourses([
      makePrompt({
        markingCriteria: ['2 marks: full', '1 mark: partial'] as unknown as string,
      }),
    ]);

    const migrated = runMigrations(courses, '2.0.2');

    expect(typeof promptsOf(migrated)[0].markingCriteria).toBe('string');
    expect(promptsOf(migrated)[0].markingCriteria).toContain('2 marks: full');
  });

  it('2.1.0: fills in the past-HSC fields rather than leaving them undefined', () => {
    const courses = makeCourses([makePrompt()]);
    const migrated = runMigrations(courses, '2.0.3');

    expect(promptsOf(migrated)[0].isPastHSC).toBe(false);
  });

  it('2.4.0: recalculates sample-answer bands from the verb tier', () => {
    // Stored with a stale band of 1; the NESA-aligned formula gives something
    // derived from the mark, the total and the verb's tier.
    const courses = makeCourses([
      makePrompt({ verb: 'EVALUATE' as PromptVerb, totalMarks: 8, sampleAnswers: [makeSample({ mark: 8, band: 1 })] }),
    ]);

    const migrated = runMigrations(courses, '2.3.0');

    const tier = getCommandTermInfo('EVALUATE' as PromptVerb).tier;
    expect(promptsOf(migrated)[0].sampleAnswers?.[0].band).toBe(getBandForMark(8, 8, tier));
    expect(promptsOf(migrated)[0].sampleAnswers?.[0].band).not.toBe(1);
  });

  it('2.3.0: repairs a prompt stored with no verb and no marks', () => {
    const courses = makeCourses([
      makePrompt({ verb: undefined as unknown as PromptVerb, totalMarks: 0 }),
    ]);

    const migrated = runMigrations(courses, '2.2.2');

    expect(promptsOf(migrated)[0].verb).toBeTruthy();
    expect(promptsOf(migrated)[0].totalMarks).toBeGreaterThan(0);
  });
});

describe('localStorage helpers', () => {
  it('round-trips a value', () => {
    safeSetItem('k', { a: 1 });
    expect(safeGetItem('k', null)).toEqual({ a: 1 });
  });

  it('returns the default for a missing key', () => {
    expect(safeGetItem('nope', 'fallback')).toBe('fallback');
  });

  it('returns the default rather than throwing on corrupt JSON', () => {
    window.localStorage.setItem('broken', '{not json');
    expect(safeGetItem('broken', 'fallback')).toBe('fallback');
  });

  it('returns the default when the validator rejects the stored value', () => {
    safeSetItem('k', { courseId: 42 });
    expect(safeGetItem('k', 'fallback', validateStatePath)).toBe('fallback');
  });

  // A full disk or Safari's private mode throws on write; losing a draft is
  // bad, but taking the whole app down with it is worse.
  it('swallows a write that the browser refuses', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

    expect(() => safeSetItem('k', { a: 1 })).not.toThrow();
    setItem.mockRestore();
  });
});

describe('validators', () => {
  it('accepts a well-formed course tree', () => {
    expect(validateCourses(makeCourses([makePrompt()]))).toBe(true);
  });

  it('rejects data that is not a list of courses', () => {
    expect(validateCourses('nonsense')).toBe(false);
    expect(validateCourses({ courses: [] })).toBe(false);
    expect(validateCourses(null)).toBe(false);
  });

  // The schema is deliberately forgiving — every field carries a default, so a
  // sparse course is repaired rather than refused. Pinned here so that anyone
  // tightening it has to mean it: today, a course object with nothing but an
  // id is "valid" and loads as an empty course.
  it('accepts a sparse course, filling the gaps rather than refusing it', () => {
    expect(validateCourses([{ id: 'x' }])).toBe(true);
  });

  it('accepts a state path with or without a course', () => {
    expect(validateStatePath({ courseId: 'c1' })).toBe(true);
    expect(validateStatePath({})).toBe(true);
  });

  it('rejects a state path whose course id is not a string', () => {
    expect(validateStatePath({ courseId: 42 })).toBe(false);
    expect(validateStatePath(null)).toBeFalsy();
  });
});

describe('JSON export and import', () => {
  it('round-trips the content of a course tree', () => {
    const courses = makeCourses([makePrompt()]);
    const reimported = importDataFromJSON(exportDataAsJSON(courses));

    // Not a byte-for-byte round trip: import normalises, filling in every
    // optional field the schema defaults. What must survive is the content.
    expect(reimported).toHaveLength(1);
    expect(reimported[0].name).toBe('Course');
    expect(promptsOf(reimported)[0].question).toBe('Describe the process.');
    expect(promptsOf(reimported)[0].totalMarks).toBe(4);
  });

  it('repairs a sparse course rather than refusing it', () => {
    const [course] = importDataFromJSON('[{"id":"c1"}]');
    expect(course.id).toBe('c1');
    expect(course.topics).toEqual([]);
    expect(course.name).toBe('Untitled Course');
  });

  it('refuses JSON that is not a list of courses', () => {
    expect(() => importDataFromJSON('{"not":"courses"}')).toThrow();
    expect(() => importDataFromJSON('"a string"')).toThrow();
  });

  it('refuses text that is not JSON at all', () => {
    expect(() => importDataFromJSON('<html>nope</html>')).toThrow();
  });
});
