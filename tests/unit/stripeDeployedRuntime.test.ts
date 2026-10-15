import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDeployedRuntime, isProductionRuntime } from '../../api/_lib/stripe';

/**
 * Which processes count as a deployment for the dev-only shortcuts (finding 23).
 * A Vercel preview is a deployment but not "production", so the two helpers
 * disagree on it on purpose. Locally, neither is true.
 */

const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isDeployedRuntime truth table', () => {
  it.each([
    ['nothing set (local dev, Vitest with NODE_ENV unset)', {}, false],
    ['NODE_ENV=test (Vitest)', { NODE_ENV: 'test' }, false],
    ['NODE_ENV=development (local)', { NODE_ENV: 'development' }, false],
    ['VERCEL_ENV set to an empty string', { VERCEL_ENV: '' }, false],
    ['VERCEL_ENV=production', { VERCEL_ENV: 'production' }, true],
    ['VERCEL_ENV=preview', { VERCEL_ENV: 'preview' }, true],
    ['VERCEL_ENV=development (vercel dev)', { VERCEL_ENV: 'development' }, true],
    ['NODE_ENV=production (self-hosted)', { NODE_ENV: 'production' }, true],
    ['VERCEL_ENV=preview with NODE_ENV=test', { VERCEL_ENV: 'preview', NODE_ENV: 'test' }, true],
  ])('%s → %s', (_label, env, expected) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    expect(isDeployedRuntime()).toBe(expected);
  });

  it('is true for a preview, where isProductionRuntime is false', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(isProductionRuntime()).toBe(false);
    expect(isDeployedRuntime()).toBe(true);
  });

  it('is true wherever isProductionRuntime is true', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isProductionRuntime()).toBe(true);
    expect(isDeployedRuntime()).toBe(true);

    for (const k of ENV_KEYS) delete process.env[k];
    process.env.NODE_ENV = 'production';
    expect(isProductionRuntime()).toBe(true);
    expect(isDeployedRuntime()).toBe(true);
  });
});
