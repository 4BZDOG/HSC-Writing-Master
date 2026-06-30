import { runAiProxy } from './_lib/providers';

/**
 * Vercel serverless function: POST /api/gemini
 *
 * Proxies AI generateContent calls so provider keys stay server-side. The
 * client (services/aiCore.ts) posts the full request object here — tagged with
 * a `provider` — and this function routes to the matching provider, injecting
 * the key from the environment and returning the response. The path is named
 * `/api/gemini` for backwards compatibility but serves every provider.
 *
 * Configure `GEMINI_API_KEY` (Gemini) and optionally `ANTHROPIC_API_KEY`
 * (Claude) in the Vercel project's Environment Variables. (`API_KEY` is
 * accepted as a Gemini fallback for the AI Studio convention.)
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

  const keys = {
    gemini: process.env.GEMINI_API_KEY || process.env.API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  const result = await runAiProxy(req.body, keys);
  res.status(result.status).json(result.body);
}
