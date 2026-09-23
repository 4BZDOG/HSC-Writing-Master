import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The account modal: the things it got wrong about a person's own account.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

const updateUserMock = vi.fn();
vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => null,
    updateUser: (...args: unknown[]) => updateUserMock(...args),
  },
}));
vi.mock('../../services/dataRightsService', () => ({
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, fetchBillingLookup: async () => ({ status: 'none' }) };
});

import UserProfileModal from '../../components/UserProfileModal';

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
      streakDays: 5,
      lastActive: Date.now(),
    },
    ...overrides,
  }) as unknown as User;

const renderModal = (props: Partial<React.ComponentProps<typeof UserProfileModal>> = {}) => {
  const onUpdateUser = props.onUpdateUser ?? vi.fn();
  const view = render(
    <UserProfileModal
      isOpen
      onClose={() => {}}
      user={makeUser()}
      onUpdateUser={onUpdateUser}
      onLogout={() => {}}
      {...props}
    />
  );
  return { ...view, onUpdateUser };
};

const openSettings = () => fireEvent.click(screen.getByRole('button', { name: /^Settings$/ }));

beforeEach(() => updateUserMock.mockReset());
afterEach(cleanup);

describe('account deletion is disarmed when the modal closes', () => {
  it('does not come back primed, with the word already typed', async () => {
    // The confirmation was reset by the Cancel button and by nothing else. So
    // a student who armed it, typed DELETE, thought better of it and pressed
    // Close came back to an open red panel with "Delete permanently" already
    // enabled — one tap from irreversible, in a state they thought they had
    // left.
    const { rerender } = renderModal();
    openSettings();
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    expect(
      (screen.getByRole('button', { name: /delete permanently/i }) as HTMLButtonElement).disabled
    ).toBe(false);

    // Close, then open again.
    rerender(
      <UserProfileModal
        isOpen={false}
        onClose={() => {}}
        user={makeUser()}
        onUpdateUser={vi.fn()}
        onLogout={() => {}}
      />
    );
    rerender(
      <UserProfileModal
        isOpen
        onClose={() => {}}
        user={makeUser()}
        onUpdateUser={vi.fn()}
        onLogout={() => {}}
      />
    );
    openSettings();
    expect(screen.queryByRole('button', { name: /delete permanently/i })).toBeNull();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeTruthy();
  });
});

describe('renaming yourself', () => {
  it('is reachable as a button, not only by clicking a heading', () => {
    // It was an <h2 onClick>. No tab stop, no role, no accessible name — a
    // keyboard or screen-reader user could not rename themselves at all, and
    // nobody else could tell the name was editable.
    renderModal();
    expect(screen.getByRole('button', { name: /rename yourself/i })).toBeTruthy();
  });

  it('commits on Enter', async () => {
    const onUpdateUser = vi.fn();
    renderModal({ onUpdateUser });
    fireEvent.click(screen.getByRole('button', { name: /rename yourself/i }));
    const input = screen.getByLabelText(/your display name/i);
    fireEvent.change(input, { target: { value: 'Grace Hopper' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(onUpdateUser).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Grace Hopper' })
      )
    );
  });

  it('abandons on Escape and puts the real name back', () => {
    const onUpdateUser = vi.fn();
    renderModal({ onUpdateUser });
    fireEvent.click(screen.getByRole('button', { name: /rename yourself/i }));
    const input = screen.getByLabelText(/your display name/i);
    fireEvent.change(input, { target: { value: 'Typo McTypo' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onUpdateUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /rename yourself/i }).textContent).toContain(
      'Ada Lovelace'
    );
  });

  it('refuses to leave the account without a name', () => {
    const onUpdateUser = vi.fn();
    renderModal({ onUpdateUser });
    fireEvent.click(screen.getByRole('button', { name: /rename yourself/i }));
    fireEvent.change(screen.getByLabelText(/your display name/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save your name/i }));
    expect(onUpdateUser).not.toHaveBeenCalled();
  });

  it('saves ONLY the name', () => {
    // The tick used to call the settings save, which wrote the whole draft
    // preferences object with it.
    const onUpdateUser = vi.fn();
    renderModal({ onUpdateUser });
    fireEvent.click(screen.getByRole('button', { name: /rename yourself/i }));
    fireEvent.change(screen.getByLabelText(/your display name/i), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save your name/i }));
    const written = onUpdateUser.mock.calls[0][0] as User;
    expect(written.displayName).toBe('Grace');
    expect(written.preferences).toEqual(makeUser().preferences);
  });
});

describe('preference switches', () => {
  it('apply immediately, with no Save button to forget', () => {
    // They used to edit a draft that Close, Escape and a backdrop click all
    // discarded without a word — and Theme and High Contrast, whose whole
    // point is to change how the app looks, showed nothing until committed.
    const onUpdateUser = vi.fn();
    renderModal({ onUpdateUser });
    openSettings();
    fireEvent.click(screen.getByRole('switch', { name: /high contrast/i }));
    expect(onUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ highContrast: true }) })
    );
    expect(updateUserMock).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /save settings/i })).toBeNull();
  });

  it('announce what they are and whether they are on', () => {
    renderModal();
    openSettings();
    expect(
      screen
        .getByRole('switch', { name: /open questions in focus mode/i })
        .getAttribute('aria-checked')
    ).toBe('false');
    expect(
      screen.getByRole('switch', { name: /high contrast/i }).getAttribute('aria-checked')
    ).toBe('false');
  });

  /**
   * Auto-Save did nothing — drafts save as you type whatever it said — so a
   * student who switched it off believed their work was no longer being kept.
   */
  it('offers no switch for a setting the app does not honour', () => {
    renderModal();
    openSettings();
    expect(screen.queryByRole('switch', { name: /auto-save/i })).toBeNull();
  });
});

describe('what the header says', () => {
  it('names the role in English, not by its database value', () => {
    renderModal();
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.queryByText('user')).toBeNull();
  });

  it('states the level once, and measures progress through it', () => {
    // 465 XP is Level 5 with 65 of the next 100 earned. The old meter read
    // "9%" — lifetime XP over `level * 1000` — while the badge said 5.
    renderModal();
    expect(screen.getByText(/65\/100 XP to Level 6/i)).toBeTruthy();
    expect(screen.queryByText(/9%/)).toBeNull();
  });
});

describe('the average on the stats tab', () => {
  it('shows the share of the marks on offer once the profile keeps it', () => {
    const user = makeUser();
    renderModal({
      user: { ...user, stats: { ...user.stats, markShareMean: 0.9, markShareCount: 12 } },
    });
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('Avg mark')).toBeTruthy();
    expect(screen.queryByText('Avg Band')).toBeNull();
    expect(screen.getByText(/earning 90% of the marks on offer/)).toBeTruthy();
  });

  it('keeps the band average for a profile that predates it', () => {
    renderModal();
    expect(screen.getByText('Avg Band')).toBeTruthy();
  });
});
