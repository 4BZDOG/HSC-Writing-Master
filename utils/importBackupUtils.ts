import { Course } from '../types';

/**
 * Utility for creating backups before imports and restoring on failure
 * Provides atomic import operations with rollback capability
 */

interface ImportSnapshot {
  timestamp: number;
  description: string;
  coursesData: Course[];
  originalHash: string; // For integrity checking
}

/**
 * Create a backup snapshot of current courses
 */
export const createBackupSnapshot = (
  courses: Course[],
  description: string = 'Pre-import backup'
): ImportSnapshot => {
  return {
    timestamp: Date.now(),
    description,
    coursesData: JSON.parse(JSON.stringify(courses)), // Deep clone
    originalHash: generateDataHash(courses),
  };
};

/**
 * Check if a snapshot is still valid (data hasn't been tampered with)
 */
export const isSnapshotValid = (snapshot: ImportSnapshot): boolean => {
  const currentHash = generateDataHash(snapshot.coursesData);
  return currentHash === snapshot.originalHash;
};

/**
 * Store a snapshot in localStorage for recovery
 * @returns true if successfully stored
 */
export const storeBackupSnapshot = (
  snapshot: ImportSnapshot,
  key: string = 'lastImportBackup'
): boolean => {
  try {
    const serialized = JSON.stringify({
      ...snapshot,
      storedAt: new Date().toISOString(),
    });

    // Check storage quota
    if (serialized.length > 5 * 1024 * 1024) {
      console.warn('Backup snapshot too large to store (>5MB)');
      return false;
    }

    localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    console.error('Failed to store backup snapshot:', err);
    return false;
  }
};

/**
 * Retrieve a stored snapshot from localStorage
 */
export const retrieveBackupSnapshot = (key: string = 'lastImportBackup'): ImportSnapshot | null => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Remove metadata fields
    const { storedAt, ...snapshot } = parsed;
    return snapshot as ImportSnapshot;
  } catch (err) {
    console.error('Failed to retrieve backup snapshot:', err);
    return null;
  }
};

/**
 * Clear a stored backup snapshot
 */
export const clearBackupSnapshot = (key: string = 'lastImportBackup'): void => {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to clear backup snapshot:', err);
  }
};

/**
 * Validate import data before applying
 * Returns list of validation errors (empty if valid)
 */
export const validateImportData = (courses: Course[]): string[] => {
  const errors: string[] = [];

  if (!Array.isArray(courses)) {
    errors.push('Import data must be an array of courses');
    return errors;
  }

  courses.forEach((course, index) => {
    if (!course.id || typeof course.id !== 'string') {
      errors.push(`Course ${index}: Missing or invalid ID`);
    }
    if (!course.name || typeof course.name !== 'string') {
      errors.push(`Course ${index}: Missing or invalid name`);
    }
    if (!Array.isArray(course.topics)) {
      errors.push(`Course ${index}: Topics must be an array`);
    }

    // Validate nested topics
    course.topics?.forEach((topic, topicIndex) => {
      if (!topic.id || !topic.name) {
        errors.push(`Course ${index}, Topic ${topicIndex}: Invalid topic structure`);
      }
      if (!Array.isArray(topic.subTopics)) {
        errors.push(`Course ${index}, Topic ${topicIndex}: SubTopics must be an array`);
      }

      // Validate nested subTopics
      topic.subTopics?.forEach((subTopic, subTopicIndex) => {
        if (!subTopic.id || !subTopic.name) {
          errors.push(
            `Course ${index}, Topic ${topicIndex}, SubTopic ${subTopicIndex}: Invalid subTopic structure`
          );
        }
        if (!Array.isArray(subTopic.dotPoints)) {
          errors.push(
            `Course ${index}, Topic ${topicIndex}, SubTopic ${subTopicIndex}: DotPoints must be an array`
          );
        }
      });
    });
  });

  return errors;
};

/**
 * Generate a hash of the data for integrity checking
 */
const generateDataHash = (data: Course[]): string => {
  const sortedData = JSON.stringify(data);
  // Simple hash function - in production, use a proper hashing library
  let hash = 0;
  for (let i = 0; i < sortedData.length; i++) {
    const char = sortedData.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Merge imported courses with existing courses
 * Handles conflicts based on resolution strategy
 */
export const mergeImportedCourses = (
  existingCourses: Course[],
  newCourses: Course[],
  conflictResolutions: Map<string, 'merge' | 'skip'> = new Map()
): Course[] => {
  const merged = [...existingCourses];

  newCourses.forEach((newCourse) => {
    const resolution = conflictResolutions.get(newCourse.id) || 'merge';
    const existingIndex = merged.findIndex((c) => c.id === newCourse.id);

    if (existingIndex === -1) {
      // No conflict, add new course
      merged.push(newCourse);
    } else if (resolution === 'merge') {
      // Merge strategy: combine topics
      const existingCourse = merged[existingIndex];
      const mergedTopics = [...existingCourse.topics];

      newCourse.topics.forEach((newTopic) => {
        const existingTopicIndex = mergedTopics.findIndex((t) => t.id === newTopic.id);
        if (existingTopicIndex === -1) {
          mergedTopics.push(newTopic);
        }
        // If topic already exists, keep existing (don't overwrite)
      });

      merged[existingIndex] = {
        ...existingCourse,
        topics: mergedTopics,
      };
    }
    // If resolution === 'skip', don't modify existing course
  });

  return merged;
};

/**
 * Generate a diff report between before and after import
 */
export const generateImportDiff = (
  beforeCourses: Course[],
  afterCourses: Course[]
): {
  coursesAdded: number;
  coursesModified: number;
  topicsAdded: number;
  questionsAdded: number;
} => {
  let coursesAdded = 0;
  let coursesModified = 0;
  let topicsAdded = 0;
  let questionsAdded = 0;

  afterCourses.forEach((afterCourse) => {
    const before = beforeCourses.find((c) => c.id === afterCourse.id);

    if (!before) {
      coursesAdded++;
      // Count all nested items
      afterCourse.topics.forEach((topic) => {
        topicsAdded++;
        topic.subTopics.forEach((subTopic) => {
          questionsAdded += subTopic.dotPoints.reduce((acc, dp) => acc + dp.prompts.length, 0);
        });
      });
    } else {
      const beforeTopicCount = before.topics.length;
      const afterTopicCount = afterCourse.topics.length;

      if (afterTopicCount > beforeTopicCount) {
        coursesModified++;
        topicsAdded += afterTopicCount - beforeTopicCount;
      }

      // Count new questions
      afterCourse.topics.forEach((afterTopic) => {
        const beforeTopic = before.topics.find((t) => t.id === afterTopic.id);
        if (beforeTopic) {
          afterTopic.subTopics.forEach((afterSubTopic) => {
            const beforeSubTopic = beforeTopic.subTopics.find((st) => st.id === afterSubTopic.id);
            if (beforeSubTopic) {
              afterSubTopic.dotPoints.forEach((afterDP) => {
                const beforeDP = beforeSubTopic.dotPoints.find((dp) => dp.id === afterDP.id);
                if (!beforeDP) {
                  questionsAdded += afterDP.prompts.length;
                } else {
                  const beforeQCount = beforeDP.prompts.length;
                  const afterQCount = afterDP.prompts.length;
                  if (afterQCount > beforeQCount) {
                    questionsAdded += afterQCount - beforeQCount;
                  }
                }
              });
            }
          });
        }
      });
    }
  });

  return {
    coursesAdded,
    coursesModified,
    topicsAdded,
    questionsAdded,
  };
};
