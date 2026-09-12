/**
 * A small IndexedDB cache for AI results that are worth not buying twice.
 *
 * It has exactly one consumer — the outcome briefing in OutcomeDetailModal —
 * and that is the point of this file rather than an accident of it. The cache
 * shipped with four writers and no readers: every evaluation, enrichment,
 * scenario and keyword result was stored on a 30-day TTL and never read back
 * once, so it cost a write per AI call and returned nothing. Those writers are
 * gone; see the note above the key generator for why they did not simply gain
 * reads.
 *
 * Before adding a writer, be able to name the reader. A cached AI result is
 * only worth storing where the same input genuinely deserves the same output
 * AND nothing else already persists it — most results in this app are written
 * into the course tree or the response store, which are the real caches.
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// IndexedDB schema for AI cache
interface AICacheDB extends DBSchema {
  cache: {
    key: string;
    value: {
      data: any;
      timestamp: number;
      version: string;
    };
  };
}

const DB_NAME = 'hsc-ai-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AICache {
  private static db: IDBPDatabase<AICacheDB> | null = null;
  private static dataVersion: string = '1.0.0';

  // Simple string hash for creating short, deterministic keys from long content
  private static hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Initialize the database
  private static async initDB(): Promise<IDBPDatabase<AICacheDB>> {
    if (this.db) return this.db;

    this.db = await openDB<AICacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create cache store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    // Clean up expired entries on init
    await this.cleanup();

    return this.db;
  }

  // Get an item from cache
  static async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.initDB();
      const entry = await db.get(STORE_NAME, key);

      if (!entry) return null;

      // Check if expired
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        await this.delete(key);
        return null;
      }

      // Check version compatibility
      if (entry.version !== this.dataVersion) {
        await this.delete(key);
        return null;
      }

      return entry.data as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Set an item in cache
  static async set(key: string, data: any): Promise<void> {
    try {
      const db = await this.initDB();
      const entry = {
        data,
        timestamp: Date.now(),
        version: this.dataVersion,
      };
      await db.put(STORE_NAME, entry, key);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  // Drop one entry. Private: the only callers are `get` evicting something
  // expired or version-stale, and `cleanup` sweeping on open.
  private static async delete(key: string): Promise<void> {
    try {
      const db = await this.initDB();
      await db.delete(STORE_NAME, key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  // Clear all cache entries
  static async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.clear(STORE_NAME);
      console.log('AI Cache cleared');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // Clean up expired entries
  private static async cleanup(): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const keys = await store.getAllKeys();
      const now = Date.now();

      let deleted = 0;
      for (const key of keys) {
        const entry = await store.get(key);
        if (entry && (now - entry.timestamp > CACHE_TTL || entry.version !== this.dataVersion)) {
          await store.delete(key);
          deleted++;
        }
      }

      await tx.done;
      if (deleted > 0) {
        console.log(`Cache cleanup: removed ${deleted} expired entries`);
      }
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  // --- Key generators -------------------------------------------------------
  //
  // One, because one is what is used. There were fifteen, and fourteen of them
  // named a result nothing ever read back: the cache was written in four places
  // (evaluation, enrichment, scenario, keywords) and read in none, from the day
  // it was added. It cost an IndexedDB write per AI call and a 30-day retention
  // sweep, and bought nothing.
  //
  // The four writes are gone rather than given reads, because the results were
  // already persisted somewhere that IS read, which is why nobody missed them:
  // enrichment, scenario and keywords are written into the course tree (and
  // `needsEnrichment` guards on those very fields, so the tree is the cache),
  // and a marking goes to the response store, which `useAttemptHistory` reads
  // for the question picker's personal ordering. Two of them — scenario and
  // keywords — are behind buttons that say "generate a NEW one", where reading
  // a cache would have been a bug rather than an optimisation.
  //
  // If evaluation caching is ever wanted, it needs a better key than the one
  // that was here: `promptId + hash(answer)` says nothing about the QUESTION,
  // so an edited question would be marked against its own old text.

  /**
   * An outcome briefing is a function of the QUESTION and the outcome, and of
   * nothing else — so the same pair always deserves the same answer, and a
   * student who shuts the panel and opens it again should not wait for a second
   * one or spend a second call of their daily allowance on it.
   *
   * Keyed on the question text rather than the prompt id because the briefing
   * is written against the words of the question: edit the question and the old
   * briefing is about something else, which the hash takes care of on its own.
   */
  static generateOutcomeBriefingKey(question: string, outcomeCode: string): string {
    return `outcome-briefing:${outcomeCode}:${this.hash(question)}`;
  }

  /** Closes the cached connection so the next `initDB()` opens a fresh one.
   *  Exists for HMR (see the `import.meta.hot` block below) — the app never
   *  needs to close this connection during a normal session, since the cache
   *  is meant to live for the page's whole lifetime. */
  static close(): void {
    this.db?.close();
    this.db = null;
  }
}

/**
 * On every Vite HMR reload of this module the class body re-runs, but
 * `openDB` was still holding the PREVIOUS instance's connection open — this
 * module has no other hook that ever runs on replacement, so nothing closed
 * it. Each edit-and-save during development accumulated one more open
 * `hsc-ai-cache` connection (ProjectHealth.md PERF-03). Dev-only: Vite
 * replaces `import.meta.hot` with `undefined` in a production build, so this
 * whole block is dead code there.
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    AICache.close();
  });
}
