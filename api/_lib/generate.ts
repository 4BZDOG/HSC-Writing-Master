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
    const start = Date.now();
    // The timer handle is kept so it can be cleared once the race settles.
    // An uncleared 55s timer keeps the Node event loop alive well after the
    // response has been sent — which in the Vite dev middleware means one
    // stray timer per request, and on the serverless side delays the freeze.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await Promise.race([
      ai.models.generateContent(request as any),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              Object.assign(
                new Error(
                  'Server-side timeout: the AI model took too long to respond. This usually means the request is too complex for the current plan limits. Try using Gemini Flash, or upgrade your Vercel plan for longer function timeouts.'
                ),
                { status: 504 }
              )
            ),
          55_000
        );
      }),
    ]).finally(() => clearTimeout(timeoutId));
    const elapsed = Date.now() - start;

    return {
      status: 200,
      body: {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
        promptFeedback: response.promptFeedback,
        // `text` is a getter — read it so it survives JSON serialisation.
        text: response.text,
        __elapsedMs: elapsed,
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
