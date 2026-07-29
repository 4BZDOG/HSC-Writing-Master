/**
 * Offline demo fixtures.
 *
 * The zero-setup path: `npm run dev`, sign in as one of the local mock accounts
 * (services/authService.ts) and find a profile that already has a term's worth
 * of activity behind it, rather than a blank level-1 account.
 *
 * **What this can and cannot do.** Offline the app persists only the user
 * profile (`users_store` in utils/storageUtils.ts) — there is no local
 * equivalent of the `responses` / `response_events` tables. So the fixture
 * populates XP, level, streak, questions answered, words written and average
 * band, and that is genuinely all it can populate. Class Insights, Student
 * Progress, the Usage Dashboard and the Review Queue read server-side RPCs and
 * will keep showing their "requires Supabase" empty states. Faking those
 * locally would mean mocking the RPC layer, which would demo the mock rather
 * than the product.
 *
 * The numbers come from the same generator as the Supabase seed
 * (utils/demoCohort.ts), so the two demo paths cannot tell different stories.
 */
import type { User, UserStats } from '../types';
import type { DemoPromptRef } from '../utils/demoCohort';

/**
 * A representative question mix used to derive offline stats.
 *
 * Deliberately not the user's real course library: this module runs inside
 * `login()`, before any course data is in scope, and only *aggregates* are
 * shown offline — no attempt is ever rendered against a specific question. The
 * mix spans tiers 1–6 so the derived average band reflects the same Verb Gate
 * ceilings the Supabase cohort is subject to.
 */
const FIXTURE_POOL: DemoPromptRef[] = [
  {
    id: 'fx-identify-2',
    question: 'Identify two purposes.',
    verb: 'IDENTIFY',
    totalMarks: 2,
    topicName: 'Data visualisation',
  },
  {
    id: 'fx-outline-3',
    question: 'Outline the process.',
    verb: 'OUTLINE',
    totalMarks: 3,
    topicName: 'Data visualisation',
  },
  {
    id: 'fx-describe-4',
    question: 'Describe the system.',
    verb: 'DESCRIBE',
    totalMarks: 4,
    topicName: 'Enterprise systems',
  },
  {
    id: 'fx-explain-5',
    question: 'Explain the impact.',
    verb: 'EXPLAIN',
    totalMarks: 5,
    topicName: 'Enterprise systems',
  },
  {
    id: 'fx-analyse-6',
    question: 'Analyse the effect.',
    verb: 'ANALYSE',
    totalMarks: 6,
    topicName: 'Cybersecurity',
  },
  {
    id: 'fx-assess-7',
    question: 'Assess the risk.',
    verb: 'ASSESS',
    totalMarks: 7,
    topicName: 'Cybersecurity',
  },
  {
    id: 'fx-evaluate-8',
    question: 'Evaluate the approach.',
    verb: 'EVALUATE',
    totalMarks: 8,
    topicName: 'Project management',
  },
];

/**
 * Which cohort student backs each mock account.
 *
 * The student account maps to an *improver* — the archetype whose ten-week climb
 * is the most useful thing to look at first. Staff accounts map to a plateaued
 * student purely so their own profile card is not empty; a teacher's interesting
 * data is their class's, not their own.
 */
const MOCK_ACCOUNT_PERSONAS: Record<string, string> = {
  user: 'demo.aisha',
  teacher: 'demo.jayden',
  admin: 'demo.jayden',
};

/**
 * Derives seeded stats for a mock account, or null when the account has no
 * persona (so the caller leaves it alone).
 *
 * The cohort module is imported dynamically: the draft corpus behind it is
 * prose, and it has no business in the main bundle for users who will never see
 * a demo account.
 */
export const demoStatsFor = async (username: string): Promise<UserStats | null> => {
  const persona = MOCK_ACCOUNT_PERSONAS[username.toLowerCase()];
  if (!persona) return null;

  const { generateCohort, DEMO_STUDENTS } = await import('../utils/demoCohort');
  const student = DEMO_STUDENTS.find((s) => s.username === persona);
  if (!student) return null;

  // Generate only the one student we need — the cohort is deterministic per
  // student, so a single-student run yields exactly the same numbers the full
  // Supabase seed would give that student.
  const cohort = generateCohort({ prompts: FIXTURE_POOL, students: [student] });
  return cohort.stats[persona] ?? null;
};

/**
 * Fills a freshly created mock profile with seeded history.
 *
 * Only ever called for a first-time login (see authService.mockLogin), so a
 * developer's own accumulated local work is never overwritten. Best-effort: if
 * anything fails the user still gets a working, empty profile — a demo
 * convenience must not be able to block sign-in.
 */
export const hydrateDemoProfile = async (user: User): Promise<User> => {
  try {
    const stats = await demoStatsFor(user.username);
    return stats ? { ...user, stats } : user;
  } catch (error) {
    console.warn('Demo fixture hydration skipped:', error);
    return user;
  }
};
