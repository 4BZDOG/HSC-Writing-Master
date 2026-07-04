import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ApiMonitorDisplay from '../../components/ApiMonitorDisplay';
import * as quotaService from '../../services/quotaService';

/**
 * The AI-quota admin console lives in the (admin-only) API telemetry widget:
 * shows the caller's own usage today, edits the per-role/group daily limits,
 * and sets/clears per-user overrides — all through the admin-gated RPCs.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

vi.mock('../../services/quotaService', async (importOriginal) => {
  const actual = await importOriginal<typeof quotaService>();
  return {
    ...actual,
    fetchMyQuotaStatus: vi.fn().mockResolvedValue({ used: 12, limit: 1000, remaining: 988 }),
    fetchRoleQuotas: vi.fn().mockResolvedValue([
      { role: 'admin', daily_limit: 1000 },
      { role: 'teacher', daily_limit: 400 },
      { role: 'student', daily_limit: 60 },
    ]),
    setRoleQuota: vi.fn().mockResolvedValue(undefined),
    setUserQuotaOverride: vi.fn().mockResolvedValue(undefined),
  };
});

const openPanel = async () => {
  render(<ApiMonitorDisplay />);
  fireEvent.click(screen.getByTitle('Show API Usage Details'));
  await waitFor(() => expect(screen.getByText('Daily AI Quotas')).toBeTruthy());
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AiQuotaPanel (admin quota console)', () => {
  it('shows my usage today and the per-group limits', async () => {
    await openPanel();
    await waitFor(() => expect(screen.getByText('12/1000')).toBeTruthy());

    expect((screen.getByLabelText('Admins daily limit') as HTMLInputElement).value).toBe('1000');
    expect((screen.getByLabelText('Teachers daily limit') as HTMLInputElement).value).toBe('400');
    expect((screen.getByLabelText('Students daily limit') as HTMLInputElement).value).toBe('60');
  });

  it('saves edited group limits through the admin RPC', async () => {
    await openPanel();
    await waitFor(() =>
      expect((screen.getByLabelText('Students daily limit') as HTMLInputElement).value).toBe('60')
    );

    fireEvent.change(screen.getByLabelText('Students daily limit'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save group limits/i }));

    await waitFor(() =>
      expect(quotaService.setRoleQuota).toHaveBeenCalledWith('student', 80)
    );
    expect(quotaService.setRoleQuota).toHaveBeenCalledWith('teacher', 400);
    expect(await screen.findByText('Group limits saved.')).toBeTruthy();
  });

  it('rejects a negative group limit without calling the RPC', async () => {
    await openPanel();
    await waitFor(() =>
      expect((screen.getByLabelText('Students daily limit') as HTMLInputElement).value).toBe('60')
    );

    fireEvent.change(screen.getByLabelText('Admins daily limit'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /save group limits/i }));

    expect(await screen.findByText(/non-negative number/i)).toBeTruthy();
    expect(quotaService.setRoleQuota).not.toHaveBeenCalled();
  });

  it('sets a per-user override by username', async () => {
    await openPanel();
    fireEvent.change(screen.getByLabelText('Override username'), {
      target: { value: 'jsmith' },
    });
    fireEvent.change(screen.getByLabelText('Override daily limit'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /set override/i }));

    await waitFor(() =>
      expect(quotaService.setUserQuotaOverride).toHaveBeenCalledWith('jsmith', 200)
    );
    expect(await screen.findByText(/jsmith now has a personal limit of 200\/day/)).toBeTruthy();
  });

  it('clears an override (null → role default applies)', async () => {
    await openPanel();
    fireEvent.change(screen.getByLabelText('Override username'), {
      target: { value: 'jsmith' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));

    await waitFor(() =>
      expect(quotaService.setUserQuotaOverride).toHaveBeenCalledWith('jsmith', null)
    );
    expect(await screen.findByText(/override cleared for jsmith/i)).toBeTruthy();
  });

  it('requires a username before touching the RPC', async () => {
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: /set override/i }));
    expect(await screen.findByText(/enter a username/i)).toBeTruthy();
    expect(quotaService.setUserQuotaOverride).not.toHaveBeenCalled();
  });
});
