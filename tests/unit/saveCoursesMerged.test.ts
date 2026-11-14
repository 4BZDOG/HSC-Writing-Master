import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Course } from '../../types';

/**
 * The library save that keeps a draft another tab has written (utils/storageUtils.ts,
 * saveCoursesMerged). These run the real storage code against an in-memory stand-in for
 * the few `idb` calls it makes, and count the reads, so the fast path can be shown not to
 * read the library back.
 */

const fake = vi.hoisted(() => {
  type Row = Map<IDBValidKey, unknown>;
  const stores = new Map<string, Row>();
  const reads: string[] = [];
  const failPut = { on: false };
  const row = (store: string): Row => {
    let s = stores.get(store);
    if (!s) {
      s = new Map();
      stores.set(store, s);
    }
    return s;
  };
  const put = (store: string, value: unknown, key: IDBValidKey) => {
    if (failPut.on) throw new DOMException('quota', 'QuotaExceededError');
    row(store).set(key, structuredClone(value));
  };
  const get = (store: string, key: IDBValidKey) => {
    reads.push(String(key));
    const v = row(store).get(key);
    return v === undefined ? undefined : structuredClone(v);
  };
  const db = {
    get: async (store: string, key: IDBValidKey) => get(store, key),
    put: async (store: string, value: unknown, key: IDBValidKey) => put(store, value, key),
    delete: async (store: string, key: IDBValidKey) => {
      row(store).delete(key);
    },
    transaction: (store: string, _mode: string) => {
      const pending: Promise<unknown>[] = [];
      const tx = {
        store: {
          get: async (key: IDBValidKey) => get(store, key),
          put: async (value: unknown, key: IDBValidKey) => put(store, value, key),
          delete: async (key: IDBValidKey) => {
            row(store).delete(key);
          },
        },
        objectStore: () => tx.store,
        done: Promise.resolve().then(() => Promise.all(pending)),
      };
      return tx;
    },
  };
  return { stores, reads, failPut, db };
});

vi.mock('idb', () => ({
  openDB: vi.fn(async () => fake.db),
}));

import {
  readCoursesRev,
  readStoredCourses,
  saveCoursesMerged,
  saveCoursesToDB,
  STORAGE_KEYS,
} from '../../utils/storageUtils';
import { collectDrafts } from '../../utils/draftMerge';

const MAIN = 'main_store';
const KEY = 'courses_data';
const REV = 'courses_rev';

const course = (userDraft?: string): Course[] =>
  [
    {
      id: 'course-1',
      name: 'Software Engineering',
      outcomes: [],
      topics: [
        {
          id: 'topic-1',
          name: 'Topic',
          subTopics: [
            {
              id: 'sub-1',
              name: 'Sub',
              dotPoints: [
                {
                  id: 'dp-1',
                  description: 'Dot point',
                  prompts: [
                    { id: 'p1', question: 'Q1', ...(userDraft !== undefined ? { userDraft } : {}) },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Course,
  ] as Course[];

const draftIn = (courses: Course[] | undefined): string | undefined =>
  courses?.[0].topics[0].subTopics?.[0].dotPoints?.[0].prompts?.[0].userDraft;

const stored = (): Course[] | undefined => fake.stores.get(MAIN)?.get(KEY) as Course[] | undefined;
const storedRev = (): number | undefined => fake.stores.get(MAIN)?.get(REV) as number | undefined;

beforeEach(() => {
  fake.stores.clear();
  fake.reads.length = 0;
  fake.failPut.on = false;
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveCoursesMerged', () => {
  it('takes the fast path when the stored revision is the one this tab knows: no library read', async () => {
    fake.stores.set(
      MAIN,
      new Map<IDBValidKey, unknown>([
        [KEY, course('old')],
        [REV, 5],
      ])
    );
    const mine = course('typed here');

    const result = await saveCoursesMerged(mine, {
      knownRev: 5,
      base: collectDrafts(course('old')),
    });

    expect(result.status).toBe('IndexedDB');
    expect(fake.reads).not.toContain(KEY);
    expect(draftIn(stored())).toBe('typed here');
    expect(result.adopted.size).toBe(0);
    expect(result.rev).toBeGreaterThan(5);
    expect(storedRev()).toBe(result.rev);
  });

  it('takes the conflict path when another tab has written since: merges its draft and bumps the revision', async () => {
    // Tab A wrote "alpha" at revision 7. This tab last saw revision 5 and holds the empty question.
    fake.stores.set(
      MAIN,
      new Map<IDBValidKey, unknown>([
        [KEY, course('alpha')],
        [REV, 7],
      ])
    );
    const mine = course(undefined);

    const result = await saveCoursesMerged(mine, { knownRev: 5, base: new Map() });

    expect(fake.reads).toContain(KEY);
    expect(draftIn(result.merged)).toBe('alpha');
    expect(result.adopted.get('p1')).toEqual({ userDraft: 'alpha' });
    expect(draftIn(stored())).toBe('alpha');
    expect(result.rev).toBeGreaterThan(7);
    expect(storedRev()).toBe(result.rev);
  });

  it('takes the merge path when the revision is unknown, as after an upgrade', async () => {
    fake.stores.set(
      MAIN,
      new Map<IDBValidKey, unknown>([[KEY, course('from before the upgrade')]])
    );
    const result = await saveCoursesMerged(course(undefined), { knownRev: null, base: new Map() });
    expect(fake.reads).toContain(KEY);
    expect(draftIn(stored())).toBe('from before the upgrade');
    expect(result.status).toBe('IndexedDB');
    expect(storedRev()).toBeGreaterThan(0);
  });

  it('writes a fresh library with no stored copy to merge against', async () => {
    const result = await saveCoursesMerged(course('first'), { knownRev: null, base: new Map() });
    expect(result.status).toBe('IndexedDB');
    expect(result.adopted.size).toBe(0);
    expect(draftIn(stored())).toBe('first');
  });

  it('falls back to LocalStorage, as saveCoursesToDB does, when IndexedDB refuses the write', async () => {
    fake.failPut.on = true;
    const mine = course('kept on this device');
    const result = await saveCoursesMerged(mine, { knownRev: null, base: new Map() });
    expect(result.status).toBe('LocalStorage');
    expect(result.rev).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.COURSES)).toContain('kept on this device');
  });

  it("returns 'Error' when neither IndexedDB nor LocalStorage takes the write", async () => {
    fake.failPut.on = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const result = await saveCoursesMerged(course('x'), { knownRev: null, base: new Map() });
    expect(result.status).toBe('Error');
    expect(result.rev).toBeNull();
  });
});

describe('saveCoursesToDB', () => {
  it('bumps the revision in the same write as the library', async () => {
    fake.stores.set(MAIN, new Map<IDBValidKey, unknown>([[REV, 3]]));
    expect(await saveCoursesToDB(course('a'))).toBe('IndexedDB');
    expect(draftIn(stored())).toBe('a');
    expect(storedRev() ?? 0).toBeGreaterThan(3);
  });

  it('keeps its StorageStatus contract on failure', async () => {
    fake.failPut.on = true;
    expect(await saveCoursesToDB(course('a'))).toBe('LocalStorage');
  });
});

describe('revision reads', () => {
  it('reads the revision as null when there is none', async () => {
    expect(await readCoursesRev()).toBeNull();
  });

  it('reads the revision and the library together', async () => {
    fake.stores.set(
      MAIN,
      new Map<IDBValidKey, unknown>([
        [KEY, course('x')],
        [REV, 9],
      ])
    );
    expect(await readCoursesRev()).toBe(9);
    const both = await readStoredCourses();
    expect(both?.rev).toBe(9);
    expect(draftIn(both?.courses ?? undefined)).toBe('x');
  });
});
