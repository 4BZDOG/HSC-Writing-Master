import { describe, it, expect } from 'vitest';
import {
  collectStrategyDetail,
  groupStrategyMoves,
  isCaveatMove,
  parseStrategyTip,
  splitMethodMoves,
  type TipMove,
} from '../../utils/strategyTip';
import { commandTermsList } from '../../data/commandTerms';

const move = (text: string): TipMove => ({ text, detail: [] });

describe('groupStrategyMoves', () => {
  it('attaches a term list or template to the line that introduces it', () => {
    const moves = groupStrategyMoves(
      parseStrategyTip(
        'Use a point-by-point structure:\n"X is... whereas Y is..."\nMake each difference precise.'
      )
    );
    expect(moves.map((m) => m.text)).toEqual([
      'Use a point-by-point structure:',
      'Make each difference precise.',
    ]);
    expect(moves[0].detail).toEqual([{ kind: 'example', text: '"X is... whereas Y is..."' }]);
    expect(moves[1].detail).toEqual([]);
  });

  it('returns nothing for an absent tip', () => {
    expect(groupStrategyMoves(parseStrategyTip(''))).toEqual([]);
  });
});

describe('isCaveatMove', () => {
  it('reads a cost or a restriction as a caveat', () => {
    expect(isCaveatMove(move('Explanations waste time and earn zero extra marks.'))).toBe(true);
    expect(isCaveatMove(move("Facts alone don't explain — connections do."))).toBe(true);
    expect(isCaveatMove(move('No working shown = no marks, even if the answer is right.'))).toBe(
      true
    );
    expect(isCaveatMove(move('Your job is to be convincing, not balanced.'))).toBe(true);
  });

  it('reads an instruction to take as a step', () => {
    expect(isCaveatMove(move('Make each difference unmistakable and precise.'))).toBe(false);
    expect(isCaveatMove(move('End with a clear call to action.'))).toBe(false);
    expect(isCaveatMove(move('Clear section headings help the marker follow your logic.'))).toBe(
      false
    );
  });
});

describe('splitMethodMoves', () => {
  it('leads with the first move, whatever it says', () => {
    const { method, watch } = splitMethodMoves([move("Don't just list."), move('Then explain.')]);
    expect(method.map((m) => m.text)).toEqual(["Don't just list.", 'Then explain.']);
    expect(watch).toEqual([]);
  });

  it('numbers further steps after the lead and sets the caveats apart', () => {
    const moves = [
      move('Use a point-by-point structure:'),
      move('Make each difference unmistakable and precise.'),
      move('Explanations waste time and earn zero extra marks.'),
      move('End with a clear call to action.'),
    ];
    const { method, watch } = splitMethodMoves(moves);
    expect(method.map((m) => m.text)).toEqual([
      'Use a point-by-point structure:',
      'Make each difference unmistakable and precise.',
      'End with a clear call to action.',
    ]);
    expect(watch.map((m) => m.text)).toEqual([
      'Explanations waste time and earn zero extra marks.',
    ]);
  });

  it('returns nothing for a tip with no moves', () => {
    expect(splitMethodMoves([])).toEqual({ method: [], watch: [] });
  });
});

describe('collectStrategyDetail', () => {
  it('gathers the term lists and templates across every move, once each term', () => {
    const moves = groupStrategyMoves(
      parseStrategyTip(
        'Chain every sentence with linking words:\nbecause, leads to, results in, therefore.\n' +
          'Facts alone don\'t explain.\nUse a balanced structure:\n"Both X and Y..."\n' +
          'Keep it tight:\nbecause, therefore, thus.'
      )
    );
    const detail = collectStrategyDetail(moves);
    expect(detail.terms).toEqual(['because', 'leads to', 'results in', 'therefore', 'thus']);
    expect(detail.examples).toEqual(['"Both X and Y..."']);
  });

  it('is empty for a tip with no lists or templates', () => {
    const detail = collectStrategyDetail(groupStrategyMoves(parseStrategyTip('Just name it.')));
    expect(detail).toEqual({ terms: [], examples: [] });
  });
});

describe('the classification across every real tip', () => {
  it('never loses a move, and always leads with the first', () => {
    for (const term of commandTermsList) {
      const moves = groupStrategyMoves(parseStrategyTip(term.tip));
      const { method, watch } = splitMethodMoves(moves);
      expect(method.length + watch.length, term.term).toBe(moves.length);
      if (moves.length > 0) expect(method[0], term.term).toBe(moves[0]);
    }
  });
});
