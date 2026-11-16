import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The one-off unlock dialog (components/CourseUnlockModal.tsx). It names the course,
 * shows the price from live prices (or the fallback), starts checkout, and turns each
 * refusal code into its own outcome.
 */

const startCheckoutMock = vi.fn();
const loadOwnedMock = vi.fn();
let livePrice: { amount: number; currency: 'aud'; display: string; taxBehavior: string } | null =
  null;

vi.mock('../../services/courseAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/courseAccess')>();
  return {
    ...actual,
    startCourseUnlockCheckout: (...args: unknown[]) => startCheckoutMock(...args),
    loadOwnedCourseUnlocks: (...args: unknown[]) => loadOwnedMock(...args),
  };
});

vi.mock('../../hooks/useLivePrices', () => ({
  useCourseUnlockPrice: () => livePrice,
}));

import CourseUnlockModal from '../../components/CourseUnlockModal';

const student: User = {
  username: 'student-1',
  role: 'user',
  displayName: 'Student',
  preferences: {},
  stats: {},
} as unknown as User;

const showToast = vi.fn();
const onClose = vi.fn();
const onIncluded = vi.fn();

const renderModal = (overrides: Partial<React.ComponentProps<typeof CourseUnlockModal>> = {}) =>
  render(
    <CourseUnlockModal
      isOpen
      onClose={onClose}
      courseId="course-chem"
      courseName="Chemistry"
      user={student}
      showToast={showToast}
      onIncluded={onIncluded}
      {...overrides}
    />
  );

beforeEach(() => {
  startCheckoutMock.mockReset();
  startCheckoutMock.mockResolvedValue({ url: null, error: 'stubbed', code: null, status: 500 });
  loadOwnedMock.mockReset();
  loadOwnedMock.mockResolvedValue(new Set());
  showToast.mockReset();
  onClose.mockReset();
  onIncluded.mockReset();
  livePrice = { amount: 20, currency: 'aud', display: 'A$20', taxBehavior: 'inclusive' };
});

afterEach(cleanup);

describe('CourseUnlockModal: what it says', () => {
  it('is a labelled dialog that names the course', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Unlock Chemistry' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Marking and feedback for every question in Chemistry.')).toBeTruthy();
  });

  it('shows the live price with its GST note, and offers to unlock for it', () => {
    renderModal();
    expect(screen.getByText('One-off payment of A$20 incl. GST.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock for A$20' })).toBeTruthy();
  });

  it('says the plan still sets daily limits', () => {
    renderModal();
    expect(screen.getByText('Your plan still sets your daily limits on marking.')).toBeTruthy();
  });

  it('falls back to "a small one-off fee" when no price has arrived', () => {
    livePrice = null;
    renderModal();
    expect(screen.getByText('A small one-off fee, paid once.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock for a small one-off fee' })).toBeTruthy();
  });

  it('offers no purchase to a guest, who needs an account first', () => {
    renderModal({ user: { ...student, role: 'guest' } as User });
    expect(screen.getByText(/Create a free account first/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlock for/ })).toBeNull();
  });

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CourseUnlockModal: closing', () => {
  it('closes on Escape, on the close button and on "Not now"', () => {
    renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('CourseUnlockModal: starting checkout', () => {
  it('starts checkout for this course and shows it is opening', async () => {
    startCheckoutMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/c/1',
      error: null,
      code: null,
      status: 200,
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for A$20' }));
    expect(startCheckoutMock).toHaveBeenCalledWith('course-chem');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Opening checkout…' })).toBeTruthy()
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it('treats course_included as "already yours": closes and carries on with the marking', async () => {
    startCheckoutMock.mockResolvedValue({
      url: null,
      error: 'Included.',
      code: 'course_included',
      status: 409,
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for A$20' }));
    await waitFor(() => expect(onIncluded).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('treats course_already_unlocked as a stale picker: refreshes, says so, closes', async () => {
    startCheckoutMock.mockResolvedValue({
      url: null,
      error: 'Already.',
      code: 'course_already_unlocked',
      status: 409,
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for A$20' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(loadOwnedMock).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('You already have Chemistry unlocked.', 'info');
    expect(onIncluded).not.toHaveBeenCalled();
  });

  it('says unlocks are not available when the server has them off (404)', async () => {
    startCheckoutMock.mockResolvedValue({
      url: null,
      error: 'Off.',
      code: 'course_unlocks_disabled',
      status: 404,
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for A$20' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('Course unlocks are not available right now.', 'info');
  });

  it('reports any other failure as an error toast and stays open for another try', async () => {
    startCheckoutMock.mockResolvedValue({
      url: null,
      error: 'Stripe is busy.',
      code: null,
      status: 502,
    });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock for A$20' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Stripe is busy.', 'error'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unlock for A$20' })).toBeTruthy();
  });
});
