import { describe, it, expect } from 'vitest';
import { authService, mapSupabaseRole, mapProfileToUser } from '../../services/authService';
import { isSupabaseConfigured } from '../../services/supabaseClient';

describe('Supabase gating (safety: defaults to mock auth)', () => {
  it('is NOT configured when env vars are absent', () => {
    // No VITE_SUPABASE_* vars in the test environment.
    expect(isSupabaseConfigured).toBe(false);
  });

  it('rejects invalid mock credentials (mock path is active)', async () => {
    await expect(authService.login('admin', 'wrong-password')).rejects.toThrow(
      /invalid username or password/i
    );
  });
});

describe('local admin/guest test accounts (always available without Supabase)', () => {
  it('logs in as the local admin account', async () => {
    const user = await authService.login('admin', 'admin');
    expect(user.role).toBe('admin');
    expect(user.username).toBe('admin');
  });

  it('logs in as the local student account', async () => {
    const user = await authService.login('user', 'user');
    expect(user.role).toBe('user');
  });

  it('logs in as guest without any credentials', async () => {
    const user = await authService.loginAsGuest();
    expect(user.role).toBe('guest');
    expect(user.username).toBe('guest');
  });

  it('refreshSession never invalidates a guest session', async () => {
    const guest = await authService.loginAsGuest();
    const refreshed = await authService.refreshSession(guest);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.role).toBe('guest');
  });

  it('refreshSession keeps a local admin session valid (mock mode, not Supabase)', async () => {
    const admin = await authService.login('admin', 'admin');
    const refreshed = await authService.refreshSession(admin);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.role).toBe('admin');
  });
});

describe('mapSupabaseRole', () => {
  it('maps admin and teacher to the app admin role', () => {
    expect(mapSupabaseRole('admin')).toBe('admin');
    expect(mapSupabaseRole('teacher')).toBe('admin');
  });

  it('maps student to the app user role', () => {
    expect(mapSupabaseRole('student')).toBe('user');
  });

  it('falls back to user for unknown / missing roles', () => {
    expect(mapSupabaseRole(undefined)).toBe('user');
    expect(mapSupabaseRole(null)).toBe('user');
    expect(mapSupabaseRole('something-else')).toBe('user');
  });
});

describe('mapProfileToUser', () => {
  it('maps a full profile row into a User', () => {
    const user = mapProfileToUser('teacher@example.com', {
      username: 'jsmith',
      display_name: 'J. Smith',
      role: 'teacher',
      preferences: { theme: 'light' },
      stats: { xp: 42 },
    });

    expect(user.username).toBe('jsmith');
    expect(user.role).toBe('admin'); // teacher -> admin
    expect(user.displayName).toBe('J. Smith');
    expect(user.preferences.theme).toBe('light');
    // Defaults are merged for unspecified fields.
    expect(user.preferences.autoSave).toBe(true);
    expect(user.stats.xp).toBe(42);
    expect(user.stats.level).toBe(1);
  });

  it('falls back to the email and sensible defaults for a sparse profile', () => {
    const user = mapProfileToUser('learner@example.com', null);
    expect(user.username).toBe('learner@example.com');
    expect(user.displayName).toBe('learner@example.com');
    expect(user.role).toBe('user');
    expect(user.preferences).toBeDefined();
    expect(user.stats.streakDays).toBeGreaterThanOrEqual(1);
  });
});
