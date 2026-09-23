import { describe, it, expect } from 'vitest';
import { sentenceChanges, rewrittenSentenceCount } from '../../utils/textDiff';

/**
 * The printed report's "What changed" pairs each rewritten sentence with what
 * it became, and says how many of the student's sentences were rewritten.
 */
describe('sentenceChanges', () => {
  const ORIGINAL =
    'DNA replication is semi-conservative. First, helicase unwinds the double helix by breaking the hydrogen bonds between the bases. Then DNA polymerase adds nucleotides to each strand. This means replication makes copies of cells.';
  const REVISED =
    'DNA replication is semi-conservative: each daughter molecule keeps one parental strand. First, helicase unwinds the double helix by breaking the hydrogen bonds between complementary bases, exposing two template strands. Then DNA polymerase adds free nucleotides to each template. This means replication ensures continuity of genetic information.';

  /**
   * Words appended to the end of a sentence were credited to the sentence
   * AFTER it, which chained every edit to the next until the group spanned
   * three sentences and was dropped as a wholesale rewrite. The report then
   * said "2 of your 5 sentences rewritten" of a revision that touched all five.
   */
  it('keeps words added at the end of a sentence with that sentence', () => {
    const changes = sentenceChanges(ORIGINAL, REVISED);

    expect(changes.map((c) => c.before)).toEqual([
      'DNA replication is semi-conservative.',
      'First, helicase unwinds the double helix by breaking the hydrogen bonds between the bases.',
      'Then DNA polymerase adds nucleotides to each strand.',
      'This means replication makes copies of cells.',
    ]);
    expect(changes[1].after).toContain('exposing two template strands.');
    expect(rewrittenSentenceCount(ORIGINAL, changes)).toEqual({ rewritten: 4, total: 4 });
  });

  it('leaves untouched sentences out', () => {
    const changes = sentenceChanges(
      'Caching stores data. It is fast. Memory is limited.',
      'Caching stores frequently requested data. It is fast. Memory is limited.'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toBe('Caching stores data.');
  });
});
