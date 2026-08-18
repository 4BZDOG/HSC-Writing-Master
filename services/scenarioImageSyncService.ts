/**
 * Supabase Storage sync for scenario images (see `types.ts`'s
 * `ScenarioImageRef` and `utils/scenarioImageStorage.ts`, the local IDB
 * cache these two functions sit either side of).
 *
 * Both functions are fail-soft by design: no Supabase configured, no local
 * bytes to upload, a network error, or a permission error (expected today —
 * the `scenario-images` bucket's RLS policies are still an unapplied draft,
 * see `projectDocs/Plan-P0Followups.md` item 1) must all resolve gracefully
 * rather than throw. A prompt submission, or a carousel render, must never
 * fail because an image couldn't sync.
 */
import { supabase } from './supabaseClient';
import { loadScenarioImage, saveScenarioImage } from '../utils/scenarioImageStorage';
import { ScenarioImageRef } from '../types';

const BUCKET = 'scenario-images';

/** Splits a `data:<mime>;base64,<data>` URL into a Blob + its content type. */
const dataUrlToBlob = (dataUrl: string): { blob: Blob; contentType: string } => {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  const contentType = match?.[1] || 'application/octet-stream';
  const base64 = match?.[2] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: contentType }), contentType };
};

/** Reads a Blob into a base64 `data:` URL (same FileReader approach as
 *  `utils/scenarioImageCodec.ts`'s `readFileAsDataUrl`). */
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read the downloaded image.'));
    reader.readAsDataURL(blob);
  });

/**
 * Upload a prompt's locally-cached scenario image to Supabase Storage, if
 * present and not already uploaded. Fails soft: ANY error — no Supabase
 * configured, no local bytes, a network failure, or (today, expected) a
 * permission failure because the bucket's RLS policies are still an
 * unapplied draft (see Plan-P0Followups.md item 1) — resolves to the ref
 * unchanged rather than throwing. A prompt submission must never fail
 * because its image couldn't sync.
 */
export const syncScenarioImageUp = async (
  promptId: string,
  ref: ScenarioImageRef | undefined
): Promise<ScenarioImageRef | undefined> => {
  if (!ref || !supabase) return ref;
  if (ref.storagePath) return ref; // already synced — don't re-upload unchanged bytes
  try {
    const cached = await loadScenarioImage(promptId);
    if (!cached) return ref;
    const { blob, contentType } = dataUrlToBlob(cached.dataUrl);
    const path = `${promptId}/${ref.id}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType, upsert: true });
    if (error) {
      console.warn('[ScenarioImage] Upload failed (non-fatal):', error.message);
      return ref;
    }
    return { ...ref, storagePath: path };
  } catch (err) {
    console.warn('[ScenarioImage] Upload failed (non-fatal):', err);
    return ref;
  }
};

/**
 * Download a Storage-hosted scenario image into the local IDB cache, when a
 * prompt carries a `storagePath` but has no local bytes yet (e.g. viewing a
 * prompt someone else contributed, on a fresh device/browser). Fails soft
 * for the same reasons as the upload path.
 */
export const syncScenarioImageDown = async (
  promptId: string,
  ref: ScenarioImageRef | undefined
): Promise<void> => {
  if (!ref?.storagePath || !supabase) return;
  if (await loadScenarioImage(promptId)) return; // already cached
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(ref.storagePath);
    if (error || !data) {
      console.warn('[ScenarioImage] Download failed (non-fatal):', error?.message);
      return;
    }
    await saveScenarioImage(promptId, await blobToDataUrl(data), ref.alt);
  } catch (err) {
    console.warn('[ScenarioImage] Download failed (non-fatal):', err);
  }
};
