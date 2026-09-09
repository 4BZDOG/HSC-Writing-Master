import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, renderHook } from '@testing-library/react';
import AppHeaderToolsMenu from '../../components/AppHeaderToolsMenu';
import { useToast } from '../../hooks/useToast';
import type { User } from '../../types';
import { StorageStatus } from '../../utils/storageUtils';

/**
 * The two things a batch running behind a closed studio needs.
 *
 * Letting the studio be left mid-run made a ten-minute job that spends AI quota
 * and writes to the library invisible the moment it closed — the only sign it
 * existed was a transient notice the reader may not have been looking at. And
 * the notices themselves arrive every second or two, which a four-slot queue
 * cannot carry without starving everything else the app has to say.
 */

const admin = {
  id: 'u1',
  username: 'admin',
  displayName: 'Administrator',
  role: 'admin',
} as unknown as User;

const renderMenu = (auditRunning: boolean) =>
  render(
    <AppHeaderToolsMenu
      user={admin}
      storageStatus={'ok' as StorageStatus}
      auditRunning={auditRunning}
      openModal={vi.fn()}
      onOpenAudit={vi.fn()}
      onOpenReviewQueue={vi.fn()}
      onOpenClassInsights={vi.fn()}
      onOpenStudentProgress={vi.fn()}
      onOpenUsageDashboard={vi.fn()}
      onOpenRuntimeKeys={vi.fn()}
    />
  );

const trigger = () => screen.getByRole('button', { name: /(admin|teaching) tools/i });

afterEach(cleanup);

describe('a batch running behind a closed studio is visible in the header', () => {
  it('says nothing while nothing is running', () => {
    renderMenu(false);
    expect(trigger().getAttribute('aria-label')).toBe('Admin tools');

    fireEvent.click(trigger());
    const item = screen.getByLabelText('Content Audit Studio');
    expect(item.getAttribute('aria-describedby')).toBeNull();
    expect(item.getAttribute('title')).toBe('Content Audit Studio');
  });

  it('marks the trigger while a run is in flight, without renaming it', () => {
    renderMenu(true);

    // Everything selecting on the tool menu — the e2e specs included — matches
    // on the name, so the state has to read as a suffix rather than a rename.
    const el = trigger();
    expect(el.getAttribute('aria-label')).toBe('Admin tools — a content audit batch is running');
    expect(el.getAttribute('aria-label')).toMatch(/^Admin tools/);
  });

  it('marks the studio in the menu by describing it, not by renaming it', () => {
    renderMenu(true);
    fireEvent.click(trigger());

    // The label is the tool's NAME; a run is true right now and will not be
    // later, which is what `aria-describedby` is for.
    const item = screen.getByLabelText('Content Audit Studio');
    const describedBy = item.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Running');
    expect(item.getAttribute('title')).toBe('Content Audit Studio — Running');
  });
});

describe('a keyed toast holds one slot instead of queueing', () => {
  it('updates the notice in place, keeping its id so the countdown carries on', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('Step 1 (1 of 200)', 'success', undefined, 'run'));
    const first = result.current.toast!;
    expect(first.message).toBe('Step 1 (1 of 200)');

    act(() => result.current.showToast('Step 2 (2 of 200)', 'success', undefined, 'run'));
    const second = result.current.toast!;

    // Same toast, new words. `App` keys the visible <Toast> by id, so holding
    // the id steady is what stops the five-second countdown restarting on
    // every step and pinning the notice there for the whole run.
    expect(second.id).toBe(first.id);
    expect(second.message).toBe('Step 2 (2 of 200)');
    expect(second.durationMs).toBe(first.durationMs);
  });

  it('never grows the queue past one entry per key', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      for (let i = 1; i <= 50; i++) {
        result.current.showToast(`Step ${i}`, 'success', undefined, 'run');
      }
    });

    // Fifty steps, one slot — and the head is the latest, not the first.
    expect(result.current.toast!.message).toBe('Step 50');
    act(() => result.current.hideToast());
    expect(result.current.toast).toBeNull();
  });

  it('leaves room for everything else the app has to say', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('Step 1', 'success', undefined, 'run'));
    act(() => result.current.showToast('Your daily AI quota is nearly spent.', 'warning'));
    act(() => {
      for (let i = 2; i <= 20; i++) {
        result.current.showToast(`Step ${i}`, 'success', undefined, 'run');
      }
    });

    // The stream updated its own slot rather than pushing the warning out of a
    // four-deep queue, which is what it did before the key existed.
    act(() => result.current.hideToast());
    expect(result.current.toast!.message).toBe('Your daily AI quota is nearly spent.');
  });

  it('re-raises the slot when a notice gains an action, so the offer is reachable', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('Step 199 of 200', 'success', undefined, 'run'));
    const during = result.current.toast!;

    act(() =>
      result.current.showToast('Batch finished.', 'success', { label: 'Open studio', onClick: vi.fn() }, 'run')
    );
    const ended = result.current.toast!;

    // `Toast` reads its duration once, on mount, so keeping the id here would
    // have shown the button under whatever was left of the step notice's five
    // seconds. A new id remounts it with the fourteen an offer is given.
    expect(ended.id).not.toBe(during.id);
    expect(ended.durationMs).toBeGreaterThan(during.durationMs);
    expect(ended.action?.label).toBe('Open studio');
    // Still one slot: nothing queued up behind it.
    act(() => result.current.hideToast());
    expect(result.current.toast).toBeNull();
  });

  it('still queues normally when no key is given', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('First', 'info'));
    act(() => result.current.showToast('Second', 'info'));

    expect(result.current.toast!.message).toBe('First');
    act(() => result.current.hideToast());
    expect(result.current.toast!.message).toBe('Second');
  });
});
