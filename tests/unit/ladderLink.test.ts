import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
  OPEN_EXEMPLAR_EVENT,
  requestOpenExemplar,
  useOpenExemplarRequest,
  type OpenExemplarDetail,
} from '../../utils/ladderLink';

/**
 * The Marking Guide asks the Sample Answers panel to open an exemplar by
 * dispatching a window event. These tests pin the event's name and payload, and
 * the hook that listens for it: it must answer its own question only, and stop
 * listening when its component goes away.
 */

afterEach(cleanup);

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
