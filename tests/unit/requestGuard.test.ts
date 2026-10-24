import { describe, it, expect, vi } from 'vitest';
import {
  ALLOWED_MODELS,
  STUDENT_MAX_INPUT_CHARS,
  STUDENT_MAX_OUTPUT_TOKENS,
  STUDENT_MAX_THINKING_BUDGET,
  guardAiRequest,
  type GuardVerdict,
} from '../../api/_lib/requestGuard';
import { AI_MODELS } from '../../services/aiModels';

/**
 * The AI proxy meters calls by count, so what one call may cost has to be decided
 * on the server: only the app's own models, and a student's prompt and output
 * sizes unless the caller is staff. See api/_lib/requestGuard.ts and
 * projectDocs/cost-model.md.
 */

const call = (overrides: Record<string, unknown> = {}) => ({
  provider: 'gemini',
  model: 'gemini-3.1-pro-preview',
  contents: { parts: [{ text: 'Mark this answer.' }] },
  config: { temperature: 0.2, thinkingConfig: { thinkingBudget: 4096 } },
  ...overrides,
});

/** The forwarded config of an allowed call; fails the test if the call was refused. */
const configOf = (verdict: GuardVerdict): Record<string, unknown> => {
  if (verdict.ok === false) throw new Error(`refused: ${verdict.error}`);
  return verdict.body.config as Record<string, unknown>;
};

const notStaff = vi.fn(async () => false);
const staff = vi.fn(async () => true);

describe('the model list', () => {
  it('is the registry, exactly, so a model the app offers is never refused and no other is let through', () => {
    const registry = AI_MODELS.map((m) => `${m.provider} ${m.model}`).sort();
    const allowed = ALLOWED_MODELS.map(([p, m]) => `${p} ${m}`).sort();
    expect(allowed).toEqual(registry);
  });

  it('refuses a model the app does not offer, before anything is spent', async () => {
    const verdict = await guardAiRequest(call({ model: 'gemini-4-argon' }), notStaff);
    expect(verdict).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a request that names no model, which a provider would otherwise fill with its own', async () => {
    const verdict = await guardAiRequest(
      call({ provider: 'anthropic', model: undefined }),
      notStaff
    );
    expect(verdict.ok).toBe(false);
  });

  it('refuses a registry model asked for under the wrong provider', async () => {
    const verdict = await guardAiRequest(
      call({ provider: 'anthropic', model: 'gemini-3.1-pro-preview' }),
      notStaff
    );
    expect(verdict.ok).toBe(false);
  });

  it('lets a caller who brings their own key for that provider use any model, since they pay', async () => {
    const verdict = await guardAiRequest(
      call({ model: 'gemini-4-argon', __keyOverride: { gemini: 'their-key' } }),
      notStaff
    );
    expect(verdict.ok).toBe(true);
  });
});

describe('a student-sized call', () => {
  it('gets an output ceiling on Gemini when it asked for none, and keeps its own settings', async () => {
    const verdict = await guardAiRequest(call(), notStaff);
    expect(verdict.ok).toBe(true);
    const config = configOf(verdict);
    expect(config.maxOutputTokens).toBe(STUDENT_MAX_OUTPUT_TOKENS);
    expect(config.temperature).toBe(0.2);
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 4096 });
  });

  it('leaves an unset ceiling to the other adapters, whose own default is lower', async () => {
    const verdict = await guardAiRequest(
      call({ provider: 'groq', model: 'gemma2-9b-it', config: {} }),
      notStaff
    );
    expect(configOf(verdict)).not.toHaveProperty('maxOutputTokens');
  });

  it('is held to the ceilings when it asks for more, and is not refused for it', async () => {
    const verdict = await guardAiRequest(
      call({ config: { maxOutputTokens: 65_536, thinkingConfig: { thinkingBudget: 32_768 } } }),
      notStaff
    );
    expect(verdict.ok).toBe(true);
    const config = configOf(verdict);
    expect(config.maxOutputTokens).toBe(STUDENT_MAX_OUTPUT_TOKENS);
    expect(config.thinkingConfig).toEqual({ thinkingBudget: STUDENT_MAX_THINKING_BUDGET });
  });

  it('refuses a prompt larger than any the app builds for a student', async () => {
    const huge = 'x'.repeat(STUDENT_MAX_INPUT_CHARS + 1);
    const verdict = await guardAiRequest(call({ contents: { parts: [{ text: huge }] } }), notStaff);
    expect(verdict).toMatchObject({ ok: false, status: 413 });
  });

  it('counts a system instruction towards the prompt', async () => {
    const half = 'x'.repeat(STUDENT_MAX_INPUT_CHARS / 2 + 10);
    const verdict = await guardAiRequest(
      call({
        contents: { parts: [{ text: half }] },
        config: { systemInstruction: half },
      }),
      notStaff
    );
    expect(verdict.ok).toBe(false);
  });

  it('fits the largest marking prompt the app builds, with room to spare', () => {
    // A 20-mark marking run measures about 22,000 characters (cost-model.md).
    expect(STUDENT_MAX_INPUT_CHARS).toBeGreaterThan(22_000 * 3);
  });
});

describe('staff', () => {
  it('may send a large prompt and ask for a large output, such as a syllabus import', async () => {
    const big = call({
      contents: { parts: [{ text: 'x'.repeat(STUDENT_MAX_INPUT_CHARS * 2) }] },
      config: { maxOutputTokens: 60_000 },
    });
    const verdict = await guardAiRequest(big, staff);
    expect(verdict.ok).toBe(true);
    expect(configOf(verdict).maxOutputTokens).toBe(60_000);
  });

  it('get no output ceiling on Gemini, so a long generation is not cut off', async () => {
    const verdict = await guardAiRequest(call({ config: {} }), staff);
    expect(configOf(verdict)).not.toHaveProperty('maxOutputTokens');
  });

  it('are still held to the app’s models', async () => {
    const verdict = await guardAiRequest(call({ model: 'gemini-4-argon' }), staff);
    expect(verdict.ok).toBe(false);
  });

  it('are asked about only when the answer matters', async () => {
    const lookup = vi.fn(async () => false);
    await guardAiRequest(call({ config: { maxOutputTokens: 2048 } }), lookup);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('the free-tier marking model', () => {
  it('is off unless the deployment sets it', async () => {
    const { freeTierMarkingModel } = await import('../../api/_lib/requestGuard');
    expect(freeTierMarkingModel(undefined)).toBeNull();
    expect(freeTierMarkingModel('  ')).toBeNull();
  });

  it('takes one of the app’s Gemini models', async () => {
    const { freeTierMarkingModel } = await import('../../api/_lib/requestGuard');
    expect(freeTierMarkingModel('gemini-3-flash-preview')).toBe('gemini-3-flash-preview');
  });

  it('ignores anything else, rather than send marking somewhere unpriced', async () => {
    const { freeTierMarkingModel } = await import('../../api/_lib/requestGuard');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(freeTierMarkingModel('gemini-4-argon')).toBeNull();
    expect(freeTierMarkingModel('claude-haiku-4-5')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
