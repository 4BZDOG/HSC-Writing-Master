/**
 * What one AI call may cost, decided on the server.
 *
 * The proxy meters calls by COUNT (consume_ai_quota, schema §11), and until this
 * existed it forwarded whatever the browser sent: any provider, any model string,
 * any prompt size and any output limit. A signed-in free account could therefore
 * send each of its daily calls to the most expensive model in the registry, with a
 * prompt of most of a megabyte and no output cap, and every one of them counted as
 * a single unit. Priced at Gemini 3.1 Pro's rate above 200k input tokens, that is
 * dollars a call, against a plan that pays nothing. See projectDocs/cost-model.md.
 *
 * Three limits, so a call's cost is bounded before it reaches a provider:
 *
 *   1. MODEL. Only the models the app itself offers (services/aiModels.ts,
 *      mirrored in ALLOWED_MODELS below and pinned by tests/unit/requestGuard
 *      .test.ts). A caller who brings their own key for that provider (the admin
 *      runtime-key modal) is paying, and is not held to the list.
 *   2. SIZE. The prompt and the output a STUDENT-sized call can ask for. The
 *      largest prompt the app builds for a student is a 20-mark marking run, at
 *      about 22,000 characters; the envelope is several times that. A request
 *      over it is allowed only for staff, whose syllabus imports and studio
 *      batches legitimately run larger, and the role is looked up only then.
 *   3. THINKING. A thinking budget above the most the app ever asks for (4,096,
 *      on marking) is lowered to it for a student-sized call.
 *
 * Pure apart from the role lookup the caller passes in, so the decision is tested
 * without a provider.
 */

/** The provider and model pairs the app offers. Mirrors AI_MODELS. */
export const ALLOWED_MODELS: ReadonlyArray<readonly [provider: string, model: string]> = [
  ['gemini', 'gemini-3-flash-preview'],
  ['gemini', 'gemini-3.1-pro-preview'],
  ['gemini', 'gemini-3.8-flash'],
  ['anthropic', 'claude-sonnet-4-6'],
  ['anthropic', 'claude-haiku-4-5'],
  ['anthropic', 'claude-sonnet-5'],
  ['anthropic', 'claude-opus-5'],
  ['groq', 'llama-3.3-70b-versatile'],
  ['groq', 'meta-llama/llama-4-scout-17b-16e-instruct'],
  ['groq', 'gemma2-9b-it'],
  ['kimi', 'kimi-k3'],
  ['openrouter', 'openrouter/free'],
  ['openrouter', 'moonshotai/kimi-k3'],
  ['openrouter', 'z-ai/glm-4.6'],
  ['openrouter', 'deepseek/deepseek-chat'],
  ['openrouter', 'qwen/qwen-2.5-72b-instruct'],
  ['openrouter', 'meta-llama/llama-3.3-70b-instruct'],
];

/** The prompt a student-sized call may send, in characters of its JSON. */
export const STUDENT_MAX_INPUT_CHARS = 80_000;
/** The output a student-sized call may ask for, thinking included. */
export const STUDENT_MAX_OUTPUT_TOKENS = 16_384;
/** The most thinking the app asks for (marking); a student-sized call is held to it. */
export const STUDENT_MAX_THINKING_BUDGET = 4_096;

export type GuardVerdict =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

interface GuardRequest {
  provider?: unknown;
  model?: unknown;
  contents?: unknown;
  config?: {
    systemInstruction?: unknown;
    maxOutputTokens?: unknown;
    thinkingConfig?: { thinkingBudget?: unknown } & Record<string, unknown>;
  } & Record<string, unknown>;
  __keyOverride?: Record<string, unknown>;
}

const isAllowedModel = (provider: string, model: unknown): boolean =>
  typeof model === 'string' && ALLOWED_MODELS.some(([p, m]) => p === provider && m === model);

/**
 * The Gemini model a free-tier MARKING runs on, when the deployment chooses one
 * (`FREE_TIER_MARKING_MODEL`, for example `gemini-3-flash-preview`), or null to
 * leave the request's own model. Off unless set. A marking on Gemini 3 Flash
 * costs about a quarter of one on Gemini 3.1 Pro (projectDocs/cost-model.md),
 * but it is a different marker, so the cost-model doc says how to check its
 * marks against the calibration samples before switching. A value that is not
 * one of the app's Gemini models is ignored, loudly.
 */
export const freeTierMarkingModel = (
  configured: string | undefined = process.env.FREE_TIER_MARKING_MODEL
): string | null => {
  const model = configured?.trim();
  if (!model) return null;
  if (!isAllowedModel('gemini', model)) {
    console.warn(
      `[requestGuard] FREE_TIER_MARKING_MODEL="${model}" is not one of the app's Gemini models; ignored.`
    );
    return null;
  }
  return model;
};

/** The prompt's size: what the provider is sent, measured the same way for every provider. */
export const promptChars = (body: GuardRequest): number =>
  JSON.stringify(body.contents ?? '').length +
  JSON.stringify(body.config?.systemInstruction ?? '').length;

/**
 * Checks a proxy request and returns the body to forward, with a student-sized
 * call's limits applied. `isStaff` is asked only when its answer changes the
 * result: a request over a student's envelope, or a Gemini call with no output
 * limit of its own.
 */
export const guardAiRequest = async (
  raw: unknown,
  isStaff: () => Promise<boolean>
): Promise<GuardVerdict> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 400, error: 'Invalid request body.' };
  }
  const body = raw as GuardRequest & Record<string, unknown>;
  const provider = typeof body.provider === 'string' ? body.provider : 'gemini';
  const ownKey = !!body.__keyOverride?.[provider];

  if (!ownKey && !isAllowedModel(provider, body.model)) {
    return {
      ok: false,
      status: 400,
      error: 'That AI model is not offered by this app. Reload the page and try again.',
    };
  }

  const requestedOutput =
    typeof body.config?.maxOutputTokens === 'number' ? body.config.maxOutputTokens : undefined;
  const requestedThinking =
    typeof body.config?.thinkingConfig?.thinkingBudget === 'number'
      ? body.config.thinkingConfig.thinkingBudget
      : undefined;
  const oversized =
    promptChars(body) > STUDENT_MAX_INPUT_CHARS ||
    (requestedOutput !== undefined && requestedOutput > STUDENT_MAX_OUTPUT_TOKENS) ||
    (requestedThinking !== undefined && requestedThinking > STUDENT_MAX_THINKING_BUDGET);

  // Staff are not held to a student's envelope: syllabus imports and studio
  // batches legitimately send and receive more. Asked only when it would change
  // the answer, so most calls cost no lookup.
  const needsRole = oversized || (provider === 'gemini' && requestedOutput === undefined);
  if (needsRole && (ownKey || (await isStaff()))) return { ok: true, body };

  if (oversized) {
    if (promptChars(body) > STUDENT_MAX_INPUT_CHARS) {
      return {
        ok: false,
        status: 413,
        error: 'That request is too large to send. Shorten the text and try again.',
      };
    }
  }

  // A student-sized call: the output ceiling is lowered when it asked for more,
  // and set for Gemini when it asked for none, because Gemini's own default runs
  // to tens of thousands of tokens. The other adapters default to 8,192 already
  // (api/_lib/anthropic.ts and its siblings), and some of their models have
  // contexts smaller than this ceiling, so an unset limit is left to them.
  const config = { ...(body.config ?? {}) };
  if (requestedOutput !== undefined || provider === 'gemini') {
    config.maxOutputTokens = Math.min(
      requestedOutput ?? STUDENT_MAX_OUTPUT_TOKENS,
      STUDENT_MAX_OUTPUT_TOKENS
    );
  }
  if (requestedThinking !== undefined) {
    config.thinkingConfig = {
      ...config.thinkingConfig,
      thinkingBudget: Math.min(requestedThinking, STUDENT_MAX_THINKING_BUDGET),
    };
  }
  return { ok: true, body: { ...body, config } };
};
