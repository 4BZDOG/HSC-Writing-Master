import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

/**
 * A message about something you would want to act on should let you act on it.
 *
 * Several flows ended in a toast describing exactly the next thing — "Merged
 * into HSC Physics", "84 syllabus points have no question yet" — with no way to
 * get there. That is what pushed the starter-questions offer into being a modal
 * that opened itself at the user, which is a heavy way to ask a question whose
 * answer is often "not now".
 */

afterEach(cleanup);

describe('a toast with something to do', () => {
  it('runs the action and dismisses itself', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <Toast message="84 syllabus points have no question yet." onClose={onClose} action={{ label: 'Write starter questions', onClick }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Write starter questions' }));

    expect(onClick).toHaveBeenCalledOnce();
    // Leaving it counting down over whatever the action just opened is noise.
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has no action button when there is nothing to do', () => {
    render(<Toast message="Saved." onClose={vi.fn()} />);
    // Only the dismiss control.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('how long a toast stays', () => {
  it('gives an actionable one longer than a plain one', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('Saved.', 'success'));
    const plain = result.current.toast!.durationMs;

    act(() =>
      result.current.showToast('Merged into "HSC Physics".', 'success', {
        label: 'Go to it',
        onClick: vi.fn(),
      })
    );
    const actionable = result.current.toast!.durationMs;

    // Five seconds is fine for "Saved."; it is not enough time to read an
    // offer, decide, and reach for the button.
    expect(actionable).toBeGreaterThan(plain);
  });

  it('carries the action through to the toast it stores', () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showToast('Done.', 'info', { label: 'Go to it', onClick }));

    expect(result.current.toast?.action?.label).toBe('Go to it');
  });
});
