import { describe, it, expect } from 'vitest';
import { nextDailyReset, dailyResetPhrase, dailyResetTime } from '../../utils/dailyReset';

/**
 * The free tier's allowance is metered on a UTC day, and said in the reader's
 * own clock. These pin the translation between the two.
 */

describe('nextDailyReset', () => {
  it('is the next UTC midnight, not the next local one', () => {
    const now = new Date('2026-09-20T13:45:00.000Z');
    expect(nextDailyReset(now).toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('moves to the following day once a boundary is reached', () => {
    // Exactly on the boundary the day HAS reset, so the next one is 24h out.
    const now = new Date('2026-09-20T00:00:00.000Z');
    expect(nextDailyReset(now).toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('crosses a month end correctly', () => {
    const now = new Date('2026-09-30T23:59:59.000Z');
    expect(nextDailyReset(now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('the phrase a student reads', () => {
  it('names a clock time and whether it is today or tomorrow', () => {
    const phrase = dailyResetPhrase(new Date('2026-09-20T13:45:00.000Z'));
    expect(phrase).toMatch(/^(midnight|midnight tonight|\d{1,2}:\d{2} [ap]m (today|tomorrow))$/);
  });

  it('never says "UTC" — the whole point is that the reader does not have to convert', () => {
    expect(dailyResetPhrase(new Date('2026-09-20T13:45:00.000Z'))).not.toMatch(/utc/i);
    expect(dailyResetTime(new Date('2026-09-20T13:45:00.000Z'))).not.toMatch(/utc/i);
  });

  it('gives the time alone for a sentence that carries its own "every day"', () => {
    const at = new Date('2026-09-20T13:45:00.000Z');
    // The time-only form is the phrase minus the today/tomorrow word, so the
    // two can never quote different clock times at the same reader.
    expect(dailyResetPhrase(at).startsWith(dailyResetTime(at))).toBe(true);
    expect(dailyResetTime(at)).not.toMatch(/today|tomorrow/);
  });
});
