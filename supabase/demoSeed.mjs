// =============================================================================
// HSC AI Evaluator — demo cohort seed
// =============================================================================
// Creates the demo accounts and the accumulated history behind them, so every
// feature that depends on ongoing use has something to show: Class Insights,
// Student Progress and its band-trend sparkline, the progress reports (student,
// class and school, with their course drill-down), the student roster, the Usage
// Dashboard, the Review Queue, quota states, XP/levels/streaks.
//
// Two Year 12 classes share one school: the Enterprise class (Ms Bennett, with
// Mr Okafor as co-teacher) and the Software class (Mr Okafor alone). Some
// students take both courses and sit in both classes.
//
// Run AFTER supabase/seed.mjs — the cohort attaches its attempts to the
// curriculum that script imports, and refuses to run if the question bank is
// empty.
//
// Usage:
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS
//   export DEMO_ACCOUNT_PASSWORD="<password for every demo login>"
//   node supabase/demoSeed.mjs                              # seed / refresh
//   node supabase/demoSeed.mjs --reset                      # wipe demo data first
//
// ⚠️ SAFETY: this script writes fabricated student work and creates accounts
// with a shared password. It MUST NOT run against a database holding real
// users. It therefore refuses to start unless the target database contains a
// `public.demo_environment` table — something you create by hand, once, only on
// the demo project:
//
//     create table public.demo_environment (confirmed boolean not null);
//     insert into public.demo_environment values (true);
//
// A guard the script could create itself would be no guard at all, which is why
// this step is manual and deliberately not automated.
// =============================================================================

import { readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const COURSE_DATA_DIR = join(ROOT, 'public', 'courseData');

/**
 * The course file each demo course is loaded from. The keys are the `course`
 * values in utils/demoCohort.ts (DEMO_CLASSES and the students' `courses`).
 */
const COURSE_FILES = {
  enterprise: 'HSCEnterpriseComputing09122025.json',
  software: 'HSCSoftwareEngineering09122025.json',
};

/**
 * Demo class names that are no longer used. The Software class was once named
 * "Year 11 …"; a database seeded then keeps that class, with its enrolments, beside
 * the current one unless it is removed by name. Both runs and resets remove these.
 */
const RETIRED_CLASS_NAMES = ['Year 11 Software Engineering (Demo)'];

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_ACCOUNT_PASSWORD } = process.env;
const RESET = process.argv.includes('--reset');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!DEMO_ACCOUNT_PASSWORD || DEMO_ACCOUNT_PASSWORD.length < 12) {
  console.error(
    'Missing env. Set DEMO_ACCOUNT_PASSWORD to at least 12 characters — every ' +
      'demo account shares it, so a weak one is a real exposure.'
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DAY_MS = 86_400_000;
/** Timestamp `daysAgo` whole days before now, as an ISO string. */
const isoDaysAgo = (daysAgo) => new Date(Date.now() - daysAgo * DAY_MS).toISOString();
/** UTC date (YYYY-MM-DD) `daysAgo` days before now. */
const dayDaysAgo = (daysAgo) => isoDaysAgo(daysAgo).slice(0, 10);

const die = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

/** True when the error means the table itself is absent (a database that predates it). */
const isMissingTable = (error) =>
  error?.code === '42P01' || /does not exist/i.test(error?.message ?? '');

// ---------------------------------------------------------------------------
// Loading the cohort generator
// ---------------------------------------------------------------------------
// utils/demoCohort.ts is TypeScript, and deliberately so: it is shared with the
// browser fixture path (services/demoFixtures.ts) and is unit-tested. Rather
// than duplicate the archetype and band logic in JavaScript — which would let
// the two demo paths drift apart, exactly what the shared module exists to
// prevent — bundle it to a temporary ESM file and import that.

const loadCohortModule = async () => {
  const outfile = join(tmpdir(), `hsc-demo-cohort-${process.pid}.mjs`);
  await build({
    entryPoints: [join(ROOT, 'utils', 'demoCohort.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });
  try {
    return await import(`file://${outfile}`);
  } finally {
    await unlink(outfile).catch(() => {});
  }
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Refuse to touch anything that is not the demo project. See the header note. */
const assertDemoEnvironment = async () => {
  const { data, error } = await db.from('demo_environment').select('confirmed').limit(1);
  if (error) {
    die(
      'This database is not marked as a demo environment, so the seed refused ' +
        'to run.\n  Create the marker by hand on the DEMO project only:\n\n' +
        '    create table public.demo_environment (confirmed boolean not null);\n' +
        '    insert into public.demo_environment values (true);\n\n' +
        `  (lookup failed: ${error.message})`
    );
  }
  if (!data?.length || data[0].confirmed !== true) {
    die(
      'public.demo_environment exists but is not confirmed — insert a row with confirmed = true.'
    );
  }
};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * The staff accounts. The cohort's students come from DEMO_STUDENTS in
 * utils/demoCohort.ts; the classes they sit in come from DEMO_CLASSES there.
 *
 * `aiQuota` is a deliberate cap: demo accounts do make real AI calls (so a live
 * marking run works in a pitch) but a shared password plus an uncapped budget
 * would be an open invitation to spend the project's API credit.
 */
const STAFF_ACCOUNTS = [
  {
    username: 'demo.admin',
    displayName: 'Demo Administrator',
    role: 'admin',
    aiQuota: 100,
    stripePlan: 'school',
    note: 'Database Manager, Data Vault, Content Audit Studio, API monitor, quota admin',
  },
  {
    username: 'demo.teacher',
    displayName: 'Ms Bennett (Demo)',
    role: 'teacher',
    aiQuota: 60,
    stripePlan: 'school',
    note: 'owns the Enterprise class — reports cover that class only',
  },
  {
    username: 'demo.coteacher',
    displayName: 'Mr Okafor (Demo)',
    role: 'teacher',
    aiQuota: 40,
    stripePlan: 'school',
    note: 'owns the Software class and co-teaches Enterprise — reports cover both',
  },
];

/**
 * Plan-state accounts. They exist to make the paywall and quota states reachable
 * without waiting for a real user to hit them. Sam (free) and Ava (plus) also have
 * work behind them (DEMO_PLAN_STUDENT_HISTORY in utils/demoCohort.ts); Ben (capped)
 * has none, which is the state his account shows.
 *
 * `classKeys` is their class enrolment. The cohort students carry their own.
 */
const PLAN_STATE_STUDENTS = [
  {
    username: 'demo.free',
    displayName: 'Sam (Demo, Free)',
    role: 'student',
    aiQuota: 10,
    stripePlan: 'free',
    classKeys: ['enterprise'],
    note: 'free tier — locked tier 4-6 questions, blurred high-band samples, summary-only feedback',
  },
  {
    username: 'demo.plus',
    displayName: 'Ava (Demo, Plus)',
    role: 'student',
    aiQuota: 30,
    stripePlan: 'plus',
    classKeys: ['enterprise', 'software'],
    note: 'Band 6 Plus, two courses of history — the unlocked comparison, and PDF export',
  },
  {
    username: 'demo.capped',
    displayName: 'Ben (Demo, Capped)',
    role: 'student',
    aiQuota: 5,
    stripePlan: 'free',
    classKeys: ['enterprise'],
    exhaustQuota: true,
    note: 'at the daily cap, no history — makes the 429 path and the empty report state demonstrable',
  },
];

const emailFor = (username) => `${username.replace(/\./g, '-')}@demo.invalid`;

/**
 * Creates (or reuses) the auth user and its profile row.
 *
 * Roles go through set_user_role()'s underlying column via the service role:
 * profiles.role is protected from self-escalation by a trigger, but the service
 * role runs outside a user JWT so a direct update is the sanctioned server-side
 * path (see supabase/README.md).
 */
/**
 * The auth user with this email, or null.
 *
 * `createUser` is not idempotent and there is no admin "get by email", so the
 * only way to recover from an "email already registered" is to page the admin
 * list. Needed because an auth user CAN exist without a profile: if
 * `deleteUser` fails during a reset, the profile is dropped and the auth user
 * survives, and `upsertAccount` looks the account up by profile.
 */
const findAuthUserByEmail = async (email) => {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null; // last page
  }
  return null;
};

const upsertAccount = async ({ username, displayName, role, stripePlan, schoolId, aiQuota }) => {
  const email = emailFor(username);

  // createUser is not idempotent — an existing email returns an error rather
  // than the user — so look first via the profile, which we control.
  const { data: existingProfile } = await db
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  let userId = existingProfile?.id;

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEMO_ACCOUNT_PASSWORD,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (error) {
      // The auth user already exists but has no profile — the state an
      // interrupted reset leaves behind. Aborting here used to strand the whole
      // seed at account 1 of 18, with the school row already written and no way
      // forward but manual SQL. Adopt the existing user instead; the profile
      // upsert below recreates the missing row.
      const existing = await findAuthUserByEmail(email);
      if (!existing) throw new Error(`createUser(${username}) failed: ${error.message}`);
      console.log(`  note: ${username} had an auth user with no profile; adopting it`);
      userId = existing.id;
      const { error: pwErr } = await db.auth.admin.updateUserById(userId, {
        password: DEMO_ACCOUNT_PASSWORD,
      });
      if (pwErr) throw new Error(`resetting ${username} password failed: ${pwErr.message}`);
    } else {
      userId = data.user.id;
    }
  } else {
    // Keep the shared password in step with the env var on a reseed.
    const { error } = await db.auth.admin.updateUserById(userId, {
      password: DEMO_ACCOUNT_PASSWORD,
    });
    if (error) {
      // A profile whose auth user has gone (an interrupted reset leaves exactly
      // this) would otherwise abort every subsequent run with no way forward but
      // manual SQL. Drop the orphan and create the account fresh.
      console.log(`  note: ${username} had no auth user; recreating`);
      await db.from('profiles').delete().eq('id', userId);
      const { data, error: createErr } = await db.auth.admin.createUser({
        email,
        password: DEMO_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (createErr) {
        throw new Error(`recreating ${username} failed: ${createErr.message}`);
      }
      userId = data.user.id;
    }
  }

  // handle_new_user() may have created the profile already; upsert over it.
  const { error: profileErr } = await db.from('profiles').upsert(
    {
      id: userId,
      username,
      display_name: displayName,
      role,
      school_id: schoolId ?? null,
      stripe_plan: stripePlan ?? 'free',
      daily_ai_quota: aiQuota ?? null,
    },
    { onConflict: 'id' }
  );
  if (profileErr) throw new Error(`profile(${username}) failed: ${profileErr.message}`);

  return userId;
};

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

/** The demo school, with a pooled AI budget set high enough to be visible but not blocking. */
const upsertSchool = async (name) => {
  const { data: existing } = await db.from('schools').select('id').eq('name', name).maybeSingle();
  const row = {
    name,
    // Comfortably above the cohort's daily burn, so the pooled-usage pill shows
    // meaningful consumption without demo users hitting a wall mid-pitch.
    daily_ai_limit: 400,
    plan_seats: 30,
    plan_status: 'active',
    plan_period_end: isoDaysAgo(-300), // ~10 months out
  };
  if (existing) {
    const { error } = await db.from('schools').update(row).eq('id', existing.id);
    if (error) throw new Error(`school update failed: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await db.from('schools').insert(row).select('id').single();
  if (error) throw new Error(`school insert failed: ${error.message}`);
  return data.id;
};

/**
 * A demo class, with its owner and year.
 *
 * Written directly rather than through `create_class()`: that RPC is admin-only
 * and resolves `auth.uid()`, which a service-role script has no session for.
 * Returns null when the table does not exist yet, so the seed still completes
 * against a database that predates schema §19 instead of aborting.
 */
const upsertClass = async ({ schoolId, name, year, ownerId }) => {
  if (!ownerId) throw new Error(`upsertClass: the owner of "${name}" has no id`);

  const { data: existing, error: selErr } = await db
    .from('classes')
    .select('id')
    .eq('school_id', schoolId)
    .eq('name', name)
    .maybeSingle();

  if (selErr) {
    if (isMissingTable(selErr)) return null;
    throw new Error(`class lookup failed: ${selErr.message}`);
  }

  const row = { school_id: schoolId, name, owner_id: ownerId, year };
  if (existing) {
    const { error } = await db.from('classes').update(row).eq('id', existing.id);
    if (error) throw new Error(`class update failed: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await db.from('classes').insert(row).select('id').single();
  if (error) throw new Error(`class insert failed: ${error.message}`);
  return data.id;
};

/** Maps the course JSON's prompt `legacy_id`s onto the seeded rows' UUIDs. */
const loadPromptIdMap = async () => {
  const map = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('prompts')
      .select('id, legacy_id')
      .not('legacy_id', 'is', null)
      // A paged read needs a total order: without one, PostgREST may return
      // rows in a different order per request, so ranges can silently overlap
      // or skip and the map comes out incomplete.
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`prompt lookup failed: ${error.message}`);
    for (const row of data) map.set(row.legacy_id, row.id);
    if (data.length < PAGE) break;
  }
  return map;
};

/** Inserts rows in chunks — a single 500-row insert is fine, 5,000 is not. */
const insertChunked = async (table, rows, options) => {
  const SIZE = 500;
  for (let i = 0; i < rows.length; i += SIZE) {
    const chunk = rows.slice(i, i + SIZE);
    const query = options?.onConflict
      ? db.from(table).upsert(chunk, { onConflict: options.onConflict })
      : db.from(table).insert(chunk);
    const { error } = await query;
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
};

/**
 * Removes everything this script created, so `--reset` is a true refresh rather
 * than an accumulation. Ordered child-first; most tables would cascade from the
 * profile delete, but being explicit keeps the intent readable.
 */
const resetDemoData = async (usernames, { schoolName, classNames }) => {
  // The demo classes are removed by name, inside the demo school. Their owners'
  // profile deletes would cascade to them too, but naming them keeps the reset
  // explicit about what it removes. Their enrolments go with them.
  const { data: school, error: schoolErr } = await db
    .from('schools')
    .select('id')
    .eq('name', schoolName)
    .maybeSingle();
  if (schoolErr) throw new Error(`school lookup failed: ${schoolErr.message}`);
  if (school) {
    const { error } = await db
      .from('classes')
      .delete()
      .eq('school_id', school.id)
      .in('name', classNames);
    // A database that predates schema §19 has no classes to remove.
    if (error && !isMissingTable(error)) throw new Error(`classes reset failed: ${error.message}`);
  }

  const { data: profiles } = await db.from('profiles').select('id').in('username', usernames);
  const ids = (profiles ?? []).map((p) => p.id);
  if (!ids.length) return 0;

  for (const table of [
    'response_events',
    'responses',
    'ai_usage',
    'ai_model_usage',
    'evaluation_usage',
  ]) {
    const { error } = await db.from(table).delete().in('user_id', ids);
    if (error) throw new Error(`${table} reset failed: ${error.message}`);
  }
  // Contributions authored by demo accounts (sample answers cascade). Checked
  // like every other write here: unreported, a failure let --reset claim success
  // while the next run stacked another six contributions on top of the old ones.
  const { error: promptErr } = await db
    .from('prompts')
    .delete()
    .in('created_by', ids)
    .neq('status', 'approved');
  if (promptErr) throw new Error(`prompts reset failed: ${promptErr.message}`);

  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    // Deleting the auth user cascades the profile away. If it fails, drop the
    // profile so the reset still completes — that leaves a profile-less auth
    // user, which `upsertAccount` now adopts on the next run rather than
    // aborting. Either survivable half-state is recoverable.
    if (error) {
      console.log(`  note: could not delete auth user ${id} (${error.message}); dropping profile`);
      await db.from('profiles').delete().eq('id', id);
    }
  }
  return ids.length;
};

/**
 * Pending contributions, so the Review Queue has something to triage.
 *
 * Quality scores are spread deliberately across the range: the queue sorts
 * lowest-first and badges by colour, so a queue where everything scored 80
 * would demonstrate neither the ordering nor the badge.
 */
const seedContributions = async (dotPointId, authorId) => {
  const drafts = [
    {
      question: 'Outline one benefit of cloud-based enterprise systems.',
      verb: 'OUTLINE',
      totalMarks: 2,
      quality: 34,
      notes: 'Very short; no marking criteria supplied.',
    },
    {
      question: 'Describe how data warehousing supports business reporting.',
      verb: 'DESCRIBE',
      totalMarks: 4,
      quality: 52,
      notes: 'Reasonable question, marking criteria thin.',
    },
    {
      question: 'Explain two risks of storing enterprise data offshore.',
      verb: 'EXPLAIN',
      totalMarks: 5,
      quality: 61,
      notes: 'Sound. Terminology could be tightened.',
    },
    {
      question: 'Analyse the impact of automation on enterprise workforce planning.',
      verb: 'ANALYSE',
      totalMarks: 6,
      quality: 78,
      notes: 'Good scaffolding and criteria.',
    },
    {
      question: 'Evaluate the effectiveness of agile methods for enterprise-scale projects.',
      verb: 'EVALUATE',
      totalMarks: 8,
      quality: 91,
      notes: 'Strong, exam-ready question with a full rubric.',
    },
    {
      question: 'Assess the role of data governance in enterprise decision-making.',
      verb: 'ASSESS',
      totalMarks: 7,
      quality: 44,
      notes: 'Overlaps an existing question; criteria absent.',
    },
  ];

  const rows = drafts.map((d, i) => ({
    dot_point_id: dotPointId,
    legacy_id: `demo:contribution-${i + 1}`,
    question: d.question,
    verb: d.verb,
    total_marks: d.totalMarks,
    marking_criteria: d.quality > 60 ? 'Award marks for each distinct, developed point.' : null,
    status: 'pending',
    quality_score: d.quality,
    quality_notes: d.notes,
    created_by: authorId,
  }));

  // Deliberately NOT an upsert on legacy_id. `prompts` has no plain unique
  // index on that column — only the *partial* uniq_prompts_legacy_owner on
  // (legacy_id, created_by) where both are non-null — and Postgres will not
  // accept a partial index as an ON CONFLICT arbiter without a matching WHERE
  // clause, which PostgREST cannot emit. So do what seed.mjs does: look the row
  // up, then update or insert. Keeps the reseed duplicate-free.
  for (const row of rows) {
    const { data: existing, error: selErr } = await db
      .from('prompts')
      .select('id')
      .eq('legacy_id', row.legacy_id)
      .maybeSingle();
    if (selErr) throw new Error(`contribution lookup failed: ${selErr.message}`);

    const { error } = existing
      ? await db.from('prompts').update(row).eq('id', existing.id)
      : await db.from('prompts').insert(row);
    if (error) throw new Error(`contribution write failed: ${error.message}`);
  }
  return rows.length;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('HSC AI Evaluator — demo cohort seed\n');

  await assertDemoEnvironment();
  console.log('✓ demo environment marker present');

  const {
    DEMO_SCHOOL_NAME,
    DEMO_CLASSES,
    DEMO_STUDENTS,
    DEMO_PLAN_STUDENT_HISTORY,
    ARCHETYPES,
    generateCohort,
    promptPoolFromCourse,
    latestPerPrompt,
    demoUsageModels,
  } = await loadCohortModule();

  for (const spec of DEMO_CLASSES) {
    if (!COURSE_FILES[spec.course]) {
      die(`${spec.name} studies "${spec.course}", which has no entry in COURSE_FILES.`);
    }
  }

  // Every demo account, cohort and plan-state alike, so a reset removes all of them.
  const allUsernames = [
    ...new Set([
      ...STAFF_ACCOUNTS.map((a) => a.username),
      ...PLAN_STATE_STUDENTS.map((a) => a.username),
      ...DEMO_STUDENTS.map((s) => s.username),
      ...DEMO_PLAN_STUDENT_HISTORY.map((s) => s.username),
    ]),
  ];

  if (RESET) {
    const removed = await resetDemoData(allUsernames, {
      schoolName: DEMO_SCHOOL_NAME,
      classNames: [...DEMO_CLASSES.map((c) => c.name), ...RETIRED_CLASS_NAMES],
    });
    console.log(`✓ reset: removed ${removed} existing demo account(s) and their data`);
  }

  // --- curriculum -----------------------------------------------------------
  // Both courses, each stamped with its course key so the cohort can draw each
  // student's questions from the courses they study. A course with nothing in the
  // database is skipped with a note (its class, and any student who studies only
  // it, are left out); if no course is usable at all, the seed stops.
  const pool = [];
  for (const [courseKey, file] of Object.entries(COURSE_FILES)) {
    const raw = await readFile(join(COURSE_DATA_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    const course = Array.isArray(parsed) ? parsed[0] : parsed;
    pool.push(...promptPoolFromCourse(course, courseKey));
  }
  if (!pool.length) die('No questions found in the course files.');

  const promptIds = await loadPromptIdMap();
  const seeded = pool.filter((p) => promptIds.has(p.id));
  if (!seeded.length) {
    die(
      `None of the ${pool.length} questions in the course files exist in the ` +
        'database. Run `node supabase/seed.mjs` first.'
    );
  }
  for (const courseKey of Object.keys(COURSE_FILES)) {
    const total = pool.filter((p) => p.course === courseKey).length;
    const inDb = seeded.filter((p) => p.course === courseKey).length;
    if (inDb === 0) {
      console.log(`  note: no ${courseKey} question is in the database; that course is skipped`);
    } else if (inDb < total) {
      console.log(`  note: ${total - inDb} ${courseKey} question(s) not in the database; skipped`);
    }
  }
  const usableCourses = new Set(seeded.map((p) => p.course));
  console.log(`✓ curriculum: ${seeded.length} question(s) across ${usableCourses.size} course(s)`);

  // --- school + accounts ----------------------------------------------------
  const schoolId = await upsertSchool(DEMO_SCHOOL_NAME);
  console.log(`✓ school: ${DEMO_SCHOOL_NAME}`);

  const userIds = new Map();
  for (const account of [...STAFF_ACCOUNTS, ...PLAN_STATE_STUDENTS]) {
    userIds.set(account.username, await upsertAccount({ ...account, schoolId }));
  }
  for (const student of DEMO_STUDENTS) {
    userIds.set(
      student.username,
      await upsertAccount({
        username: student.username,
        displayName: student.displayName,
        role: 'student',
        stripePlan: 'free',
        schoolId,
        aiQuota: 20,
      })
    );
  }
  console.log(`✓ accounts: ${userIds.size} (password from DEMO_ACCOUNT_PASSWORD)`);

  // --- classes + enrolment --------------------------------------------------
  // Since schema §19 the analytics RPCs are scoped to the classes a teacher
  // teaches, and a teacher with no class sees nothing. So the demo has to enrol
  // its cohort or the whole point of seeding it is invisible. Each class has its
  // own owner: Ms Bennett's Enterprise class (with Mr Okafor as co-teacher) and
  // Mr Okafor's Software class, which Ms Bennett does not teach.
  const enrolled = [...DEMO_STUDENTS, ...PLAN_STATE_STUDENTS];
  // Retired names go before anything is written, so an old class cannot linger
  // beside its replacement with its enrolments still attached.
  const { error: retiredErr } = await db
    .from('classes')
    .delete()
    .eq('school_id', schoolId)
    .in('name', RETIRED_CLASS_NAMES);
  if (retiredErr && !isMissingTable(retiredErr)) {
    throw new Error(`retired class removal failed: ${retiredErr.message}`);
  }
  const classIds = new Map();
  let classesTableMissing = false;
  for (const spec of DEMO_CLASSES) {
    if (!usableCourses.has(spec.course)) {
      console.log(`  note: ${spec.name} skipped — ${spec.course} has no questions in the database`);
      continue;
    }
    const classId = await upsertClass({
      schoolId,
      name: spec.name,
      year: spec.year,
      ownerId: userIds.get(spec.ownerUsername),
    });
    if (!classId) {
      classesTableMissing = true;
      break;
    }
    classIds.set(spec.key, classId);
  }

  const enrolmentSize = new Map();
  if (classesTableMissing) {
    console.log(
      '  note: no `classes` table (database predates schema §19); skipped enrolment.\n' +
        '        Class Insights will be empty for the demo teacher until §19 is applied.'
    );
  } else {
    for (const spec of DEMO_CLASSES) {
      const classId = classIds.get(spec.key);
      if (!classId) continue;
      const members = [
        ...enrolled
          .filter((s) => s.classKeys?.includes(spec.key))
          .map((s) => ({ user_id: userIds.get(s.username), role: 'student' })),
        ...(spec.coTeacherUsername
          ? [{ user_id: userIds.get(spec.coTeacherUsername), role: 'co_teacher' }]
          : []),
      ]
        .filter((m) => m.user_id)
        .map((m) => ({ ...m, class_id: classId }));

      await insertChunked('class_members', members, { onConflict: 'class_id,user_id' });
      const students = members.filter((m) => m.role === 'student').length;
      enrolmentSize.set(spec.key, students);
      console.log(`✓ class: ${spec.name} — ${students} student(s), owner ${spec.ownerUsername}`);
    }
  }

  // --- cohort history -------------------------------------------------------
  // The cohort and the two plan-state accounts with work behind them. A student
  // who studies only an unusable course is left out of the history.
  const usable = (s) => !s.courses || s.courses.some((c) => usableCourses.has(c));
  const historySpecs = [...DEMO_STUDENTS, ...DEMO_PLAN_STUDENT_HISTORY].filter(usable);
  const cohort = generateCohort({ prompts: seeded, students: historySpecs });

  // A plain re-run must leave exactly this run's history, not this run stacked on
  // the last one, so `demo:seed` is genuinely idempotent, not just `demo:reseed`.
  // `response_events` is append-only by design — no unique key to upsert on — so it
  // is cleared and rewritten. `responses` and the usage tables are upserts, which
  // would keep rows the new roster no longer produces (a student who now writes less
  // keeps the old answers), so they are cleared too. Scoped to demo user ids, so it
  // can never touch anyone else's history.
  const historyIds = historySpecs.map((s) => userIds.get(s.username)).filter(Boolean);
  if (historyIds.length) {
    for (const table of ['response_events', 'responses', 'ai_usage', 'ai_model_usage']) {
      const { error } = await db.from(table).delete().in('user_id', historyIds);
      if (error) throw new Error(`clearing previous demo ${table} failed: ${error.message}`);
    }
  }

  // responses: the LATEST attempt per (student, prompt) — the table's documented
  // semantics, and what its unique index enforces.
  const responseRows = latestPerPrompt(cohort.attempts).map((a) => ({
    prompt_id: promptIds.get(a.promptId),
    user_id: userIds.get(a.username),
    draft: a.draft,
    word_count: a.wordCount,
    overall_mark: a.mark,
    overall_band: a.band,
    evaluation: a.evaluation,
    created_at: isoDaysAgo(a.daysAgo),
    updated_at: isoDaysAgo(a.daysAgo),
  }));
  await insertChunked('responses', responseRows, { onConflict: 'user_id,prompt_id' });

  // response_events: every attempt, append-only — this is what the band trend
  // sparkline reads, so it must carry the repeats that `responses` collapses.
  const eventRows = cohort.attempts.map((a) => ({
    prompt_id: promptIds.get(a.promptId),
    user_id: userIds.get(a.username),
    mark: a.mark,
    band: a.band,
    word_count: a.wordCount,
    created_at: isoDaysAgo(a.daysAgo),
  }));
  await insertChunked('response_events', eventRows);

  console.log(
    `✓ history: ${responseRows.length} response(s), ${eventRows.length} event(s) over 10 weeks, ` +
      `across ${historySpecs.length} student(s)`
  );

  // --- profile stats --------------------------------------------------------
  for (const student of historySpecs) {
    const { error } = await db
      .from('profiles')
      .update({ stats: cohort.stats[student.username] })
      .eq('id', userIds.get(student.username));
    if (error) throw new Error(`stats(${student.username}) failed: ${error.message}`);
  }
  console.log('✓ stats: XP, levels, streaks and averages derived from the history');

  // --- usage telemetry ------------------------------------------------------
  // One ai_usage row per user per day, matching the attempts made that day, so
  // the Usage Dashboard's history is consistent with the work in `responses`.
  const usageRows = [];
  const modelRows = [];
  // Engine mix is illustrative: the dashboard prices each model from the engine
  // registry, so a single-model history would show a flat cost breakdown. The
  // strings come FROM that registry (demoUsageModels) rather than being typed
  // here, so a seeded row can never be one the dashboard cannot price.
  const MODELS = demoUsageModels();
  for (const [username, byDay] of Object.entries(cohort.dailyCalls)) {
    const userId = userIds.get(username);
    for (const [daysAgo, calls] of Object.entries(byDay)) {
      usageRows.push({ user_id: userId, day: dayDaysAgo(Number(daysAgo)), calls });
      const model = MODELS[(Number(daysAgo) + calls) % MODELS.length];
      modelRows.push({ user_id: userId, day: dayDaysAgo(Number(daysAgo)), model, calls });
    }
  }
  await insertChunked('ai_usage', usageRows, { onConflict: 'user_id,day' });
  await insertChunked('ai_model_usage', modelRows, { onConflict: 'user_id,day,model' });
  console.log(`✓ usage: ${usageRows.length} daily row(s) across ${MODELS.length} engine(s)`);

  // --- exhausted quota ------------------------------------------------------
  const capped = PLAN_STATE_STUDENTS.find((s) => s.exhaustQuota);
  if (capped) {
    const { error } = await db
      .from('ai_usage')
      .upsert(
        { user_id: userIds.get(capped.username), day: dayDaysAgo(0), calls: capped.aiQuota },
        { onConflict: 'user_id,day' }
      );
    if (error) throw new Error(`quota exhaustion failed: ${error.message}`);
    console.log(
      `✓ quota: ${capped.username} is at its daily cap (${capped.aiQuota}/${capped.aiQuota})`
    );
  }

  // --- subscriptions --------------------------------------------------------
  // Fabricated rows rather than real Stripe test-mode subscriptions: they make
  // every paywall and unlocked state reachable without a Stripe dependency.
  // Consequence to be aware of when demoing: the customer-portal button has no
  // real Stripe customer behind it and will fail for these accounts.
  const subscriptionRows = [
    {
      id: 'sub_demo_plus',
      user_id: userIds.get('demo.plus'),
      stripe_customer_id: 'cus_demo_plus',
      status: 'active',
      price_id: 'price_demo_plus',
      plan: 'plus',
      seats: 1,
    },
    {
      id: 'sub_demo_school',
      user_id: userIds.get('demo.teacher'),
      stripe_customer_id: 'cus_demo_school',
      status: 'active',
      price_id: 'price_demo_school',
      plan: 'school',
      seats: 30,
    },
  ].map((row) => ({
    ...row,
    current_period_start: isoDaysAgo(20),
    current_period_end: isoDaysAgo(-10),
  }));
  await insertChunked('subscriptions', subscriptionRows, { onConflict: 'id' });
  console.log('✓ subscriptions: one Plus, one School (30 seats)');

  // --- review queue ---------------------------------------------------------
  const { data: dotPoint } = await db.from('dot_points').select('id').limit(1).maybeSingle();
  if (dotPoint) {
    const n = await seedContributions(dotPoint.id, userIds.get('demo.coteacher'));
    console.log(`✓ review queue: ${n} pending contribution(s), quality scores 34–91`);
  } else {
    console.log('  note: no dot points found; skipped review-queue contributions');
  }

  // --- summary --------------------------------------------------------------
  const classKeysOf = (username) => enrolled.find((s) => s.username === username)?.classKeys ?? [];

  console.log('\nDemo accounts (password from DEMO_ACCOUNT_PASSWORD):');
  for (const a of [...STAFF_ACCOUNTS, ...PLAN_STATE_STUDENTS]) {
    console.log(`  ${emailFor(a.username).padEnd(30)} ${a.role.padEnd(8)} — ${a.note}`);
  }
  console.log(
    `  ${'demo-<first name>@demo.invalid'.padEnd(30)} student  — the ${DEMO_STUDENTS.length} cohort students (listed below)`
  );

  console.log('\nClasses:');
  for (const spec of DEMO_CLASSES) {
    if (!classIds.has(spec.key)) continue;
    const co = spec.coTeacherUsername ? `, co-teacher ${spec.coTeacherUsername}` : '';
    console.log(
      `  ${spec.name} — owner ${spec.ownerUsername}${co}, ` +
        `${enrolmentSize.get(spec.key) ?? 0} enrolled`
    );
  }

  console.log('\nCohort:');
  for (const s of historySpecs) {
    const stats = cohort.stats[s.username];
    const courses = (s.courses ?? ['all']).join(' + ');
    const classes = classKeysOf(s.username).join(' + ') || 'none';
    console.log(
      `  ${emailFor(s.username).padEnd(30)} ${String(stats.questionsAnswered).padStart(3)} attempts, ` +
        `avg band ${stats.averageBand}, ${courses}; class ${classes} — ${ARCHETYPES[s.archetype].note}`
    );
  }
  console.log('\nDone. Re-run with --reset to refresh from scratch.');
}

main().catch((err) => {
  console.error('\nDemo seed failed:', err.message);
  process.exit(1);
});
