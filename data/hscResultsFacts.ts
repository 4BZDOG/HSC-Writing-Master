/**
 * HSC results, as published by NESA and UAC, for the "HSC in numbers" notes
 * that rotate on the app's AI waits and for the "How 2025 HSC results fell"
 * chart on the reading waits (components/HscResultsCard.tsx).
 *
 * Every number here carries a year and a source, and every claim is about
 * ALL students' results, never one student's mark. When the next HSC results
 * are published: update the year, the band shares, the chart copy and the
 * facts together, then run tests/unit/hscResultsFacts.test.ts, which pins
 * that the six shares sum to 100 (within rounding) and that every fact has a
 * year and a source.
 *
 * Sources (2025 HSC):
 *  - NESA, performance band data 2025 — band shares by course, and the
 *    Band 6 share for individual courses:
 *    https://www.nsw.gov.au/education-and-training/nesa/hsc/facts-and-figures/performance-bands
 *  - NESA, 2025 HSC Facts and Figures, Table 3-1 — the statewide top-band share,
 *    which includes Extension courses (Band 6 or E4).
 *  - UAC, 2025 ATAR release — ATAR distribution and the cohort size:
 *    https://uac.edu.au/media-releases/2025-atars-released-today
 *  - UAC, 2025 — the median HSC mark for most 2-unit courses falls in Band 4.
 *  - HSC band cut-offs on the 0–100 mark (non-Extension courses) are those in
 *    the NESA performance band data above.
 *
 * Pooling: the six band shares are our own arithmetic, not a NESA figure. They
 * pool the 81 non-Extension courses in NESA's 2025 band data, each course
 * weighted by its completers (339,742 results in all). Shares of results are
 * not comparable between courses, and they are not a histogram of marks.
 */

export type HscBand = 1 | 2 | 3 | 4 | 5 | 6;

export const HSC_RESULTS_YEAR = 2025;

const NESA_PERFORMANCE_BANDS_URL =
  'https://www.nsw.gov.au/education-and-training/nesa/hsc/facts-and-figures/performance-bands';

const NESA_FACTS_FIGURES_URL =
  'https://www.nsw.gov.au/sites/default/files/noindex/2026-06/nesa-hsc-facts-and-figures-2025.pdf';

const UAC_SCALING_REPORT_URL =
  'https://uac.edu.au/assets/documents/scaling-reports/scaling-report-2025-nsw-hsc.pdf';

const UAC_ATAR_RELEASE_URL = 'https://uac.edu.au/media-releases/2025-atars-released-today';

export interface HscSource {
  label: string;
  url?: string;
}

export interface HscBandShare {
  band: HscBand;
  /** Percentage of pooled results, one decimal place. */
  share: number;
}

export interface HscFact {
  id: string;
  year: number;
  /** One or two plain sentences, in the voice of the wait notes. */
  text: string;
  sources: readonly HscSource[];
  /** What the number does not say, so it is not read further than it goes. */
  caveat?: string;
}

/**
 * The pooled band shares, Band 1 to Band 6, as percentages of all 2025 course
 * results in the 81 non-Extension courses. They sum to 100.0.
 */
export const HSC_BAND_SHARES: readonly HscBandShare[] = [
  { band: 1, share: 1.8 },
  { band: 2, share: 7.2 },
  { band: 3, share: 18.9 },
  { band: 4, share: 33.4 },
  { band: 5, share: 28.3 },
  { band: 6, share: 10.4 },
];

/** The copy and sources the results chart carries. Read it inside a component, never at module scope. */
export const HSC_RESULTS_CHART = {
  year: HSC_RESULTS_YEAR,
  caption:
    'Every student’s results, pooled across 81 courses. It is not anyone’s mark, and it does not predict one.',
  sources: [{ label: 'NESA, 2025 performance band data', url: NESA_PERFORMANCE_BANDS_URL }],
  pooling: 'Pooled by us, weighted by completers.',
} as const;

export const HSC_RESULTS_FACTS: readonly HscFact[] = [
  {
    id: 'band6-about-one-in-ten',
    year: 2025,
    text: 'Pooled across courses, about 1 in 10 results in the 2025 HSC was a Band 6, a mark of 90 or more. Band 4 was the most common band.',
    sources: [{ label: 'NESA, performance band data 2025', url: NESA_PERFORMANCE_BANDS_URL }],
    caveat:
      'Pooled across the 81 non-Extension courses by us, weighted by completers. Band shares are not comparable between courses.',
  },
  {
    id: 'bands-3-to-5',
    year: 2025,
    text: 'Pooled across courses, Bands 3 to 5 made up about four in five results in 2025. Band 1 was the rarest, at under 2%.',
    sources: [{ label: 'NESA, performance band data 2025', url: NESA_PERFORMANCE_BANDS_URL }],
    caveat: 'Pooled by us across the 81 non-Extension courses, weighted by completers.',
  },
  {
    id: 'statewide-top-band',
    year: 2025,
    text: 'Counting Extension courses too, 12% of 2025 HSC results across the state were in the top band, Band 6 or E4.',
    sources: [
      { label: 'NESA, 2025 HSC Facts and Figures, Table 3-1', url: NESA_FACTS_FIGURES_URL },
    ],
    caveat:
      'Includes Extension courses, so it is not the same base as the pooled Band 6 share (10.4%), which excludes them.',
  },
  {
    id: 'band6-varies-by-course',
    year: 2025,
    text: 'The share of Band 6 depends on the course: under 0.5% in English Standard, and 40% in Music 2. Results cannot be compared across courses.',
    sources: [
      { label: 'NESA, performance band data 2025', url: NESA_PERFORMANCE_BANDS_URL },
      { label: 'NESA, 2025 HSC Facts and Figures', url: NESA_FACTS_FIGURES_URL },
    ],
    caveat:
      'NESA does not compare results across courses, and no course has a pre-defined distribution.',
  },
  {
    id: 'band-cutoffs',
    year: 2025,
    text: 'In non-Extension courses, Band 1 covers marks 0 to 49, half the scale. So band shares do not show how marks are spread.',
    sources: [{ label: 'NESA, performance band data 2025', url: NESA_PERFORMANCE_BANDS_URL }],
    caveat:
      'Band cut-offs for non-Extension courses: Band 6 90–100, Band 5 80–89, Band 4 70–79, Band 3 60–69, Band 2 50–59, Band 1 0–49.',
  },
  {
    id: 'atar-is-a-rank',
    year: 2025,
    text: 'An ATAR is a rank, not a mark, so an ATAR of 90 is not a Band 6. In 2025 about 1 in 6 ATAR-eligible students (17.3%) had an ATAR of 90 or above.',
    sources: [{ label: 'UAC, 2025 ATAR release', url: UAC_ATAR_RELEASE_URL }],
    caveat:
      'Of 60,432 ATAR-eligible students in 2025. About 1 in 10 course results was a Band 6, so the two figures measure different things.',
  },
  {
    id: 'median-mark-band-4',
    year: 2025,
    text: 'For most 2-unit courses, the median HSC mark in 2025 fell in Band 4, which is 70 to 79.',
    sources: [
      { label: 'UAC, 2025 report on the scaling of the NSW HSC', url: UAC_SCALING_REPORT_URL },
    ],
  },
];
