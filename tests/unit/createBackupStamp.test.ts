import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Course } from '../../types';

/**
 * createBackup writes one rolling backup per day, refreshed at most once an hour.
 * Its freshness check used to read the whole backup record, which holds the whole
 * library, on every call. It now reads a small stamp instead, and only falls back
 * to the record when there is no stamp for today's backup. These tests run
 * createBackup against an in-memory IndexedDB stand-in and count the reads.
 */

const fake = vi.hoisted(() => {
  type Row = Map<IDBValidKey, unknown>;
  const stores = new Map<string, Row>();
  const reads: string[] = [];
  const row = (store: string): Row => {
    let s = stores.get(store);
    if (!s) {
      s = new Map();
      stores.set(store, s);
    }
    return s;
  };
  const db = {
    get: async (store: string, key: IDBValidKey) => {
      reads.push(store);
      return row(store).get(key);
    },
    put: async (store: string, value: unknown, key: IDBValidKey) => {
      row(store).set(key, value);
      return key;
    },
    delete: async (store: string, key: IDBValidKey) => {
      row(store).delete(key);
    },
    getAllKeys: async (store: string) => [...row(store).keys()],
    clear: async (store: string) => {
      row(store).clear();
    },
  };
  return { stores, reads, db };
});

vi.mock('idb', () => ({
  openDB: vi.fn(async () => fake.db),
}));

import { createBackup, deleteBackup, getBackupsList } from '../../utils/storageUtils';

const HOUR = 60 * 60 * 1000;
const courses = (name = 'Software Engineering'): Course[] => [
  { id: 'course-1', name, outcomes: [], topics: [] },
];
const backupKeys = () => [...(fake.stores.get('backups_store')?.keys() ?? [])];
const today = (at: Date) => `backup-${at.toISOString().split('T')[0]}`;

beforeEach(() => {
  fake.stores.clear();
  fake.reads.length = 0;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T09:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createBackup', () => {
  it("writes today's backup on the first call", async () => {
    expect(await createBackup(courses())).toBe(true);

    expect(backupKeys()).toEqual([today(new Date())]);
  });

  it('reads and writes nothing in the backup store while the backup is fresh', async () => {
    await createBackup(courses());
    const written = fake.stores.get('backups_store')!.get(today(new Date()));
    fake.reads.length = 0;

    // Within the hour: the backup is fresh, so this call must not read or rewrite the record.
    vi.setSystemTime(new Date(Date.now() + 10 * 60 * 1000));
    await createBackup(courses('Edited'));

    expect(fake.reads).not.toContain('backups_store');
    expect(fake.stores.get('backups_store')!.get(today(new Date()))).toBe(written);
  });

  it('refreshes the backup once the hour has passed', async () => {
    await createBackup(courses());
    const first = fake.stores.get('backups_store')!.get(today(new Date())) as { timestamp: number };

    vi.setSystemTime(new Date(first.timestamp + HOUR + 1000));
    await createBackup(courses('Edited'));

    const second = fake.stores.get('backups_store')!.get(today(new Date())) as {
      timestamp: number;
      data: Course[];
    };
    expect(second.timestamp).toBe(first.timestamp + HOUR + 1000);
    expect(second.data[0].name).toBe('Edited');
  });

  it('keeps one backup per day key, and gives a new day its own', async () => {
    await createBackup(courses());
    const firstDay = today(new Date());

    vi.setSystemTime(new Date('2026-11-06T09:00:00Z'));
    await createBackup(courses());

    expect(backupKeys().sort()).toEqual([firstDay, 'backup-2026-11-06'].sort());
  });

  it('still checks the record when no stamp is there, and leaves a fresh one alone', async () => {
    // A backup written before the stamp existed: fresh, with no stamp beside it.
    const fresh = { timestamp: Date.now() - 5 * 60 * 1000, dateStr: '2026-11-05', data: courses() };
    fake.stores.set('backups_store', new Map([[today(new Date()), fresh]]));

    await createBackup(courses('Edited'));

    expect(fake.reads).toContain('backups_store');
    expect(fake.stores.get('backups_store')!.get(today(new Date()))).toBe(fresh);
  });

  it('writes again after the backup was deleted, even within the hour', async () => {
    await createBackup(courses());
    await deleteBackup(today(new Date()));

    await createBackup(courses());

    expect(backupKeys()).toEqual([today(new Date())]);
  });

  it('keeps the seven newest backups, as before', async () => {
    for (let day = 1; day <= 9; day++) {
      vi.setSystemTime(new Date(`2026-11-0${day}T09:00:00Z`));
      await createBackup(courses());
    }
    expect(await getBackupsList()).toHaveLength(7);
  });
});
