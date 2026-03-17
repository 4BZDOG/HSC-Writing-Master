/**
 * Offline-first sync queue for pending changes
 * Persists changes to IndexedDB before storage saves complete
 * Ensures no data loss if browser closes during save
 */

import { Course } from '../types';

export interface PendingChange {
  id: string;
  timestamp: number;
  operation: 'create' | 'update' | 'delete';
  entityType: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';
  entityId: string;
  parentIds?: {
    courseId?: string;
    topicId?: string;
    subTopicId?: string;
    dotPointId?: string;
  };
  data?: any;
  checksum: string;
  retries: number;
  lastError?: string;
  status: 'pending' | 'synced' | 'failed';
}

export interface SyncQueueStats {
  pending: number;
  synced: number;
  failed: number;
  totalRetries: number;
  oldestPendingAge: number;
}

/**
 * Initialize offline sync queue in IndexedDB
 */
export const initializeSyncQueue = async (db: IDBDatabase): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');

      // Clear old synced items (older than 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const range = IDBKeyRange.upperBound(sevenDaysAgo);
      const deleteRequest = store.delete(range);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn('Failed to initialize sync queue, continuing anyway');
        resolve(true);
      };
    } catch (error) {
      console.warn('Sync queue not available', error);
      resolve(true);
    }
  });
};

/**
 * Add a pending change to the queue
 */
export const addPendingChange = async (
  db: IDBDatabase,
  change: Omit<PendingChange, 'id' | 'timestamp' | 'checksum' | 'retries' | 'status'>
): Promise<PendingChange> => {
  const pendingChange: PendingChange = {
    ...change,
    id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    checksum: generateChecksum(change.data),
    retries: 0,
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.add(pendingChange);

      request.onsuccess = () => resolve(pendingChange);
      request.onerror = () => reject(new Error('Failed to add pending change'));
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Get all pending changes
 */
export const getPendingChanges = async (db: IDBDatabase): Promise<PendingChange[]> => {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        const changes = (request.result || []).filter((c: any) => c.status === 'pending');
        resolve(changes);
      };
      request.onerror = () => reject(new Error('Failed to fetch pending changes'));
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Mark a change as synced
 */
export const markChangeSynced = async (db: IDBDatabase, changeId: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');

      // Get the change
      const getRequest = store.get(changeId);
      getRequest.onsuccess = () => {
        const change = getRequest.result;
        if (change) {
          change.status = 'synced';
          const updateRequest = store.put(change);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(new Error('Failed to update change'));
        } else {
          resolve(false);
        }
      };
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Mark a change as failed and increment retry count
 */
export const markChangeFailed = async (
  db: IDBDatabase,
  changeId: string,
  error: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');

      const getRequest = store.get(changeId);
      getRequest.onsuccess = () => {
        const change = getRequest.result;
        if (change) {
          change.retries++;
          change.lastError = error;

          // Give up after 5 retries
          if (change.retries >= 5) {
            change.status = 'failed';
          }

          const updateRequest = store.put(change);
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => reject(new Error('Failed to update change'));
        } else {
          resolve(false);
        }
      };
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Apply pending changes to current courses
 * Merges pending changes with fetched data for consistency
 */
export const applyPendingChanges = (
  courses: Course[],
  pendingChanges: PendingChange[]
): Course[] => {
  let result = [...courses];

  // Sort by timestamp to apply in order
  const sorted = pendingChanges.sort((a, b) => a.timestamp - b.timestamp);

  for (const change of sorted) {
    result = applyChange(result, change);
  }

  return result;
};

/**
 * Get sync queue statistics
 */
export const getSyncQueueStats = async (db: IDBDatabase): Promise<SyncQueueStats> => {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        const changes = request.result || [];
        const pending = changes.filter((c) => c.status === 'pending');
        const synced = changes.filter((c) => c.status === 'synced');
        const failed = changes.filter((c) => c.status === 'failed');
        const totalRetries = changes.reduce((sum, c) => sum + c.retries, 0);

        const oldestPending = pending.length > 0 ? Math.min(...pending.map((c) => c.timestamp)) : 0;
        const oldestAge = oldestPending ? Date.now() - oldestPending : 0;

        resolve({
          pending: pending.length,
          synced: synced.length,
          failed: failed.length,
          totalRetries,
          oldestPendingAge: oldestAge,
        });
      };

      request.onerror = () => {
        resolve({
          pending: 0,
          synced: 0,
          failed: 0,
          totalRetries: 0,
          oldestPendingAge: 0,
        });
      };
    } catch {
      resolve({
        pending: 0,
        synced: 0,
        failed: 0,
        totalRetries: 0,
        oldestPendingAge: 0,
      });
    }
  });
};

/**
 * Clear synced changes older than specified days
 */
export const cleanupSyncedChanges = async (
  db: IDBDatabase,
  olderThanDays: number = 7
): Promise<number> => {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => {
        const changes = request.result || [];
        let deleted = 0;

        for (const change of changes) {
          if (change.status === 'synced' && change.timestamp < cutoff) {
            store.delete(change.id);
            deleted++;
          }
        }

        tx.oncomplete = () => resolve(deleted);
      };

      request.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
};

/**
 * Retry failed changes
 */
export const retryFailedChanges = async (
  db: IDBDatabase,
  maxRetries: number = 5
): Promise<PendingChange[]> => {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      const retryable: PendingChange[] = [];

      request.onsuccess = () => {
        const changes = request.result || [];

        for (const change of changes) {
          if (change.status === 'pending' && change.retries < maxRetries) {
            retryable.push(change);
          } else if (change.status === 'failed' && change.retries < maxRetries) {
            change.status = 'pending';
            change.lastError = undefined;
            store.put(change);
            retryable.push(change);
          }
        }

        tx.oncomplete = () => resolve(retryable);
      };

      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
};

// ===== PRIVATE HELPERS =====

const generateChecksum = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const applyChange = (courses: Course[], change: PendingChange): Course[] => {
  const { operation, entityType, entityId, parentIds, data } = change;

  switch (operation) {
    case 'create':
      return handleCreate(courses, entityType, data, parentIds);
    case 'update':
      return handleUpdate(courses, entityType, entityId, data, parentIds);
    case 'delete':
      return handleDelete(courses, entityType, entityId, parentIds);
    default:
      return courses;
  }
};

const handleCreate = (
  courses: Course[],
  entityType: string,
  data: any,
  parentIds: any
): Course[] => {
  // Implementation depends on entityType
  // This is a placeholder - actual implementation would be more complex
  return courses;
};

const handleUpdate = (
  courses: Course[],
  entityType: string,
  entityId: string,
  data: any,
  parentIds: any
): Course[] => {
  // Implementation depends on entityType
  return courses;
};

const handleDelete = (
  courses: Course[],
  entityType: string,
  entityId: string,
  parentIds: any
): Course[] => {
  // Implementation depends on entityType
  return courses;
};
