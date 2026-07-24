import { GenerateContentResponse } from '@google/genai';
import { safeSetItem, safeGetItem, STORAGE_KEYS } from '../utils/storageUtils';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getRuntimeKeyOverride } from './runtimeKeys';
import { observeQuota, notifyAiNotice } from './quotaNotifier';
import { markModelQuotaDead, getGeminiFreeTierFallback } from './aiConfig';
import { getModelByProviderModel } from './aiModels';

// All Gemini calls go through a server-side proxy so the API key never
// reaches the browser bundle. See api/gemini.ts and api/_lib/generate.ts.
// VITE_API_BASE_URL points the client at a proxy on ANOTHER origin (e.g. a
// static GitHub Pages frontend calling a Vercel-hosted API) — the server must
// then allow that frontend's origin via its ALLOWED_ORIGIN env var. Unset, the
// path stays same-origin and behaviour is unchanged.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const GEMINI_PROXY_ENDPOINT = `${API_BASE_URL}/api/gemini`;

// True in production builds with no API host configured — the proxy endpoint
// resolves to the static host itself (e.g. GitHub Pages), which can never
// serve the serverless function. Detected once at module load so every AI call
// can skip the doomed fetch and go straight to the direct-browser path.
const IS_STATIC_HOSTING = !import.meta.env.DEV && !API_BASE_URL;

/** Whether this deployment has a reachable AI proxy. UI can read this to show
 *  an "AI not connected" banner without waiting for the first call to fail. */
export const isProxyConfigured = (): boolean => !IS_STATIC_HOSTING;

// --- Constants ---
export const ERROR_THRESHOLD = 15;
const TIME_WINDOW_MS = 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 1000;
const API_TIMEOUT = 90000;
const MAX_RETRIES = 3;
const MAX_TIMEOUT_RETRIES = 1;
const BASE_DELAY = 1000;

// --- Evaluation progress events ---
// Lightweight pub/sub so the progress bar can show what's actually happening
// (retrying, falling back, elapsed time) instead of fake micro-logs.
export type EvalProgressPhase =
  | 'started'
  | 'sending'
  | 'waiting'
  | 'retrying'
  | 'fallback'
  | 'parsing'
  | 'done'
  | 'error';

export interface EvalProgressEvent {
  phase: EvalProgressPhase;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  elapsedMs?: number;
}

type EvalProgressListener = (event: EvalProgressEvent) => void;
const evalProgressListeners = new Set<EvalProgressListener>();

export const subscribeEvalProgress = (listener: EvalProgressListener): (() => void) => {
  evalProgressListeners.add(listener);
  return () => {
    evalProgressListeners.delete(listener);
  };
};

export const emitEvalProgress = (event: EvalProgressEvent): void => {
  for (const listener of evalProgressListeners) {
    try {
      listener(event);
    } catch {
      /* listener errors must not break the call */
    }
  }
};

// --- Custom Errors ---
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class QuotaExceededError extends Error {
  /**
   * True when the provider reported the model has literally ZERO quota on the
   * caller's key (Gemini free tier returns `limit: 0` for Pro models) — a
   * permanent condition for this key, as opposed to a transient rate limit.
   */
  zeroFreeTierQuota: boolean;
  constructor(message: string, zeroFreeTierQuota = false) {
    super(message);
    this.name = 'QuotaExceededError';
    this.zeroFreeTierQuota = zeroFreeTierQuota;
  }
}

/**
 * Detects Gemini's "this model has no free-tier quota at all" 429 signature:
 * the body lists free_tier quota metrics with `limit: 0`. Distinct from an
 * ordinary rate limit, where the limits are non-zero and waiting helps.
 */
const isFreeTierZeroQuota = (msg: string): boolean =>
  /free_tier/i.test(msg) && /limit:\s*0\b/.test(msg);

/**
 * Providers often surface their entire JSON error body as the message string.
 * Unwraps `{ error: { message } }` / `{ message }` when present so the user
 * sees the human sentence, not the raw dump. Returns the input otherwise.
 */
const unwrapProviderMessage = (raw: string): string => {
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    const inner = parsed?.error?.message ?? parsed?.message;
    if (typeof inner === 'string' && inner) return inner;
  } catch {
    /* not JSON — keep the original text */
  }
  return raw;
};

/**
 * Turns a provider 429 body (often a full JSON error dump) into one readable
 * sentence plus a concrete retry hint. Never shows raw JSON to the user.
 */
export const humaniseRateLimitMessage = (raw: string): string => {
  const msg = unwrapProviderMessage(raw);
  const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  const retryHint = retryMatch
    ? ` Try again in about ${Math.ceil(parseFloat(retryMatch[1]))} seconds.`
    : ' Please wait a moment and try again.';
  // First line only, capped — quota bodies run to paragraphs of metric names.
  const firstLine = (msg.split('\n')[0] || '').trim().slice(0, 200);
  const base = firstLine || 'The AI provider is temporarily rate-limiting requests.';
  return `${base}${base.endsWith('.') ? '' : '.'}${retryHint}`;
};

/**
 * Nothing is deployed at the proxy path — a static file host (e.g. GitHub
 * Pages) answered the POST instead of the serverless function. Permanent for
 * the deployment, so never retried and never trips the circuit breaker.
 * Thrown only when no runtime keys are set; with keys, aiCore falls back to
 * calling the provider directly from the browser (services/aiDirect.ts).
 */
export class ProxyUnavailableError extends Error {
  public status: number;
  constructor(status: number) {
    super(
      'AI is not connected on this deployment: nothing answered at ' +
        `${GEMINI_PROXY_ENDPOINT} (HTTP ${status}). Static hosting such as GitHub Pages ` +
        'cannot run the AI proxy — link an API host (set the API_BASE_URL repository ' +
        'variable to the Vercel API origin; see DEPLOYMENT.md), or for temporary testing ' +
        'an admin can paste a provider key in the Runtime AI Keys panel, which calls the ' +
        'provider directly from this browser.'
    );
    this.name = 'ProxyUnavailableError';
    this.status = status;
  }
}

// --- API Guard (Circuit Breaker) ---
interface ErrorRecord {
  timestamp: number;
}

export type ApiState = 'HEALTHY' | 'DEGRADED' | 'BLOCKED';

export interface ApiStatus {
  state: ApiState;
  errorCount: number;
  isBlocked: boolean;
  blockedUntil: number;
  blockReason?: string | null;
}
type ApiGuardListener = (status: ApiStatus) => void;

export class ApiGuard {
  private errors: ErrorRecord[] = [];
  private status: ApiStatus = {
    state: 'HEALTHY',
    errorCount: 0,
    isBlocked: false,
    blockedUntil: 0,
    blockReason: null,
  };
  private listeners: ApiGuardListener[] = [];
  private unblockTimeout: number | null = null;

  constructor() {
    this.restorePersistedBlock();
  }

  // Restore an in-progress cooldown across reloads so we don't immediately
  // thrash the API with requests that are still rate-limited.
  private restorePersistedBlock() {
    const persisted = safeGetItem<{ blockedUntil: number; blockReason: string | null } | null>(
      STORAGE_KEYS.API_GUARD,
      null
    );

    if (persisted && Date.now() < persisted.blockedUntil) {
      this.status = {
        ...this.status,
        state: 'BLOCKED',
        isBlocked: true,
        blockedUntil: persisted.blockedUntil,
        blockReason: persisted.blockReason,
      };

      const remaining = persisted.blockedUntil - Date.now();
      this.unblockTimeout = window.setTimeout(() => {
        this.reset();
      }, remaining + 500);
    } else if (persisted) {
      // Stale cooldown — clear it.
      safeSetItem(STORAGE_KEYS.API_GUARD, null);
    }
  }

  public subscribe(listener: ApiGuardListener): () => void {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getStatus(): ApiStatus {
    return { ...this.status };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  private updateStatus(updates: Partial<ApiStatus>) {
    this.status = { ...this.status, ...updates };
    this.notifyListeners();
  }

  public recordError(error?: any) {
    const now = Date.now();
    if (this.status.isBlocked) return;

    const errorMsg = error instanceof Error ? error.message : String(error);
    const status = (error as any)?.status;

    // Fatal Client Errors do NOT trip the circuit breaker
    const isFatalClientError =
      errorMsg.includes('API key not valid') ||
      errorMsg.includes('INVALID_ARGUMENT') ||
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 405;

    if (isFatalClientError) {
      console.warn('[ApiGuard] Non-circuit-breaking error occurred:', errorMsg);
      return;
    }

    this.errors.push({ timestamp: now });
    this.cleanupOldErrors();

    const errorCount = this.errors.length;
    let blockReason = null;

    if (
      status === 429 ||
      errorMsg.includes('429') ||
      new RegExp('resource_exhausted|quota', 'i').test(errorMsg)
    ) {
      blockReason = 'API Quota Exceeded. Pausing requests to reset limits.';
    }

    this.updateStatus({ errorCount });

    if (errorCount >= ERROR_THRESHOLD) {
      const blockedUntil = now + COOLDOWN_MS;
      this.errors = [];
      this.updateStatus({
        state: 'BLOCKED',
        isBlocked: true,
        blockedUntil: blockedUntil,
        blockReason: blockReason || 'Too many system errors. Pausing API calls.',
      });

      // Persist the cooldown so a page reload keeps respecting it.
      safeSetItem(STORAGE_KEYS.API_GUARD, {
        blockedUntil,
        blockReason: this.status.blockReason,
      });

      console.error(`[ApiGuard] Circuit breaker tripped. Reason: ${this.status.blockReason}`);

      if (this.unblockTimeout) clearTimeout(this.unblockTimeout);

      this.unblockTimeout = window.setTimeout(() => {
        this.reset();
      }, COOLDOWN_MS + 500);
    } else if (errorCount > 0) {
      this.updateStatus({ state: 'DEGRADED' });
    }
  }

  public isBlocked(): boolean {
    if (this.status.isBlocked) {
      if (Date.now() < this.status.blockedUntil) {
        return true;
      } else {
        this.reset();
        return false;
      }
    }
    return false;
  }

  public reset() {
    const wasBlocked = this.status.isBlocked;
    this.errors = [];
    if (this.unblockTimeout) {
      clearTimeout(this.unblockTimeout);
      this.unblockTimeout = null;
    }
    // Clear any persisted cooldown.
    safeSetItem(STORAGE_KEYS.API_GUARD, null);
    this.updateStatus({
      state: 'HEALTHY',
      errorCount: 0,
      isBlocked: false,
      blockedUntil: 0,
      blockReason: null,
    });
    if (wasBlocked) {
      console.log('[ApiGuard] Cooldown period ended. API calls are now permitted.');
    }
  }

  private cleanupOldErrors() {
    const now = Date.now();
    this.errors = this.errors.filter((error) => now - error.timestamp < TIME_WINDOW_MS);
    this.updateStatus({ errorCount: this.errors.length });
  }
}
export const apiGuard = new ApiGuard();

// --- API Usage Monitor ---
interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}
export interface ApiMonitorStatus {
  sessionCalls: number;
  sessionTokens: number;
  totalCalls: number;
  totalTokens: number;
}
type ApiMonitorListener = (status: ApiMonitorStatus) => void;

class ApiMonitor {
  private status: ApiMonitorStatus;
  private listeners: ApiMonitorListener[] = [];

  constructor() {
    const storedTotals = safeGetItem<{ calls: number; tokens: number }>(STORAGE_KEYS.API_STATS, {
      calls: 0,
      tokens: 0,
    });
    this.status = {
      sessionCalls: 0,
      sessionTokens: 0,
      totalCalls: storedTotals.calls,
      totalTokens: storedTotals.tokens,
    };
  }

  public subscribe(listener: ApiMonitorListener): () => void {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  public recordCall(usageMetadata?: UsageMetadata) {
    const tokensUsed = usageMetadata?.totalTokenCount || 0;

    this.status.sessionCalls++;
    this.status.sessionTokens += tokensUsed;
    this.status.totalCalls++;
    this.status.totalTokens += tokensUsed;

    this.saveTotals();
    this.notifyListeners();
  }

  public resetSession() {
    this.status.sessionCalls = 0;
    this.status.sessionTokens = 0;
    this.notifyListeners();
  }

  public resetAll() {
    this.status = {
      sessionCalls: 0,
      sessionTokens: 0,
      totalCalls: 0,
      totalTokens: 0,
    };
    this.saveTotals();
    this.notifyListeners();
  }

  private saveTotals() {
    safeSetItem(STORAGE_KEYS.API_STATS, {
      calls: this.status.totalCalls,
      tokens: this.status.totalTokens,
    });
  }
}
export const apiMonitor = new ApiMonitor();

// --- Retry Logic & Core Call ---

const isRetryableError = (error: any): boolean => {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const status = (error as any)?.status || (error as any)?.response?.status;

  if ([429, 500, 503, 504].includes(status)) {
    return true;
  }

  if (
    msg.includes('api key') ||
    msg.includes('invalid_argument') ||
    msg.includes('permission_denied') ||
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    msg.includes('safety') ||
    msg.includes('blocked')
  ) {
    return false;
  }

  return true;
};

const isTimeoutError = (error: any): boolean => {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const status = (error as any)?.status;
  return status === 504 || msg.includes('timed out') || msg.includes('timeout');
};

const callGeminiWithRetry = async <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> => {
  if (apiGuard.isBlocked()) {
    throw new ApiKeyError(
      apiGuard.getStatus().blockReason ||
        'API calls are temporarily blocked due to high error rates. Please wait a moment.'
    );
  }

  let attempt = 0;
  let timeoutRetries = 0;
  const callStart = Date.now();
  while (true) {
    try {
      emitEvalProgress({
        phase: attempt === 0 ? 'sending' : 'retrying',
        message: attempt === 0 ? 'Sending to AI...' : `Retrying (attempt ${attempt + 1})...`,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        elapsedMs: Date.now() - callStart,
      });

      const result = await Promise.race([
        apiCall(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                Object.assign(
                  new Error(
                    'API request timed out. The AI model is taking longer than expected — this is common for complex evaluations. Please try again.'
                  ),
                  { status: 504 }
                )
              ),
            API_TIMEOUT
          )
        ),
      ]);

      apiGuard.reset();
      emitEvalProgress({
        phase: 'parsing',
        message: 'Processing response...',
        elapsedMs: Date.now() - callStart,
      });
      return result;
    } catch (error: any) {
      if (error instanceof ProxyUnavailableError) {
        throw error;
      }

      apiGuard.recordError(error);

      const errorMsg = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.status;

      if (
        errorMsg.includes('API key not valid') ||
        status === 403 ||
        errorMsg.includes('PERMISSION_DENIED')
      ) {
        throw new ApiKeyError(
          'Access Denied: Your API Key is invalid, expired, or lacks permission. Please check your settings.'
        );
      }

      if (status === 400 || errorMsg.includes('INVALID_ARGUMENT')) {
        console.error(`[API Fatal] Invalid Request: ${errorMsg}`);
        throw error;
      }

      if (status === 404 || errorMsg.includes('NOT_FOUND')) {
        throw new Error(
          'The selected AI model is unavailable or has been deprecated by the provider. ' +
            'Pick a different engine in the AI Engine selector (admin toolbar).'
        );
      }

      if (status === 429) {
        if (/daily ai limit/i.test(errorMsg)) {
          throw new QuotaExceededError(errorMsg);
        }
        if (isFreeTierZeroQuota(errorMsg)) {
          throw new QuotaExceededError(
            'The selected AI model has no quota on the free Gemini tier (the provider returned limit: 0). ' +
              'Use Gemini 3 Flash for this role in the AI Engine selector, or add billing to your Google AI key.',
            true
          );
        }
        throw new QuotaExceededError(humaniseRateLimitMessage(errorMsg));
      }

      if (!isRetryableError(error)) {
        console.error(`[API Fatal] Non-retryable error: ${errorMsg}`);
        throw error;
      }

      const isTimeout = isTimeoutError(error);
      const effectiveMaxRetries = isTimeout ? MAX_TIMEOUT_RETRIES : maxRetries;

      const isQuotaError =
        status === 429 ||
        errorMsg.includes('429') ||
        new RegExp('rate limit|resource_exhausted|quota', 'i').test(errorMsg);

      if (isTimeout) {
        timeoutRetries++;
        if (timeoutRetries > MAX_TIMEOUT_RETRIES) {
          const elapsed = Math.round((Date.now() - callStart) / 1000);
          console.error(
            `[API Fail] Timed out after ${elapsed}s total (${timeoutRetries} timeout retries).`
          );
          throw new Error(
            `The AI evaluation timed out after ${elapsed} seconds. ` +
              'This can happen with complex questions or slower AI models. ' +
              'Try switching to Gemini Flash in the AI Engine selector, or try again shortly.'
          );
        }
      }

      if (attempt < effectiveMaxRetries) {
        attempt++;
        const baseDelay = BASE_DELAY * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay + jitter, 20000);

        const reason = isTimeout ? 'Timeout' : isQuotaError ? 'Rate Limit' : 'Transient Error';
        console.warn(
          `[API Retry] ${reason} (${errorMsg}). Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${effectiveMaxRetries})`
        );

        emitEvalProgress({
          phase: 'retrying',
          message: isTimeout
            ? `Request timed out — retrying (${attempt}/${effectiveMaxRetries})...`
            : `${reason} — retrying (${attempt}/${effectiveMaxRetries})...`,
          attempt: attempt + 1,
          maxAttempts: effectiveMaxRetries + 1,
          elapsedMs: Date.now() - callStart,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (isQuotaError) {
        throw new QuotaExceededError(
          'Usage Limit Reached: You have exceeded the API quota. Please check your Google AI Studio billing or try again later.'
        );
      }

      const elapsed = Math.round((Date.now() - callStart) / 1000);
      console.error(
        `[API Fail] AI call failed after ${attempt} retries (${elapsed}s total).`,
        error
      );
      throw new Error(
        `AI Service Unavailable after ${elapsed}s: ${unwrapProviderMessage(errorMsg).split('\n')[0].slice(0, 200)}`
      );
    }
  }
};

// --- Request De-duplication ---
// Collapses concurrent identical requests (e.g. a double-clicked "Evaluate")
// into a single in-flight API call so we never pay for the same call twice.
const inFlightRequests = new Map<string, Promise<GenerateContentResponse>>();

const hashRequest = (request: any): string => {
  const str = JSON.stringify(request);
  let h = 0x811c9dc5n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = BigInt.asUintN(64, h * 0x100000001b3n);
  }
  return h.toString(36);
};

const dedupedExecute = async (request: any): Promise<GenerateContentResponse> => {
  const key = hashRequest(request);

  const existing = inFlightRequests.get(key);
  if (existing) {
    console.log('[AI] Reusing in-flight identical request (de-duplicated).');
    return existing;
  }

  const promise = executeGenerateContent(request);
  inFlightRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    inFlightRequests.delete(key);
  }
};

export const generateContentWithRetry = async (request: any): Promise<GenerateContentResponse> => {
  try {
    return await dedupedExecute(request);
  } catch (error) {
    // Free-tier zero-quota fallback: the selected Gemini model can NEVER
    // succeed on this key (limit: 0), so rerun this request on the free-tier
    // Gemini engine and reroute the rest of the session away from the dead
    // model (see aiConfig.resolveTarget). One toast, first time only.
    const fallback = getGeminiFreeTierFallback();
    if (
      error instanceof QuotaExceededError &&
      error.zeroFreeTierQuota &&
      request?.provider === 'gemini' &&
      typeof request?.model === 'string' &&
      request.model !== fallback.model
    ) {
      const firstTime = markModelQuotaDead(request.model);
      if (firstTime) {
        const deadLabel = getModelByProviderModel(request.model)?.label ?? request.model;
        const fallbackLabel = getModelByProviderModel(fallback.model)?.label ?? fallback.model;
        notifyAiNotice(
          `${deadLabel} has no quota on your Gemini key (free tier) — using ${fallbackLabel} instead for this session. ` +
            'Change the engine permanently in the AI Engine selector, or add billing to your Google AI key.'
        );
      }
      console.warn(
        `[AI Fallback] ${request.model} has zero free-tier quota; retrying on ${fallback.model}.`
      );
      emitEvalProgress({
        phase: 'fallback',
        message: `Switching to ${getModelByProviderModel(fallback.model)?.label ?? 'Flash'} (free-tier fallback)...`,
      });
      return dedupedExecute({ ...request, provider: fallback.provider, model: fallback.model });
    }
    throw error;
  }
};

// Builds the request headers, attaching the caller's Supabase access token
// when a session exists so the server-side proxy can authenticate the request.
// In mock mode (Supabase unconfigured) or for guests with no session, only the
// content-type header is sent and the proxy's auth gate is correspondingly off.
const buildProxyHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* no session available — send unauthenticated and let the server decide */
    }
  }
  return headers;
};

// Posts a single request to the server-side proxy. Errors are shaped with a
// `.status` field so the existing ApiGuard / retry logic can classify them
// exactly as it did when the SDK threw status-bearing errors directly.
const callProxy = async (request: any): Promise<GenerateContentResponse> => {
  // Attach an admin-supplied runtime key (local-testing affordance) as a
  // per-request override. Omitted entirely in the common case so normal
  // traffic is unchanged and the server env key is used. See services/runtimeKeys.ts.
  const keyOverride = getRuntimeKeyOverride();
  const payload = keyOverride ? { ...request, __keyOverride: keyOverride } : request;

  // Static hosting (e.g. GitHub Pages without API_BASE_URL): no serverless
  // function exists, so skip the doomed fetch entirely. With runtime keys the
  // provider adapters run directly in the browser; without them we fail fast
  // with a clear message instead of burning a round-trip to get a 404.
  if (IS_STATIC_HOSTING) {
    if (keyOverride) {
      const { callProviderDirect } = await import('./aiDirect');
      return callProviderDirect(payload);
    }
    throw new ProxyUnavailableError(0);
  }

  let res: Response;
  try {
    res = await fetch(GEMINI_PROXY_ENDPOINT, {
      method: 'POST',
      headers: await buildProxyHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    // Network-level failure (DNS, timeout, CORS block, proxy down). When
    // runtime keys are available, try the direct-browser path — the proxy
    // might be unreachable but the provider API could still be reachable.
    if (keyOverride) {
      const { callProviderDirect } = await import('./aiDirect');
      return callProviderDirect(payload);
    }
    throw new Error('Network error contacting the AI service. Please try again.');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      const raw = errBody?.error || errBody?.message || '';
      // Provider errors passed through the proxy nest the text one level down
      // ({ error: { message } }) — unwrap rather than stringifying the object.
      detail =
        typeof raw === 'string'
          ? raw
          : typeof (raw as { message?: unknown })?.message === 'string'
            ? (raw as { message: string }).message
            : '';
      // A 429 carries the caller's spent budget — surface it as the "limit
      // reached" notification instead of just a raw error string.
      if (res.status === 429) observeQuota(errBody?.quota);
    } catch {
      /* response had no JSON body */
    }
    // A 404/405 without a proxy-shaped JSON error means nothing is deployed at
    // the proxy path — a static host (e.g. GitHub Pages without API_BASE_URL)
    // answered the POST with its own error page. With runtime keys pasted, run
    // the provider adapters directly in the browser instead (testing-only
    // fallback; lazy import keeps the adapters out of the common bundle path).
    if ((res.status === 404 || res.status === 405) && !detail) {
      if (keyOverride) {
        const { callProviderDirect } = await import('./aiDirect');
        return callProviderDirect(payload);
      }
      throw new ProxyUnavailableError(res.status);
    }
    const error: any = new Error(detail || `AI service error (${res.status}).`);
    error.status = res.status;
    throw error;
  }

  const json = (await res.json()) as GenerateContentResponse & { __quota?: unknown };
  // The proxy stamps the caller's post-call usage onto every authenticated
  // response so the client can warn as the budget runs low (80% / 100%)
  // without a separate round trip. Ignored downstream; consumers read the
  // provider fields (text / candidates / usageMetadata).
  if (json && typeof json === 'object' && json.__quota) {
    observeQuota(json.__quota as { used: number; limit: number });
  }
  return json as GenerateContentResponse;
};

const executeGenerateContent = async (request: any): Promise<GenerateContentResponse> => {
  const response = await callGeminiWithRetry<GenerateContentResponse>(() => callProxy(request));

  if (response?.usageMetadata) {
    apiMonitor.recordCall(response.usageMetadata);
  }

  if (response?.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.warn(`[Gemini] Candidate finished with reason: ${candidate.finishReason}`);
      if (candidate.finishReason === 'SAFETY') {
        throw new Error(
          'The AI response was blocked due to safety settings. Please modify your prompt and try again.'
        );
      }
      if (candidate.finishReason === 'RECITATION') {
        throw new Error('The AI response was blocked due to recitation (copyright) checks.');
      }
    }
  }

  if (!response?.candidates || response.candidates.length === 0) {
    throw new Error(
      'The AI returned an empty response. This may be due to high demand or content restrictions. Please try again.'
    );
  }

  return response;
};

export const safeJsonParse = <T>(jsonString: string): T | null => {
  if (!jsonString) return null;

  const tryParseCandidate = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const extractBalancedJson = (source: string, startIndex: number): string | null => {
    const stack: string[] = [];
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < source.length; i++) {
      const char = source[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const last = stack.pop();
        if (!last) return null;

        const isMatch = (last === '{' && char === '}') || (last === '[' && char === ']');
        if (!isMatch) return null;

        if (stack.length === 0) {
          return source.slice(startIndex, i + 1);
        }
      }
    }

    return null;
  };

  // 1. Try parsing directly
  const directParse = tryParseCandidate(jsonString);
  if (directParse !== null) return directParse;

  // 2. Try extracting from markdown code blocks
  const markdownMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    const markdownParse = tryParseCandidate(markdownMatch[1]);
    if (markdownParse !== null) {
      return markdownParse;
    }
  }

  // 3. Search line starts for standalone JSON payloads after model prose or thinking traces.
  for (let i = 0; i < jsonString.length; i++) {
    const isLineStart = i === 0 || jsonString[i - 1] === '\n' || jsonString[i - 1] === '\r';
    if (!isLineStart) continue;

    let candidateStart = i;
    while (candidateStart < jsonString.length && /\s/.test(jsonString[candidateStart])) {
      candidateStart++;
    }

    const openingChar = jsonString[candidateStart];
    if (openingChar !== '{' && openingChar !== '[') continue;

    const candidate = extractBalancedJson(jsonString, candidateStart);
    if (!candidate) continue;

    const parsedCandidate = tryParseCandidate(candidate);
    if (parsedCandidate !== null) {
      return parsedCandidate;
    }
  }

  return null;
};
