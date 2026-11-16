import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ToastType } from './useToast';
import type { User } from '../types';
import {
  clearOwnedCourseUnlocks,
  courseUnlocksEnabled,
  getOwnedCourseUnlocks,
  isCourseLocked,
  loadOwnedCourseUnlocks,
  parseCourseUnlockReturn,
  subscribeOwnedCourseUnlocks,
  type CourseUnlockReturn,
} from '../services/courseAccess';

/** The course ids the viewer holds. Re-renders the caller when the set changes. */
export const useOwnedCourseUnlocks = (): ReadonlySet<string> =>
  useSyncExternalStore(subscribeOwnedCourseUnlocks, getOwnedCourseUnlocks, getOwnedCourseUnlocks);

/**
 * What a picker needs: whether unlocks are on, and whether a given course is
 * locked for this viewer. With unlocks off `isLocked` is always false, and the
 * store never changes, so nothing re-renders.
 */
export const useCourseUnlockGate = (user: User | null | undefined) => {
  const owned = useOwnedCourseUnlocks();
  const enabled = courseUnlocksEnabled();
  return useMemo(
    () => ({
      enabled,
      isLocked: (courseId: string) => enabled && isCourseLocked(courseId, user, owned),
    }),
    [enabled, user, owned]
  );
};

/** How long to wait between checks after a return, while the webhook catches up. */
export const COURSE_UNLOCK_POLL_ATTEMPTS = 4;
export const COURSE_UNLOCK_POLL_MS = 2000;

interface CourseUnlockSessionOptions {
  user: User | null | undefined;
  courses: readonly { id: string; name: string }[];
  showToast: (message: string, type: ToastType) => void;
}

/**
 * Mount once, in App. Two jobs:
 *
 *  - Loads the viewer's unlocks once per sign-in, and clears them on sign-out.
 *    Nothing is requested for a guest, or while unlocks are off.
 *  - Handles the `#/course-unlocked?course=<id>` return from Stripe. The route is
 *    read on load and on hashchange, and held until a signed-in user is present,
 *    because the lookup needs the session. Then it re-reads the unlocks (the
 *    webhook may be a few seconds behind) and says so in a toast.
 *
 * With unlocks off the return route is ignored, and the hash is left alone.
 */
export const useCourseUnlockSession = ({
  user,
  courses,
  showToast,
}: CourseUnlockSessionOptions) => {
  const uid = user?.username;
  const role = user?.role;
  const enabled = courseUnlocksEnabled();
  const signedIn = !!uid && role !== 'guest';

  const pendingRef = useRef<CourseUnlockReturn | null>(null);
  const signedInRef = useRef(signedIn);
  const coursesRef = useRef(courses);
  const toastRef = useRef(showToast);
  signedInRef.current = signedIn;
  coursesRef.current = courses;
  toastRef.current = showToast;

  // Settles a pending return once there is a signed-in viewer to check it for.
  const settleReturn = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !signedInRef.current) return;
    pendingRef.current = null;
    const courseId = pending.courseId;
    for (let attempt = 0; attempt < COURSE_UNLOCK_POLL_ATTEMPTS; attempt++) {
      const held = await loadOwnedCourseUnlocks();
      if (courseId && held.has(courseId)) {
        const name = coursesRef.current.find((c) => c.id === courseId)?.name ?? 'The course';
        toastRef.current(`${name} is unlocked.`, 'success');
        return;
      }
      if (attempt < COURSE_UNLOCK_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, COURSE_UNLOCK_POLL_MS));
      }
    }
    toastRef.current(
      'Payment received. Your unlock will appear within a minute. Refresh if the course stays locked.',
      'info'
    );
  }, []);

  // Unmounting happens on sign-out: the next signed-in viewer must not see this one's unlocks.
  useEffect(() => () => clearOwnedCourseUnlocks(), []);

  // Loads once per sign-in; clears on sign-out or an account change.
  useEffect(() => {
    if (!signedIn || !enabled) {
      clearOwnedCourseUnlocks();
      return;
    }
    void loadOwnedCourseUnlocks();
  }, [signedIn, enabled, uid, role]);

  // Reads the return route on load and on every hash change. With unlocks off the
  // route is not ours to act on, so it is left in the URL untouched.
  useEffect(() => {
    const read = () => {
      const parsed = parseCourseUnlockReturn(window.location.hash);
      if (!parsed || !courseUnlocksEnabled()) return;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      pendingRef.current = parsed;
      void settleReturn();
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [settleReturn]);

  // A return that arrived before sign-in is settled as soon as there is a user.
  useEffect(() => {
    void settleReturn();
  }, [uid, role, settleReturn]);
};
