import { useCallback, useSyncExternalStore } from 'react';
import {
  type FocusArrangement,
  readFocusArrangement,
  writeFocusArrangement,
} from '../utils/focusLayout';

/**
 * Focus Mode's arrangement, shared by the two places that need it: the switcher
 * beside the exit pill (App) and the layout itself (Workspace). One value in the
 * module, so the two cannot disagree and neither has to be handed it as a prop.
 * Remembered per browser through `utils/focusLayout`.
 */
let current: FocusArrangement | null = null;
const listeners = new Set<() => void>();

const getSnapshot = (): FocusArrangement => {
  if (current === null) current = readFocusArrangement();
  return current;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setFocusArrangement = (arrangement: FocusArrangement): void => {
  if (arrangement === getSnapshot()) return;
  current = arrangement;
  writeFocusArrangement(arrangement);
  listeners.forEach((listener) => listener());
};

/** Test seam: forget the cached value so the next read comes from storage. */
export const resetFocusArrangementCache = (): void => {
  current = null;
};

export const useFocusArrangement = (): [FocusArrangement, (next: FocusArrangement) => void] => {
  const arrangement = useSyncExternalStore(subscribe, getSnapshot, () => 'stacked' as const);
  const set = useCallback((next: FocusArrangement) => setFocusArrangement(next), []);
  return [arrangement, set];
};
