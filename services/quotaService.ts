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
