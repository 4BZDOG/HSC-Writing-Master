import { useEffect, useState } from 'react';
import { ScenarioImageRef } from '../types';
import { loadScenarioImage } from '../utils/scenarioImageStorage';
import { syncScenarioImageDown } from '../services/scenarioImageSyncService';

/** The URL of an image shipped under `public/`, resolved against the app's base URL. */
export const shippedImageUrl = (src: string): string =>
  `${import.meta.env.BASE_URL}${src.replace(/^\/+/, '')}`;

/**
 * The URL to draw a scenario image from, and whether it is still loading.
 *
 * A shipped image (`src`) is a file the app serves, so it needs no lookup. An
 * uploaded one is read from IndexedDB, and fetched from Supabase Storage first
 * when this browser has not cached it yet (a prompt someone else contributed,
 * on a fresh device). Fails soft: `url` is null when there is nothing to show.
 */
export const useScenarioImage = (
  ref: ScenarioImageRef | undefined
): { url: string | null; loading: boolean } => {
  const shipped = ref?.src ? shippedImageUrl(ref.src) : null;
  const [stored, setStored] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!ref && !shipped);

  useEffect(() => {
    if (!ref || shipped) {
      setStored(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let row = await loadScenarioImage(ref.id);
      if (!row && ref.storagePath) {
        await syncScenarioImageDown(ref.id, ref);
        row = await loadScenarioImage(ref.id);
      }
      if (cancelled) return;
      setStored(row?.dataUrl ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.id, ref?.updatedAt, ref?.storagePath, shipped]);

  return { url: shipped ?? stored, loading };
};
