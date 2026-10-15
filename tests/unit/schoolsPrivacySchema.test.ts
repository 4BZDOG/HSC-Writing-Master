import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Pins the privacy boundary on `schools` (schema §12, §13, §28). The behaviour
 * itself (a student reads only their own school and only its granted columns,
 * nobody selects stripe_subscription_id, plan_seats or daily_ai_limit,
 * list_schools() is admin-only) is asserted in
 * supabase/tests/schools_privacy_tests.sql, which runs in CI's RLS job. These
 * checks catch the regressions that would only show up as a leak or a silent
 * loss: a broad policy coming back, a withheld column joining the grant, a
 * client embed reading a column the grant does not allow (which fails soft and
 * drops a member's plan), the CI replica re-opening the table, or a
 * teacher-facing caller of list_schools() appearing.
 */

const root = resolve(__dirname, '../..');
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
const grantsSql = readFileSync(resolve(root, 'supabase/tests/ci/02_grants.sql'), 'utf8');
const workflow = readFileSync(resolve(root, '.github/workflows/build.yml'), 'utf8');

/**
 * Columns a signed-in member may read through the REST API. id and name are what
 * the UI names; the three plan_* columns are a member's own licence state, read
 * on sign-in by applySchoolPlan() (services/authService.ts).
 */
const SAFE_COLUMNS = ['id', 'name', 'plan_status', 'plan_period_end', 'plan_cancel_at_period_end'];
/** Withheld from every client role: the Stripe handle, the billed seats, the pool budget. */
const WITHHELD_COLUMNS = ['stripe_subscription_id', 'plan_seats', 'daily_ai_limit'];

/** The last `create policy <name> on public.<table>` statement: the one in force. */
const effectivePolicy = (name: string, table: string): string => {
  const head = `create policy ${name} on public.${table}`;
  const start = schemaSql.lastIndexOf(head);
  expect(start, `${name} must be defined in schema.sql`).toBeGreaterThan(-1);
  return schemaSql.slice(start, schemaSql.indexOf(';\n', start) + 1);
};

/** Every `.ts`/`.tsx` source file under a directory, excluding tests. */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });

describe('schools reads are narrowed to the own school of the caller (§12, §28)', () => {
  it('the policy in force admits admins and the own school of the caller, and nothing else', () => {
    const policy = effectivePolicy('schools_read', 'schools');
    expect(policy).toMatch(/for select using \(\s*public\.is_admin\(\)/);
    expect(policy).toMatch(
      /id = \(select p\.school_id from public\.profiles p where p\.id = auth\.uid\(\)\)/
    );
    expect(policy).not.toMatch(/is_reviewer/);
  });

  it('no policy on schools is open to every signed-in user', () => {
    const policies = [...schemaSql.matchAll(/create policy \w+ on public\.schools[\s\S]*?;\n/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [statement] of policies) {
      expect(statement).not.toMatch(/auth\.uid\(\) is not null/);
    }
  });

  it('the REST grant is column-level: the table grant is withdrawn, and only safe columns are granted back', () => {
    expect(schemaSql).toMatch(/revoke all on public\.schools from anon, authenticated;/);
    expect(schemaSql).not.toMatch(/grant\s+select\s+on\s+public\.schools\b/);
    expect(schemaSql).not.toMatch(/grant\s+(all|insert|update|delete)[^;]*\bon public\.schools\b/);

    const granted = [
      ...schemaSql.matchAll(/grant select \(([^)]*)\)\s+on public\.schools/g),
    ].flatMap(([, columns]) => columns.split(',').map((c) => c.trim()));
    expect(granted).toEqual(expect.arrayContaining(['id', 'name', 'plan_status']));
    for (const column of granted) {
      expect(SAFE_COLUMNS, `${column} is granted but is not a safe column`).toContain(column);
    }
    for (const column of WITHHELD_COLUMNS) {
      expect(granted).not.toContain(column);
    }
  });

  it('the plan_* grant comes after the columns exist (§13), or a fresh apply fails at §12', () => {
    // §12 runs before §13 adds these columns, so the grant naming them must follow
    // the add. Granting them in §12 fails on a fresh database.
    const added = schemaSql.indexOf('add column if not exists plan_cancel_at_period_end');
    const granted = schemaSql.indexOf(
      'grant select (plan_status, plan_period_end, plan_cancel_at_period_end)'
    );
    expect(added, 'the licence columns must be added in §13').toBeGreaterThan(-1);
    expect(granted, 'the plan_* columns must be granted to authenticated').toBeGreaterThan(added);
  });

  it('admins read schools through the policy, and the licence ids reach them only via list_schools()', () => {
    // A column grant applies to admins too, so stripe_subscription_id, plan_seats
    // and daily_ai_limit are withheld from admins' REST reads as well; the admin
    // dashboard gets them from the RPC.
    expect(effectivePolicy('schools_read', 'schools')).toMatch(/public\.is_admin\(\)/);
    expect(schemaSql).toMatch(/§28 · list_schools\(\) is for admins only/);
  });

  it('pool usage is read by the members of that school and by admins, never by any other teacher', () => {
    const policy = effectivePolicy('school_ai_usage_read', 'school_ai_usage');
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).toMatch(
      /school_id = \(select school_id from public\.profiles where id = auth\.uid\(\)\)/
    );
    expect(policy).not.toMatch(/is_reviewer/);
  });
});

describe('list_schools() is admin-only', () => {
  const start = schemaSql.lastIndexOf('create or replace function public.list_schools()');
  const body = schemaSql.slice(start, schemaSql.indexOf('$$;', start) + 3);

  it('the definition in force is the §28 one, after the §13 licence definition', () => {
    expect(start, 'list_schools() must be defined in schema.sql').toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(schemaSql.indexOf('§13 · Stripe billing integration'));
  });

  it('gates on is_admin() with the admin-only message, and never on is_reviewer()', () => {
    expect(body).toMatch(
      /if not public\.is_admin\(\) then\s+raise exception 'Only admins can list schools';/
    );
    expect(body).not.toMatch(/is_reviewer/);
  });

  it('still carries the licence and the member count, for the admin dashboard', () => {
    expect(body).toMatch(/'plan_status', s\.plan_status/);
    expect(body).toMatch(/'plan_seats', s\.plan_seats/);
    expect(body).toMatch(/'plan_cancel_at_period_end', s\.plan_cancel_at_period_end/);
    expect(body).toMatch(/'members'/);
  });

  it('is closed to anonymous callers and open only to signed-in ones', () => {
    expect(schemaSql).toMatch(/revoke all on function public\.list_schools\(\) from public, anon;/);
    expect(schemaSql).toMatch(
      /grant execute on function public\.list_schools\(\) to authenticated;/
    );
  });

  it('is called from admin screens only, and every caller is listed here', () => {
    // A teacher-facing caller must be a deliberate, reviewed addition to this list.
    const clientDirs = ['components', 'services', 'hooks', 'utils'].map((d) => resolve(root, d));
    const files = [...clientDirs.flatMap(sourceFiles), resolve(root, 'App.tsx')];
    const callers = files
      .filter((f) => /list_schools|fetchSchools/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual([
      'components/admin/UsageDashboard.tsx',
      'services/billingOverviewService.ts',
      'services/quotaService.ts',
    ]);
  });
});

describe('client code reads schools only through granted columns', () => {
  const clientDirs = ['components', 'services', 'hooks', 'utils'].map((d) => resolve(root, d));
  const clientSource = [...clientDirs.flatMap(sourceFiles), resolve(root, 'App.tsx')].map((f) => ({
    path: relative(root, f).replace(/\\/g, '/'),
    text: readFileSync(f, 'utf8'),
  }));

  it('no client file reads the schools table directly through the REST client', () => {
    const direct = clientSource.filter((f) => /from\(['"`]schools['"`]\)/.test(f.text));
    expect(direct.map((f) => f.path)).toEqual([]);
  });

  // PostgREST reaches the schools table through an embedded select, and the forms
  // in use are: `schools(...)`, `schools!hint(...)`, the foreign key as the table
  // name, `school_id (...)`, and an alias on it, `school:school_id (...)`. Each
  // one reads schools, so each column list is checked against the grant.
  const EMBED = /(?<![\w.])(?:school:school_id|school_id|schools)(?:!\w+)?\s*\(([^)]*)\)/g;
  const embeds = clientSource.flatMap((f) =>
    [...f.text.matchAll(EMBED)].map(([match, columns]) => ({
      path: f.path,
      match: match.replace(/\s+/g, ' '),
      columns: columns.split(',').map((c) => c.trim()),
    }))
  );

  it('every embedded select of schools in client code names only granted columns', () => {
    for (const { path, match, columns } of embeds) {
      for (const column of columns) {
        expect(SAFE_COLUMNS, `${path} embeds \`${match}\` and reads "${column}"`).toContain(column);
      }
    }
  });

  it('the detector sees the sign-in embed in authService, so the check above covers it', () => {
    // Positive control: if this stops matching, the check above is checking nothing.
    const signIn = embeds.find((e) => e.path === 'services/authService.ts');
    expect(signIn, 'the sign-in embed in services/authService.ts must be detected').toBeDefined();
    expect(signIn!.columns).toEqual(
      expect.arrayContaining([
        'name',
        'plan_status',
        'plan_period_end',
        'plan_cancel_at_period_end',
      ])
    );
  });
});

describe('the CI replica and workflow exercise the same boundary', () => {
  it('the CI grants do not re-open every table, schools included, after schema.sql', () => {
    expect(grantsSql).not.toMatch(/on all tables in schema public/);
    expect(grantsSql).toMatch(/tablename <> 'schools'/);
  });

  it('the RLS job runs the schools privacy suite', () => {
    expect(workflow).toMatch(
      /psql -v ON_ERROR_STOP=1 -f supabase\/tests\/schools_privacy_tests\.sql/
    );
  });
});
