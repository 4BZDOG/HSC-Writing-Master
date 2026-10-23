import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The account-type choice on the sign-up form. A student is the default. A
 * parent or guardian picks the other option, and the account is created with
 * that type. The choice exists only in sign-up mode, which only exists where
 * there is an online account to create.
 */

const signUpMock = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {},
  fetchAllRows: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  isDemoAuthEnabled: () => false,
  authService: {
    signUp: (...args: unknown[]) => signUpMock(...args),
    login: vi.fn(),
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

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Email'), 'pat@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.type(screen.getByLabelText(/confirm password/i), 'correct-horse');
};

describe('LoginPage sign-up: account type', () => {
  it('offers the two options, with a student selected by default', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    const student = screen.getByRole('radio', { name: /i.m a student/i }) as HTMLInputElement;
    const parent = screen.getByRole('radio', { name: /parent or guardian/i }) as HTMLInputElement;
    expect(student.checked).toBe(true);
    expect(parent.checked).toBe(false);
  });

  it('creates a parent account when the parent option is chosen', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ status: 'confirmation-required', email: 'pat@example.com' });
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.click(screen.getByRole('radio', { name: /parent or guardian/i }));
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(signUpMock).toHaveBeenCalledTimes(1);
    expect(signUpMock.mock.calls[0][3]).toBe('parent');
  });

  it('creates a student account by default', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValue({ status: 'confirmation-required', email: 'pat@example.com' });
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(signUpMock.mock.calls[0][3]).toBe('student');
  });

  it('is not shown on the sign-in form', () => {
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.queryByRole('radio', { name: /parent or guardian/i })).toBeNull();
  });
});
