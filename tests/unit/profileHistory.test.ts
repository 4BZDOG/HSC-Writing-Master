import { describe, it, expect } from 'vitest';
import {
  bandRowY,
  bandSeries,
  formatAttemptWhen,
  formatVerbLabel,
  legacyHistoryNotice,
  markShare,
  plotPoints,
  recentAttempts,
  scoredOldestFirst,
  toOwnAttempts,
  verbAggregates,
  withStatDefaults,
  type OwnAttempt,
  type OwnEventRow,
} from '../../utils/profileHistory';

const at = (day: number, hour = 9) =>
  `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;

const attempt = (overrides: Partial<OwnAttempt> = {}): OwnAttempt => ({
  at: at(1),
  band: 3,
  mark: 3,
  totalMarks: 6,
  verb: 'EXPLAIN',
  wordCount: 120,
  ...overrides,
});

describe('toOwnAttempts (the response_events rows the profile reads)', () => {
  it('maps the question embed, whether PostgREST sends an object or an array', () => {
    const rows: OwnEventRow[] = [
      {
        mark: 4,
        band: 3,
        word_count: 90,
        created_at: at(2),
        prompts: { verb: 'explain', total_marks: 6 },
      },
      {
        mark: 2,
        band: 2,
        word_count: 40,
        created_at: at(3),
        prompts: [{ verb: 'DEFINE', total_marks: 2 }],
      },
    ];
    const out = toOwnAttempts(rows);
    expect(out[0]).toEqual({
      at: at(2),
      band: 3,
      mark: 4,
      totalMarks: 6,
      verb: 'EXPLAIN',
      wordCount: 90,
    });
    expect(out[1].verb).toBe('DEFINE');
  });

  it('keeps an attempt whose question has gone, as unknown rather than dropping it', () => {
    const [a] = toOwnAttempts([
      { mark: 3, band: 3, word_count: 10, created_at: at(4), prompts: null },
    ]);
    expect(a.verb).toBeNull();
    expect(a.totalMarks).toBeNull();
    expect(a.mark).toBe(3);
  });

  it('treats a question with zero marks as having no total', () => {
    const [a] = toOwnAttempts([
      {
        mark: 3,
        band: 3,
        word_count: 10,
        created_at: at(4),
        prompts: { verb: 'EXPLAIN', total_marks: 0 },
      },
    ]);
    expect(a.totalMarks).toBeNull();
  });

  it('drops a row with no usable timestamp, and writes no NaN for a bad number', () => {
    const out = toOwnAttempts([
      { mark: 3, band: 3, word_count: 10, created_at: 'not a date', prompts: null },
      { mark: Number.NaN, band: Number.NaN, word_count: -5, created_at: at(5), prompts: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].band).toBeNull();
    expect(out[0].mark).toBeNull();
    expect(out[0].wordCount).toBe(0);
  });
});

describe('markShare', () => {
  it('is the share of the question’s marks earned', () => {
    expect(markShare(attempt({ mark: 4, totalMarks: 8 }))).toBe(0.5);
  });

  it('clamps a mark above the total, which would otherwise sort as the strongest', () => {
    expect(markShare(attempt({ mark: 9, totalMarks: 6 }))).toBe(1);
  });

  it('is unknown when either side is unknown', () => {
    expect(markShare(attempt({ mark: null }))).toBeNull();
    expect(markShare(attempt({ totalMarks: null }))).toBeNull();
  });
});

describe('ordering and selection', () => {
  const shuffled = [
    attempt({ at: at(5), band: 4 }),
    attempt({ at: at(1), band: 2 }),
    attempt({ at: at(3), band: null }),
    attempt({ at: 'garbage', band: 6 }),
    attempt({ at: at(2), band: 3 }),
  ];

  it('puts scored attempts oldest first whatever order they arrive in', () => {
    expect(scoredOldestFirst(shuffled).map((a) => a.band)).toEqual([2, 3, 4]);
  });

  it('caps the band series to the most recent points, still oldest first', () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      attempt({
        at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
        band: (i % 6) + 1,
      })
    );
    const series = bandSeries(many);
    expect(series).toHaveLength(100);
    expect(series[0].at).toBe(many[50].at);
    expect(series[99].at).toBe(many[149].at);
  });

  it('lists the newest scored attempts first, up to the limit', () => {
    const recent = recentAttempts(shuffled, 2);
    expect(recent.map((a) => a.band)).toEqual([4, 3]);
    expect(recentAttempts(shuffled, 0)).toEqual([]);
  });
});

describe('verbAggregates (fed to the same tier fold as the admin view)', () => {
  it('averages bands per verb and marks only where marks exist', () => {
    const out = verbAggregates([
      attempt({ verb: 'EXPLAIN', band: 2, mark: 3, totalMarks: 6 }),
      attempt({ verb: 'EXPLAIN', band: 4, mark: null, totalMarks: null }),
      attempt({ verb: 'DEFINE', band: 2, mark: 2, totalMarks: 2 }),
    ]);
    const explain = out.find((r) => r.label === 'EXPLAIN');
    expect(explain).toEqual({ label: 'EXPLAIN', attempts: 2, avg_band: 3, avg_mark_frac: 0.5 });
    expect(out.find((r) => r.label === 'DEFINE')?.avg_mark_frac).toBe(1);
  });

  it('files a question with no verb under UNSPECIFIED, and skips unscored attempts', () => {
    const out = verbAggregates([
      attempt({ verb: null, band: 3 }),
      attempt({ verb: 'EXPLAIN', band: null }),
    ]);
    expect(out).toEqual([{ label: 'UNSPECIFIED', attempts: 1, avg_band: 3, avg_mark_frac: 0.5 }]);
  });
});

describe('the band ladder geometry', () => {
  it('puts band 6 at the top padding and band 1 at the bottom', () => {
    expect(bandRowY(6, 240, 20)).toBe(20);
    expect(bandRowY(1, 240, 20)).toBe(220);
  });

  it('clamps a band outside the ladder onto it', () => {
    expect(bandRowY(0, 240, 20)).toBe(bandRowY(1, 240, 20));
    expect(bandRowY(9, 240, 20)).toBe(bandRowY(6, 240, 20));
  });

  it('spaces many points evenly across the width and centres a single one', () => {
    const many = plotPoints([1, 2, 3, 4], { width: 600, height: 240, padX: 14, padY: 20 });
    expect(many[0].x).toBe(14);
    expect(many[3].x).toBe(586);
    const one = plotPoints([4], { width: 600, height: 240, padX: 14, padY: 20 });
    expect(one).toHaveLength(1);
    expect(one[0].x).toBe(300);
  });

  it('never returns a non-finite coordinate', () => {
    const pts = plotPoints([3, Number.NaN, Number.POSITIVE_INFINITY, 5], {
      width: 600,
      height: 240,
      padX: 14,
      padY: 20,
    });
    expect(pts).toHaveLength(2);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(plotPoints([], { width: 600, height: 240, padX: 14, padY: 20 })).toEqual([]);
  });
});

describe('labels', () => {
  it('reads a stored verb as a sentence-case word, and a missing one as a state', () => {
    expect(formatVerbLabel('EXPLAIN')).toBe('Explain');
    expect(formatVerbLabel('CRITICALLY EVALUATE')).toBe('Critically evaluate');
    expect(formatVerbLabel(null)).toBe('No command verb');
    expect(formatVerbLabel('UNSPECIFIED')).toBe('No command verb');
  });

  it('formats an attempt time, and an em dash for a stamp it cannot read', () => {
    expect(formatAttemptWhen(at(7, 14))).toMatch(/\d/);
    expect(formatAttemptWhen(at(7, 14))).not.toMatch(/Invalid|NaN/);
    expect(formatAttemptWhen('nonsense')).toBe('—');
  });
});

describe('withStatDefaults', () => {
  it('gives a profile with no stats zeros, and level one', () => {
    const s = withStatDefaults(undefined);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.questionsAnswered).toBe(0);
    expect(s.markShareMean).toBeUndefined();
  });

  it('replaces non-finite numbers rather than passing NaN into the figures', () => {
    const s = withStatDefaults({ xp: Number.NaN, streakDays: Number.NaN, averageBand: 2.5 });
    expect(s.xp).toBe(0);
    expect(s.streakDays).toBe(0);
    expect(s.averageBand).toBe(2.5);
  });

  it('keeps the mark share as stored, since it is optional by design', () => {
    const s = withStatDefaults({ markShareMean: 0.8, markShareCount: 5 });
    expect(s.markShareMean).toBe(0.8);
    expect(s.markShareCount).toBe(5);
  });
});

describe('legacyHistoryNotice (answers the totals count but no history row records)', () => {
  it('says how many earlier answers there are, and that they are not listed', () => {
    expect(legacyHistoryNotice(25)).toBe(
      'Your 25 earlier answers were marked before attempt history was kept, so they are not listed here. New answers will appear from now on.'
    );
  });

  it('reads one answer as one answer', () => {
    expect(legacyHistoryNotice(1)).toBe(
      'Your 1 earlier answer was marked before attempt history was kept, so it is not listed here. New answers will appear from now on.'
    );
  });

  it('never writes a negative or fractional count', () => {
    expect(legacyHistoryNotice(-3)).toMatch(/^Your 0 earlier answers/);
    expect(legacyHistoryNotice(2.9)).toMatch(/^Your 2 earlier answers/);
  });
});
