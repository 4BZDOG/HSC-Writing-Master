/**
 * The shipped course catalogue: every course `public/courseData/manifest.json`
 * lists, read and sanitised exactly as the first-run picker reads it.
 *
 * The first-run picker is the only place discovery used to run, and a course
 * left unticked there is recorded as offered (`STORAGE_KEYS.OFFERED_SHIPPED`)
 * so the version sync never adds it later. That left a returning library with
 * no way back to it. The course library (`components/CourseLibraryModal.tsx`)
 * lists what this module reads, less what the library already holds, at any
 * time.
 */

import type { Course } from '../types';
import { analyzeAndSanitizeImportData } from './dataManagerUtils';
import { detectSubjectArea } from './subjectAreas';
import { isSameCourseName } from './courseNames';
import { stampShipped } from './shippedCourseStamp';

export interface ManifestDocEntry {
  file: string;
  type?: 'course' | 'topic';
  selected?: boolean;
  subject?: string;
  name?: string;
  targetCourseId?: string;
  targetCourseName?: string;
}

export const parseManifestEntries = (manifest: {
  files?: Array<string | ManifestDocEntry>;
  entries?: Array<string | ManifestDocEntry>;
}): ManifestDocEntry[] => {
  const rawEntries = manifest.entries || manifest.files || [];
  return rawEntries
    .map((entry) => (typeof entry === 'string' ? { file: entry } : entry))
    .filter((entry): entry is ManifestDocEntry => Boolean(entry?.file));
};

/** One shipped course, as the catalogue offers it. */
export interface ShippedCourseOffer {
  /** The course's own id. */
  id: string;
  /** The manifest's name for it, else the course's. */
  name: string;
  /** The faculty the manifest files it under, else the course's, else a guess from its name. */
  subject: string;
  /** The file it was read from. */
  source: string;
  /** The course, sanitised and not yet stamped. */
  course: Course;
}

/** BASE_URL-relative, so the catalogue still loads under a sub-path (GitHub Pages /<repo>/). */
const courseDataBase = (): string => `${import.meta.env.BASE_URL}courseData`;

/**
 * Every course the manifest lists, in manifest order, one entry per course id
 * (the first file to carry an id wins). Topic entries are left out: a topic is
 * not a course to add.
 *
 * Throws when the manifest cannot be read. A course file that cannot be read
 * throws too when `strict` is set (the version sync must not mistake a failed
 * download for a course that is gone); otherwise it is skipped, so the course
 * library still lists everything else.
 */
export const fetchShippedCatalogue = async ({
  strict,
}: {
  strict: boolean;
}): Promise<ShippedCourseOffer[]> => {
  const base = courseDataBase();
  const manifestRes = await fetch(`${base}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`manifest.json: HTTP ${manifestRes.status}`);
  const entries = parseManifestEntries(await manifestRes.json()).filter(
    (entry) => entry.type !== 'topic'
  );
  const perFile = await Promise.all(
    entries.map(async (entry): Promise<ShippedCourseOffer[]> => {
      try {
        const res = await fetch(`${base}/${entry.file}`);
        if (!res.ok) throw new Error(`${entry.file}: HTTP ${res.status}`);
        const analysis = analyzeAndSanitizeImportData(await res.json());
        if (analysis.type !== 'courses' || !analysis.data) return [];
        return (analysis.data as Course[]).map((course) => ({
          id: course.id,
          name: entry.name || course.name,
          subject: entry.subject || course.subject || detectSubjectArea(course.name),
          source: entry.file,
          course,
        }));
      } catch (err) {
        if (strict) throw err;
        console.warn(`[Course library] Skipping ${entry.file}:`, err);
        return [];
      }
    })
  );
  const seen = new Set<string>();
  const offers: ShippedCourseOffer[] = [];
  for (const offer of perFile.flat()) {
    if (seen.has(offer.id)) continue;
    seen.add(offer.id);
    offers.push(offer);
  }
  return offers;
};

/**
 * Whether the library already holds this shipped course: the same id, or the
 * same name (a copy saved before the "HSC " prefix was dropped, or one imported
 * from a file with fresh ids, is still that course).
 */
const isInLibrary = (offer: ShippedCourseOffer, library: readonly Course[]): boolean =>
  library.some(
    (course) =>
      course.id === offer.id ||
      isSameCourseName(course.name, offer.course.name) ||
      isSameCourseName(course.name, offer.name)
  );

/** The shipped courses the library does not hold yet, in catalogue order. */
export const missingFromLibrary = (
  catalogue: readonly ShippedCourseOffer[],
  library: readonly Course[]
): ShippedCourseOffer[] => catalogue.filter((offer) => !isInLibrary(offer, library));

/**
 * `library` with the chosen shipped courses added, each stamped as the first-run
 * picker stamps it and filed under its catalogue faculty. A course the library
 * already holds (or that appears twice in `offers`) is not added again, so a
 * second click, or a sync that got there first, never makes a duplicate.
 * The input array is not mutated.
 */
export const addShippedToLibrary = (
  library: readonly Course[],
  offers: readonly ShippedCourseOffer[]
): { courses: Course[]; added: ShippedCourseOffer[] } => {
  const courses = [...library];
  const added: ShippedCourseOffer[] = [];
  for (const offer of offers) {
    if (isInLibrary(offer, courses)) continue;
    courses.push({ ...stampShipped(offer.course), subject: offer.subject });
    added.push(offer);
  }
  return { courses, added };
};

/** Re-exported for the callers that already read it from here. */
export { countQuestions } from './courseAvailability';
