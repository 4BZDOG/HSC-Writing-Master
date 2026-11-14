import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Course } from '../../types';
import {
  PENDING_DRAFT_KEY,
  applyPendingDraft,
  clearPendingDraft,
  decidePendingDraft,
  holdsPendingText,
  readPendingDraft,
  resolvePendingDraft,
  writePendingDraft,
  type PendingDraft,
} from '../../utils/pendingDraft';

const pending = (over: Partial<PendingDraft> = {}): PendingDraft => ({
  promptId: 'p1',
  text: 'the words typed last',
  prev: '',
  at: 1000,
  ...over,
});

const library = (draft?: string, elapsed?: number): Course[] =>
  [
    {
      id: 'course-1',
      name: 'Course',
      outcomes: [],
      topics: [
        {
          id: 'topic-1',
          name: 'Topic',
          subTopics: [
            {
              id: 'sub-1',
              name: 'Sub',
              dotPoints: [
                {
                  id: 'dp-1',
                  description: 'Dot point',
                  prompts: [
                    {
                      id: 'p1',
                      question: 'Q1',
                      ...(draft !== undefined ? { userDraft: draft } : {}),
                      ...(elapsed !== undefined ? { draftElapsedSeconds: elapsed } : {}),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ] as unknown as Course[];

const draftOf = (courses: Course[]) => courses[0].topics[0].subTopics![0].dotPoints![0].prompts![0];

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('pendingDraft storage', () => {
  it('round-trips a pending draft through localStorage', () => {
    writePendingDraft(pending({ elapsed: 42 }));
    expect(readPendingDraft()).toEqual(pending({ elapsed: 42 }));
    clearPendingDraft();
    expect(readPendingDraft()).toBeNull();
    expect(window.localStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it('reads malformed or foreign values as null', () => {
    window.localStorage.setItem(PENDING_DRAFT_KEY, '{not json');
    expect(readPendingDraft()).toBeNull();
    window.localStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({ promptId: 3, text: 'x' }));
    expect(readPendingDraft()).toBeNull();
    window.localStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(['array']));
    expect(readPendingDraft()).toBeNull();
    window.localStorage.setItem(
      PENDING_DRAFT_KEY,
      JSON.stringify({ promptId: 'p', text: 't', prev: '', at: 1, elapsed: 'soon' })
    );
    expect(readPendingDraft()).toBeNull();
  });

  it('skips a text too long for the quota rather than failing', () => {
    writePendingDraft(pending({ text: 'x'.repeat(200_001) }));
    expect(readPendingDraft()).toBeNull();
  });

  it('never throws when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => writePendingDraft(pending())).not.toThrow();
    expect(readPendingDraft()).toBeNull();
    expect(() => clearPendingDraft()).not.toThrow();
  });
});

describe('resolvePendingDraft', () => {
  it('applies when the stored draft is still the one it was written over', () => {
    expect(resolvePendingDraft(pending({ prev: 'old' }), 'old')).toBe('apply');
    expect(resolvePendingDraft(pending({ prev: '' }), undefined)).toBe('apply');
  });

  it('discards when the stored draft already holds the text', () => {
    expect(resolvePendingDraft(pending({ prev: 'old' }), 'the words typed last')).toBe('discard');
  });

  it('discards when something else changed the stored draft since', () => {
    expect(resolvePendingDraft(pending({ prev: 'old' }), 'a later edit elsewhere')).toBe('discard');
  });
});

describe('decidePendingDraft, applyPendingDraft and holdsPendingText', () => {
  it('applies onto the prompt and keeps the larger elapsed time', () => {
    const stored = library('old', 100);
    const entry = pending({ prev: 'old', elapsed: 50 });
    expect(decidePendingDraft(entry, stored)).toBe('apply');
    const applied = applyPendingDraft(stored, entry);
    expect(draftOf(applied).userDraft).toBe('the words typed last');
    expect(draftOf(applied).draftElapsedSeconds).toBe(100);
    expect(draftOf(stored).userDraft).toBe('old');
  });

  it('discards when the prompt no longer exists', () => {
    expect(decidePendingDraft(pending({ promptId: 'gone' }), library())).toBe('discard');
  });

  it('holdsPendingText reports whether the saved library holds the text', () => {
    expect(holdsPendingText(library('the words typed last'), pending())).toBe(true);
    expect(holdsPendingText(library('older'), pending())).toBe(false);
  });
});
