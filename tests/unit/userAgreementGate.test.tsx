import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import UserAgreementModal from '../../components/UserAgreementModal';
import type { User } from '../../types';
import { AGREEMENT_VERSION } from '../../data/legalContent';

/**
 * The gate is the one dialog in the app that stands between a user and
 * everything else, so its failure modes are the expensive kind: a consent
 * button that can be clicked without consenting, a blocking dialog with no way
 * out, or a guest being made to sign something that records nothing.
 */

afterEach(cleanup);

const makeUser = (overrides: Partial<User> = {}): User => ({
  username: 'student@example.com',
  role: 'user',
  displayName: 'Student',
  preferences: {
    defaultFocusMode: false,
    autoSave: true,
    highContrast: false,
    showTips: true,
    theme: 'dark',
  },
  stats: {
    xp: 0,
    level: 1,
    questionsAnswered: 0,
    totalWordsWritten: 0,
    averageBand: 0,
    lastActive: Date.now(),
    streakDays: 1,
  },
  ...overrides,
});

const renderGate = (user: User) => {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  const onLogout = vi.fn();
  render(
    <UserAgreementModal
      user={user}
      onAccept={onAccept}
      onDismiss={onDismiss}
      onLogout={onLogout}
    />
  );
  return { onAccept, onDismiss, onLogout };
};

describe('the agreement gate', () => {
  it('will not accept until the user actually ticks the box', () => {
    const { onAccept } = renderGate(makeUser());
    const button = screen.getByRole('button', { name: /agree and continue/i });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('always offers a way out of a blocking gate', () => {
    const { onLogout } = renderGate(makeUser());
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('shows students the student charter and teachers the teacher one', () => {
    renderGate(makeUser({ role: 'user' }));
    expect(screen.getByText(/not NESA and not your teacher/i)).toBeTruthy();
    cleanup();

    renderGate(makeUser({ role: 'teacher' }));
    expect(screen.getByText(/duty of care/i)).toBeTruthy();
  });

  it('lets a guest dismiss without signing anything', () => {
    const { onDismiss, onAccept } = renderGate(makeUser({ role: 'guest' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /let me look around/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('tells a returning user what changed instead of just asking again', () => {
    renderGate(makeUser({ agreement: { version: '0.9-old', acceptedAt: Date.now() } }));
    expect(screen.getByText(/we have updated this/i)).toBeTruthy();
  });

  it('greets a first-time user with the charter, not an update notice', () => {
    renderGate(makeUser());
    expect(screen.queryByText(/we have updated this/i)).toBeNull();
    expect(screen.getByText(new RegExp(`v${AGREEMENT_VERSION}`))).toBeTruthy();
  });

  it('keeps the full terms one click away, in the same dialog', () => {
    renderGate(makeUser());
    const toggle = screen.getByRole('button', { name: /read the full terms of use/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // The reader is now mounted inline: its document switcher offers the
    // Privacy Notice alongside the Terms of Use.
    expect(screen.getAllByRole('button', { name: /privacy notice/i }).length).toBeGreaterThan(0);
  });
});
