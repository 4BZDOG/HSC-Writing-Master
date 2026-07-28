import { describe, it, expect } from 'vitest';
import { AI_MODELS, getModelById, getModelByProviderModel } from '../../services/aiModels';
import { resolveTarget, setSelectedModel } from '../../services/aiConfig';

/**
 * Integrity of the engine registry. Adding a model is meant to be a one-entry
 * change, which is exactly why the entry has to be self-consistent: the proxy
 * routes on `provider`, the key check reads `keyEnv`, the usage dashboard
 * prices rows by looking a model string back up, and the selector persists
 * `id`. A duplicate id or a mismatched keyEnv fails at runtime, in the admin's
 * face, on whichever of those paths hits it first.
 */

const KEY_ENV_FOR_PROVIDER: Record<string, string> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  kimi: 'KIMI_API_KEY',
};

describe('AI model registry', () => {
  it('has a unique id per entry', () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names the key its provider actually reads', () => {
    for (const model of AI_MODELS) {
      expect(KEY_ENV_FOR_PROVIDER[model.provider], `${model.id}: unknown provider`).toBeTruthy();
      expect(model.keyEnv, `${model.id} claims the wrong key env`).toBe(
        KEY_ENV_FOR_PROVIDER[model.provider]
      );
    }
  });

  it('gives every entry a role, a label and a cost estimate', () => {
    for (const model of AI_MODELS) {
      expect(model.roles.length, `${model.id} is selectable for no role`).toBeGreaterThan(0);
      expect(model.label.trim()).not.toBe('');
      expect(model.model.trim()).not.toBe('');
      expect(Number.isFinite(model.estCostPerCall)).toBe(true);
      expect(model.estCostPerCall).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps provider model strings unique, so usage rows price correctly', () => {
    // getModelByProviderModel resolves a recorded call back to its entry. Two
    // entries sharing a model string would make the dashboard attribute spend
    // to whichever came first.
    const strings = AI_MODELS.map((m) => m.model);
    expect(new Set(strings).size).toBe(strings.length);
  });
});

describe('Kimi K3', () => {
  it('is reachable through OpenRouter without a Moonshot key', () => {
    const kimi = getModelById('openrouter-kimi-k3');
    expect(kimi, 'the OpenRouter route to Kimi K3 is missing').toBeTruthy();
    expect(kimi!.provider).toBe('openrouter');
    expect(kimi!.keyEnv).toBe('OPENROUTER_API_KEY');
    // Pinned, not the floating `~moonshotai/kimi-latest` alias: the engine
    // behind a marked band should be the one that was tested.
    expect(kimi!.model).toBe('moonshotai/kimi-k3');
    expect(kimi!.roles).toContain('reasoning');
  });

  it('still offers the direct Moonshot route as a separate engine', () => {
    const direct = getModelById('kimi-k3');
    expect(direct?.provider).toBe('kimi');
    expect(direct?.keyEnv).toBe('KIMI_API_KEY');
  });

  it('resolves to the OpenRouter provider when selected for marking', () => {
    setSelectedModel('reasoning', 'openrouter-kimi-k3');
    expect(resolveTarget('reasoning')).toEqual({
      provider: 'openrouter',
      model: 'moonshotai/kimi-k3',
    });
    setSelectedModel('reasoning', 'gemini-pro');
  });

  it('prices its usage rows from the recorded provider string', () => {
    // The tally records `moonshotai/kimi-k3`; the dashboard has to find it.
    expect(getModelByProviderModel('moonshotai/kimi-k3')?.id).toBe('openrouter-kimi-k3');
  });
});
