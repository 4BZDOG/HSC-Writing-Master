import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The course gate on /api/gemini (projectDocs/course-unlocks.md, api/gemini.ts).
 *
 * A marking run for a locked course is refused with 402 course_locked BEFORE the evaluation
 * meter or the AI budget is spent. Staff, an included plan, an owned unlock and a free course
 * all pass. Unlocks off, an untagged call and a non-evaluation call make no course lookup at
 * all. A failed lookup fails open.
 */

const consumeEvaluationMock = vi.fn();
const consumeAiQuotaMock = vi.fn();
const resolveCallerPlanMock = vi.fn();
const runAiProxyMock = vi.fn();
const rpcMock = vi.fn();
const createClientMock = vi.fn();

let catalogueAnswer: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('../../api/_lib/quota', () => ({
  consumeEvaluation: (...args: unknown[]) => consumeEvaluationMock(...args),
  consumeAiQuota: (...args: unknown[]) => consumeAiQuotaMock(...args),
  resolveCallerPlan: (...args: unknown[]) => resolveCallerPlanMock(...args),
  resolveCallerUnlimited: async () => null,
  recordAiModelUsage: async () => undefined,
  refundEvaluation: async () => undefined,
  resolveCallerIsStaff: async () => false,
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

const COURSE = 'course-hsc-chemistry';
const ENV_KEYS = [
  'COURSE_UNLOCKS_ENABLED',
  'VITE_COURSE_UNLOCKS_ENABLED',
  'COURSE_UNLOCK_INCLUDED_PLANS',
  'COURSE_UNLOCK_FREE_COURSES',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const;
let saved: Record<string, string | undefined> = {};

/** The caller's facts, as the caller's own token reads them. */
let facts: { is_reviewer: unknown; caller_plan: unknown; owned: string[] | Error } = {
  is_reviewer: false,
  caller_plan: 'free',
  owned: [],
};

const makeRes = () => ({
  statusCode: 0,
  body: undefined as Record<string, unknown> | undefined,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(data: unknown) {
    this.body = data as Record<string, unknown>;
  },
  setHeader() {},
});

/** A marking run for COURSE, as the client sends it. */
const evaluation = (extra: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer token' },
  body: {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    __feature: 'evaluation',
    __courseId: COURSE,
    contents: 'a student answer',
    ...extra,
  },
});

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.COURSE_UNLOCKS_ENABLED = 'true';

  facts = { is_reviewer: false, caller_plan: 'free', owned: [] };
  catalogueAnswer = { data: { unlock_required: true, stripe_price_id: null }, error: null };

  rpcMock.mockReset();
  rpcMock.mockImplementation(async (name: string) => {
    if (name === 'my_course_unlocks') {
      if (facts.owned instanceof Error) throw facts.owned;
      return { data: facts.owned, error: null };
    }
    const value = name === 'is_reviewer' ? facts.is_reviewer : facts.caller_plan;
    if (value instanceof Error) throw value;
    return { data: value, error: null };
  });
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => ({
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => catalogueAnswer }),
      }),
    }),
  }));

  consumeEvaluationMock.mockReset();
  consumeEvaluationMock.mockResolvedValue({ allowed: true, unlimited: true, used: 1, limit: 5 });
  consumeAiQuotaMock.mockReset();
  consumeAiQuotaMock.mockResolvedValue({ allowed: true, used: 1, limit: 300 });
  resolveCallerPlanMock.mockReset();
  resolveCallerPlanMock.mockResolvedValue('free');
  runAiProxyMock.mockReset();
  runAiProxyMock.mockResolvedValue({ status: 200, body: { text: 'ok' } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('api/gemini course gate', () => {
  it('refuses a locked course with 402 course_locked, before any meter or provider is touched', async () => {
    const res = makeRes();
    await handler(evaluation(), res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      code: 'course_locked',
      courseId: COURSE,
      upgradeRequired: true,
    });
    expect(consumeEvaluationMock).not.toHaveBeenCalled();
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
    expect(runAiProxyMock).not.toHaveBeenCalled();
  });

  it('marks the course once the caller holds an unlock for it', async () => {
    facts.owned = [COURSE];
    const res = makeRes();
    await handler(evaluation(), res);

    expect(res.statusCode).toBe(200);
    expect(consumeEvaluationMock).toHaveBeenCalledTimes(1);
    expect(runAiProxyMock).toHaveBeenCalledTimes(1);
  });

  it('lets staff through, whatever their plan', async () => {
    facts.is_reviewer = true;
    const res = makeRes();
    await handler(evaluation(), res);
    expect(res.statusCode).toBe(200);
  });

  it('lets a plan in the included list through', async () => {
    facts.caller_plan = 'school';
    const res = makeRes();
    await handler(evaluation(), res);
    expect(res.statusCode).toBe(200);
  });

  it('lets a course on the free list through', async () => {
    process.env.COURSE_UNLOCK_FREE_COURSES = COURSE;
    const res = makeRes();
    await handler(evaluation(), res);
    expect(res.statusCode).toBe(200);
  });

  it('makes no course lookup at all while unlocks are switched off', async () => {
    delete process.env.COURSE_UNLOCKS_ENABLED;
    const res = makeRes();
    await handler(evaluation(), res);

    expect(res.statusCode).toBe(200);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('refuses an untagged marking run while unlocks are on, so leaving the tag off cannot skip the gate', async () => {
    const res = makeRes();
    const req = evaluation();
    delete (req.body as Record<string, unknown>).__courseId;
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('course_required');
    expect(consumeEvaluationMock).not.toHaveBeenCalled();
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
    expect(runAiProxyMock).not.toHaveBeenCalled();
  });

  it('lets an untagged marking run through while unlocks are off', async () => {
    delete process.env.COURSE_UNLOCKS_ENABLED;
    const res = makeRes();
    const req = evaluation();
    delete (req.body as Record<string, unknown>).__courseId;
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(rpcMock).not.toHaveBeenCalledWith('is_reviewer');
  });

  it('gates only evaluations, so a tagged non-marking call passes untouched', async () => {
    const res = makeRes();
    await handler(evaluation({ __feature: 'aiContentStudio' }), res);
    // The existing plan gate may still refuse a free student's studio call (402 for a
    // different reason); the course gate must not be the one that refuses it.
    expect(res.body?.code).not.toBe('course_locked');
    expect(rpcMock).not.toHaveBeenCalledWith('is_reviewer');
  });

  it('fails OPEN, with a warning, when the course lookup fails', async () => {
    facts = {
      is_reviewer: new Error('rpc down'),
      caller_plan: new Error('rpc down'),
      owned: new Error('rpc down'),
    };
    const res = makeRes();
    await handler(evaluation(), res);

    expect(res.statusCode).toBe(200);
    expect(console.warn).toHaveBeenCalled();
    expect(consumeEvaluationMock).toHaveBeenCalled();
  });
});
