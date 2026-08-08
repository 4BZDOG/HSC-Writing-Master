import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The free tier's daily evaluation limit is the paywall's headline number, so
 * it has to hold server-side: the localStorage counter in entitlements.ts is a
 * display mirror that any user can clear. api/gemini.ts spends one unit of
 * consume_evaluation() (schema §14) per marking call, BEFORE the provider is
 * called, and answers 402 when the allowance is gone.
 */

const consumeEvaluationMock = vi.fn();
const consumeAiQuotaMock = vi.fn();
const runAiProxyMock = vi.fn();
// Consulted for the rewrite gate: the rewritten answer inside a marking result
// is the `answerUpgrades` feature, gated on the plan rather than on the
// free-tier feedback switch.
const resolveCallerPlanMock = vi.fn();

vi.mock('../../api/_lib/quota', () => ({
  consumeEvaluation: (...args: unknown[]) => consumeEvaluationMock(...args),
  consumeAiQuota: (...args: unknown[]) => consumeAiQuotaMock(...args),
  resolveCallerPlan: (...args: unknown[]) => resolveCallerPlanMock(...args),
  recordAiModelUsage: async () => undefined,
  isQuotaEnabled: () => true,
}));

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ ok: true, userId: 'user-1' }),
  extractBearerToken: () => 'token',
}));

vi.mock('../../api/_lib/providers', () => ({
  runAiProxy: (...args: unknown[]) => runAiProxyMock(...args),
}));

import handler from '../../api/gemini';

const makeRes = () => ({
  statusCode: 0,
  body: undefined as unknown,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data;
  },
  setHeader() {},
});

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body,
});

const evaluationRequest = { provider: 'gemini', model: 'gemini-3-flash', __feature: 'evaluation' };

beforeEach(() => {
  consumeEvaluationMock.mockReset();
  consumeAiQuotaMock.mockReset();
  runAiProxyMock.mockReset();
  resolveCallerPlanMock.mockReset();
  // Default to the free tier, matching the evaluation verdicts these tests
  // mock. The plan and the verdict describe the same caller, so pairing them
  // keeps the fixtures honest.
  resolveCallerPlanMock.mockResolvedValue('free');
  consumeAiQuotaMock.mockResolvedValue({ allowed: true, used: 1, limit: 300 });
  runAiProxyMock.mockResolvedValue({ status: 200, body: { text: 'ok' } });
});

describe('api/gemini free-tier evaluation gate', () => {
  it('refuses the evaluation with 402 once the daily allowance is spent', async () => {
    consumeEvaluationMock.mockResolvedValue({
      allowed: false,
      used: 5,
      limit: 5,
      unlimited: false,
    });
    const res = makeRes();
    await handler(post(evaluationRequest), res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ upgradeRequired: true });
    // The provider must not be called, and no AI budget spent on a request
    // the user never receives.
    expect(runAiProxyMock).not.toHaveBeenCalled();
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
  });

  it('lets the evaluation through while allowance remains', async () => {
    consumeEvaluationMock.mockResolvedValue({
      allowed: true,
      used: 2,
      limit: 5,
      unlimited: false,
    });
    const res = makeRes();
    await handler(post(evaluationRequest), res);

    expect(res.statusCode).toBe(200);
    expect(runAiProxyMock).toHaveBeenCalled();
  });

  it('does not meter calls that are not evaluations', async () => {
    const res = makeRes();
    await handler(post({ provider: 'gemini', model: 'gemini-3-flash' }), res);

    expect(consumeEvaluationMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('fails open when the RPC is unavailable (schema not migrated yet)', async () => {
    consumeEvaluationMock.mockResolvedValue(null);
    const res = makeRes();
    await handler(post(evaluationRequest), res);

    expect(res.statusCode).toBe(200);
    expect(runAiProxyMock).toHaveBeenCalled();
  });

  /**
   * A deployment that sells nothing must not meter the thing it isn't selling.
   * MONETISATION_ENABLED=false opens every plan gate, but the marking meter
   * used to run regardless — so a pilot still refused the sixth answer of the
   * day, and did it as a 402 AFTER the student had written one (the client
   * stops pre-checking when monetisation is off), which opened an upgrade
   * prompt for a plan that isn't for sale.
   */
  describe('with monetisation switched off for a pilot', () => {
    beforeEach(() => {
      process.env.MONETISATION_ENABLED = 'false';
    });
    afterEach(() => {
      delete process.env.MONETISATION_ENABLED;
    });

    it('does not spend a free evaluation', async () => {
      const res = makeRes();
      await handler(post(evaluationRequest), res);

      expect(consumeEvaluationMock).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('marks the answer even when the allowance would already be spent', async () => {
      consumeEvaluationMock.mockResolvedValue({
        allowed: false,
        used: 5,
        limit: 5,
        unlimited: false,
      });
      const res = makeRes();
      await handler(post(evaluationRequest), res);

      expect(res.statusCode).toBe(200);
      expect(runAiProxyMock).toHaveBeenCalled();
    });

    it('still spends the AI quota — the provider budget is not a paywall', async () => {
      const res = makeRes();
      await handler(post(evaluationRequest), res);

      expect(consumeAiQuotaMock).toHaveBeenCalled();
    });

    it('still refuses once the AI budget itself is gone', async () => {
      consumeAiQuotaMock.mockResolvedValue({ allowed: false, used: 60, limit: 60, scope: 'user' });
      const res = makeRes();
      await handler(post(evaluationRequest), res);

      expect(res.statusCode).toBe(429);
      expect(runAiProxyMock).not.toHaveBeenCalled();
    });
  });
});

describe('api/gemini free-tier content redaction', () => {
  const markingResult = {
    overallMark: 7,
    overallBand: 5,
    overallFeedback: 'Sound response.',
    quickTip: 'Name the term first.',
    strengths: ['Clear thesis'],
    improvements: ['Sustain the judgement'],
    criteria: [{ criterion: 'Analysis', mark: 4, maxMark: 6, feedback: 'Secret paid detail.' }],
    revisedAnswer: 'A band 6 rewrite…',
  };

  const proxyReturnsMarking = () =>
    runAiProxyMock.mockResolvedValue({
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: JSON.stringify(markingResult) }] } }] },
    });

  const markingTextFrom = (body: unknown): string =>
    (body as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }).candidates[0]
      .content.parts[0].text;

  it('strips paid feedback from a free-tier result before it leaves the server', async () => {
    consumeEvaluationMock.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 5,
      unlimited: false,
    });
    proxyReturnsMarking();

    const res = makeRes();
    await handler(post(evaluationRequest), res);

    const text = markingTextFrom(res.body);
    // The blur in the UI is cosmetic; this is the gate. The paid prose must
    // not be in the response at all.
    expect(text).not.toContain('Secret paid detail.');
    expect(text).not.toContain('A band 6 rewrite');
    // The promised summary survives.
    const parsed = JSON.parse(text);
    expect(parsed.overallMark).toBe(7);
    expect(parsed.overallBand).toBe(5);
    expect(parsed.criteria[0].mark).toBe(4);
  });

  it('sends the full result to a paid caller', async () => {
    resolveCallerPlanMock.mockResolvedValue('plus');
    consumeEvaluationMock.mockResolvedValue({ allowed: true, used: 0, limit: -1, unlimited: true });
    proxyReturnsMarking();

    const res = makeRes();
    await handler(post(evaluationRequest), res);

    expect(markingTextFrom(res.body)).toContain('Secret paid detail.');
  });

  it('redacts a request whose __feature tag was stripped to dodge the gate', async () => {
    consumeEvaluationMock.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 5,
      unlimited: false,
    });
    proxyReturnsMarking();

    const res = makeRes();
    await handler(
      post({
        provider: 'gemini',
        model: 'gemini-3-flash',
        config: {
          responseSchema: { required: ['overallMark', 'overallBand', 'criteria'] },
        },
      }),
      res
    );

    expect(consumeEvaluationMock).toHaveBeenCalled();
    expect(markingTextFrom(res.body)).not.toContain('Secret paid detail.');
  });

  it('leaves the result alone when the gate cannot be evaluated (fail-open)', async () => {
    // A PAYING caller whose meter RPC is down — the fail-open this test is
    // about. (A free-plan caller in the same state still loses the rewrite:
    // the rewrite gate is the plan, not the meter. See below.)
    resolveCallerPlanMock.mockResolvedValue('plus');
    // consume_evaluation unavailable → we don't know the caller's plan, so we
    // must not redact; breaking marking for paying users is the worse failure.
    consumeEvaluationMock.mockResolvedValue(null);
    proxyReturnsMarking();

    const res = makeRes();
    await handler(post(evaluationRequest), res);

    expect(markingTextFrom(res.body)).toContain('Secret paid detail.');
  });
});

describe('api/gemini redaction honours the policy switches', () => {
  const markingResult = {
    overallMark: 7,
    overallBand: 5,
    overallFeedback: 'Sound response.',
    quickTip: 'Name the term first.',
    strengths: ['Clear thesis'],
    improvements: ['Sustain the judgement'],
    criteria: [{ criterion: 'Analysis', mark: 4, maxMark: 6, feedback: 'Secret paid detail.' }],
    revisedAnswer: 'A band 6 rewrite…',
  };

  const markingTextFrom = (body: unknown): string =>
    (body as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }).candidates[0]
      .content.parts[0].text;

  beforeEach(() => {
    consumeEvaluationMock.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 5,
      unlimited: false,
    });
    runAiProxyMock.mockResolvedValue({
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: JSON.stringify(markingResult) }] } }] },
    });
  });

  afterEach(() => {
    delete process.env.MONETISATION_ENABLED;
    delete process.env.FREE_TIER_FULL_FEEDBACK;
    delete process.env.VITE_FREE_TIER_FULL_FEEDBACK;
  });

  it('sends the full result when monetisation is switched off for a pilot', async () => {
    // The client stops locking the panel when this is false. If the server
    // kept stripping, a pilot user would see an unlocked panel of placeholders.
    process.env.MONETISATION_ENABLED = 'false';
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    expect(markingTextFrom(res.body)).toContain('Secret paid detail.');
  });

  it('sends the full result when the free tier is granted full feedback', async () => {
    process.env.FREE_TIER_FULL_FEEDBACK = 'true';
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    const text = markingTextFrom(res.body);
    expect(text).toContain('Secret paid detail.');
    // …but NOT the rewritten answer. It is the `answerUpgrades` feature, and a
    // generous feedback tier does not buy it. This is the hole the two gates
    // were split to close: a school pilot with FREE_TIER_FULL_FEEDBACK=true
    // used to hand every free account the paid rewrite.
    expect(text).not.toContain('A band 6 rewrite');
  });

  it('honours the VITE_ copy so one Vercel variable drives both halves', async () => {
    process.env.VITE_FREE_TIER_FULL_FEEDBACK = 'true';
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    const text = markingTextFrom(res.body);
    expect(text).toContain('Secret paid detail.');
    expect(text).not.toContain('A band 6 rewrite');
  });

  it('sends the rewrite to a plan that includes answer upgrades', async () => {
    resolveCallerPlanMock.mockResolvedValue('plus');
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    expect(markingTextFrom(res.body)).toContain('A band 6 rewrite');
  });

  it('withholds the rewrite even when the evaluation meter is unavailable', async () => {
    // The meter failing open must not open the paywall: the two are decided by
    // different things — a count, and a plan.
    consumeEvaluationMock.mockResolvedValue(null);
    process.env.FREE_TIER_FULL_FEEDBACK = 'true';
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    expect(markingTextFrom(res.body)).not.toContain('A band 6 rewrite');
  });

  it('still redacts under the default policy', async () => {
    const res = makeRes();
    await handler(post(evaluationRequest), res);
    expect(markingTextFrom(res.body)).not.toContain('Secret paid detail.');
  });
});
