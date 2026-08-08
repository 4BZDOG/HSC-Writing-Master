import { PageSizeName } from '../pdf';

/**
 * How a teacher wants their reports exported, remembered between exports.
 *
 * The exporter has always supported page size, multiple copies and the
 * fill-in name/class/date fields; none of it was reachable from the UI, so
 * every report came out A4, single copy, whatever the school actually prints
 * on. Exposing the options is only half of it — a teacher printing a class set
 * sets them once and should not set them again for the next student, so the
 * choices persist.
 *
 * Deliberately in localStorage rather than the syllabus store: it is a
 * per-device printing preference, closer to "which printer" than to data worth
 * migrating or syncing.
 */
export interface PdfExportPreferences {
  pageSize: PageSizeName;
  /** Print the student's own response alongside the feedback. */
  includeResponse: boolean;
  /** Leave ruled space for handwritten comments. */
  markerNotes: boolean;
  /** Fill-in Name / Class / Date lines on the first page. */
  showFields: boolean;
  /** Class sets: how many copies of the report to place in the file. */
  copies: number;
}

export const DEFAULT_PDF_PREFERENCES: PdfExportPreferences = {
  pageSize: 'a4',
  includeResponse: true,
  markerNotes: false,
  showFields: true,
  copies: 1,
};

const STORAGE_KEY = 'hsc.pdfExportPreferences';

/** Copies beyond this are a misclick, not a class. */
export const MAX_COPIES = 40;

const clampCopies = (n: unknown): number => {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value)) return DEFAULT_PDF_PREFERENCES.copies;
  return Math.max(1, Math.min(MAX_COPIES, value));
};

/**
 * Read the stored preferences, field by field.
 *
 * Anything missing, mistyped or hand-edited falls back to its default rather
 * than failing the whole read — a corrupt preference must never be the reason
 * a teacher cannot export a report.
 */
export const readPdfPreferences = (): PdfExportPreferences => {
  if (typeof window === 'undefined') return { ...DEFAULT_PDF_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PDF_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<PdfExportPreferences>;
    return {
      pageSize: parsed.pageSize === 'letter' ? 'letter' : 'a4',
      includeResponse: parsed.includeResponse ?? DEFAULT_PDF_PREFERENCES.includeResponse,
      markerNotes: parsed.markerNotes ?? DEFAULT_PDF_PREFERENCES.markerNotes,
      showFields: parsed.showFields ?? DEFAULT_PDF_PREFERENCES.showFields,
      copies: clampCopies(parsed.copies ?? DEFAULT_PDF_PREFERENCES.copies),
    };
  } catch {
    return { ...DEFAULT_PDF_PREFERENCES };
  }
};

/** Persist preferences. Storage being unavailable is not worth an error. */
export const writePdfPreferences = (prefs: PdfExportPreferences): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...prefs, copies: clampCopies(prefs.copies) })
    );
  } catch {
    /* Private browsing, or a full quota. The export still works. */
  }
};
