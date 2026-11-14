import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  WRITING_MODE_KEY,
  readStoredWritingMode,
  writeStoredWritingMode,
} from '../../utils/writingModeStore';

/**
 * Exam Mode survives a reload within a tab, and nothing else. The mode is kept
 * in sessionStorage, so a new tab or a closed window starts in Coach as before,
 * and every access is guarded.
 */

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('the stored writing mode', () => {
  it('starts in Coach when nothing is stored', () => {
    expect(readStoredWritingMode()).toBe('coach');
  });

  it('remembers Exam Mode, so a reload comes back to it', () => {
    writeStoredWritingMode('exam');
    expect(window.sessionStorage.getItem(WRITING_MODE_KEY)).toBe('exam');
    expect(readStoredWritingMode()).toBe('exam');
  });

  it('forgets Exam Mode when Coach is chosen', () => {
    writeStoredWritingMode('exam');
    writeStoredWritingMode('coach');

    expect(window.sessionStorage.getItem(WRITING_MODE_KEY)).toBeNull();
    expect(readStoredWritingMode()).toBe('coach');
  });

  it('reads anything it does not recognise as Coach', () => {
    window.sessionStorage.setItem(WRITING_MODE_KEY, 'practice');
    expect(readStoredWritingMode()).toBe('coach');
  });

  it('is kept in sessionStorage, not localStorage, so it ends with the tab', () => {
    writeStoredWritingMode('exam');
    expect(window.localStorage.getItem(WRITING_MODE_KEY)).toBeNull();
  });

  it('falls back to Coach when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => readStoredWritingMode()).not.toThrow();
    expect(readStoredWritingMode()).toBe('coach');
  });

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeStoredWritingMode('exam')).not.toThrow();
    expect(() => writeStoredWritingMode('coach')).not.toThrow();
  });
});
