import { getDB, STORE_SCENARIO_IMAGES } from './storageUtils';

/**
 * Scenario images live in their own IndexedDB object store rather than
 * inline on the Prompt itself — see `types.ts`'s `ScenarioImageRef` for why.
 * `Prompt.scenarioImage` only ever carries a lightweight reference; these
 * helpers are the sole read/write path for the actual image bytes.
 */

export const saveScenarioImage = async (
  promptId: string,
  dataUrl: string,
  alt?: string
): Promise<void> => {
  const db = await getDB();
  await db.put(STORE_SCENARIO_IMAGES, { promptId, dataUrl, alt, updatedAt: Date.now() }, promptId);
};

export const loadScenarioImage = async (
  promptId: string
): Promise<{ dataUrl: string; alt?: string } | null> => {
  try {
    const db = await getDB();
    const row = await db.get(STORE_SCENARIO_IMAGES, promptId);
    return row ? { dataUrl: row.dataUrl, alt: row.alt } : null;
  } catch (error) {
    // An image that cannot be read is no image: the callers show their placeholder
    // rather than a loading state that never ends.
    console.warn('Could not read scenario image:', error);
    return null;
  }
};

export const deleteScenarioImage = async (promptId: string): Promise<void> => {
  const db = await getDB();
  await db.delete(STORE_SCENARIO_IMAGES, promptId);
};
