import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pins the shape of `my_school_seats()` in schema.sql. The behaviour itself
 * (staff of the school allowed, students and anonymous callers refused, another
 * school's numbers never shown) is asserted in supabase/tests/entitlement_tests.sql,
 * which runs in CI's RLS job. These checks catch the regressions that would
 * only show up as a leak: a school argument creeping in, a member id going out,
 * or the grants drifting back to open.
 */

const schemaSql = readFileSync(resolve(__dirname, '../../supabase/schema.sql'), 'utf8');

const definition = (): string => {
  const start = schemaSql.indexOf('create or replace function public.my_school_seats()');
  expect(start, 'my_school_seats() must be defined in schema.sql').toBeGreaterThan(-1);
  const end = schemaSql.indexOf('$$;', start);
  return schemaSql.slice(start, end + 3);
};

describe('my_school_seats() stays a staff-only, own-school-only read', () => {
  it('takes no school argument, so a caller cannot name another school', () => {
    expect(schemaSql).toMatch(/create or replace function public\.my_school_seats\(\)/);
    expect(definition()).not.toMatch(/p_school|school_id uuid,|\(\s*p_/);
  });

  it('runs as its owner with a pinned search path, like the other definer functions', () => {
    expect(definition()).toMatch(/security definer set search_path = public/);
  });

  it("answers only admins and teachers, and only for the caller's own school", () => {
    const body = definition();
    expect(body).toMatch(/v_role not in \('admin', 'teacher'\)/);
    expect(body).toMatch(/v_user\s+uuid := auth\.uid\(\)/);
    expect(body).toMatch(/where p\.id = v_user/);
  });

  it('returns the seat picture and never the people in it', () => {
    const body = definition();
    // The keys of the one jsonb object the function builds, and nothing else.
    const built = body.slice(body.indexOf('jsonb_build_object('), body.indexOf('into v_result'));
    const keys = [...built.matchAll(/'(\w+)',/g)].map((m) => m[1]);
    expect(keys).toEqual(['plan_status', 'plan_seats', 'members', 'purchaser']);
    expect(body).not.toMatch(/username|display_name|jsonb_agg/);
  });

  it('is closed to anonymous callers and open only to signed-in ones', () => {
    expect(schemaSql).toMatch(
      /revoke all on function public\.my_school_seats\(\) from public, anon;/
    );
    expect(schemaSql).toMatch(
      /grant execute on function public\.my_school_seats\(\) to authenticated;/
    );
  });
});
