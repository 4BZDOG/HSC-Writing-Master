import { describe, it, expect } from 'vitest';
import {
  XP_PER_LEVEL,
  applyEvaluation,
  averageMarkPercent,
  levelForXp,
  levelProgress,
  xpForEvaluation,
} from '../../utils/progression';
import type { UserStats } from '../../types';

/**
 * The profile's numbers had two problems, and this module exists for both.
 *
 * The curve lived only in the demo seed, and the modal drew its meter against
 * a different one — so a seeded student on 465 XP was labelled Level 5 by the
 * seed and "9% to next level" by the modal, when the rule that produced the 5
 * puts them 65% of the way to 6.
 *
 * And for a real account none of it ever moved: every stat was initialised to
 * zero and never written again, so the profile was a permanent zero-state.
 */

const blank: UserStats = {
  xp: 0,
  level: 1,
  questionsAnswered: 0,
  totalWordsWritten: 0,
  averageBand: 0,
  streakDays: 0,
  lastActive: 0,
};

describe('the award rule', () => {
  it('pays for turning up, and a little more for doing well', () => {
    expect(xpForEvaluation(1)).toBe(10);
    expect(xpForEvaluation(3)).toBe(10);
    expect(xpForEvaluation(4)).toBe(15);
    expect(xpForEvaluation(6)).toBe(25);
  });

  it('rewards practice over talent, which is the behaviour the product wants', () => {
    // Ten Band 2 answers beat three Band 6 ones.
    const diligent = 10 * xpForEvaluation(2);
    const gifted = 3 * xpForEvaluation(6);
    expect(diligent).toBeGreaterThan(gifted);
  });
});

describe('levels and the meter', () => {
  it('starts at level 1 and advances every XP_PER_LEVEL', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelForXp(XP_PER_LEVEL)).toBe(2);
    expect(levelForXp(465)).toBe(5);
  });

  it('measures progress through the CURRENT level, not through all of history', () => {
    // The old meter divided lifetime XP by `level * 1000`, so 465 XP read as
    // 9% — and got LESS encouraging the better a student did.
    const p = levelProgress(465);
    expect(p.into).toBe(65);
    expect(p.needed).toBe(XP_PER_LEVEL);
    expect(p.percent).toBe(65);
    expect(p.nextLevel).toBe(6);
  });

  it('agrees with the level it is counting towards', () => {
    for (const xp of [0, 5, 99, 100, 101, 465, 1234]) {
      expect(levelProgress(xp).nextLevel).toBe(levelForXp(xp) + 1);
    }
  });

  it('never reports a negative or runaway meter', () => {
    expect(levelProgress(-50).percent).toBe(0);
    expect(levelForXp(-50)).toBe(1);
    expect(levelProgress(1e9).percent).toBeLessThanOrEqual(100);
  });
});

describe('folding one marked answer into a profile', () => {
  it('counts the answer, the words, and the XP', () => {
    const after = applyEvaluation(blank, { band: 4, wordCount: 320 });
    expect(after.questionsAnswered).toBe(1);
    expect(after.totalWordsWritten).toBe(320);
    expect(after.xp).toBe(15);
    expect(after.level).toBe(1);
  });

  it('keeps a true running mean of the band, without storing every result', () => {
    let stats = blank;
    for (const band of [6, 3, 3]) stats = applyEvaluation(stats, { band, wordCount: 100 });
    expect(stats.questionsAnswered).toBe(3);
    expect(stats.averageBand).toBe(4);
  });

  it('levels up once the XP crosses the boundary', () => {
    let stats = blank;
    // 10 answers at Band 3 = 100 XP = level 2.
    for (let i = 0; i < 10; i++) stats = applyEvaluation(stats, { band: 3, wordCount: 10 });
    expect(stats.xp).toBe(100);
    expect(stats.level).toBe(2);
  });

  it('leaves the streak alone — that is the auth service’s to keep', () => {
    const after = applyEvaluation({ ...blank, streakDays: 4 }, { band: 5, wordCount: 10 });
    expect(after.streakDays).toBe(4);
  });

  it('survives a result with nothing usable in it', () => {
    const after = applyEvaluation(blank, { band: NaN, wordCount: NaN });
    expect(after.questionsAnswered).toBe(1);
    expect(after.totalWordsWritten).toBe(0);
    expect(Number.isFinite(after.averageBand)).toBe(true);
    expect(Number.isFinite(after.xp)).toBe(true);
  });
});

/**
 * A band is capped by the question's command verb, so an average of bands told
 * a student earning every mark on DESCRIBE questions that they were "averaging
 * Band 2.0 — room to grow". The share of each question's own marks is fair to
 * every question.
 */
describe('the share of the marks on offer', () => {
  it('averages each answer against its own question', () => {
    let stats = applyEvaluation(blank, { band: 2, wordCount: 90, mark: 4, totalMarks: 4 });
    stats = applyEvaluation(stats, { band: 4, wordCount: 200, mark: 4, totalMarks: 8 });
    expect(averageMarkPercent(stats)).toBe(75);
    expect(stats.markShareCount).toBe(2);
  });

  it('full marks on a capped question is 100%, whatever its band', () => {
    const stats = applyEvaluation(blank, { band: 2, wordCount: 90, mark: 4, totalMarks: 4 });
    expect(averageMarkPercent(stats)).toBe(100);
    expect(stats.averageBand).toBe(2);
  });

  it('starts from nothing on a profile that predates it, rather than guessing', () => {
    const older: UserStats = { ...blank, questionsAnswered: 30, averageBand: 3.1 };
    expect(averageMarkPercent(older)).toBeNull();
    const after = applyEvaluation(older, { band: 3, wordCount: 100, mark: 3, totalMarks: 6 });
    expect(averageMarkPercent(after)).toBe(50);
    expect(after.markShareCount).toBe(1);
  });

  it('leaves the share alone when the marks are not known', () => {
    const after = applyEvaluation(blank, { band: 3, wordCount: 100 });
    expect(averageMarkPercent(after)).toBeNull();
  });
});
