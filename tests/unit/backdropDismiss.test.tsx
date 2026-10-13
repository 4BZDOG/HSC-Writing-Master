import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss';

/**
 * Both info modals used to close on any click that landed on the scrim. Selecting
 * a sentence in the verb sheet and releasing the mouse over the backdrop is such a
 * click, so the sheet closed while the student was still copying. The rule is that
 * a press must begin AND end on the backdrop.
 */

afterEach(cleanup);

const Probe: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => {
  const backdrop = useBackdropDismiss(onDismiss);
  return (
    <div data-testid="backdrop" {...backdrop}>
      <div data-testid="panel" onClick={(e) => e.stopPropagation()}>
        <p>Some definition the student is selecting</p>
      </div>
    </div>
  );
};

describe('useBackdropDismiss', () => {
  it('closes on a press that starts and ends on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Probe onDismiss={onDismiss} />);
    const backdrop = screen.getByTestId('backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not close when a selection starts inside the panel and is released on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Probe onDismiss={onDismiss} />);
    // The click the browser fires for this gesture targets the common ancestor,
    // which is the backdrop: the bug was reading that as "the user clicked outside".
    fireEvent.mouseDown(screen.getByText('Some definition the student is selecting'));
    fireEvent.mouseUp(screen.getByTestId('backdrop'));
    fireEvent.click(screen.getByTestId('backdrop'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not close when a press starts on the backdrop and is released inside the panel', () => {
    const onDismiss = vi.fn();
    render(<Probe onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByTestId('backdrop'));
    fireEvent.mouseUp(screen.getByTestId('panel'));
    fireEvent.click(screen.getByTestId('backdrop'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not close on a click inside the panel', () => {
    const onDismiss = vi.fn();
    render(<Probe onDismiss={onDismiss} />);
    const text = screen.getByText('Some definition the student is selecting');
    fireEvent.mouseDown(text);
    fireEvent.mouseUp(text);
    fireEvent.click(text);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('forgets an earlier press once its click has been handled', () => {
    const onDismiss = vi.fn();
    render(<Probe onDismiss={onDismiss} />);
    const backdrop = screen.getByTestId('backdrop');
    fireEvent.mouseDown(screen.getByText('Some definition the student is selecting'));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    // A later click that only touches the backdrop is a fresh press, and it closes.
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
