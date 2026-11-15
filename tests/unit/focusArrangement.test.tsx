// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  FOCUS_ARRANGEMENT_KEY,
  FOCUS_SIDE_FRACTION_KEY,
  FOCUS_SIDE_MIN_WIDTH,
  FOCUS_SIDE_PERCENT_DEFAULT,
  FOCUS_SIDE_PERCENT_MAX,
  FOCUS_SIDE_PERCENT_MIN,
  clampFocusSidePercent,
  effectiveFocusArrangement,
  readFocusArrangement,
  readFocusSidePercent,
  writeFocusSidePercent,
} from '../../utils/focusLayout';
import { resetFocusArrangementCache } from '../../hooks/useFocusArrangement';
import FocusArrangementSwitch from '../../components/FocusArrangementSwitch';
import FocusSplitter from '../../components/FocusSplitter';

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  resetFocusArrangementCache();
  // A desktop window: jsdom's 1024px is narrower than side by side needs.
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
});

describe('Focus Mode arrangement: storage and fallbacks', () => {
  it('defaults to the stack, and ignores a value it does not know', () => {
    expect(readFocusArrangement()).toBe('stacked');
    window.localStorage.setItem(FOCUS_ARRANGEMENT_KEY, 'diagonal');
    expect(readFocusArrangement()).toBe('stacked');
    window.localStorage.setItem(FOCUS_ARRANGEMENT_KEY, 'side');
    expect(readFocusArrangement()).toBe('side');
  });

  it('draws side by side only where two columns fit', () => {
    expect(effectiveFocusArrangement('side', FOCUS_SIDE_MIN_WIDTH)).toBe('side');
    expect(effectiveFocusArrangement('side', FOCUS_SIDE_MIN_WIDTH - 1)).toBe('stacked');
    expect(effectiveFocusArrangement('wide', 900)).toBe('wide');
    // A phone has one column whatever was chosen on the desktop.
    expect(effectiveFocusArrangement('wide', 390)).toBe('stacked');
    expect(effectiveFocusArrangement('side', 390)).toBe('stacked');
  });

  it("clamps the question column's share on read and on write", () => {
    expect(readFocusSidePercent()).toBe(FOCUS_SIDE_PERCENT_DEFAULT);
    expect(clampFocusSidePercent(5)).toBe(FOCUS_SIDE_PERCENT_MIN);
    expect(clampFocusSidePercent(95)).toBe(FOCUS_SIDE_PERCENT_MAX);
    window.localStorage.setItem(FOCUS_SIDE_FRACTION_KEY, '99');
    expect(readFocusSidePercent()).toBe(FOCUS_SIDE_PERCENT_MAX);
    window.localStorage.setItem(FOCUS_SIDE_FRACTION_KEY, 'wide');
    expect(readFocusSidePercent()).toBe(FOCUS_SIDE_PERCENT_DEFAULT);
    writeFocusSidePercent(33.4);
    expect(window.localStorage.getItem(FOCUS_SIDE_FRACTION_KEY)).toBe('33');
  });
});

describe('FocusArrangementSwitch', () => {
  it('is a radio group whose choice is remembered', () => {
    render(<FocusArrangementSwitch />);
    expect(screen.getByRole('radiogroup', { name: 'Focus layout' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Stacked' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Side by side' }));
    expect(screen.getByRole('radio', { name: 'Side by side' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(window.localStorage.getItem(FOCUS_ARRANGEMENT_KEY)).toBe('side');
  });

  it('moves with the arrow keys, one tab stop for the group', () => {
    render(<FocusArrangementSwitch />);
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Wide' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Stacked' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
  });
});

describe('FocusSplitter, between two columns', () => {
  const setup = () => {
    const onResize = vi.fn();
    const onReset = vi.fn();
    render(
      <FocusSplitter
        orientation="vertical"
        valueNow={40}
        min={FOCUS_SIDE_PERCENT_MIN}
        max={FOCUS_SIDE_PERCENT_MAX}
        controlsId="q"
        onResize={onResize}
        onReset={onReset}
      />
    );
    return { onResize, onReset, bar: screen.getByRole('separator') };
  };

  it('is a vertical separator that reports its share', () => {
    const { bar } = setup();
    expect(bar.getAttribute('aria-orientation')).toBe('vertical');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuetext')).toContain('40%');
  });

  it('steps with left and right, and stops at its limits', () => {
    const { bar, onResize, onReset } = setup();
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(42);
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(38);
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(FOCUS_SIDE_PERCENT_MIN);
    fireEvent.keyDown(bar, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(FOCUS_SIDE_PERCENT_MAX);
    // Up and down belong to the horizontal splitter.
    onResize.mockClear();
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.doubleClick(bar);
    expect(onReset).toHaveBeenCalled();
  });
});
