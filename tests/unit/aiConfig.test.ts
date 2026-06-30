import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveTarget, setSelectedModel, getSelectionSnapshot } from '../../services/aiConfig';
import { modelsForRole } from '../../services/aiModels';

/**
 * The AI registry + runtime selection is the switching mechanism. These tests
 * lock in: a Gemini default (so nothing changes until switched), persistence of
 * a valid choice, rejection of invalid choices, and role-aware resolution.
 */
describe('aiConfig — provider/model switching', () => {
  beforeEach(() => {
    // Reset to defaults between tests (module state persists across imports).
    setSelectedModel('reasoning', 'gemini-pro');
    setSelectedModel('basic', 'gemini-flash');
  });
  afterEach(() => {
    setSelectedModel('reasoning', 'gemini-pro');
    setSelectedModel('basic', 'gemini-flash');
  });

  it('defaults both roles to Gemini', () => {
    expect(resolveTarget('reasoning')).toEqual({
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });
    expect(resolveTarget('basic')).toEqual({ provider: 'gemini', model: 'gemini-3-flash-preview' });
  });

  it('switches the active engine and resolves the new provider/model', () => {
    setSelectedModel('reasoning', 'claude-sonnet');
    expect(resolveTarget('reasoning')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    // The other role is unaffected.
    expect(resolveTarget('basic').provider).toBe('gemini');
  });

  it('ignores an unknown model id', () => {
    setSelectedModel('reasoning', 'does-not-exist');
    expect(resolveTarget('reasoning').model).toBe('gemini-3-pro-preview');
  });

  it('ignores a model that does not serve the requested role', () => {
    // claude-haiku is a basic-only model; it must not be selectable for reasoning.
    setSelectedModel('reasoning', 'claude-haiku');
    expect(resolveTarget('reasoning').model).toBe('gemini-3-pro-preview');
  });

  it('only offers role-appropriate models', () => {
    expect(modelsForRole('reasoning').every((m) => m.roles.includes('reasoning'))).toBe(true);
    expect(modelsForRole('basic').some((m) => m.id === 'gemini-flash')).toBe(true);
  });

  it('exposes a stable snapshot reference until a change occurs', () => {
    const a = getSelectionSnapshot();
    const b = getSelectionSnapshot();
    expect(a).toBe(b); // referential stability for useSyncExternalStore
    setSelectedModel('basic', 'claude-haiku');
    expect(getSelectionSnapshot()).not.toBe(a);
  });
});
