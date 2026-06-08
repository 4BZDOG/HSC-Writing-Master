import { runGeminiProxy } from './_lib/generate';

/**
 * Vercel serverless function: POST /api/gemini
 *
 * Proxies Gemini generateContent calls so the API key stays server-side.
 * The client (services/aiCore.ts) posts the full request object here; this
 * function injects the key from the environment and returns the response.
 *
 * Configure `GEMINI_API_KEY` in the Vercel project's Environment Variables.
 * (`API_KEY` is accepted as a fallback for the AI Studio convention.)
 */

// Minimal structural types so we don't need the @vercel/node dependency.
interface RequestLike {
  method?: string;
  body?: unknown;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const result = await runGeminiProxy(apiKey, req.body);
  res.status(result.status).json(result.body);
}
