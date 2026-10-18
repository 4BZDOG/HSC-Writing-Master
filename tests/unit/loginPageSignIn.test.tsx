import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const loginAsGuestMock = vi.fn();

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
    loginAsGuest: (...args: unknown[]) => loginAsGuestMock(...args),
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

  it('names the sign-in form, and leaves focus alone on arrival', () => {
    // Focus moves to a heading only when the card's contents CHANGE; landing on
    // the page must not steal it.
    render(<LoginPage onLogin={onLogin} />);
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByRole('heading', { name: /^sign in$/i })).toBeTruthy();
  });

  it('shows the service wording for anything other than a bad password', async () => {
    // Offline, rate-limited or unconfirmed used to be flattened into "that
    // password does not match", sending the reader the wrong way.
    loginMock.mockRejectedValue(
      new Error(
        'Could not reach the sign-in service. Check your internet connection and try again.'
      )
    );
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'user');
    await user.type(screen.getByLabelText(/^password$/i), 'user');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/could not reach the sign-in service/i)).toBeTruthy();
    expect(screen.queryByText(/do not match an account/i)).toBeNull();
  });

  it('shows guest as the one working, and leaves Sign in named as it was', async () => {
    // One busy flag for every action spun the Sign in button while guest was
    // the one working. Each action now shows its own state.
    loginAsGuestMock.mockImplementationOnce(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.click(screen.getByRole('button', { name: /continue as guest/i }));

    const guest = await screen.findByRole('button', { name: /opening guest session/i });
    expect(guest.getAttribute('aria-busy')).toBe('true');
    const signIn = screen.getByRole('button', { name: /^sign in$/i });
    expect(signIn.getAttribute('aria-busy')).toBeNull();
    expect((signIn as HTMLButtonElement).disabled).toBe(true);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('says what the sign-in button is doing, in words, while it works', async () => {
    loginMock.mockImplementationOnce(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/username/i), 'user');
    await user.type(screen.getByLabelText(/^password$/i), 'user');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const busy = await screen.findByRole('button', { name: 'Signing in…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(
      screen.getByRole('button', { name: /continue as guest/i }).getAttribute('aria-busy')
    ).toBeNull();
  });

  it('reveals the typed password on request, as a toggle with one name', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(password.type).toBe('password');

    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show.getAttribute('aria-pressed')).toBe('false');
    expect(show.getAttribute('aria-controls')).toBe('password');

    // One name throughout; the state is aria-pressed's to report.
    await user.click(show);
    expect(password.type).toBe('text');
    expect(show.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Hide password' })).toBeNull();

    await user.click(show);
    expect(password.type).toBe('password');
    expect(show.getAttribute('aria-pressed')).toBe('false');
  });

  it('says so while Caps Lock is on, in the hint slot the field already has', () => {
    render(<LoginPage onLogin={onLogin} />);
    const password = screen.getByLabelText(/^password$/i);
    // The modifier state is read from the key event, so the event is given it.
    const key = (type: 'keyDown' | 'keyUp', capsLock: boolean) => {
      const event = createEvent[type](password, { key: 'A' });
      Object.assign(event, {
        getModifierState: (name: string) => name === 'CapsLock' && capsLock,
      });
      fireEvent(password, event);
    };

    key('keyDown', true);
    expect(screen.getByText('Caps Lock is on.')).toBeTruthy();
    expect(password.getAttribute('aria-describedby')).toBe('password-hint');

    key('keyUp', false);
    expect(screen.queryByText('Caps Lock is on.')).toBeNull();
    expect(password.getAttribute('aria-describedby')).toBeNull();
  });
});
