/**
 * Client access to the AI usage quota system (supabase/schema.sql §11).
 *
 * Enforcement lives SERVER-SIDE: the AI proxy spends one unit of the caller's
 * daily budget per call and returns 429 when it's gone. This module only
 * reads state for display and lets admins manage the limits through the
 * admin-gated RPCs — it is a convenience layer, not the control point.
 */
import { supabase } from './supabaseClient';

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  /**
   * The caller's school pool (schema §12): null when the user is in no
   * school; `limit` null when the school has no pooled cap (grouping only).
   * Absent entirely on databases that pre-date the schools migration.
   */
  school?: { name: string; used: number; limit: number | null } | null;
}

export type QuotaRole = 'admin' | 'teacher' | 'student';

export interface RoleQuota {
  role: QuotaRole;
  daily_limit: number;
}

const ROLE_ORDER: QuotaRole[] = ['admin', 'teacher', 'student'];

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

/** The signed-in user's own usage today (does not consume). */
export const fetchMyQuotaStatus = async (): Promise<QuotaStatus> => {
  const { data, error } = await requireClient().rpc('get_ai_quota_status');
  if (error) throw new Error(`Could not load AI quota status: ${error.message}`);
  return data as QuotaStatus;
};

/** The per-role (group) daily limits, in a stable admin→student order. */
export const fetchRoleQuotas = async (): Promise<RoleQuota[]> => {
  const { data, error } = await requireClient().from('ai_quota_limits').select('role, daily_limit');
  if (error) throw new Error(`Could not load quota limits: ${error.message}`);
  const rows = (data ?? []) as RoleQuota[];
  return [...rows].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
};

/** Admin-only: set the daily limit for a whole role/group. */
export const setRoleQuota = async (role: QuotaRole, limit: number): Promise<void> => {
  const { error } = await requireClient().rpc('set_role_ai_quota', {
    p_role: role,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not update the ${role} quota: ${error.message}`);
};

/**
 * Admin-only: set (or clear, with null) a per-user override that beats the
 * role default. Addressed by username so admins don't need to hunt UUIDs.
 */
export const setUserQuotaOverride = async (
  username: string,
  limit: number | null
): Promise<void> => {
  const { error } = await requireClient().rpc('set_user_ai_quota', {
    p_username: username,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not update ${username}'s quota: ${error.message}`);
};

/** One row per user per UTC day, with the user's effective limit. */
export interface UsageReportRow {
  username: string;
  role: QuotaRole;
  /** ISO date, UTC (matches the server-side counter day). */
  day: string;
  calls: number;
  limit: number;
  /** The per-user override if one is set (already folded into `limit`). */
  override: number | null;
}

/** Reviewer-gated usage report over the last `days` UTC days (1–31). */
export const fetchUsageReport = async (days = 7): Promise<UsageReportRow[]> => {
  const { data, error } = await requireClient().rpc('get_ai_usage_report', { p_days: days });
  if (error) throw new Error(`Could not load the usage report: ${error.message}`);
  return (data ?? []) as UsageReportRow[];
};

// --- Schools (shared quota pools, schema §12) --------------------------------

export interface SchoolRow {
  id: string;
  name: string;
  /** Pooled daily AI limit shared by all members; null = no pooled cap. */
  daily_ai_limit: number | null;
  members: number;
  used_today: number;
}

/** Reviewer-gated: every school with member count and today's pooled usage. */
export const fetchSchools = async (): Promise<SchoolRow[]> => {
  const { data, error } = await requireClient().rpc('list_schools');
  if (error) throw new Error(`Could not load schools: ${error.message}`);
  return (data ?? []) as SchoolRow[];
};

/** Admin-only: create a school, optionally with a pooled daily limit. */
export const createSchool = async (name: string, limit: number | null): Promise<void> => {
  const { error } = await requireClient().rpc('create_school', {
    p_name: name,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not create the school: ${error.message}`);
};

/** Admin-only: set (or clear, with null) a school's pooled daily limit. */
export const setSchoolQuota = async (name: string, limit: number | null): Promise<void> => {
  const { error } = await requireClient().rpc('set_school_ai_quota', {
    p_name: name,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not update the school quota: ${error.message}`);
};

/** Admin-only: place a user in a school, or remove them with a null school. */
export const assignUserSchool = async (
  username: string,
  schoolName: string | null
): Promise<void> => {
  const { error } = await requireClient().rpc('assign_user_school', {
    p_username: username,
    p_school_name: schoolName,
  });
  if (error) throw new Error(`Could not update ${username}'s school: ${error.message}`);
};

/** One row per model per UTC day. `model` is the provider model string the
 *  proxy recorded (e.g. `gemini-3-pro-preview`); price it via the registry. */
export interface ModelUsageRow {
  model: string;
  /** ISO date, UTC. */
  day: string;
  calls: number;
}

/**
 * Reviewer-gated per-model usage over the last `days` UTC days (1–31), for the
 * dashboard's cost breakdown. This reads a table the proxy populates
 * best-effort, so it can legitimately be empty (or the RPC absent on a
 * not-yet-migrated database) — callers should treat a failure as "no
 * breakdown available" and fall back to the call-count estimate rather than
 * surfacing an error.
 */
export const fetchModelUsageReport = async (days = 7): Promise<ModelUsageRow[]> => {
  const { data, error } = await requireClient().rpc('get_ai_model_usage_report', { p_days: days });
  if (error) throw new Error(`Could not load the model usage report: ${error.message}`);
  return (data ?? []) as ModelUsageRow[];
};
