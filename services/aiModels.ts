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

export type AIProvider = 'gemini' | 'anthropic' | 'openrouter' | 'groq' | 'kimi';
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
    model: 'gemini-3.1-pro-preview', // was gemini-3-pro-preview — Google shut
    // that down 2026-03-09; every call was
    // failing. This is the confirmed live
    // successor.
    label: 'Gemini 3.1 Pro',
    description:
      'Higher-order reasoning. Used for marking and exemplar generation. Requires a billing-enabled key (no free-tier quota).',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GEMINI_API_KEY',
    estCostPerCall: 0.016, // $2/M in + $12/M out, blended 2k-in/1k-out estimate
  },
  {
    id: 'gemini-flash-3-7',
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    description:
      'Newest GA Flash model (Aug 2026) — cheaper and faster than Gemini 3 Flash with improved coding/agentic benchmarks. Free-tier availability is unconfirmed; verify manually before relying on it as a free-tier option.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GEMINI_API_KEY',
    estCostPerCall: 0.0053, // $0.75/M in + $3.75/M out, blended 2k-in/1k-out
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
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    description:
      'Newest Sonnet tier — best combination of speed and intelligence, adaptive thinking. Requires ANTHROPIC_API_KEY.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'ANTHROPIC_API_KEY',
    estCostPerCall: 0.014, // $2/M in + $10/M out, blended 2k-in/1k-out
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    model: 'claude-opus-5',
    label: 'Claude Opus 5',
    description:
      'Top-tier reasoning for complex, high-stakes marking — slower and materially more expensive than Sonnet. Requires ANTHROPIC_API_KEY.',
    roles: ['reasoning'],
    keyEnv: 'ANTHROPIC_API_KEY',
    estCostPerCall: 0.035, // $5/M in + $25/M out, blended 2k-in/1k-out
  },

  // --- Groq (free-tier, ultra-fast inference) --------------------------------
  // Groq provides free API access with generous rate limits (30 req/min,
  // 14,400 req/day on the free tier). Get a key at https://console.groq.com/keys
  {
    id: 'groq-llama',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Groq)',
    description:
      'Ultra-fast inference via Groq. Free tier: 30 req/min, 14,400 req/day. Strong reasoning at zero cost.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'GROQ_API_KEY',
    estCostPerCall: 0,
  },
  {
    id: 'groq-llama-scout',
    provider: 'groq',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B (Groq)',
    description:
      'Lightweight Llama 4 model on Groq free tier. Fast and efficient for generation tasks.',
    roles: ['basic'],
    keyEnv: 'GROQ_API_KEY',
    estCostPerCall: 0,
  },
  {
    id: 'groq-gemma',
    provider: 'groq',
    model: 'gemma2-9b-it',
    label: 'Gemma 2 9B (Groq)',
    description: 'Google Gemma 2 on Groq free tier. Compact and fast for parsing and generation.',
    roles: ['basic'],
    keyEnv: 'GROQ_API_KEY',
    estCostPerCall: 0,
  },

  // --- Kimi (Moonshot AI), direct ------------------------------------------
  // Talks to platform.kimi.ai with its own key. There is a second route to the
  // same model through OpenRouter (`openrouter-kimi-k3` below) — that one needs
  // no Moonshot account, so prefer it unless you already hold a Kimi key or
  // want to bill Moonshot directly.
  {
    id: 'kimi-k3',
    provider: 'kimi',
    model: 'kimi-k3',
    label: 'Kimi K3',
    description:
      'Moonshot AI flagship reasoning model (2.8T params, 1M context). Strong on structured analysis and marking. Requires KIMI_API_KEY from platform.kimi.ai.',
    roles: ['basic', 'reasoning'],
    keyEnv: 'KIMI_API_KEY',
    estCostPerCall: 0.027,
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
    // Kimi K3 through OpenRouter — no Moonshot account needed, so this is the
    // easier of the two routes to it (the direct `kimi-k3` entry above talks to
    // platform.kimi.ai and needs its own key). Same weights either way; pick
    // whichever key the deployment already has.
    //
    // The slug is pinned deliberately. OpenRouter also publishes the floating
    // alias `~moonshotai/kimi-latest`, which quietly re-points as Moonshot
    // ships new versions — fine for chat, wrong for marking, where the engine
    // behind a band ought to be the one that was tested. Swap the `model`
    // string here if you want the alias.
    id: 'openrouter-kimi-k3',
    provider: 'openrouter',
    model: 'moonshotai/kimi-k3',
    label: 'Kimi K3 (OpenRouter)',
    description:
      'Moonshot AI flagship reasoning model, routed through OpenRouter — strong on structured analysis and marking. Requires OPENROUTER_API_KEY with credit (this is a paid slug).',
    roles: ['basic', 'reasoning'],
    keyEnv: 'OPENROUTER_API_KEY',
    // ~US$3/M input + ~US$15/M output at launch pricing, on the registry's
    // standard 2k-in/1k-out marking-sized exchange. Caching discounts are not
    // modelled — this is for comparing engines, not billing.
    estCostPerCall: 0.021,
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
