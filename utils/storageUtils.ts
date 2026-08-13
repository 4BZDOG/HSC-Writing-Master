import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Course, LibraryItem, User } from '../types';
import { generateId } from './idUtils';
import {
  migrateAnalyseVerb,
  formatMarkingCriteria,
  CoursesArraySchema,
  recalculateSampleAnswerBands,
  validateAndFixCourses,
  deduplicateSampleAnswers,
  repairPromptIntegrity,
} from './dataManagerUtils';

// Current data version - increment when structure changes
// 2.4.0: NESA-aligned band formula — removed the marks-based cap so the verb's
// tier is the sole ceiling.  Existing sample-answer bands must be recalculated.
// 2.5.0: Two additive optional fields — DotPoint.focusAreas (a teacher's
// hand-set "including …" list, absent meaning "parse the description") and
// SampleAnswer.derivedFromStudent (an AI sample that is a lift of a student's
// own response). Both are absent on older data and mean exactly what their
// absence meant before, so there is no migration step: the version moves only
// so a returning install is recorded against the schema it is actually on.
// 2.6.0: `year` on Topic and CourseOutcome — Year 11 and Year 12 as two
// syllabuses under one course name. Additive and optional in the same way:
// absence means Year 12, which is what every topic written before this is, so
// again there is nothing to migrate.
export const DATA_VERSION = '2.6.0';

export const STORAGE_KEYS = {
  COURSES: 'hsc-ai-evaluator-courses', // Legacy key for migration check
  STATE_PATH: 'hsc-ai-evaluator-path',
  DATA_VERSION: 'hsc-ai-evaluator-version',
  BACKUP_PREFIX: 'hsc-ai-evaluator-backup-', // Legacy key
  API_STATS: 'hsc-ai-evaluator-api-stats',
  API_GUARD: 'hsc-ai-evaluator-api-guard', // Persisted circuit-breaker cooldown
  AUTH_USER: 'hsc-ai-auth-user-v2',
  AI_CONFIG: 'hsc-ai-evaluator-ai-config', // Active AI engine per role (basic/reasoning)
  QUOTA_WARNINGS: 'hsc-ai-evaluator-quota-warnings', // Per-UTC-day dedupe of 80%/100% quota toasts
} as const;

export type StorageStatus = 'IndexedDB' | 'LocalStorage' | 'Supabase' | 'Error' | 'Loading';

// --- IndexedDB Configuration ---

const DB_NAME = 'hsc-ai-evaluator-db';
const DB_VERSION = 3; // Incremented for User Store
const STORE_MAIN = 'main_store';
const STORE_BACKUPS = 'backups_store';
const STORE_LIBRARY = 'library_store';
const STORE_USERS = 'users_store';
const KEY_COURSES = 'courses_data';

interface AppDB extends DBSchema {
  [STORE_MAIN]: {
    key: string;
    value: any;
  };
  [STORE_BACKUPS]: {
    key: string;
    value: {
      timestamp: number;
      dateStr: string;
      data: Course[];
    };
  };
  [STORE_LIBRARY]: {
    key: string;
    value: LibraryItem;
  };
  [STORE_USERS]: {
    key: string;
    value: User;
  };
}

let _dbPromise: Promise<IDBPDatabase<AppDB>>;

const getDB = () => {
  if (!_dbPromise) {
    _dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, _transaction) {
        if (!db.objectStoreNames.contains(STORE_MAIN)) {
          db.createObjectStore(STORE_MAIN);
        }
        if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
          db.createObjectStore(STORE_BACKUPS);
        }
        if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
          db.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          db.createObjectStore(STORE_USERS, { keyPath: 'username' });
        }
      },
    });
  }
  return _dbPromise;
};

// --- Database Stats & Management ---

export interface DBStats {
  stores: {
    name: string;
    count: number;
  }[];
  quota: {
    usage: number;
    quota: number;
  } | null;
  isConnected: boolean;
}

export const getDatabaseStats = async (): Promise<DBStats> => {
  try {
    const db = await getDB();
    const storeNames = [STORE_MAIN, STORE_BACKUPS, STORE_LIBRARY, STORE_USERS];

    const stores = await Promise.all(
      storeNames.map(async (name) => {
        const tx = db.transaction(name as any, 'readonly');
        const store = tx.objectStore(name as any);
        const count = await store.count();
        return { name, count };
      })
    );

    let quota = null;
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage !== undefined && estimate.quota !== undefined) {
        quota = { usage: estimate.usage, quota: estimate.quota };
      }
    }

    return { stores, quota, isConnected: true };
  } catch (error) {
    console.error('Failed to get DB stats:', error);
    return { stores: [], quota: null, isConnected: false };
  }
};

export const clearStore = async (storeName: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.clear(storeName as any);
    console.log(`Store '${storeName}' cleared.`);
  } catch (error) {
    console.error(`Failed to clear store '${storeName}':`, error);
    throw error;
  }
};

export const getStoreData = async (storeName: string): Promise<any[]> => {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName as any, 'readonly');
    const store = tx.objectStore(storeName as any);
    return await store.getAll();
  } catch (error) {
    console.error(`Failed to get data from store '${storeName}':`, error);
    return [];
  }
};

// --- User Profile Operations ---

export const saveUserProfile = async (user: User): Promise<void> => {
  try {
    const db = await getDB();
    await db.put(STORE_USERS, user);
    // Also update local storage for fast sync retrieval on boot
    safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  } catch (error) {
    console.error('Failed to save user profile:', error);
  }
};

export const loadUserProfile = async (username: string): Promise<User | null> => {
  try {
    const db = await getDB();
    const user = await db.get(STORE_USERS, username);
    return user || null;
  } catch (error) {
    console.error('Failed to load user profile:', error);
    return null;
  }
};

/**
 * Erase the locally cached profile for a user. Used by the account-deletion
 * flow (services/dataRightsService.ts): in mock mode this IS the account, and
 * in Supabase mode it clears the local mirror so a deleted account cannot come
 * back from the cache on the next boot.
 */
export const deleteUserProfile = async (username: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.delete(STORE_USERS, username);
  } catch (error) {
    console.error('Failed to delete user profile:', error);
  }
  try {
    window.localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
  } catch {
    /* localStorage unavailable — the IndexedDB record is already gone. */
  }
};

// --- Import drafts -----------------------------------------------------------

/**
 * The unfinished contents of an import modal, so a reload is not a loss.
 *
 * The guard added earlier stops a stray CLICK from discarding a pasted
 * syllabus, but nothing survived the tab crashing, the laptop sleeping, or the
 * session timing out mid-paste — and the whole point of this workflow is that
 * an admin puts twenty minutes of real attention into it. Drafts live in the
 * same store as everything else, keyed per modal, and are written as the user
 * types rather than on close, because "on close" is exactly the moment that
 * does not happen when a tab dies.
 *
 * Deliberately NOT auto-restored: someone opening the modal to start something
 * new should not find last week's paste already in it. The modal offers it.
 */
const DRAFT_PREFIX = 'import_draft:';

/** A draft older than this is not worth offering back. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ImportDraft<T> {
  savedAt: number;
  value: T;
}

export const saveImportDraft = async <T>(key: string, value: T): Promise<void> => {
  try {
    const db = await getDB();
    await db.put(STORE_MAIN, { savedAt: Date.now(), value }, `${DRAFT_PREFIX}${key}`);
  } catch (error) {
    // A draft is a convenience, never a precondition: a full disk or a private
    // window must not break the import it was meant to protect.
    console.warn('Could not save import draft:', error);
  }
};

export const loadImportDraft = async <T>(key: string): Promise<ImportDraft<T> | null> => {
  try {
    const db = await getDB();
    const stored = (await db.get(STORE_MAIN, `${DRAFT_PREFIX}${key}`)) as
      | ImportDraft<T>
      | undefined;
    if (!stored || typeof stored.savedAt !== 'number') return null;
    if (Date.now() - stored.savedAt > DRAFT_MAX_AGE_MS) {
      await clearImportDraft(key);
      return null;
    }
    return stored;
  } catch (error) {
    console.warn('Could not read import draft:', error);
    return null;
  }
};

export const clearImportDraft = async (key: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.delete(STORE_MAIN, `${DRAFT_PREFIX}${key}`);
  } catch (error) {
    console.warn('Could not clear import draft:', error);
  }
};

// --- Async Data Operations (IndexedDB) ---

export const saveCoursesToDB = async (courses: Course[]): Promise<StorageStatus> => {
  try {
    const db = await getDB();
    await db.put(STORE_MAIN, courses, KEY_COURSES);
    return 'IndexedDB';
  } catch (error) {
    console.error('Failed to save to IDB, falling back to LocalStorage:', error);
    try {
      // Fallback to LocalStorage if IDB fails (e.g. QuotaExceeded or Private Browsing restrictions)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
        return 'LocalStorage';
      }
    } catch (lsError) {
      console.error('Failed to save to LocalStorage:', lsError);
      return 'Error';
    }
    return 'Error';
  }
};

export const loadCoursesFromDB = async (): Promise<{
  data: Course[];
  source: StorageStatus;
} | null> => {
  try {
    const db = await getDB();
    const courses = await db.get(STORE_MAIN, KEY_COURSES);

    if (courses) {
      return { data: courses as Course[], source: 'IndexedDB' };
    }

    // Migration Strategy: Check LocalStorage if DB is empty
    if (typeof window !== 'undefined') {
      const localData = window.localStorage.getItem(STORAGE_KEYS.COURSES);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          const validation = CoursesArraySchema.safeParse(parsed);
          if (validation.success) {
            console.log('Migrating data from LocalStorage to IndexedDB...');
            // Use the validated/transformed data
            const migratedData = validation.data as Course[];
            await saveCoursesToDB(migratedData);
            return { data: migratedData, source: 'IndexedDB' };
          }
        } catch (e) {
          console.warn('Failed to migrate legacy data:', e);
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to load courses from IDB:', error);
    // Fallback attempt from LocalStorage in case IDB is completely broken
    if (typeof window !== 'undefined') {
      try {
        const localData = window.localStorage.getItem(STORAGE_KEYS.COURSES);
        if (localData) {
          const parsed = JSON.parse(localData);
          return { data: parsed, source: 'LocalStorage' };
        }
      } catch (e) {
        console.error('Failed to load fallback from LocalStorage', e);
      }
    }
    return null;
  }
};

export const createBackup = async (courses: Course[]) => {
  if (courses.length === 0) return;
  try {
    const timestamp = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];
    const key = `backup-${dateStr}`;

    const db = await getDB();

    // Smart Backup Strategy:
    // We want to keep a snapshot for each day.
    // However, if the user works all day, we don't want to rely on a stale backup from 9 AM.
    // Strategy: Update the daily backup if the existing one is older than 1 hour.
    const existing = await db.get(STORE_BACKUPS, key);
    if (existing && timestamp - existing.timestamp < 60 * 60 * 1000) {
      // Existing backup is fresh enough (less than 1 hour old)
      return;
    }

    await db.put(
      STORE_BACKUPS,
      {
        timestamp,
        dateStr,
        data: courses,
      },
      key
    );

    console.log(`Backup updated for: ${dateStr}`);
    await cleanupOldBackups();
  } catch (error) {
    console.error('Backup failed:', error);
  }
};

/**
 * Save an explicitly user-provided snapshot (e.g. a file the admin uploaded).
 * Unlike createBackup(), this always writes under a unique key — it must never
 * be silently dropped by the once-an-hour daily-rollup throttle, and must
 * never overwrite today's automatic snapshot.
 */
export const saveImportedBackup = async (courses: Course[]): Promise<void> => {
  if (courses.length === 0) throw new Error('Backup file contains no courses.');
  const db = await getDB();
  const timestamp = Date.now();
  const dateStr = new Date().toISOString().split('T')[0];
  const key = `import-${timestamp}`;
  await db.put(
    STORE_BACKUPS,
    {
      timestamp,
      dateStr,
      data: courses,
    },
    key
  );
  await cleanupOldBackups();
};

export const getBackupsList = async () => {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_BACKUPS);
    const backups = await Promise.all(
      keys.map(async (k) => {
        const item = await db.get(STORE_BACKUPS, k);
        if (!item) return null;
        return {
          key: k.toString(),
          date: item.dateStr,
          timestamp: item.timestamp ?? 0,
          // Imported snapshots share a dateStr with that day's automatic
          // backup — the flag lets the UI tell the two apart.
          isImported: k.toString().startsWith('import-'),
          size: JSON.stringify(item.data).length,
          courseCount: item.data.length,
        };
      })
    );
    // Newest first; unlike dateStr, the timestamp also orders entries that
    // share a date (e.g. the daily backup plus a same-day import).
    return backups.filter(Boolean).sort((a, b) => b!.timestamp - a!.timestamp);
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
};

export const restoreBackup = async (key: string): Promise<Course[] | null> => {
  try {
    const db = await getDB();
    const backup = await db.get(STORE_BACKUPS, key);
    return backup ? backup.data : null;
  } catch (error) {
    console.error('Failed to restore backup:', error);
    return null;
  }
};

export const deleteBackup = async (key: string) => {
  try {
    const db = await getDB();
    await db.delete(STORE_BACKUPS, key);
  } catch (error) {
    console.error('Failed to delete backup:', error);
  }
};

const cleanupOldBackups = async () => {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_BACKUPS);
    if (keys.length <= 7) return;

    // Get timestamps to sort correctly
    const items = await Promise.all(
      keys.map(async (k) => {
        const val = await db.get(STORE_BACKUPS, k);
        return { key: k, timestamp: val?.timestamp || 0 };
      })
    );

    // Sort newest first
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Delete everything after the 7th item
    const toDelete = items.slice(7);
    for (const item of toDelete) {
      await db.delete(STORE_BACKUPS, item.key);
    }
  } catch (error) {
    console.error('Backup cleanup error:', error);
  }
};

// --- Library Operations ---

export const saveToLibrary = async (item: LibraryItem): Promise<void> => {
  try {
    const db = await getDB();
    await db.put(STORE_LIBRARY, item);
    console.log(`Saved ${item.type} "${item.title}" to library.`);
  } catch (error) {
    console.error('Failed to save to library:', error);
    throw error;
  }
};

export const fetchLibrary = async (): Promise<LibraryItem[]> => {
  try {
    const db = await getDB();
    return await db.getAll(STORE_LIBRARY);
  } catch (error) {
    console.error('Failed to fetch library:', error);
    return [];
  }
};

export const deleteFromLibrary = async (id: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.delete(STORE_LIBRARY, id);
  } catch (error) {
    console.error('Failed to delete from library:', error);
    throw error;
  }
};

// --- Synchronous Helpers (LocalStorage) ---
// Used for lightweight config (Auth, State Path, Version) that doesn't need IDB scale

export const safeGetItem = <T>(
  key: string,
  defaultValue: T,
  validator?: (data: T) => boolean
): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);

    // Validate data structure if validator provided
    if (validator && !validator(parsed)) {
      console.warn(`Data validation failed for ${key}, using defaults`);
      return defaultValue;
    }

    return parsed;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return defaultValue;
  }
};

export const safeSetItem = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage:`, error);
  }
};

// Data validation for courses (Zod wrapper)
export const validateCourses = (data: any): data is Course[] => {
  const result = CoursesArraySchema.safeParse(data);
  if (!result.success) {
    console.warn('Course validation failed:', result.error);
  }
  return result.success;
};

// Data validation for state path
export const validateStatePath = (data: any): boolean => {
  return (
    data &&
    typeof data === 'object' &&
    (typeof data.courseId === 'string' || data.courseId === undefined)
  );
};

/**
 * Is the stored data older than the version a migration lands in?
 *
 * Every guard below used to be a plain string comparison, which is only
 * correct while no part of the version has two digits: `'2.10.0' < '2.2.0'` is
 * TRUE lexicographically, because '1' sorts before '2'. At DATA_VERSION 2.10.0
 * — one minor bump away, on a project whose house rule is to bump this with
 * every schema change — a returning user would have had every migration from
 * 2.2.0 onward re-applied to data that had already been through them. Most are
 * idempotent; the 2.2.2 sample-answer deduplication is not, and would silently
 * delete exemplars a teacher had added since.
 *
 * Missing or malformed versions count as "older than everything", which is
 * what a pre-versioning install should get.
 */
export const isOlderThan = (fromVersion: string, target: string): boolean => {
  const parse = (version: string) =>
    String(version ?? '')
      .split('.')
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const from = parse(fromVersion);
  const to = parse(target);

  for (let i = 0; i < Math.max(from.length, to.length); i++) {
    const a = from[i] ?? 0;
    const b = to[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
};

// Migration system to handle version changes
export const runMigrations = (courses: Course[], fromVersion: string): Course[] => {
  let migrated = [...courses];

  console.log(`Migrating data from version ${fromVersion} to ${DATA_VERSION}`);

  // 2.6.0 added `year` to Topic and CourseOutcome and needs NO case here. The
  // field is optional and its ABSENCE means Year 12, which is what every topic
  // written before it existed is — writing 'year12' into all of them would say
  // the same thing twice and give the filter two spellings to agree about.

  if (isOlderThan(fromVersion, '2.0.0')) {
    migrated = migrated.map((course) => ({
      ...course,
      topics: course.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: dp.prompts || [],
          })),
        })),
      })),
    }));
  }

  if (isOlderThan(fromVersion, '2.0.1')) {
    migrated = migrated.map((course) => ({
      ...course,
      topics: course.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: (dp.prompts || []).map((p) => ({
              ...p,
              sampleAnswers: (p.sampleAnswers || []).map((sa) => ({
                ...sa,
                id: sa.id || generateId('sa'),
              })),
            })),
          })),
        })),
      })),
    }));
  }

  if (isOlderThan(fromVersion, '2.0.2')) {
    migrated = migrateAnalyseVerb(migrated);
  }

  if (isOlderThan(fromVersion, '2.0.3')) {
    migrated = migrated.map((course) => ({
      ...course,
      topics: course.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: (dp.prompts || []).map((p) => ({
              ...p,
              markingCriteria: formatMarkingCriteria(p.markingCriteria),
            })),
          })),
        })),
      })),
    }));
  }

  if (isOlderThan(fromVersion, '2.1.0')) {
    console.log('Applying v2.1.0 migration: Initialising Past HSC metadata...');
    migrated = migrated.map((course) => ({
      ...course,
      topics: course.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: dp.prompts.map((p) => ({
              ...p,
              isPastHSC: p.isPastHSC ?? false,
              hscYear: p.hscYear || undefined,
              hscQuestionNumber: p.hscQuestionNumber || undefined,
            })),
          })),
        })),
      })),
    }));
  }

  if (isOlderThan(fromVersion, '2.2.0')) {
    console.log('Applying v2.2.0 migration: Recalculating bands for Tier consistency...');
    migrated = recalculateSampleAnswerBands(migrated);
  }

  if (isOlderThan(fromVersion, '2.2.1')) {
    console.log('Applying v2.2.1 migration: Validating and repairing prompt verbs...');
    migrated = validateAndFixCourses(migrated);
  }

  // NEW: Version 2.2.2 Migration
  // Automatically deduplicate sample answers within all prompts, preferring the lower mark version.
  if (isOlderThan(fromVersion, '2.2.2')) {
    console.log(
      'Applying v2.2.2 migration: Automatically removing duplicate sample answers (keeping lower mark)...'
    );
    migrated = migrated.map((course) => ({
      ...course,
      topics: course.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((subTopic) => ({
          ...subTopic,
          dotPoints: subTopic.dotPoints.map((dotPoint) => ({
            ...dotPoint,
            prompts: dotPoint.prompts.map((prompt) => ({
              ...prompt,
              sampleAnswers: deduplicateSampleAnswers(prompt.sampleAnswers || []),
            })),
          })),
        })),
      })),
    }));
  }

  // Version 2.3.0 Migration
  // Canonicalise prompt verbs and mark values. Imported JSON could previously
  // store an unrecognised verb (left undefined) or totalMarks of 0; the UI
  // surfaces fall back differently for these, so the same question rendered
  // with different tier colours in the navigator vs the writing area.
  if (isOlderThan(fromVersion, '2.3.0')) {
    console.log('Applying v2.3.0 migration: Canonicalising prompt verbs and mark values...');
    migrated = repairPromptIntegrity(migrated);
  }

  if (isOlderThan(fromVersion, '2.4.0')) {
    console.log('Applying v2.4.0 migration: NESA-aligned band recalculation...');
    migrated = recalculateSampleAnswerBands(migrated);
  }

  return migrated;
};

// Export data as JSON file
export const exportDataAsJSON = (courses: Course[]): string => {
  return JSON.stringify(courses, null, 2);
};

// Import data from JSON string
export const importDataFromJSON = (jsonString: string): Course[] => {
  try {
    const parsed = JSON.parse(jsonString);
    const result = CoursesArraySchema.safeParse(parsed);
    if (result.success) {
      return result.data as Course[];
    }
    console.error('Validation errors:', result.error);
    throw new Error('Invalid data structure');
  } catch (error) {
    console.error('Import failed:', error);
    throw new Error('Failed to import data: Invalid JSON or data structure');
  }
};

// Emergency data recovery from IDB backups
export const recoverData = async (): Promise<Course[] | null> => {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_BACKUPS);
    if (keys.length === 0) return null;

    // Get newest
    const items = await Promise.all(
      keys.map(async (k) => {
        const val = await db.get(STORE_BACKUPS, k);
        return { key: k, timestamp: val?.timestamp || 0, data: val?.data };
      })
    );

    items.sort((a, b) => b.timestamp - a.timestamp);

    if (items.length > 0 && items[0].data) {
      console.log(`Data recovered from backup: ${items[0].key}`);
      return items[0].data;
    }
  } catch (e) {
    console.error('Recovery failed:', e);
  }
  return null;
};
