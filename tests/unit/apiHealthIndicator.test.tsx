import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ApiStatus } from '../../services/aiCore';

/**
 * The corner health dot and the full blocked banner both read the same circuit
 * breaker. The breaker sets `state: 'BLOCKED'` and `isBlocked: true` together,
 * so when blocked the banner is always on screen — the dot must NOT also render
 * a duplicate "see banner" tooltip that no touch user can reach. It covers
 * HEALTHY and DEGRADED only, and exposes its state to assistive tech.
 */

const mockStatus = vi.fn<() => ApiStatus>();

vi.mock('../../hooks/useApiStatus', () => ({
  useApiStatus: () => mockStatus(),
}));

vi.mock('../../services/geminiService', () => ({
  ERROR_THRESHOLD: 5,
}));

import ApiHealthIndicator from '../../components/ApiHealthIndicator';

const status = (over: Partial<ApiStatus>): ApiStatus => ({
  state: 'HEALTHY',
  errorCount: 0,
  isBlocked: false,
  blockedUntil: 0,
  ...over,
});

beforeEach(() => mockStatus.mockReset());
afterEach(cleanup);

describe('ApiHealthIndicator', () => {
  it('renders a healthy dot that announces its state', () => {
    mockStatus.mockReturnValue(status({ state: 'HEALTHY' }));
    render(<ApiHealthIndicator />);
    const dot = screen.getByRole('status');
    expect(dot.getAttribute('aria-label')).toBe('API Connection: Healthy');
  });

  it('announces the recent error count when degraded (not tooltip-only)', () => {
    mockStatus.mockReturnValue(status({ state: 'DEGRADED', errorCount: 3 }));
    render(<ApiHealthIndicator />);
    const dot = screen.getByRole('status');
    // The count is in an accessible name, reachable without hover/pointer.
    expect(dot.getAttribute('aria-label')).toContain('3/5 recent errors');
  });

  it('renders nothing when blocked — the banner owns that state', () => {
    mockStatus.mockReturnValue(status({ state: 'BLOCKED', isBlocked: true, blockedUntil: Date.now() + 60000 }));
    const { container } = render(<ApiHealthIndicator />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
