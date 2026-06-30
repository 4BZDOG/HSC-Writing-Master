/**
 * Runtime selection of the active AI engine, per role. Persisted to local
 * storage so an admin's choice survives reloads, and exposed as a tiny
 * subscribable store so the UI can react. Defaults to Gemini (see aiModels).
 *
 * `resolveTarget` is what the service layer calls to stamp `{ provider, model }`
 * onto every request; the proxy then routes by `provider`.
 */

import { AIRole, AIProvider, DEFAULT_SELECTION, getModelById } from './aiModels';
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

/** Resolves a role to the concrete provider + model the request should target. */
export const resolveTarget = (role: AIRole): { provider: AIProvider; model: string } => {
  const option = getModelById(selection[role]) || getModelById(DEFAULT_SELECTION[role])!;
  return { provider: option.provider, model: option.model };
};

export const subscribeAiConfig = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
