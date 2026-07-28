import { runAiProxy } from './_lib/providers';
import { verifyRequestAuth, extractBearerToken } from './_lib/auth';
import {
  consumeAiQuota,
  consumeEvaluation,
  recordAiModelUsage,
  resolveCallerPlan,
  type QuotaVerdict,
} from './_lib/quota';
import { corsHeadersFor } from './_lib/cors';
import { isEvaluationRequest, redactEvaluationResponse } from './_lib/entitlements';
import {
  featureFromRequest,
  featureMinPlan,
  monetisationEnabled,
  planUnlocks,
} from './_lib/planPolicy';

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
 *
 * Access control: when the server has Supabase configured (`SUPABASE_URL` +
 * `SUPABASE_ANON_KEY`), the caller must present a valid Supabase bearer token
 * or the request is rejected 401 — this stops anonymous callers from spending
 * the provider budget. See api/_lib/auth.ts for the graceful-degradation rule.
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

/** The provider model string the client stamped on the request (aiConfig
 *  spreads `{ provider, model }` onto every call). Used only for the usage
 *  tally; absent/non-string bodies yield undefined and are simply not counted. */
const requestModel = (body: unknown): string | undefined => {
  const model = (body as { model?: unknown } | null | undefined)?.model;
  return typeof model === 'string' ? model : undefined;
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  // Opt-in CORS for split hosting (static frontend elsewhere, API here).
  // No ALLOWED_ORIGIN configured → no CORS headers → same-origin only.
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    // Preflight: succeed only when the origin was allowed above.
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

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  // Quota gate: one unit of the caller's daily budget per proxied call
  // (per-user override → role/group default, plus the school's shared pool
  // when one is set; see supabase/schema.sql §11–12). Only meaningful for
  // authenticated callers — when auth is disabled (no Supabase) there is no
  // identity to meter, matching the auth gate.
  let quota: QuotaVerdict | null = null;
  // Whether this call is a marking run, and whether its result has to be
  // trimmed to what the free tier has paid for (decided below, applied to the
  // provider response at the end of the handler).
  let isEvaluation = false;
  let onFreeTier = false;
  if (auth.userId) {
    const token = extractBearerToken(authHeader);

    // Paywall gate: marking an answer is the metered product feature (schema
    // §14). Checked BEFORE the AI budget so a refused evaluation doesn't spend
    // a call the user never got. Only bites on the free tier; staff and paid
    // plans resolve to unlimited server-side.
    if (token && isEvaluationRequest(req.body)) {
      isEvaluation = true;
      const evaluations = await consumeEvaluation(token);
      if (evaluations && !evaluations.allowed) {
        res.status(402).json({
          error: `You've used all ${evaluations.limit} free evaluations for today. Upgrade to Plus for unlimited marking.`,
          upgradeRequired: true,
          evaluations,
        });
        return;
      }
      // The verdict doubles as the caller's plan: `unlimited` is true for
      // staff, paid plans and licensed schools. A false here means the free
      // tier, whose result must be redacted before it leaves the server.
      onFreeTier = evaluations ? !evaluations.unlimited : false;
    }

    // Paid-feature gate. Marking is metered by COUNT above; the rest of the
    // paid surface — answer upgrades, the AI content studio — is gated by
    // PLAN. Until now those two were enforced in the UI alone, which means
    // they were enforced by whoever had not opened devtools. Checked before
    // the AI budget so a refused call costs the caller nothing.
    const feature = monetisationEnabled() ? featureFromRequest(req.body) : null;
    if (feature && token) {
      const plan = await resolveCallerPlan(token);
      if (plan && !planUnlocks(plan, feature)) {
        const required = featureMinPlan(feature);
        res.status(402).json({
          error:
            required === 'school'
              ? 'This is part of the School plan. Ask your school administrator, or upgrade to unlock it.'
              : 'This is a Band 6 Plus feature. Upgrade to unlock it.',
          upgradeRequired: true,
          feature,
          requiredPlan: required,
        });
        return;
      }
    }

    quota = token ? await consumeAiQuota(token) : null;
    if (quota && !quota.allowed) {
      // Both wordings must keep the "Daily AI limit" phrase — services/aiCore.ts
      // fast-fails (no retries) on /daily ai limit/i.
      const message =
        quota.scope === 'school'
          ? `Daily AI limit reached for your school (${quota.used}/${quota.limit} shared calls used today). The pool resets at midnight UTC — ask an admin if your school needs more.`
          : `Daily AI limit reached (${quota.used}/${quota.limit} calls used today). Your allowance resets at midnight UTC — ask an admin if you need more.`;
      res.status(429).json({ error: message, quota });
      return;
    }
    // The call is going ahead and a unit has been spent — tally which model it
    // was for the dashboard's cost breakdown. Best-effort and reporting-only:
    // recordAiModelUsage swallows its own failures and never blocks the call.
    if (token) {
      const model = requestModel(req.body);
      if (model) await recordAiModelUsage(token, model);
    }
  }

  const keys = {
    gemini: process.env.GEMINI_API_KEY || process.env.API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    kimi: process.env.KIMI_API_KEY,
  };
  const result = await runAiProxy(req.body, keys);

  // Enforce the content paywall HERE, not in the UI. The client blurs locked
  // feedback, but blurred text is still in the DOM and readable in devtools —
  // so the criterion-by-criterion detail, the improvement path and the
  // rewritten answer are removed from a free-tier result before it is sent.
  // Marks and bands are preserved, so the summary the free tier is promised
  // (and every downstream stat) still works.
  const payload =
    isEvaluation && onFreeTier && result.status === 200
      ? redactEvaluationResponse(result.body)
      : result.body;

  // Echo the caller's post-call usage on success so the client can warn as the
  // budget runs low (80% / 100%) without a separate round trip. Additive and
  // ignored by provider-response consumers; only attached to a plain object
  // response (never overwrites an array/error body).
  const body =
    quota &&
    result.status === 200 &&
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
      ? {
          ...(payload as Record<string, unknown>),
          __quota: { used: quota.used, limit: quota.limit },
        }
      : payload;
  res.status(result.status).json(body);
}
