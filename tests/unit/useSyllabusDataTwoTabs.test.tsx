import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Course } from '../../types';

/**
 * Two tabs of the app on one library. The real storage code runs (utils/storageUtils.ts and
 * utils/draftMerge.ts) against an in-memory stand-in for the few `idb` calls it makes, shared by
 * both hook instances, the way one browser's IndexedDB is shared by two tabs.
 */

const fake = vi.hoisted(() => {
  type Row = Map<IDBValidKey, unknown>;
  const stores = new Map<string, Row>();
  /** Every key written to a store, in order, so the tests can count the writes. */
  const writes: Array<{ store: string; key: string }> = [];
  const row = (store: string): Row => {
    let s = stores.get(store);
    if (!s) {
      s = new Map();
      stores.set(store, s);
    }
    return s;
  };
  const put = (store: string, value: unknown, key: IDBValidKey) => {
    writes.push({ store, key: String(key) });
    row(store).set(key, structuredClone(value));
  };
  const get = (store: string, key: IDBValidKey) => {
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
      const tx = {
        store: {
          get: async (key: IDBValidKey) => get(store, key),
          put: async (value: unknown, key: IDBValidKey) => put(store, value, key),
          delete: async (key: IDBValidKey) => {
            row(store).delete(key);
          },
        },
        objectStore: () => tx.store,
        done: Promise.resolve(),
      };
      return tx;
    },
  };
  return { stores, writes, db };
});

vi.mock('idb', () => ({
  openDB: vi.fn(async () => fake.db),
}));

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return { ...actual, createBackup: vi.fn().mockResolvedValue(true) };
});

vi.mock('../../services/curriculumService', () => ({
  fetchRemoteCourses: vi.fn(),
  isCurriculumRemote: vi.fn(() => false),
}));

import { useSyllabusData } from '../../hooks/useSyllabusData';
import { DATA_VERSION, STORAGE_KEYS } from '../../utils/storageUtils';

/** A library with two questions in one dot point, Q1 (p1) and Q2 (p2), both without a draft. */
const library = (): Course[] =>
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
                    { id: 'p1', question: 'Question one' },
                    { id: 'p2', question: 'Question two' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] as unknown as Course[];

type Hook = ReturnType<typeof useSyllabusData>;

const promptIn = (courses: Course[], id: string) => {
  for (const topic of courses[0].topics)
    for (const sub of topic.subTopics ?? [])
      for (const dp of sub.dotPoints ?? [])
        for (const p of dp.prompts ?? []) if (p.id === id) return p;
  throw new Error(`no prompt ${id}`);
};

const stored = (): Course[] | undefined =>
  fake.stores.get('main_store')?.get('courses_data') as Course[] | undefined;
const storedDraft = (id: string): string | undefined =>
  stored() ? promptIn(stored()!, id).userDraft : undefined;
const courseWrites = () => fake.writes.filter((w) => w.key === 'courses_data').length;

/** Gives React and the fake store the turns they need, without waiting on the autosave timer. */
const settle = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await act(async () => {});
};

/** Sets one question's draft in this tab's library, the way the workspace's autosave does. */
const typeIn = (hook: { current: Hook }, id: string, text: string) =>
  act(() => {
    hook.current.updateCourses((draft) => {
      const p = promptIn(draft as Course[], id);
      p.userDraft = text;
    });
  });

/** Opens a tab on the stored library, and waits until it has loaded. */
const openTab = async (showToast = vi.fn()) => {
  const tab = renderHook(() => useSyllabusData({ showToast }));
  await waitFor(() => expect(tab.result.current.isReady).toBe(true));
  return tab;
};

beforeEach(() => {
  fake.stores.clear();
  fake.writes.length = 0;
  window.localStorage.clear();
  window.localStorage.setItem(STORAGE_KEYS.DATA_VERSION, JSON.stringify(DATA_VERSION));
  fake.stores.set(
    'main_store',
    new Map<IDBValidKey, unknown>([
      ['courses_data', library()],
      ['courses_rev', 1],
    ])
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('two tabs on one library', () => {
  it("a stale tab's save keeps the newer draft another tab wrote, and the stale tab adopts it", async () => {
    // Both tabs load the library while Q1 is still empty.
    const tabA = await openTab();
    const tabB = await openTab();

    // Tab A types Q1 and saves.
    typeIn(tabA.result, 'p1', 'alpha draft');
    await waitFor(() => expect(storedDraft('p1')).toBe('alpha draft'), { timeout: 4000 });

    // Tab B, which never saw A's text, types Q2 and saves.
    typeIn(tabB.result, 'p2', 'beta draft');
    await waitFor(() => expect(storedDraft('p2')).toBe('beta draft'), { timeout: 4000 });

    // The store keeps A's Q1 text, and B's state took it.
    expect(storedDraft('p1')).toBe('alpha draft');
    expect(promptIn(tabB.result.current.courses, 'p1').userDraft).toBe('alpha draft');
    expect(promptIn(tabB.result.current.courses, 'p2').userDraft).toBe('beta draft');
  });

  it('the save settles: after the adoption, no further writes keep coming', async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    typeIn(tabA.result, 'p1', 'alpha draft');
    await waitFor(() => expect(storedDraft('p1')).toBe('alpha draft'), { timeout: 4000 });
    typeIn(tabB.result, 'p2', 'beta draft');
    await waitFor(() => expect(storedDraft('p2')).toBe('beta draft'), { timeout: 4000 });

    // Let B's adoption and at most one follow-up save land, then count.
    await new Promise((r) => setTimeout(r, 2500));
    const settled = courseWrites();
    await new Promise((r) => setTimeout(r, 2500));
    expect(courseWrites()).toBe(settled);
    expect(storedDraft('p1')).toBe('alpha draft');
  });

  it('a draft the student has typed in since the last save is not overwritten by a pull', async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    typeIn(tabA.result, 'p1', 'alpha draft');
    await waitFor(() => expect(storedDraft('p1')).toBe('alpha draft'), { timeout: 4000 });

    // Tab B types Q1 and has not saved it when it comes back into view.
    typeIn(tabB.result, 'p1', 'typed in B');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();

    expect(promptIn(tabB.result.current.courses, 'p1').userDraft).toBe('typed in B');
    expect(tabB.result.current.foreignDrafts).toBeNull();
  });

  it('coming back into view adopts what another tab wrote, and announces it', async () => {
    const tabA = await openTab();
    const tabB = await openTab();
    typeIn(tabA.result, 'p1', 'alpha draft');
    await waitFor(() => expect(storedDraft('p1')).toBe('alpha draft'), { timeout: 4000 });

    // Tab B has nothing unsaved, so a focus pulls A's draft into it.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(promptIn(tabB.result.current.courses, 'p1').userDraft).toBe('alpha draft')
    );
    const event = tabB.result.current.foreignDrafts;
    expect(event?.changes).toEqual([
      { promptId: 'p1', previous: undefined, userDraft: 'alpha draft' },
    ]);
  });

  it('a pull that finds nothing new writes nothing', async () => {
    const tabB = await openTab();
    const before = courseWrites();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(courseWrites()).toBe(before);
    expect(tabB.result.current.foreignDrafts).toBeNull();
  });
});

describe('persistNow', () => {
  it('starts the write at once, without waiting for the autosave timer, and writes once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const showToast = vi.fn();
    const tab = renderHook(() => useSyllabusData({ showToast }));
    await settle();
    expect(tab.result.current.isReady).toBe(true);

    const before = courseWrites();
    act(() => {
      tab.result.current.persistNow((draft) => {
        promptIn(draft, 'p1').userDraft = 'written on the way out';
      });
    });
    // No timer advanced: the write must already be in flight.
    await settle();
    expect(courseWrites()).toBe(before + 1);
    expect(storedDraft('p1')).toBe('written on the way out');

    // The same write asked for again changes nothing, and the autosave timer finds nothing to do.
    act(() => {
      tab.result.current.persistNow((draft) => {
        promptIn(draft, 'p1').userDraft = 'written on the way out';
      });
    });
    await settle();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await settle();
    expect(courseWrites()).toBe(before + 1);
    expect(promptIn(tab.result.current.courses, 'p1').userDraft).toBe('written on the way out');
  });

  it('without a recipe, writes what the library already holds once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tab = renderHook(() => useSyllabusData({ showToast: vi.fn() }));
    await settle();
    typeIn(tab.result, 'p2', 'pending');
    await settle();

    const before = courseWrites();
    act(() => {
      tab.result.current.persistNow();
      tab.result.current.persistNow();
    });
    await settle();
    expect(courseWrites()).toBe(before + 1);
    expect(storedDraft('p2')).toBe('pending');
  });
});
