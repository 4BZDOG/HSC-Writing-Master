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
const loginWithOAuthMock = vi.fn();

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
    loginWithOAuth: (...args: unknown[]) => loginWithOAuthMock(...args),
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

/**
 * The provider buttons create the account as the picker says. A Google, Microsoft or
 * GitHub sign-up carries a parent choice across the redirect; a sign-in carries none.
 */
describe('LoginPage sign-up: the provider buttons follow the picker', () => {
  it('passes the parent choice to the provider', async () => {
    const user = userEvent.setup();
    loginWithOAuthMock.mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.click(screen.getByRole('radio', { name: /parent or guardian/i }));
    await user.click(screen.getByRole('button', { name: /google/i }));

    expect(loginWithOAuthMock).toHaveBeenCalledTimes(1);
    expect(loginWithOAuthMock.mock.calls[0]).toEqual(['google', 'parent']);
  });

  it('says so under the buttons when the parent choice is made', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    expect(screen.getByText('or sign up with')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /parent or guardian/i }));
    expect(screen.getByText('Signing up as a parent or guardian')).toBeTruthy();
    expect(screen.queryByText('or sign up with')).toBeNull();
  });

  it('passes a student sign-up through as no choice', async () => {
    const user = userEvent.setup();
    loginWithOAuthMock.mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await openSignUp(user);

    await user.click(screen.getByRole('button', { name: /microsoft/i }));

    expect(loginWithOAuthMock.mock.calls[0][0]).toBe('azure');
    expect(loginWithOAuthMock.mock.calls[0][1]).toBe('student');
  });

  it('a sign-in passes no choice, whatever the picker last showed', async () => {
    const user = userEvent.setup();
    loginWithOAuthMock.mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);

    expect(screen.getByText('or continue with')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /google/i }));

    expect(loginWithOAuthMock.mock.calls[0]).toEqual(['google', undefined]);
  });
});
