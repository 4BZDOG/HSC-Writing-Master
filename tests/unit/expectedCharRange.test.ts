import { describe, it, expect } from 'vitest';
import {
  commandTermsList,
  getCommandTermInfo,
  getExpectedCharRange,
} from '../../data/commandTerms';

/**
 * The full-mark length a question is held to: by the live writing guide, the
 * marker's brief, the exemplar ladder and the rewrite ceiling.
 *
 * The 20-mark figures are pinned against NESA's 2012 Business Studies Question 26
 * standards samples (projectDocs/calibration-pilot.md): Band 5/6 responses ran to
 * about 4,400 characters, Band 4/5 to 3,200-4,800.
 */
describe('getExpectedCharRange', () => {
  it('is unchanged inside the verb’s own mark range', () => {
    const discuss = getCommandTermInfo('DISCUSS');
    expect(getExpectedCharRange(5, discuss)).toEqual([1500, 1550]);
    expect(getExpectedCharRange(10, discuss)).toEqual([2250, 3000]);
  });

  it('carries on in proportion past the verb’s top mark', () => {
    expect(getExpectedCharRange(20, getCommandTermInfo('DISCUSS'))).toEqual([4500, 6000]);
  });

  it('puts a real Band 5/6 extended response inside the full-mark range', () => {
    const [min, max] = getExpectedCharRange(20, getCommandTermInfo('DISCUSS'));
    // 17/20 is the Band 5/6 border; its share of the range brackets the samples' 4,400.
    expect((min * 17) / 20).toBeLessThan(4400);
    expect((max * 17) / 20).toBeGreaterThan(4400);
  });

  it('never shrinks as the marks rise, for any verb', () => {
    for (const term of commandTermsList) {
      let previous: [number, number] = [0, 0];
      for (let marks = 1; marks <= 25; marks++) {
        const range = getExpectedCharRange(marks, term);
        expect(range[0], `${term.term} ${marks}m min`).toBeGreaterThanOrEqual(previous[0]);
        expect(range[1], `${term.term} ${marks}m max`).toBeGreaterThanOrEqual(previous[1]);
        expect(range[1]).toBeGreaterThan(range[0]);
        previous = range;
      }
    }
  });
});
