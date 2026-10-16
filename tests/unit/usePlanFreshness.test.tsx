import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { User } from '../../types';

/**
 * The listeners behind the plan freshness check: the tab coming back to the
 * front, and the connection returning. The decisions are tested in
 * planFreshness.test.ts; here we check that the hook asks at the right moments,
 * asks nothing when it should not, and leaves nothing attached after unmount.
 */

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import { usePlanFreshness } from '../../hooks/usePlanFreshness';
import { PLAN_FRESHNESS_INTERVAL_MS } from '../../utils/planFreshness';

const member = (overrides: Partial<User> = {}): User =>
  ({
    username: 'student-a',
    role: 'user',
    preferences: {},
    stats: {},
    ...overrides,
  }) as unknown as User;

let visibility: DocumentVisibilityState = 'visible';

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  // Drop the override so other test files see the environment's own value.
  delete (document as unknown as { visibilityState?: unknown }).visibilityState;
});

const setup = (user: User | null, now: { t: number } = { t: 1_000_000 }) => {
  const refresh = vi.fn(async (u: User) => ({ ...u }) as User);
  const onChange = vi.fn();
  const notify = vi.fn();
  const rendered = renderHook(
    (props: { user: User | null }) =>
      usePlanFreshness({
        user: props.user,
        onChange,
        notify,
        refresh,
        now: () => now.t,
        intervalMs: PLAN_FRESHNESS_INTERVAL_MS,
      }),
    { initialProps: { user } }
  );
  return { ...rendered, refresh, onChange, notify, now };
};

describe('usePlanFreshness', () => {
  it('re-checks when the tab becomes visible again, once the interval has passed', async () => {
    const h = setup(member());

    h.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => setVisibility('hidden'));
    expect(h.refresh).not.toHaveBeenCalled();

    await act(async () => setVisibility('visible'));
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not re-check on a visit that is inside the throttle window', async () => {
    const h = setup(member());
    await act(async () => setVisibility('visible'));
    await act(async () => setVisibility('visible'));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('also re-checks when the connection comes back', async () => {
    const h = setup(member());
    h.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('never refreshes a guest or a signed-out visitor', async () => {
    const guest = setup(member({ role: 'guest' as never }));
    guest.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => setVisibility('visible'));
    expect(guest.refresh).not.toHaveBeenCalled();
    guest.unmount();

    const signedOut = setup(null);
    signedOut.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => setVisibility('visible'));
    expect(signedOut.refresh).not.toHaveBeenCalled();
  });

  it('reads the latest user, not the one it was first given', async () => {
    const h = setup(null);
    h.rerender({ user: member({ username: 'later-user' }) });
    h.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => setVisibility('visible'));
    expect(h.refresh).toHaveBeenCalledWith(expect.objectContaining({ username: 'later-user' }));
  });

  it('removes both listeners on unmount', async () => {
    const h = setup(member());
    h.now.t += PLAN_FRESHNESS_INTERVAL_MS;
    h.unmount();

    await act(async () => {
      setVisibility('visible');
      window.dispatchEvent(new Event('online'));
    });
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('reports a changed plan through the callbacks it was last given', async () => {
    const now = { t: 1_000_000 };
    const onChange = vi.fn();
    const notify = vi.fn();
    const refresh = vi.fn(async (u: User) => ({ ...u, stripePlan: 'school' }) as User);
    const { rerender } = renderHook(
      (props: { onChange: typeof onChange; notify: typeof notify }) =>
        usePlanFreshness({
          user: member(),
          onChange: props.onChange,
          notify: props.notify,
          refresh,
          now: () => now.t,
          intervalMs: PLAN_FRESHNESS_INTERVAL_MS,
        }),
      { initialProps: { onChange: vi.fn(), notify: vi.fn() } }
    );
    const latestNotify = vi.fn();
    rerender({ onChange, notify: latestNotify });

    now.t += PLAN_FRESHNESS_INTERVAL_MS;
    await act(async () => setVisibility('visible'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(latestNotify).toHaveBeenCalledWith(
      "Your school's licence is active — Band 6 Plus is unlocked.",
      'success'
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
