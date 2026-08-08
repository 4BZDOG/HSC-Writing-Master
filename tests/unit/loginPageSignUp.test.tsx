import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The sign-up form as a user meets it.
 *
 * The service tests prove `signUp` behaves; these prove the screen actually
 * reaches it — that "Create one" exists, that the extra fields appear, that a
 * mismatch is caught before a network call, and that the confirmation state
 * replaces the form rather than sitting beside it (a form left on screen after
 * a successful signup invites a second submit, which fails as "already
 * registered" and reads like the first one broke).
 */

const signUpMock = vi.fn();
const loginMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  fetchAllRows: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  isDemoAuthEnabled: () => false,
  authService: {
    signUp: (...args: unknown[]) => signUpMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
    loginAsGuest: vi.fn(),
    loginWithOAuth: vi.fn(),
  },
}));

import LoginPage from '../../components/LoginPage';

const onLogin = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const openSignUp = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /create one/i }));
};

describe('LoginPage sign-up', () => {
  it('offers a way to create an account', () => {
    render(<LoginPage onLogin={onLogin} />);
    expect(screen.getByRole('button', { name: /create one/i })).toBeTruthy();
  });

  it('reveals the sign-up fields on switching', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.queryByLabelText(/confirm password/i)).toBeNull();
    await openSignUp(user);

    expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
    expect(screen.getByLabelText(/full name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy();
  });

  it('asks a password manager for a NEW password, not the saved one', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText(/confirm password/i).getAttribute('autocomplete')).toBe(
      'new-password'
    );
  });

  it('catches a password mismatch without calling the service', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.type(screen.getByLabelText('Email'), 'student@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm password/i), 'different-horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/do not match/i)).toBeTruthy();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('submits a valid form and logs an active account straight in', async () => {
    const user = userEvent.setup();
    const newUser = { username: 'student', role: 'user' };
    signUpMock.mockResolvedValue({ status: 'active', user: newUser });
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.type(screen.getByLabelText('Email'), 'student@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(newUser));
  });

  it('replaces the form with the confirmation notice, naming the address', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({
      status: 'confirmation-required',
      email: 'student@example.com',
    });
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.type(screen.getByLabelText('Email'), 'student@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('signup-confirmation')).toBeTruthy();
    expect(screen.getByText(/student@example\.com/)).toBeTruthy();
    // The form is gone, so there is nothing to submit a second time.
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
    // And nobody is logged in — the account is inert until the link is clicked.
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('shows the service message when the address is already taken', async () => {
    const user = userEvent.setup();
    signUpMock.mockRejectedValue(
      new Error('An account already exists for that email address. Sign in instead.')
    );
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
    // Still on the form, so they can correct it.
    expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy();
  });

  it('clears the typed password when switching back to sign in', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText(/confirm password/i)).toBeNull();
  });

  it('still signs in normally — sign-up has not displaced the primary path', async () => {
    const user = userEvent.setup();
    const existing = { username: 'someone', role: 'user' };
    loginMock.mockResolvedValue(existing);
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText('Email'), 'someone@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(existing));
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
