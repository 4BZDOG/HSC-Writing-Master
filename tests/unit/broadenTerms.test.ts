import { describe, it, expect } from 'vitest';
import {
  broadenTermList,
  hasThinTerms,
  THIN_TERMS_BELOW,
  type TreeNode,
} from '../../components/admin/contentAudit/auditModel';
import type { Prompt } from '../../types';

/**
 * "Broaden Terms" in the Content Audit studio: the Syllabus Terms generator run
 * across a selection of questions whose lists are thin. It appends; nothing a
 * teacher already has is removed, moved or rewritten.
 */
const node = (keywords: string[]): TreeNode =>
  ({
    id: 'p1',
    type: 'prompt',
    label: 'q',
    stats: {},
    dataRef: { id: 'p1', keywords } as unknown as Prompt,
    path: {},
  }) as unknown as TreeNode;

describe('Broaden Terms', () => {
  it('targets a question with fewer than six terms, and no other', () => {
    expect(THIN_TERMS_BELOW).toBe(6);
    expect(hasThinTerms(node(['a', 'b', 'c', 'd', 'e']))).toBe(true);
    expect(hasThinTerms(node(['a', 'b', 'c', 'd', 'e', 'f']))).toBe(false);
    expect(hasThinTerms(node(['a', ' ', '', 'b']))).toBe(true);
  });

  it('keeps every existing term in its order and appends the new ones', () => {
    expect(
      broadenTermList(['market share', 'Profit'], ['profit', 'cash flow', 'liquidity'])
    ).toEqual(['market share', 'Profit', 'cash flow', 'liquidity']);
  });

  it('stops at ten, but never cuts a list that was already longer', () => {
    const many = Array.from({ length: 12 }, (_, i) => `term ${i}`);
    expect(broadenTermList(['a'], many)).toHaveLength(10);
    const long = Array.from({ length: 11 }, (_, i) => `own ${i}`);
    expect(broadenTermList(long, ['new'])).toEqual(long);
  });
});
