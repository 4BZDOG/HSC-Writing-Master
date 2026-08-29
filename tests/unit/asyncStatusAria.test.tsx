import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import BackgroundTaskIndicator from '../../components/BackgroundTaskIndicator';
import LoadingIndicator from '../../components/LoadingIndicator';
import type { BackgroundTask } from '../../types';

/**
 * Accessibility fixes on async status surfaces (F6, F8):
 *  - BackgroundTaskIndicator must announce task status changes via a live
 *    region, matching Toast / ApiStatusIndicator.
 *  - LoadingIndicator must expose exactly one live region — the redundant
 *    nested aria-live on the phase checklist has been removed to avoid
 *    double-announcing on each phase change.
 */

const makeTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  id: 'task-1',
  name: 'Importing course',
  status: 'running',
  progress: 42,
  message: 'Processing prompts...',
  ...overrides,
});

describe('BackgroundTaskIndicator live-region semantics (F6)', () => {
  afterEach(cleanup);

  it('exposes role="status" and a polite live region when a task is active', () => {
    render(<BackgroundTaskIndicator task={makeTask()} />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('escalates to an assertive alert region for the error state', () => {
    render(
      <BackgroundTaskIndicator task={makeTask({ status: 'error', error: 'Import failed.' })} />
    );

    const region = screen.getByRole('alert');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('renders nothing (and no live region) when there is no task', () => {
    const { container } = render(<BackgroundTaskIndicator task={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('LoadingIndicator single live region (F8)', () => {
  afterEach(cleanup);

  it('renders exactly one aria-live region and not on the phase list', () => {
    const { container } = render(<LoadingIndicator message="Marking response" task="evaluation" />);

    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);

    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list?.hasAttribute('aria-live')).toBe(false);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });
});
