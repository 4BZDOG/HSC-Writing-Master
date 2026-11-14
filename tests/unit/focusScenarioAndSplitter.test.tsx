import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PromptDisplay from '../../components/PromptDisplay';
import FocusSplitter from '../../components/FocusSplitter';
import {
  FOCUS_PROMPT_HEIGHT_KEY,
  FOCUS_PROMPT_MIN,
  FOCUS_SCENARIO_KEY,
  maxFocusPromptHeight,
  readFocusPromptHeight,
} from '../../utils/focusLayout';
import { Prompt, PromptVerb } from '../../types';

/**
 * Focus Mode's condensed question card folds its scenario to one line, and the
 * splitter between the two cards sizes the question with the keyboard and the
 * pointer. These pin both, without the full workspace around them.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
}));

const SCENARIO =
  'The Allied draft of the Treaty of Versailles was presented to the German delegation in May 1919.';

const makePrompt = (scenario?: string) =>
  ({
    id: 'p1',
    question: 'Describe the terms of the Treaty of Versailles.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    scenario,
    sampleAnswers: [],
  }) as unknown as Prompt;

const props = {
  isEnriching: false,
  enrichError: null,
  onVerbClick: vi.fn(),
  onGenerateScenario: vi.fn(),
  onUpdatePrompt: vi.fn(),
  isGeneratingScenario: false,
  generateScenarioError: null,
  courseOutcomes: [],
  onOutcomeClick: vi.fn(),
  userRole: 'user' as const,
  onDismissEnrichError: vi.fn(),
  onRunQualityCheck: vi.fn(),
  onSuggestOutcomes: vi.fn(),
  isSuggestingOutcomes: false,
  fontSize: 18,
  onFontSizeChange: vi.fn(),
};

const toggle = () => screen.getByRole('button', { name: /context scenario/i });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('Focus Mode scenario', () => {
  it('starts folded to a one-line preview, with the question still visible', () => {
    render(<PromptDisplay {...props} prompt={makePrompt(SCENARIO)} condensed />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/terms of the Treaty/);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toMatch(/Show/);
    // The preview carries the start of the scenario; the box does not render.
    expect(screen.getByText(/The Allied draft/)).toBeTruthy();
    expect(document.getElementById(toggle().getAttribute('aria-controls') ?? '')).toBeNull();
  });

  it('opens and closes the scenario, and remembers the choice', () => {
    render(<PromptDisplay {...props} prompt={makePrompt(SCENARIO)} condensed />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toMatch(/Hide/);
    const region = document.getElementById(toggle().getAttribute('aria-controls') ?? '');
    expect(region).not.toBeNull();
    expect(region?.textContent).toMatch(/Allied draft/);
    expect(window.localStorage.getItem(FOCUS_SCENARIO_KEY)).toBe('1');

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(window.localStorage.getItem(FOCUS_SCENARIO_KEY)).toBe('0');
  });

  it('opens on the next visit when the student last left it open', () => {
    window.localStorage.setItem(FOCUS_SCENARIO_KEY, '1');
    render(<PromptDisplay {...props} prompt={makePrompt(SCENARIO)} condensed />);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('is not offered when the question has no scenario', () => {
    render(<PromptDisplay {...props} prompt={makePrompt()} condensed />);
    expect(screen.queryByRole('button', { name: /context scenario/i })).toBeNull();
  });

  it('keeps the full card unchanged: the scenario is open and there is no toggle', () => {
    render(<PromptDisplay {...props} prompt={makePrompt(SCENARIO)} />);
    expect(screen.queryByRole('button', { name: /context scenario/i })).toBeNull();
    expect(screen.getByText(/Allied draft/)).toBeTruthy();
  });

  it('ignores storage that throws, falling back to folded', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      render(<PromptDisplay {...props} prompt={makePrompt(SCENARIO)} condensed />);
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('FocusSplitter', () => {
  const renderSplitter = (overrides: Partial<React.ComponentProps<typeof FocusSplitter>> = {}) => {
    const onResize = vi.fn();
    const onReset = vi.fn();
    render(
      <FocusSplitter
        valueNow={300}
        min={150}
        max={500}
        controlsId="prompt-region"
        onResize={onResize}
        onReset={onReset}
        {...overrides}
      />
    );
    return { onResize, onReset, sep: screen.getByRole('separator') };
  };

  it('exposes the separator contract', () => {
    const { sep } = renderSplitter();
    expect(sep.getAttribute('aria-orientation')).toBe('horizontal');
    expect(sep.getAttribute('aria-label')).toBe('Resize question and writing area');
    expect(sep.getAttribute('aria-valuenow')).toBe('300');
    expect(sep.getAttribute('aria-valuemin')).toBe('150');
    expect(sep.getAttribute('aria-valuemax')).toBe('500');
    expect(sep.getAttribute('aria-controls')).toBe('prompt-region');
    expect(sep.getAttribute('tabindex')).toBe('0');
  });

  it('steps with ArrowUp and ArrowDown, and jumps with Home and End', () => {
    const { onResize, sep } = renderSplitter();
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    expect(onResize).toHaveBeenLastCalledWith(324);
    fireEvent.keyDown(sep, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenLastCalledWith(276);
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(150);
    fireEvent.keyDown(sep, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(500);
  });

  it('never steps past its limits', () => {
    const { onResize, sep } = renderSplitter({ valueNow: 495 });
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    expect(onResize).toHaveBeenLastCalledWith(500);
  });

  it('ignores keys it does not handle', () => {
    const { onResize, sep } = renderSplitter();
    fireEvent.keyDown(sep, { key: 'a' });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('resets to fitting the question on double-click', () => {
    const { onReset, sep } = renderSplitter();
    fireEvent.doubleClick(sep);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('follows a pointer drag from where it started, and stops when released', () => {
    // jsdom has no pointer capture; the splitter only needs it to exist.
    const proto = Element.prototype as unknown as Record<string, unknown>;
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
    proto.hasPointerCapture = vi.fn(() => true);
    try {
      const { onResize, sep } = renderSplitter();
      // A MouseEvent carries clientY and button in jsdom; React reads the
      // pointer event type from the name, and both ends of the drag carry no
      // pointerId, so they match.
      const pointer = (type: string, clientY: number) =>
        fireEvent(
          sep,
          new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY })
        );
      pointer('pointerdown', 100);
      pointer('pointermove', 140);
      expect(onResize).toHaveBeenLastCalledWith(340);
      pointer('pointermove', 9000);
      expect(onResize).toHaveBeenLastCalledWith(500);
      pointer('pointerup', 9000);
      const calls = onResize.mock.calls.length;
      pointer('pointermove', 50);
      expect(onResize.mock.calls.length).toBe(calls);
    } finally {
      delete proto.setPointerCapture;
      delete proto.releasePointerCapture;
      delete proto.hasPointerCapture;
    }
  });
});

/**
 * A stored height is a convenience, and it can be stale: saved on a taller
 * window, or edited by hand. It is clamped on read to the range the splitter
 * allows, so a question card can never open at 10px.
 */
describe('the stored question-card height', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('reads back a height inside the splitter range', () => {
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, '300');
    expect(readFocusPromptHeight(900)).toBe(300);
  });

  it('clamps a height too small to read up to the splitter minimum', () => {
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, '10');
    expect(readFocusPromptHeight(900)).toBe(FOCUS_PROMPT_MIN);
  });

  it('clamps a height taller than the window allows down to the splitter maximum', () => {
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, '5000');
    expect(readFocusPromptHeight(900)).toBe(maxFocusPromptHeight(900));
  });

  it('treats an absent or unusable value as no choice at all', () => {
    expect(readFocusPromptHeight(900)).toBeNull();
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, 'tall');
    expect(readFocusPromptHeight(900)).toBeNull();
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, '-40');
    expect(readFocusPromptHeight(900)).toBeNull();
  });

  it('clamps against the window height when no viewport is given, as the splitter does', () => {
    window.localStorage.setItem(FOCUS_PROMPT_HEIGHT_KEY, '5000');
    expect(readFocusPromptHeight()).toBe(maxFocusPromptHeight(window.innerHeight));
  });
});
