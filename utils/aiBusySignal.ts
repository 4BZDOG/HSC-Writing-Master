/**
 * Whether any AI wait is on screen, as a class on <body>.
 *
 * The background aurora leans in while the AI works (see `.aurora` in
 * index.css). Every wait card registers itself here for as long as it is
 * mounted; the count, not a boolean, is what lets two overlapping waits — a
 * marking run and a background suggestion — end in either order without the
 * first to finish switching the mood off under the second.
 */
let busyCount = 0;

const sync = (): void => {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('ai-busy', busyCount > 0);
};

/** Mark one AI wait as started. Returns the matching release, safe to call twice. */
export const acquireAiBusy = (): (() => void) => {
  busyCount += 1;
  sync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyCount = Math.max(0, busyCount - 1);
    sync();
  };
};
