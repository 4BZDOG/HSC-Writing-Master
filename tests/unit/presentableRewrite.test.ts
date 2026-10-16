import { describe, it, expect } from 'vitest';
import { presentableRewrite } from '../../components/feedback/rewriteText';

/**
 * The rewrite as this client may show it, read the same way by the report, its
 * footer and the PDF. A plan without answer upgrades gets nothing, whatever the
 * cached result still holds.
 */
describe('presentableRewrite', () => {
  it('shows a rewrite the plan covers, with the edits the marker made', () => {
    const out = presentableRewrite(
      { text: 'Lifted answer.', mark: 5, band: 5, keyChanges: ['Named the term'] },
      false
    );
    expect(out).toEqual({ text: 'Lifted answer.', keyChanges: ['Named the term'] });
  });

  it('reads a plain-string rewrite as text with no edits listed', () => {
    expect(presentableRewrite('Plain rewrite.', false)).toEqual({
      text: 'Plain rewrite.',
      keyChanges: [],
    });
  });

  it('withholds the rewrite and its edits while the plan does not cover them', () => {
    const out = presentableRewrite(
      { text: 'Paid text.', mark: 5, band: 5, keyChanges: ['Paid edit'] },
      true
    );
    expect(out).toEqual({ text: '', keyChanges: [] });
  });

  it('is empty when there was no rewrite at all', () => {
    expect(presentableRewrite(undefined, false)).toEqual({ text: '', keyChanges: [] });
    expect(presentableRewrite('', false)).toEqual({ text: '', keyChanges: [] });
  });
});
