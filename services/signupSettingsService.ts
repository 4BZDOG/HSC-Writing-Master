/**
 * Admin client for the server-side sign-up limits (supabase/schema.sql §33).
 *
 * The limits are enforced by Supabase's "Before User Created" hook, which reads the
 * single `signup_settings` row. This module only reads and writes that row through the
 * admin-gated RPCs. It is a control surface, not the control point: the database refuses
 * a non-admin, and the hook refuses the account whatever the browser says.
 */
import { getSupabase } from './supabaseClient';
import { parseAllowedDomains } from './signupPolicy';

export interface SignupSettings {
  signupsEnabled: boolean;
  /** Bare, lowercase domains. Empty = any domain. Sub-domains of a listed domain pass. */
  allowedEmailDomains: string[];
  /** New accounts allowed per UTC day. Null = no cap. */
  dailySignupCap: number | null;
  updatedAt: string | null;
}

/** The shape the get/set RPCs return (snake_case, as jsonb). */
interface SignupSettingsRow {
  signups_enabled?: unknown;
  allowed_email_domains?: unknown;
  daily_signup_cap?: unknown;
  updated_at?: unknown;
}

const toSettings = (row: SignupSettingsRow | null | undefined): SignupSettings | null => {
  if (!row || typeof row !== 'object') return null;
  const domains = Array.isArray(row.allowed_email_domains)
    ? row.allowed_email_domains.filter((d): d is string => typeof d === 'string')
    : [];
  const cap = typeof row.daily_signup_cap === 'number' ? row.daily_signup_cap : null;
  return {
    signupsEnabled: row.signups_enabled !== false,
    allowedEmailDomains: domains,
    dailySignupCap: cap,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
};

/**
 * The live sign-up limits. Answers null when they are unreadable (mock mode, or a
 * database that pre-dates §33), so the admin panel can hide the section rather than
 * show settings that do nothing.
 */
export const fetchSignupSettings = async (): Promise<SignupSettings | null> => {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_signup_settings');
    if (error) return null;
    return toSettings(data as SignupSettingsRow);
  } catch {
    return null;
  }
};

/**
 * Admin-only: replace the sign-up limits. The RPC normalises the domains and refuses a
 * negative cap or a malformed domain, and its refusal text is shown to the admin as-is.
 */
export const saveSignupSettings = async (input: {
  signupsEnabled: boolean;
  allowedEmailDomains: string[];
  dailySignupCap: number | null;
}): Promise<SignupSettings> => {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('set_signup_settings', {
    p_enabled: input.signupsEnabled,
    p_domains: input.allowedEmailDomains,
    p_daily_cap: input.dailySignupCap,
  });
  if (error) throw new Error(`Could not save the sign-up limits: ${error.message}`);
  const saved = toSettings(data as SignupSettingsRow);
  if (!saved) throw new Error('Could not read back the sign-up limits after saving.');
  return saved;
};

/**
 * The domain field's text, as the admin typed it, to the list the RPC stores. Commas
 * separate entries, as in VITE_ALLOWED_EMAIL_DOMAINS, so the same syntax works in both.
 */
export const parseSignupDomains = (text: string): string[] => [
  ...new Set(parseAllowedDomains(text.replace(/\s+/g, ','))),
];

/**
 * The daily cap field's text. Blank means no cap. Anything else must be a whole number
 * of zero or more. `error` says why a value was refused, so the form can show it.
 */
export const parseDailySignupCap = (
  text: string
): { value: number | null; error: string | null } => {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return {
      value: null,
      error: 'Enter a whole number of new accounts per day, or leave it blank.',
    };
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value > 2147483647) {
    return { value: null, error: 'That daily cap is too large.' };
  }
  return { value, error: null };
};
