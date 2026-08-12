import { useCallback, useEffect, useRef, useState } from 'react';
import { clearImportDraft, loadImportDraft, saveImportDraft } from '../utils/storageUtils';

/**
 * Keep an import modal's unfinished work across a reload, and offer it back.
 *
 * The discard guard stops a stray click from throwing a pasted syllabus away.
 * It does nothing about the tab crashing, the laptop sleeping, or a session
 * timing out mid-paste — and this is the workflow where an admin puts twenty
 * minutes of real attention into a text box. So the snapshot is written AS THEY
 * TYPE, not on close: "on close" is exactly the moment that does not happen
 * when a tab dies.
 *
 * The draft is offered, never applied. Someone opening the modal to start
 * something new must not find last week's paste already in it, so restoring is
 * a decision they make with the age of the draft in front of them.
 */
const SAVE_DEBOUNCE_MS = 800;

export interface ImportDraftState<T> {
  /** A draft found on open and not yet accepted or dismissed. */
  offered: { value: T; savedAt: number } | null;
  /** Take the draft. The caller applies it to its own state. */
  accept: () => void;
  /** Refuse it, and delete it — the answer to "no, I'm starting fresh". */
  dismiss: () => void;
  /** Forget the draft because the work it held is now real content. */
  complete: () => void;
}

export const useImportDraft = <T>(
  key: string,
  isOpen: boolean,
  snapshot: T,
  /** False while the modal holds nothing worth saving. */
  hasWork: boolean
): ImportDraftState<T> => {
  const [offered, setOffered] = useState<{ value: T; savedAt: number } | null>(null);
  // Set once the modal has been opened and looked at: writing before the first
  // load has answered would race the draft it is about to offer.
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      ready.current = false;
      setOffered(null);
      return;
    }
    let cancelled = false;
    void loadImportDraft<T>(key).then((draft) => {
      if (cancelled) return;
      if (draft) setOffered({ value: draft.value, savedAt: draft.savedAt });
      ready.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, key]);

  // Debounced, because this fires on every keystroke in a textarea holding a
  // whole syllabus.
  useEffect(() => {
    if (!isOpen || !ready.current) return;
    if (timer.current) clearTimeout(timer.current);
    if (!hasWork) {
      // Emptying the form is an instruction too — leaving the old draft behind
      // would offer it back on the next open, after it was deliberately cleared.
      void clearImportDraft(key);
      return;
    }
    timer.current = setTimeout(() => void saveImportDraft(key, snapshot), SAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isOpen, key, snapshot, hasWork]);

  const accept = useCallback(() => setOffered(null), []);

  const dismiss = useCallback(() => {
    setOffered(null);
    void clearImportDraft(key);
  }, [key]);

  const complete = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOffered(null);
    void clearImportDraft(key);
  }, [key]);

  return { offered, accept, dismiss, complete };
};

/** "12 minutes ago" — the age is what makes a draft recognisable. */
export const describeAge = (savedAt: number): string => {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
