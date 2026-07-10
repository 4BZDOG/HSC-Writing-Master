import { GoogleGenAI } from '@google/genai';

/**
 * Shared Gemini proxy logic, used by both the Vercel serverless function
 * (api/gemini.ts) and the Vite dev-server middleware (vite.config.ts).
 *
 * The API key normally lives ONLY on the server side — this module is
 * imported by the serverless function and the dev middleware, both of which
 * run in Node. The one exception is the direct-from-browser testing fallback
 * (services/aiDirect.ts), which runs these adapters client-side with an
 * admin's pasted runtime key when no proxy is deployed (static hosting).
 *
 * NOTE: this directory is prefixed with `_`, so Vercel does not treat it as
 * an API route — it is a plain shared library.
 */

export interface ProxyResult {
  status: number;
  body: unknown;
}

/**
 * Runs a single generateContent call against Gemini and returns a
 * JSON-serialisable result. Critically, `text` is a getter on the SDK's
 * response object and would be lost over JSON, so we read it explicitly
 * alongside the other fields the client consumes.
 */
export const runGeminiProxy = async (
  apiKey: string | undefined,
  request: unknown
): Promise<ProxyResult> => {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server is missing GEMINI_API_KEY configuration.' },
    };
  }

  if (!request || typeof request !== 'object') {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await ai.models.generateContent(request as any);

    return {
      status: 200,
      body: {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
        promptFeedback: response.promptFeedback,
        // `text` is a getter — read it so it survives JSON serialisation.
        text: response.text,
      },
    };
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const rawStatus = err?.status ?? err?.response?.status;
    const status = typeof rawStatus === 'number' ? rawStatus : 500;
    const message = error instanceof Error ? error.message : 'AI request failed.';
    return { status, body: { error: message } };
  }
};
