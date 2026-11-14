import { produce } from 'immer';
import type { Course, Prompt } from '../types';

/**
 * Merging the drafts two tabs hold, when they write the same library.
 *
 * The library is one IndexedDB value, so a tab that saves writes every question
 * in it, its own drafts included. A tab that opened earlier still holds the old
 * text of the questions it did not touch, and writing that back reverted a draft
 * the other tab had just saved. The fix is to keep a draft another tab has
 * written, unless this tab has changed that draft itself since it last read or
 * wrote the library. `base` is what this tab last read or wrote, so "changed
 * here" is "differs from base".
 *
 * KNOWN LIMIT: only the two personal fields below are merged. Everything else
 * (the curriculum structure, marking guides, sample answers, course names) comes
 * from the tab that saves, so a curator editing the structure in two tabs still
 * has the last save win. Two tabs typing in the SAME question is last-save-wins
 * too: the tab with the unchanged base takes the other's text only when this tab
 * has not typed in that question since it last read or wrote it.
 */

export type DraftFields = { userDraft?: string; draftElapsedSeconds?: number };

/** Promptid -> the draft fields this tab last read or wrote. Only prompts with a draft are recorded. */
export type DraftBase = Map<string, DraftFields>;

type Walkable = Pick<Course, 'topics'>;

/** Every prompt in the library, in the order the library holds them. */
const forEachPrompt = (courses: Walkable[], visit: (prompt: Prompt) => void): void => {
  for (const course of courses)
    for (const topic of course.topics ?? [])
      for (const subTopic of topic.subTopics ?? [])
        for (const dotPoint of subTopic.dotPoints ?? [])
          for (const prompt of dotPoint.prompts ?? []) visit(prompt);
};

const pickDraft = (prompt: Prompt): DraftFields => {
  const fields: DraftFields = {};
  if (prompt.userDraft !== undefined) fields.userDraft = prompt.userDraft;
  if (prompt.draftElapsedSeconds !== undefined)
    fields.draftElapsedSeconds = prompt.draftElapsedSeconds;
  return fields;
};

/** The draft fields of every prompt that has one, as the library holds them now. */
export const collectDrafts = (courses: Course[]): DraftBase => {
  const base: DraftBase = new Map();
  forEachPrompt(courses, (prompt) => {
    const fields = pickDraft(prompt);
    if (Object.keys(fields).length > 0) base.set(prompt.id, fields);
  });
  return base;
};

/** The draft fields this tab would change if it took `stored`'s values, per prompt. */
const decide = (
  local: DraftFields,
  stored: DraftFields,
  base: DraftFields
): { next: DraftFields; changed: DraftFields } => {
  const next: DraftFields = { ...local };
  const changed: DraftFields = {};

  // Taken from the other tab only when this tab has not changed the text.
  if (stored.userDraft !== local.userDraft && local.userDraft === base.userDraft) {
    next.userDraft = stored.userDraft;
    changed.userDraft = stored.userDraft;
  }

  // Never backwards, whichever tab is ahead. Taking the larger total is also the
  // one thing a stale tab must not do: it would hand back time a student spent.
  if (stored.draftElapsedSeconds !== undefined || local.draftElapsedSeconds !== undefined) {
    const larger = Math.max(local.draftElapsedSeconds ?? 0, stored.draftElapsedSeconds ?? 0);
    if (larger !== local.draftElapsedSeconds) {
      next.draftElapsedSeconds = larger;
      changed.draftElapsedSeconds = larger;
    }
  }
  return { next, changed };
};

/**
 * `local` (this tab's library) with the drafts another tab wrote to `stored`
 * kept, where this tab has not changed them since `base`.
 *
 * Only prompts that exist in `local` are considered: a prompt that is only in
 * `stored` is not brought back. `adopted` lists what was taken from `stored`, by
 * prompt id. When nothing is adopted `merged` IS `local` (the same reference), so
 * a caller's reference check still says "nothing changed". Neither input is
 * mutated.
 */
export const mergeForeignDrafts = (
  local: Course[],
  stored: Course[],
  base: DraftBase
): { merged: Course[]; adopted: Map<string, DraftFields> } => {
  const storedById = new Map<string, DraftFields>();
  forEachPrompt(stored, (prompt) => {
    const fields = pickDraft(prompt);
    if (Object.keys(fields).length > 0) storedById.set(prompt.id, fields);
  });

  const adopted = new Map<string, DraftFields>();
  const decided = new Map<string, DraftFields>();
  forEachPrompt(local, (prompt) => {
    const storedFields = storedById.get(prompt.id);
    if (!storedFields) return;
    const { next, changed } = decide(pickDraft(prompt), storedFields, base.get(prompt.id) ?? {});
    if (Object.keys(changed).length > 0) {
      adopted.set(prompt.id, changed);
      decided.set(prompt.id, next);
    }
  });

  if (adopted.size === 0) return { merged: local, adopted };

  const merged = produce(local, (draft) => {
    forEachPrompt(draft as Course[], (prompt) => {
      const next = decided.get(prompt.id);
      if (!next) return;
      if (next.userDraft !== undefined) prompt.userDraft = next.userDraft;
      if (next.draftElapsedSeconds !== undefined)
        prompt.draftElapsedSeconds = next.draftElapsedSeconds;
    });
  });
  return { merged, adopted };
};

/**
 * Puts `adopted` onto a library draft (an immer draft, mutated in place), but only
 * where the draft still holds the value `base` recorded: a draft the student has
 * typed in since is left as it is. Returns how many fields were applied.
 */
export const applyAdopted = (
  draft: Course[],
  adopted: Map<string, DraftFields>,
  base: DraftBase
): number => {
  let applied = 0;
  forEachPrompt(draft, (prompt) => {
    const changes = adopted.get(prompt.id);
    if (!changes) return;
    const was = base.get(prompt.id) ?? {};
    if (changes.userDraft !== undefined && prompt.userDraft === was.userDraft) {
      prompt.userDraft = changes.userDraft;
      applied += 1;
    }
    if (
      changes.draftElapsedSeconds !== undefined &&
      (prompt.draftElapsedSeconds ?? 0) < changes.draftElapsedSeconds
    ) {
      prompt.draftElapsedSeconds = changes.draftElapsedSeconds;
      applied += 1;
    }
  });
  return applied;
};
