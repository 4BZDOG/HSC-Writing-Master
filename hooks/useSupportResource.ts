import { useEffect } from 'react';
import {
  markSupportOpened,
  registerSupport,
  type SupportResourceId,
} from '../utils/supportEngagement';

/**
 * Declare a workspace panel as one of the question's supports, and report when
 * the student opens it.
 *
 * Sits alongside `useOpenedOnce` — that hook answers "show a tick on this
 * panel", this one answers "say so in the marking report". Two hooks rather
 * than one because they have different lifetimes: the tick is local state that
 * dies with the panel, while the record has to outlive it, since the panels are
 * gone by the time the feedback is on screen.
 */
export const useSupportResource = (
  promptId: string | undefined,
  id: SupportResourceId | undefined,
  isOpen: boolean
): void => {
  useEffect(() => {
    if (promptId && id) registerSupport(promptId, id);
  }, [promptId, id]);

  useEffect(() => {
    if (promptId && id && isOpen) markSupportOpened(promptId, id);
  }, [promptId, id, isOpen]);
};
