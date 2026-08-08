import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The two screens of a password reset, as a user meets them.
 *
 * The service tests prove the calls behave; these prove the screens reach them,
 * and guard the two wordings that matter:
 *
 *  - the "sent" panel must NOT confirm whether an account exists, or the form
 *    becomes a way to discover who has one (here, a roster of students);
 *  - the reset screen replaces everything else, because the recovery link has
 *    already signed the user in and a login form at that moment is incoherent.
 */

const requestPasswordResetMock = vi.fn();
const completePasswordResetMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  fetchAllRows: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  isDemoAuthEnabled: () => false,
  authService: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordResetMock(...args),
    completePasswordReset: (...args: unknown[]) => completePasswordResetMock(...args),
    signUp: vi.fn(),
    login: vi.fn(),
    loginAsGuest: vi.fn(),
    loginWithOAuth: vi.fn(),
  },
}));

import LoginPage from '../../components/LoginPage';
import ResetPasswordPage from '../../components/ResetPasswordPage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requesting a reset from the login page', () => {
  const onLogin = vi.fn();

  const openReset = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /forgot your password/i }));
  };

  it('offers a way in', () => {
    render(<LoginPage onLogin={onLogin} />);
    expect(screen.getByRole('button', { name: /forgot your password/i })).toBeTruthy();
  });

  it('hides the password field — only the address is needed', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openReset(user);

    expect(screen.getByRole('button', { name: /send reset link/i })).toBeTruthy();
    // Present in the DOM but hidden, so nobody types a password that goes
    // nowhere.
    const passwordField = screen.getByLabelText('Password').closest('div.hidden');
    expect(passwordField).not.toBeNull();
  });

  it('rejects an empty address before calling the service', async () => {
    // Malformed addresses are stopped earlier still, by the browser's own
    // constraint validation on `<input type="email">` — the submit event never
    // fires. An EMPTY field is valid to the browser (it is not `required`), so
    // it reaches the handler, and that is the case this check owns.
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openReset(user);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/email address on the account/i)).toBeTruthy();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('confirms without revealing whether the account exists', async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await openReset(user);

    await user.type(screen.getByLabelText('Email'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    const panel = await screen.findByTestId('reset-sent');
    expect(requestPasswordResetMock).toHaveBeenCalledWith('student@example.com');
    // The conditional wording is the anti-enumeration guarantee. If this ever
    // becomes "We sent a link to…", the form starts confirming who has an
    // account here.
    expect(panel.textContent).toMatch(/if an account exists/i);
    expect(panel.textContent).toContain('student@example.com');
  });

  it('surfaces a rate limit', async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockRejectedValue(
      new Error('Too many reset emails requested. Wait a minute and try again.')
    );
    render(<LoginPage onLogin={onLogin} />);
    await openReset(user);

    await user.type(screen.getByLabelText('Email'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/too many reset emails/i)).toBeTruthy();
  });

  it('can be backed out of', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openReset(user);
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send reset link/i })).toBeNull();
  });
});

describe('setting the new password', () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();

  const fill = async (
    user: ReturnType<typeof userEvent.setup>,
    password: string,
    confirm: string
  ) => {
    await user.type(screen.getByLabelText('New password'), password);
    await user.type(screen.getByLabelText(/confirm new password/i), confirm);
    await user.click(screen.getByRole('button', { name: /set password/i }));
  };

  it('catches a mismatch without calling the service', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage onComplete={onComplete} onCancel={onCancel} />);
    await fill(user, 'correct-horse', 'different-horse');

    expect(await screen.findByText(/do not match/i)).toBeTruthy();
    expect(completePasswordResetMock).not.toHaveBeenCalled();
  });

  it('enforces the same minimum length as sign-up', async () => {
    // A password accepted at registration and refused at reset is the kind of
    // inconsistency people report as "it will not let me back in".
    const user = userEvent.setup();
    render(<ResetPasswordPage onComplete={onComplete} onCancel={onCancel} />);
    await fill(user, 'short', 'short');

    expect(await screen.findByText(/at least 8 characters/i)).toBeTruthy();
    expect(completePasswordResetMock).not.toHaveBeenCalled();
  });

  it('sets the password and hands back a signed-in user', async () => {
    const user = userEvent.setup();
    const signedIn = { username: 'student', role: 'user' };
    completePasswordResetMock.mockResolvedValue(signedIn);
    render(<ResetPasswordPage onComplete={onComplete} onCancel={onCancel} />);

    await fill(user, 'a-new-password', 'a-new-password');

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(signedIn));
    expect(completePasswordResetMock).toHaveBeenCalledWith('a-new-password');
  });

  it('explains an expired link instead of failing blankly', async () => {
    const user = userEvent.setup();
    completePasswordResetMock.mockRejectedValue(
      new Error('That reset link has expired or has already been used. Request a new one.')
    );
    render(<ResetPasswordPage onComplete={onComplete} onCancel={onCancel} />);

    await fill(user, 'a-new-password', 'a-new-password');

    expect(await screen.findByText(/expired or has already been used/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('offers a cancel that signs out, not one that just navigates away', async () => {
    // The link signed them in before they chose anything; on a shared computer
    // the person who opened the email may not be the account holder.
    const user = userEvent.setup();
    render(<ResetPasswordPage onComplete={onComplete} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel and sign out/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
