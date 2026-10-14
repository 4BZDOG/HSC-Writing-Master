import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * Can a teacher in a school with no licence actually reach the invoice form?
 *
 * The profile's dead help rows were the class of bug this guards against: each
 * button rendered, looked right, and did nothing a person could use. So this
 * test does not render the form. It starts where a teacher starts, on the
 * profile, presses Compare Plans, opens the disclosure, sends the form, and
 * reads the state that comes back. Only the network and the database are
 * stubbed; the components are the real ones.
 */

// Each test walks the whole profile route, which is slower than a unit test
// when the machine is busy. A five-second timeout made it flaky under load.
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

let priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
let selling = true;

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    get STRIPE_PRICE_IDS() {
      return priceIds;
    },
    monetisationEnabled: () => selling,
  };
});

vi.mock('../../services/planPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/planPolicy')>();
  return { ...actual, monetisationEnabled: () => selling };
});

// The school has no licence and no request of its own yet: the state a first
// request starts from. The database is not needed to prove the route.
vi.mock('../../services/licenceRequestService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/licenceRequestService')>();
  return { ...actual, fetchMyLicenceRequests: async () => [] };
});

import UserProfileModal from '../../components/UserProfileModal';
import QuickStartModal from '../../components/QuickStartModal';

const teacher = (): User =>
  ({
    username: 'ms-teacher',
    displayName: 'Ms Teacher',
    role: 'teacher',
    stats: {},
    preferences: {},
  }) as unknown as User;
const student = (): User =>
  ({
    username: 'a-student',
    displayName: 'A Student',
    role: 'user',
    stats: {},
    preferences: {},
  }) as unknown as User;

/**
 * The same hand-off AppModals makes: the profile's Compare Plans closes the
 * profile and opens the guide on its plans tab.
 */
const Harness: React.FC<{ user: User }> = ({ user }) => {
  const [view, setView] = useState<'profile' | 'plans'>('profile');
  return (
    <>
      <UserProfileModal
        isOpen={view === 'profile'}
        onClose={() => setView('profile')}
        user={user}
        onUpdateUser={() => {}}
        onLogout={() => {}}
        onComparePlans={() => setView('plans')}
      />
      <QuickStartModal
        isOpen={view === 'plans'}
        onClose={() => setView('profile')}
        user={user}
        onOpenLegal={() => {}}
        showToast={() => {}}
        initialTab="plans"
      />
    </>
  );
};

const fetchMock = vi.fn();

/** The profile keeps Compare Plans under its Settings tab, as a person finds it. */
const openComparePlans = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(await screen.findByRole('button', { name: /Compare Plans/ }));
};

beforeEach(() => {
  priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: 'price_school' };
  selling = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/api/request-invoice')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          request: {
            id: 'req-1',
            status: 'pending',
            seats: 30,
            billing_name: 'Parramatta High School',
            billing_email: 'accounts@school.edu.au',
            billing_address: {
              line1: '1 Test Street',
              line2: null,
              city: 'Parramatta',
              state: 'NSW',
              postcode: '2150',
              country: 'AU',
            },
            abn: null,
            po_number: null,
            note: null,
            decided_at: null,
            decision_note: null,
            hosted_invoice_url: null,
            created_at: '2026-10-14T01:00:00.000Z',
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'Not found.' }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('a teacher in a school with no licence', () => {
  it('reaches the invoice form from the profile and sends it', async () => {
    render(<Harness user={teacher()} />);

    await openComparePlans();

    const disclosure = await screen.findByRole('button', {
      name: /Pay by invoice or purchase order/,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');

    fireEvent.change(await screen.findByLabelText('Name on the invoice'), {
      target: { value: 'Parramatta High School' },
    });
    fireEvent.change(screen.getByLabelText('Accounts email'), {
      target: { value: 'accounts@school.edu.au' },
    });
    fireEvent.change(screen.getByLabelText('Street address'), {
      target: { value: '1 Test Street' },
    });
    fireEvent.change(screen.getByLabelText('Suburb or town'), { target: { value: 'Parramatta' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'NSW' } });
    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '2150' } });

    fireEvent.click(screen.getByRole('button', { name: 'Request an invoice for 30 seats' }));

    expect(await screen.findByText('Invoice request received')).toBeTruthy();
    const posted = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/request-invoice')
    );
    expect(posted).toBeTruthy();
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({
      seats: 30,
      billingName: 'Parramatta High School',
      billingEmail: 'accounts@school.edu.au',
    });
    await waitFor(() => expect(screen.queryByLabelText('Name on the invoice')).toBeNull());
  });

  it('is offered the form at the default seat count, the one the card button shows', async () => {
    render(<Harness user={teacher()} />);
    await openComparePlans();
    fireEvent.click(
      await screen.findByRole('button', { name: /Pay by invoice or purchase order/ })
    );
    expect(
      await screen.findByRole('button', { name: 'Request an invoice for 30 seats' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buy 30 seats' })).toBeTruthy();
  });

  it('is not offered the form on a deployment that does not sell school licences', async () => {
    priceIds = { plus_monthly: 'price_m', plus_yearly: 'price_y', school: '' };
    render(<Harness user={teacher()} />);
    await openComparePlans();
    // With no School price the panel is the enquiry route, and no invoice route is drawn.
    expect(await screen.findByText(/Ask about a school licence/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pay by invoice or purchase order/ })).toBeNull();
    expect(screen.queryByText(/Invoices and purchase orders are accepted/)).toBeNull();
  });

  it('is not offered the form when the switch is off, and the server is not asked', async () => {
    vi.stubEnv('VITE_SCHOOL_INVOICE_ENABLED', 'false');
    render(<Harness user={teacher()} />);
    await openComparePlans();
    await screen.findByRole('button', { name: /Buy 30 seats/ });
    expect(screen.queryByRole('button', { name: /Pay by invoice or purchase order/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a student', () => {
  it('is told that invoices exist for schools, and is not given the form', async () => {
    render(<Harness user={student()} />);
    await openComparePlans();
    expect(await screen.findByText(/A teacher or admin at the school asks for one/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pay by invoice or purchase order/ })).toBeNull();
  });
});
