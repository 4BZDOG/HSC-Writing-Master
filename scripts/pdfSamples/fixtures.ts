// scripts/pdfSamples/fixtures.ts
//
// Realistic marking-feedback payloads for the PDF sample generator. Content is
// drawn from the HSC Enterprise Computing syllabus data shipped with the app so
// the samples exercise the same prose shapes a real export sees: syllabus
// keywords, **bold** marker emphasis, multi-paragraph responses, and rewrites
// that differ from the original by a lot rather than a little.
//
// Three fixtures on purpose — the exporter's layout behaviour is different at
// each length, and a review that only looks at the middle case misses both the
// under-full page and the overflowing one.

import type { EvaluationExportData } from '../../pdf/buildBlocks';
import { getBandForMark, getCommandTermInfo, getNextLevelTarget } from '../../data/commandTerms';
import type { PromptVerb } from '../../types';

import {
  ALL_REPORT_SECTIONS,
  type ProgressReport,
  type ReportAttemptRow,
  type ReportBreakdownRow,
  type ReportStat,
  type ReportClassRow,
  type ReportStudentRow,
  type ReportTierRow,
  type ReportTrendPoint,
} from '../../pdf/reportModel';
import { formatShortDate } from '../../pdf/reportFormat';
import type { ProgressReportPayload } from '../../services/responseService';
import {
  buildSchoolReport,
  buildStudentReport,
  buildTeacherReport,
} from '../../utils/progressReport';
import type { OwnAttempt } from '../../utils/profileHistory';
import type { ReportCourseFilter, ReportOptions } from '../../utils/progressReport';

/**
 * The bands the app gives a marking, computed with the functions it calls rather
 * than typed in. A hand-typed band drifts from what a real export shows: these
 * samples once printed "Band 4" for an EXPLAIN, which tops out at Band 3, and an
 * improved response one band BELOW the response it improves.
 *
 * `overallBand` is what `geminiService` derives; `targetBand` is the question's
 * ceiling (`useFeedbackView`); `exemplarMark` and `exemplarBand` are the rewrite's
 * target, from `getNextLevelTarget`, which is also what the marker was briefed with.
 */
const bandsFor = (verb: PromptVerb, overallMark: number, totalMarks: number) => {
  const tier = getCommandTermInfo(verb).tier;
  const next = getNextLevelTarget(overallMark, totalMarks, tier);
  return {
    overallBand: getBandForMark(overallMark, totalMarks, tier),
    targetBand: getBandForMark(totalMarks, totalMarks, tier),
    exemplarMark: next.targetMark,
    exemplarBand: next.targetBand,
  };
};

/** The common case: a 6-mark EXPLAIN at Band 2 (tier 3 tops out at 3), response + rewrite + notes. */
export const typicalBand2: EvaluationExportData = {
  question:
    'Explain how a well-designed data visualisation can be more effective at highlighting significant results than a raw table of data.',
  verb: 'EXPLAIN',
  totalMarks: 6,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data visualisation  ›  Using data to tell a story  ›  Explain the purposes of data visualisation',
  studentAnswer:
    'A data visualisation is better than a table because it is easier to look at. When you have thousands of numbers in a table it is really hard to see what is going on, but a graph shows you straight away. For example if sea levels are rising you can see the line going up on a line chart which is much clearer than reading the numbers.\n\nVisualisations also use colour which helps. If you make the important part red then people will look at that first. Tables are all the same colour so nothing stands out. This means the audience can understand the data quicker and the person presenting can tell a story with the data instead of just showing numbers.',
  overallMark: 4,
  ...bandsFor('EXPLAIN', 4, 6),
  overallFeedback:
    'A **sound** response that identifies the two central ideas — visual encoding draws attention, and a chart is processed faster than a table. Where it falls short of the higher bands is precision: the answer asserts that a graph is "easier to look at" without explaining *why* pre-attentive visual processing makes that true. The sea-level example is well chosen but under-developed; it names the visual (a rising line) without connecting it to the significance of the result. Use the syllabus terminology — **highlighting results**, **simplifying understanding**, **storytelling** — as the scaffolding of each paragraph rather than as words dropped in at the end.',
  quickTip:
    'Every EXPLAIN sentence should answer "why does that matter?" — if a sentence stops at *what* the visualisation does, add a clause saying what the audience can now do that they could not before.',
  strengths: [
    'Correctly identifies **visual contrast** (colour) as a mechanism for drawing attention to significant results.',
    'The rising sea-level line is a well-chosen, syllabus-relevant example rather than a generic one.',
    'Recognises that a table forces the reader to do the work of finding the pattern themselves.',
  ],
  improvements: [
    'Name the mechanism: the human visual system processes **position, length and colour** pre-attentively, which is why a trend is grasped in a glance and a column of numbers is not.',
    'Connect the example to significance — the line does not merely rise, it rises *sharply after 1990*, and that is the result the policymaker needs.',
    'Use **storytelling** explicitly: the designer chooses what to foreground, which a raw table cannot do.',
    'Avoid conversational register ("really hard", "look at that first") — HSC marking rewards precise, impersonal prose.',
  ],
  criteria: [
    {
      criterion: 'Explains visual encoding as a means of highlighting significant results',
      mark: 2,
      maxMark: 2,
      feedback:
        'Both colour and the rising line are correctly offered as devices that direct attention. Full marks.',
    },
    {
      criterion: 'Explains why visual processing outpaces reading a table',
      mark: 1,
      maxMark: 2,
      feedback:
        'The claim is made ("shows you straight away") but not explained. The marker needs the *reason* — pre-attentive processing of visual channels — not the observation.',
    },
    {
      criterion: 'Uses syllabus terminology accurately',
      mark: 1,
      maxMark: 2,
      feedback:
        'Only **storytelling** appears, and only in the final sentence. **Simplifying understanding** and **highlighting results** are absent as terms even though the ideas are present.',
    },
  ],
  revisedAnswer:
    'A data visualisation is better than a table because it encodes values in position and colour, which the eye processes before conscious reading begins. When you have thousands of numbers in a table it is hard to see what is going on, but a graph shows you the trend straight away. For example if sea levels are rising, the line on a line chart climbs sharply after 1990, which is much clearer than reading the numbers.\n\nVisualisations also use colour to direct attention, which is the basis of highlighting results. If the important part is drawn in red then people will see it first. Tables are uniform, so no figure stands out from the rest. This is simplifying understanding: the audience grasps the data more quickly, and the presenter can tell a story with it instead of just showing numbers.',
  keyChanges: [
    'Gave the mechanism behind the claim: position and colour are processed before conscious reading begins, which is why a chart is faster than a table.',
    'Tied the sea-level example to significance: the line climbs sharply after 1990, the result a reader needs to see.',
    'Named simplifying understanding and highlighting results, ideas the response already had but never called by their syllabus terms.',
  ],
  wordCount: 138,
  keywordsUsed: 2,
  keywordsTotal: 4,
  markerNotes: true,
  keywords: [
    'data visualisation',
    'storytelling',
    'simplifying understanding',
    'highlighting results',
  ],
};

/** The short case: a 2-mark IDENTIFY, no rewrite. Exposes under-filled pages. */
export const shortBand1: EvaluationExportData = {
  question: 'Identify two main purposes of data visualisation.',
  verb: 'IDENTIFY',
  totalMarks: 2,
  syllabusPath: 'HSC Enterprise Computing  ›  Data visualisation  ›  Using data to tell a story',
  studentAnswer: 'To make data easier to understand and to make it look good in a presentation.',
  overallMark: 1,
  ...bandsFor('IDENTIFY', 1, 2),
  overallFeedback:
    'One correct purpose. **Simplifying understanding** is right and is expressed clearly. The second half — "make it look good" — is aesthetic, not a purpose of **data visualisation** in the syllabus sense, so it earns nothing.',
  quickTip:
    'For IDENTIFY, name the thing in syllabus language. No explanation is needed, but the words must be the right ones.',
  strengths: ['Correctly identifies **simplifying understanding** as a purpose.'],
  improvements: [
    'Replace "look good" with a syllabus purpose: **storytelling**, or **highlighting significant results**.',
  ],
  criteria: [
    {
      criterion: 'Identifies one correct purpose',
      mark: 1,
      maxMark: 1,
      feedback: 'Simplifying complex data — correct.',
    },
    {
      criterion: 'Identifies a second correct purpose',
      mark: 0,
      maxMark: 1,
      feedback: 'Aesthetic appeal is not a syllabus purpose.',
    },
  ],
  wordCount: 14,
  keywordsUsed: 0,
  keywordsTotal: 3,
  keywords: ['data visualisation', 'purpose', 'storytelling'],
};

const longAnswer = `Enterprise systems have changed the way businesses handle their data but there are big legal and ethical responsibilities that come with them. In this response I will evaluate how well current practices meet these responsibilities.

Firstly, the Privacy Act 1988 requires organisations to collect only the data they need and to tell people what it will be used for. Many enterprises do have privacy policies but studies show almost nobody reads them, which means consent is not really informed consent. This is a problem because the legal requirement is met on paper but the ethical purpose behind it is not met in practice.

Secondly there is the issue of data security. Enterprises store huge amounts of personal information and breaches happen regularly. The Notifiable Data Breaches scheme means companies have to tell people when their data is exposed, which is a good thing, but it is a reactive measure. It does not stop the breach happening in the first place. Better practice would be encryption at rest and minimising how much data is kept at all.

Thirdly, intelligent systems raise questions about bias. If an enterprise uses machine learning to screen job applications and the training data reflects past discrimination then the system will repeat that discrimination at scale. There is currently not much law covering this in Australia which is a gap.

Overall I think enterprises are meeting their legal responsibilities reasonably well because the penalties are clear, but their ethical responsibilities are only partly met because ethics is not enforced the same way. Regulation needs to catch up with intelligent systems especially.`;

/** The long case: an 8-mark EVALUATE essay. Exposes the multi-page flow. */
export const longBand4: EvaluationExportData = {
  question:
    'Evaluate the extent to which enterprises meet their legal and ethical responsibilities in the management of enterprise data.',
  verb: 'EVALUATE',
  totalMarks: 8,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data management  ›  Legal, social and ethical responsibilities  ›  Assess responsibilities associated with the use and management of enterprise data',
  studentAnswer: longAnswer,
  overallMark: 5,
  ...bandsFor('EVALUATE', 5, 8),
  overallFeedback:
    'A **well-organised** response with genuine evaluative intent. Three responsibilities are raised, each with a supporting mechanism, and the conclusion makes a judgement rather than a summary. What holds it at Band 4 is the depth of the criteria: the judgement rests on an implicit standard ("reasonably well") that is never stated, so a marker cannot see against what the extent is being measured. Name the criteria for a successful data-management regime up front, then measure practice against them.',
  quickTip:
    'EVALUATE means judgement *against stated criteria*. Write the criteria in your opening sentence and the rest of the response becomes a scaffold to fill.',
  strengths: [
    'Three distinct responsibilities — **privacy**, **security**, algorithmic **bias** — each supported by a named instrument or mechanism.',
    'Correctly distinguishes a reactive control (the Notifiable Data Breaches scheme) from a preventative one.',
    'The conclusion reaches an actual judgement and separates legal compliance from ethical practice.',
  ],
  improvements: [
    'State the evaluative criteria explicitly before the body — e.g. informed consent, proportionality of collection, and remediability of harm.',
    'Support the informed-consent claim with a specific figure or study rather than "studies show".',
    'Develop the **bias** paragraph: name a mitigation (audit, representative training data) so the judgement has a counterfactual.',
    'Replace the first-person framing ("In this response I will…") with a thesis sentence.',
  ],
  criteria: [
    {
      criterion: 'Makes a judgement supported by explicit criteria',
      mark: 1,
      maxMark: 2,
      feedback: 'A judgement is made, but the criteria behind "reasonably well" stay implicit.',
    },
    {
      criterion: 'Demonstrates knowledge of legal responsibilities',
      mark: 2,
      maxMark: 2,
      feedback:
        'The Privacy Act and the Notifiable Data Breaches scheme are correctly and specifically applied.',
    },
    {
      criterion: 'Demonstrates knowledge of ethical responsibilities',
      mark: 1,
      maxMark: 2,
      feedback: 'Bias is raised but not developed into an ethical obligation with a remedy.',
    },
    {
      criterion: 'Sustains a coherent, well-structured argument',
      mark: 1,
      maxMark: 2,
      feedback: 'Signposting is clear but mechanical; the paragraphs list rather than build.',
    },
  ],
  revisedAnswer:
    'Enterprise systems have changed the way businesses handle their data but there are big legal and ethical responsibilities that come with them. Judged against three criteria, whether consent is informed, whether collection is proportionate and whether harm can be remedied, enterprises meet their legal responsibilities reasonably well but their ethical responsibilities only partly.\n\nOn informed consent, the Privacy Act 1988 requires organisations to collect only the data they need and to tell people what it will be used for. Many enterprises do have privacy policies, but a policy that almost nobody can reasonably be expected to finish does not produce informed consent, only its documentation. The legal requirement is met on paper but the ethical purpose behind it is not met in practice.\n\nOn proportionality, the question is whether enterprises keep only what they need. Enterprises store huge amounts of personal information and breaches happen regularly. The Notifiable Data Breaches scheme means companies have to tell people when their data is exposed, which is a good thing, but it is a reactive measure. It does not stop the breach happening in the first place. Better practice would be encryption at rest and deliberate data minimisation, which meets the criterion because it prevents the harm rather than reporting it.\n\nOn remediability, intelligent systems raise questions about bias. If an enterprise uses machine learning to screen job applications and the training data reflects past discrimination, then the system will repeat that discrimination at scale, invisibly and with no audit trail. No Australian statute presently requires algorithmic auditing, which is a gap: an affected applicant has no mechanism through which the harm can be identified or remedied.\n\nThe extent of compliance therefore tracks the extent of enforcement. Enterprises meet their legal responsibilities reasonably well because the penalties are clear, but their ethical responsibilities are only partly met because ethics is not enforced the same way. Regulation needs to catch up with intelligent systems especially.',
  keyChanges: [
    'Set out three criteria the judgement is measured against, so the extent of compliance has a standard to be judged by.',
    'Turned the informed-consent point into a judgement: a policy nobody can reasonably finish is documentation, not consent.',
    'Developed the bias paragraph into an ethical gap with a remedy, algorithmic auditing, which no Australian statute requires.',
    'Replaced the first-person opening with a thesis that makes the judgement the rest of the response tests.',
  ],
  wordCount: 322,
  keywordsUsed: 3,
  keywordsTotal: 6,
  markerNotes: true,
  keywords: ['enterprise data', 'privacy', 'security', 'intelligent systems', 'legal', 'ethical'],
};

/**
 * The edited case: a rewrite that changes the response IN PLACES rather than
 * reworking it wholesale, so "What changed" fills with sentence pairs.
 *
 * DESCRIBE tops out at Band 2 (see `bandsFor`), so a full-mark rewrite of this
 * answer stays in the response's own band. The heading says so, rather than
 * promising a band the verb cannot reach.
 *
 * A diff list that never has more than one row cannot show a pair being split
 * across a column boundary, which is the defect that lived there. Many pairs
 * on one page is what this sample is for.
 */
const editedAnswer = `Enterprise systems need good security because they hold a lot of personal data. The main control is passwords, which stop people getting in.

Encryption is also used. This scrambles the data so it cannot be read. Most enterprises encrypt data when it is being sent.

Access control is another control. It means only certain staff can see certain records. This limits the damage if an account is taken over.

Backups protect against data loss. If a system fails the enterprise can restore from a backup. Backups should be tested regularly.

Overall these controls work together to protect enterprise data.`;

const editedRevision = `Enterprise systems need good security because they hold a lot of personal data. The primary access control is multi-factor authentication, which requires something the user knows and something they hold, so a stolen password alone is not enough.

Encryption is also used. This renders data unreadable without the key. Most enterprises encrypt data both in transit and at rest, because data sitting in storage is the larger target.

Access control is another control. Role-based access means a staff member sees only the records their role requires. This limits the damage if an account is taken over.

Backups protect against data loss. If a system fails the enterprise can restore from a backup. Backups must be tested by restoring them, since an untested backup is an assumption rather than a control.

Together these controls form a layered security architecture, in which no single failure exposes the data.`;

export const editedBand2: EvaluationExportData = {
  question:
    'Describe the security controls an enterprise uses to protect the data it holds, and explain why each is necessary.',
  verb: 'DESCRIBE',
  totalMarks: 6,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data management  ›  Securing enterprise data  ›  Describe the controls used to protect enterprise data',
  studentAnswer: editedAnswer,
  overallMark: 4,
  ...bandsFor('DESCRIBE', 4, 6),
  overallFeedback:
    'Four controls, correctly named and correctly grouped — the structure of this response is **sound**. What keeps it short of full marks is that each control is described but not justified: the question asks why each is necessary, and "stop people getting in" is a restatement rather than a reason. Name the threat each control answers and the response reaches full marks without gaining a paragraph.',
  quickTip:
    'For each control, finish the sentence "…because without it, an attacker could ___". That clause is the explanation the question is asking for.',
  strengths: [
    'Four distinct controls, correctly named and not confused with one another.',
    'Correctly identifies that access control limits **damage** after a compromise rather than preventing one.',
    'The paragraph structure gives one control per paragraph, which a marker can follow.',
  ],
  improvements: [
    'Replace passwords with **multi-factor authentication** — passwords alone are the control the syllabus treats as insufficient.',
    'Say that encryption protects data **at rest** as well as in transit; storage is the larger target.',
    'Name the access model: **role-based access control**, not "certain staff".',
    'Close with the layered principle — that no single failure should expose the data.',
  ],
  criteria: [
    {
      criterion: 'Describes a range of security controls',
      mark: 2,
      maxMark: 2,
      feedback: 'Four controls, correctly named and distinguished. Full marks.',
    },
    {
      criterion: 'Explains why each control is necessary',
      mark: 1,
      maxMark: 2,
      feedback:
        'The reasons restate the control rather than naming the threat it answers. "Stops people getting in" is what a password is, not why one is needed.',
    },
    {
      criterion: 'Uses syllabus terminology accurately',
      mark: 1,
      maxMark: 2,
      feedback:
        '**Encryption** and **backups** are correct; **multi-factor authentication**, **role-based access control** and **security architecture** are all absent.',
    },
  ],
  revisedAnswer: editedRevision,
  keyChanges: [
    'Named multi-factor authentication where the response had only passwords, the control the syllabus treats as insufficient alone.',
    'Said encryption protects data at rest as well as in transit, because storage is the larger target.',
    'Named role-based access control in place of "certain staff", so the access model is precise.',
    'Closed on the layered principle, which ties the four controls into one architecture.',
  ],
  wordCount: 132,
  keywordsUsed: 2,
  keywordsTotal: 5,
  markerNotes: true,
  keywords: [
    'encryption',
    'access control',
    'multi-factor authentication',
    'security architecture',
    'backups',
  ],
};

export const SAMPLES: { name: string; subtitle: string; data: EvaluationExportData }[] = [
  {
    name: 'A-typical-band2',
    subtitle: 'HSC Enterprise Computing',
    data: typicalBand2,
  },
  {
    name: 'B-short-band1',
    subtitle: 'HSC Enterprise Computing',
    data: shortBand1,
  },
  {
    name: 'C-long-band4',
    subtitle: 'HSC Enterprise Computing',
    data: longBand4,
  },
  {
    name: 'D-edited-band2',
    subtitle: 'HSC Enterprise Computing',
    data: editedBand2,
  },
];

// ---------------------------------------------------------------------------
// Progress-report fixtures
// ---------------------------------------------------------------------------
//
// Every report is produced by the app's own builders (utils/progressReport.ts), fed by
// simulated answers from a seeded generator. The strings, the caps, the ordering and
// the anonymisation are therefore the ones a real export carries; only the answers
// are invented. Each sample says what it is for in its comment.

/** A small seeded generator (mulberry32), so the samples are the same every run. */
const seeded = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The six tiers, each with a verb the app tiers (see data/commandTerms). */
// Each a real command term in data/commandTerms.ts, at the tier named.
const TIER_VERBS = ['STATE', 'DESCRIBE', 'COMPARE', 'ANALYSE', 'ASSESS', 'EVALUATE'];

/** The catalogue the simulated answers are drawn from: courses, their topics. */
interface Catalogue {
  courses: { id: string; legacyId: string; name: string; topics: string[] }[];
}

const SAMPLE_CATALOGUE: Catalogue = {
  courses: [
    {
      id: 'course-enterprise',
      legacyId: 'hsc-enterprise-computing',
      name: 'Enterprise Computing',
      topics: [
        'Data visualisation',
        'Securing enterprise data',
        'Legal and ethical responsibilities',
      ],
    },
    {
      id: 'course-software',
      legacyId: 'hsc-software-engineering',
      name: 'Software Engineering',
      topics: ['Requirements', 'Software design', 'Testing and maintenance'],
    },
  ],
};

/** Long names on purpose: the stress sample checks that every one ellipsises inside its column. */
const STRESS_CATALOGUE: Catalogue = {
  courses: [
    {
      id: 'course-stress-a',
      legacyId: 'hsc-stress-a',
      name: 'Enterprise Computing and Emerging Technologies Extension Course',
      topics: [
        'Evaluating the legal, ethical and social responsibilities of enterprises in managing personal and organisational data',
        'Securing enterprise data',
      ],
    },
    {
      id: 'course-stress-b',
      legacyId: 'hsc-stress-b',
      name: 'Software Engineering',
      topics: ['Requirements', 'Testing and maintenance'],
    },
  ],
};

/** One simulated marked answer. `day` counts from the window's first day. */
interface SimAttempt {
  day: number;
  at: string;
  course: number;
  topic: number;
  tier: number;
  verb: string;
  band: number;
  share: number;
  mark: number;
  total: number;
  words: number;
  student: number;
}

const WINDOW_START = { y: 2026, m: 7, d: 14 };
const WINDOW_LAST_DAY = 88;
const TOTAL_MARKS = [4, 6, 8];
const generatedAt = new Date(2026, 9, 11, 9, 30).toISOString();

/** Simulate `count` answers for one student, improving from `skill` across the span. */
const simulateStudent = (
  rand: () => number,
  student: number,
  count: number,
  skill: number,
  spanDays: number,
  catalogue: Catalogue = SAMPLE_CATALOGUE
): SimAttempt[] => {
  const out: SimAttempt[] = [];
  let day = Math.floor(rand() * 4);
  for (let i = 0; i < count && day <= spanDays; i++) {
    const course = Math.floor(rand() * catalogue.courses.length);
    const topic = Math.floor(rand() * catalogue.courses[course].topics.length);
    // Lower tiers are attempted more often than the top one.
    const roll = rand();
    const tier =
      roll < 0.12 ? 1 : roll < 0.3 ? 2 : roll < 0.55 ? 3 : roll < 0.75 ? 4 : roll < 0.9 ? 5 : 6;
    const progress = day / Math.max(1, spanDays);
    const band = clamp(Math.round(skill + progress * 1.6 + (rand() - 0.5) * 2.2), 1, 6);
    const total = TOTAL_MARKS[Math.floor(rand() * TOTAL_MARKS.length)];
    const share = clamp(0.2 + 0.1 * band + (rand() - 0.5) * 0.16, 0, 1);
    const mark = Math.round(share * total);
    const d = new Date(WINDOW_START.y, WINDOW_START.m - 1, WINDOW_START.d + day, 12);
    out.push({
      day,
      at: d.toISOString(),
      course,
      topic,
      tier,
      verb: TIER_VERBS[tier - 1],
      band,
      share: mark / total,
      mark,
      total,
      words: 80 + Math.floor(rand() * 260),
      student,
    });
    day += 1 + Math.floor(rand() * 5);
  }
  return out;
};

const byDay = (rows: SimAttempt[]): SimAttempt[] => [...rows].sort((a, b) => a.day - b.day);

/** The app's own answer shape, from one simulated answer. */
const toOwnAttempt = (a: SimAttempt, catalogue: Catalogue): OwnAttempt => {
  const c = catalogue.courses[a.course];
  const course = { id: c.id, legacyId: c.legacyId, name: c.name };
  return {
    at: a.at,
    band: a.band,
    mark: a.mark,
    totalMarks: a.total,
    verb: a.verb,
    wordCount: a.words,
    course,
    topic: { name: c.topics[a.topic], course },
  };
};

const meanOf = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** The count-and-mean metrics every roster row carries. */
const metricsOf = (rows: SimAttempt[]) => ({
  attempts: rows.length,
  students: new Set(rows.map((r) => r.student)).size,
  avg_band: meanOf(rows.map((r) => r.band)),
  avg_mark_frac: meanOf(rows.map((r) => r.share)),
});

const groupRows = <K>(rows: SimAttempt[], key: (r: SimAttempt) => K): Map<K, SimAttempt[]> => {
  const out = new Map<K, SimAttempt[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
};

/** A student in a roster: the username the RPC keys on, and the display name it returns. */
interface StudentSpec {
  username: string;
  displayName: string;
}

/** One class: the students in it, by their index in the roster. */
interface ClassSpec {
  classId: string;
  name: string;
  year: number | null;
  members: number[];
}

/**
 * The `get_progress_report()` payload the app receives, built from the same answers.
 * Only the arrays the builders read are filled, in the shape the RPC returns.
 */
const rosterPayload = (
  rows: SimAttempt[],
  students: StudentSpec[],
  catalogue: Catalogue,
  classes?: ClassSpec[]
): ProgressReportPayload => {
  const days = 90;
  const weeks = 13;
  const first = byDay(rows)[0]?.at ?? null;
  const last = byDay(rows)[byDay(rows).length - 1]?.at ?? null;
  const byVerb = [...groupRows(rows, (r) => r.verb)].map(([label, items]) => ({
    label,
    ...metricsOf(items),
  }));
  const byCourse = [...groupRows(rows, (r) => r.course)].map(([idx, items]) => ({
    course_id: catalogue.courses[idx].legacyId,
    label: catalogue.courses[idx].name,
    ...metricsOf(items),
  }));
  const byTopic = [...groupRows(rows, (r) => `${r.course}-${r.topic}`)].map(([, items]) => {
    const c = catalogue.courses[items[0].course];
    return {
      topic_id: `${c.legacyId}:${items[0].topic}`,
      course_id: c.legacyId,
      course: c.name,
      label: c.topics[items[0].topic],
      ...metricsOf(items),
    };
  });
  const byStudent = students.map((s, i) => {
    const mine = byDay(rows.filter((r) => r.student === i));
    return {
      username: s.username,
      display_name: s.displayName,
      attempts: mine.length,
      avg_band: meanOf(mine.map((r) => r.band)),
      avg_mark_frac: meanOf(mine.map((r) => r.share)),
      last_active: mine.length ? mine[mine.length - 1].at : null,
    };
  });
  const byStudentVerb = students.flatMap((s, i) =>
    [
      ...groupRows(
        rows.filter((r) => r.student === i),
        (r) => r.verb
      ),
    ].map(([verb, items]) => ({
      username: s.username,
      verb,
      attempts: items.length,
      avg_band: meanOf(items.map((r) => r.band)),
      avg_mark_frac: meanOf(items.map((r) => r.share)),
    }))
  );
  const weekRows = (items: SimAttempt[]) =>
    [...groupRows(items, (r) => Math.floor(r.day / 7))].map(([week, w]) => ({
      week,
      attempts: w.length,
      avg_band: meanOf(w.map((r) => r.band)),
      avg_mark_frac: meanOf(w.map((r) => r.share)),
    }));
  const byStudentWeek = students.flatMap((s, i) =>
    weekRows(rows.filter((r) => r.student === i)).map((w) => ({ username: s.username, ...w }))
  );
  return {
    days,
    weeks,
    totals: {
      attempts: rows.length,
      active_students: new Set(rows.map((r) => r.student)).size,
      avg_band: meanOf(rows.map((r) => r.band)),
      avg_mark_frac: meanOf(rows.map((r) => r.share)),
      first_attempt_at: first,
      last_attempt_at: last,
    },
    byVerb,
    byCourse,
    byTopic,
    byStudent,
    byStudentVerb,
    byStudentWeek,
    weekly: weekRows(rows),
    ...(classes
      ? {
          byClass: classes.map((c) => ({
            class_id: c.classId,
            name: c.name,
            year: c.year,
            ...metricsOf(rows.filter((r) => c.members.includes(r.student))),
            students: c.members.length,
          })),
        }
      : {}),
  };
};

const ALL_SECTIONS = { ...ALL_REPORT_SECTIONS };

/** A roster of `n` named students, drawn from first and last names, with stable usernames. */
const rosterOf = (n: number): StudentSpec[] => {
  const FIRST = [
    'Ava',
    'Liam',
    'Mia',
    'Noah',
    'Isla',
    'Ethan',
    'Zara',
    'Lachlan',
    'Chloe',
    'Oliver',
    'Amelia',
    'Jack',
    'Sofia',
    'Mason',
    'Ruby',
    'Hunter',
    'Grace',
    'Ryan',
    'Hannah',
    'Jayden',
  ];
  const LAST = [
    'Nguyen',
    "O'Brien",
    'Chen',
    'Patel',
    'Walker',
    'Kim',
    'Ahmed',
    'Reid',
    'Smith',
    'Wright',
    'Taylor',
    'Rossi',
    'Lee',
    'Campbell',
    'Clarke',
    'Mitchell',
    'Zhang',
    'Scott',
    'Singh',
    'Murphy',
    'Martin',
    'Thompson',
    'Park',
    'Hall',
    'Harris',
    'Jones',
  ];
  return Array.from({ length: n }, (_, i) => ({
    username: `student${String(i + 1).padStart(3, '0')}`,
    displayName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`,
  }));
};

/** One simulated class of `n` students: each with their own count and skill. */
const simulateClass = (seed: number, n: number, catalogue: Catalogue, offset = 0): SimAttempt[] => {
  const rand = seeded(seed);
  const rows: SimAttempt[] = [];
  for (let i = 0; i < n; i++) {
    const count = 4 + Math.floor(rand() * 18);
    const skill = 2.6 + rand() * 2.2;
    rows.push(...simulateStudent(rand, i + offset, count, skill, WINDOW_LAST_DAY, catalogue));
  }
  return rows;
};

const ownOptions = (over: Partial<ReportOptions>): ReportOptions => ({
  audience: 'student',
  windowDays: 90,
  courseFilter: null,
  className: null,
  includeStudentNames: true,
  sections: ALL_SECTIONS,
  subject: { name: 'Jordan Lee', roleLabel: 'Student', school: 'Northern Valley High School' },
  generatedAt,
  ...over,
});

const studentStats = (rows: SimAttempt[]) => {
  const scored = rows.map((r) => r.band);
  return {
    questionsAnswered: rows.length,
    averageBand: meanOf(scored) ?? 0,
    markShareMean: meanOf(rows.map((r) => r.share)) ?? undefined,
    markShareCount: rows.length,
    totalWordsWritten: rows.reduce((sum, r) => sum + r.words, 0),
    streakDays: 3,
  };
};

/** The typical student: 25 answers across two courses, improving across the window. */
const typicalRows = byDay(simulateStudent(seeded(20260714), 0, 25, 3, WINDOW_LAST_DAY));

export const typicalStudentReport: ProgressReport = buildStudentReport({
  stats: studentStats(typicalRows),
  history: typicalRows.map((r) => toOwnAttempt(r, SAMPLE_CATALOGUE)),
  options: ownOptions({}),
});

/** The same student, narrowed to one course: the topic table goes flat, the course table one row. */
export const courseFilteredReport: ProgressReport = buildStudentReport({
  stats: studentStats(typicalRows),
  history: typicalRows.map((r) => toOwnAttempt(r, SAMPLE_CATALOGUE)),
  options: ownOptions({
    courseFilter: {
      id: 'hsc-software-engineering',
      name: 'Software Engineering',
    } as ReportCourseFilter,
  }),
});

/** One answer: a single point is a point with its caption, not a line. */
const oneRows = byDay(simulateStudent(seeded(7), 0, 1, 3, 4)).map((r) => ({
  ...r,
  // Pinned to Software Engineering, the course the sample filters on.
  course: 1,
  topic: 0,
  day: r.day + 84,
  at: new Date(WINDOW_START.y, WINDOW_START.m - 1, WINDOW_START.d + r.day + 84, 12).toISOString(),
}));
export const oneAttemptStudentReport: ProgressReport = buildStudentReport({
  stats: studentStats(oneRows),
  history: oneRows.map((r) => toOwnAttempt(r, SAMPLE_CATALOGUE)),
  options: ownOptions({
    windowDays: 30,
    courseFilter: {
      id: 'hsc-software-engineering',
      name: 'Software Engineering',
    } as ReportCourseFilter,
  }),
});

/**
 * No answers in the period: history exists, but nothing falls in the last 30 days, so
 * every section says why it is empty and none is a blank frame.
 */
const oldRows: OwnAttempt[] = [
  {
    at: new Date(2025, 2, 2, 12).toISOString(),
    band: 4,
    mark: 4,
    totalMarks: 6,
    verb: 'EXPLAIN',
    wordCount: 140,
    course: {
      id: 'course-enterprise',
      legacyId: 'hsc-enterprise-computing',
      name: 'Enterprise Computing',
    },
    topic: { name: 'Data visualisation', course: null },
  },
];
export const emptyStudentReport: ProgressReport = buildStudentReport({
  stats: { questionsAnswered: 1, averageBand: 4, totalWordsWritten: 140, streakDays: 0 },
  history: oldRows,
  options: ownOptions({ windowDays: 30 }),
});

/** A class of 28: the named report, with the students table and the tier heatmap. */
const classRows = simulateClass(20261011, 28, SAMPLE_CATALOGUE);
const classStudents = rosterOf(28);
const enterprise12A: ClassSpec = {
  classId: 'class-12a',
  name: 'Enterprise 12A',
  year: 12,
  members: classStudents.map((_, i) => i),
};
const classOptions = (over: Partial<ReportOptions> = {}): ReportOptions =>
  ownOptions({
    audience: 'teacher',
    className: 'Enterprise 12A',
    subject: { name: 'Ms Priya Raman', roleLabel: 'Teacher', school: 'Northfield High School' },
    ...over,
  });
export const classReportNamed: ProgressReport = buildTeacherReport({
  payload: rosterPayload(classRows, classStudents, SAMPLE_CATALOGUE),
  options: classOptions(),
});
export const classReportAnonymised: ProgressReport = buildTeacherReport({
  payload: rosterPayload(classRows, classStudents, SAMPLE_CATALOGUE),
  options: classOptions({ includeStudentNames: false }),
});

/** A class of 120: forces the students table and the heatmap to split across several pages. */
const bigRows = simulateClass(20261120, 120, SAMPLE_CATALOGUE);
export const classReport120: ProgressReport = buildTeacherReport({
  payload: rosterPayload(bigRows, rosterOf(120), SAMPLE_CATALOGUE),
  options: classOptions({ className: null }),
});

/** Long names throughout: students, topics, courses. Every cell must ellipsise inside its column. */
const stressStudents: StudentSpec[] = [
  {
    username: 'stress001',
    displayName: 'Bartholomew Maximilian Ferdinand-Alexander Montgomery III',
  },
  { username: 'stress002', displayName: 'Søren Ørsted-Wäldchen' },
  { username: 'stress003', displayName: 'Ana' },
  { username: 'stress004', displayName: 'Nguyễn Thị Phương Thảo Trần-Hoàng' },
];
const stressRows = simulateClass(20260505, stressStudents.length, STRESS_CATALOGUE);
export const stressReport: ProgressReport = buildTeacherReport({
  payload: rosterPayload(stressRows, stressStudents, STRESS_CATALOGUE),
  options: classOptions({
    className: 'Software Engineering and Emerging Technologies Extension Class 12 Advanced',
    subject: {
      name: 'Dr Alexandra Maria Fitzgerald-Montgomery',
      roleLabel: 'Head Teacher',
      school: 'Northfield High School of the Upper Valley Performing and Visual Arts',
    },
  }),
});

/** Five classes across Years 11 and 12: the school-level view, with the classes table. */
const schoolClasses: ClassSpec[] = [
  { classId: 'c1', name: 'Enterprise 11A', year: 11, members: [] },
  { classId: 'c2', name: 'Enterprise 11B', year: 11, members: [] },
  { classId: 'c3', name: 'Software 11', year: 11, members: [] },
  { classId: 'c4', name: 'Enterprise 12A', year: 12, members: [] },
  { classId: 'c5', name: 'Software 12', year: 12, members: [] },
];
const SCHOOL_SIZES = [22, 23, 24, 22, 23];
const schoolStudents = rosterOf(SCHOOL_SIZES.reduce((a, b) => a + b, 0));
let schoolStart = 0;
schoolClasses.forEach((c, idx) => {
  c.members = Array.from({ length: SCHOOL_SIZES[idx] }, (_, k) => schoolStart + k);
  schoolStart += SCHOOL_SIZES[idx];
});
const schoolRows = (() => {
  const rand = seeded(20261012);
  const rows: SimAttempt[] = [];
  schoolClasses.forEach((c, idx) => {
    c.members.forEach((student) => {
      const count = 3 + Math.floor(rand() * 16);
      const skill = 2.4 + rand() * 2.4 + (idx > 2 ? 0.3 : 0);
      rows.push(...simulateStudent(rand, student, count, skill, WINDOW_LAST_DAY));
    });
  });
  return rows;
})();
export const schoolReport: ProgressReport = buildSchoolReport({
  payload: rosterPayload(schoolRows, schoolStudents, SAMPLE_CATALOGUE, schoolClasses),
  options: ownOptions({
    audience: 'school',
    includeStudentNames: false,
    subject: { name: 'Northfield High School', roleLabel: 'Administrator', school: null },
  }),
});

/**
 * Every progress-report sample, named for the file it renders to. R7 is the typical
 * student on US Letter: the same report, the other paper size.
 */
export const REPORT_SAMPLES: {
  name: string;
  report: ProgressReport;
  pageSize?: 'a4' | 'letter';
}[] = [
  { name: 'R1-student-typical-25', report: typicalStudentReport },
  { name: 'R2-student-one-attempt', report: oneAttemptStudentReport },
  { name: 'R3-student-empty', report: emptyStudentReport },
  { name: 'R4-class-28-named', report: classReportNamed },
  { name: 'R5-school-five-classes', report: schoolReport },
  { name: 'R6-class-28-anonymised', report: classReportAnonymised },
  { name: 'R7-student-typical-letter', report: typicalStudentReport, pageSize: 'letter' },
  { name: 'R8-student-course-filter', report: courseFilteredReport },
  { name: 'R9-class-120', report: classReport120 },
  { name: 'R10-stress-long-names', report: stressReport },
];
