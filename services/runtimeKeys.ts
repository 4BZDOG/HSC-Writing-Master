/**
 * Runtime AI provider keys — a LOCAL-TESTING affordance for admins.
 *
 * Normally provider keys live only server-side (see api/gemini.ts) and never
 * touch the browser. This module lets an admin paste a key at runtime so they
 * can exercise the models without editing `.env.local` and restarting the dev
 * server. The key is:
 *
 *   - held in `sessionStorage` (per-tab, cleared when the tab closes),
 *   - sent to the proxy only as a PER-REQUEST override (`__keyOverride`), and
 *   - merged over the server env key for that one call — it never replaces the
 *     server key for other users and never bypasses the proxy's auth/quota
 *     gates.
 *
 * ⚠️ Putting a provider key in the browser is inherently less safe than the
 * server-only path (it is readable by any script on the page). It exists for
 * convenience while testing; prefer `.env.local` for anything long-lived.
 */

export interface RuntimeKeys {
  gemini?: string;
  anthropic?: string;
  openrouter?: string;
  groq?: string;
}

const SESSION_KEY = 'hsc-ai-runtime-keys';

const load = (): RuntimeKeys => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as RuntimeKeys) : {};
  } catch {
    return {};
  }
};

let keys: RuntimeKeys = load();
const listeners = new Set<() => void>();

const persist = (): void => {
  try {
    if (!keys.gemini && !keys.anthropic && !keys.openrouter && !keys.groq)
      sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(keys));
  } catch {
    /* sessionStorage unavailable (SSR/tests) — keep the in-memory copy */
  }
};

/** Stable snapshot for React's useSyncExternalStore. Do not mutate the result. */
export const getRuntimeKeys = (): RuntimeKeys => keys;

/**
 * The non-empty override payload to attach to a proxy request, or null when
 * nothing is set (so the caller sends an unchanged request in the common case).
 */
export const getRuntimeKeyOverride = (): RuntimeKeys | null => {
  const out: RuntimeKeys = {};
  if (keys.gemini) out.gemini = keys.gemini;
  if (keys.anthropic) out.anthropic = keys.anthropic;
  if (keys.openrouter) out.openrouter = keys.openrouter;
  if (keys.groq) out.groq = keys.groq;
  return out.gemini || out.anthropic || out.openrouter || out.groq ? out : null;
};

export const setRuntimeKeys = (next: RuntimeKeys): void => {
  keys = {
    gemini: next.gemini?.trim() || undefined,
    anthropic: next.anthropic?.trim() || undefined,
    openrouter: next.openrouter?.trim() || undefined,
    groq: next.groq?.trim() || undefined,
  };
  persist();
  listeners.forEach((l) => l());
};

export const clearRuntimeKeys = (): void => {
  keys = {};
  persist();
  listeners.forEach((l) => l());
};

export const subscribeRuntimeKeys = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
