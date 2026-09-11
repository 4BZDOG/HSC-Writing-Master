import { verifyRequestAuth, extractBearerToken } from './_lib/auth';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';
import { consumeAiQuota, recordAiModelUsage } from './_lib/quota';
import { corsHeadersFor } from './_lib/cors';
import { screenContribution, type ScreenableKind } from './_lib/qualityScreen';

/**
 * Vercel serverless function: POST /api/screen-contribution
 *
 * Scores a shared-library submission so reviewers can triage the queue, and
 * writes that score with the service-role key.
 *
 * Why it is an endpoint at all. The screen used to run in the browser, and the
 * browser then posted the number it got into the row it was inserting. RLS
 * lets an author write their own row, so the score a reviewer sorts on was
 * chosen by the author being sorted — `quality_score: 99` in devtools, or no
 * screen at all. supabase/schema.sql now forbids an end-user session writing
 * those columns; this is the only thing that can.
 *
 * Everything the verdict depends on is therefore the server's: the wording of
 * the screening prompt (api/_lib/qualityScreen.ts) and the content itself,
 * which is read back OUT of the database by row id rather than taken from the
 * request body. The client sends only which row to look at.
 *
 * Fail-open, deliberately. A student has already written and submitted their
 * work by the time this runs; an AI outage, a spent quota or a missing service
 * key must not lose it. Every such case answers 200 with `screened: false` and
 * the row stays unscored — and unscored sorts to the TOP of the review queue,
 * so the failure surfaces as a human looking sooner, not as content slipping
 * through. The genuine refusals (not signed in, not your row) still 4xx.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY alongside the SUPABASE_URL /
 * SUPABASE_ANON_KEY pair the AI proxy already needs. Without it the screen is
 * simply off and every contribution arrives unscored.
 */

// Minimal structural types so we don't need the @vercel/node dependency.
interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/** Where each screenable kind lives, and which column holds the screened text. */
const TARGET: Record<ScreenableKind, { table: string; contentColumn: string }> = {
  prompt: { table: 'prompts', contentColumn: 'question' },
  sample_answer: { table: 'sample_answers', contentColumn: 'answer' },
};

const isScreenableKind = (value: unknown): value is ScreenableKind =>
  value === 'prompt' || value === 'sample_answer';

/** Postgres will reject a malformed uuid anyway; refuse it before spending a round trip. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    if (cors && res.end) {
      res.status(204);
      res.end();
    } else {
      res.status(403).json({ error: 'Cross-origin access is not enabled for this origin.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const body = (req.body ?? {}) as { kind?: unknown; id?: unknown };
  if (!isScreenableKind(body.kind) || typeof body.id !== 'string' || !UUID.test(body.id)) {
    res.status(400).json({ error: 'Expected { kind: "prompt" | "sample_answer", id: <uuid> }.' });
    return;
  }
  const { table, contentColumn } = TARGET[body.kind];

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  const admin = getSupabaseAdmin();
  if (!admin || !auth.userId) {
    // No service-role key (or no Supabase at all, so nothing to attribute the
    // row to). Nothing here can run; the contribution is already saved.
    res.status(200).json({ screened: false, reason: 'unavailable' });
    return;
  }

  // The column list is built from `contentColumn`, so supabase-js cannot parse
  // it into a row type at compile time — say what comes back instead.
  const { data, error } = await admin
    .from(table)
    .select(`id, created_by, ${contentColumn}`)
    .eq('id', body.id)
    .maybeSingle<Record<string, unknown>>();
  if (error) {
    console.warn('[screen-contribution] could not read the row:', error.message);
    res.status(200).json({ screened: false, reason: 'unavailable' });
    return;
  }
  const row = data;
  if (!row) {
    res.status(404).json({ error: 'No such contribution.' });
    return;
  }
  // Authors screen their own submissions and nothing else. This runs with the
  // service-role key and spends the provider budget, so without this check any
  // signed-in user could point it at every row in the library.
  if (row.created_by !== auth.userId) {
    res.status(403).json({ error: 'You can only screen your own contribution.' });
    return;
  }

  const content = typeof row[contentColumn] === 'string' ? (row[contentColumn] as string) : '';
  if (!content.trim()) {
    res.status(200).json({ screened: false, reason: 'empty' });
    return;
  }

  // Metered like any other call a student's action causes — one unit of their
  // daily AI budget — and NOT gated on a paid feature. Screening a shared-
  // library contribution is overhead the library imposes on a volunteer, so
  // refusing it to a free account would be charging for the favour.
  const token = extractBearerToken(authHeader);
  if (token) {
    const quota = await consumeAiQuota(token);
    if (quota && !quota.allowed) {
      res.status(200).json({ screened: false, reason: 'quota' });
      return;
    }
  }

  const verdict = await screenContribution(body.kind, content, {
    gemini: process.env.GEMINI_API_KEY || process.env.API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    kimi: process.env.KIMI_API_KEY,
  });
  if (!verdict) {
    res.status(200).json({ screened: false, reason: 'unavailable' });
    return;
  }

  const { error: writeError } = await admin
    .from(table)
    .update({
      quality_score: verdict.score,
      quality_notes: verdict.notes,
      quality_screened_at: new Date().toISOString(),
    })
    .eq('id', body.id);
  if (writeError) {
    console.warn('[screen-contribution] could not store the score:', writeError.message);
    res.status(200).json({ screened: false, reason: 'unavailable' });
    return;
  }

  // Reporting only, and best-effort: recordAiModelUsage swallows its own
  // failures, so a broken tally never costs the student their score.
  if (token) {
    const model = process.env.QUALITY_SCREEN_MODEL || 'gemini-3-flash-preview';
    await recordAiModelUsage(token, model);
  }

  res.status(200).json({ screened: true, score: verdict.score, notes: verdict.notes });
}
