// @vitest-environment node
//
// Node, not jsdom: the subject is a CLI that is spawned as a child process and
// inspected through its JSON output and exit code, exactly as an operator (or
// CI) runs it.

import { describe, it, expect } from 'vitest';
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';

/**
 * The deployment preflight is the only automated thing standing between an
 * operator and this app's quiet misconfigurations. So it has to be right in
 * both directions, and the second direction is the one that matters most: a
 * check that fires on a legitimate configuration is a check people learn to
 * pass `|| true` on, and after that it protects nothing.
 *
 * Every case below is a configuration this repository can actually be
 * deployed in — the mock-mode demo, the GitHub Pages build, the Vercel
 * production deployment — rather than a synthetic string that happens to trip
 * a regex.
 */

interface Finding {
  level: 'error' | 'warn' | 'info';
  check: string;
  message: string;
  fix?: string;
}

/**
 * Runs the real script with a HERMETIC environment. `env -i` is the point:
 * inheriting the developer's shell would let a stray GEMINI_API_KEY or a real
 * .env.local decide the result, and a test whose outcome depends on the
 * machine it runs on is not a test.
 */
const run = (
  vars: Record<string, string>,
  extraArgs: string[] = []
): { code: number; findings: Finding[] } => {
  const args = ['scripts/checkDeployment.mjs', '--no-env-file', '--json', ...extraArgs];
  const options: ExecFileSyncOptionsWithStringEncoding = {
    encoding: 'utf8',
    // PATH so `node` resolves; nothing else from the ambient environment.
    env: { PATH: process.env.PATH ?? '', ...vars },
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  try {
    return { code: 0, findings: JSON.parse(execFileSync('node', args, options)).findings };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, findings: JSON.parse(e.stdout).findings };
  }
};

const checks = (findings: Finding[], level: Finding['level']) =>
  findings.filter((f) => f.level === level).map((f) => f.check);

/** A minimal, correct Vercel production configuration. */
const HEALTHY = {
  GEMINI_API_KEY: 'AIzaSyRealLookingKey',
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon',
  VITE_ALLOWED_EMAIL_DOMAINS: 'education.nsw.gov.au',
  VITE_OAUTH_PROVIDERS: 'azure',
};

describe('deployment preflight — configurations it must NOT complain about', () => {
  it('passes a correctly configured Vercel deployment', () => {
    const { code, findings } = run(HEALTHY);
    expect(checks(findings, 'error')).toEqual([]);
    expect(checks(findings, 'warn')).toEqual([]);
    expect(code).toBe(0);
  });

  it('accepts the GitHub Pages build the workflow actually produces', () => {
    // deploy-pages.yml with no API_BASE_URL variable: a static, keyless,
    // demo-account build. Every one of those is deliberate here, so none of
    // them may be an error — only the demo-account warning is worth saying.
    const { code, findings } = run({
      DEPLOY_BASE_PATH: '/HSC-Writing-Master/',
      VITE_ENABLE_DEMO_AUTH: 'true',
      VITE_STATIC_HOSTING: 'true',
    });
    expect(checks(findings, 'error')).toEqual([]);
    expect(code).toBe(0);
  });

  it('accepts a Pages build paired with a Vercel API', () => {
    const { code, findings } = run({
      DEPLOY_BASE_PATH: '/HSC-Writing-Master/',
      VITE_ENABLE_DEMO_AUTH: 'true',
      VITE_STATIC_HOSTING: 'false',
      VITE_API_BASE_URL: 'https://hsc-evaluator.vercel.app',
    });
    expect(checks(findings, 'error')).toEqual([]);
    expect(code).toBe(0);
  });

  it('treats a keyless mock-mode dev setup as a warning, never an error', () => {
    // `npm run dev` with nothing configured has to keep working — it is the
    // documented way to try the app.
    const { code, findings } = run({});
    expect(checks(findings, 'error')).toEqual([]);
    expect(checks(findings, 'warn')).toContain('supabase-absent');
    expect(code).toBe(0);
  });

  it('accepts matched pairs of client and server policy variables', () => {
    const { findings } = run({
      ...HEALTHY,
      VITE_MONETISATION_ENABLED: 'false',
      MONETISATION_ENABLED: 'false',
      VITE_PLAN_FEATURE_OVERRIDES: 'sampleAnswers:free,aiContentStudio:plus',
      PLAN_FEATURE_OVERRIDES: 'sampleAnswers:free,aiContentStudio:plus',
    });
    expect(checks(findings, 'error')).toEqual([]);
  });
});

describe('deployment preflight — the mistakes that cost money or data', () => {
  it('catches a provider key that would be published in the client bundle', () => {
    const { code, findings } = run({ ...HEALTHY, VITE_GEMINI_API_KEY: 'AIzaSyLeaked' });
    expect(checks(findings, 'error')).toContain('key-in-bundle');
    expect(code).toBe(1);
  });

  it('catches client-side Supabase without the server-side pair', () => {
    // The state that leaves the AI proxy ungated in a deployment that plainly
    // has real accounts. In production the proxy now 503s rather than serving
    // openly, so this is caught either way — but caught before the deploy is
    // the difference between a checklist item and an outage.
    const { code, findings } = run({
      GEMINI_API_KEY: 'AIzaSyRealLookingKey',
      VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon',
      VITE_ALLOWED_EMAIL_DOMAINS: 'education.nsw.gov.au',
    });
    expect(checks(findings, 'error')).toContain('supabase-half-configured');
    expect(code).toBe(1);
  });

  it('catches the two Supabase pairs pointing at different projects', () => {
    const { findings } = run({
      ...HEALTHY,
      SUPABASE_URL: 'https://a-different-project.supabase.co',
    });
    expect(checks(findings, 'error')).toContain('supabase-url-mismatch');
  });

  it('catches a service-role key parked in the anon key variable', () => {
    const serviceRole = 'eyJhbGciOiJIUzI1NiJ9.service_role';
    const { findings } = run({
      ...HEALTHY,
      SUPABASE_ANON_KEY: serviceRole,
      VITE_SUPABASE_ANON_KEY: serviceRole,
      SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    });
    expect(checks(findings, 'error')).toContain('service-role-as-anon');
  });

  it('catches demo accounts shipped alongside real ones', () => {
    const { findings } = run({ ...HEALTHY, VITE_ENABLE_DEMO_AUTH: 'true' });
    expect(checks(findings, 'error')).toContain('demo-auth-with-supabase');
  });

  it('warns that an unrestricted deployment hands the AI budget to anyone', () => {
    const { findings } = run({
      GEMINI_API_KEY: 'AIzaSyRealLookingKey',
      VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon',
      SUPABASE_URL: 'https://abcdefgh.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.anon',
    });
    expect(checks(findings, 'warn')).toContain('unrestricted-accounts');
  });

  it('catches an unsigned Stripe webhook', () => {
    const { findings } = run({
      ...HEALTHY,
      STRIPE_SECRET_KEY: 'sk_test_abc123',
      STRIPE_PLUS_MONTHLY_PRICE_ID: 'price_abc',
      VITE_STRIPE_PLUS_MONTHLY_PRICE_ID: 'price_abc',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.service_role',
    });
    expect(checks(findings, 'error')).toContain('stripe-webhook-secret');
  });
});

describe('deployment preflight — client/server halves that must agree', () => {
  it.each([
    ['VITE_MONETISATION_ENABLED', 'MONETISATION_ENABLED', 'false'],
    ['VITE_PLAN_FEATURE_OVERRIDES', 'PLAN_FEATURE_OVERRIDES', 'sampleAnswers:free'],
    ['VITE_FREE_TIER_FULL_FEEDBACK', 'FREE_TIER_FULL_FEEDBACK', 'true'],
    ['VITE_STRIPE_PLUS_MONTHLY_PRICE_ID', 'STRIPE_PLUS_MONTHLY_PRICE_ID', 'price_abc'],
  ])('catches %s set without %s', (clientName, _serverName, val) => {
    const { findings } = run({ ...HEALTHY, [clientName]: val });
    expect(checks(findings, 'error')).toContain('paired-variable-missing');
  });

  it('catches a pair that is set on both sides but disagrees', () => {
    const { findings } = run({
      ...HEALTHY,
      VITE_MONETISATION_ENABLED: 'false',
      MONETISATION_ENABLED: 'true',
    });
    expect(checks(findings, 'error')).toContain('paired-variable-mismatch');
  });

  it('warns about a plan override the policy parser would silently ignore', () => {
    // The parser drops unrecognised entries and logs, so a typo leaves the
    // shipped default in place — the gate looks changed and is not.
    const { findings } = run({
      ...HEALTHY,
      VITE_PLAN_FEATURE_OVERRIDES: 'sampleAnswer:free',
      PLAN_FEATURE_OVERRIDES: 'sampleAnswer:free',
    });
    expect(checks(findings, 'warn')).toContain('plan-override-unrecognised');
  });
});

describe('deployment preflight — hosting shape', () => {
  it('catches a base path missing its slashes', () => {
    const { findings } = run({ ...HEALTHY, DEPLOY_BASE_PATH: 'HSC-Writing-Master' });
    expect(checks(findings, 'error')).toContain('base-path-shape');
  });

  it('catches a wildcard in ALLOWED_ORIGIN, which the CORS helper rejects', () => {
    const { findings } = run({ ...HEALTHY, ALLOWED_ORIGIN: '*' });
    expect(checks(findings, 'error')).toContain('allowed-origin-wildcard');
  });

  it('catches an ALLOWED_ORIGIN written as a URL rather than an origin', () => {
    // The header the browser sends has no path and no trailing slash, and the
    // comparison is literal, so 'https://x.github.io/repo/' never matches.
    const { findings } = run({ ...HEALTHY, ALLOWED_ORIGIN: 'https://owner.github.io/repo/' });
    expect(checks(findings, 'error')).toContain('allowed-origin-shape');
  });

  it('catches a static build that has been handed an API origin it will not call', () => {
    const { findings } = run({
      VITE_STATIC_HOSTING: 'true',
      VITE_API_BASE_URL: 'https://hsc-evaluator.vercel.app',
    });
    expect(checks(findings, 'error')).toContain('static-hosting-with-api');
  });
});

describe('deployment preflight — the copied-template trap', () => {
  it('catches .env.example placeholders left in place', () => {
    // `cp .env.example .env.local` is the documented first step, and the file
    // ships illustrative values rather than blanks. Every one of them is
    // truthy, and truthy is all the app checks — so a copied template is a
    // deployment that believes it has a Supabase project.
    const { code, findings } = run({
      GEMINI_API_KEY: 'your_gemini_api_key_here',
      VITE_SUPABASE_URL: 'https://your-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'your_supabase_anon_key_here',
    });
    const placeholder = findings.find((f) => f.check === 'placeholder-values');
    expect(placeholder?.level).toBe('error');
    expect(placeholder?.message).toContain('VITE_SUPABASE_URL');
    expect(code).toBe(1);
  });

  it('does not mistake a real key for a placeholder', () => {
    const { findings } = run(HEALTHY);
    expect(checks(findings, 'error')).not.toContain('placeholder-values');
  });
});
