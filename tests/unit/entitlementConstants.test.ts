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
  it('the database enforces the same free-tier limit the UI advertises', () => {
    const match = /create or replace function public\.free_evaluation_limit\(\)[\s\S]*?select (\d+)/.exec(
      schemaSql
    );
    expect(match, 'free_evaluation_limit() not found in schema.sql').not.toBeNull();
    expect(Number(match![1])).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('the checkout endpoint clamps seats to the same bounds as the seat picker', () => {
    expect(SERVER_SEAT_LIMITS.min).toBe(SCHOOL_SEAT_LIMITS.min);
    expect(SERVER_SEAT_LIMITS.max).toBe(SCHOOL_SEAT_LIMITS.max);
  });
});
