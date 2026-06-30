/**
 * Registry of selectable AI engines. This is the single source of truth for
 * "which AIs can this app run on". Adding a new model (or a whole new provider)
 * is a matter of appending an entry here — the proxy routes by `provider` and
 * the admin selector renders straight from this list.
 *
 * Two logical *roles* exist throughout the app:
 *   - 'basic'     → fast / cheap calls (generation, parsing, suggestions)
 *   - 'reasoning' → high-stakes calls (marking, rubric/sample generation)
 *
 * A model can serve one or both roles. The active model per role is chosen at
 * runtime (see services/aiConfig.ts) and defaults to Gemini so existing
 * behaviour is unchanged until an admin switches it.
 */

export type AIProvider = 'gemini' | 'anthropic';
export type AIRole = 'basic' | 'reasoning';

export interface AIModelOption {
  /** Stable id used for persistence + the UI selector. */
  id: string;
  provider: AIProvider;
  /** The provider-specific model string sent to the API. */
  model: string;
  label: string;
  description: string;
  /** Which logical roles this model is offered for. */
  roles: AIRole[];
  /** Server-side env var that must hold the provider's key for this to work. */
  keyEnv: string;
}

export const AI_MODELS: AIModelOption[] = [
  {
    id: 'gemini-flash',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: 'Fast and economical. Good for generation, parsing and suggestions.',
    roles: ['basic'],
    keyEnv: 'GEMINI_API_KEY',
  },
  {
    id: 'gemini-pro',
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    description: 'Higher-order reasoning. Used for marking and exemplar generation.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GEMINI_API_KEY',
  },
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Strong reasoning with a good speed/cost balance. Requires ANTHROPIC_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Fast and economical Claude tier. Requires ANTHROPIC_API_KEY.',
    roles: ['basic'],
    keyEnv: 'ANTHROPIC_API_KEY',
  },
];

/** Falls back to Gemini so nothing changes until an admin picks otherwise. */
export const DEFAULT_SELECTION: Record<AIRole, string> = {
  basic: 'gemini-flash',
  reasoning: 'gemini-pro',
};

export const getModelById = (id: string | undefined): AIModelOption | undefined =>
  AI_MODELS.find((m) => m.id === id);

export const modelsForRole = (role: AIRole): AIModelOption[] =>
  AI_MODELS.filter((m) => m.roles.includes(role));
