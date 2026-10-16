import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import {
  LINKED_EXEMPLAR_EVENT,
  OPEN_CRITERION_EVENT,
  OPEN_EXEMPLAR_EVENT,
  announceLinkedExemplar,
  clearLinkedExemplar,
  getLinkedExemplar,
  nearestExemplarMark,
  requestOpenCriterion,
  requestOpenExemplar,
  resetLinkedExemplars,
  useLinkedExemplar,
  useOpenCriterionRequest,
  useOpenExemplarRequest,
  type LinkedExemplarDetail,
  type OpenCriterionDetail,
  type OpenExemplarDetail,
} from '../../utils/ladderLink';

/**
 * The Marking Guide asks the Sample Answers panel to open an exemplar by
 * dispatching a window event. These tests pin the event's name and payload, and
 * the hook that listens for it: it must answer its own question only, and stop
 * listening when its component goes away.
 */

afterEach(() => {
  cleanup();
  resetLinkedExemplars();
});

const received = (): { events: CustomEvent<OpenExemplarDetail>[]; stop: () => void } => {
  const events: CustomEvent<OpenExemplarDetail>[] = [];
  const listener = (e: Event) => events.push(e as CustomEvent<OpenExemplarDetail>);
  window.addEventListener(OPEN_EXEMPLAR_EVENT, listener);
  return { events, stop: () => window.removeEventListener(OPEN_EXEMPLAR_EVENT, listener) };
};

describe('requestOpenExemplar', () => {
  it('uses a stable event name', () => {
    expect(OPEN_EXEMPLAR_EVENT).toBe('hsc:open-exemplar');
  });

  it('dispatches one window event carrying the question and the mark', () => {
    const { events, stop } = received();

    requestOpenExemplar('prompt-7', 5);

    stop();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('hsc:open-exemplar');
    expect(events[0].detail).toEqual({ promptId: 'prompt-7', mark: 5 });
  });
});

describe('useOpenExemplarRequest', () => {
  it('calls the handler with the mark when a request names this question', () => {
    const handler = vi.fn();
    renderHook(() => useOpenExemplarRequest('prompt-1', handler));

    requestOpenExemplar('prompt-1', 6);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(6);
  });

  it('ignores a request for another question', () => {
    const handler = vi.fn();
    renderHook(() => useOpenExemplarRequest('prompt-1', handler));

    requestOpenExemplar('prompt-2', 6);

    expect(handler).not.toHaveBeenCalled();
  });

  it('stops listening when its component unmounts', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useOpenExemplarRequest('prompt-1', handler));

    unmount();
    requestOpenExemplar('prompt-1', 3);

    expect(handler).not.toHaveBeenCalled();
  });

  it('listens for the new question after its question changes, and not the old one', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useOpenExemplarRequest(id, handler),
      { initialProps: { id: 'prompt-1' } }
    );

    rerender({ id: 'prompt-2' });
    requestOpenExemplar('prompt-1', 2);
    requestOpenExemplar('prompt-2', 4);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(4);
  });

  it('calls the handler it was given most recently, without re-subscribing for it', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handler }: { handler: (mark: number) => void }) =>
        useOpenExemplarRequest('prompt-1', handler),
      { initialProps: { handler: first } }
    );

    rerender({ handler: second });
    requestOpenExemplar('prompt-1', 1);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(1);
  });

  it('leaves exactly one listener behind across re-renders', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    const handler = vi.fn();
    const { rerender } = renderHook(() => useOpenExemplarRequest('prompt-1', handler));
    rerender();
    rerender();

    const subscriptions = spy.mock.calls.filter(([type]) => type === OPEN_EXEMPLAR_EVENT);
    expect(subscriptions).toHaveLength(1);
    spy.mockRestore();
  });

  it('receives the detail the emitter sent, unchanged', () => {
    const handler = vi.fn();
    renderHook(() => useOpenExemplarRequest('p', handler));

    window.dispatchEvent(
      new CustomEvent<OpenExemplarDetail>(OPEN_EXEMPLAR_EVENT, {
        detail: { promptId: 'p', mark: 9 },
      })
    );

    expect(handler).toHaveBeenCalledWith(9);
  });

  it('ignores an event with no detail at all, rather than throwing', () => {
    const handler = vi.fn();
    renderHook(() => useOpenExemplarRequest('p', handler));

    expect(() => window.dispatchEvent(new CustomEvent(OPEN_EXEMPLAR_EVENT))).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('nearestExemplarMark', () => {
  // The levels a panel has exemplars at: six, four and one.
  const levels = [6, 4, 1];

  it('is the mark itself when a level has exactly that mark', () => {
    expect(nearestExemplarMark(levels, 4)).toBe(4);
  });

  it('falls to the nearest level below a mark with no exemplar of its own', () => {
    expect(nearestExemplarMark(levels, 5)).toBe(4);
    expect(nearestExemplarMark(levels, 9)).toBe(6);
  });

  it('rises to the nearest level above when nothing sits below', () => {
    expect(nearestExemplarMark(levels, 0)).toBe(1);
  });

  it('is undefined when there are no levels at all', () => {
    expect(nearestExemplarMark([], 4)).toBeUndefined();
  });

  it('does not depend on the order the levels arrive in', () => {
    expect(nearestExemplarMark([1, 6, 4], 5)).toBe(4);
  });
});

describe('requestOpenCriterion, the reverse request', () => {
  it('uses its own stable event name, distinct from the exemplar request', () => {
    expect(OPEN_CRITERION_EVENT).toBe('hsc:open-criterion');
    expect(OPEN_CRITERION_EVENT).not.toBe(OPEN_EXEMPLAR_EVENT);
  });

  it('dispatches one window event carrying the question and the mark', () => {
    const events: CustomEvent<OpenCriterionDetail>[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent<OpenCriterionDetail>);
    window.addEventListener(OPEN_CRITERION_EVENT, listener);
    requestOpenCriterion('prompt-7', 3);
    window.removeEventListener(OPEN_CRITERION_EVENT, listener);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ promptId: 'prompt-7', mark: 3 });
  });

  it('is heard by useOpenCriterionRequest for its own question only', () => {
    const handler = vi.fn();
    renderHook(() => useOpenCriterionRequest('prompt-1', handler));
    requestOpenCriterion('prompt-2', 5);
    expect(handler).not.toHaveBeenCalled();
    requestOpenCriterion('prompt-1', 5);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(5);
  });

  it('is not answered by an exemplar request, nor the other way round', () => {
    const exemplar = vi.fn();
    const criterion = vi.fn();
    renderHook(() => {
      useOpenExemplarRequest('p', exemplar);
      useOpenCriterionRequest('p', criterion);
    });
    requestOpenCriterion('p', 2);
    expect(criterion).toHaveBeenCalledTimes(1);
    expect(exemplar).not.toHaveBeenCalled();
    requestOpenExemplar('p', 2);
    expect(exemplar).toHaveBeenCalledTimes(1);
    expect(criterion).toHaveBeenCalledTimes(1);
  });

  it('stops listening when its component unmounts', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useOpenCriterionRequest('p', handler));
    unmount();
    requestOpenCriterion('p', 2);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('the linked-exemplar signal', () => {
  it('announces the open exemplar on the window and remembers it by question', () => {
    const events: CustomEvent<LinkedExemplarDetail>[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent<LinkedExemplarDetail>);
    window.addEventListener(LINKED_EXEMPLAR_EVENT, listener);
    announceLinkedExemplar('p', 4);
    window.removeEventListener(LINKED_EXEMPLAR_EVENT, listener);
    expect(events.map((e) => e.detail)).toEqual([{ promptId: 'p', mark: 4 }]);
    expect(getLinkedExemplar('p')).toBe(4);
    expect(getLinkedExemplar('other')).toBeNull();
  });

  it('clears the link when the same exemplar closes, and says so', () => {
    const events: LinkedExemplarDetail[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent<LinkedExemplarDetail>).detail);
    announceLinkedExemplar('p', 4);
    window.addEventListener(LINKED_EXEMPLAR_EVENT, listener);
    clearLinkedExemplar('p', 4);
    window.removeEventListener(LINKED_EXEMPLAR_EVENT, listener);
    expect(getLinkedExemplar('p')).toBeNull();
    expect(events).toEqual([{ promptId: 'p', mark: null }]);
  });

  it('does not let a level that is closing wipe the level that has just opened', () => {
    announceLinkedExemplar('p', 4);
    announceLinkedExemplar('p', 2);
    clearLinkedExemplar('p', 4);
    expect(getLinkedExemplar('p')).toBe(2);
  });

  it('is read by useLinkedExemplar on mount, so a late listener still knows', () => {
    announceLinkedExemplar('p', 5);
    const { result } = renderHook(() => useLinkedExemplar('p'));
    expect(result.current).toBe(5);
  });

  it('follows the announcements after mount, for its own question only', () => {
    const { result } = renderHook(() => useLinkedExemplar('p'));
    expect(result.current).toBeNull();
    act(() => announceLinkedExemplar('other', 3));
    expect(result.current).toBeNull();
    act(() => announceLinkedExemplar('p', 3));
    expect(result.current).toBe(3);
    act(() => clearLinkedExemplar('p', 3));
    expect(result.current).toBeNull();
  });

  it('reads the new question’s link after its question changes', () => {
    announceLinkedExemplar('a', 6);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useLinkedExemplar(id), {
      initialProps: { id: 'a' },
    });
    expect(result.current).toBe(6);
    rerender({ id: 'b' });
    expect(result.current).toBeNull();
  });

  it('leaves exactly one listener behind across re-renders', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(() => useLinkedExemplar('p'));
    rerender();
    rerender();
    const subscriptions = spy.mock.calls.filter(([type]) => type === LINKED_EXEMPLAR_EVENT);
    expect(subscriptions).toHaveLength(1);
    spy.mockRestore();
  });
});
