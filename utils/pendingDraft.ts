import { produce } from 'immer';
import type { Course } from '../types';

/**
 * A draft written just before the page goes away.
 *
 * An IndexedDB write started on the way out is aborted when the page is torn down, so the last
 * typing could be lost. This entry is one synchronous localStorage write, which does survive
 * the unload. It is read back on the next load and applied only when the stored draft is still
 * the one this tab was working from (`prev`); a draft that has moved on since is discarded, so an
 * older entry never comes back over a newer edit. It is cleared once a save holds its text.
 *
 * Every access is wrapped: storage that is blocked, full or throwing makes this a no-op.
 */

export const PENDING_DRAFT_KEY = 'hsc.pendingDraft';

/** Longer than this, the text is not stashed (it would not fit the quota anyway). */
const MAX_TEXT_LENGTH = 200_000;

export interface PendingDraft {
  promptId: string;
  text: string;
  elapsed?: number;
  /** The draft this tab last knew to be stored for the prompt ('' when none). */
  prev: string;
  at: number;
}

/** Writes the entry now, synchronously. Silently does nothing when it cannot. */
export const writePendingDraft = (pending: PendingDraft): void => {
  if (pending.text.length > MAX_TEXT_LENGTH) return;
  try {
    window.localStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(pending));
  } catch {
    // Quota, private browsing, or storage blocked: nothing to do but carry on.
  }
};

/** The entry, or null when there is none or it is not one this build wrote. */
export const readPendingDraft = (): PendingDraft | null => {
  try {
    const raw = window.localStorage.getItem(PENDING_DRAFT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    if (typeof v.promptId !== 'string' || typeof v.text !== 'string') return null;
    if (typeof v.prev !== 'string' || typeof v.at !== 'number') return null;
    if (v.elapsed !== undefined && typeof v.elapsed !== 'number') return null;
    return {
      promptId: v.promptId,
      text: v.text,
      prev: v.prev,
      at: v.at,
      ...(typeof v.elapsed === 'number' ? { elapsed: v.elapsed } : {}),
    };
  } catch {
    return null;
  }
};

export const clearPendingDraft = (): void => {
  try {
    window.localStorage.removeItem(PENDING_DRAFT_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};

/**
 * 'apply' when the stored draft is still `prev` and differs from the pending text; 'discard'
 * otherwise (the stored draft already holds the text, or something else has changed it since).
 */
export const resolvePendingDraft = (
  pending: PendingDraft,
  storedDraft: string | undefined
): 'apply' | 'discard' => {
  const stored = storedDraft ?? '';
  if (stored === pending.prev && pending.text !== stored) return 'apply';
  return 'discard';
};

interface Found {
  found: boolean;
  userDraft?: string;
  elapsed?: number;
}

const findPrompt = (courses: Course[], promptId: string): Found => {
  for (const course of courses)
    for (const topic of course.topics ?? [])
      for (const subTopic of topic.subTopics ?? [])
        for (const dotPoint of subTopic.dotPoints ?? [])
          for (const prompt of dotPoint.prompts ?? []) {
            if (prompt.id !== promptId) continue;
            return {
              found: true,
              userDraft: prompt.userDraft,
              elapsed: prompt.draftElapsedSeconds,
            };
          }
  return { found: false };
};

/**
 * Decides what a pending entry means for a library as stored: 'apply' only when the prompt still
 * exists and `resolvePendingDraft` says so. Pure; the library is not changed.
 */
export const decidePendingDraft = (
  pending: PendingDraft,
  stored: Course[]
): 'apply' | 'discard' => {
  const found = findPrompt(stored, pending.promptId);
  if (!found.found) return 'discard';
  return resolvePendingDraft(pending, found.userDraft);
};

/**
 * The library with the pending text put onto its prompt (the elapsed time never goes backwards).
 * Returns the same reference when the prompt is not there.
 */
export const applyPendingDraft = (courses: Course[], pending: PendingDraft): Course[] => {
  if (!findPrompt(courses, pending.promptId).found) return courses;
  return produce(courses, (draft) => {
    for (const course of draft)
      for (const topic of course.topics ?? [])
        for (const subTopic of topic.subTopics ?? [])
          for (const dotPoint of subTopic.dotPoints ?? [])
            for (const prompt of dotPoint.prompts ?? []) {
              if (prompt.id !== pending.promptId) continue;
              prompt.userDraft = pending.text;
              if (pending.elapsed !== undefined)
                prompt.draftElapsedSeconds = Math.max(
                  prompt.draftElapsedSeconds ?? 0,
                  pending.elapsed
                );
            }
  });
};

/** True when `courses` holds the pending text for its prompt, so the entry has been written. */
export const holdsPendingText = (courses: Course[], pending: PendingDraft): boolean => {
  const found = findPrompt(courses, pending.promptId);
  return found.found && found.userDraft === pending.text;
};
