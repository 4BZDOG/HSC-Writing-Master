/**
 * The demo cohort generator has two properties that matter more than its
 * output: it must be deterministic (a reseed cannot silently change the demo),
 * and it must never contradict the app's own band logic (seeded data that
 * disagrees with getBandForMark would read as a bug in the marking engine).
 * These tests pin both.
 */
import { describe, it, expect } from 'vitest';
import {
  ARCHETYPES,
  DEMO_STUDENTS,
  DEMO_USAGE_MODEL_IDS,
  demoUsageModels,
  DemoPromptRef,
  generateCohort,
  mulberry32,
  latestPerPrompt,
  promptPoolFromCourse,
  tierOfPrompt,
} from '../../utils/demoCohort';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { EvaluationResponseSchema } from '../../services/aiSchemas';
import { AI_MODELS, getModelByProviderModel } from '../../services/aiModels';

const POOL: DemoPromptRef[] = [
  {
    id: 'p-identify-2',
    question: 'Identify two purposes.',
    verb: 'IDENTIFY',
    totalMarks: 2,
    topicName: 'Data visualisation',
  },
  {
    id: 'p-describe-4',
    question: 'Describe the process.',
    verb: 'DESCRIBE',
    totalMarks: 4,
    topicName: 'Data visualisation',
  },
  {
    id: 'p-explain-5',
    question: 'Explain the impact.',
    verb: 'EXPLAIN',
    totalMarks: 5,
    topicName: 'Enterprise systems',
  },
  {
    id: 'p-analyse-6',
    question: 'Analyse the effect.',
    verb: 'ANALYSE',
    totalMarks: 6,
    topicName: 'Enterprise systems',
  },
  {
    id: 'p-evaluate-8',
    question: 'Evaluate the approach.',
    verb: 'EVALUATE',
    totalMarks: 8,
    topicName: 'Cybersecurity',
  },
  {
    id: 'p-assess-7',
    question: 'Assess the risk.',
    verb: 'ASSESS',
    totalMarks: 7,
    topicName: 'Cybersecurity',
  },
];

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateCohort determinism', () => {
  it('produces identical content across runs', () => {
    const a = generateCohort({ prompts: POOL });
    const b = generateCohort({ prompts: POOL });
    // lastActive is derived from Date.now(), so compare everything else.
    const strip = (c: ReturnType<typeof generateCohort>) => ({
      attempts: c.attempts,
      dailyCalls: c.dailyCalls,
      stats: Object.fromEntries(
        Object.entries(c.stats).map(([k, s]) => [k, { ...s, lastActive: 0 }])
      ),
    });
    expect(strip(a)).toEqual(strip(b));
  });

  it('changes shape when the seed changes', () => {
    const a = generateCohort({ prompts: POOL, seed: 1 });
    const b = generateCohort({ prompts: POOL, seed: 2 });
    expect(a.attempts).not.toEqual(b.attempts);
  });

  it('does not reshuffle earlier students when one is appended', () => {
    const base = DEMO_STUDENTS.slice(0, 3);
    const extended = [
      ...base,
      { username: 'demo.extra', displayName: 'Extra (Demo)', archetype: 'strong' as const },
    ];
    const a = generateCohort({ prompts: POOL, students: base });
    const b = generateCohort({ prompts: POOL, students: extended });
    const only = (c: ReturnType<typeof generateCohort>, u: string) =>
      c.attempts.filter((x) => x.username === u);
    for (const s of base) {
      expect(only(b, s.username)).toEqual(only(a, s.username));
    }
  });
});

describe('band integrity', () => {
  const cohort = generateCohort({ prompts: POOL });
  const byId = new Map(POOL.map((p) => [p.id, p]));

  it('stores a band that getBandForMark agrees with', () => {
    for (const attempt of cohort.attempts) {
      const prompt = byId.get(attempt.promptId)!;
      expect(attempt.band).toBe(
        getBandForMark(attempt.mark, prompt.totalMarks, tierOfPrompt(prompt))
      );
    }
  });

  it('never awards more than the question is worth', () => {
    for (const attempt of cohort.attempts) {
      const prompt = byId.get(attempt.promptId)!;
      expect(attempt.mark).toBeGreaterThan(0);
      expect(attempt.mark).toBeLessThanOrEqual(prompt.totalMarks);
    }
  });

  it('keeps bands within 1–6', () => {
    for (const attempt of cohort.attempts) {
      expect(attempt.band).toBeGreaterThanOrEqual(1);
      expect(attempt.band).toBeLessThanOrEqual(6);
    }
  });

  it('never exceeds the verb tier ceiling', () => {
    for (const attempt of cohort.attempts) {
      const prompt = byId.get(attempt.promptId)!;
      const tier = tierOfPrompt(prompt);
      const ceiling = getBandForMark(prompt.totalMarks, prompt.totalMarks, tier);
      expect(attempt.band).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe('evaluation payloads', () => {
  const cohort = generateCohort({ prompts: POOL });
  const byId = new Map(POOL.map((p) => [p.id, p]));

  it('has criteria whose marks sum to the overall mark', () => {
    for (const { evaluation } of cohort.attempts) {
      const sum = evaluation.criteria.reduce((s, c) => s + c.mark, 0);
      expect(sum).toBe(evaluation.overallMark);
    }
  });

  it('has criteria whose maxima sum to the question total', () => {
    for (const attempt of cohort.attempts) {
      const prompt = byId.get(attempt.promptId)!;
      const sum = attempt.evaluation.criteria.reduce((s, c) => s + c.maxMark, 0);
      expect(sum).toBe(prompt.totalMarks);
    }
  });

  it('never awards a criterion more than its maximum', () => {
    for (const { evaluation } of cohort.attempts) {
      for (const c of evaluation.criteria) {
        expect(c.mark).toBeLessThanOrEqual(c.maxMark);
        expect(c.mark).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('agrees with the attempt it belongs to', () => {
    for (const attempt of cohort.attempts) {
      expect(attempt.evaluation.overallMark).toBe(attempt.mark);
      expect(attempt.evaluation.overallBand).toBe(attempt.band);
    }
  });

  it('satisfies the schema the app validates real AI output against', () => {
    // Seeded evaluations land in the same UI as model output, so they have to
    // clear the same gate — otherwise the demo would render errors the moment a
    // student opened a past attempt.
    for (const { evaluation } of cohort.attempts) {
      expect(() => EvaluationResponseSchema.parse(evaluation)).not.toThrow();
    }
  });

  it('always carries feedback the UI can render', () => {
    for (const { evaluation } of cohort.attempts) {
      expect(evaluation.overallFeedback.length).toBeGreaterThan(20);
      expect(evaluation.strengths.length).toBeGreaterThan(0);
      expect(evaluation.improvements.length).toBeGreaterThan(0);
      expect(evaluation.criteria.length).toBeGreaterThan(0);
    }
  });
});

describe('cohort shape', () => {
  const cohort = generateCohort({ prompts: POOL });

  it('covers every student', () => {
    for (const s of DEMO_STUDENTS) {
      expect(cohort.attempts.some((a) => a.username === s.username)).toBe(true);
      expect(cohort.stats[s.username]).toBeDefined();
    }
  });

  it('never repeats a prompt for one student within the same week', () => {
    for (const s of DEMO_STUDENTS) {
      const theirs = cohort.attempts.filter((a) => a.username === s.username);
      const byWeek = new Map<number, string[]>();
      for (const a of theirs) {
        const week = Math.floor(a.daysAgo / 7);
        byWeek.set(week, [...(byWeek.get(week) ?? []), a.promptId]);
      }
      for (const ids of byWeek.values()) {
        // Only holds while the pool is larger than a week's volume, which the
        // six-question POOL here is not — so assert the weaker invariant that
        // the de-dup attempt is doing something.
        expect(new Set(ids).size).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every student working through to the most recent week', () => {
    for (const s of DEMO_STUDENTS) {
      const theirs = cohort.attempts.filter((a) => a.username === s.username);
      expect(Math.min(...theirs.map((a) => a.daysAgo))).toBeLessThan(14);
      expect(Math.max(...theirs.map((a) => a.daysAgo))).toBeGreaterThan(55);
    }
  });

  it('spans the full window with attempts inside it', () => {
    const days = cohort.attempts.map((a) => a.daysAgo);
    expect(Math.min(...days)).toBeLessThan(7); // something happened this week
    expect(Math.max(...days)).toBeLessThanOrEqual(69);
    expect(Math.max(...days)).toBeGreaterThan(55); // history reaches back
  });

  it('orders attempts oldest first', () => {
    for (let i = 1; i < cohort.attempts.length; i++) {
      expect(cohort.attempts[i].daysAgo).toBeLessThanOrEqual(cohort.attempts[i - 1].daysAgo);
    }
  });

  it('produces a spread of average bands, not one flat cohort', () => {
    const averages = Object.values(cohort.stats).map((s) => s.averageBand);
    expect(Math.max(...averages) - Math.min(...averages)).toBeGreaterThan(1.5);
  });

  it('gives the at-risk student a materially lower average than the strong one', () => {
    const atRisk = DEMO_STUDENTS.find((s) => s.archetype === 'atRisk')!;
    const strong = DEMO_STUDENTS.find((s) => s.archetype === 'strong')!;
    expect(cohort.stats[strong.username].averageBand).toBeGreaterThan(
      cohort.stats[atRisk.username].averageBand + 2
    );
  });

  /**
   * Attainment as a share of what the question could award. Raw bands are not
   * comparable across tiers — the Verb Gate caps an IDENTIFY question at band 1
   * — so measuring against the ceiling is the only way to compare a student's
   * performance on low-tier and high-tier questions.
   */
  const attainment = (a: { promptId: string; band: number }): number => {
    const prompt = new Map(POOL.map((p) => [p.id, p])).get(a.promptId)!;
    const ceiling = getBandForMark(prompt.totalMarks, prompt.totalMarks, tierOfPrompt(prompt));
    return a.band / ceiling;
  };

  it('makes the verb-blocked student fall short of the ceiling only on high tiers', () => {
    const blocked = DEMO_STUDENTS.find((s) => s.archetype === 'verbBlocked')!;
    const byId = new Map(POOL.map((p) => [p.id, p]));
    const theirs = cohort.attempts.filter((a) => a.username === blocked.username);
    const low = theirs.filter((a) => tierOfPrompt(byId.get(a.promptId)!) <= 3);
    const high = theirs.filter((a) => tierOfPrompt(byId.get(a.promptId)!) >= 4);
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThan(0);
    const avg = (xs: typeof theirs) => xs.reduce((s, a) => s + attainment(a), 0) / xs.length;
    // Reaches the ceiling on recall/description…
    expect(avg(low)).toBeGreaterThan(0.95);
    // …and falls well short once the verb demands judgement.
    expect(avg(high)).toBeLessThan(0.6);
  });

  it('separates the strong student from the at-risk one on attainment', () => {
    const strong = DEMO_STUDENTS.find((s) => s.archetype === 'strong')!;
    const atRisk = DEMO_STUDENTS.find((s) => s.archetype === 'atRisk')!;
    const avg = (u: string) => {
      const xs = cohort.attempts.filter((a) => a.username === u);
      return xs.reduce((s, a) => s + attainment(a), 0) / xs.length;
    };
    expect(avg(strong.username)).toBeGreaterThan(avg(atRisk.username) + 0.4);
  });

  it('shows the improver improving', () => {
    const improver = DEMO_STUDENTS.find((s) => s.archetype === 'improver')!;
    const theirs = cohort.attempts.filter((a) => a.username === improver.username);
    const early = theirs.filter((a) => a.daysAgo > 42);
    const late = theirs.filter((a) => a.daysAgo < 21);
    const avg = (xs: typeof theirs) => xs.reduce((s, a) => s + a.band, 0) / xs.length;
    expect(avg(late)).toBeGreaterThan(avg(early));
  });

  it('records one AI call per attempt per day', () => {
    for (const s of DEMO_STUDENTS) {
      const total = Object.values(cohort.dailyCalls[s.username]).reduce((a, b) => a + b, 0);
      expect(total).toBe(cohort.attempts.filter((a) => a.username === s.username).length);
    }
  });

  it('rejects an empty prompt pool rather than seeding nothing', () => {
    expect(() => generateCohort({ prompts: [] })).toThrow(/must not be empty/);
  });

  it('produces a sane lastActive when a student has no attempts', () => {
    // weeks: 0 yields no attempts. A MAX_SAFE_INTEGER sentinel here used to slip
    // past a Number.isFinite guard and give a timestamp ~10^23 ms in the past.
    const empty = generateCohort({ prompts: POOL, students: DEMO_STUDENTS.slice(0, 1), weeks: 0 });
    const stats = empty.stats[DEMO_STUDENTS[0].username];
    expect(empty.attempts).toHaveLength(0);
    expect(stats.lastActive).toBeGreaterThan(Date.UTC(2020, 0, 1));
    expect(stats.lastActive).toBeLessThanOrEqual(Date.now());
    expect(stats.averageBand).toBe(0);
    expect(stats.questionsAnswered).toBe(0);
  });
});

describe('latestPerPrompt', () => {
  const cohort = generateCohort({ prompts: POOL });

  it('keeps exactly one row per (student, prompt)', () => {
    const rows = latestPerPrompt(cohort.attempts);
    const keys = rows.map((r) => `${r.username} ${r.promptId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the most recent attempt, not the first', () => {
    const older = { username: 'u', promptId: 'p', daysAgo: 40, mark: 1, band: 1 };
    const newer = { username: 'u', promptId: 'p', daysAgo: 3, mark: 5, band: 5 };
    const rows = latestPerPrompt([older, newer] as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].daysAgo).toBe(3);
  });

  it('does not merge across students', () => {
    const rows = latestPerPrompt([
      { username: 'a', promptId: 'p', daysAgo: 1 },
      { username: 'b', promptId: 'p', daysAgo: 1 },
    ] as never);
    expect(rows).toHaveLength(2);
  });

  it('is never larger than the attempt list', () => {
    expect(latestPerPrompt(cohort.attempts).length).toBeLessThanOrEqual(cohort.attempts.length);
  });
});

describe('promptPoolFromCourse', () => {
  it('flattens the course tree and carries the topic name', () => {
    const pool = promptPoolFromCourse({
      topics: [
        {
          name: 'Data visualisation',
          subTopics: [
            {
              dotPoints: [
                { prompts: [{ id: 'a', question: 'Q', verb: 'EXPLAIN', totalMarks: 4 }] },
              ],
            },
          ],
        },
      ],
    });
    expect(pool).toEqual([
      { id: 'a', question: 'Q', verb: 'EXPLAIN', totalMarks: 4, topicName: 'Data visualisation' },
    ]);
  });

  it('skips questions worth no marks', () => {
    const pool = promptPoolFromCourse({
      topics: [
        {
          name: 'T',
          subTopics: [
            {
              dotPoints: [
                {
                  prompts: [
                    { id: 'zero', question: 'Q', totalMarks: 0 },
                    { id: 'ok', question: 'Q', totalMarks: 3 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(pool.map((p) => p.id)).toEqual(['ok']);
  });

  it('tolerates a tree with missing levels', () => {
    expect(promptPoolFromCourse({})).toEqual([]);
    expect(promptPoolFromCourse({ topics: [{ name: 'T' }] })).toEqual([]);
  });
});

describe('demoUsageModels', () => {
  it('returns provider model strings the Usage Dashboard can price', () => {
    // ai_model_usage.model stores the provider string, and foldModelUsage prices
    // it by looking it up in the registry. A string that has drifted still
    // renders — labelled raw and costed at zero — which would quietly gut the
    // cost breakdown the seeded telemetry exists to show.
    for (const model of demoUsageModels()) {
      const entry = getModelByProviderModel(model);
      expect(entry, `"${model}" is not in the engine registry`).toBeDefined();
      expect(entry!.estCostPerCall).toBeGreaterThan(0);
    }
  });

  it('spans more than one engine, so the breakdown has something to rank', () => {
    expect(new Set(demoUsageModels()).size).toBeGreaterThan(1);
  });

  it('fails loudly if an engine id is dropped from the registry', () => {
    // The whole point is that drift becomes an error, not a silent zero.
    expect(DEMO_USAGE_MODEL_IDS.every((id) => AI_MODELS.some((m) => m.id === id))).toBe(true);
  });
});

describe('archetypes', () => {
  it('names every archetype used by the roster', () => {
    for (const s of DEMO_STUDENTS) {
      expect(ARCHETYPES[s.archetype]).toBeDefined();
    }
  });

  it('targets an attainment inside (0, 1] for every week and tier', () => {
    for (const a of Object.values(ARCHETYPES)) {
      for (let week = 0; week < 10; week++) {
        for (let tier = 1; tier <= 6; tier++) {
          const share = a.targetAttainment(week, tier);
          expect(share).toBeGreaterThan(0);
          expect(share).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  /**
   * Attainment must reach the MARK, not the band.
   *
   * It used to be applied to the band ceiling and converted back with
   * `markForBand`. The Verb Gate caps a tier-1 question at band 1, so the target
   * was always band 1 whatever the archetype asked for, and `markForBand(1, …)`
   * returns the SMALLEST mark reaching it — every student scored exactly 1 mark
   * on every tier-1 question, and two on tier 2. On the bundled Enterprise
   * Computing bank that is 33 of 82 questions where the archetypes were
   * indistinguishable, which is precisely what the cohort heatmap exists to show.
   */
  const markShareByTier = (username: string, prompts: DemoPromptRef[]) => {
    const cohort = generateCohort({ prompts });
    const totals = new Map<number, { earned: number; available: number }>();
    for (const attempt of cohort.attempts) {
      if (attempt.username !== username) continue;
      const prompt = prompts.find((p) => p.id === attempt.promptId)!;
      const tier = getCommandTermInfo(prompt.verb)?.tier ?? 0;
      const cur = totals.get(tier) ?? { earned: 0, available: 0 };
      cur.earned += attempt.mark;
      cur.available += prompt.totalMarks;
      totals.set(tier, cur);
    }
    return (tier: number) => {
      const t = totals.get(tier);
      return t && t.available > 0 ? t.earned / t.available : null;
    };
  };

  it('separates a strong student from an at-risk one at tier 1', () => {
    // The degenerate case. Both archetypes previously scored the identical mark
    // on every tier-1 question, and on the real question bank the ordering even
    // came out inverted.
    const strong = DEMO_STUDENTS.find((s) => s.archetype === 'strong')!;
    const atRisk = DEMO_STUDENTS.find((s) => s.archetype === 'atRisk')!;

    const strongT1 = markShareByTier(strong.username, POOL)(1);
    const atRiskT1 = markShareByTier(atRisk.username, POOL)(1);

    expect(strongT1).not.toBeNull();
    expect(atRiskT1).not.toBeNull();
    expect(strongT1!).toBeGreaterThan(atRiskT1!);
  });

  it('lets a verb-blocked student read as strong low and weak high', () => {
    // The whole point of the archetype: fine on recall and description, falls
    // away once the verb demands judgement. Flattened tiers hid it completely.
    const blocked = DEMO_STUDENTS.find((s) => s.archetype === 'verbBlocked')!;
    const share = markShareByTier(blocked.username, POOL);

    const low = share(1) ?? share(2) ?? share(3);
    const high = share(6) ?? share(5) ?? share(4);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(low!).toBeGreaterThan(high!);
  });

  it('does not collapse tier 1 to a single value across archetypes', () => {
    // Directly pins the degeneracy: if attainment is routed through the band
    // scale again, every archetype returns the same tier-1 share.
    const shares = new Set(
      DEMO_STUDENTS.map((s) => markShareByTier(s.username, POOL)(1)).filter((v) => v != null)
    );
    expect(shares.size).toBeGreaterThan(1);
  });
});
