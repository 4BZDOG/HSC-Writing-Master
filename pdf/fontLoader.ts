// pdf/fontLoader.ts
//
// Lazy engine + font loading. Nothing here runs on page load — jsPDF is a
// code-split chunk that is only imported the first time an export is
// requested, then cached. Bundling it (instead of a runtime CDN <script>)
// keeps the export working offline and on networks that block CDNs.
//
//  - loadJsPdf():   dynamic-import the bundled jsPDF module and resolve its
//                   constructor, or reject with a clear error.
//  - loadInterFont(): fetch a TTF/OTF (10s AbortController timeout), validate
//                   the sfnt magic number, base64-encode in <=8190-byte chunks,
//                   register normal+bold weights. Never throws fatally — returns
//                   false so the caller can fall back to helvetica.

import { JsPdfLike } from './types';

// ---------------------------------------------------------------------------
// jsPDF engine
// ---------------------------------------------------------------------------

export type JsPdfConstructor = new (opts: {
  unit: string;
  format: string | number[];
  orientation: string;
  compress?: boolean;
}) => JsPdfLike;

let cachedCtor: JsPdfConstructor | null = null;
let inflight: Promise<JsPdfConstructor> | null = null;

/** Lazily import (and cache) the bundled jsPDF constructor. */
export const loadJsPdf = (): Promise<JsPdfConstructor> => {
  if (cachedCtor) return Promise.resolve(cachedCtor);
  if (inflight) return inflight;

  inflight = import('jspdf')
    .then((mod) => {
      const ctor = mod.jsPDF as unknown as JsPdfConstructor | undefined;
      if (!ctor) {
        throw new Error('PDF engine loaded but the jsPDF constructor was not found.');
      }
      cachedCtor = ctor;
      return ctor;
    })
    .catch((err) => {
      // Allow a retry on the next export attempt (e.g. transient chunk-load
      // failure right after a redeploy).
      inflight = null;
      if (err instanceof Error && err.message.includes('constructor')) throw err;
      throw new Error('Failed to load the PDF engine. Please try the export again.');
    });

  return inflight;
};

// ---------------------------------------------------------------------------
// Custom font (Inter)
// ---------------------------------------------------------------------------

export const FONT_FAMILY = 'Inter';
export const FONT_TIMEOUT_MS = 10_000;

export interface FontSource {
  family: string;
  url: string;
  style: 'normal' | 'bold';
  vfsName: string;
}

// rsms/inter publishes static TTFs under extras/ttf on the CDN.
export const DEFAULT_FONT_SOURCES: FontSource[] = [
  {
    family: FONT_FAMILY,
    style: 'normal',
    vfsName: 'Inter-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/extras/ttf/Inter-Regular.ttf',
  },
  {
    family: FONT_FAMILY,
    style: 'bold',
    vfsName: 'Inter-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/extras/ttf/Inter-Bold.ttf',
  },
];

/** In-memory cache of base64-encoded font bytes, keyed by URL. */
const fontBase64Cache = new Map<string, string>();

/**
 * Validate the sfnt magic number (first 4 bytes) of a candidate font file.
 *   0x00010000 — TrueType outlines
 *   0x4F54544F — 'OTTO' (CFF/OpenType outlines)
 *   0x74727565 — 'true' (legacy TrueType)
 */
export const hasValidFontSignature = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) return false;
  const magic = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return magic === 0x00010000 || magic === 0x4f54544f || magic === 0x74727565;
};

/** Base64-encode bytes in <=8190-byte chunks to avoid call-stack blowups. */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 8190;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node fallback (used in tests).
  return Buffer.from(binary, 'binary').toString('base64');
};

const fetchFontBytes = async (url: string): Promise<Uint8Array> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FONT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`Font request failed (${res.status}).`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Register the custom font (normal + bold) on `doc`. Returns true on success.
 * Any failure (network, timeout, bad signature) is swallowed and reported via
 * the returned boolean so the export can fall back to helvetica — a font
 * failure must never abort the export.
 */
export const loadInterFont = async (
  doc: JsPdfLike,
  sources: FontSource[] = DEFAULT_FONT_SOURCES
): Promise<boolean> => {
  try {
    for (const src of sources) {
      let base64 = fontBase64Cache.get(src.url);
      if (!base64) {
        const bytes = await fetchFontBytes(src.url);
        if (!hasValidFontSignature(bytes)) {
          throw new Error(`Invalid font signature for ${src.vfsName}.`);
        }
        base64 = bytesToBase64(bytes);
        fontBase64Cache.set(src.url, base64);
      }
      doc.addFileToVFS(src.vfsName, base64);
      doc.addFont(src.vfsName, src.family, src.style);
    }
    return true;
  } catch {
    return false;
  }
};

/** Test/maintenance hook: clear cached engine + fonts. */
export const __resetFontLoader = (): void => {
  cachedCtor = null;
  inflight = null;
  fontBase64Cache.clear();
};
