import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

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
 *
 * The link runs both ways. A guide row's "Model answer" asks for an exemplar
 * (`requestOpenExemplar`), and an exemplar's "View marking criterion" asks for the
 * guide's row (`requestOpenCriterion`). A third signal keeps the pair honest while
 * a student reads: the exemplar that is open is announced
 * (`announceLinkedExemplar`), and the guide draws the criterion it answers to as
 * linked. That signal is also remembered in a small module-level map keyed by
 * question, because a guide mounted AFTER the exemplar opened (a Focus Mode swap, a
 * rail that re-mounts on a question change) would otherwise never hear the event
 * and would draw no link.
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
 * Subscribes `handler` to one of the ladder's request events for as long as the
 * component lives, for requests that name `promptId` only.
 *
 * The handler is read through a ref, so a handler that is recreated on every
 * render does not tear down and re-add the window listener on every render. The
 * listener is only re-subscribed when the question changes.
 */
const useWindowRequest = (
  eventName: string,
  promptId: string,
  handler: (mark: number) => void
): void => {
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
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName, promptId]);
};

/**
 * Calls `handler` with the mark whenever an open-exemplar request names
 * `promptId`. Requests for other questions are ignored.
 */
export const useOpenExemplarRequest = (promptId: string, handler: (mark: number) => void): void =>
  useWindowRequest(OPEN_EXEMPLAR_EVENT, promptId, handler);

/** The window event an exemplar dispatches to ask for the guide's matching row. */
export const OPEN_CRITERION_EVENT = 'hsc:open-criterion';

export interface OpenCriterionDetail {
  promptId: string;
  mark: number;
}

/**
 * Asks whichever Marking Guide is showing `promptId` to open, scroll to and focus the
 * row that holds `mark`. The reverse of `requestOpenExemplar`, and like it, a request
 * for a question nobody is showing goes nowhere.
 */
export const requestOpenCriterion = (promptId: string, mark: number): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OpenCriterionDetail>(OPEN_CRITERION_EVENT, { detail: { promptId, mark } })
  );
};

/**
 * Calls `handler` with the mark whenever an open-criterion request names
 * `promptId`. Requests for other questions are ignored.
 */
export const useOpenCriterionRequest = (promptId: string, handler: (mark: number) => void): void =>
  useWindowRequest(OPEN_CRITERION_EVENT, promptId, handler);

/** The window event that says which exemplar a student has open, or that none is. */
export const LINKED_EXEMPLAR_EVENT = 'hsc:linked-exemplar';

export interface LinkedExemplarDetail {
  promptId: string;
  /** The mark of the exemplar level that is open, or null when none is. */
  mark: number | null;
}

/**
 * The open exemplar's mark for each question. A guide that mounts after the exemplar
 * opened reads it from here, since the event has already gone by. An entry exists
 * only while an exemplar is open, so the map never grows past the questions a
 * student has open at once.
 */
const linkedExemplars = new Map<string, number>();

const dispatchLinked = (promptId: string, mark: number | null): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LinkedExemplarDetail>(LINKED_EXEMPLAR_EVENT, { detail: { promptId, mark } })
  );
};

/** Says that the exemplar at `mark` is open for `promptId`. */
export const announceLinkedExemplar = (promptId: string, mark: number): void => {
  linkedExemplars.set(promptId, mark);
  dispatchLinked(promptId, mark);
};

/**
 * Says that the exemplar at `mark` has closed. It clears the link only if `mark` is
 * still the one that is linked: when a student moves from one level to the next, the
 * level that closed must not wipe the level that has just opened.
 */
export const clearLinkedExemplar = (promptId: string, mark: number): void => {
  if (linkedExemplars.get(promptId) !== mark) return;
  linkedExemplars.delete(promptId);
  dispatchLinked(promptId, null);
};

/** The mark of the exemplar open for `promptId`, or null when none is. */
export const getLinkedExemplar = (promptId: string): number | null =>
  linkedExemplars.get(promptId) ?? null;

/** Forgets every linked exemplar. For tests, which share one module between cases. */
export const resetLinkedExemplars = (): void => {
  linkedExemplars.clear();
};

/**
 * The mark of the exemplar that is open for `promptId`, or null. It reads the map on
 * mount, so a guide that arrives late still knows, and follows the event after that.
 */
export const useLinkedExemplar = (promptId: string): number | null => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<LinkedExemplarDetail>).detail;
        if (detail && detail.promptId === promptId) onChange();
      };
      window.addEventListener(LINKED_EXEMPLAR_EVENT, listener);
      return () => window.removeEventListener(LINKED_EXEMPLAR_EVENT, listener);
    },
    [promptId]
  );
  const getSnapshot = useCallback(() => getLinkedExemplar(promptId), [promptId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
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
