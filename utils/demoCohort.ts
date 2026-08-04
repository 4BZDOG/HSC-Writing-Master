/**
 * Deterministic demo cohort generator.
 *
 * Builds a plausible term's worth of student activity — a class of twelve
 * students, ten weeks of attempts, marks, bands and AI feedback — so that every
 * feature depending on *accumulated* use has something to show: Class Insights,
 * Student Progress and its band-trend sparkline, the student roster, the Usage
 * Dashboard, XP/levels/streaks.
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
 *     `markForBand` / `getBandForMark` in data/commandTerms.ts, so seeded data
 *     cannot drift from the Verb Gate. A demo that contradicted the app's own
 *     band rules would be worse than no demo.
 *   - **Pure.** No I/O, no DB, no browser APIs — unit-testable, and safe to
 *     import from both Node and the bundle.
 */
import type { EvaluationCriterion, EvaluationResult, PromptVerb, UserStats } from '../types';
import { getBandForMark, getCommandTermInfo, markForBand } from '../data/commandTerms';
import { AI_MODELS } from '../services/aiModels';
import {
  DEMO_CRITERION_FEEDBACK,
  DEMO_DRAFTS,
  DEMO_FEEDBACK,
  DEMO_IMPROVEMENTS,
  DEMO_QUICK_TIPS,
  DEMO_STRENGTHS,
  bandTierFor,
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
  | 'atRisk';

export interface Archetype {
  id: ArchetypeId;
  /** Human-readable intent, surfaced in the seed script's summary output. */
  note: string;
  /** Attempts per week (before the PRNG's ±1 jitter). */
  weeklyVolume: number;
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
}

/**
 * The twelve students. First names only — a demo does not need surnames, and
 * omitting them removes any chance of colliding with a real person's full name.
 */
export const DEMO_STUDENTS: DemoStudentSpec[] = [
  { username: 'demo.aisha', displayName: 'Aisha (Demo)', archetype: 'improver' },
  { username: 'demo.tom', displayName: 'Tom (Demo)', archetype: 'improver' },
  { username: 'demo.priya', displayName: 'Priya (Demo)', archetype: 'improver' },
  { username: 'demo.jayden', displayName: 'Jayden (Demo)', archetype: 'plateaued' },
  { username: 'demo.mei', displayName: 'Mei (Demo)', archetype: 'plateaued' },
  { username: 'demo.harry', displayName: 'Harry (Demo)', archetype: 'plateaued' },
  { username: 'demo.olivia', displayName: 'Olivia (Demo)', archetype: 'verbBlocked' },
  { username: 'demo.noah', displayName: 'Noah (Demo)', archetype: 'verbBlocked' },
  { username: 'demo.zara', displayName: 'Zara (Demo)', archetype: 'sporadic' },
  { username: 'demo.liam', displayName: 'Liam (Demo)', archetype: 'sporadic' },
  { username: 'demo.chen', displayName: 'Chen (Demo)', archetype: 'strong' },
  { username: 'demo.kayla', displayName: 'Kayla (Demo)', archetype: 'atRisk' },
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
  verb?: string;
  totalMarks: number;
  /** Owning topic name — used to personalise the draft text. */
  topicName: string;
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
  const improvements = DEMO_IMPROVEMENTS[tier];

  return {
    overallMark: mark,
    overallBand: band,
    overallFeedback: pick(rand, DEMO_FEEDBACK[tier]),
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
  // 10 XP per attempt plus 5 per band above 3 — enough to put the cohort across
  // several levels so the profile modal shows a spread rather than all level 1.
  const xp = attempts.reduce((sum, a) => sum + 10 + Math.max(0, a.band - 3) * 5, 0);
  // `Number.isFinite(MAX_SAFE_INTEGER)` is true, so a sentinel would sail
  // through the guard below and produce a timestamp ~10^23 ms in the past.
  const mostRecent = attempts.length ? Math.min(...attempts.map((a) => a.daysAgo)) : 0;

  return {
    xp,
    level: Math.max(1, Math.floor(xp / 100) + 1),
    questionsAnswered: attempts.length,
    totalWordsWritten: words,
    averageBand,
    // Relative to the run time, like every other date in the cohort.
    lastActive: Date.now() - mostRecent * 86_400_000,
    streakDays: intBetween(rand, 1, 12),
  };
};

/**
 * Generates the whole cohort. Deterministic for a given `seed` and prompt list.
 *
 * Each student's PRNG is seeded from the base seed plus their index, so adding
 * a student at the end of DEMO_STUDENTS does not reshuffle everyone before them.
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
    const mine: DemoAttempt[] = [];
    const calls: Record<number, number> = {};

    for (let week = 0; week < weeks; week++) {
      const volume = Math.max(1, archetype.weeklyVolume + intBetween(rand, -1, 1));
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
        let prompt = pick(rand, prompts);
        for (let tries = 0; tries < 12 && thisWeek.has(prompt.id); tries++) {
          prompt = pick(rand, prompts);
        }
        thisWeek.add(prompt.id);

        const tier = tierOfPrompt(prompt);

        // Band logic is never recomputed here. The ceiling comes from the app's
        // own rule (full marks at this tier), the archetype's attainment scales
        // it to a target band, and the real band is read back off the mark that
        // target implies — so the stored mark/band pair can never contradict
        // getBandForMark.
        const ceiling = getBandForMark(prompt.totalMarks, prompt.totalMarks, tier);
        const target = Math.max(
          1,
          Math.min(ceiling, Math.round(ceiling * archetype.targetAttainment(week, tier)))
        );
        const mark = markForBand(target, prompt.totalMarks, tier);
        const band = getBandForMark(mark, prompt.totalMarks, tier);

        const draft = pick(rand, DEMO_DRAFTS[bandTierFor(band)]).replace(
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
export const promptPoolFromCourse = (course: {
  topics?: Array<{
    name: string;
    subTopics?: Array<{
      dotPoints?: Array<{
        prompts?: Array<{ id: string; question: string; verb?: string; totalMarks?: number }>;
      }>;
    }>;
  }>;
}): DemoPromptRef[] => {
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
          });
        }
      }
    }
  }
  return pool;
};
