import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useImportDraft, describeAge } from '../../hooks/useImportDraft';

/**
 * A crash mid-paste must not cost the paste.
 *
 * The discard guard stops a stray CLICK from throwing a syllabus away; it does
 * nothing about the tab dying, the laptop sleeping, or a session timing out.
 * The snapshot is written as the user types for exactly that reason — "save on
 * close" is the one moment that does not happen when a tab dies.
 */

const store = new Map<string, { savedAt: number; value: unknown }>();

vi.mock('../../utils/storageUtils', () => ({
  DRAFT_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  saveImportDraft: vi.fn(async (key: string, value: unknown) => {
    store.set(key, { savedAt: Date.now(), value });
  }),
  loadImportDraft: vi.fn(async (key: string) => store.get(key) ?? null),
  clearImportDraft: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

const renderDraft = (isOpen: boolean, snapshot: unknown, hasWork: boolean) =>
  renderHook(({ o, s, w }) => useImportDraft('k', o, s, w), {
    initialProps: { o: isOpen, s: snapshot, w: hasWork },
  });

describe('an import draft', () => {
  it('saves what is typed, without waiting for the modal to close', async () => {
    const { rerender } = renderDraft(true, { text: '' }, false);
    // The load has to answer before anything is written, or the save races the
    // draft it is about to offer.
    await act(async () => {});

    rerender({ o: true, s: { text: 'Module 1: Cells' }, w: true });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(store.get('k')?.value).toEqual({ text: 'Module 1: Cells' }));
  });

  it('offers a saved draft on the next open rather than applying it', async () => {
    store.set('k', { savedAt: Date.now() - 5 * 60_000, value: { text: 'Module 1: Cells' } });

    const { result } = renderDraft(true, { text: '' }, false);

    // Someone opening the modal to start something new must not find last
    // week's paste already in it, so this is an offer the caller acts on.
    await waitFor(() => expect(result.current.offered?.value).toEqual({ text: 'Module 1: Cells' }));
    expect(describeAge(result.current.offered!.savedAt)).toBe('5 minutes ago');
  });

  it('deletes the draft when it is refused', async () => {
    store.set('k', { savedAt: Date.now(), value: { text: 'old' } });
    const { result } = renderDraft(true, { text: '' }, false);
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.dismiss());

    expect(result.current.offered).toBeNull();
    await waitFor(() => expect(store.has('k')).toBe(false));
  });

  it('deletes the draft once the import has happened', async () => {
    const { result, rerender } = renderDraft(true, { text: '' }, false);
    await act(async () => {});
    rerender({ o: true, s: { text: 'Module 1' }, w: true });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(store.has('k')).toBe(true));

    act(() => result.current.complete());

    // The work is real content now; offering it back would duplicate it.
    await waitFor(() => expect(store.has('k')).toBe(false));
  });

  it('clears the draft when the form is emptied on purpose', async () => {
    const { rerender } = renderDraft(true, { text: '' }, false);
    await act(async () => {});
    rerender({ o: true, s: { text: 'Module 1' }, w: true });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(store.has('k')).toBe(true));

    // Emptying the form is an instruction too — the old draft must not come
    // back on the next open after it was deliberately cleared.
    rerender({ o: true, s: { text: '' }, w: false });
    await waitFor(() => expect(store.has('k')).toBe(false));
  });
});

describe('describeAge', () => {
  it('says the age in units a person recognises their own crash by', () => {
    expect(describeAge(Date.now() - 20_000)).toBe('moments ago');
    expect(describeAge(Date.now() - 60_000)).toBe('1 minute ago');
    expect(describeAge(Date.now() - 3 * 3600_000)).toBe('3 hours ago');
    expect(describeAge(Date.now() - 2 * 24 * 3600_000)).toBe('2 days ago');
  });
});
