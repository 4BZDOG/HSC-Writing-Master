import { runAiProxy } from './_lib/providers';
import { verifyRequestAuth, extractBearerToken } from './_lib/auth';
import {
  consumeAiQuota,
  consumeEvaluation,
  recordAiModelUsage,
  refundEvaluation,
  resolveCallerIsStaff,
  resolveCallerPlan,
  resolveCallerUnlimited,
  type QuotaVerdict,
} from './_lib/quota';
import { corsHeadersFor } from './_lib/cors';
import {
  courseIdFromRequest,
  courseUnlocksEnabled,
  resolveCourseAccess,
} from './_lib/courseAccess';
import { freeTierMarkingModel, guardAiRequest } from './_lib/requestGuard';
import { isEvaluationRequest, redactEvaluationResponse } from './_lib/entitlements';
import {
  featureFromRequest,
  featureMinPlan,
  monetisationEnabled,
  planUnlocks,
  shouldRedactFreeTierFeedback,
  type Plan,
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
  // Set when this call spent one of the caller's metered free evaluations, so
  // it can be given back if no marking comes out of it (AI quota refused, or
  // the provider failed). The refund runs with the service role.
  let refundUserId: string | null = null;
  const refundIfSpent = async (): Promise<void> => {
    if (!refundUserId) return;
    const userId = refundUserId;
    refundUserId = null;
    await refundEvaluation(userId);
  };
  let onFreeTier = false;
  // Whether this caller's plan covers the rewritten answer. Decided separately
  // from the feedback-detail switch below — see `withholdRewrite`.
  let rewriteAllowed = true;
  // What is forwarded to the provider: the request as sent, or with a
  // student-sized call's limits applied by the guard below.
  let forwardBody: unknown = req.body;
  if (auth.userId) {
    const token = extractBearerToken(authHeader);

    // Cost guard, before anything is spent: only the app's own models, and a
    // student's prompt and output sizes unless the caller is staff. Checked
    // first so a refused call spends neither an evaluation nor an AI unit. See
    // api/_lib/requestGuard.ts and projectDocs/cost-model.md.
    let staffLookup: Promise<boolean> | null = null;
    const guard = await guardAiRequest(req.body, () => {
      staffLookup ??= token ? resolveCallerIsStaff(token) : Promise.resolve(false);
      return staffLookup;
    });
    if (guard.ok === false) {
      res.status(guard.status).json({ error: guard.error });
      return;
    }
    forwardBody = guard.body;

    // The caller's plan, resolved AT MOST ONCE per request and shared by the
    // feature gate and the rewrite gate. Both used to look it up independently
    // (and the rewrite gate did not look at the plan at all).
    let planLookup: Promise<Plan | null> | null = null;
    const callerPlan = (): Promise<Plan | null> => {
      if (!token) return Promise.resolve(null);
      planLookup ??= resolveCallerPlan(token);
      return planLookup;
    };

    // Course gate (projectDocs/course-unlocks.md). A marking run for a course the caller
    // has not unlocked is refused here, before the evaluation meter or the AI budget is
    // touched, so a refused call costs nothing. Staff and the included plans pass inside
    // resolveCourseAccess. Off unless COURSE_UNLOCKS_ENABLED is set. It fails open on a
    // lookup error, so a broken database never takes marking down.
    // With unlocks on, a marking run must name its course: a request that leaves the
    // tag off would otherwise skip the gate entirely. The app always sends it when
    // unlocks are on (services/courseAccess.ts). Naming a different, open course is
    // still possible from a tampered client; the server holds no question → course map.
    const unlocksOn = courseUnlocksEnabled();
    const courseId = unlocksOn ? courseIdFromRequest(req.body) : null;
    if (token && unlocksOn && !courseId && isEvaluationRequest(req.body)) {
      res.status(400).json({
        error:
          'This marking request did not say which course it is for. Reload the page and try again.',
        code: 'course_required',
      });
      return;
    }
    if (token && courseId && isEvaluationRequest(req.body)) {
      const access = await resolveCourseAccess(token, courseId);
      if (!access.open) {
        res.status(402).json({
          error: 'This course is locked. Unlock it to have your answers marked in this course.',
          code: 'course_locked',
          courseId,
          upgradeRequired: true,
        });
        return;
      }
    }

    // Paywall gate: marking an answer is the metered product feature (schema
    // §14). Checked BEFORE the AI budget so a refused evaluation doesn't spend
    // a call the user never got. Only bites on the free tier; staff and paid
    // plans resolve to unlimited server-side.
    //
    // Skipped entirely when this deployment sells nothing. MONETISATION_ENABLED
    // =false opens every PLAN gate, and a pilot that still refused the sixth
    // marking of the day was the one paywall a demo couldn't turn off — worse,
    // the client stops pre-checking too, so the refusal arrived as a 402 after
    // the student had written an answer, and opened an upgrade prompt for a
    // plan that isn't for sale. The AI quota below is untouched: the provider
    // budget still needs protecting, monetisation or not.
    if (token && monetisationEnabled() && isEvaluationRequest(req.body)) {
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
      if (evaluations?.allowed && !evaluations.unlimited) refundUserId = auth.userId;
      // The verdict doubles as the caller's plan: `unlimited` is true for
      // staff, paid plans and licensed schools. A false here means the free
      // tier, whose result must be redacted before it leaves the server.
      // A missing verdict (consume_evaluation errored or is not migrated) lets
      // the evaluation through, fail-open, but must not also hand a free
      // caller the paid feedback detail: fall back to the plan for that.
      onFreeTier = evaluations ? !evaluations.unlimited : (await callerPlan()) === 'free';

      // A deployment may mark the free tier on a cheaper model (off unless
      // FREE_TIER_MARKING_MODEL is set; see requestGuard.ts and cost-model.md).
      const cheaperModel = onFreeTier ? freeTierMarkingModel() : null;
      if (cheaperModel) {
        forwardBody = { ...(forwardBody as object), provider: 'gemini', model: cheaperModel };
      }

      // The rewritten answer is the `answerUpgrades` feature, so it is gated on
      // that feature and nothing else. It used to ride on the free-tier
      // feedback switch, which meant a deployment with FREE_TIER_FULL_FEEDBACK
      // =true — a supported choice, and the one a school pilot reaches for —
      // handed every free account the paid rewrite, and with it the whole
      // improvement review built on top of it.
      //
      // An unresolvable plan falls back to the verdict we already hold rather
      // than to "entitled". `resolveCallerPlan` is fail-open by design (a
      // billing lookup that breaks must not take marking down), so treating
      // null as entitled would reopen the hole on any deployment whose
      // `caller_plan` RPC is missing — while failing hard would strip rewrites
      // from paying users for the same reason. `unlimited` comes from the same
      // untamperable source as the evaluation count, so it is the right
      // fallback: a metered free-tier caller is withheld either way.
      const plan = await callerPlan();
      rewriteAllowed = plan ? planUnlocks(plan, 'answerUpgrades') : !onFreeTier;
    }

    // Paid-feature gate. Marking is metered by COUNT above; the rest of the
    // paid surface — answer upgrades, the AI content studio — is gated by
    // PLAN. Until now those two were enforced in the UI alone, which means
    // they were enforced by whoever had not opened devtools. Checked before
    // the AI budget so a refused call costs the caller nothing.
    const feature = monetisationEnabled() ? featureFromRequest(req.body) : null;
    if (feature && token) {
      // When the plan cannot be read, ask a second, read-only question before
      // letting the call through: an unlimited evaluation allowance means a paid
      // plan or staff, so a paying caller keeps the feature and a free caller is
      // refused. Only when BOTH lookups fail does the gate stay open, as marking
      // and the quota do, so a database outage never takes paid features from
      // paying users.
      let plan = await callerPlan();
      if (!plan) {
        const unlimited = await resolveCallerUnlimited(token);
        if (unlimited === false) plan = 'free';
      }
      if (plan && !planUnlocks(plan, feature)) {
        const required = featureMinPlan(feature);
        await refundIfSpent();
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
      await refundIfSpent();
      res.status(429).json({ error: message, quota });
      return;
    }
    // The call is going ahead and a unit has been spent — tally which model it
    // was for the dashboard's cost breakdown. Best-effort and reporting-only:
    // recordAiModelUsage swallows its own failures and never blocks the call.
    if (token) {
      // The model the call actually goes to, which the free-tier switch above may
      // have changed from the one the browser asked for.
      const model = requestModel(forwardBody);
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
  const result = await runAiProxy(forwardBody, keys);
  if (result.status !== 200) await refundIfSpent();

  // Enforce the content paywall HERE, not in the UI. The client blurs locked
  // feedback, but blurred text is still in the DOM and readable in devtools —
  // so the criterion-by-criterion detail, the improvement path and the
  // rewritten answer are removed from a free-tier result before it is sent.
  // Marks and bands are preserved, so the summary the free tier is promised
  // (and every downstream stat) still works.
  // Both policy switches are consulted, because the UI consults them too: a
  // pilot deployment (MONETISATION_ENABLED=false) or a deliberately generous
  // free tier (FREE_TIER_FULL_FEEDBACK=true) unlocks the feedback panel in the
  // client, and stripping the content anyway would leave a free user looking
  // at an unlocked panel full of "Upgrade to see this feedback."
  // Two independent decisions, because they sell two different things:
  // the per-criterion detail and improvement path belong to the free tier's
  // summary trade-off, while the rewritten answer is the `answerUpgrades`
  // feature. One switch used to govern both.
  const withholdFeedbackDetail = onFreeTier && shouldRedactFreeTierFeedback();
  const withholdRewrite = isEvaluation && !rewriteAllowed;
  const payload =
    isEvaluation && result.status === 200 && (withholdFeedbackDetail || withholdRewrite)
      ? redactEvaluationResponse(result.body, {
          feedbackDetail: withholdFeedbackDetail,
          rewrite: withholdRewrite,
        })
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
