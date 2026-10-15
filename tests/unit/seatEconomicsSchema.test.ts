import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pins the shape of `school_seat_usage()` in schema.sql (§30). The behaviour (the
 * admin gate, the window clamp, the zeros on an empty window, the licence filter,
 * the totals) was run against a WASM Postgres replay of the schema, twice, as CI
 * does. These checks catch the regressions that would only show up as a leak or a
 * silent change of meaning: a school argument appearing, a member's identity going
 * out, the admin gate or grants drifting, or the window clamp disappearing.
 */

const schemaSql = readFileSync(resolve(__dirname, '../../supabase/schema.sql'), 'utf8');

const definition = (): string => {
  const start = schemaSql.indexOf('create or replace function public.school_seat_usage(');
  expect(start, 'school_seat_usage() must be defined in schema.sql').toBeGreaterThan(-1);
  const end = schemaSql.indexOf('$$;', start);
  return schemaSql.slice(start, end + 3);
};

describe('school_seat_usage() stays an admin-only, read-only report', () => {
  it('is a new §30 section, appended after the purchase-order section', () => {
    const section = schemaSql.indexOf('§30 · School seat economics');
    const previous = schemaSql.indexOf('§27 · Invoiced school licences');
    expect(section, '§30 heading must exist').toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(previous);
  });

  it('takes only the window, so a caller cannot name a school or a person', () => {
    expect(definition()).toMatch(
      /^create or replace function public\.school_seat_usage\(p_days integer default 30\)/m
    );
    expect(definition()).not.toMatch(/p_school|p_user|p_username/);
  });

  it('runs as its owner with a pinned search path, like the other reports', () => {
    expect(definition()).toMatch(
      /returns jsonb language plpgsql stable security definer set search_path = public as \$\$/
    );
  });

  it('refuses everyone who is not an admin, with the message the panel relies on', () => {
    const body = definition();
    expect(body).toMatch(
      /if not public\.is_admin\(\) then\s+raise exception 'Only admins can read seat usage';/
    );
    // Teachers are reviewers, not admins, so is_reviewer() must not be the gate.
    expect(body).not.toMatch(/is_reviewer\(\)/);
  });

  it('clamps the window to 1..90 days and defaults a null to 30', () => {
    expect(definition()).toMatch(
      /v_days\s+integer := least\(greatest\(coalesce\(p_days, 30\), 1\), 90\);/
    );
  });

  it('reports only live licences: active, trialing and past_due', () => {
    expect(definition()).toMatch(/s\.plan_status in \('active', 'trialing', 'past_due'\)/);
  });

  it('counts only calls above zero for the active users, the percentile and the maximum', () => {
    const body = definition();
    expect(body).toMatch(/where u\.calls > 0/);
    expect(body).toMatch(/percentile_cont\(0\.95\) within group \(order by m\.calls\)/);
  });

  it('uses the same day window as the usage report, so the two agree', () => {
    expect(definition()).toMatch(/u\.day > \(now\(\) at time zone 'utc'\)::date - v_days/);
  });

  it('says in a comment that membership is today’s, not the membership at the time', () => {
    const section = schemaSql.slice(schemaSql.indexOf('§30 · School seat economics'));
    expect(section).toMatch(/MEMBERSHIP IS TODAY'S/);
  });

  it('returns the school measures and the totals, with no member identity', () => {
    const body = definition();
    const expectedKeys = [
      'days',
      'schools',
      'totals',
      'id',
      'name',
      'seats',
      'members',
      'active_users',
      'total_calls',
      'calls_per_seat_per_day',
      'avg_calls_per_active_user_day',
      'p95_calls_per_user_day',
      'max_calls_per_user_day',
      'user_days_over_100',
      'seats_unused',
    ];
    for (const key of expectedKeys) {
      expect(body, `key ${key}`).toContain(`'${key}'`);
    }
    expect(body).not.toMatch(/username|display_name|email|'user_id'|jsonb_agg\(\s*to_jsonb/);
  });

  it('divides by at least one seat, so a zero-seat school cannot raise a division error', () => {
    expect(definition()).toMatch(/greatest\(ps\.seats, 1\)/);
    expect(definition()).toMatch(/greatest\(c\.seats, 1\)/);
  });

  it('is closed to anonymous callers and open only to signed-in ones', () => {
    expect(schemaSql).toMatch(
      /revoke all on function public\.school_seat_usage\(integer\) from public, anon;/
    );
    expect(schemaSql).toMatch(
      /grant execute on function public\.school_seat_usage\(integer\) to authenticated;/
    );
  });

  it('is idempotent: a re-apply replaces the function and changes no data', () => {
    expect(definition()).toMatch(/^create or replace function/m);
    expect(definition()).not.toMatch(/\b(insert|update|delete)\b/i);
  });
});
