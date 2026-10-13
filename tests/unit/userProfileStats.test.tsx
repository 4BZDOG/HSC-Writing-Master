import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import type { User } from '../../types';
import type { OwnAttempt } from '../../utils/profileHistory';

/**
 * The profile's stats tab, wired to a real attempt history: the charts draw from
 * what the read returns, a failed read is said rather than shown as an empty
 * chart, and nothing is read while the profile is closed. The history read is
 * mocked; nothing here reaches Supabase.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));
vi.mock('../../services/authService', () => ({
  authService: { getCurrentUser: () => null, updateUser: vi.fn() },
}));
vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, fetchBillingLookup: async () => ({ status: 'none' }) };
});

/**
 * A plain function, not a `vi.fn`: the spy wraps the returned promise and
 * reports a rejected one as unhandled, which is the harness, not the hook.
 */
const history = {
  calls: 0,
  attempts: [] as OwnAttempt[] | null,
  fail: false,
};
vi.mock('../../services/responseService', () => ({
  fetchMyAttemptHistory: () => {
    history.calls += 1;
    return history.fail
      ? Promise.reject(new Error('network down'))
      : Promise.resolve(history.attempts);
  },
}));

import UserProfileModal from '../../components/UserProfileModal';

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 10)).toISOString();

const sampleAttempts: OwnAttempt[] = [
  { at: day(1), band: 2, mark: 2, totalMarks: 6, verb: 'DEFINE', wordCount: 60 },
  { at: day(2), band: 3, mark: 3, totalMarks: 6, verb: 'EXPLAIN', wordCount: 110 },
  { at: day(3), band: 4, mark: 5, totalMarks: 6, verb: 'ANALYSE', wordCount: 190 },
];

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    username: 'student@example.com',
    displayName: 'Ada Lovelace',
    role: 'user',
    preferences: {
      theme: 'dark',
      defaultFocusMode: false,
      autoSave: true,
      highContrast: false,
      showTips: true,
    },
    stats: {
      xp: 465,
      level: 5,
      questionsAnswered: 39,
      totalWordsWritten: 2000,
      averageBand: 2.6,
      markShareMean: 0.9,
      markShareCount: 12,
      streakDays: 5,
      lastActive: Date.now(),
    },
    ...overrides,
  }) as unknown as User;

const renderProfile = (isOpen = true) =>
  render(
    <UserProfileModal
      isOpen={isOpen}
      onClose={() => {}}
      user={makeUser()}
      onUpdateUser={vi.fn()}
      onLogout={() => {}}
    />
  );

beforeEach(() => {
  history.calls = 0;
  history.attempts = [];
  history.fail = false;
});
afterEach(cleanup);

describe('the stats tab, fed by the attempt history', () => {
  it('draws the band chart, tier strength and recent attempts from the history', async () => {
    history.attempts = sampleAttempts;
    renderProfile();

    expect(
      await screen.findByRole('img', { name: /Band progress across 3 marked answers/ })
    ).toBeTruthy();

    const tiers = screen.getByRole('list', { name: /Share of marks earned, by command tier/ });
    expect(within(tiers).getAllByRole('listitem')).toHaveLength(6);
    // EXPLAIN at 3 of 6 marks is a 50% share on the tier-3 bar.
    expect(within(tiers).getByText('50%')).toBeTruthy();

    const recent = screen.getByRole('list', { name: /Recent attempts, newest first/ });
    const items = within(recent).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Band 4');
  });

  it('keeps the scoreboard figures beside the charts, each stated once', async () => {
    history.attempts = sampleAttempts;
    renderProfile();
    await screen.findByRole('img', { name: /Band progress/ });
    expect(screen.getByText('Answers marked').nextElementSibling?.textContent).toBe('39');
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('Day streak').nextElementSibling?.textContent).toBe('5');
  });

  it('says the history could not be loaded, and that the totals are unchanged', async () => {
    history.fail = true;
    renderProfile();
    await waitFor(() =>
      expect(screen.getAllByText(/Could not load your history/).length).toBeGreaterThan(0)
    );
    // The totals come from the account, not the read, so they still show.
    expect(screen.getByText('Answers marked').nextElementSibling?.textContent).toBe('39');
  });

  it('shows the no-account state when there is no history to read', async () => {
    history.attempts = null;
    renderProfile();
    await waitFor(() =>
      expect(screen.getAllByText(/not connected to one/).length).toBeGreaterThan(0)
    );
  });

  it('says the no-account state once, and draws no history cards for it', async () => {
    history.attempts = null;
    renderProfile();
    await waitFor(() =>
      expect(screen.getAllByText(/not connected to one/).length).toBeGreaterThan(0)
    );
    // One note, not the same paragraph in three empty cards.
    expect(screen.getAllByText(/not connected to one/)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Band progress' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Strength by tier' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Recent attempts' })).toBeNull();
  });

  it('says a failed read once, and draws no history cards for it either', async () => {
    history.fail = true;
    renderProfile();
    await waitFor(() =>
      expect(screen.getAllByText(/Could not load your history/).length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText(/Could not load your history/)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Band progress' })).toBeNull();
  });

  it('reads the history only while the profile is open', async () => {
    history.attempts = sampleAttempts;
    const { rerender } = renderProfile(false);
    expect(history.calls).toBe(0);
    rerender(
      <UserProfileModal
        isOpen
        onClose={() => {}}
        user={makeUser()}
        onUpdateUser={vi.fn()}
        onLogout={() => {}}
      />
    );
    await screen.findByRole('img', { name: /Band progress/ });
    expect(history.calls).toBe(1);
  });
});

describe('the achievements tab', () => {
  it('shows progress as a bar and names the unlocked ones, not as rings', async () => {
    history.attempts = sampleAttempts;
    const { container } = renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /^Achievements/ }));

    // 39 answers, 2,000 words and a 5-day streak unlock four of the eight; the
    // Centurion is 39 of 100 and reads as a bar, not a ring.
    expect(screen.getAllByText('Unlocked')).toHaveLength(4);
    expect(screen.getByText('39/100')).toBeTruthy();
    expect(screen.getByText(/Closest to unlocking:/)).toBeTruthy();
    expect(container.querySelector('[stroke-dasharray]')).toBeNull();
  });
});

describe('focus on open', () => {
  it('leaves no control with focus, so the name does not look selected', () => {
    history.attempts = sampleAttempts;
    renderProfile();
    const dialog = screen.getByRole('dialog', { name: 'Your profile' });
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: /rename yourself/i })
    );
  });

  it('holds Shift+Tab inside the dialog, handing focus to its last control', () => {
    history.attempts = sampleAttempts;
    renderProfile();
    const dialog = screen.getByRole('dialog', { name: 'Your profile' });
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });
});

describe('a total with no history behind it', () => {
  it('says so in every history view, rather than reporting no marked responses', async () => {
    history.attempts = [];
    renderProfile();
    await waitFor(() =>
      expect(
        screen.getAllByText(/Your 39 earlier answers were marked before attempt history was kept/)
          .length
      ).toBeGreaterThanOrEqual(2)
    );
    expect(screen.queryByText(/No marked responses yet/)).toBeNull();
  });
});
