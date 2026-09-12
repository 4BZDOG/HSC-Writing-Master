/**
 * Guard against a lazy feature chunk quietly rejoining the first load.
 *
 * Six feature bundles are deliberately kept out of a student's initial
 * download: the admin tooling, the PDF engine, html2canvas, the provider SDK,
 * and the direct-provider fallback. Their components are behind `React.lazy`
 * and their libraries behind dynamic `import()`, so the intent is in the source
 * — but whether it HOLDS is decided by Rollup, and Rollup will happily drag a
 * whole chunk into the eager graph over one shared module.
 *
 * That is not hypothetical. It has happened twice:
 *
 *   1. `agreementService`, `errorHandler` and `quotaService` were each used by
 *      exactly one feature chunk, so Rollup folded them INTO `admin` — and the
 *      entry, which needed them, imported the whole admin bundle to get them.
 *      Fixed by routing services/utils/hooks to `core` (see vite.config.ts).
 *   2. `components/MeshOverlay.tsx` — 27 lines drawing a background pattern —
 *      is imported by App, AppHeader and CommandVerbHierarchy (all eager) and
 *      by ContentAuditModal (lazy). No manualChunks rule claimed it, so it
 *      landed in `admin` and the entry imported that chunk to get it: 195 kB
 *      of Content Audit Studio, Review Queue, Usage Dashboard, Class Insights
 *      and Database Dashboard in the first load of every student who will
 *      never open one of them.
 *
 * Neither showed up as a build error, a failing test, or anything visible in
 * dev — Vite serves modules unbundled, so the split only exists in a
 * production build. `npm run build` printed the chunk sizes each time and both
 * went unnoticed for exactly that reason: the numbers are right there, and
 * nothing says which of them a student actually pays.
 *
 * The check reads `dist/index.html`. Vite writes one `<link rel="modulepreload">`
 * per chunk in the entry's STATIC import graph, so that list is the bundler's
 * own statement of what loads before anything is interactive — not a
 * reconstruction of it.
 *
 * Usage: npm run build && node scripts/checkEagerChunks.mjs [dist]
 * Exit code 1 = a chunk that should be lazy is in the first load.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(join(distDir, 'index.html'), 'utf8');

/**
 * Chunks that must never be in the entry's static graph, and what a student
 * pays for each if it gets back in.
 */
const MUST_STAY_LAZY = [
  ['admin', 'the admin/teacher tooling — a student cannot open any of it'],
  ['pdf-engine', 'jsPDF, loaded only when someone exports a report'],
  ['html2canvas.esm', 'the PDF rasteriser, same path as pdf-engine'],
  ['gemini', 'the provider SDK, reached only through aiCore'],
  ['aiDirect', 'the direct-provider fallback and its SDK'],
];

/**
 * A ceiling on the first load, well above today's figure so it flags a jump
 * rather than nagging about drift. It is a smoke alarm, not a budget: the named
 * chunks above are the real rule, and this catches a regression that arrives as
 * a chunk nobody thought to name.
 */
const EAGER_BUDGET_KB = 1900;

/** Every chunk Vite preloads for the entry, plus the entry module itself. */
const eagerChunks = () => {
  const out = new Set();
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) out.add(m[1]);
  return [...out];
};

const chunks = eagerChunks();

if (chunks.length === 0) {
  // A regex that matched nothing would pass every rule below in silence, which
  // is the failure this file exists to prevent, one level up.
  console.error(
    'checkEagerChunks: found no eager chunks in dist/index.html.\n' +
      'Either the build did not run, or Vite changed how it writes the preload ' +
      'list and this check is no longer reading it.'
  );
  process.exit(1);
}

/**
 * Where the emitted URLs in `index.html` sit relative to `distDir`.
 *
 * Vite prefixes every URL it writes with the deploy base, and this repo builds
 * with two different ones: Vercel serves from the root, so hrefs read
 * `/assets/x.js`, while the Pages workflow sets `DEPLOY_BASE_PATH=/<repo>/`
 * and they read `/<repo>/assets/x.js`. Resolving the second against `dist/`
 * looks for `dist/<repo>/assets/x.js`, which is not where the file is.
 *
 * That is not a hypothetical either. This check shipped resolving hrefs with
 * `replace(/^\//, '')`, which is correct at the root and wrong everywhere
 * else, and it broke the Pages deploy on the very commit that added it — every
 * eager chunk reported as missing from disk, three merges in a row, while the
 * identical check passed on the Vercel build.
 *
 * It also took the byte ceiling down with it, silently, which is the worse
 * half: with nothing resolving, `totalKb` stayed 0 and the 1900 kB rule passed
 * by measuring nothing at all. A first load could have doubled on the Pages
 * build and this file would have said so only in the noise of eleven
 * missing-file errors.
 *
 * Derived from the HTML rather than read from an env var, so the check needs
 * no knowledge of how the build that produced this `dist` was configured.
 */
const BASE = (() => {
  const withAssets = chunks.find((c) => c.includes('/assets/')) ?? '';
  const at = withAssets.indexOf('/assets/');
  return at === -1 ? '' : withAssets.slice(0, at);
})();

/** The on-disk path of an emitted URL, base prefix and all. */
const onDisk = (href) =>
  join(distDir, (href.startsWith(BASE) ? href.slice(BASE.length) : href).replace(/^\//, ''));

const assets = join(distDir, 'assets');
const built = readdirSync(assets);
const failures = [];

for (const [name, why] of MUST_STAY_LAZY) {
  // The chunk has to EXIST to be meaningfully absent: a renamed chunk would
  // otherwise pass this check forever by never matching anything.
  const exists = built.some((f) => f.startsWith(`${name}-`) && f.endsWith('.js'));
  if (!exists) {
    failures.push(
      `no chunk named "${name}-*.js" was built. If it was renamed or merged, ` +
        `update MUST_STAY_LAZY — as written, this rule now checks nothing.`
    );
    continue;
  }
  const eager = chunks.find((c) => c.includes(`/${name}-`));
  if (eager) {
    failures.push(
      `"${name}" is in the first load (${eager}) — ${why}.\n` +
        `    Something eager imports a module that Rollup placed in this chunk. ` +
        `Find it and give it a home of its own in vite.config.ts manualChunks, ` +
        `the way MeshOverlay and the services rule are handled.`
    );
  }
}

let totalKb = 0;
for (const c of chunks) {
  try {
    totalKb += statSync(onDisk(c)).size / 1024;
  } catch {
    failures.push(
      `eager chunk ${c} is listed in index.html but not on disk at ${onDisk(c)}.\n` +
        `    If the deploy base path changed, BASE above is what resolves it.`
    );
  }
}
totalKb = Math.round(totalKb);

// The ceiling below divides by nothing and compares against a number, so it
// passes cheerfully on a total of zero. That is exactly how it behaved on the
// Pages build for three merges, and a rule that cannot fail is worse than no
// rule — the same argument the MUST_STAY_LAZY existence check above makes.
if (totalKb === 0) {
  failures.push(
    `every eager chunk measured 0 kB, so the ${EAGER_BUDGET_KB} kB ceiling ` +
      `checked nothing. The sizes are not being read — fix that before ` +
      `trusting this run.`
  );
}

if (totalKb > EAGER_BUDGET_KB) {
  failures.push(
    `the first load is ${totalKb} kB, over the ${EAGER_BUDGET_KB} kB ceiling.\n` +
      `    Check what joined it before raising the number.`
  );
}

if (failures.length > 0) {
  console.error('\nEager-chunk check FAILED:\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log(
  `Eager chunks OK: ${chunks.length} chunks, ${totalKb} kB in the first load; ` +
    `${MUST_STAY_LAZY.map(([n]) => n).join(', ')} all stayed out.`
);
