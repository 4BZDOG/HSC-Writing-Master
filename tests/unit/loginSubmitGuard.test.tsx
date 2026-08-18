import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The primary "Sign In" submit button while an OAuth redirect is in flight.
 *
 * The bug this covers: `handleOAuthLogin` sets `oauthLoading`, never
 * `isLoading`, but the submit button's `disabled` prop only checked
 * `isLoading`. So while `authService.loginWithOAuth` was still resolving
 * (before the browser actually navigates away), the sign-in button stayed
 * enabled and a stray Enter/click could fire `handleSubmit` concurrently with
 * the pending OAuth redirect — a race between two competing sign-in flows.
 * Every other actionable control on the page (the OAuth buttons themselves,
 * "Continue as Guest") already guards on `isLoading || oauthLoading !== null`;
 * the submit button must match.
 */

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  fetchAllRows: vi.fn(),
}));

// Never resolves — simulates the window between clicking an OAuth button and
// the browser actually navigating away to the provider.
const loginWithOAuthMock = vi.fn((..._args: unknown[]) => new Promise(() => {}));

vi.mock('../../services/authService', () => ({
  isDemoAuthEnabled: () => false,
  authService: {
    signUp: vi.fn(),
    login: vi.fn(),
    loginAsGuest: vi.fn(),
    loginWithOAuth: (...args: unknown[]) => loginWithOAuthMock(...args),
  },
}));

import LoginPage from '../../components/LoginPage';

const onLogin = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage submit button during an OAuth redirect', () => {
  it('disables the Sign In button while an OAuth login is pending', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    const submitButton = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: /^google$/i }));

    await waitFor(() => expect(loginWithOAuthMock).toHaveBeenCalledWith('google'));
    expect(submitButton.disabled).toBe(true);
  });
});
