/**
 * Groq proxy adapter.
 *
 * Groq (https://groq.com) provides ultra-fast inference on open models via an
 * OpenAI-compatible endpoint. The free tier offers generous rate limits on
 * models like Llama 3.3 70B and Gemma 2 9B — no billing required.
 *
 * Like the OpenRouter adapter, the client builds Gemini-shaped requests and
 * consumes a `{ text, candidates, usageMetadata }` envelope; this module
 * translates to the OpenAI Chat Completions shape and back.
 */

import type { ProxyResult } from './generate';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
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

export interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GroqRequestBody {
  model: string;
  max_tokens: number;
  messages: GroqMessage[];
  temperature?: number;
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

/**
 * Builds the OpenAI/Groq request body from a Gemini-shaped request. JSON
 * requests get a system message enforcing JSON-only output plus the schema
 * when supplied — Groq supports `response_format: { type: "json_object" }`
 * but the system-prompt approach is more reliable across all their models.
 */
export const geminiToGroqRequest = (
  request: GeminiLikeRequest,
  fallbackModel = 'llama-3.3-70b-versatile'
): GroqRequestBody => {
  const prompt = extractPromptText(request.contents);
  const config = request.config || {};

  const messages: GroqMessage[] = [];
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

  const body: GroqRequestBody = {
    model: request.model || fallbackModel,
    max_tokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
    messages,
  };
  if (typeof config.temperature === 'number') body.temperature = config.temperature;
  return body;
};

interface GroqResponse {
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

export const groqToClientResponse = (response: GroqResponse): unknown => {
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

export const runGroqProxy = async (
  apiKey: string | undefined,
  request: unknown
): Promise<ProxyResult> => {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server is missing GROQ_API_KEY configuration.' },
    };
  }
  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  const body = geminiToGroqRequest(request as GeminiLikeRequest);

  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Groq request failed.';
    return { status: 502, body: { error: message } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: res.status || 502,
      body: { error: 'Groq returned a non-JSON response.' },
    };
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = json as any;
    const message = err?.error?.message || err?.message || `Groq error (${res.status}).`;
    return { status: res.status, body: { error: message } };
  }

  return { status: 200, body: groqToClientResponse(json as GroqResponse) };
};
