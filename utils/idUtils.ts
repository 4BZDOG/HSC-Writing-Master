// utils/idUtils.ts

/**
 * Generates a unique ID with a given prefix.
 * Uses crypto.randomUUID for robust uniqueness if available, otherwise falls back
 * to a combination of timestamp and random string.
 *
 * @param prefix A short string to prepend to the ID (e.g., 'course', 'topic').
 * @returns A unique string identifier.
 */
export const generateId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  // Fallback for environments without crypto.randomUUID
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};