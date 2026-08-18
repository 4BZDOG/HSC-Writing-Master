/**
 * Client-side image handling for the scenario carousel (see
 * `utils/scenarioImageStorage.ts` and `types.ts`'s `ScenarioImageRef`).
 *
 * A phone photo pasted or uploaded straight into IndexedDB (and, on the
 * LocalStorage fallback, into a budget of a few MB) can be several megabytes.
 * Everything here runs before the bytes are ever handed to storage: reject
 * anything that isn't an image, then downscale/re-encode through an
 * offscreen canvas so what actually gets stored is small.
 */

/** Longest edge, in pixels, an image is downscaled to before storage. */
export const SCENARIO_IMAGE_MAX_EDGE = 1200;

/** Re-encode quality for the downscaled JPEG. */
export const SCENARIO_IMAGE_QUALITY = 0.8;

/** True for any `image/*` MIME type — the paste/upload guard. */
export const isImageMimeType = (type: string): boolean => type.startsWith('image/');

/** Reads a File/Blob into a base64 `data:` URL. */
export const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the image file.'));
    reader.readAsDataURL(file);
  });

/**
 * Downscales a `data:` URL so its longest edge is at most `maxEdge`, then
 * re-encodes as JPEG at `quality`. Images already smaller than `maxEdge` are
 * still re-encoded (cheap, and normalises odd source formats), but are never
 * scaled up.
 *
 * Falls back to the original data URL, un-resized, if a 2D canvas context
 * isn't available (e.g. a test/headless environment) rather than failing the
 * whole paste/upload for something that isn't the point of the guard.
 */
export const downscaleImageDataUrl = (
  dataUrl: string,
  maxEdge: number = SCENARIO_IMAGE_MAX_EDGE,
  quality: number = SCENARIO_IMAGE_QUALITY
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load the image for compression.'));
    img.src = dataUrl;
  });

/**
 * Full paste/upload pipeline for a scenario image: validates the MIME type,
 * reads the file, then downscales/compresses it. Throws with a
 * toast-friendly message on an unsupported file — callers should catch and
 * surface it via `useToast` rather than letting it propagate as a console
 * error.
 */
export const prepareScenarioImage = async (file: File): Promise<string> => {
  if (!isImageMimeType(file.type)) {
    throw new Error('That file is not an image — please paste or choose an image file.');
  }
  const rawDataUrl = await readFileAsDataUrl(file);
  return downscaleImageDataUrl(rawDataUrl);
};
