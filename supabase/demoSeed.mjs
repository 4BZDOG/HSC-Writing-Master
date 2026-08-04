// =============================================================================
// HSC AI Evaluator — demo cohort seed
// =============================================================================
// Creates the demo accounts and the accumulated history behind them, so every
// feature that depends on ongoing use has something to show: Class Insights,
// Student Progress and its band-trend sparkline, the student roster, the Usage
// Dashboard, the Review Queue, quota states, XP/levels/streaks.
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
 * The five staff/plan-state accounts. The twelve students come from
 * DEMO_STUDENTS in utils/demoCohort.ts.
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
    note: 'Class Insights, Student Progress, Review Queue, authoring tools',
  },
  {
    username: 'demo.coteacher',
    displayName: 'Mr Okafor (Demo)',
    role: 'teacher',
    aiQuota: 40,
    stripePlan: 'school',
    note: 'second marker — shows the reviewer role is not a single account',
  },
];

/**
 * Plan-state students. These sit alongside the twelve cohort students and exist
 * to make the paywall and quota states reachable without waiting for a real
 * user to hit them.
 */
const PLAN_STATE_STUDENTS = [
  {
    username: 'demo.free',
    displayName: 'Sam (Demo, Free)',
    role: 'student',
    aiQuota: 10,
    stripePlan: 'free',
    note: 'free tier — locked tier 4-6 questions, blurred high-band samples, summary-only feedback',
  },
  {
    username: 'demo.plus',
    displayName: 'Ava (Demo, Plus)',
    role: 'student',
    aiQuota: 30,
    stripePlan: 'plus',
    note: 'Band 6 Plus — the unlocked comparison for the free tier',
  },
  {
    username: 'demo.capped',
    displayName: 'Ben (Demo, Capped)',
    role: 'student',
    aiQuota: 5,
    stripePlan: 'free',
    exhaustQuota: true,
    note: 'at the daily cap — makes the 429 path and quota warnings demonstrable',
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
    if (error) throw new Error(`createUser(${username}) failed: ${error.message}`);
    userId = data.user.id;
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
 * The demo class, owned by the demo teacher.
 *
 * Written directly rather than through `create_class()`: that RPC is admin-only
 * and resolves `auth.uid()`, which a service-role script has no session for.
 * Returns null when the table does not exist yet, so the seed still completes
 * against a database that predates schema §19 instead of aborting.
 */
const upsertClass = async ({ schoolId, name, ownerId }) => {
  if (!ownerId) throw new Error('upsertClass: the demo teacher has no id');

  const { data: existing, error: selErr } = await db
    .from('classes')
    .select('id')
    .eq('school_id', schoolId)
    .eq('name', name)
    .maybeSingle();

  if (selErr) {
    // 42P01 = undefined_table. Anything else is a real failure worth raising.
    if (selErr.code === '42P01' || /does not exist/i.test(selErr.message)) return null;
    throw new Error(`class lookup failed: ${selErr.message}`);
  }

  const row = { school_id: schoolId, name, owner_id: ownerId, year: 12 };
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
const resetDemoData = async (usernames) => {
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
  // Contributions authored by demo accounts (sample answers cascade).
  await db.from('prompts').delete().in('created_by', ids).neq('status', 'approved');

  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    // A missing auth user with a lingering profile is not fatal — drop the
    // profile and carry on rather than aborting a reset half-done.
    if (error) await db.from('profiles').delete().eq('id', id);
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
    DEMO_CLASS_NAME,
    DEMO_STUDENTS,
    ARCHETYPES,
    generateCohort,
    promptPoolFromCourse,
    latestPerPrompt,
    demoUsageModels,
  } = await loadCohortModule();

  const allUsernames = [
    ...STAFF_ACCOUNTS.map((a) => a.username),
    ...PLAN_STATE_STUDENTS.map((a) => a.username),
    ...DEMO_STUDENTS.map((s) => s.username),
  ];

  if (RESET) {
    const removed = await resetDemoData(allUsernames);
    console.log(`✓ reset: removed ${removed} existing demo account(s) and their data`);
  }

  // --- curriculum -----------------------------------------------------------
  const raw = await readFile(join(COURSE_DATA_DIR, 'HSCEnterpriseComputing09122025.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const course = Array.isArray(parsed) ? parsed[0] : parsed;
  const pool = promptPoolFromCourse(course);
  if (!pool.length) die('No questions found in the course file.');

  const promptIds = await loadPromptIdMap();
  const seeded = pool.filter((p) => promptIds.has(p.id));
  if (!seeded.length) {
    die(
      `None of the ${pool.length} questions in the course file exist in the ` +
        'database. Run `node supabase/seed.mjs` first.'
    );
  }
  if (seeded.length < pool.length) {
    console.log(`  note: ${pool.length - seeded.length} question(s) not in the database; skipped`);
  }
  console.log(`✓ curriculum: ${seeded.length} question(s) available to the cohort`);

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

  // --- class + enrolment ----------------------------------------------------
  // Since schema §19 the analytics RPCs are scoped to the classes a teacher
  // teaches, and a teacher with no class sees nothing. So the demo has to enrol
  // its cohort or the whole point of seeding it is invisible.
  const classId = await upsertClass({
    schoolId,
    name: DEMO_CLASS_NAME,
    ownerId: userIds.get('demo.teacher'),
  });
  if (classId) {
    const members = [
      ...DEMO_STUDENTS.map((s) => ({ user_id: userIds.get(s.username), role: 'student' })),
      // The plan-state students sit in the class too, so a paywall demo has the
      // same cohort context as everyone else.
      ...PLAN_STATE_STUDENTS.map((s) => ({ user_id: userIds.get(s.username), role: 'student' })),
      { user_id: userIds.get('demo.coteacher'), role: 'co_teacher' },
    ]
      .filter((m) => m.user_id)
      .map((m) => ({ ...m, class_id: classId }));

    await insertChunked('class_members', members, { onConflict: 'class_id,user_id' });
    console.log(`✓ class: ${DEMO_CLASS_NAME} — ${members.length} member(s) enrolled`);
  } else {
    console.log(
      '  note: no `classes` table (database predates schema §19); skipped enrolment.\n' +
        '        Class Insights will be empty for the demo teacher until §19 is applied.'
    );
  }

  // --- cohort history -------------------------------------------------------
  const cohort = generateCohort({ prompts: seeded });

  // `response_events` is append-only by design — no unique key to upsert on — so
  // a plain re-run would stack a second copy of the whole history on top of the
  // first and double every band trend. Clear the demo cohort's own events first
  // so `demo:seed` is genuinely idempotent, not just `demo:reseed`. Scoped to
  // demo user ids, so it can never touch anyone else's history.
  const cohortIds = DEMO_STUDENTS.map((s) => userIds.get(s.username)).filter(Boolean);
  if (cohortIds.length) {
    const { error } = await db.from('response_events').delete().in('user_id', cohortIds);
    if (error) throw new Error(`clearing previous demo events failed: ${error.message}`);
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
    `✓ history: ${responseRows.length} response(s), ${eventRows.length} event(s) over 10 weeks`
  );

  // --- profile stats --------------------------------------------------------
  for (const student of DEMO_STUDENTS) {
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
  console.log('\nDemo accounts (password from DEMO_ACCOUNT_PASSWORD):');
  for (const a of [...STAFF_ACCOUNTS, ...PLAN_STATE_STUDENTS]) {
    console.log(`  ${emailFor(a.username).padEnd(30)} ${a.role.padEnd(8)} — ${a.note}`);
  }
  console.log('\nCohort:');
  for (const s of DEMO_STUDENTS) {
    const stats = cohort.stats[s.username];
    console.log(
      `  ${emailFor(s.username).padEnd(30)} ${String(stats.questionsAnswered).padStart(3)} attempts, ` +
        `avg band ${stats.averageBand} — ${ARCHETYPES[s.archetype].note}`
    );
  }
  console.log('\nDone. Re-run with --reset to refresh from scratch.');
}

main().catch((err) => {
  console.error('\nDemo seed failed:', err.message);
  process.exit(1);
});
