import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SignupLimitsSection from '../../components/admin/SignupLimitsSection';
import * as signupSettingsService from '../../services/signupSettingsService';

/**
 * The admin "Sign-up limits" panel. It only changes stored settings; the database and the
 * Supabase hook enforce them. These tests pin the form: what it loads, when Save is live,
 * what it sends, and how a refusal is shown.
 */

vi.mock('../../services/signupSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof signupSettingsService>();
  return {
    ...actual,
    fetchSignupSettings: vi.fn(),
    saveSignupSettings: vi.fn(),
  };
});

const showToast = vi.fn();

const current: signupSettingsService.SignupSettings = {
  signupsEnabled: true,
  allowedEmailDomains: ['education.nsw.gov.au'],
  dailySignupCap: 200,
  updatedAt: null,
};

beforeEach(() => {
  vi.mocked(signupSettingsService.fetchSignupSettings).mockResolvedValue(current);
  vi.mocked(signupSettingsService.saveSignupSettings).mockImplementation(async (input) => ({
    signupsEnabled: input.signupsEnabled,
    allowedEmailDomains: input.allowedEmailDomains,
    dailySignupCap: input.dailySignupCap,
    updatedAt: '2026-11-15T00:00:00Z',
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderOpen = async () => {
  render(<SignupLimitsSection isOpen={true} showToast={showToast} />);
  await waitFor(() => expect(screen.getByLabelText('Allowed email domains')).toBeTruthy());
};

describe('SignupLimitsSection', () => {
  it('loads the stored settings into the form', async () => {
    await renderOpen();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Allowed email domains') as HTMLInputElement).value).toBe(
      'education.nsw.gov.au'
    );
    expect((screen.getByLabelText('Max new accounts per day') as HTMLInputElement).value).toBe(
      '200'
    );
  });

  it('keeps Save off until something changes', async () => {
    await renderOpen();
    const save = screen.getByRole('button', { name: 'Save Sign-up Limits' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Max new accounts per day'), {
      target: { value: '150' },
    });
    expect(save.disabled).toBe(false);
  });

  it('saves normalised domains and a blank cap as no cap, then reports success', async () => {
    await renderOpen();
    fireEvent.change(screen.getByLabelText('Allowed email domains'), {
      target: { value: '@Det.NSW.edu.au, education.nsw.gov.au' },
    });
    fireEvent.change(screen.getByLabelText('Max new accounts per day'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Sign-up Limits' }));

    await waitFor(() =>
      expect(signupSettingsService.saveSignupSettings).toHaveBeenCalledWith({
        signupsEnabled: true,
        allowedEmailDomains: ['det.nsw.edu.au', 'education.nsw.gov.au'],
        dailySignupCap: null,
      })
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Sign-up limits saved. They apply to the next sign-up.',
        'success'
      )
    );
  });

  it('turns sign-ups off when the toggle is cleared', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Sign-up Limits' }));
    await waitFor(() =>
      expect(signupSettingsService.saveSignupSettings).toHaveBeenCalledWith(
        expect.objectContaining({ signupsEnabled: false })
      )
    );
  });

  it('refuses a malformed cap without calling the server', async () => {
    await renderOpen();
    fireEvent.change(screen.getByLabelText('Max new accounts per day'), {
      target: { value: '-5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Sign-up Limits' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(signupSettingsService.saveSignupSettings).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/whole number/), 'error');
  });

  it('shows the server refusal and an error toast when the save fails', async () => {
    vi.mocked(signupSettingsService.saveSignupSettings).mockRejectedValue(
      new Error('Could not save the sign-up limits: Only admins can change sign-up settings')
    );
    await renderOpen();
    fireEvent.change(screen.getByLabelText('Max new accounts per day'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Sign-up Limits' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not save the sign-up limits: Only admins can change sign-up settings'
    );
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('renders nothing when the settings are unreadable (database pre-dates §33)', async () => {
    vi.mocked(signupSettingsService.fetchSignupSettings).mockResolvedValue(null);
    const { container } = render(<SignupLimitsSection isOpen={true} showToast={showToast} />);
    await waitFor(() => expect(signupSettingsService.fetchSignupSettings).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });

  it('does not read the settings while the dashboard is closed', () => {
    render(<SignupLimitsSection isOpen={false} showToast={showToast} />);
    expect(signupSettingsService.fetchSignupSettings).not.toHaveBeenCalled();
  });
});
