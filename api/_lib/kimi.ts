/**
 * Kimi (Moonshot AI) proxy adapter.
 *
 * Kimi (https://platform.kimi.ai) provides OpenAI-compatible chat completions.
 * K3 is a strong reasoning model at low cost — competitive with frontier models
 * on benchmarks. Get a key from https://platform.kimi.ai/
 *
 * Like the Groq/OpenRouter adapters, the client builds Gemini-shaped requests
 * and consumes a `{ text, candidates, usageMetadata }` envelope; this module
 * translates to the OpenAI Chat Completions shape and back.
 */

import type { ProxyResult } from './generate';

const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions';
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

export interface KimiMessage {
  role: 'system' | 'user';
  content: string;
}

export interface KimiRequestBody {
  model: string;
  max_tokens: number;
  messages: KimiMessage[];
}

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

export const geminiToKimiRequest = (
  request: GeminiLikeRequest,
  fallbackModel = 'kimi-k3'
): KimiRequestBody => {
  const prompt = extractPromptText(request.contents);
  const config = request.config || {};

  const messages: KimiMessage[] = [];
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

  const body: KimiRequestBody = {
    model: request.model || fallbackModel,
    max_tokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
    messages,
  };
  // Kimi fixes temperature server-side — sending it is a no-op at best and
  // may be rejected, so we intentionally omit it.
  return body;
};

interface KimiResponse {
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

export const kimiToClientResponse = (response: KimiResponse): unknown => {
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

export const runKimiProxy = async (
  apiKey: string | undefined,
  request: unknown
): Promise<ProxyResult> => {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server is missing KIMI_API_KEY configuration.' },
    };
  }
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  const body = geminiToKimiRequest(request as GeminiLikeRequest);

  let res: Response;
  try {
    res = await fetch(KIMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Kimi request failed.';
    return { status: 502, body: { error: message } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: res.status || 502,
      body: { error: 'Kimi returned a non-JSON response.' },
    };
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = json as any;
    const message = err?.error?.message || err?.message || `Kimi error (${res.status}).`;
    return { status: res.status, body: { error: message } };
  }

  return { status: 200, body: kimiToClientResponse(json as KimiResponse) };
};
