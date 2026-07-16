/**
 * Client-side dispatcher for daily-AI-quota warnings. The proxy echoes the
 * caller's usage back on every authenticated response (see api/gemini.ts →
 * `__quota`, and the 429 body), aiCore hands each snapshot here, and this
 * module decides whether it crosses a not-yet-warned threshold (80% / 100%)
 * and, if so, notifies subscribers (App shows a toast).
 *
 * Dedupe is per UTC day and persisted, so a user is nudged at most once per
 * threshold per day rather than on every call once they're over the line. The
 * day bucket matches the server's counter (resets at midnight UTC).
 */
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '../utils/storageUtils';
import {
  evaluateQuotaWarning,
  type QuotaSnapshot,
  type QuotaWarning,
} from '../utils/quotaWarnings';

type Listener = (warning: QuotaWarning) => void;

interface FiredState {
  /** UTC day (yyyy-mm-dd) the thresholds below were fired on. */
  day: string;
  /** Thresholds already warned about today. */
  fired: number[];
}

const utcDay = (): string => new Date().toISOString().slice(0, 10);

const listeners = new Set<Listener>();

/** Fired thresholds for today, resetting the record when the UTC day rolls. */
const loadFired = (): FiredState => {
  const today = utcDay();
  const stored = safeGetItem<FiredState>(STORAGE_KEYS.QUOTA_WARNINGS, { day: today, fired: [] });
  if (!stored || stored.day !== today || !Array.isArray(stored.fired)) {
    return { day: today, fired: [] };
  }
  return stored;
};

export const subscribeQuotaWarnings = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Feed a usage snapshot from the proxy. Emits at most one warning per call —
 * the highest freshly-crossed threshold — and records it so the same threshold
 * stays quiet for the rest of the UTC day. Malformed snapshots are ignored.
 */
export const observeQuota = (snapshot: QuotaSnapshot | null | undefined): void => {
  if (!snapshot || typeof snapshot.used !== 'number' || typeof snapshot.limit !== 'number') {
    return;
  }
  const state = loadFired();
  const warning = evaluateQuotaWarning(snapshot, state.fired);
  if (!warning) return;

  safeSetItem(STORAGE_KEYS.QUOTA_WARNINGS, {
    day: state.day,
    fired: [...state.fired, warning.threshold],
  });
  listeners.forEach((l) => l(warning));
};

/** Test seam: drop all subscribers. */
export const _resetQuotaListeners = (): void => {
  listeners.clear();
  noticeListeners.clear();
};

// ---------------------------------------------------------------------------
// One-off AI notices — free-form messages from the AI plumbing that the user
// should see as a toast (e.g. "Gemini 3 Pro has no free-tier quota — switched
// to Gemini 3 Flash"). Same subscribe pattern as quota warnings; App wires
// both to showToast.
// ---------------------------------------------------------------------------

type NoticeListener = (message: string) => void;
const noticeListeners = new Set<NoticeListener>();

export const subscribeAiNotices = (listener: NoticeListener): (() => void) => {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
};

export const notifyAiNotice = (message: string): void => {
  noticeListeners.forEach((l) => l(message));
};
