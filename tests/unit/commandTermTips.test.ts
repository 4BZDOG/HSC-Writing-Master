import { describe, it, expect } from 'vitest';
import {
  collectStrategyDetail,
  displayStepText,
  groupStrategyMoves,
  parseStrategyTip,
  splitMethodMoves,
} from '../../utils/strategyTip';
import { commandTermsList } from '../../data/commandTerms';

/** The moves a tip parses to, split the way the card shows them. */
const split = (tip: string) => {
  const moves = groupStrategyMoves(parseStrategyTip(tip));
  return { moves, ...splitMethodMoves(moves) };
};

describe('command term tips', () => {
  it.each(commandTermsList.map((term) => [term.term, term.tip]))(
    '%s: one method and exactly one "Don\'t" caveat, last',
    (_name, tip) => {
      const { method, watch } = split(tip);
      expect(method.length, 'method steps').toBeGreaterThanOrEqual(1);
      expect(watch, 'watch-for moves').toHaveLength(1);
      expect(watch[0].text).toMatch(/^Don't /);
      expect(tip.split('\n').filter((line) => line.trim().startsWith("Don't"))).toHaveLength(1);
      expect(tip.trim().split('\n').pop()?.trim().startsWith("Don't")).toBe(true);
    }
  );

  it.each(commandTermsList.map((term) => [term.term, term.tip]))(
    '%s: no method step shows a dangling colon',
    (_name, tip) => {
      const { method } = split(tip);
      for (const move of method) {
        expect(displayStepText(move.text)).not.toMatch(/:\s*$/);
      }
    }
  );

  it.each(commandTermsList.map((term) => [term.term, term.tip]))(
    '%s: keeps to the house punctuation (no em dash, no "=", no slang)',
    (_name, tip) => {
      expect(tip).not.toContain('—');
      expect(tip).not.toContain('=');
      expect(tip).not.toMatch(/brain dump/i);
    }
  );

  it.each(commandTermsList.map((term) => [term.term, term.tip]))(
    '%s: templates put a space before the ellipsis',
    (_name, tip) => {
      expect(tip).not.toMatch(/\S\.\.\./);
    }
  );

  it('gives INVESTIGATE no word chips: its outline is the shape of a report, not words to write with', () => {
    const investigate = commandTermsList.find((term) => term.term === 'INVESTIGATE');
    expect(investigate).toBeDefined();
    expect(collectStrategyDetail(split(investigate!.tip).moves).terms).toEqual([]);
  });

  it.each(['RECOUNT', 'CONTRAST', 'EXPLAIN'])('gives %s word chips', (verb) => {
    const term = commandTermsList.find((t) => t.term === verb);
    expect(term).toBeDefined();
    expect(collectStrategyDetail(split(term!.tip).moves).terms.length).toBeGreaterThanOrEqual(3);
  });
});
