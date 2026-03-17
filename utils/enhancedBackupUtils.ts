/**
 * Enhanced backup and recovery system with intelligent cleanup and versioning
 * Replaces basic daily snapshots with smart, space-efficient backups
 */

import { Course } from '../types';

export interface EnhancedBackup {
  id: string;
  timestamp: number;
  description: string;
  version: string;
  size: number; // bytes
  checksum: string;
  type: 'auto' | 'manual' | 'pre-import' | 'pre-migration';
  retention: {
    autoDelete?: boolean;
    deleteAfterDays?: number;
    priority?: 'low' | 'medium' | 'high';
  };
  metadata: {
    courseCount: number;
    questionCount: number;
    sampleAnswerCount: number;
    previousBackupId?: string; // For delta compression
  };
}

export interface BackupManifest {
  backups: EnhancedBackup[];
  totalSize: number;
  quota: {
    used: number;
    available: number;
    percentage: number;
  };
}

/**
 * Create an enhanced backup with metadata
 */
export const createEnhancedBackup = (
  courses: Course[],
  type: EnhancedBackup['type'] = 'auto',
  description: string = '',
  retentionDays?: number
): EnhancedBackup => {
  const data = JSON.stringify(courses);
  const size = new Blob([data]).size;

  return {
    id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    description,
    version: '1.0.0',
    size,
    checksum: generateChecksum(data),
    type,
    retention: {
      autoDelete: type === 'auto',
      deleteAfterDays: retentionDays || (type === 'auto' ? 7 : 30),
      priority: type === 'pre-migration' ? 'high' : type === 'manual' ? 'medium' : 'low',
    },
    metadata: {
      courseCount: courses.length,
      questionCount: countQuestions(courses),
      sampleAnswerCount: countSampleAnswers(courses),
    },
  };
};

/**
 * Smart backup cleanup with priority-based retention
 * Removes old/low-priority backups when storage quota is exceeded
 */
export const cleanupBackups = (
  backups: EnhancedBackup[],
  options: {
    maxBackups?: number;
    maxStorageMb?: number;
    minRetentionDays?: number;
  } = {}
): {
  deleted: string[];
  retained: string[];
  freedSpaceMb: number;
} => {
  const { maxBackups = 10, maxStorageMb = 50, minRetentionDays = 7 } = options;

  const result = {
    deleted: [] as string[],
    retained: [] as string[],
    freedSpaceMb: 0,
  };

  // Sort by priority and age
  const sorted = [...backups]
    .map((b) => ({
      ...b,
      ageDays: (Date.now() - b.timestamp) / (1000 * 60 * 60 * 24),
      priorityScore:
        (b.retention.priority === 'high' ? 100 : b.retention.priority === 'medium' ? 50 : 0) +
        (b.type === 'manual' ? 50 : 0) -
        (Date.now() - b.timestamp) / (1000 * 60 * 60), // Newer = higher score
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  let totalSize = sorted.reduce((sum, b) => sum + b.size, 0);
  let deleteCount = 0;

  // Phase 1: Remove old auto-backups
  for (const backup of sorted) {
    if (backup.type === 'auto' && backup.ageDays > minRetentionDays) {
      const shouldDelete = sorted.length > maxBackups || totalSize / 1024 / 1024 > maxStorageMb;

      if (shouldDelete) {
        result.deleted.push(backup.id);
        totalSize -= backup.size;
        result.freedSpaceMb += backup.size / 1024 / 1024;
        deleteCount++;
      }
    }
  }

  // Phase 2: Force-remove oldest if still over quota
  if (totalSize / 1024 / 1024 > maxStorageMb || sorted.length > maxBackups) {
    const remaining = sorted.filter((b) => !result.deleted.includes(b.id));
    for (let i = remaining.length - 1; i >= 0 && sorted.length - deleteCount > 2; i--) {
      if (remaining[i].retention.autoDelete !== false) {
        result.deleted.push(remaining[i].id);
        totalSize -= remaining[i].size;
        result.freedSpaceMb += remaining[i].size / 1024 / 1024;
        deleteCount++;
      }
    }
  }

  // Retained = all except deleted
  result.retained = sorted.filter((b) => !result.deleted.includes(b.id)).map((b) => b.id);

  return result;
};

/**
 * Intelligent backup scheduling
 * Determines if a new backup should be created based on changes
 */
export const shouldCreateBackup = (
  lastBackup: EnhancedBackup | undefined,
  currentCourses: Course[],
  options: {
    minIntervalMinutes?: number;
    minChangesPercentage?: number;
  } = {}
): boolean => {
  const { minIntervalMinutes = 60, minChangesPercentage = 5 } = options;

  // No previous backup, create one
  if (!lastBackup) return true;

  // Check time interval
  const timeSinceLastBackup = (Date.now() - lastBackup.timestamp) / (1000 * 60);
  if (timeSinceLastBackup < minIntervalMinutes) {
    return false;
  }

  // Check if significant changes occurred
  const currentQuestionCount = countQuestions(currentCourses);
  const changePercentage =
    Math.abs(currentQuestionCount - lastBackup.metadata.questionCount) /
    lastBackup.metadata.questionCount;

  return changePercentage >= minChangesPercentage / 100;
};

/**
 * Generate backup manifest with storage stats
 */
export const generateBackupManifest = (
  backups: EnhancedBackup[],
  quotaMb: number = 50
): BackupManifest => {
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  const usedMb = totalSize / 1024 / 1024;

  return {
    backups: backups.sort((a, b) => b.timestamp - a.timestamp),
    totalSize,
    quota: {
      used: Math.round(usedMb * 100) / 100,
      available: quotaMb - usedMb,
      percentage: (usedMb / quotaMb) * 100,
    },
  };
};

/**
 * Restore from a specific backup with validation
 */
export const restoreFromBackup = (
  backup: EnhancedBackup,
  backupData: Course[]
): { success: boolean; error?: Error; data?: Course[] } => {
  try {
    // Verify checksum
    const data = JSON.stringify(backupData);
    const checksum = generateChecksum(data);

    if (checksum !== backup.checksum) {
      return {
        success: false,
        error: new Error('Backup checksum mismatch - data may be corrupted'),
      };
    }

    // Verify metadata
    if (backupData.length !== backup.metadata.courseCount) {
      return {
        success: false,
        error: new Error('Backup course count mismatch'),
      };
    }

    return { success: true, data: backupData };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

/**
 * Compare two backups to see what changed
 */
export const compareBackups = (
  backup1: EnhancedBackup,
  backup2: EnhancedBackup
): {
  added: number;
  removed: number;
  modified: number;
  sizeChange: number;
  percentageChange: number;
} => {
  const courseDiff = backup2.metadata.courseCount - backup1.metadata.courseCount;
  const questionDiff = backup2.metadata.questionCount - backup1.metadata.questionCount;
  const answerDiff = backup2.metadata.sampleAnswerCount - backup1.metadata.sampleAnswerCount;
  const sizeDiff = backup2.size - backup1.size;
  const percentChange = (sizeDiff / backup1.size) * 100;

  return {
    added: Math.max(0, courseDiff, questionDiff, answerDiff),
    removed: Math.abs(Math.min(0, courseDiff, questionDiff, answerDiff)),
    modified: Math.abs(questionDiff) - Math.max(0, courseDiff, questionDiff),
    sizeChange: sizeDiff,
    percentageChange: Math.round(percentChange * 100) / 100,
  };
};

/**
 * Create a lightweight backup (metadata only, for quick recovery)
 */
export const createLightweightBackup = (
  courses: Course[],
  description: string = ''
): EnhancedBackup => {
  const backup = createEnhancedBackup(courses, 'auto', description);

  // Replace full data with metadata summary
  return {
    ...backup,
    id: `lightweight-${backup.id}`,
    size: 0, // Will be calculated from metadata only
  };
};

/**
 * Archive old backups to cold storage (localStorage) for long-term retention
 */
export const archiveBackup = (
  backup: EnhancedBackup,
  key: string = 'archived_backups'
): boolean => {
  try {
    const archived = JSON.parse(localStorage.getItem(key) || '[]');
    archived.push({
      ...backup,
      archived_at: Date.now(),
    });

    // Keep only last 5 years of archived backups
    const fiveYearsAgo = Date.now() - 365 * 5 * 24 * 60 * 60 * 1000;
    const filtered = archived.filter((b: any) => b.timestamp > fiveYearsAgo);

    localStorage.setItem(key, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to archive backup:', error);
    return false;
  }
};

/**
 * Retrieve archived backups
 */
export const getArchivedBackups = (key: string = 'archived_backups'): EnhancedBackup[] => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};

// ===== PRIVATE HELPERS =====

const generateChecksum = (data: string): string => {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const countQuestions = (courses: Course[]): number => {
  return courses.reduce((acc, c) => {
    return (
      acc +
      c.topics.reduce(
        (acc2, t) =>
          acc2 +
          t.subTopics.reduce(
            (acc3, st) => acc3 + st.dotPoints.reduce((acc4, dp) => acc4 + dp.prompts.length, 0),
            0
          ),
        0
      )
    );
  }, 0);
};

const countSampleAnswers = (courses: Course[]): number => {
  let total = 0;
  courses.forEach((c) => {
    c.topics.forEach((t) => {
      t.subTopics.forEach((st) => {
        st.dotPoints.forEach((dp) => {
          dp.prompts.forEach((p) => {
            total += p.sampleAnswers?.length || 0;
          });
        });
      });
    });
  });
  return total;
};
