#!/usr/bin/env node
/**
 * Run the database's own test suite against a Postgres you control.
 *
 * These tests are the only thing standing between a regressed policy and a
 * data leak, and until now the only ways to run them were to push and wait for
 * CI, or to paste them into a live project's SQL editor — which is not
 * something anyone does casually against real student work. So the boundary
 * that most deserves a fast local loop was the one that did not have one.
 *
 * This is deliberately the SAME sequence .github/workflows/build.yml runs, in
 * the same order, including the double apply that proves schema.sql is safe to
 * re-run. If the two ever diverge, this file is the one that is wrong.
 *
 * Connection comes from the standard PG* environment variables, so it works
 * against a container or a local cluster without arguments:
 *
 *   npm run test:rls
 *   PGPORT=5433 npm run test:rls
 *   npm run test:rls -- --keep      # leave the database behind to poke at
 *
 * EACH RUN GETS ITS OWN DATABASE, created and dropped here. That is not tidiness,
 * it is the only way these files are valid: they seed committed fixtures and
 * share one namespace across three files, so a second run against the same
 * database fails on rows the first one left — `teacher A cannot see their own
 * student` turns up a profile the entitlement file committed. CI never notices
 * because a container is fresh every time; anyone running this twice would.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const keep = process.argv.includes('--keep');

/** The server, for creating and dropping the scratch database. */
const admin = {
  ...process.env,
  PGHOST: process.env.PGHOST || 'localhost',
  PGPORT: process.env.PGPORT || '5432',
  PGUSER: process.env.PGUSER || 'postgres',
  PGPASSWORD: process.env.PGPASSWORD || 'postgres',
  PGDATABASE: process.env.PGDATABASE || 'postgres',
};

const scratch = `hsc_rls_${Date.now().toString(36)}`;
/** The scratch database, for everything else. */
const env = { ...admin, PGDATABASE: scratch };

const where = `${admin.PGHOST}:${admin.PGPORT}`;

/** The CI sequence, verbatim. `check` marks the second re-apply guard pass. */
const STEPS = [
  { file: 'supabase/tests/ci/01_shim.sql', what: 'Supabase compat shim' },
  { file: 'supabase/schema.sql', what: 'schema' },
  { file: 'supabase/tests/ci/02_grants.sql', what: 'anon/authenticated grants' },
  { file: 'supabase/tests/ci/03_reapply_guard.sql', what: 'arm the re-apply guard' },
  { file: 'supabase/schema.sql', what: 'schema, a second time' },
  { file: 'supabase/tests/ci/03_reapply_guard.sql', what: 'check the re-apply guard', check: true },
  { file: 'supabase/tests/rls_negative_tests.sql', what: 'RLS negative tests', tests: true },
  { file: 'supabase/tests/entitlement_tests.sql', what: 'entitlement tests', tests: true },
  { file: 'supabase/tests/class_roll_tests.sql', what: 'class roll tests', tests: true },
];

const psql = (args, over = env) => spawnSync('psql', args, { env: over, encoding: 'utf8' });

if (spawnSync('psql', ['--version'], { encoding: 'utf8' }).error) {
  console.error('psql is not on PATH. Install the Postgres client tools and try again.');
  process.exit(1);
}

const reachable = psql(['-tAc', 'select 1'], admin);
if (reachable.status !== 0) {
  console.error(`Cannot reach Postgres at ${where}.\n`);
  console.error((reachable.stderr || '').trim());
  console.error(
    '\nThe quickest way to get one, matching the image CI uses:\n' +
      '  docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name hsc-rls postgres:15\n' +
      '  npm run test:rls\n' +
      '  docker rm -f hsc-rls\n\n' +
      'Or point PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE at a scratch database you already have.'
  );
  process.exit(1);
}

const created = psql(['-q', '-c', `create database ${scratch}`], admin);
if (created.status !== 0) {
  console.error(`Could not create a scratch database on ${where}.\n`);
  console.error((created.stderr || '').trim());
  console.error(
    '\nThe connecting role needs CREATEDB. A superuser (the usual local default) has it.'
  );
  process.exit(1);
}

console.log(`Running the database test suite on ${where}/${scratch}\n`);

let failed = false;
let passes = 0;

for (const step of STEPS) {
  if (!existsSync(step.file)) {
    console.error(`  MISSING  ${step.file}`);
    failed = true;
    break;
  }
  const args = ['-v', 'ON_ERROR_STOP=1', '-q'];
  if (step.check) args.push('-v', 'check=1');
  args.push('-f', step.file);
  const run = psql(args);

  // Every assertion in these files announces itself with a NOTICE; psql puts
  // notices on stderr, so a clean run still writes there. Only the exit code
  // says whether something failed.
  const notices = (run.stderr || '').split('\n');
  const stepPasses = notices.filter((l) => l.includes('PASS')).length;
  passes += stepPasses;

  if (run.status !== 0) {
    console.error(`  FAIL     ${step.what} (${step.file})\n`);
    // The raise that aborted the run is the last thing worth reading.
    console.error(
      notices
        .filter((l) => /ERROR|TEST FAILED|DETAIL|CONTEXT/.test(l))
        .slice(0, 12)
        .join('\n')
    );
    failed = true;
    break;
  }
  console.log(`  ok       ${step.what}${stepPasses ? ` — ${stepPasses} assertions` : ''}`);
}

if (keep) {
  console.log(`\nLeft ${scratch} in place: psql -d ${scratch}`);
} else {
  // Terminate stragglers first: psql exits cleanly but the server can still be
  // reaping the backend, and DROP DATABASE refuses while one is attached.
  psql(
    [
      '-q',
      '-c',
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${scratch}'`,
    ],
    admin
  );
  const dropped = psql(['-q', '-c', `drop database if exists ${scratch}`], admin);
  if (dropped.status !== 0) {
    console.error(`\nNote: could not drop ${scratch}; drop it by hand.`);
  }
}

console.log('');
if (failed) {
  console.error('FAIL — the database test suite did not pass.');
  process.exit(1);
}
console.log(`PASS — ${passes} database assertions held.`);
