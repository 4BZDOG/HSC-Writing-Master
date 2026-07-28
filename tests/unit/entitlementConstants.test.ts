import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FREE_TIER_EVAL_LIMIT, SCHOOL_SEAT_LIMITS } from '../../services/entitlements';
import { SCHOOL_SEAT_LIMITS as SERVER_SEAT_LIMITS } from '../../api/_lib/entitlements';

/**
 * The paywall's numbers live in three places by necessity: the client (which
 * displays them), the API layer (plain Node — it can't import the client
 * module, which reads import.meta.env), and Postgres (which enforces them).
 * Nothing but this test stops them drifting apart, and drift here is the
 * quiet kind: the UI promises 5, the database allows 8, nobody notices.
 */

const schemaSql = readFileSync(resolve(__dirname, '../../supabase/schema.sql'), 'utf8');

describe('entitlement constants stay in sync', () => {
  it('the database defaults to the same free-tier limit the UI advertises', () => {
    // The live value is a plan_settings row an admin can change without a
    // deploy; the coalesce fallback is the shipped default, and THAT is what
    // has to match the number compiled into the client.
    const match =
      /create or replace function public\.free_evaluation_limit\(\)[\s\S]*?where key = 'free_evaluation_limit'\),\s*(\d+)/.exec(
        schemaSql
      );
    expect(match, 'free_evaluation_limit() default not found in schema.sql').not.toBeNull();
    expect(Number(match![1])).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('an admin can retune the limit without a migration', () => {
    // The whole point of the settings row: the paywall's headline number is
    // adjustable from the app. If the setter disappears, the limit is welded
    // shut again.
    expect(schemaSql).toMatch(/create or replace function public\.set_plan_setting/);
    expect(schemaSql).toMatch(/Only admins can change plan settings/);
  });

  it('the database resolves the caller plan the same way the client does', () => {
    // caller_plan() is what makes the paid-feature gates real; its precedence
    // must match getUserPlan() in services/entitlements.ts.
    const match = /create or replace function public\.caller_plan\(\)[\s\S]*?\$\$;/.exec(schemaSql);
    expect(match, 'caller_plan() not found in schema.sql').not.toBeNull();
    const body = match![0];
    // admin → school, explicit paid plan, live school licence, teacher perk.
    expect(body.indexOf("p.role = 'admin'")).toBeLessThan(body.indexOf('p.stripe_plan'));
    expect(body.indexOf('p.stripe_plan')).toBeLessThan(body.indexOf('s.plan_status'));
    expect(body.indexOf('s.plan_status')).toBeLessThan(body.indexOf("p.role = 'teacher'"));
    // The grace period must survive here too, or a past_due school is cut off
    // by the feature gate while the webhook still considers it paid.
    expect(body).toMatch(/past_due/);
  });

  it('the checkout endpoint clamps seats to the same bounds as the seat picker', () => {
    expect(SERVER_SEAT_LIMITS.min).toBe(SCHOOL_SEAT_LIMITS.min);
    expect(SERVER_SEAT_LIMITS.max).toBe(SCHOOL_SEAT_LIMITS.max);
  });
});
