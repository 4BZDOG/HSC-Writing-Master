/**
 * Server-side entitlement helpers for the AI proxy.
 *
 * Two jobs, both of which exist because the client cannot be trusted with the
 * paywall:
 *
 *   1. `isEvaluationRequest` — decide whether a proxied call is a marking run,
 *      so it can be metered against the free tier's daily allowance.
 *   2. `redactPaidFeedback` — strip the parts of a marking result the free
 *      tier hasn't paid for, BEFORE the response leaves the server.
 *
 * The UI has its own copies of these rules (services/entitlements.ts), but the
 * UI only blurs; anything present in the response is readable in devtools.
 * These functions are where the gate is actually enforced.
 */

/**
 * Seat bounds for a school licence. Mirrors SCHOOL_SEAT_LIMITS in
 * services/entitlements.ts — that module can't be imported here (it reads
 * `import.meta.env`, which only exists under Vite), so the values are
 * duplicated and pinned together by tests/unit/entitlementConstants.test.ts.
 * The client copy also carries a `default` (the seat picker's starting value),
 * which is intentionally omitted here — only the min/max are enforced server-side.
 */
export const SCHOOL_SEAT_LIMITS = { min: 5, max: 1000 } as const;

/** The response-schema fields that only an evaluation request asks for. */
const EVALUATION_SCHEMA_MARKERS = ['overallMark', 'overallBand', 'criteria'];

interface SchemaLike {
  required?: unknown;
  properties?: Record<string, unknown>;
}

/**
 * True when this proxied call is a marking run.
 *
 * The client tags evaluations with `__feature: 'evaluation'`, but a tampered
 * client can simply omit the tag, so the tag alone would be a paywall with a
 * "please don't" sign on it. The fallback fingerprints the request's response
 * schema instead: an evaluation is the only call that asks for
 * overallMark + overallBand + criteria. Removing those to dodge the meter
 * changes what the model returns and breaks the caller's own parsing
 * (services/aiSchemas.ts requires exactly these fields), so evasion costs the
 * evader the feature they were trying to steal.
 */
export const isEvaluationRequest = (body: unknown): boolean => {
  if (!body || typeof body !== 'object') return false;

  const tagged = (body as { __feature?: unknown }).__feature;
  if (tagged === 'evaluation') return true;

  const schema = (body as { config?: { responseSchema?: SchemaLike } }).config?.responseSchema;
  if (!schema || typeof schema !== 'object') return false;

  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  if (EVALUATION_SCHEMA_MARKERS.every((field) => required.includes(field))) return true;

  // `required` is optional in some provider dialects — fall back to the
  // declared properties, which carry the same fingerprint.
  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    return EVALUATION_SCHEMA_MARKERS.every((field) => field in properties);
  }
  return false;
};

/** Placeholder left in place of feedback the caller hasn't paid for. */
export const LOCKED_FEEDBACK_PLACEHOLDER = 'Upgrade to see this feedback.';

interface EvaluationPayload {
  overallMark?: unknown;
  overallBand?: unknown;
  criteria?: Array<Record<string, unknown>>;
  improvements?: unknown;
  revisedAnswer?: unknown;
  [key: string]: unknown;
}

/** Which paid parts of a marking result to withhold. */
export interface RedactionScope {
  /**
   * The per-criterion prose and the improvement path — the "detail" the free
   * tier trades for a summary (FREE_TIER_FEEDBACK_SUMMARY_ONLY).
   */
  feedbackDetail?: boolean;
  /**
   * The rewritten answer. A SEPARATE decision, because it is the
   * `answerUpgrades` feature in its own right rather than part of the feedback
   * detail. Tying the two together meant a deployment that opened feedback to
   * the free tier (FREE_TIER_FULL_FEEDBACK=true — a supported, documented
   * choice) also gave away the paid rewrite, which is now the input to the
   * whole improvement review.
   */
  rewrite?: boolean;
}

/**
 * Remove the paid parts of a marking result, keeping the free tier's promised
 * summary: the overall mark, the band, the overall verdict, the quick tip and
 * the strengths list.
 *
 * The SHAPE is preserved deliberately. The client validates this payload
 * against a Zod schema that requires these fields, so deleting them would fail
 * validation and show an error instead of a paywall. Marks and bands survive
 * untouched, so stats and the band average stay correct.
 *
 * Defaults to withholding everything, so a caller that forgets to say what it
 * means keeps the paywall on rather than opening it.
 */
export const redactPaidFeedback = (
  payload: EvaluationPayload,
  scope: RedactionScope = {}
): EvaluationPayload => {
  const { feedbackDetail = true, rewrite = true } = scope;
  const redacted: EvaluationPayload = { ...payload };

  if (feedbackDetail && Array.isArray(payload.criteria)) {
    redacted.criteria = payload.criteria.map((criterion) => ({
      ...criterion,
      feedback: LOCKED_FEEDBACK_PLACEHOLDER,
    }));
  }
  if (feedbackDetail && Array.isArray(payload.improvements)) {
    redacted.improvements = [LOCKED_FEEDBACK_PLACEHOLDER];
  }
  if (!rewrite) return redacted;
  // The rewritten answer is the `answerUpgrades` feature in its own right, so
  // it goes whichever shape it arrives in. The evaluation request asks for a
  // plain string and the client's Zod schema accepts either — but a provider
  // that treats the response schema as advisory (the OpenRouter/Groq/Kimi
  // adapters do not enforce it the way Gemini does) can return the structured
  // `{ text, keyChanges }` form, and a string-only check would hand a free user
  // the whole rewrite untouched.
  if (typeof payload.revisedAnswer === 'string' && payload.revisedAnswer) {
    redacted.revisedAnswer = '';
  } else if (
    payload.revisedAnswer &&
    typeof payload.revisedAnswer === 'object' &&
    !Array.isArray(payload.revisedAnswer)
  ) {
    // Keep the shape (the client validates it) and empty the paid content.
    redacted.revisedAnswer = { ...(payload.revisedAnswer as object), text: '', keyChanges: [] };
  }

  return redacted;
};

/** Looks like the JSON body of a marking result (as opposed to any other AI output). */
const isEvaluationPayload = (value: unknown): value is EvaluationPayload =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  'overallMark' in (value as Record<string, unknown>) &&
  'criteria' in (value as Record<string, unknown>);

/**
 * Locate the first balanced JSON object in a string, so a payload wrapped in
 * code fences or stray prose is still found.
 *
 * This has to be at least as tolerant as the CLIENT's parser
 * (`safeJsonParse` in services/aiCore.ts, which extracts balanced JSON from
 * surrounding text). If the server were stricter, a model that fenced its
 * output would slip past the redaction and the client would happily parse and
 * display the unredacted result — the paywall would leak precisely when the
 * model chose to add ```json.
 */
const findJsonSpan = (text: string): { start: number; end: number; value: unknown } | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return { start, end: i + 1, value: JSON.parse(candidate) };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

/** Redact the marking payload inside one text part, preserving any wrapper. */
const redactTextPart = (text: string, scope: RedactionScope): string | null => {
  const span = findJsonSpan(text);
  if (!span || !isEvaluationPayload(span.value)) return null;
  const redacted = JSON.stringify(redactPaidFeedback(span.value, scope));
  return `${text.slice(0, span.start)}${redacted}${text.slice(span.end)}`;
};

/**
 * Walk a provider response, find the JSON text part holding the marking
 * result, and redact it in place.
 *
 * Every provider adapter normalises to the Gemini shape
 * (`candidates[].content.parts[].text`), so one traversal covers them all.
 * Anything unrecognised is returned untouched: a redaction bug must not be
 * able to break marking for paying users.
 */
export const redactEvaluationResponse = (
  responseBody: unknown,
  scope: RedactionScope = {}
): unknown => {
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody)) {
    return responseBody;
  }

  const body = responseBody as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const candidates = body.candidates;
  if (!Array.isArray(candidates)) return responseBody;

  let anyChanged = false;
  const nextCandidates = candidates.map((candidate) => {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) return candidate;

    let candidateChanged = false;
    const nextParts = parts.map((part) => {
      if (!part || typeof part.text !== 'string') return part;
      const redacted = redactTextPart(part.text, scope);
      if (redacted === null) return part; // not a marking payload — leave alone
      candidateChanged = true;
      return { ...part, text: redacted };
    });

    if (!candidateChanged) return candidate;
    anyChanged = true;
    return { ...candidate, content: { ...candidate.content, parts: nextParts } };
  });

  return anyChanged ? { ...body, candidates: nextCandidates } : responseBody;
};
