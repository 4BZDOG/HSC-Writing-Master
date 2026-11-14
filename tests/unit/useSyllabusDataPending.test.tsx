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
import { PENDING_DRAFT_KEY, readPendingDraft } from '../../utils/pendingDraft';

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

const seed = (p1Draft?: string) => {
  const courses = library();
  if (p1Draft !== undefined) promptIn(courses, 'p1').userDraft = p1Draft;
  fake.stores.set(
    'main_store',
    new Map<IDBValidKey, unknown>([
      ['courses_data', courses],
      ['courses_rev', 1],
    ])
  );
};

const stashed = (promptId: string, text: string, prev: string) =>
  window.localStorage.setItem(
    PENDING_DRAFT_KEY,
    JSON.stringify({ promptId, text, prev, at: Date.now() })
  );

describe('a draft stashed as the page closed', () => {
  it('is put back at load, written to IndexedDB, and the entry is cleared', async () => {
    seed('old');
    stashed('p1', 'stashed words', 'old');
    const tab = await openTab();
    expect(promptIn(tab.result.current.courses, 'p1').userDraft).toBe('stashed words');
    await waitFor(() => expect(storedDraft('p1')).toBe('stashed words'), { timeout: 4000 });
    await waitFor(() => expect(window.localStorage.getItem(PENDING_DRAFT_KEY)).toBeNull(), {
      timeout: 4000,
    });
  });

  it('is discarded at load when the stored draft has moved on since', async () => {
    seed('a later edit');
    stashed('p1', 'stashed words', 'old');
    const tab = await openTab();
    expect(promptIn(tab.result.current.courses, 'p1').userDraft).toBe('a later edit');
    expect(window.localStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it('is discarded at load when its question no longer exists', async () => {
    seed();
    stashed('gone', 'stashed words', '');
    await openTab();
    expect(window.localStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it('with no entry, the library loaded is not written back', async () => {
    seed('kept');
    await openTab();
    await new Promise((r) => setTimeout(r, 2500));
    expect(courseWrites()).toBe(0);
  });

  it('is written synchronously by stashPendingDraft, over the draft this tab last knew', async () => {
    seed('known draft');
    const tab = await openTab();
    act(() => {
      tab.result.current.stashPendingDraft({ promptId: 'p1', text: 'just typed' });
    });
    // No await: the entry is already there, which is what makes it survive the page going away.
    expect(readPendingDraft()).toMatchObject({
      promptId: 'p1',
      text: 'just typed',
      prev: 'known draft',
    });
  });

  it('is cleared once a save holds its text', async () => {
    seed('known draft');
    const tab = await openTab();
    act(() => {
      tab.result.current.stashPendingDraft({ promptId: 'p1', text: 'just typed' });
    });
    act(() => {
      tab.result.current.persistNow((draft) => {
        promptIn(draft, 'p1').userDraft = 'just typed';
      });
    });
    await waitFor(() => expect(storedDraft('p1')).toBe('just typed'), { timeout: 4000 });
    expect(window.localStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });
});
