import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import UsageDashboard from '../../components/admin/UsageDashboard';
import * as quotaService from '../../services/quotaService';
import type { UsageReportRow } from '../../services/quotaService';

/**
 * The AI Usage Dashboard is the admin surface for MONITORING spend (headline
 * tiles, a 7-day trend, per-user usage today) and ADJUSTING budgets (inline
 * per-user overrides + group limits) — all through the admin-gated RPCs.
 */

vi.mock('../../services/curriculumService', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, isCurriculumRemote: () => true };
});

/** UTC day string, same bucket as the server counter. */
const utcDay = (offsetDays = 0): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

const reportFixture: UsageReportRow[] = [
  { username: 'jsmith', role: 'teacher', day: utcDay(0), calls: 35, limit: 400, override: null },
  { username: 'akhan', role: 'student', day: utcDay(0), calls: 58, limit: 60, override: null },
  { username: 'dforbes', role: 'admin', day: utcDay(0), calls: 12, limit: 1000, override: 1000 },
  { username: 'jsmith', role: 'teacher', day: utcDay(1), calls: 90, limit: 400, override: null },
  { username: 'akhan', role: 'student', day: utcDay(3), calls: 10, limit: 60, override: null },
];

vi.mock('../../services/quotaService', async (importOriginal) => {
  const actual = await importOriginal<typeof quotaService>();
  return {
    ...actual,
    fetchUsageReport: vi.fn(),
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

const showToast = vi.fn();

const openDashboard = async (rows: UsageReportRow[] = reportFixture) => {
  vi.mocked(quotaService.fetchUsageReport).mockResolvedValue(rows);
  render(<UsageDashboard isOpen={true} onClose={vi.fn()} showToast={showToast} />);
  await waitFor(() => expect(screen.getByText('Calls Today')).toBeTruthy());
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UsageDashboard', () => {
  /** Read a StatTile's big value by its label (the label + value share a tile). */
  const tileValue = (label: string): string | null => {
    const labelEl = screen.getByText(label);
    return labelEl.parentElement?.querySelector('.text-2xl')?.textContent ?? null;
  };

  it('shows headline totals computed from today’s rows only', async () => {
    await openDashboard();
    // Calls today = 35 + 58 + 12 (yesterday's 90 and the 3-day-old 10 excluded)
    expect(tileValue('Calls Today')).toBe('105');
    // Active users today
    expect(tileValue('Active Users')).toBe('3');
    // My remaining, from get_ai_quota_status
    expect(tileValue('My Remaining')).toBe('988');
  });

  it('lists per-user usage today sorted by calls, with used/limit as text', async () => {
    await openDashboard();
    const table = screen.getByRole('table');
    const cells = within(table)
      .getAllByRole('row')
      .slice(1) // skip header
      .map((row) => within(row).getAllByRole('cell')[0].textContent);
    expect(cells).toEqual(['akhan', 'jsmith', 'dforbes']);
    expect(within(table).getByText('58/60')).toBeTruthy();
    expect(within(table).getByText('35/400')).toBeTruthy();
  });

  it('renders a zero-filled 7-day trend (every day present even when quiet)', async () => {
    await openDashboard();
    // 7 day rows, each titled "<iso-day>: <calls> calls"
    const dayRows = Array.from({ length: 7 }, (_, i) => utcDay(6 - i)).map((day) =>
      document.querySelector(`[title^="${day}:"]`)
    );
    dayRows.forEach((el) => expect(el).toBeTruthy());
    // A day with no usage shows 0 calls
    expect(document.querySelector(`[title="${utcDay(5)}: 0 calls"]`)).toBeTruthy();
    // Yesterday aggregates to 90
    expect(document.querySelector(`[title="${utcDay(1)}: 90 calls"]`)).toBeTruthy();
  });

  it('sets an inline per-user override from the table row and reloads', async () => {
    await openDashboard();
    fireEvent.change(screen.getByLabelText('Override for akhan'), { target: { value: '120' } });
    fireEvent.click(screen.getByLabelText('Set override for akhan'));

    await waitFor(() =>
      expect(quotaService.setUserQuotaOverride).toHaveBeenCalledWith('akhan', 120)
    );
    expect(showToast).toHaveBeenCalledWith('akhan now has a personal limit of 120/day.', 'success');
    // The dashboard refreshes after an adjustment
    expect(vi.mocked(quotaService.fetchUsageReport).mock.calls.length).toBeGreaterThan(1);
  });

  it('rejects an invalid inline override without calling the RPC', async () => {
    await openDashboard();
    fireEvent.change(screen.getByLabelText('Override for akhan'), { target: { value: '-4' } });
    fireEvent.click(screen.getByLabelText('Set override for akhan'));

    expect(showToast).toHaveBeenCalledWith(
      'Enter a non-negative daily limit for the override.',
      'error'
    );
    expect(quotaService.setUserQuotaOverride).not.toHaveBeenCalled();
  });

  it('only offers Clear on rows that actually have an override', async () => {
    await openDashboard();
    // dforbes has override 1000 → clear button present
    expect(screen.getByLabelText('Clear override for dforbes')).toBeTruthy();
    // akhan has none → no clear button
    expect(screen.queryByLabelText('Clear override for akhan')).toBeNull();

    fireEvent.click(screen.getByLabelText('Clear override for dforbes'));
    await waitFor(() =>
      expect(quotaService.setUserQuotaOverride).toHaveBeenCalledWith('dforbes', null)
    );
  });

  it('adjusts a user with no usage row today via the fallback editor', async () => {
    await openDashboard();
    fireEvent.change(screen.getByLabelText('Other username'), { target: { value: 'newbie' } });
    fireEvent.change(screen.getByLabelText('Other user daily limit'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^set$/i }));

    await waitFor(() =>
      expect(quotaService.setUserQuotaOverride).toHaveBeenCalledWith('newbie', 25)
    );
  });

  it('saves group limits through the admin RPC', async () => {
    await openDashboard();
    fireEvent.change(screen.getByLabelText('Students daily limit'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save group limits/i }));

    await waitFor(() => expect(quotaService.setRoleQuota).toHaveBeenCalledWith('student', 80));
    expect(quotaService.setRoleQuota).toHaveBeenCalledWith('admin', 1000);
    expect(quotaService.setRoleQuota).toHaveBeenCalledWith('teacher', 400);
  });

  it('shows an empty state when there are no calls today', async () => {
    await openDashboard([
      { username: 'jsmith', role: 'teacher', day: utcDay(2), calls: 5, limit: 400, override: null },
    ]);
    expect(screen.getByText('No AI calls yet today.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('surfaces load failures as a toast instead of crashing', async () => {
    vi.mocked(quotaService.fetchUsageReport).mockRejectedValue(
      new Error('Could not load the usage report: boom')
    );
    render(<UsageDashboard isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Could not load the usage report: boom', 'error')
    );
  });
});
