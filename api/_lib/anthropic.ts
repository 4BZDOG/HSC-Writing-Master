/**
 * Anthropic (Claude) proxy adapter.
 *
 * The client builds Gemini-shaped requests (`{ model, contents.parts[].text,
 * config: { responseMimeType, responseSchema, temperature, ... } }`). This
 * module translates that shape into an Anthropic Messages API call and maps the
 * response back into the `{ text, candidates, usageMetadata }` envelope the
 * client (services/aiCore.ts) already consumes — so switching provider needs no
 * changes anywhere else.
 *
 * The translation is split into pure functions so it can be unit-tested without
 * a network call or an API key.
 */

import type { ProxyResult } from './generate';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
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

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user'; content: string }>;
  system?: string;
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
 * Builds the Anthropic request body from a Gemini-shaped request. When the
 * caller asked for JSON (`responseMimeType: 'application/json'`), a system
 * instruction enforces JSON-only output; if a `responseSchema` was supplied it
 * is serialised into the system prompt so Claude reproduces the exact field
 * names the downstream Zod validators expect.
 */
export const geminiToAnthropicRequest = (
  request: GeminiLikeRequest,
  fallbackModel = 'claude-sonnet-4-6'
): AnthropicRequestBody => {
  const prompt = extractPromptText(request.contents);
  const config = request.config || {};

  const systemParts: string[] = [];
  if (config.responseMimeType === 'application/json') {
    systemParts.push(
      'Respond with ONLY a single valid JSON value. Do not wrap it in markdown ' +
        'code fences and do not add any prose before or after the JSON.'
    );
    if (config.responseSchema) {
      systemParts.push(
        'The JSON MUST conform to this schema (field names are case-sensitive):\n' +
          JSON.stringify(config.responseSchema)
      );
    }
  }

  const body: AnthropicRequestBody = {
    model: request.model || fallbackModel,
    max_tokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };
  if (systemParts.length > 0) body.system = systemParts.join('\n\n');
  if (typeof config.temperature === 'number') body.temperature = config.temperature;
  return body;
};

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const mapFinishReason = (stopReason?: string): string => {
  switch (stopReason) {
    case 'max_tokens':
      return 'MAX_TOKENS';
    case 'refusal':
      return 'SAFETY';
    case 'end_turn':
    case 'stop_sequence':
    case 'tool_use':
    default:
      return 'STOP';
  }
};

/**
 * Maps an Anthropic Messages response into the client's expected envelope:
 * a flattened top-level `text`, a single STOP-style candidate, and
 * Gemini-style `usageMetadata`.
 */
export const anthropicToClientResponse = (response: AnthropicResponse): unknown => {
  const text = (response.content || [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');

  const input = response.usage?.input_tokens || 0;
  const output = response.usage?.output_tokens || 0;

  return {
    text,
    candidates: [
      {
        finishReason: mapFinishReason(response.stop_reason),
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
 * Runs a single Anthropic call for a Gemini-shaped request. Errors are returned
 * with the upstream status so the client's existing ApiGuard/retry logic can
 * classify them exactly as it does for the Gemini path.
 */
export const runAnthropicProxy = async (
  apiKey: string | undefined,
  request: unknown
): Promise<ProxyResult> => {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server is missing ANTHROPIC_API_KEY configuration.' },
    };
  }
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  const body = geminiToAnthropicRequest(request as GeminiLikeRequest);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Anthropic request failed.';
    return { status: 502, body: { error: message } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: res.status || 502,
      body: { error: 'Anthropic returned a non-JSON response.' },
    };
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = json as any;
    const message = err?.error?.message || err?.message || `Anthropic error (${res.status}).`;
    return { status: res.status, body: { error: message } };
  }

  return { status: 200, body: anthropicToClientResponse(json as AnthropicResponse) };
};
