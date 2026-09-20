/**
 * When the daily free allowance actually comes back — in the reader's own
 * clock, not the server's.
 *
 * WHY THIS EXISTS. The counter is a UTC day: `consume_evaluation()` keys on
 * `(now() at time zone 'utc')::date` (supabase/schema.sql §14) and the client
 * mirror keys on `toISOString().slice(0, 10)`. That is the right way to meter
 * it — one boundary for everyone, no argument about whose midnight — but it is
 * the wrong way to SAY it. This app is built for NSW HSC students, and midnight
 * UTC is 10am AEST / 11am AEDT: a student who runs out at 9pm on a school night
 * was told "resets at midnight", sat down at 8am before school, and found the
 * allowance still spent. Worse, the app said it three different ways — "midnight
 * UTC" on the counter chip, a bare "midnight" in the upgrade prompt (which reads
 * as their own midnight), and "every day" in the plan comparison.
 *
 * So the boundary stays UTC and the SENTENCE is localised. One helper, so the
 * three surfaces cannot drift apart again.
 */

/** The next UTC-midnight boundary at or after `now`. */
export const nextDailyReset = (now: Date = new Date()): Date => {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
};

/**
 * Just the clock time the allowance returns — "10:00 am", "midnight". For a
 * sentence that already carries its own "every day", where "tomorrow" would
 * contradict it.
 */
export const dailyResetTime = (now: Date = new Date()): string => {
  const reset = nextDailyReset(now);
  if (reset.getHours() === 0 && reset.getMinutes() === 0) return 'midnight';
  return reset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

/**
 * The reset as a phrase to drop into a sentence — "10:00 am tomorrow",
 * "11:00 am today", "midnight tonight" for a reader who genuinely is on UTC.
 *
 * Deliberately relative rather than a date: "tomorrow" is what a student
 * planning tonight's study actually needs, and a bare date makes them work out
 * which side of the boundary they are on.
 */
export const dailyResetPhrase = (now: Date = new Date()): string => {
  const reset = nextDailyReset(now);
  const sameLocalDay = reset.toDateString() === now.toDateString();
  const when = sameLocalDay ? 'today' : 'tomorrow';

  // A reader whose local midnight IS the boundary should be told "midnight",
  // not "12:00 am" — and "midnight today" is nonsense, so it gets its own word.
  if (reset.getHours() === 0 && reset.getMinutes() === 0) {
    return sameLocalDay ? 'midnight tonight' : 'midnight';
  }

  return `${dailyResetTime(now)} ${when}`;
};

/** "Resets at 10:00 am tomorrow." — a whole sentence, for a tooltip. */
export const dailyResetSentence = (now: Date = new Date()): string =>
  `Resets at ${dailyResetPhrase(now)}.`;
