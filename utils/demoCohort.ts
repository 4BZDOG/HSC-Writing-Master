/**
 * Deterministic demo cohort generator.
 *
 * Builds a plausible term's worth of student activity — two Year 12 classes (the
 * Enterprise class and the Software class), ten weeks of attempts,
 * marks, bands and AI feedback — so that every feature depending on
 * *accumulated* use has something to show: Class Insights, Student Progress and
 * its band-trend sparkline, the progress reports (student, class and school, with
 * their course drill-down), the student roster, the Usage Dashboard, XP/levels/streaks.
 *
 * Two consumers share this one module so the two demo paths can never tell
 * different stories:
 *   - `supabase/demoSeed.mjs` — writes the cohort to a demo Supabase project.
 *   - `services/demoFixtures.ts` — hydrates the same data into IndexedDB for
 *     the offline mock accounts.
 *
 * Design constraints:
 *   - **Deterministic.** All randomness comes from a seeded PRNG, so two runs
 *     produce identical content. Only timestamps differ, because they are
 *     derived from the run time (see `daysAgo`) — that is what keeps the 30-day
 *     analytics windows populated on every reseed.
 *   - **Never recalculates band logic.** Marks and bands come from
 *     `getBandForMark` in data/commandTerms.ts, so seeded data
 *     cannot drift from the Verb Gate. A demo that contradicted the app's own
 *     band rules would be worse than no demo.
 *   - **Pure.** No I/O, no DB, no browser APIs — unit-testable, and safe to
 *     import from both Node and the bundle.
 */
import type { EvaluationCriterion, EvaluationResult, PromptVerb, UserStats } from '../types';
import { levelForXp, xpForEvaluation } from './progression';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { AI_MODELS } from '../services/aiModels';
import {
  DEMO_CORPORA,
  DEMO_CRITERION_FEEDBACK,
  DEMO_QUICK_TIPS,
  DEMO_STRENGTHS,
  bandTierFor,
  type DemoCorpus,
} from '../data/demoDrafts';

// ----------------------------------------------------------------------------
// Identity — deliberately marked as a demo
// ----------------------------------------------------------------------------

/**
 * The school name carries the disclaimer. Students have plausible first names
 * so screenshots read naturally, but the school they belong to says plainly
 * that none of this is real — the seeded writing must never be mistakable for a
 * genuine student submission.
 */
export const DEMO_SCHOOL_NAME = 'Riverbank High School (Demo)';
export const DEMO_CLASS_NAME = 'Year 12 Enterprise Computing (Demo)';

/** A demo class: the course it studies, and the staff who run it. */
export interface DemoClassSpec {
  /** What a student's `classKeys` refers to. */
  key: string;
  name: string;
  year: number;
  /** The course key whose questions the class works through. */
  course: string;
  /** Staff username of the owner. */
  ownerUsername: string;
  /** Staff username added as co-teacher, if any. */
  coTeacherUsername?: string;
}

/**
 * The two demo classes, both Year 12. Ms Bennett owns the Enterprise class with
 * Mr Okafor as co-teacher; Mr Okafor alone owns the Software class. So Ms
 * Bennett's reports cover the Enterprise class only, while Mr Okafor's cover both
 * — the scoping the progress reports exist to show.
 */
export const DEMO_CLASSES: DemoClassSpec[] = [
  {
    key: 'enterprise',
    name: DEMO_CLASS_NAME,
    year: 12,
    course: 'enterprise',
    ownerUsername: 'demo.teacher',
    coTeacherUsername: 'demo.coteacher',
  },
  {
    key: 'software',
    name: 'Year 12 Software Engineering (Demo)',
    year: 12,
    course: 'software',
    ownerUsername: 'demo.coteacher',
  },
];

/** Fixed PRNG seed. Changing it reshuffles the whole cohort — don't, casually. */
export const DEMO_SEED = 0x48534344; // "HSCD"

/**
 * How a student's performance behaves over the term. The spread is deliberate:
 * `utils/classAnalytics.ts` ranks weaknesses by `low_band_rate`, so if every
 * student performed identically the class analytics would rank nothing and the
 * feature would look broken rather than empty.
 */
export type ArchetypeId =
  | 'improver'
  | 'plateaued'
  | 'verbBlocked'
  | 'sporadic'
  | 'strong'
  | 'atRisk'
  | 'newcomer';

export interface Archetype {
  id: ArchetypeId;
  /** Human-readable intent, surfaced in the seed script's summary output. */
  note: string;
  /** Attempts per week (before the PRNG's ±1 jitter). */
  weeklyVolume: number;
  /**
   * First week the student is present in (0-indexed, as in `targetAttainment`).
   * Weeks before it have no attempts. Omitted: present for the whole term.
   */
  startWeek?: number;
  /**
   * How much of a question's *achievable ceiling* this student reaches, as a
   * fraction in (0, 1], for a given week (0-indexed, 0 = ten weeks ago) and
   * question tier.
   *
   * Attainment is expressed relative to the ceiling rather than as an absolute
   * band because the Verb Gate makes the ceiling equal to the verb's tier: an
   * IDENTIFY question tops out at band 1 and an EXPLAIN at band 3, no matter
   * how well it is answered. An archetype asking for "band 5" would therefore
   * be silently clamped to 1 on a third of the question bank, and every
   * archetype would look identical on low-tier questions.
   */
  targetAttainment: (week: number, tier: number) => number;
}

const TOTAL_WEEKS = 10;

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  // A third of the ceiling to nearly all of it: the case the sparkline exists
  // to show.
  improver: {
    id: 'improver',
    note: 'climbs from a third of the achievable ceiling to nearly all of it',
    weeklyVolume: 4,
    targetAttainment: (week) => 0.35 + (week / (TOTAL_WEEKS - 1)) * 0.55,
  },
  // High volume, flat outcome — "working hard, not improving".
  plateaued: {
    id: 'plateaued',
    note: 'high volume, flat at two-thirds of the ceiling — working without improving',
    weeklyVolume: 5,
    targetAttainment: () => 0.65,
  },
  // Fine on recall/description, collapses once the verb demands judgement.
  // This is what makes the Cognitive Spectrum and verb ranking meaningful.
  verbBlocked: {
    id: 'verbBlocked',
    note: 'reaches the ceiling on tiers 1–3, falls well short on Analyse/Evaluate',
    weeklyVolume: 4,
    targetAttainment: (_week, tier) => (tier <= 3 ? 1 : 0.35),
  },
  // Long gaps — exercises `formatLastActive` and the roster's recency column.
  sporadic: {
    id: 'sporadic',
    note: 'irregular attendance, erratic results',
    weeklyVolume: 2,
    targetAttainment: (week) => (week % 3 === 0 ? 0.9 : 0.5),
  },
  strong: {
    id: 'strong',
    note: 'consistently at or near the ceiling',
    weeklyVolume: 4,
    targetAttainment: (week) => (week % 2 === 0 ? 0.85 : 1),
  },
  atRisk: {
    id: 'atRisk',
    note: 'a quarter of the ceiling throughout, low volume — needs intervention',
    weeklyVolume: 2,
    targetAttainment: (week) => (week % 4 === 0 ? 0.4 : 0.2),
  },
  // Joined in the most recent week: one or two attempts, all recent. The sparse
  // case — a profile with almost nothing behind it, which every report and
  // roster column must still render without an empty frame.
  newcomer: {
    id: 'newcomer',
    note: 'joined this week: one or two attempts, all recent — the sparse-data case',
    weeklyVolume: 1,
    startWeek: TOTAL_WEEKS - 1,
    targetAttainment: () => 0.6,
  },
};

/**
 * The engines the seeded usage history is spread across, as the *provider model
 * strings* `ai_model_usage.model` actually stores (that is what
 * `record_ai_model_usage()` is handed, and what `foldModelUsage` prices).
 *
 * Resolved from the engine registry rather than written out as literals: the
 * Usage Dashboard prices each row by looking the string up there, and a
 * hand-typed string that has drifted from the registry — say a stale
 * `gemini-2.5-flash` — still renders, but labelled with the raw string and
 * costed at zero. That is precisely the panel the seeded telemetry exists to
 * demonstrate, so it must not be possible to get wrong.
 *
 * A spread of price points, so the cost breakdown has something to rank.
 */
export const DEMO_USAGE_MODEL_IDS = ['gemini-flash', 'gemini-pro', 'claude-sonnet'] as const;

export const demoUsageModels = (): string[] =>
  DEMO_USAGE_MODEL_IDS.map((id) => {
    const entry = AI_MODELS.find((m) => m.id === id);
    if (!entry) {
      throw new Error(
        `demoUsageModels: engine "${id}" is no longer in the registry — ` +
          'update DEMO_USAGE_MODEL_IDS to a current engine id.'
      );
    }
    return entry.model;
  });

export interface DemoStudentSpec {
  username: string;
  displayName: string;
  archetype: ArchetypeId;
  /**
   * The course keys whose questions the student draws from. Omitted: every
   * question given to `generateCohort`. A student with two courses works through
   * both, choosing a course at random for each attempt.
   */
  courses?: string[];
  /**
   * The demo classes (`DEMO_CLASSES` keys) the student is enrolled in. Plural
   * because a student who studies both courses sits in both classes.
   */
  classKeys?: string[];
  /**
   * Scales the archetype's weekly attempts, before the ±1 jitter. Default 1; a
   * student who is 0.5 writes about half as often. Never below one attempt a week.
   * Unset draws exactly the PRNG calls it always did, so nobody else's work moves.
   */
  volumeScale?: number;
}

/**
 * The cohort: twelve students in the Enterprise class, then six in the Software
 * class. All are Year 12. First names only — a demo does not need surnames, and
 * omitting them removes any chance of colliding with a real person's full name.
 *
 * Appended, never inserted: a student's writing is drawn from a PRNG seeded by
 * their position here, so reordering or inserting would reshuffle everyone after
 * the change. Ethan and Hana take both courses, so they sit in both the Enterprise
 * class and the Software class, and the course filter in the progress reports has
 * one student's work to split.
 */
export const DEMO_STUDENTS: DemoStudentSpec[] = [
  {
    username: 'demo.aisha',
    displayName: 'Aisha (Demo)',
    archetype: 'improver',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.tom',
    displayName: 'Tom (Demo)',
    archetype: 'improver',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.priya',
    displayName: 'Priya (Demo)',
    archetype: 'improver',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.jayden',
    displayName: 'Jayden (Demo)',
    archetype: 'plateaued',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.mei',
    displayName: 'Mei (Demo)',
    archetype: 'plateaued',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.harry',
    displayName: 'Harry (Demo)',
    archetype: 'plateaued',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.olivia',
    displayName: 'Olivia (Demo)',
    archetype: 'verbBlocked',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.noah',
    displayName: 'Noah (Demo)',
    archetype: 'verbBlocked',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.zara',
    displayName: 'Zara (Demo)',
    archetype: 'sporadic',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.liam',
    displayName: 'Liam (Demo)',
    archetype: 'sporadic',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.chen',
    displayName: 'Chen (Demo)',
    archetype: 'strong',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  {
    username: 'demo.kayla',
    displayName: 'Kayla (Demo)',
    archetype: 'atRisk',
    courses: ['enterprise'],
    classKeys: ['enterprise'],
  },
  // The Software class. Ethan and Hana take both courses, so they also sit in the
  // Enterprise class.
  {
    username: 'demo.ethan',
    displayName: 'Ethan (Demo)',
    archetype: 'improver',
    courses: ['enterprise', 'software'],
    classKeys: ['enterprise', 'software'],
  },
  {
    username: 'demo.sofia',
    displayName: 'Sofia (Demo)',
    archetype: 'verbBlocked',
    courses: ['software'],
    classKeys: ['software'],
  },
  {
    username: 'demo.mateo',
    displayName: 'Mateo (Demo)',
    archetype: 'newcomer',
    courses: ['software'],
    classKeys: ['software'],
  },
  {
    username: 'demo.hana',
    displayName: 'Hana (Demo)',
    archetype: 'strong',
    courses: ['enterprise', 'software'],
    classKeys: ['enterprise', 'software'],
  },
  {
    username: 'demo.dylan',
    displayName: 'Dylan (Demo)',
    archetype: 'sporadic',
    courses: ['software'],
    classKeys: ['software'],
  },
  {
    username: 'demo.amara',
    displayName: 'Amara (Demo)',
    archetype: 'atRisk',
    courses: ['software'],
    classKeys: ['software'],
  },
];

/**
 * Attempts for the two plan-state accounts that have history. Their accounts,
 * plans and class enrolment are created with the other plan-state accounts in
 * supabase/demoSeed.mjs; this list only supplies their work, so the cohort's
 * generator is the one place a student's attempts are written. Ben (demo.capped)
 * is deliberately absent: an empty history is the state his account exists to show.
 *
 * Appended after DEMO_STUDENTS in the generator call, so their own streams stay
 * stable as long as the cohort itself is not extended.
 */
export const DEMO_PLAN_STUDENT_HISTORY: DemoStudentSpec[] = [
  {
    username: 'demo.free',
    displayName: 'Sam (Demo, Free)',
    archetype: 'improver',
    courses: ['enterprise'],
    // Half Aisha's volume: a lighter history, still climbing.
    volumeScale: 0.5,
  },
  {
    username: 'demo.plus',
    displayName: 'Ava (Demo, Plus)',
    archetype: 'strong',
    courses: ['enterprise', 'software'],
  },
];

// ----------------------------------------------------------------------------
// Seeded PRNG
// ----------------------------------------------------------------------------

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Chosen because it
 * is four lines of arithmetic with no dependency, and identical in Node and the
 * browser, which is what "the two demo paths tell the same story" requires.
 */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Deterministic integer in [min, max]. */
const intBetween = (rand: () => number, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

/** Deterministic pick from a non-empty array. */
const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];

// ----------------------------------------------------------------------------
// Inputs and outputs
// ----------------------------------------------------------------------------

/** A question the cohort can attempt, flattened from the course tree. */
export interface DemoPromptRef {
  /** The prompt's `legacy_id` (Supabase) or `id` (local fixture). */
  id: string;
  question: string;
  verb?: PromptVerb;
  totalMarks: number;
  /** Owning topic name — used to personalise the draft text. */
  topicName: string;
  /**
   * The course key this question belongs to (see `DemoStudentSpec.courses`).
   * Omitted for a course-agnostic pool: an untagged question is eligible for every
   * student, and is written in the Enterprise voice.
   */
  course?: string;
}

/** One generated attempt: a student's draft plus its AI evaluation. */
export interface DemoAttempt {
  username: string;
  promptId: string;
  /** Whole days before the run time. Converted to a timestamp by the caller. */
  daysAgo: number;
  draft: string;
  wordCount: number;
  mark: number;
  /** Out of — for the share of marks earned the profile averages. */
  totalMarks: number;
  band: number;
  evaluation: EvaluationResult;
}

export interface DemoCohort {
  students: DemoStudentSpec[];
  /** Every attempt, oldest first. */
  attempts: DemoAttempt[];
  /** Per-student derived profile stats (XP, level, streak, averages). */
  stats: Record<string, UserStats>;
  /** AI calls per student per `daysAgo`, for seeding `ai_usage`. */
  dailyCalls: Record<string, Record<number, number>>;
}

export interface GenerateCohortOptions {
  /** Questions the cohort draws from. Must be non-empty. */
  prompts: DemoPromptRef[];
  seed?: number;
  weeks?: number;
  students?: DemoStudentSpec[];
}

// ----------------------------------------------------------------------------
// Generation
// ----------------------------------------------------------------------------

/** The cognitive tier of a question, via the canonical verb registry. */
export const tierOfPrompt = (prompt: DemoPromptRef): number =>
  getCommandTermInfo(prompt.verb as PromptVerb | undefined).tier;

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * The course-specific prose for a question. Untagged questions are written
 * against the Enterprise corpus, which is what the original bank was.
 */
const corpusFor = (course?: string): DemoCorpus => {
  const corpus = DEMO_CORPORA[course ?? 'enterprise'];
  if (!corpus) throw new Error(`demoCohort: no demo writing for course "${course}"`);
  return corpus;
};

/**
 * The questions a student draws from, as lanes: one per course they study, in
 * the order they list them. An untagged question is course-agnostic and sits in
 * every lane.
 *
 * A student with one lane draws from it exactly as from a single pool, so
 * single-course students produce the same attempts they always did. A student
 * with two lanes picks a lane at random for each attempt, so their work splits
 * between the courses rather than being weighted by how many questions each has.
 */
const lanesFor = (student: DemoStudentSpec, prompts: DemoPromptRef[]): DemoPromptRef[][] => {
  if (!student.courses) return [prompts];
  if (!student.courses.length) {
    throw new Error(
      `generateCohort: ${student.username} lists no courses — omit courses to draw from every question`
    );
  }
  const lanes = student.courses
    .map((course) => prompts.filter((p) => p.course === undefined || p.course === course))
    .filter((lane) => lane.length > 0);
  if (!lanes.length) {
    throw new Error(
      `generateCohort: no questions for ${student.username} in courses ${student.courses.join(', ')}`
    );
  }
  return lanes;
};

/**
 * Builds an EvaluationResult consistent with the mark awarded.
 *
 * The criteria must sum to `mark` out of `totalMarks` — the app renders each
 * criterion's mark against its max, so a payload whose parts contradict its
 * total would display as a bug in the marking engine rather than as demo data.
 */
const buildEvaluation = (
  rand: () => number,
  prompt: DemoPromptRef,
  mark: number,
  band: number
): EvaluationResult => {
  const tier = bandTierFor(band);
  const corpus = corpusFor(prompt.course);
  const criterionCount = Math.min(3, Math.max(1, Math.round(prompt.totalMarks / 2)));

  // Split totalMarks into criterionCount parts, then distribute the awarded
  // mark across them without ever exceeding a part's maximum.
  const maxima: number[] = [];
  let remainingMax = prompt.totalMarks;
  for (let i = 0; i < criterionCount; i++) {
    const share =
      i === criterionCount - 1 ? remainingMax : Math.ceil(remainingMax / (criterionCount - i));
    maxima.push(share);
    remainingMax -= share;
  }

  let remainingMark = mark;
  const criteria: EvaluationCriterion[] = maxima.map((maxMark, i) => {
    const awarded = Math.min(maxMark, remainingMark);
    remainingMark -= awarded;
    return {
      criterion: `Criterion ${i + 1}`,
      mark: awarded,
      maxMark,
      feedback: DEMO_CRITERION_FEEDBACK[tier][i % DEMO_CRITERION_FEEDBACK[tier].length],
    };
  });

  const strengths = DEMO_STRENGTHS[tier];
  const improvements = corpus.improvements[tier];

  return {
    overallMark: mark,
    overallBand: band,
    overallFeedback: pick(rand, corpus.feedback[tier]),
    quickTip: pick(rand, DEMO_QUICK_TIPS[tier]),
    strengths: strengths.slice(0, Math.min(strengths.length, intBetween(rand, 1, 3))),
    improvements: improvements.slice(0, Math.min(improvements.length, intBetween(rand, 1, 2))),
    criteria,
  };
};

/** Derives profile stats from a student's attempts (XP, level, streak, averages). */
const deriveStats = (attempts: DemoAttempt[], rand: () => number): UserStats => {
  const words = attempts.reduce((sum, a) => sum + a.wordCount, 0);
  const bands = attempts.map((a) => a.band);
  const averageBand = bands.length
    ? Number((bands.reduce((s, b) => s + b, 0) / bands.length).toFixed(2))
    : 0;
  // The app's own award rule, not a second copy of it. This file used to be
  // the ONLY place the progression existed, and the profile modal drew its
  // meter against a different curve entirely — so a seeded student on 465 XP
  // was shown as Level 5 and "9% to next level" by a bar that disagreed with
  // the arithmetic that produced the 5.
  const xp = attempts.reduce((sum, a) => sum + xpForEvaluation(a.band), 0);
  // `Number.isFinite(MAX_SAFE_INTEGER)` is true, so a sentinel would sail
  // through the guard below and produce a timestamp ~10^23 ms in the past.
  const mostRecent = attempts.length ? Math.min(...attempts.map((a) => a.daysAgo)) : 0;

  return {
    xp,
    level: levelForXp(xp),
    questionsAnswered: attempts.length,
    totalWordsWritten: words,
    averageBand,
    markShareMean: attempts.length
      ? Number(
          (
            attempts.reduce((s, a) => s + (a.totalMarks > 0 ? a.mark / a.totalMarks : 0), 0) /
            attempts.length
          ).toFixed(4)
        )
      : 0,
    markShareCount: attempts.length,
    // Relative to the run time, like every other date in the cohort.
    lastActive: Date.now() - mostRecent * 86_400_000,
    // A streak cannot outlast the days a student was active on. Capped so a
    // newcomer with two attempts in one week does not show a 9-day streak.
    streakDays: Math.min(
      intBetween(rand, 1, 12),
      Math.max(1, new Set(attempts.map((a) => a.daysAgo)).size)
    ),
  };
};

/**
 * Generates the whole cohort. Deterministic for a given `seed` and prompt list.
 *
 * Each student's PRNG is seeded from the base seed plus their index, so adding
 * a student at the end of the list does not reshuffle everyone before them. Each
 * student draws only from the courses they study (`DemoStudentSpec.courses`); a
 * student with no `courses` draws from every question given.
 */
export const generateCohort = ({
  prompts,
  seed = DEMO_SEED,
  weeks = TOTAL_WEEKS,
  students = DEMO_STUDENTS,
}: GenerateCohortOptions): DemoCohort => {
  if (!prompts.length) {
    throw new Error('generateCohort: prompts must not be empty');
  }

  const attempts: DemoAttempt[] = [];
  const stats: Record<string, UserStats> = {};
  const dailyCalls: Record<string, Record<number, number>> = {};

  students.forEach((student, studentIndex) => {
    const rand = mulberry32(seed + studentIndex * 7919);
    const archetype = ARCHETYPES[student.archetype];
    // Rounded to whole attempts. At the default scale of 1 this is the archetype's
    // own volume, so existing students draw exactly the same PRNG sequence as before.
    const weeklyVolume = Math.max(
      1,
      Math.round(archetype.weeklyVolume * (student.volumeScale ?? 1))
    );
    const lanes = lanesFor(student, prompts);
    // One lane is drawn from as it stands; with several, each draw picks a course
    // first. Either way exactly the same PRNG calls as a single pool would make.
    const drawPrompt = (): DemoPromptRef => {
      const lane = lanes.length === 1 ? lanes[0] : pick(rand, lanes);
      return pick(rand, lane);
    };
    const mine: DemoAttempt[] = [];
    const calls: Record<number, number> = {};

    for (let week = archetype.startWeek ?? 0; week < weeks; week++) {
      const volume = Math.max(1, weeklyVolume + intBetween(rand, -1, 1));
      // Within a single week a student works through different questions, but
      // across the term they may revisit one — which is how a student actually
      // improves, and what the append-only `response_events` history is for.
      // `responses` keeps only the latest attempt per (student, prompt); see
      // `latestPerPrompt`.
      const thisWeek = new Set<string>();

      for (let i = 0; i < volume; i++) {
        // Draw a prompt not already attempted this week; if the pool is too
        // small to offer one, take the repeat rather than dropping the slot —
        // silently generating fewer attempts would thin out the later weeks
        // and break the band trends the demo exists to show.
        let prompt = drawPrompt();
        for (let tries = 0; tries < 12 && thisWeek.has(prompt.id); tries++) {
          prompt = drawPrompt();
        }
        thisWeek.add(prompt.id);

        const tier = tierOfPrompt(prompt);

        // Attainment scales the MARK, and the band is read back off that mark.
        //
        // It used to scale the BAND — ceiling × attainment, then markForBand() —
        // which walked straight into the degeneracy the rest of the codebase
        // exists to avoid. The Verb Gate caps a tier-1 question at band 1, so the
        // target band was always 1 whatever the archetype asked for, and
        // markForBand(1, …) returns the SMALLEST mark reaching band 1: every
        // student scored exactly 1 mark on every tier-1 question. Measured:
        //
        //   tier 1, 3 marks:  0.2→1/3  0.4→1/3  0.6→1/3  0.8→1/3  1.0→1/3
        //   tier 2, 6 marks:  0.2→1/6  0.4→1/6  0.6→1/6  0.8→4/6  1.0→4/6
        //
        // On the bundled Enterprise Computing bank that is 33 of 82 questions
        // (18 tier-1, 15 tier-2) where the archetypes were indistinguishable —
        // and the cohort heatmap's whole purpose is telling students apart. It
        // produced a flat, sometimes inverted, first two columns for everyone.
        //
        // Marks are well defined at every tier; bands are not. Scaling the mark
        // and reading the band off it keeps the invariant that matters — band
        // logic is still never recomputed here, so the stored mark/band pair
        // cannot contradict getBandForMark — while leaving a signal the Verb Gate
        // does not flatten.
        const attainment = archetype.targetAttainment(week, tier);
        const mark = Math.max(
          1,
          Math.min(prompt.totalMarks, Math.round(prompt.totalMarks * attainment))
        );
        const band = getBandForMark(mark, prompt.totalMarks, tier);

        const draft = pick(rand, corpusFor(prompt.course).drafts[bandTierFor(band)]).replace(
          /\{topic\}/g,
          prompt.topicName
        );

        // Newest week ends today; spread attempts across the week's days.
        const daysAgo = (weeks - 1 - week) * 7 + intBetween(rand, 0, 6);

        const attempt: DemoAttempt = {
          username: student.username,
          promptId: prompt.id,
          daysAgo,
          draft,
          wordCount: countWords(draft),
          mark,
          totalMarks: prompt.totalMarks,
          band,
          evaluation: buildEvaluation(rand, prompt, mark, band),
        };
        mine.push(attempt);
        calls[daysAgo] = (calls[daysAgo] ?? 0) + 1;
      }
    }

    mine.sort((a, b) => b.daysAgo - a.daysAgo); // oldest first
    attempts.push(...mine);
    stats[student.username] = deriveStats(mine, rand);
    dailyCalls[student.username] = calls;
  });

  attempts.sort((a, b) => b.daysAgo - a.daysAgo);
  return { students, attempts, stats, dailyCalls };
};

/**
 * The subset of attempts that belongs in `responses` — the most recent attempt
 * per (student, prompt).
 *
 * `responses` carries a unique index on (user_id, prompt_id) and documents
 * itself as holding the *latest* attempt, with the full per-attempt history
 * living in `response_events`. Feeding it the raw attempt list would make the
 * seed's row count depend on Postgres upsert ordering; selecting the latest
 * here makes it explicit and testable.
 */
export const latestPerPrompt = (attempts: DemoAttempt[]): DemoAttempt[] => {
  const latest = new Map<string, DemoAttempt>();
  for (const attempt of attempts) {
    // U+0000 as the separator: it cannot occur in a username or a prompt id,
    // so no pair of fields can collide by concatenating differently. Written
    // as an ESCAPE, never as a literal NUL byte — a raw control character
    // makes the whole file read as binary, and ripgrep then silently skips
    // it in every content search.
    const key = `${attempt.username}\u0000${attempt.promptId}`;
    const held = latest.get(key);
    // Lower daysAgo = more recent.
    if (!held || attempt.daysAgo < held.daysAgo) latest.set(key, attempt);
  }
  return [...latest.values()];
};

/** Flattens a course tree (the app's `Course` JSON shape) into a prompt pool. */
export const promptPoolFromCourse = (
  course: {
    topics?: Array<{
      name: string;
      subTopics?: Array<{
        dotPoints?: Array<{
          prompts?: Array<{ id: string; question: string; verb?: PromptVerb; totalMarks?: number }>;
        }>;
      }>;
    }>;
  },
  /** The course key to stamp on every question (see `DemoPromptRef.course`). */
  courseKey?: string
): DemoPromptRef[] => {
  const pool: DemoPromptRef[] = [];
  for (const topic of course.topics ?? []) {
    for (const sub of topic.subTopics ?? []) {
      for (const dp of sub.dotPoints ?? []) {
        for (const p of dp.prompts ?? []) {
          // A question worth no marks cannot produce a band; skip it rather
          // than seeding an attempt that renders as band 1 for no reason.
          if (!p.totalMarks || p.totalMarks <= 0) continue;
          pool.push({
            id: p.id,
            question: p.question,
            verb: p.verb,
            totalMarks: p.totalMarks,
            topicName: topic.name,
            ...(courseKey ? { course: courseKey } : {}),
          });
        }
      }
    }
  }
  return pool;
};
