import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../api/_lib/quota', () => ({
  consumeEvaluation: (...args: unknown[]) => consumeEvaluationMock(...args),
  consumeAiQuota: (...args: unknown[]) => consumeAiQuotaMock(...args),
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
});
