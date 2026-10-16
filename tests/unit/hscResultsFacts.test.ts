import { describe, it, expect } from 'vitest';
import {
  HSC_BAND_SHARES,
  HSC_RESULTS_CHART,
  HSC_RESULTS_FACTS,
  HSC_RESULTS_YEAR,
} from '../../data/hscResultsFacts';

/**
 * The published HSC numbers behind the wait notes and the results chart.
 *
 * These pin what makes the data trustworthy when it is updated by hand each
 * year: the six pooled shares must account for every result (to rounding), and
 * every fact must say which year it is about and where it came from. The fact
 * text is also checked against the numbers it quotes, so a yearly update that
 * changes one without the other fails here rather than on a reader's screen.
 */

const shareOf = (band: number): number => {
  const row = HSC_BAND_SHARES.find((s) => s.band === band);
  if (!row) throw new Error(`no share for Band ${band}`);
  return row.share;
};

describe('HSC_BAND_SHARES', () => {
  it('lists Bands 1 to 6 once each, in order', () => {
    expect(HSC_BAND_SHARES.map((s) => s.band)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sums to 100 within rounding, so the strip covers every result', () => {
    const total = HSC_BAND_SHARES.reduce((sum, s) => sum + s.share, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.5);
  });

  it('has no negative share', () => {
    for (const { share } of HSC_BAND_SHARES) expect(share).toBeGreaterThanOrEqual(0);
  });
});

describe('HSC_RESULTS_FACTS', () => {
  it('has at least one fact', () => {
    expect(HSC_RESULTS_FACTS.length).toBeGreaterThan(0);
  });

  it.each(HSC_RESULTS_FACTS.map((f) => [f.id, f] as const))(
    '%s carries a year and at least one named source',
    (_id, fact) => {
      expect(Number.isInteger(fact.year)).toBe(true);
      expect(fact.year).toBeGreaterThanOrEqual(2000);
      expect(fact.sources.length).toBeGreaterThan(0);
      for (const source of fact.sources) {
        expect(source.label.trim().length).toBeGreaterThan(0);
        if (source.url !== undefined) expect(source.url).toMatch(/^https:\/\//);
      }
    }
  );

  it.each(HSC_RESULTS_FACTS.map((f) => [f.id, f] as const))(
    '%s is one or two plain sentences',
    (_id, fact) => {
      const sentences = fact.text.match(/[.!?](\s|$)/g)?.length ?? 0;
      expect(sentences).toBeGreaterThanOrEqual(1);
      expect(sentences).toBeLessThanOrEqual(2);
    }
  );

  it.each(HSC_RESULTS_FACTS.map((f) => [f.id, f] as const))(
    '%s is about all students, never the reader',
    (_id, fact) => {
      expect(fact.text).not.toMatch(/\byou(r|rs)?\b/i);
    }
  );

  it('has unique ids', () => {
    const ids = HSC_RESULTS_FACTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('quotes the pooled shares it states, not a rounder number', () => {
    const band6 = HSC_RESULTS_FACTS.find((f) => f.id === 'band6-about-one-in-ten');
    expect(band6?.text).toMatch(/about 1 in 10/);
    expect(shareOf(6)).toBeGreaterThanOrEqual(9);
    expect(shareOf(6)).toBeLessThanOrEqual(11);
    expect(band6?.text).toMatch(/Band 4 was the most common band/);
    const mostCommon = HSC_BAND_SHARES.reduce((a, b) => (b.share > a.share ? b : a));
    expect(mostCommon.band).toBe(4);
  });

  it('quotes Bands 3 to 5 as about four in five results', () => {
    const threeToFive = shareOf(3) + shareOf(4) + shareOf(5);
    expect(threeToFive).toBeGreaterThanOrEqual(78);
    expect(threeToFive).toBeLessThanOrEqual(82);
    const bandsFacts = HSC_RESULTS_FACTS.find((f) => f.id === 'bands-3-to-5');
    expect(bandsFacts?.text).toMatch(/about four in five/);
  });

  it('quotes Band 1 as the rarest and under 2%', () => {
    const rarest = HSC_BAND_SHARES.reduce((a, b) => (b.share < a.share ? b : a));
    expect(rarest.band).toBe(1);
    expect(shareOf(1)).toBeLessThan(2);
  });

  it('keeps an ATAR of 90 apart from a Band 6', () => {
    const atar = HSC_RESULTS_FACTS.find((f) => f.id === 'atar-is-a-rank');
    expect(atar?.text).toMatch(/An ATAR is a rank, not a mark/);
    expect(atar?.text).toMatch(/17\.3%/);
  });
});

describe('HSC_RESULTS_CHART', () => {
  it('is for the same year as the facts, and names its source', () => {
    expect(HSC_RESULTS_CHART.year).toBe(HSC_RESULTS_YEAR);
    expect(HSC_RESULTS_CHART.sources.length).toBeGreaterThan(0);
    expect(HSC_RESULTS_CHART.caption).toMatch(/not anyone’s mark/);
    expect(HSC_RESULTS_CHART.pooling).toMatch(/Pooled by us/);
  });
});
