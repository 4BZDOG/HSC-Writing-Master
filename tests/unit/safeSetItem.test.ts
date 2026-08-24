import { describe, it, expect, afterEach, vi } from 'vitest';
import { safeSetItem } from '../../utils/storageUtils';

/**
 * safeSetItem now reports whether the write actually stuck, so callers
 * persisting something they care about (a user profile, a preference) can
 * react to a refused write (quota exceeded, private browsing) instead of
 * assuming success.
 */
describe('safeSetItem return value', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('returns true when the write succeeds', () => {
    expect(safeSetItem('k', { a: 1 })).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('k') as string)).toEqual({ a: 1 });
  });

  it('returns false when localStorage.setItem throws (e.g. quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(safeSetItem('k', { a: 1 })).toBe(false);
  });
});
