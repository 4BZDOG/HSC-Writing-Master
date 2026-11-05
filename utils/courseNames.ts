/**
 * Course names, without the "HSC " prefix.
 *
 * A course is named for its subject ("Biology", "Software Engineering"): this is
 * the HSC app already, and the Year 11 / Year 12 control sits beside the name.
 * Copies saved before that — a browser's library, a manifest or an export
 * written earlier — still say "HSC Biology", so anything that pairs courses by
 * name sets the prefix aside on both sides rather than comparing raw strings.
 */

const HSC_PREFIX = /^HSC\s+/i;

/** The name with a leading "HSC " removed: "HSC Biology" and "Biology" both give "Biology". */
export const withoutHscPrefix = (name: string): string =>
  (name ?? '').trim().replace(HSC_PREFIX, '').trim();

/**
 * Whether two course names name the same course, ignoring case and a leading
 * "HSC " on either side. A missing name matches only another missing name, as
 * the comparison it replaces did.
 */
export const isSameCourseName = (a: string | undefined, b: string | undefined): boolean =>
  withoutHscPrefix(a ?? '').toLowerCase() === withoutHscPrefix(b ?? '').toLowerCase();
