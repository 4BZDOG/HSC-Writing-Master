import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The contribution pre-screen, now that it is the server's.
 *
 * The score decides where a submission lands in a reviewer's queue, and it used
 * to be computed and written by the browser submitting the work — so the author
 * chose their own triage. `enforce_quality_score_authority` (supabase/schema.sql,
 * proved in supabase/tests/rls_negative_tests.sql) stops the write; this handler
 * is the only thing left that can do it, so what matters here is that it takes
 * NOTHING that decides the verdict from the request, and that every way it can
 * fail leaves the student's work saved and unscored rather than lost.
 */

const verifyRequestAuth = vi.fn();
vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: (...args: unknown[]) => verifyRequestAuth(...args),
  extractBearerToken: (header?: string) => (header ? header.replace(/^Bearer\s+/i, '') : null),
}));

const getSupabaseAdmin = vi.fn();
vi.mock('../../api/_lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

const consumeAiQuota = vi.fn();
const recordAiModelUsage = vi.fn();
vi.mock('../../api/_lib/quota', () => ({
  consumeAiQuota: (...args: unknown[]) => consumeAiQuota(...args),
  recordAiModelUsage: (...args: unknown[]) => recordAiModelUsage(...args),
}));

const screenContribution = vi.fn();
vi.mock('../../api/_lib/qualityScreen', () => ({
  screenContribution: (...args: unknown[]) => screenContribution(...args),
}));

import handler from '../../api/screen-contribution';

const AUTHOR = 'author-uuid';
const ROW_ID = '11111111-2222-3333-4444-555555555555';

/** The last `update({...})` payload the handler sent, per table. */
let updates: Array<{ table: string; patch: Record<string, unknown> }>;

/** A stand-in for the service-role client, shaped like the two chains used. */
const adminStub = (row: Record<string, unknown> | null, readError?: string) => ({
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: row,
          error: readError ? { message: readError } : null,
        }),
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        updates.push({ table, patch });
        return { error: null };
      },
    }),
  }),
});

interface Sent {
  status: number;
  body: unknown;
}

const post = async (body: unknown, headers: Record<string, string> = {}): Promise<Sent> => {
  const sent: Sent = { status: 0, body: undefined };
  const res = {
    status: (code: number) => {
      sent.status = code;
      return res;
    },
    json: (data: unknown) => {
      sent.body = data;
    },
    setHeader: () => {},
    end: () => {},
  };
  await handler(
    { method: 'POST', body, headers: { authorization: 'Bearer tok', ...headers } },
    res
  );
  return sent;
};

describe('POST /api/screen-contribution', () => {
  beforeEach(() => {
    updates = [];
    verifyRequestAuth.mockReset().mockResolvedValue({ ok: true, userId: AUTHOR });
    getSupabaseAdmin.mockReset().mockReturnValue(adminStub({ created_by: AUTHOR, question: 'Q?' }));
    consumeAiQuota.mockReset().mockResolvedValue(null);
    recordAiModelUsage.mockReset().mockResolvedValue(undefined);
    screenContribution.mockReset().mockResolvedValue({ score: 37, notes: 'Vague wording.' });
  });

  afterEach(() => vi.restoreAllMocks());

  it('screens the STORED text, not anything the caller sent with it', async () => {
    const result = await post({
      kind: 'prompt',
      id: ROW_ID,
      // All three are ignored: a caller who could supply the content, the
      // verdict or the wording of the judgement would be back to scoring
      // themselves, one step removed.
      content: 'Something else entirely',
      score: 100,
      notes: 'Perfect.',
    });

    expect(screenContribution).toHaveBeenCalledWith('prompt', 'Q?', expect.anything());
    expect(updates).toEqual([
      {
        table: 'prompts',
        patch: expect.objectContaining({ quality_score: 37, quality_notes: 'Vague wording.' }),
      },
    ]);
    // The timestamp is what tells "screened, and it scored badly" from "never
    // screened" — the queue and the schema's cleanup both read it.
    expect(updates[0].patch.quality_screened_at).toEqual(expect.any(String));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ screened: true, score: 37, notes: 'Vague wording.' });
  });

  it('refuses to screen somebody else’s row', async () => {
    getSupabaseAdmin.mockReturnValue(adminStub({ created_by: 'someone-else', question: 'Q?' }));

    const result = await post({ kind: 'prompt', id: ROW_ID });

    expect(result.status).toBe(403);
    // It spends the provider budget with the service-role key, so this must
    // stop BEFORE the call, not merely refuse to store the result.
    expect(screenContribution).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('reads a sample answer from its own table and column', async () => {
    getSupabaseAdmin.mockReturnValue(
      adminStub({ created_by: AUTHOR, answer: 'The stored answer.' })
    );

    await post({ kind: 'sample_answer', id: ROW_ID });

    expect(screenContribution).toHaveBeenCalledWith(
      'sample_answer',
      'The stored answer.',
      expect.anything()
    );
    expect(updates[0].table).toBe('sample_answers');
  });

  describe('fails open — the work is already saved by the time this runs', () => {
    it('when the AI screen is unavailable', async () => {
      screenContribution.mockResolvedValue(null);

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ screened: false, reason: 'unavailable' });
      // Nothing invented: the row stays unscored, which sorts it to the FRONT
      // of the review queue, so the failure reaches a person sooner.
      expect(updates).toEqual([]);
    });

    it('when the caller’s daily AI budget is spent', async () => {
      consumeAiQuota.mockResolvedValue({ allowed: false, used: 50, limit: 50 });

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.body).toEqual({ screened: false, reason: 'quota' });
      expect(screenContribution).not.toHaveBeenCalled();
    });

    it('when the deployment has no service-role key', async () => {
      getSupabaseAdmin.mockReturnValue(null);

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ screened: false, reason: 'unavailable' });
    });

    it('when the row cannot be read back', async () => {
      getSupabaseAdmin.mockReturnValue(adminStub(null, 'connection reset'));

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ screened: false, reason: 'unavailable' });
    });
  });

  describe('refuses what is genuinely wrong, rather than failing open', () => {
    it('rejects an unsigned request', async () => {
      verifyRequestAuth.mockResolvedValue({ ok: false, status: 401, error: 'Invalid session.' });

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.status).toBe(401);
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('rejects a kind it does not screen, before touching the database', async () => {
      const result = await post({ kind: 'profiles', id: ROW_ID });

      expect(result.status).toBe(400);
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a uuid', async () => {
      const result = await post({ kind: 'prompt', id: "' or 1=1 --" });

      expect(result.status).toBe(400);
      expect(getSupabaseAdmin).not.toHaveBeenCalled();
    });

    it('answers 404 for a row that is not there', async () => {
      getSupabaseAdmin.mockReturnValue(adminStub(null));

      const result = await post({ kind: 'prompt', id: ROW_ID });

      expect(result.status).toBe(404);
    });
  });
});
