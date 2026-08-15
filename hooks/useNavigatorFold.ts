import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The two halves of the fold, and what each one is called.
 *
 * Choosing a question folds the syllabus navigator down to a breadcrumb bar and
 * unmounts it; pressing "Change" unmounts the bar and puts the navigator back.
 * That fold is deliberate and is not in question here. What was wrong is that
 * it happened in silence and took the keyboard with it: the subtree containing
 * the control the reader had just operated was destroyed, focus fell to
 * `document.body`, and the next Tab started again at the top of the document
 * while the writing surface they had just earned sat below.
 */
export const NAVIGATOR_COLLAPSED_MESSAGE =
  'Question selected. The syllabus navigator has collapsed to a breadcrumb; your writing space is below.';

export const NAVIGATOR_EXPANDED_MESSAGE = 'Syllabus navigator open.';

interface FoldTargets {
  /** Element id of the collapsed breadcrumb bar. */
  collapsedId: string;
  /** Element id of the expanded navigator's landmark. */
  expandedId: string;
}

/**
 * Hand keyboard focus across the fold, and return one polite sentence saying
 * what happened.
 *
 * Focus lands on the LANDMARK rather than on its first control, so a reader
 * hears the name of the region they have arrived in before its contents.
 *
 * **The move is guarded on the transition and on nothing else.** A guard on the
 * steady state — "collapsed, so focus the bar" — would re-fire on every render
 * of the surrounding component, which in this app is every keystroke in the
 * editor: it would lift focus out of a half-written sentence. `handedOverAt`
 * remembers the state focus was last moved FOR, so the mount pass and every
 * re-render pass do nothing at all. Only a genuine change of `isCollapsed`
 * moves anything.
 *
 * Targets arrive as ids rather than refs because one of the two lives inside
 * `PromptSelector`, which is fifteen hundred lines and not a `forwardRef`;
 * addressing both halves the same way is worth more here than a ref would be.
 * A missing element — Focus Mode has neither on screen — is simply not focused.
 */
export const useNavigatorFold = (isCollapsed: boolean, targets: FoldTargets): string => {
  const { collapsedId, expandedId } = targets;
  const handedOverAt = useRef<boolean | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useLayoutEffect(() => {
    const previous = handedOverAt.current;
    handedOverAt.current = isCollapsed;
    // The first pass is a mount, not a fold, and an unchanged value is a
    // re-render. Neither is the reader doing anything.
    if (previous === null || previous === isCollapsed) return;

    document.getElementById(isCollapsed ? collapsedId : expandedId)?.focus();
    setAnnouncement(isCollapsed ? NAVIGATOR_COLLAPSED_MESSAGE : NAVIGATOR_EXPANDED_MESSAGE);
  }, [isCollapsed, collapsedId, expandedId]);

  return announcement;
};
