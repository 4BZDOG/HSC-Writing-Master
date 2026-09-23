import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Password sign-in as a user meets it, on a deployment running the local demo
 * accounts (no Supabase).
 *
 * Three things these pin. The password is sent exactly as typed — sign-up
 * stores it untrimmed, so trimming it here locked out anyone whose password
 * began or ended with a space. An empty field is named under that field rather
 * than in one "required fields missing" banner. And the demo-account chips
 * fill the form, because the password was never shown anywhere.
 */

const loginMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  fetchAllRows: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  isDemoAuthEnabled: () => true,
  authService: {
    signUp: vi.fn(),
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

describe('LoginPage sign-in', () => {
  it('sends the password exactly as typed, spaces included', async () => {
    loginMock.mockResolvedValue({ id: 'u1', displayName: 'Student' });
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/username/i), '  student  ');
    await user.type(screen.getByLabelText(/^password$/i), ' secret ');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('student', ' secret '));
    expect(onLogin).toHaveBeenCalled();
  });

  it('names each empty field under that field and does not call the service', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByText('Enter your username.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    const username = screen.getByLabelText(/username/i);
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(username.getAttribute('aria-describedby')).toBe('username-error');
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('treats a password of only spaces as empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'user');
    await user.type(screen.getByLabelText(/^password$/i), '   ');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('says plainly when the details do not match an account', async () => {
    loginMock.mockRejectedValue(new Error('Invalid username or password'));
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'user');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText(/that username and password do not match an account/i)
    ).toBeTruthy();
  });

  it('fills the form from a demo-account chip', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.click(screen.getByRole('button', { name: /teacher demo account/i }));

    expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('teacher');
    expect((screen.getByLabelText(/^password$/i) as HTMLInputElement).value).toBe('teacher');
  });
});
