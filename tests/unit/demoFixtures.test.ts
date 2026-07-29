/**
 * The offline fixture path has one safety property that matters: it must never
 * overwrite a developer's own local profile, and it must never be able to block
 * sign-in. Both are pinned here, along with the guarantee that it produces the
 * same numbers as the Supabase cohort for the same student.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { demoStatsFor, hydrateDemoProfile } from '../../services/demoFixtures';
import { generateCohort, DEMO_STUDENTS } from '../../utils/demoCohort';
import type { User } from '../../types';

const baseUser = (username: string): User => ({
  username,
  role: 'user',
  displayName: 'Test',
  preferences: {
    defaultFocusMode: false,
    autoSave: true,
    highContrast: false,
    showTips: true,
    theme: 'dark',
  },
  stats: {
    xp: 0,
    level: 1,
    questionsAnswered: 0,
    totalWordsWritten: 0,
    averageBand: 0,
    lastActive: 0,
    streakDays: 1,
  },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('demoStatsFor', () => {
  it('returns stats for each known mock account', async () => {
    for (const username of ['user', 'teacher', 'admin']) {
      const stats = await demoStatsFor(username);
      expect(stats).not.toBeNull();
      expect(stats!.questionsAnswered).toBeGreaterThan(0);
      expect(stats!.totalWordsWritten).toBeGreaterThan(0);
      expect(stats!.averageBand).toBeGreaterThan(0);
      expect(stats!.level).toBeGreaterThanOrEqual(1);
    }
  });

  it('is case-insensitive, matching the mock login lookup', async () => {
    // lastActive is derived from Date.now() and can tick between the two calls.
    const upper = await demoStatsFor('USER');
    const lower = await demoStatsFor('user');
    expect({ ...upper, lastActive: 0 }).toEqual({ ...lower, lastActive: 0 });
  });

  it('returns null for an account with no persona', async () => {
    expect(await demoStatsFor('someone.else')).toBeNull();
  });

  it('agrees with the cohort generator for the same student', async () => {
    const stats = await demoStatsFor('user');
    const student = DEMO_STUDENTS.find((s) => s.username === 'demo.aisha')!;
    // Same student, same seed → same derived figures, whichever path ran.
    const direct = generateCohort({
      prompts: [
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
      ],
      students: [student],
    });
    expect(stats!.questionsAnswered).toBe(direct.stats['demo.aisha'].questionsAnswered);
    expect(stats!.xp).toBe(direct.stats['demo.aisha'].xp);
    expect(stats!.averageBand).toBe(direct.stats['demo.aisha'].averageBand);
  });

  it('is deterministic across calls', async () => {
    const a = await demoStatsFor('user');
    const b = await demoStatsFor('user');
    // streakDays and lastActive both come from the same deterministic run.
    expect({ ...a, lastActive: 0 }).toEqual({ ...b, lastActive: 0 });
  });
});

describe('hydrateDemoProfile', () => {
  it('fills in stats for a demo account', async () => {
    const hydrated = await hydrateDemoProfile(baseUser('user'));
    expect(hydrated.stats.questionsAnswered).toBeGreaterThan(0);
  });

  it('preserves every other field', async () => {
    const user = baseUser('user');
    const hydrated = await hydrateDemoProfile(user);
    expect(hydrated.username).toBe(user.username);
    expect(hydrated.role).toBe(user.role);
    expect(hydrated.displayName).toBe(user.displayName);
    expect(hydrated.preferences).toEqual(user.preferences);
  });

  it('does not mutate the profile it was given', async () => {
    const user = baseUser('user');
    await hydrateDemoProfile(user);
    expect(user.stats.questionsAnswered).toBe(0);
  });

  it('leaves an unknown account untouched', async () => {
    const user = baseUser('real.person');
    expect(await hydrateDemoProfile(user)).toEqual(user);
  });

  it('returns the original profile rather than throwing when generation fails', async () => {
    const user = baseUser('user');
    // A demo convenience must never be able to block sign-in.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.doMock('../../utils/demoCohort', () => {
      throw new Error('boom');
    });
    const hydrated = await hydrateDemoProfile(user);
    expect(hydrated).toBeDefined();
    expect(hydrated.username).toBe('user');
    vi.doUnmock('../../utils/demoCohort');
  });
});
