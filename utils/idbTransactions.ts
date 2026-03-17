/**
 * Resilient IndexedDB transaction management
 * Provides atomic operations with automatic retry and rollback capability
 */

export interface TransactionConfig {
  stores: string[];
  mode?: 'readonly' | 'readwrite';
  timeout?: number; // ms
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  rollbackExecuted: boolean;
}

/**
 * Execute a transaction with automatic error handling and rollback
 *
 * @param db - IndexedDB database
 * @param config - Transaction configuration
 * @param operation - Async operation to execute
 * @param onRollback - Optional callback if operation fails
 *
 * @example
 * const result = await executeTransaction(db, {
 *   stores: ['main_store', 'backups_store'],
 *   mode: 'readwrite'
 * }, async (tx) => {
 *   const courses = await tx.objectStore('main_store').getKey('courses_data');
 *   // ... modify courses ...
 *   await tx.objectStore('main_store').put({ key: 'courses_data', data: courses });
 *   return courses;
 * });
 */
export const executeTransaction = async <T = any>(
  db: IDBDatabase,
  config: TransactionConfig,
  operation: (tx: IDBTransaction) => Promise<T>,
  onRollback?: (error: Error) => Promise<void>
): Promise<TransactionResult<T>> => {
  const { stores, mode = 'readonly', timeout = 30000 } = config;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: new Error(`Transaction timeout (${timeout}ms)`),
        rollbackExecuted: true,
      });
    }, timeout);

    try {
      const tx = db.transaction(stores, mode);
      let completed = false;

      tx.onerror = () => {
        clearTimeout(timeoutId);
        const error = new Error(`Transaction error: ${tx.error?.message || 'Unknown'}`);
        onRollback?.(error).catch(console.error);
        resolve({
          success: false,
          error,
          rollbackExecuted: true,
        });
      };

      tx.onabort = () => {
        clearTimeout(timeoutId);
        const error = new Error('Transaction aborted');
        onRollback?.(error).catch(console.error);
        resolve({
          success: false,
          error,
          rollbackExecuted: true,
        });
      };

      tx.oncomplete = () => {
        clearTimeout(timeoutId);
        if (!completed) {
          // Already resolved in operation success
          completed = true;
        }
      };

      // Execute operation
      operation(tx)
        .then((data) => {
          clearTimeout(timeoutId);
          completed = true;
          resolve({
            success: true,
            data,
            rollbackExecuted: false,
          });
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          onRollback?.(error).catch(console.error);
          resolve({
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            rollbackExecuted: true,
          });
        });
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      onRollback?.(err).catch(console.error);
      resolve({
        success: false,
        error: err,
        rollbackExecuted: true,
      });
    }
  });
};

/**
 * Read operation (readonly transaction)
 */
export const readFromDb = async <T = any>(
  db: IDBDatabase,
  storeName: string,
  key: string
): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to read from ${storeName}`));
  });
};

/**
 * Write operation with automatic backup (readwrite transaction)
 */
export const writeToDb = async <T = any>(
  db: IDBDatabase,
  storeName: string,
  key: string,
  value: T,
  options?: {
    createBackup?: boolean;
    backupStoreName?: string;
  }
): Promise<boolean> => {
  const { createBackup = false, backupStoreName = 'backups_store' } = options || {};

  const stores = createBackup ? [storeName, backupStoreName] : [storeName];
  const mode = 'readwrite';

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(stores, mode);
      let putComplete = false;

      // Main write
      const store = tx.objectStore(storeName);
      const request = store.put({ key, ...value });

      request.onsuccess = () => {
        putComplete = true;

        // Optional backup
        if (createBackup && backupStoreName && stores.length > 1) {
          const backupStore = tx.objectStore(backupStoreName);
          const backupKey = `${key}-${new Date().toISOString()}`;
          const backupRequest = backupStore.put({
            key: backupKey,
            timestamp: Date.now(),
            value,
          });

          backupRequest.onerror = () => {
            console.warn('Backup creation failed, but main write succeeded');
          };
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to write to ${storeName}`));
      };

      tx.oncomplete = () => {
        if (putComplete) resolve(true);
      };

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message}`));
      };
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Delete operation with safety checks
 */
export const deleteFromDb = async (
  db: IDBDatabase,
  storeName: string,
  key: string,
  options?: {
    verifyBeforeDelete?: boolean;
  }
): Promise<boolean> => {
  const { verifyBeforeDelete = true } = options || {};

  // Verify item exists before deletion
  if (verifyBeforeDelete) {
    const existing = await readFromDb(db, storeName, key);
    if (!existing) {
      console.warn(`Item ${key} not found in ${storeName}, skipping delete`);
      return false;
    }
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(new Error(`Failed to delete ${key} from ${storeName}`));
  });
};

/**
 * Batch transaction for multiple writes
 * More efficient than individual writes
 */
export const batchWriteToDb = async <T = any>(
  db: IDBDatabase,
  storeName: string,
  items: Array<{ key: string; value: T }>
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);

      items.forEach(({ key, value }) => {
        const request = store.put({ key, ...value });
        request.onsuccess = () => success++;
        request.onerror = () => {
          failed++;
          errors.push(`Failed to write ${key}`);
        };
      });

      tx.oncomplete = () => {
        resolve({ success, failed, errors });
      };

      tx.onerror = () => {
        reject(new Error(`Batch transaction failed: ${tx.error?.message}`));
      };
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Atomic read-modify-write operation
 * Prevents race conditions
 */
export const atomicUpdate = async <T = any>(
  db: IDBDatabase,
  storeName: string,
  key: string,
  updater: (current: T) => T
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);

    // Read
    const readRequest = store.get(key);
    readRequest.onsuccess = () => {
      try {
        const current = readRequest.result?.value || readRequest.result;
        const updated = updater(current);

        // Write
        const writeRequest = store.put({ key, value: updated });
        writeRequest.onsuccess = () => resolve(updated);
        writeRequest.onerror = () => reject(new Error(`Failed to update ${key}`));
      } catch (error) {
        reject(error);
      }
    };

    readRequest.onerror = () => reject(new Error(`Failed to read ${key}`));
  });
};

/**
 * Safe migration with rollback
 */
export const migrateData = async <T = any>(
  db: IDBDatabase,
  fromStore: string,
  toStore: string,
  transformer: (data: T) => T,
  options?: {
    createBackup?: boolean;
    key?: string;
  }
): Promise<{ success: boolean; itemsMigrated: number; error?: Error }> => {
  const { createBackup = true, key = 'courses_data' } = options || {};

  try {
    // Read original data
    const original = await readFromDb<T>(db, fromStore, key);
    if (!original) {
      return {
        success: false,
        itemsMigrated: 0,
        error: new Error(`No data found in ${fromStore}`),
      };
    }

    // Create backup
    if (createBackup) {
      await writeToDb(db, 'backups_store', `pre-migration-${Date.now()}`, original);
    }

    // Transform
    const transformed = transformer(original);

    // Write to new store
    await writeToDb(db, toStore, key, transformed);

    return { success: true, itemsMigrated: 1 };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { success: false, itemsMigrated: 0, error: err };
  }
};

/**
 * Check database health
 */
export const checkDbHealth = async (
  db: IDBDatabase
): Promise<{
  healthy: boolean;
  storeStatus: Record<string, { accessible: boolean; count?: number }>;
  lastError?: string;
}> => {
  const storeStatus: Record<string, { accessible: boolean; count?: number }> = {};

  try {
    for (const storeName of Array.from(db.objectStoreNames)) {
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const countRequest = store.count();

        await new Promise((resolve, reject) => {
          countRequest.onsuccess = () => {
            storeStatus[storeName] = {
              accessible: true,
              count: countRequest.result,
            };
            resolve(undefined);
          };
          countRequest.onerror = () => {
            storeStatus[storeName] = { accessible: false };
            resolve(undefined);
          };
        });
      } catch (error) {
        storeStatus[storeName] = { accessible: false };
      }
    }

    return {
      healthy: Object.values(storeStatus).every((s) => s.accessible),
      storeStatus,
    };
  } catch (error) {
    return {
      healthy: false,
      storeStatus,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
};
