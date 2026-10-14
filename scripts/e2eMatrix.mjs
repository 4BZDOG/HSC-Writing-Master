#!/usr/bin/env node
/**
 * The E2E job matrix: one runner per browser project (and per shard of the slow
 * ones), so the suite's wall-clock is its slowest leg rather than the sum of
 * every browser run one after another on a single runner.
 *
 * It lives in a script rather than inline in `build.yml` so the shape of the
 * matrix can be read, run and tested like any other code:
 *
 *   node scripts/e2eMatrix.mjs pull_request   # what a pull request runs
 *   node scripts/e2eMatrix.mjs push           # what a push to main runs
 *
 * Pull requests run the trimmed set (Chromium, Mobile Safari, and the Supabase
 * project) so a review round stays short. A push to main runs every browser, so
 * nothing ships without Firefox, desktop WebKit and Mobile Chrome having seen
 * it. `playwright.config.ts` keeps the same split for local `PW_FAST=1` runs;
 * `tests/unit/e2eMatrix.test.ts` pins that the two agree.
 *
 * A project's shard count is a cost/benefit call. Each extra shard buys back
 * test time but pays a leg's fixed set-up again (checkout, `npm ci`, the browser
 * cache), and the hosted-runner pool is finite. WebKit is the slowest engine on
 * these specs, so its two projects are split; the rest run as one leg. Move the
 * numbers when the per-leg times in a run's log say a leg has become the long
 * pole.
 */

/** @typedef {{ project: string, engine: 'chromium'|'webkit'|'firefox', servers: 'default'|'supabase', shards: number, fast: boolean }} E2eProject */

/**
 * `project` is the Playwright project name, `engine` the browser that has to be
 * installed for it, and `servers` which Vite dev server the project talks to
 * (the Supabase project needs the second one, with its stub env).
 *
 * @type {E2eProject[]}
 */
export const E2E_PROJECTS = [
  { project: 'chromium', engine: 'chromium', servers: 'default', shards: 1, fast: true },
  { project: 'Mobile Safari', engine: 'webkit', servers: 'default', shards: 2, fast: true },
  { project: 'supabase-chromium', engine: 'chromium', servers: 'supabase', shards: 1, fast: true },
  { project: 'firefox', engine: 'firefox', servers: 'default', shards: 1, fast: false },
  { project: 'webkit', engine: 'webkit', servers: 'default', shards: 2, fast: false },
  { project: 'Mobile Chrome', engine: 'chromium', servers: 'default', shards: 1, fast: false },
];

const slugOf = (project) => project.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * The matrix for a GitHub event: `{ include: [...] }`, one entry per leg.
 *
 * @param {string} eventName `pull_request` runs the trimmed set; anything else
 *   (a push to main) runs everything.
 */
export const buildMatrix = (eventName) => {
  const include = [];
  for (const p of E2E_PROJECTS) {
    if (eventName === 'pull_request' && !p.fast) continue;
    for (let shard = 1; shard <= p.shards; shard += 1) {
      const suffix = p.shards > 1 ? ` ${shard}/${p.shards}` : '';
      include.push({
        project: p.project,
        engine: p.engine,
        servers: p.servers,
        shard,
        shards: p.shards,
        // The leg's name in the checks list, and its report artefact's name,
        // which cannot contain spaces or a slash.
        name: `${p.project}${suffix}`,
        slug: p.shards > 1 ? `${slugOf(p.project)}-${shard}of${p.shards}` : slugOf(p.project),
      });
    }
  }
  return { include };
};

// Run as a command: print the matrix for the GitHub Actions `fromJSON`.
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  process.stdout.write(`${JSON.stringify(buildMatrix(process.argv[2] ?? 'push'))}\n`);
}
