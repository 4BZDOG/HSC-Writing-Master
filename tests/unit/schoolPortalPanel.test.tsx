import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The school licence panel's manage button for staff. A colleague who did not
 * buy the licence must be able to open the school's billing portal, and the
 * request must say it is for the school: `scope: 'school'` on the body. A
 * personal request keeps the body it always had, with no scope at all.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    monetisationEnabled: () => true,
    get STRIPE_PRICE_IDS() {
      return { school: 'price_school' };
    },
  };
});

import SchoolLicencePanel from '../../components/SchoolLicencePanel';
import { createPortalUrl } from '../../services/entitlements';

/** A teacher at a school whose licence someone else bought. */
const colleague = {
  username: 'colleague',
  role: 'teacher',
  schoolId: 'school-1',
  schoolName: 'Hills High',
  stripePlan: 'school',
  stats: {},
} as unknown as User;

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

/** The body the portal request sent, parsed. */
const sentBody = (fetchMock: Mock): Record<string, unknown> => {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
};

beforeEach(() => {
  // A refused portal keeps the page where it is, so no navigation is attempted
  // in jsdom. The refusal's sentence is what the test reads back.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      jsonResponse(404, { error: 'Your school does not have a licence to manage yet.' })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('the school licence panel: a colleague manages the school licence', () => {
  it('draws the manage button enabled for a colleague who did not buy the licence', () => {
    render(<SchoolLicencePanel user={colleague} showToast={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Manage school licence' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.className).toMatch(/min-h-11/);
  });

  it('posts scope school, so the server opens the school’s customer', async () => {
    render(<SchoolLicencePanel user={colleague} showToast={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage school licence' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url] = (fetch as Mock).mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/customer-portal$/);
    expect(sentBody(fetch as Mock)).toMatchObject({ scope: 'school' });
  });

  it('shows the server’s plain sentence when the school has no licence to manage', async () => {
    render(<SchoolLicencePanel user={colleague} showToast={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage school licence' }));

    expect(
      await screen.findByText('Your school does not have a licence to manage yet.')
    ).toBeTruthy();
    // The button is back, so the colleague can try again.
    expect(
      (screen.getByRole('button', { name: 'Manage school licence' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('keeps the manage button after the server refuses a purchase because the licence is held', async () => {
    // A teacher whose school holds a licence they did not see in their plan yet.
    // The purchase is refused with `school_licence_held`; the panel then shows
    // the server's sentence and no buy button, and the manage button stays.
    const notYetCovered = { ...colleague, stripePlan: 'free' } as User;
    (fetch as Mock).mockResolvedValueOnce(
      jsonResponse(409, {
        error: 'Your school already has a School licence. Ask whoever bought it to add seats.',
        code: 'school_licence_held',
      })
    );
    render(<SchoolLicencePanel user={notYetCovered} showToast={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Buy \d+ seats/ }));

    expect(await screen.findByText(/Your school already has a School licence/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buy \d+ seats/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage school licence' })).toBeTruthy();
  });
});

describe('createPortalUrl: the scope on the wire', () => {
  it('sends no scope for a personal request, so the body is unchanged', async () => {
    await createPortalUrl();

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = sentBody(fetch as Mock);
    expect(body).not.toHaveProperty('scope');
    expect(body).toHaveProperty('returnUrl');
  });

  it('sends scope school when asked for the school', async () => {
    await createPortalUrl('school');

    expect(sentBody(fetch as Mock)).toMatchObject({ scope: 'school' });
  });
});
