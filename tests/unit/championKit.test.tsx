import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { User } from '../../types';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

let invoicing = false;
let priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return priceIds;
    },
    schoolInvoicingEnabled: () => invoicing,
    createCheckoutUrl: vi.fn(),
  };
});

import ChampionKit from '../../components/ChampionKit';
import SchoolLicencePanel from '../../components/SchoolLicencePanel';
import { buildLicenceNote } from '../../utils/licenceNote';

/**
 * The champion kit: a button that copies the note, a status line that says what
 * happened (and is announced), and a read-only box with the note selected when
 * the clipboard is not available or refuses.
 */

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });

const expectedNote = (schoolName?: string) =>
  buildLicenceNote({
    schoolName,
    seatPrice: 'A$4',
    // The product's own name, as LEGAL_CONFIG gives it.
    productName: 'Band 6 — HSC Writing Coach',
    invoicing: false,
    appUrl: `${window.location.origin}/`,
  });

beforeEach(() => {
  invoicing = false;
  priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
});
afterEach(() => {
  cleanup();
  setClipboard(undefined);
});

describe('the copy button', () => {
  it('copies the note and says so in the status line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ChampionKit schoolName="Hills High" />);

    fireEvent.click(screen.getByRole('button', { name: /copy a note for your admin/i }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Copied\. Paste it/)
    );
    expect(writeText).toHaveBeenCalledWith(expectedNote('Hills High'));
    // Copied, so no box is drawn: there is nothing left to copy by hand.
    expect(screen.queryByRole('textbox', { name: /note for your administrator/i })).toBeNull();
  });

  it('falls back to a selected, read-only note when the clipboard refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(<ChampionKit />);

    fireEvent.click(screen.getByRole('button', { name: /copy a note for your admin/i }));

    const box = await screen.findByRole('textbox', { name: /note for your administrator/i });
    expect((box as HTMLTextAreaElement).value).toBe(expectedNote());
    expect((box as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/not available here/i);
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('shows the same fallback when there is no clipboard at all', async () => {
    setClipboard(undefined);
    render(<ChampionKit />);

    fireEvent.click(screen.getByRole('button', { name: /copy a note for your admin/i }));

    expect(
      await screen.findByRole('textbox', { name: /note for your administrator/i })
    ).toBeTruthy();
  });

  it('draws no note before the teacher presses the button', () => {
    render(<ChampionKit />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says the invoice route only where the deployment offers it', async () => {
    invoicing = true;
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ChampionKit />);
    fireEvent.click(screen.getByRole('button', { name: /copy a note for your admin/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('by invoice against a purchase order');
  });
});

describe('where the kit appears', () => {
  const teacher = (over: Partial<User>): User =>
    ({ username: 't', role: 'teacher', stats: {}, ...over }) as unknown as User;

  it('is offered to a teacher who is not attached to a school, with no seat picker', () => {
    render(<SchoolLicencePanel user={teacher({})} showToast={vi.fn()} />);
    expect(screen.getByRole('button', { name: /copy a note for your admin/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /buy \d+ seats/i })).toBeNull();
  });

  it('is not offered to an admin with no school, who can attach their own account', () => {
    render(
      <SchoolLicencePanel
        user={{ username: 'a', role: 'admin', stats: {} } as unknown as User}
        showToast={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /copy a note for your admin/i })).toBeNull();
  });

  it('is offered to a teacher whose school licence is held by someone else', async () => {
    const { createCheckoutUrl } = await import('../../services/entitlements');
    vi.mocked(createCheckoutUrl).mockResolvedValue({
      url: null,
      error: 'Your school already has a School licence.',
      status: 409,
      code: 'school_licence_held',
    });
    render(
      <SchoolLicencePanel
        user={teacher({ schoolId: 's1', schoolName: 'Hills High' })}
        showToast={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /buy \d+ seats/i }));

    expect(await screen.findByText(/Your school already has a School licence/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy a note for your admin/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /buy \d+ seats/i })).toBeNull();
  });

  it('is not offered when the school is already covered: that is a question for whoever bought it', () => {
    render(
      <SchoolLicencePanel
        user={teacher({ schoolId: 's1', schoolName: 'Hills High', stripePlan: 'school' })}
        showToast={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /copy a note for your admin/i })).toBeNull();
  });
});
