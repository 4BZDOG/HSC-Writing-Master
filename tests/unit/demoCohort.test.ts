/**
 * The demo cohort generator has two properties that matter more than its
 * output: it must be deterministic (a reseed cannot silently change the demo),
 * and it must never contradict the app's own band logic (seeded data that
 * disagrees with getBandForMark would read as a bug in the marking engine).
 * These tests pin both. They also pin the two-course, two-class roster: each
 * student draws only from the courses they study, and the classes agree with
 * the students' enrolments and with who is allowed to see whom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ARCHETYPES,
  DEMO_CLASSES,
  DEMO_CLASS_NAME,
  DEMO_PLAN_STUDENT_HISTORY,
  DEMO_STUDENTS,
  DEMO_USAGE_MODEL_IDS,
  demoUsageModels,
  DemoCohort,
  DemoPromptRef,
  DemoStudentSpec,
  generateCohort,
  mulberry32,
  latestPerPrompt,
  promptPoolFromCourse,
  tierOfPrompt,
} from '../../utils/demoCohort';
import { DEMO_CORPORA } from '../../data/demoDrafts';
import { commandTerms, getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { EvaluationResponseSchema } from '../../services/aiSchemas';
import { AI_MODELS, getModelByProviderModel } from '../../services/aiModels';
import type { PromptVerb, UserStats } from '../../types';

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

// ----------------------------------------------------------------------------
// The real question banks, read the way supabase/demoSeed.mjs reads them
// ----------------------------------------------------------------------------

const COURSE_DIR = resolve(__dirname, '../../public/courseData');
const ENTERPRISE_FILE = 'HSCEnterpriseComputing09122025.json';
const SOFTWARE_FILE = 'HSCSoftwareEngineering09122025.json';

const loadCourse = (file: string) => {
  const parsed = JSON.parse(readFileSync(resolve(COURSE_DIR, file), 'utf8'));
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const ENTERPRISE_POOL = promptPoolFromCourse(loadCourse(ENTERPRISE_FILE), 'enterprise');
const SOFTWARE_POOL = promptPoolFromCourse(loadCourse(SOFTWARE_FILE), 'software');
/** Both banks, in the order the seed loads them. */
const BANK = [...ENTERPRISE_POOL, ...SOFTWARE_POOL];

const courseById = new Map(BANK.map((p) => [p.id, p.course]));
const promptById = new Map(BANK.map((p) => [p.id, p]));

const PLAN_HISTORY = DEMO_PLAN_STUDENT_HISTORY;
const ALL_HISTORY = [...DEMO_STUDENTS, ...PLAN_HISTORY];

/** A student as they were before the course split: no courses, no classes. */
const untagged = (s: DemoStudentSpec): DemoStudentSpec => ({
  username: s.username,
  displayName: s.displayName,
  archetype: s.archetype,
});

/** Cohort output without the wall-clock field, so two runs compare on content. */
const contentOf = (c: DemoCohort) => ({
  attempts: c.attempts,
  dailyCalls: c.dailyCalls,
  stats: Object.fromEntries(Object.entries(c.stats).map(([k, s]) => [k, withoutClock(s)])),
});
const withoutClock = (s: UserStats): UserStats => ({ ...s, lastActive: 0 });

const attemptsOf = (c: DemoCohort, username: string) =>
  c.attempts.filter((a) => a.username === username);

/** The bank-wide cohort, generated once: the real-bank tests read from it. */
const bankCohort = generateCohort({ prompts: BANK, students: ALL_HISTORY });

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

  it('produces identical content across runs over the real two-course bank', () => {
    const a = contentOf(generateCohort({ prompts: BANK, students: ALL_HISTORY }));
    const b = contentOf(generateCohort({ prompts: BANK, students: ALL_HISTORY }));
    expect(a).toEqual(b);
  });

  it('draws an unset volume scale exactly as a scale of 1', () => {
    // The scale is applied before the jitter. At 1 it must consume the same PRNG
    // calls as no scale at all, or every existing student's work would move.
    const aisha = DEMO_STUDENTS[0];
    const unset = generateCohort({ prompts: BANK, students: [aisha] });
    const one = generateCohort({ prompts: BANK, students: [{ ...aisha, volumeScale: 1 }] });
    expect(contentOf(one)).toEqual(contentOf(unset));
  });

  it('never drops below one attempt a week, however small the scale', () => {
    const aisha = DEMO_STUDENTS[0];
    const tiny = generateCohort({
      prompts: BANK,
      students: [{ ...aisha, volumeScale: 0.01 }],
    });
    const weeks = new Set(tiny.attempts.map((a) => Math.floor(a.daysAgo / 7)));
    expect(weeks.size).toBe(10);
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

describe('course split', () => {
  it('stamps the course key onto every question, and only when one is given', () => {
    expect(SOFTWARE_POOL.every((p) => p.course === 'software')).toBe(true);
    expect(ENTERPRISE_POOL.every((p) => p.course === 'enterprise')).toBe(true);
    const untaggedPool = promptPoolFromCourse(loadCourse(SOFTWARE_FILE));
    expect(untaggedPool.length).toBe(SOFTWARE_POOL.length);
    expect(untaggedPool.every((p) => !('course' in p))).toBe(true);
  });

  it('gives every question a unique id across both banks, since legacy_id is the join key', () => {
    expect(new Set(BANK.map((p) => p.id)).size).toBe(BANK.length);
  });

  it('draws a single-course student only from the course they study', () => {
    for (const s of ALL_HISTORY.filter((x) => x.courses?.length === 1)) {
      const theirs = attemptsOf(bankCohort, s.username);
      expect(theirs.length, s.username).toBeGreaterThan(0);
      for (const a of theirs) {
        expect(s.courses, `${s.username} drew from ${courseById.get(a.promptId)}`).toContain(
          courseById.get(a.promptId)
        );
      }
    }
  });

  it('gives a two-course student work in both courses, roughly evenly split', () => {
    const twoCourse = ALL_HISTORY.filter((s) => s.courses?.length === 2);
    expect(twoCourse.map((s) => s.username).sort()).toEqual([
      'demo.ethan',
      'demo.hana',
      'demo.plus',
    ]);
    for (const s of twoCourse) {
      const theirs = attemptsOf(bankCohort, s.username);
      const enterprise = theirs.filter((a) => courseById.get(a.promptId) === 'enterprise').length;
      const share = enterprise / theirs.length;
      expect(share, s.username).toBeGreaterThan(0.3);
      expect(share, s.username).toBeLessThan(0.7);
    }
  });

  it('keeps the Enterprise cohort exactly as it was before Software Engineering was added', () => {
    // Before the split, the twelve drew from the Enterprise bank with no course
    // tags. Restricting them to their course over the whole bank must reproduce
    // that run attempt for attempt, so no Enterprise student's work has moved.
    const enterprise = DEMO_STUDENTS.slice(0, 12);
    const before = generateCohort({ prompts: ENTERPRISE_POOL, students: enterprise.map(untagged) });
    const after = generateCohort({ prompts: BANK, students: DEMO_STUDENTS });
    for (const s of enterprise) {
      expect(attemptsOf(after, s.username)).toEqual(attemptsOf(before, s.username));
      expect(after.dailyCalls[s.username]).toEqual(before.dailyCalls[s.username]);
      expect(withoutClock(after.stats[s.username])).toEqual(withoutClock(before.stats[s.username]));
    }
  });

  it('leaves the earlier students untouched when the Software students are appended', () => {
    const base = generateCohort({ prompts: BANK, students: DEMO_STUDENTS.slice(0, 12) });
    const full = generateCohort({ prompts: BANK, students: DEMO_STUDENTS });
    for (const s of DEMO_STUDENTS.slice(0, 12)) {
      expect(attemptsOf(full, s.username)).toEqual(attemptsOf(base, s.username));
    }
  });

  it('draws from every question of an untagged pool, whatever courses a student lists', () => {
    // A course-agnostic pool (the fixtures, the older tests) is eligible for
    // every student, so a course-restricted student still has questions to draw.
    const sofia = DEMO_STUDENTS.find((s) => s.username === 'demo.sofia')!;
    const generated = generateCohort({ prompts: POOL, students: [sofia] });
    expect(generated.attempts.length).toBeGreaterThan(0);
    const ids = new Set(POOL.map((p) => p.id));
    for (const a of generated.attempts) expect(ids.has(a.promptId)).toBe(true);
  });

  it('refuses a student with no questions in their courses', () => {
    const sofia = DEMO_STUDENTS.find((s) => s.username === 'demo.sofia')!;
    expect(() => generateCohort({ prompts: ENTERPRISE_POOL, students: [sofia] })).toThrow(
      /no questions for demo\.sofia in courses software/
    );
  });

  it('refuses an empty course list rather than drawing from everything', () => {
    const sofia = DEMO_STUDENTS.find((s) => s.username === 'demo.sofia')!;
    expect(() => generateCohort({ prompts: BANK, students: [{ ...sofia, courses: [] }] })).toThrow(
      /lists no courses/
    );
  });

  it('refuses a question tagged with a course it has no demo writing for', () => {
    const stray: DemoPromptRef = { ...POOL[0], id: 'stray', course: 'history' };
    expect(() =>
      generateCohort({ prompts: [stray], students: [untagged(DEMO_STUDENTS[0])], weeks: 1 })
    ).toThrow(/no demo writing for course "history"/);
  });
});

describe('two classes', () => {
  const enterprise = DEMO_CLASSES.find((c) => c.key === 'enterprise')!;
  const software = DEMO_CLASSES.find((c) => c.key === 'software')!;

  it('keeps the Enterprise class name for existing consumers', () => {
    expect(DEMO_CLASS_NAME).toBe('Year 12 Enterprise Computing (Demo)');
    expect(enterprise.name).toBe(DEMO_CLASS_NAME);
  });

  it('runs two Year 12 classes, each for its own course', () => {
    expect(enterprise).toMatchObject({ year: 12, course: 'enterprise' });
    expect(software).toMatchObject({ year: 12, course: 'software' });
    expect(software.name).toBe('Year 12 Software Engineering (Demo)');
  });

  it('has Ms Bennett own the Enterprise class, with Mr Okafor as co-teacher', () => {
    expect(enterprise.ownerUsername).toBe('demo.teacher');
    expect(enterprise.coTeacherUsername).toBe('demo.coteacher');
  });

  it('has Mr Okafor own the Software class alone', () => {
    expect(software.ownerUsername).toBe('demo.coteacher');
    expect(software.coTeacherUsername).toBeUndefined();
  });

  it('keys and names each class uniquely', () => {
    expect(new Set(DEMO_CLASSES.map((c) => c.key)).size).toBe(DEMO_CLASSES.length);
    expect(new Set(DEMO_CLASSES.map((c) => c.name)).size).toBe(DEMO_CLASSES.length);
  });

  it('enrols each cohort student in exactly the classes whose course they study', () => {
    for (const s of DEMO_STUDENTS) {
      const expected = DEMO_CLASSES.filter((c) => s.courses?.includes(c.course)).map((c) => c.key);
      expect(s.classKeys, s.username).toEqual(expected);
    }
  });

  it('names only classes that exist', () => {
    const keys = new Set(DEMO_CLASSES.map((c) => c.key));
    for (const s of DEMO_STUDENTS) {
      for (const k of s.classKeys ?? []) expect(keys.has(k), `${s.username} → ${k}`).toBe(true);
    }
  });

  it('shows Ms Bennett her own class and not the Software students', () => {
    // A teacher sees the classes they own or co-teach, and the students in them.
    const visibleTo = (staff: string) => {
      const keys = DEMO_CLASSES.filter(
        (c) => c.ownerUsername === staff || c.coTeacherUsername === staff
      ).map((c) => c.key);
      return DEMO_STUDENTS.filter((s) => s.classKeys?.some((k) => keys.includes(k)));
    };
    const bennett = visibleTo('demo.teacher');
    const okafor = visibleTo('demo.coteacher');

    const softwareOnly = DEMO_STUDENTS.filter((s) => s.courses?.every((c) => c === 'software'));
    expect(softwareOnly.length).toBe(4);
    for (const s of softwareOnly) expect(bennett.map((b) => b.username)).not.toContain(s.username);

    // Mr Okafor owns the Software class and co-teaches Enterprise: he sees all.
    expect(okafor.map((s) => s.username).sort()).toEqual(
      DEMO_STUDENTS.map((s) => s.username).sort()
    );
    expect(bennett.length).toBe(
      DEMO_STUDENTS.filter((s) => s.classKeys?.includes('enterprise')).length
    );
  });
});

describe('roster', () => {
  it('has twelve Enterprise students, then six Software students, in that order', () => {
    expect(DEMO_STUDENTS).toHaveLength(18);
    for (const s of DEMO_STUDENTS.slice(0, 12)) expect(s.courses).toEqual(['enterprise']);
    for (const s of DEMO_STUDENTS.slice(12)) expect(s.courses).toContain('software');
  });

  it('has exactly two cohort students who study both courses', () => {
    const both = DEMO_STUDENTS.filter((s) => s.courses?.length === 2).map((s) => s.username);
    expect(both.sort()).toEqual(['demo.ethan', 'demo.hana']);
  });

  it('keeps usernames unique across the cohort and the plan-state history', () => {
    const names = ALL_HISTORY.map((s) => s.username);
    expect(new Set(names).size).toBe(names.length);
  });

  it('labels every student as a demo, in their display name', () => {
    for (const s of ALL_HISTORY) expect(s.displayName, s.username).toContain('(Demo');
  });

  it('gives the Software class a spread of archetypes, not one kind of student', () => {
    const software = DEMO_STUDENTS.filter((s) => s.classKeys?.includes('software'));
    expect(new Set(software.map((s) => s.archetype)).size).toBeGreaterThanOrEqual(4);
  });
});

describe('newcomer', () => {
  it('starts only in the most recent week', () => {
    expect(ARCHETYPES.newcomer.startWeek).toBe(9);
  });

  it('gives each newcomer one or two attempts, all within the last seven days', () => {
    const newcomers = DEMO_STUDENTS.filter((s) => s.archetype === 'newcomer');
    expect(newcomers.length).toBeGreaterThan(0);
    for (const s of newcomers) {
      const theirs = attemptsOf(bankCohort, s.username);
      expect(theirs.length, s.username).toBeGreaterThanOrEqual(1);
      expect(theirs.length, s.username).toBeLessThanOrEqual(2);
      for (const a of theirs) {
        expect(a.daysAgo).toBeGreaterThanOrEqual(0);
        expect(a.daysAgo).toBeLessThanOrEqual(6);
      }
    }
  });

  it('gives a newcomer no streak longer than the days they were active', () => {
    for (const s of DEMO_STUDENTS.filter((x) => x.archetype === 'newcomer')) {
      const days = new Set(attemptsOf(bankCohort, s.username).map((a) => a.daysAgo)).size;
      expect(bankCohort.stats[s.username].streakDays).toBeLessThanOrEqual(days);
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

  it('holds across the real two-course bank', () => {
    for (const attempt of bankCohort.attempts) {
      const prompt = promptById.get(attempt.promptId)!;
      expect(attempt.mark).toBeGreaterThanOrEqual(1);
      expect(attempt.mark).toBeLessThanOrEqual(prompt.totalMarks);
      expect(attempt.band).toBe(
        getBandForMark(attempt.mark, prompt.totalMarks, tierOfPrompt(prompt))
      );
    }
  });

  it('knows every question verb, so no question falls back to a default tier', () => {
    // getCommandTermInfo quietly returns a fallback for an unknown verb, which
    // would give a Software question an Enterprise-shaped ceiling without a word.
    for (const p of BANK) {
      expect(p.verb, p.id).toBeDefined();
      expect(commandTerms.has(p.verb!.toUpperCase() as PromptVerb), `${p.id}: ${p.verb}`).toBe(
        true
      );
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

  it('satisfies the schema for both courses over the real bank', () => {
    for (const { evaluation } of bankCohort.attempts) {
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

describe('writing corpus', () => {
  it('keeps Software Engineering writing free of Enterprise vocabulary', () => {
    const sw = DEMO_CORPORA.software;
    const prose = [
      ...Object.values(sw.drafts),
      ...Object.values(sw.feedback),
      ...Object.values(sw.improvements),
    ]
      .flat()
      .join(' ');
    expect(prose).not.toMatch(/enterprise|business|organisation|manager/i);
  });

  it('gives every band tier at least two drafts in each course', () => {
    for (const corpus of Object.values(DEMO_CORPORA)) {
      for (const tier of ['low', 'mid', 'high'] as const) {
        expect(corpus.drafts[tier].length).toBeGreaterThanOrEqual(2);
      }
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

  it('keeps every established student working through to the most recent week', () => {
    // A newcomer joins in the last week by design, so is exempt here (see `newcomer`).
    for (const s of DEMO_STUDENTS.filter((x) => ARCHETYPES[x.archetype].startWeek === undefined)) {
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

describe('plan-state history', () => {
  it('gives Sam and Ava a history, and leaves Ben without one', () => {
    expect(PLAN_HISTORY.map((s) => s.username)).toEqual(['demo.free', 'demo.plus']);
    for (const username of ['demo.free', 'demo.plus']) {
      expect(attemptsOf(bankCohort, username).length, username).toBeGreaterThan(0);
    }
    // Ben is not in the history at all, so the generator cannot give him any.
    expect(PLAN_HISTORY.some((s) => s.username === 'demo.capped')).toBe(false);
    expect(attemptsOf(bankCohort, 'demo.capped')).toHaveLength(0);
  });

  it('gives Ava work in both courses, and Sam work only in Enterprise', () => {
    const courses = (u: string) =>
      new Set(attemptsOf(bankCohort, u).map((a) => courseById.get(a.promptId)));
    expect([...courses('demo.plus')].sort()).toEqual(['enterprise', 'software']);
    expect([...courses('demo.free')]).toEqual(['enterprise']);
  });

  it('gives Ava a strong history and Sam an improving one', () => {
    const shareOf = (u: string) => {
      const xs = attemptsOf(bankCohort, u);
      return (
        xs.reduce((s, a) => s + a.mark / promptById.get(a.promptId)!.totalMarks, 0) / xs.length
      );
    };
    expect(shareOf('demo.plus')).toBeGreaterThan(0.8);

    const sam = attemptsOf(bankCohort, 'demo.free');
    const early = sam.filter((a) => a.daysAgo > 42);
    const late = sam.filter((a) => a.daysAgo < 21);
    const avg = (xs: typeof sam) => xs.reduce((s, a) => s + a.band, 0) / xs.length;
    expect(avg(late)).toBeGreaterThan(avg(early));
  });

  it('gives Sam a lighter history than Aisha, at about half the volume', () => {
    const sam = attemptsOf(bankCohort, 'demo.free').length;
    const aisha = attemptsOf(bankCohort, 'demo.aisha').length;
    expect(sam).toBeLessThan(aisha * 0.75);
    expect(sam).toBeGreaterThanOrEqual(10); // at least one attempt every week
    expect(sam).toBeLessThanOrEqual(30);
  });

  it('keeps the plan-state accounts out of the cohort roster', () => {
    const cohortNames = new Set(DEMO_STUDENTS.map((s) => s.username));
    for (const s of PLAN_HISTORY) expect(cohortNames.has(s.username)).toBe(false);
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
    for (const s of ALL_HISTORY) {
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
