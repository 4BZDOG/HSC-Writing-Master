/**
 * Faculty (subject area) — the one definition of how a course is grouped.
 *
 * A school organises its courses into faculties, and so does this app: the
 * manifest importer groups the files it discovers by subject, and the audit
 * studio groups the library the same way so a head teacher can work a whole
 * faculty in one pass. Both used to carry their own copy — the name list and
 * the icons in `ManifestImportModal`, the name-sniffing resolver privately
 * inside `useSyllabusData` — so a course could be filed under Science by one
 * and Other by the other.
 *
 * Bundle-safety: every colour value below is a plain string literal. Do NOT
 * derive a class name from an imported constant at module scope and do NOT
 * build one with a template literal — Tailwind only sees complete literal
 * class names when it scans this file. (Same rule as `utils/levelColors.ts`.)
 */

import type React from 'react';
import { Activity, Beaker, BookOpen, Calculator, Cpu, Globe, Layers, Palette } from 'lucide-react';

/** The faculties a course can be filed under. `Other` is the catch-all. */
export type SubjectArea =
  | 'Science'
  | 'TAS'
  | 'HSIE'
  | 'English'
  | 'Mathematics'
  | 'Creative Arts'
  | 'PDHPE'
  | 'Other';

/**
 * Canonical order, used wherever faculties are listed. `Other` is last because
 * it is the bucket for everything unrecognised, not a faculty a school has.
 */
export const SUBJECT_AREAS: SubjectArea[] = [
  'Science',
  'TAS',
  'HSIE',
  'English',
  'Mathematics',
  'Creative Arts',
  'PDHPE',
  'Other',
];

/**
 * What a faculty is called when it needs a full name rather than the staffroom
 * abbreviation. The short form is what a teacher says, so the short form is
 * what shows on screen; the long form is the tooltip.
 */
export const SUBJECT_AREA_FULL_NAME: Record<SubjectArea, string> = {
  Science: 'Science',
  TAS: 'Technological and Applied Studies',
  HSIE: 'Human Society and its Environment',
  English: 'English',
  Mathematics: 'Mathematics',
  'Creative Arts': 'Creative Arts',
  PDHPE: 'Personal Development, Health and Physical Education',
  Other: 'Unfiled',
};

export const SUBJECT_AREA_ICON: Record<SubjectArea, React.ElementType> = {
  Science: Beaker,
  TAS: Cpu,
  HSIE: Globe,
  English: BookOpen,
  Mathematics: Calculator,
  'Creative Arts': Palette,
  PDHPE: Activity,
  Other: Layers,
};

/** The full tile treatment — text, fill and border, both themes. */
export const SUBJECT_AREA_TILE: Record<SubjectArea, string> = {
  Science:
    'text-emerald-400 light:text-emerald-700 bg-emerald-500/10 light:bg-emerald-100 border-emerald-500/20 light:border-emerald-200',
  TAS: 'text-blue-400 light:text-blue-700 bg-blue-500/10 light:bg-blue-100 border-blue-500/20 light:border-blue-200',
  HSIE: 'text-amber-400 light:text-amber-700 bg-amber-500/10 light:bg-amber-100 border-amber-500/20 light:border-amber-200',
  English:
    'text-purple-400 light:text-purple-700 bg-purple-500/10 light:bg-purple-100 border-purple-500/20 light:border-purple-200',
  Mathematics:
    'text-sky-400 light:text-sky-700 bg-sky-500/10 light:bg-sky-100 border-sky-500/20 light:border-sky-200',
  'Creative Arts':
    'text-pink-400 light:text-pink-700 bg-pink-500/10 light:bg-pink-100 border-pink-500/20 light:border-pink-200',
  PDHPE:
    'text-red-400 light:text-red-700 bg-red-500/10 light:bg-red-100 border-red-500/20 light:border-red-200',
  Other:
    'text-slate-400 light:text-slate-600 bg-slate-500/10 light:bg-slate-100 border-slate-500/20 light:border-slate-200',
};

/** Just the glyph tint, for a coloured icon on an untinted row. */
export const SUBJECT_AREA_ICON_TINT: Record<SubjectArea, string> = {
  Science: 'text-emerald-400 light:text-emerald-700',
  TAS: 'text-blue-400 light:text-blue-700',
  HSIE: 'text-amber-400 light:text-amber-700',
  English: 'text-purple-400 light:text-purple-700',
  Mathematics: 'text-sky-400 light:text-sky-700',
  'Creative Arts': 'text-pink-400 light:text-pink-700',
  PDHPE: 'text-red-400 light:text-red-700',
  Other: 'text-slate-400 light:text-slate-500',
};

/** A 2px rule under a faculty band, in that faculty's hue. */
export const SUBJECT_AREA_RULE: Record<SubjectArea, string> = {
  Science: 'bg-emerald-500/40',
  TAS: 'bg-blue-500/40',
  HSIE: 'bg-amber-500/40',
  English: 'bg-purple-500/40',
  Mathematics: 'bg-sky-500/40',
  'Creative Arts': 'bg-pink-500/40',
  PDHPE: 'bg-red-500/40',
  Other: 'bg-slate-500/40',
};

const isSubjectArea = (value: string): value is SubjectArea =>
  (SUBJECT_AREAS as string[]).includes(value);

/**
 * Guess a faculty from a course or topic name.
 *
 * The shipped course JSON files carry no `subject` of their own — it is
 * attached at import time from the manifest — so a library assembled any other
 * way (a hand-rolled export, a course created in the app, an older backup)
 * would otherwise land entirely in `Other`. Sniffing the name is a guess, but
 * "HSC Biology" under Science is a better guess than no guess at all, and
 * `subjectAreaOf` below prefers a recorded subject wherever there is one.
 */
export const detectSubjectArea = (name: string): SubjectArea => {
  const n = (name || '').toLowerCase();
  if (
    n.includes('software') ||
    n.includes('computing') ||
    n.includes('engineering') ||
    n.includes('design') ||
    n.includes('technology') ||
    n.includes('ipt') ||
    n.includes('sdd')
  )
    return 'TAS';
  if (
    n.includes('biology') ||
    n.includes('chemistry') ||
    n.includes('physics') ||
    n.includes('science') ||
    n.includes('earth') ||
    n.includes('investigating')
  )
    return 'Science';
  if (n.includes('english') || n.includes('literature')) return 'English';
  if (n.includes('math') || n.includes('numeracy')) return 'Mathematics';
  if (
    n.includes('history') ||
    n.includes('business') ||
    n.includes('legal') ||
    n.includes('geography') ||
    n.includes('society') ||
    n.includes('economics') ||
    n.includes('studies of religion')
  )
    return 'HSIE';
  if (n.includes('music') || n.includes('art') || n.includes('drama') || n.includes('visual'))
    return 'Creative Arts';
  if (n.includes('pdhpe') || n.includes('health') || n.includes('sport') || n.includes('movement'))
    return 'PDHPE';
  return 'Other';
};

/**
 * The faculty a course belongs to: what it records, else what its name says.
 *
 * A recorded subject wins even when the name would say otherwise — a school
 * that files "Investigating Science" under TAS has made a decision, and the
 * sniffer must not overrule it. An unrecognised recorded value (a faculty this
 * app has no entry for) falls back to the name rather than to `Other`, so a
 * typo in one course's metadata does not strand it away from its subject.
 */
export const subjectAreaOf = (course: { name: string; subject?: string }): SubjectArea => {
  const recorded = (course.subject || '').trim();
  if (recorded && isSubjectArea(recorded)) return recorded;
  return detectSubjectArea(course.name);
};
