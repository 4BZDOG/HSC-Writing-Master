/**
 * Runtime selection of the active AI engine, per role. Persisted to local
 * storage so an admin's choice survives reloads, and exposed as a tiny
 * subscribable store so the UI can react. Defaults to Gemini (see aiModels).
 *
 * `resolveTarget` is what the service layer calls to stamp `{ provider, model }`
 * onto every request; the proxy then routes by `provider`.
 */

import {
  AIRole,
  AIProvider,
  DEFAULT_SELECTION,
  getModelById,
  getModelByProviderModel,
} from './aiModels';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '../utils/storageUtils';

type Selection = Record<AIRole, string>;

const validId = (id: string | undefined, role: AIRole): string => {
  const model = getModelById(id);
  // Only honour a stored id if it still exists and serves this role.
  if (model && model.roles.includes(role)) return model.id;
  return DEFAULT_SELECTION[role];
};

const load = (): Selection => {
  const stored = safeGetItem<Partial<Selection>>(STORAGE_KEYS.AI_CONFIG, {});
  return {
    basic: validId(stored.basic, 'basic'),
    reasoning: validId(stored.reasoning, 'reasoning'),
  };
};

// Module-level snapshot. Replaced (not mutated) on every change so consumers
// using useSyncExternalStore see a stable reference until something actually
// changes.
let selection: Selection = load();
const listeners = new Set<() => void>();

/** Stable snapshot for React's useSyncExternalStore. Do not mutate the result. */
export const getSelectionSnapshot = (): Selection => selection;

export const setSelectedModel = (role: AIRole, id: string): void => {
  const model = getModelById(id);
  if (!model || !model.roles.includes(role)) return; // ignore invalid choices
  if (selection[role] === id) return;
  selection = { ...selection, [role]: id };
  safeSetItem(STORAGE_KEYS.AI_CONFIG, selection);
  listeners.forEach((l) => l());
};

// ----------------------------------------------------------------------------
// Batch override — lets a bulk operation (e.g. the Content Audit Studio)
// route EVERY AI call it makes to one explicitly chosen engine, regardless of
// role, without touching the persisted per-role selection. Set it before the
// batch and clear it in a finally: it is deliberately non-persistent.
// ----------------------------------------------------------------------------

let batchOverride: string | null = null;

/** Route all AI calls to this model until cleared. Pass null to clear. */
export const setBatchModelOverride = (id: string | null): void => {
  batchOverride = id && getModelById(id) ? id : null;
};

export const getBatchModelOverride = (): string | null => batchOverride;

// ----------------------------------------------------------------------------
// Session-level quota-dead rerouting. When the provider tells us a model has
// literally zero quota on the caller's key (Gemini free tier returns 429 with
// `limit: 0` for Pro), every further request to it is guaranteed to fail — and
// each failed call still burns a unit of the user's proxy budget. aiCore marks
// the model dead for this session and resolveTarget silently reroutes to the
// free-tier-capable Gemini Flash until reload.
// ----------------------------------------------------------------------------

const quotaDeadModels = new Set<string>();

/**
 * Record that a provider model string has zero quota on the caller's key.
 * Returns true the first time (callers use this to notify the user once).
 */
export const markModelQuotaDead = (model: string): boolean => {
  if (quotaDeadModels.has(model)) return false;
  quotaDeadModels.add(model);
  // Replace the snapshot reference: the *effective* routing changed, so
  // useSyncExternalStore consumers (e.g. the AI Engine selector's badges)
  // must re-read even though the stored selection ids are the same.
  selection = { ...selection };
  listeners.forEach((l) => l());
  return true;
};

export const isModelQuotaDead = (model: string): boolean => quotaDeadModels.has(model);

/** The free-tier-capable Gemini engine that zero-quota models reroute to. */
export const getGeminiFreeTierFallback = (): { provider: AIProvider; model: string } => {
  const flash = getModelById('gemini-flash')!;
  return { provider: flash.provider, model: flash.model };
};

// ----------------------------------------------------------------------------
// Overload rerouting. A provider model string that is currently returning
// 503/UNAVAILABLE ("high demand") or repeatedly timing out is not dead the way
// a zero-quota model is — it will likely work again later — but retrying it
// for the REST of this call is pointless, so aiCore falls over to a sibling
// model on the same provider for that one request. Preview models in
// particular see this under load; their GA successor is the natural target.
// ----------------------------------------------------------------------------

const OVERLOAD_FALLBACK_MODEL: Record<string, string> = {
  'gemini-3-flash-preview': 'gemini-3.7-flash',
  'gemini-3.1-pro-preview': 'gemini-3.7-flash',
  'gemini-3.7-flash': 'gemini-3-flash-preview',
};

/** The sibling Gemini model to retry on when `model` is persistently
 *  overloaded/unavailable, or null when none is registered for it. */
export const getOverloadFallback = (
  model: string
): { provider: AIProvider; model: string } | null => {
  const fallbackModel = OVERLOAD_FALLBACK_MODEL[model];
  const entry = fallbackModel ? getModelByProviderModel(fallbackModel) : undefined;
  return entry ? { provider: entry.provider, model: entry.model } : null;
};

/** Resolves a role to the concrete provider + model the request should target. */
export const resolveTarget = (role: AIRole): { provider: AIProvider; model: string } => {
  let target: { provider: AIProvider; model: string };
  if (batchOverride && getModelById(batchOverride)) {
    const forced = getModelById(batchOverride)!;
    target = { provider: forced.provider, model: forced.model };
  } else {
    const option = getModelById(selection[role]) || getModelById(DEFAULT_SELECTION[role])!;
    target = { provider: option.provider, model: option.model };
  }
  // Reroute models known to have zero quota on this key (Gemini only — the
  // fallback engine is Gemini Flash, so swapping providers would be wrong).
  if (target.provider === 'gemini' && quotaDeadModels.has(target.model)) {
    const fallback = getGeminiFreeTierFallback();
    if (fallback.model !== target.model) return fallback;
  }
  return target;
};

export const subscribeAiConfig = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
