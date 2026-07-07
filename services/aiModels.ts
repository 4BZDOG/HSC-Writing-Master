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

export type AIProvider = 'gemini' | 'anthropic' | 'openrouter';
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
  /**
   * Rough USD cost of ONE proxied call, for the admin dashboard's spend
   * estimate. The quota system counts calls, not tokens, so this is a blended
   * estimate for a typical marking-sized exchange (~2k input + ~1k output
   * tokens) at the provider's Jan-2026 list price — good enough to compare
   * engines and sanity-check a day's spend, not an invoice. Update alongside
   * the model when prices move.
   */
  estCostPerCall: number;
}

export const AI_MODELS: AIModelOption[] = [
  {
    id: 'gemini-flash',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    // Flash is offered for BOTH roles: on the Gemini free tier, Pro has zero
    // quota (429 limit:0), so Flash must be selectable for marking too or a
    // free key can never run the reasoning path.
    description:
      'Fast and economical. Good for generation, parsing and suggestions — and the only Gemini option that works on a free-tier key.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GEMINI_API_KEY',
    estCostPerCall: 0.0008,
  },
  {
    id: 'gemini-pro',
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    description:
      'Higher-order reasoning. Used for marking and exemplar generation. Requires a billing-enabled key (no free-tier quota).',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GEMINI_API_KEY',
    estCostPerCall: 0.006,
  },
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Strong reasoning with a good speed/cost balance. Requires ANTHROPIC_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'ANTHROPIC_API_KEY',
    estCostPerCall: 0.009,
  },
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Fast and economical Claude tier. Requires ANTHROPIC_API_KEY.',
    roles: ['basic'],
    keyEnv: 'ANTHROPIC_API_KEY',
    estCostPerCall: 0.0022,
  },

  // --- Open-source models via OpenRouter -----------------------------------
  // One OPENROUTER_API_KEY (openrouter.ai/keys) unlocks the whole catalogue;
  // add more by copying an entry and changing `model` to any OpenRouter slug.
  {
    id: 'openrouter-free',
    provider: 'openrouter',
    model: 'openrouter/free',
    label: 'Free Models Router (OpenRouter)',
    description:
      'Auto-picks an available zero-cost model. The right choice for keyless/free OpenRouter accounts — the named models below are paid slugs and will be rejected without credits. Free accounts are capped at 50 requests/day (1,000/day once US$10 credit is added).',
    roles: ['basic', 'reasoning'],
    keyEnv: 'OPENROUTER_API_KEY',
    estCostPerCall: 0,
  },
  {
    id: 'openrouter-glm',
    provider: 'openrouter',
    model: 'z-ai/glm-4.6',
    label: 'GLM 4.6 (OpenRouter)',
    description: 'Zhipu AI open model with strong reasoning. Requires OPENROUTER_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'OPENROUTER_API_KEY',
    estCostPerCall: 0.0015,
  },
  {
    id: 'openrouter-deepseek',
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat',
    label: 'DeepSeek V3 (OpenRouter)',
    description: 'Capable open reasoning model at low cost. Requires OPENROUTER_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'OPENROUTER_API_KEY',
    estCostPerCall: 0.001,
  },
  {
    id: 'openrouter-qwen',
    provider: 'openrouter',
    model: 'qwen/qwen-2.5-72b-instruct',
    label: 'Qwen 2.5 72B (OpenRouter)',
    description: 'Alibaba open model, strong all-rounder. Requires OPENROUTER_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'OPENROUTER_API_KEY',
    estCostPerCall: 0.0009,
  },
  {
    id: 'openrouter-llama',
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B (OpenRouter)',
    description: 'Meta open model, fast and economical. Requires OPENROUTER_API_KEY.',
    roles: ['basic'],
    keyEnv: 'OPENROUTER_API_KEY',
    estCostPerCall: 0.0007,
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

/** Estimated USD-per-call for a model id (0 when the id is unknown). */
export const estCostForModelId = (id: string | undefined): number =>
  getModelById(id)?.estCostPerCall ?? 0;

/**
 * Look up a registry entry by its provider model STRING (the `model` field,
 * e.g. `gemini-3-pro-preview`) rather than its `id`. The usage tally records
 * the provider string, so this is how the dashboard prices/labels a row.
 */
export const getModelByProviderModel = (model: string | undefined): AIModelOption | undefined =>
  AI_MODELS.find((m) => m.model === model);
