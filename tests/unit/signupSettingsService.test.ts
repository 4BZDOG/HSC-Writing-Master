import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * services/signupSettingsService.ts: the admin client for the server-side sign-up limits
 * (schema.sql §33). The database enforces them; these tests pin the client's side of the
 * contract: the RPC names and argument names, the read-back mapping, and the form parsers.
 */

const rpcMock = vi.fn();
let clientAvailable = true;

vi.mock('../../services/supabaseClient', () => ({
  getSupabase: async () =>
    clientAvailable ? { rpc: (...args: unknown[]) => rpcMock(...args) } : null,
}));

import {
  fetchSignupSettings,
  parseDailySignupCap,
  parseSignupDomains,
  saveSignupSettings,
} from '../../services/signupSettingsService';

beforeEach(() => {
  vi.clearAllMocks();
  clientAvailable = true;
});

describe('fetchSignupSettings', () => {
  it('reads get_signup_settings and maps it to camelCase', async () => {
    rpcMock.mockResolvedValue({
      data: {
        signups_enabled: false,
        allowed_email_domains: ['education.nsw.gov.au'],
        daily_signup_cap: 200,
        updated_at: '2026-11-15T01:02:03Z',
      },
      error: null,
    });
    await expect(fetchSignupSettings()).resolves.toEqual({
      signupsEnabled: false,
      allowedEmailDomains: ['education.nsw.gov.au'],
      dailySignupCap: 200,
      updatedAt: '2026-11-15T01:02:03Z',
    });
    expect(rpcMock).toHaveBeenCalledWith('get_signup_settings');
  });

  it('keeps a null cap as "no cap" and an empty list as "any domain"', async () => {
    rpcMock.mockResolvedValue({
      data: { signups_enabled: true, allowed_email_domains: [], daily_signup_cap: null },
      error: null,
    });
    await expect(fetchSignupSettings()).resolves.toMatchObject({
      signupsEnabled: true,
      allowedEmailDomains: [],
      dailySignupCap: null,
    });
  });

  it('answers null on an error, so the panel hides rather than showing settings that do nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    await expect(fetchSignupSettings()).resolves.toBeNull();
  });

  it('answers null when Supabase is not configured (mock mode)', async () => {
    clientAvailable = false;
    await expect(fetchSignupSettings()).resolves.toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('saveSignupSettings', () => {
  it('sends the three arguments set_signup_settings takes, under their p_ names', async () => {
    rpcMock.mockResolvedValue({
      data: {
        signups_enabled: true,
        allowed_email_domains: ['det.nsw.edu.au'],
        daily_signup_cap: null,
      },
      error: null,
    });
    const saved = await saveSignupSettings({
      signupsEnabled: true,
      allowedEmailDomains: ['det.nsw.edu.au'],
      dailySignupCap: null,
    });
    expect(rpcMock).toHaveBeenCalledWith('set_signup_settings', {
      p_enabled: true,
      p_domains: ['det.nsw.edu.au'],
      p_daily_cap: null,
    });
    expect(saved.allowedEmailDomains).toEqual(['det.nsw.edu.au']);
  });

  it('surfaces the database refusal to the admin', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'The daily sign-up cap must be zero or more, or blank for no cap' },
    });
    await expect(
      saveSignupSettings({ signupsEnabled: true, allowedEmailDomains: [], dailySignupCap: -1 })
    ).rejects.toThrow(/zero or more/);
  });

  it('refuses when Supabase is not configured', async () => {
    clientAvailable = false;
    await expect(
      saveSignupSettings({ signupsEnabled: true, allowedEmailDomains: [], dailySignupCap: null })
    ).rejects.toThrow(/not configured/);
  });
});

describe('parseSignupDomains', () => {
  it('splits on commas and whitespace, lowercases, strips @ and drops duplicates and blanks', () => {
    expect(
      parseSignupDomains(' @Education.NSW.gov.au, det.nsw.edu.au ,, education.nsw.gov.au')
    ).toEqual(['education.nsw.gov.au', 'det.nsw.edu.au']);
  });

  it('returns an empty list for blank input, which means any domain', () => {
    expect(parseSignupDomains('   ')).toEqual([]);
  });
});

describe('parseDailySignupCap', () => {
  it('treats blank as no cap', () => {
    expect(parseDailySignupCap('  ')).toEqual({ value: null, error: null });
  });

  it('accepts zero and whole numbers', () => {
    expect(parseDailySignupCap('0')).toEqual({ value: 0, error: null });
    expect(parseDailySignupCap(' 200 ')).toEqual({ value: 200, error: null });
  });

  it('refuses negatives, decimals and words, with a reason', () => {
    for (const bad of ['-1', '2.5', 'many', '1e3']) {
      const result = parseDailySignupCap(bad);
      expect(result.value).toBeNull();
      expect(result.error).toMatch(/whole number/);
    }
  });

  it('refuses a cap too large for the database column', () => {
    expect(parseDailySignupCap('9999999999').error).toMatch(/too large/);
  });
});
