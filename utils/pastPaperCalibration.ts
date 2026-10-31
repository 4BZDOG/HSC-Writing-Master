import { Course, Prompt } from '../types';
import { getPastHscLabel } from './pastHscUtils';

/**
 * Real past HSC questions as calibration for the AI generators.
 *
 * The library already holds NESA's own questions (`isPastHSC`), with their stems,
 * stimuli and marking guides word for word. A generated question that has seen two
 * or three of them writes like the paper it is practice for: the stem's length and
 * shape, how a stimulus is introduced and tied back to the task ("this business",
 * "the extract below"), and the guide's register. Without them the model writes
 * from its own idea of an exam question, which runs long, decorates its scenarios
 * and names a different city every time (`docs/hsc-scenario-conventions.md`).
 *
 * The examples come from the same course where it has any, nearest first: the same
 * dot point, then the same topic, then the course. Within each, the most recent
 * paper leads among questions of a similar length, because the latest paper is the
 * standard a student will sit: NESA's wording and the demand at each mark move a
 * little from year to year, and a 2019 stem is calibration only where nothing newer
 * is as close. A course with no past papers yet (a new syllabus, a course NESA
 * publishes no wording for) borrows from OTHER courses, and the brief says so and
 * limits what may be taken from them to the craft, not the content.
 *
 * The library is registered once, from the place the courses load (App), rather
 * than threaded through every generator and every modal that calls one. The
 * generators take a course name or a prompt and look the rest up here; with
 * nothing registered (a test, or before the library loads) every lookup is empty
 * and the briefs are empty strings, so a generator behaves as it did before.
 */

export interface CalibrationExample {
  courseName: string;
  topicName: string;
  dotPoint: string;
  prompt: Prompt;
  /** How the example relates to the question being written. */
  closeness: 'dotPoint' | 'topic' | 'course' | 'otherCourse';
}

export interface CalibrationSelection {
  examples: CalibrationExample[];
  /** True when the course has no past questions and the examples are borrowed. */
  fromOtherCourses: boolean;
}

interface LibraryEntry {
  courseName: string;
  topicName: string;
  dotPoint: string;
  prompt: Prompt;
}

let library: readonly Course[] = [];
let pastIndex: LibraryEntry[] | null = null;
let promptIndex: Map<string, LibraryEntry> | null = null;

/** Called with the live library whenever it changes. Cheap: the index is built lazily. */
export const registerCalibrationLibrary = (courses: readonly Course[]): void => {
  if (courses === library) return;
  library = courses;
  pastIndex = null;
  promptIndex = null;
};

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

const buildIndex = (): { past: LibraryEntry[]; byId: Map<string, LibraryEntry> } => {
  const past: LibraryEntry[] = [];
  const byId = new Map<string, LibraryEntry>();
  for (const course of library) {
    // A copy kept as "(before refresh)" duplicates the shipped course; reading both
    // would offer every past question twice.
    if (course.supersededBy) continue;
    for (const topic of course.topics ?? []) {
      for (const sub of topic.subTopics ?? []) {
        for (const dp of sub.dotPoints ?? []) {
          for (const p of dp.prompts ?? []) {
            const entry = {
              courseName: course.name,
              topicName: topic.name,
              dotPoint: dp.description,
              prompt: p,
            };
            byId.set(p.id, entry);
            if (p.isPastHSC && p.question?.trim() && p.totalMarks > 0) past.push(entry);
          }
        }
      }
    }
  }
  pastIndex = past;
  promptIndex = byId;
  return { past, byId };
};

const pastEntries = (): LibraryEntry[] => pastIndex ?? buildIndex().past;

/** Where a prompt sits in the registered library, if it is there. */
export const locatePrompt = (promptId: string): Omit<LibraryEntry, 'prompt'> | null => {
  const entry = (promptIndex ?? buildIndex().byId).get(promptId);
  return entry
    ? { courseName: entry.courseName, topicName: entry.topicName, dotPoint: entry.dotPoint }
    : null;
};

/**
 * The paper question a prompt belongs to, so the variants of one question (Question
 * 1(a)–(k), one per prescribed text) count once. Three variants of the same stem
 * teach the model one stem.
 */
const questionKey = (p: Prompt): string => {
  const base = (p.hscQuestionNumber ?? '')
    .trim()
    .replace(/^q(uestion)?\s*/i, '')
    .replace(/\(.*$/, '')
    .trim();
  return p.hscYear && base ? `${p.hscYear}:${base}` : `id:${p.id}`;
};

const CLOSENESS_RANK: Record<CalibrationExample['closeness'], number> = {
  dotPoint: 0,
  topic: 1,
  course: 2,
  otherCourse: 3,
};

export interface CalibrationQuery {
  courseName: string;
  topicName?: string;
  dotPoint?: string;
  marks: number;
  /** The question being worked on, so it is never its own example. */
  excludePromptId?: string;
  limit?: number;
}

export const selectCalibrationExamples = ({
  courseName,
  topicName,
  dotPoint,
  marks,
  excludePromptId,
  limit = 3,
}: CalibrationQuery): CalibrationSelection => {
  const entries = pastEntries().filter((e) => e.prompt.id !== excludePromptId);
  if (entries.length === 0) return { examples: [], fromOtherCourses: false };

  const course = norm(courseName);
  const sameCourse = entries.filter((e) => norm(e.courseName) === course);
  const fromOtherCourses = sameCourse.length === 0;

  const scored = (fromOtherCourses ? entries : sameCourse).map((e) => {
    const closeness: CalibrationExample['closeness'] = fromOtherCourses
      ? 'otherCourse'
      : dotPoint && norm(e.dotPoint) === norm(dotPoint)
        ? 'dotPoint'
        : topicName && norm(e.topicName) === norm(topicName)
          ? 'topic'
          : 'course';
    const gap = Math.abs(e.prompt.totalMarks - marks);
    // Near (within 2 marks), comparable (within 5) or far: inside a band of length
    // the newest paper leads, so a 2025 6-mark question outranks a 2019 5-mark one
    // for a 5-mark brief, but never a 20-mark one.
    const lengthBand = gap <= 2 ? 0 : gap <= 5 ? 1 : 2;
    return { e, closeness, gap, lengthBand };
  });
  scored.sort(
    (a, b) =>
      CLOSENESS_RANK[a.closeness] - CLOSENESS_RANK[b.closeness] ||
      a.lengthBand - b.lengthBand ||
      (b.e.prompt.hscYear ?? 0) - (a.e.prompt.hscYear ?? 0) ||
      a.gap - b.gap ||
      a.e.prompt.id.localeCompare(b.e.prompt.id)
  );

  // Borrowed examples are spread over courses, so one course's conventions do not
  // read as the rule (a first pass takes one per course, a second fills up); a
  // course's own examples are spread over paper questions.
  const take = fromOtherCourses ? Math.min(limit, 2) : limit;
  const examples: CalibrationExample[] = [];
  const seenQuestions = new Set<string>();
  const seenCourses = new Set<string>();
  for (const onePerCourse of [fromOtherCourses, false]) {
    for (const { e, closeness } of scored) {
      if (examples.length >= take) break;
      const key = `${norm(e.courseName)}|${questionKey(e.prompt)}`;
      if (seenQuestions.has(key)) continue;
      if (onePerCourse && seenCourses.has(norm(e.courseName))) continue;
      seenQuestions.add(key);
      seenCourses.add(norm(e.courseName));
      examples.push({ ...e, closeness });
    }
  }
  return { examples, fromOtherCourses };
};

/** The newest paper year among the examples, if any carries one. */
const latestPaperYear = (examples: CalibrationExample[]): number | undefined => {
  const years = examples.map((x) => x.prompt.hscYear ?? 0).filter((y) => y > 0);
  return years.length ? Math.max(...years) : undefined;
};

const clip = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

/** The guide's first and last rows: the register of the top and the floor. */
const guideEnds = (criteria: string | undefined): string => {
  const rows = (criteria ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length <= 2) return rows.map((r) => clip(r, 260)).join(' | ');
  return `${clip(rows[0], 260)} | … | ${clip(rows[rows.length - 1], 160)}`;
};

const describeExample = (x: CalibrationExample, i: number): string => {
  const label = getPastHscLabel(x.prompt)?.text ?? 'Past HSC';
  const where =
    x.closeness === 'otherCourse'
      ? x.courseName
      : x.closeness === 'dotPoint'
        ? 'this dot point'
        : x.closeness === 'topic'
          ? 'this topic'
          : `topic: ${x.topicName}`;
  const lines = [
    `${i + 1}. ${label} — ${x.prompt.totalMarks} marks, ${x.prompt.verb} (${where})`,
    `   Question: ${clip(x.prompt.question, 420)}`,
  ];
  // The paper's own heading, kept apart from the scenario since 2026-10.
  if (x.prompt.hscSection) lines.splice(1, 0, `   On the paper: ${clip(x.prompt.hscSection, 180)}`);
  if (x.prompt.scenario?.trim())
    lines.push(`   Scenario/stimulus: ${clip(x.prompt.scenario, 360)}`);
  if (x.prompt.markingCriteria?.trim())
    lines.push(`   NESA marking guide (top … bottom): ${guideEnds(x.prompt.markingCriteria)}`);
  return lines.join('\n');
};

/**
 * The calibration block for the question generator. Empty when the library holds
 * no past questions at all.
 */
export const buildQuestionCalibrationBrief = (selection: CalibrationSelection): string => {
  if (selection.examples.length === 0) return '';
  const latest = latestPaperYear(selection.examples);
  const head = selection.fromOtherCourses
    ? 'REAL PAST HSC QUESTIONS FROM OTHER COURSES (calibration). This course has no past HSC ' +
      'questions in the library yet, so these come from other subjects. Take only the craft: how ' +
      'long the stem is, how a scenario or stimulus is set up and then referred to in the stem, how ' +
      'the demand grows with the marks, and how the guide words each row. Do NOT borrow their ' +
      'subject matter, their scenarios or their discipline’s conventions.'
    : 'REAL PAST HSC QUESTIONS FROM THIS COURSE (calibration). Write the new question the way ' +
      'these are written: the stem’s length and shape, how a scenario or stimulus is introduced and ' +
      'tied back to the task, the demand at this many marks, and the guide’s wording. Never copy ' +
      'their wording, scenarios or texts; the new question is for the dot point above.' +
      (latest
        ? ` The most recent paper here is ${latest}: where the examples differ, write to the ${latest} paper's standard.`
        : '');
  return [head, ...selection.examples.map(describeExample)].join('\n');
};

/**
 * The calibration block for the rubric generator: real NESA guides at similar marks,
 * for wording only. The app's own row structure (stated separately) still decides
 * how many rows there are and which marks they cover.
 */
export const buildGuideCalibrationBrief = (selection: CalibrationSelection): string => {
  const withGuides = selection.examples.filter((x) => x.prompt.markingCriteria?.trim());
  if (withGuides.length === 0) return '';
  const head =
    `REAL NESA MARKING GUIDES${selection.fromOtherCourses ? ' FROM OTHER COURSES' : ' FROM THIS COURSE'} ` +
    '(wording calibration). Match their register: each row describes a whole response, opens with ' +
    'a third-person verb, and moves down the ladder with NESA’s qualifiers (skilfully, effectively, ' +
    'competently, sound, limited, elementary). Use them for wording ONLY: the row structure stated ' +
    'above decides the rows and their marks, and the criteria must be about THIS question.';
  return [
    head,
    ...withGuides.slice(0, 2).map((x, i) => {
      const label = getPastHscLabel(x.prompt)?.text ?? 'Past HSC';
      const from = x.closeness === 'otherCourse' ? `, ${x.courseName}` : '';
      return `${i + 1}. ${label} (${x.prompt.totalMarks} marks${from}): ${guideEnds(x.prompt.markingCriteria)}`;
    }),
  ].join('\n');
};

/**
 * NESA's own published sample answers are short. The medians across the 2024–2025
 * guidelines read for the seed (docs/seed-data-playbook.md §3), for a full-mark
 * answer by question marks. The full-mark word range is the ceiling; these are where
 * real answers sit.
 */
export const NESA_SAMPLE_MEDIAN_WORDS: Readonly<Record<number, number>> = {
  1: 20,
  2: 33,
  3: 54,
  4: 74,
  5: 93,
  6: 125,
  8: 202,
};

/** NESA's own full-mark answers in one course: (question, answer), newest paper first. */
const nesaFullMarkAnswers = (courseName: string): { prompt: Prompt; answer: string }[] => {
  const course = norm(courseName);
  const out: { prompt: Prompt; answer: string }[] = [];
  for (const e of pastEntries()) {
    if (norm(e.courseName) !== course) continue;
    for (const a of e.prompt.sampleAnswers ?? []) {
      if (a.source === 'HSC_EXEMPLAR' && a.mark === e.prompt.totalMarks && a.answer?.trim()) {
        out.push({ prompt: e.prompt, answer: a.answer });
      }
    }
  }
  return out.sort((x, y) => (y.prompt.hscYear ?? 0) - (x.prompt.hscYear ?? 0));
};

const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/**
 * How long NESA's own full-mark answers to questions of this many marks run in
 * this course, from its newest paper that has any: the median of that paper's
 * answers, or of every paper's when the newest has only one. Undefined when the
 * course holds none at this mark.
 */
export const courseSampleMedianWords = (courseName: string, marks: number): number | undefined => {
  const atMark = nesaFullMarkAnswers(courseName).filter((x) => x.prompt.totalMarks === marks);
  if (atMark.length === 0) return undefined;
  const newest = atMark[0].prompt.hscYear;
  const sameYear = atMark.filter((x) => x.prompt.hscYear === newest);
  const pool = (sameYear.length >= 2 ? sameYear : atMark)
    .map((x) => wordCount(x.answer))
    .sort((a, b) => a - b);
  const mid = Math.floor(pool.length / 2);
  return pool.length % 2 ? pool[mid] : Math.round((pool[mid - 1] + pool[mid]) / 2);
};

/**
 * One of NESA's own full-mark answers from this course, at the same marks where
 * there is one (otherwise the nearest), newest paper first: the standard a model
 * answer is written to. Never an answer to the question being written.
 */
export const selectNesaAnchor = (
  courseName: string,
  marks: number,
  excludePromptId?: string
): { prompt: Prompt; answer: string } | undefined => {
  const pool = nesaFullMarkAnswers(courseName).filter((x) => x.prompt.id !== excludePromptId);
  if (pool.length === 0) return undefined;
  const gap = (x: { prompt: Prompt }) => Math.abs(x.prompt.totalMarks - marks);
  // Stable sort: newest paper first is kept within equal gaps.
  return [...pool].sort((a, b) => gap(a) - gap(b))[0];
};

/**
 * The calibration lines for the sample-answer generator: whether the question is a
 * real HSC question (and so must be answered as the exam asks), and, for a full-mark
 * answer, how long NESA's own answers at that mark run and one of them to write to.
 *
 * The length comes from the course's newest paper where the library holds NESA's
 * answers at that mark, otherwise from the cross-course medians above. The anchor is
 * the standard, not the content: its question is different, so nothing in it may be
 * reused.
 */
export const buildSampleCalibrationBrief = (prompt: Prompt, mark: number): string => {
  const lines: string[] = [];
  const label = getPastHscLabel(prompt);
  if (label) {
    lines.push(
      `- This is a real HSC question (${label.text}). Answer it exactly as the exam asks, as a ` +
        'strong NSW student would in exam conditions, and write to the row of its marking guide ' +
        `that awards ${mark}.`
    );
  }
  // NESA's answers are full-mark answers, so they say nothing about a 3/6.
  if (mark !== prompt.totalMarks) return lines.join('\n');
  const courseName = locatePrompt(prompt.id)?.courseName;
  const courseMedian = courseName ? courseSampleMedianWords(courseName, mark) : undefined;
  const median = courseMedian ?? NESA_SAMPLE_MEDIAN_WORDS[mark];
  if (median) {
    lines.push(
      `- NESA’s own published full-mark answers to ${mark}-mark questions ` +
        `${courseMedian ? 'in this course ' : ''}run to about ${median} words, so the lower part ` +
        'of the length range above is where a model answer belongs: it earns its mark by ' +
        'precision, not length.'
    );
  }
  const anchor = courseName ? selectNesaAnchor(courseName, mark, prompt.id) : undefined;
  if (anchor) {
    const anchorLabel = getPastHscLabel(anchor.prompt)?.text ?? 'Past HSC';
    lines.push(
      `- The standard to write to: a full-mark answer NESA published for ${anchorLabel} ` +
        `(${anchor.prompt.totalMarks} marks, ${anchor.prompt.verb}), a different question. Match its ` +
        'precision, density and register, not its content; reuse none of its points or wording.\n' +
        `  Question: ${clip(anchor.prompt.question, 300)}\n` +
        `  NESA's full-mark answer: ${clip(anchor.answer, 1400)}`
    );
  }
  return lines.join('\n');
};
