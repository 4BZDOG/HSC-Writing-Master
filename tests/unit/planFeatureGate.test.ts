import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Paid features have to be refused by the SERVER, not just greyed out in the
 * UI. Answer upgrades and the AI content studio were gated in components only,
 * which meant they were gated for everyone who had not opened devtools: the
 * button was locked, `/api/gemini` was not.
 *
 * api/gemini.ts now reads the request's `__feature` tag, asks Postgres which
 * plan the caller actually holds (caller_plan(), schema §17) and answers 402
 * when the plan doesn't cover it.
 */

const consumeEvaluationMock = vi.fn();
const consumeAiQuotaMock = vi.fn();
const resolveCallerPlanMock = vi.fn();
const runAiProxyMock = vi.fn();

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

const call = (feature: string) => ({
  provider: 'gemini',
  model: 'gemini-3-flash',
  __feature: feature,
});

beforeEach(() => {
  consumeEvaluationMock.mockReset();
  consumeAiQuotaMock.mockReset();
  resolveCallerPlanMock.mockReset();
  runAiProxyMock.mockReset();
  consumeAiQuotaMock.mockResolvedValue({ allowed: true, used: 1, limit: 300 });
  runAiProxyMock.mockResolvedValue({ status: 200, body: { text: 'ok' } });
});

describe('api/gemini paid-feature gate', () => {
  it('refuses an answer upgrade on the free plan, before spending anything', async () => {
    resolveCallerPlanMock.mockResolvedValue('free');
    const res = makeRes();
    await handler(post(call('answerUpgrades')), res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      upgradeRequired: true,
      feature: 'answerUpgrades',
      requiredPlan: 'plus',
    });
    // Refused before the AI budget and before the provider — a paywall must
    // not cost the caller a call they never received.
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
    expect(runAiProxyMock).not.toHaveBeenCalled();
  });

  it('serves the same call once the caller holds Plus', async () => {
    resolveCallerPlanMock.mockResolvedValue('plus');
    const res = makeRes();
    await handler(post(call('answerUpgrades')), res);

    expect(res.statusCode).toBe(200);
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the content studio to the plan that includes it', async () => {
    resolveCallerPlanMock.mockResolvedValue('plus');
    const res = makeRes();
    await handler(post(call('aiContentStudio')), res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ feature: 'aiContentStudio', requiredPlan: 'school' });

    resolveCallerPlanMock.mockResolvedValue('school');
    const ok = makeRes();
    await handler(post(call('aiContentStudio')), ok);
    expect(ok.statusCode).toBe(200);
  });

  it('does not gate untagged calls', async () => {
    // Manual question entry, keyword suggestions, scenario generation: role- or
    // quota-limited, not plan-limited. A new call site must opt IN to metering.
    resolveCallerPlanMock.mockResolvedValue('free');
    const res = makeRes();
    await handler(post({ provider: 'gemini', model: 'gemini-3-flash' }), res);

    expect(res.statusCode).toBe(200);
    expect(resolveCallerPlanMock).not.toHaveBeenCalled();
  });

  it('leaves the evaluation meter to its own gate', async () => {
    // `evaluation` is metered by count, not by plan. If the plan gate claimed
    // it too, a free user would be refused their first free evaluation.
    resolveCallerPlanMock.mockResolvedValue('free');
    consumeEvaluationMock.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 5,
      unlimited: false,
    });
    const res = makeRes();
    await handler(post(call('evaluation')), res);

    expect(res.statusCode).toBe(200);
    expect(resolveCallerPlanMock).not.toHaveBeenCalled();
  });

  it('stops gating entirely when monetisation is switched off', async () => {
    // The pilot switch. If this leaks, a school running an unpaywalled trial
    // gets 402s on features it was promised.
    resolveCallerPlanMock.mockResolvedValue('free');
    process.env.MONETISATION_ENABLED = 'false';
    try {
      const res = makeRes();
      await handler(post(call('aiContentStudio')), res);
      expect(res.statusCode).toBe(200);
      expect(resolveCallerPlanMock).not.toHaveBeenCalled();
    } finally {
      delete process.env.MONETISATION_ENABLED;
    }
  });

  it('fails open when the plan cannot be resolved', async () => {
    // A billing lookup that breaks must never take the product down with it:
    // an unmigrated database or a transient Supabase failure returns null.
    resolveCallerPlanMock.mockResolvedValue(null);
    const res = makeRes();
    await handler(post(call('aiContentStudio')), res);

    expect(res.statusCode).toBe(200);
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
  });
});
