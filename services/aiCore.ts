import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { safeSetItem, safeGetItem, STORAGE_KEYS } from '../utils/storageUtils';

// --- Constants ---
export const ERROR_THRESHOLD = 15;
const TIME_WINDOW_MS = 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 1000;
const API_TIMEOUT = 90000;
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

// --- Custom Errors ---
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
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
      status === 404;

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
    msg.includes('safety') ||
    msg.includes('blocked')
  ) {
    return false;
  }

  return true;
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
  while (true) {
    try {
      const result = await Promise.race([
        apiCall(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('API request timed out.')), API_TIMEOUT)
        ),
      ]);

      apiGuard.reset();
      return result;
    } catch (error: any) {
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
          'The requested AI model is currently unavailable or deprecated. Please check configuration.'
        );
      }

      if (!isRetryableError(error)) {
        console.error(`[API Fatal] Non-retryable error: ${errorMsg}`);
        throw error;
      }

      const isQuotaError =
        status === 429 ||
        errorMsg.includes('429') ||
        new RegExp('rate limit|resource_exhausted|quota', 'i').test(errorMsg);

      if (attempt < maxRetries) {
        attempt++;
        const baseDelay = BASE_DELAY * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay + jitter, 20000);

        const reason = isQuotaError ? 'Rate Limit' : 'Transient Error';
        console.warn(
          `[API Retry] ${reason} (${errorMsg}). Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (isQuotaError) {
        throw new QuotaExceededError(
          'Usage Limit Reached: You have exceeded the API quota. Please check your Google AI Studio billing or try again later.'
        );
      }

      console.error(`[API Fail] Gemini API call failed after ${attempt} retries.`, error);
      throw new Error(`AI Service Unavailable: ${errorMsg}`);
    }
  }
};

export const generateContentWithRetry = async (request: any): Promise<GenerateContentResponse> => {
  if (!process.env.API_KEY) {
    throw new ApiKeyError(
      'API Key is missing. Please configure your API Key via the selection dialog.'
    );
  }

  const client = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await callGeminiWithRetry<GenerateContentResponse>(() =>
    client.models.generateContent(request)
  );

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
