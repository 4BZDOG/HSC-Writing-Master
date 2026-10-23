import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '../../types';

/**
 * The student's side of the parent link, in the profile. The child makes the
 * code, shows it with its expiry, and can copy it. Linked guardians are listed,
 * and one is removed only after an inline confirmation.
 */

const createInvite = vi.fn();
const listGuardians = vi.fn();
const removeLink = vi.fn();

vi.mock('../../services/guardianService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/guardianService')>();
  return {
    ...actual,
    guardianAvailable: () => true,
    createGuardianInvite: (...args: unknown[]) => createInvite(...args),
    listMyGuardians: (...args: unknown[]) => listGuardians(...args),
    removeGuardianLink: (...args: unknown[]) => removeLink(...args),
  };
});

import StudentGuardianSection, {
  showGuardianSection,
} from '../../components/guardian/StudentGuardianSection';

const pat = { guardianId: 'g1', displayName: 'Pat Nguyen', linkedAt: '2026-10-02T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  listGuardians.mockResolvedValue([pat]);
  createInvite.mockResolvedValue({ code: 'K7QM-4PXR', expiresAt: '2026-10-30T10:00:00Z' });
  removeLink.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StudentGuardianSection', () => {
  it('creates a link code and shows it with its expiry', async () => {
    const user = userEvent.setup();
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');

    await user.click(screen.getByRole('button', { name: 'Create a link code' }));

    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('K7QM-4PXR')).toBeTruthy();
    expect(screen.getByText(/^Expires /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  });

  it('explains what sharing the code does, in the words the product uses', async () => {
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');

    expect(screen.getByText(/see your progress and pay for your Band 6 Plus/)).toBeTruthy();
  });

  it('copies the code to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');
    await user.click(screen.getByRole('button', { name: 'Create a link code' }));
    await screen.findByText('K7QM-4PXR');

    await user.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(writeText).toHaveBeenCalledWith('K7QM-4PXR');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('shows a failed code with its reason and no code', async () => {
    const user = userEvent.setup();
    createInvite.mockRejectedValue(
      new Error('A link code could not be created. Try again in a moment.')
    );
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');

    await user.click(screen.getByRole('button', { name: 'Create a link code' }));

    expect((await screen.findByRole('alert')).textContent).toContain('could not be created');
    expect(screen.queryByText('K7QM-4PXR')).toBeNull();
  });

  it('lists the linked guardians', async () => {
    render(<StudentGuardianSection />);

    expect(await screen.findByText('Pat Nguyen')).toBeTruthy();
    expect(screen.getByText(/^Linked \d/)).toBeTruthy();
  });

  it('asks before removing a guardian, and removes only on confirmation', async () => {
    const user = userEvent.setup();
    listGuardians.mockResolvedValueOnce([pat]).mockResolvedValueOnce([]);
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');

    await user.click(screen.getByRole('button', { name: 'Remove Pat Nguyen' }));
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(/They will stop seeing your progress/)).toBeTruthy();
    expect(removeLink).not.toHaveBeenCalled();

    await user.click(within(row).getByRole('button', { name: 'Remove' }));

    expect(removeLink).toHaveBeenCalledWith('g1');
    expect(
      await screen.findByText('No parent or guardian is linked to your account.')
    ).toBeTruthy();
  });

  it('keeps the link when the removal is cancelled', async () => {
    const user = userEvent.setup();
    render(<StudentGuardianSection />);
    await screen.findByText('Pat Nguyen');

    await user.click(screen.getByRole('button', { name: 'Remove Pat Nguyen' }));
    await user.click(screen.getByRole('button', { name: 'Keep link' }));

    expect(removeLink).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Pat Nguyen' })).toBeTruthy();
  });
});

describe('showGuardianSection', () => {
  const asRole = (role: string) => ({ username: 'x', role }) as unknown as User;

  it('is for a student or a teacher with an online account', () => {
    expect(showGuardianSection(asRole('user'))).toBe(true);
    expect(showGuardianSection(asRole('teacher'))).toBe(true);
  });

  it('is never shown to a guest or to a parent, who links from the dashboard', () => {
    expect(showGuardianSection(asRole('guest'))).toBe(false);
    expect(showGuardianSection(asRole('parent'))).toBe(false);
  });
});
