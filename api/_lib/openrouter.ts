/**
 * OpenRouter proxy adapter.
 *
 * OpenRouter (https://openrouter.ai) exposes a single OpenAI-compatible
 * endpoint that fronts dozens of popular open-source models — GLM, DeepSeek,
 * Llama, Qwen, Mistral and more — so one key + one adapter unlocks the whole
 * catalogue. Pick the model with an OpenRouter slug (e.g. `z-ai/glm-4.6`) in
 * the registry (services/aiModels.ts).
 *
 * Like the Anthropic adapter, the client builds Gemini-shaped requests and
 * consumes a `{ text, candidates, usageMetadata }` envelope; this module
 * translates to the OpenAI Chat Completions shape and back, so nothing else in
 * the app changes. The translation is split into pure functions for testing.
 */

import type { ProxyResult } from './generate';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MAX_TOKENS = 8192;

interface GeminiLikeRequest {
  model?: string;
  contents?: { parts?: Array<{ text?: string }> } | Array<{ parts?: Array<{ text?: string }> }>;
  config?: {
    responseMimeType?: string;
    responseSchema?: unknown;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export interface OpenRouterMessage {
  role: 'system' | 'user';
  content: string;
}

export interface OpenRouterRequestBody {
  model: string;
  max_tokens: number;
  messages: OpenRouterMessage[];
  temperature?: number;
}

/** Flattens Gemini `contents` (object or array form) into a single prompt string. */
const extractPromptText = (contents: GeminiLikeRequest['contents']): string => {
  if (!contents) return '';
  const blocks = Array.isArray(contents) ? contents : [contents];
  const texts: string[] = [];
  for (const block of blocks) {
    for (const part of block?.parts || []) {
      if (typeof part?.text === 'string') texts.push(part.text);
    }
  }
  return texts.join('\n').trim();
};

/**
 * Builds the OpenAI/OpenRouter request body from a Gemini-shaped request. As
 * with the Anthropic adapter, a JSON request becomes a system message that
 * enforces JSON-only output (plus the schema when supplied) — relying on the
 * prompt rather than `response_format`, which not every open model on
 * OpenRouter supports.
 */
export const geminiToOpenRouterRequest = (
  request: GeminiLikeRequest,
  fallbackModel = 'z-ai/glm-4.6'
): OpenRouterRequestBody => {
  const prompt = extractPromptText(request.contents);
  const config = request.config || {};

  const messages: OpenRouterMessage[] = [];
  if (config.responseMimeType === 'application/json') {
    const systemParts = [
      'Respond with ONLY a single valid JSON value. Do not wrap it in markdown ' +
        'code fences and do not add any prose before or after the JSON.',
    ];
    if (config.responseSchema) {
      systemParts.push(
        'The JSON MUST conform to this schema (field names are case-sensitive):\n' +
          JSON.stringify(config.responseSchema)
      );
    }
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  messages.push({ role: 'user', content: prompt });

  const body: OpenRouterRequestBody = {
    model: request.model || fallbackModel,
    max_tokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
    messages,
  };
  if (typeof config.temperature === 'number') body.temperature = config.temperature;
  return body;
};

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const mapFinishReason = (reason?: string): string => {
  switch (reason) {
    case 'length':
      return 'MAX_TOKENS';
    case 'content_filter':
      return 'SAFETY';
    case 'stop':
    case 'tool_calls':
    default:
      return 'STOP';
  }
};

/**
 * Maps an OpenAI-style chat completion into the client's expected envelope:
 * a flattened top-level `text`, a single candidate with a mapped finishReason,
 * and Gemini-style `usageMetadata`.
 */
export const openRouterToClientResponse = (response: OpenRouterResponse): unknown => {
  const choice = response.choices?.[0];
  const text = choice?.message?.content ?? '';

  const input = response.usage?.prompt_tokens || 0;
  const output = response.usage?.completion_tokens || 0;

  return {
    text,
    candidates: [
      {
        finishReason: mapFinishReason(choice?.finish_reason),
        content: { parts: [{ text }] },
      },
    ],
    usageMetadata: {
      promptTokenCount: input,
      candidatesTokenCount: output,
      totalTokenCount: input + output,
    },
  };
};

/**
 * Runs a single OpenRouter call for a Gemini-shaped request. Errors carry the
 * upstream status so the client's ApiGuard/retry logic classifies them exactly
 * as it does for the Gemini and Anthropic paths.
 */
export const runOpenRouterProxy = async (
  apiKey: string | undefined,
  request: unknown
): Promise<ProxyResult> => {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server is missing OPENROUTER_API_KEY configuration.' },
    };
  }
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  const body = geminiToOpenRouterRequest(request as GeminiLikeRequest);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        // Optional attribution headers OpenRouter uses for its rankings.
        'X-Title': 'HSC AI Evaluator',
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'OpenRouter request failed.';
    return { status: 502, body: { error: message } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: res.status || 502,
      body: { error: 'OpenRouter returned a non-JSON response.' },
    };
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = json as any;
    const message = err?.error?.message || err?.message || `OpenRouter error (${res.status}).`;
    return { status: res.status, body: { error: message } };
  }

  return { status: 200, body: openRouterToClientResponse(json as OpenRouterResponse) };
};
