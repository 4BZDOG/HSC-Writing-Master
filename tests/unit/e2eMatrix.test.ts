import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The E2E matrix is what turns one twenty-to-fifty-minute job into a handful of
 * parallel ones, and it is easy to break quietly: a project left out of it is a
 * browser that stops being tested while CI stays green, and a name that drifts
 * from `playwright.config.ts` is a leg that selects zero tests and passes.
 *
 * So these pin the matrix against the two things it has to agree with — the
 * Playwright config's own project list, and the workflow that consumes it.
 */

type Leg = {
  project: string;
  engine: string;
  servers: string;
  shard: number;
  shards: number;
  name: string;
  slug: string;
};

/** Runs the real script, as the workflow does, and parses what it prints. */
const matrixFor = (event: string): Leg[] =>
  JSON.parse(execFileSync('node', ['scripts/e2eMatrix.mjs', event], { encoding: 'utf8' })).include;

const config = readFileSync('playwright.config.ts', 'utf8');
const workflow = readFileSync('.github/workflows/build.yml', 'utf8');

/** The project names declared in `playwright.config.ts`. */
const configProjects = [...config.matchAll(/^\s{8}name: '([^']+)',/gm)].map((m) => m[1]);

describe('the E2E matrix', () => {
  it('names exactly the projects the Playwright config declares', () => {
    const everything = [...new Set(matrixFor('push').map((leg) => leg.project))];
    expect(everything.sort()).toEqual([...configProjects].sort());
    // Guards the regex above: a config with no projects would pass trivially.
    expect(configProjects.length).toBeGreaterThanOrEqual(6);
  });

  it('runs every browser on a push to main', () => {
    const projects = new Set(matrixFor('push').map((leg) => leg.project));
    for (const name of configProjects) expect(projects.has(name)).toBe(true);
  });

  it('runs the same trimmed set on a pull request as the config does for PW_FAST', () => {
    const fast = config.match(/FAST_PROJECTS = new Set\(\[([^\]]+)\]\)/);
    expect(fast, 'FAST_PROJECTS not found in playwright.config.ts').not.toBeNull();
    const configured = [...fast![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    const pr = [...new Set(matrixFor('pull_request').map((leg) => leg.project))].sort();
    expect(pr).toEqual(configured);
  });

  it('gives every project all of its shards, numbered from 1', () => {
    for (const event of ['pull_request', 'push']) {
      const legs = matrixFor(event);
      for (const project of new Set(legs.map((leg) => leg.project))) {
        const mine = legs.filter((leg) => leg.project === project);
        const total = mine[0].shards;
        expect(mine.map((leg) => leg.shard)).toEqual(
          Array.from({ length: total }, (_, i) => i + 1)
        );
        expect(mine.every((leg) => leg.shards === total)).toBe(true);
      }
    }
  });

  it('keeps every leg name and report name unique and artefact-safe', () => {
    const legs = matrixFor('push');
    expect(new Set(legs.map((leg) => leg.name)).size).toBe(legs.length);
    expect(new Set(legs.map((leg) => leg.slug)).size).toBe(legs.length);
    // upload-artifact rejects a slash, and a space makes the name awkward to use.
    for (const leg of legs) expect(leg.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('points the Supabase project at the Supabase dev server and nothing else', () => {
    for (const leg of matrixFor('push')) {
      expect(leg.servers).toBe(leg.project === 'supabase-chromium' ? 'supabase' : 'default');
    }
  });

  it('installs the engine each project actually launches', () => {
    const expected: Record<string, string> = {
      chromium: 'chromium',
      'Mobile Chrome': 'chromium',
      'supabase-chromium': 'chromium',
      firefox: 'firefox',
      webkit: 'webkit',
      'Mobile Safari': 'webkit',
    };
    for (const leg of matrixFor('push')) expect(leg.engine).toBe(expected[leg.project]);
  });
});

describe('the workflow that consumes it', () => {
  it('keeps a job named "E2E Tests" that the deploy waits on', () => {
    // The old single job had this name; anything that waits on it by name (a
    // required status check) has to keep finding it.
    expect(workflow).toMatch(/e2e-gate:\n\s+name: E2E Tests/);
    expect(workflow).toMatch(/needs: \[build, test, rls, e2e-gate, security\]/);
  });

  it('reports the gate even when a leg fails or is cancelled', () => {
    const gate = workflow.slice(workflow.indexOf('  e2e-gate:'), workflow.indexOf('  security:'));
    expect(gate).toMatch(/if: always\(\)/);
  });

  it('does not make the E2E legs wait for lint', () => {
    const e2e = workflow
      .slice(workflow.indexOf('  e2e:\n'), workflow.indexOf('  e2e-gate:'))
      // The job's own comment explains why it is not `needs: lint`; only the
      // YAML that GitHub reads should be matched.
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(e2e).toMatch(/needs: e2e-plan\n/);
    expect(e2e).not.toMatch(/needs:.*lint/);
  });

  it('lets one failing browser leave the others running', () => {
    expect(workflow).toMatch(/fail-fast: false/);
  });
});
