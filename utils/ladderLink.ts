import { useEffect, useRef } from 'react';

/**
 * The link between the two halves of the mark ladder.
 *
 * The Marking Guide and the Sample Answers panel are two views of one ladder:
 * a guide row says what earns a mark, and the exemplar for that mark shows it.
 * A row's "Model answer" control has to bring up the matching exemplar, and the
 * two panels are sibling components with no shared parent state, so the request
 * travels as a window event. Keeping it a window event, and not a prop or a
 * context, means the guide does not need to know which panel is listening, or
 * whether one is mounted at all.
 */

/** The window event a guide row dispatches to ask for a mark's exemplar. */
export const OPEN_EXEMPLAR_EVENT = 'hsc:open-exemplar';

export interface OpenExemplarDetail {
  promptId: string;
  mark: number;
}

/**
 * Asks whichever Sample Answers panel is showing `promptId` to open the exemplar
 * for `mark`. A request for a question nobody is showing goes nowhere, which is
 * the right outcome: there is no exemplar on screen to open.
 */
export const requestOpenExemplar = (promptId: string, mark: number): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OpenExemplarDetail>(OPEN_EXEMPLAR_EVENT, { detail: { promptId, mark } })
  );
};

/**
 * Calls `handler` with the mark whenever an open-exemplar request names
 * `promptId`. Requests for other questions are ignored.
 *
 * The handler is read through a ref, so a handler that is recreated on every
 * render does not tear down and re-add the window listener on every render. The
 * listener is only re-subscribed when the question changes.
 */
export const useOpenExemplarRequest = (promptId: string, handler: (mark: number) => void): void => {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<OpenExemplarDetail>).detail;
      if (!detail || detail.promptId !== promptId) return;
      handlerRef.current(detail.mark);
    };
    window.addEventListener(OPEN_EXEMPLAR_EVENT, listener);
    return () => window.removeEventListener(OPEN_EXEMPLAR_EVENT, listener);
  }, [promptId]);
};

/**
 * The level a request for `mark` should open, given the marks that a panel has
 * exemplars at: `mark` itself when there is one, otherwise the nearest level
 * below it, and failing that the nearest above it. Undefined when there are no
 * exemplars at all.
 *
 * A guide row only asks for a mark its exemplar actually has, so the exact match
 * is the normal case. The nearest-level fallback is for a request that does not
 * line up, and the panel should still open somewhere sensible rather than do
 * nothing.
 */
export const nearestExemplarMark = (marks: number[], mark: number): number | undefined => {
  if (marks.includes(mark)) return mark;
  let below: number | undefined;
  let above: number | undefined;
  for (const m of marks) {
    if (m < mark && (below === undefined || m > below)) below = m;
    if (m > mark && (above === undefined || m < above)) above = m;
  }
  return below ?? above;
};
