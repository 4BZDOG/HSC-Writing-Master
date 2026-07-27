import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CommandVerbHierarchy from '../../components/CommandVerbHierarchy';
import { PromptVerb } from '../../types';

/**
 * Behavioural contract for the command verb hierarchy ribbon: it renders the
 * selected verb's detail card, the header toggle collapses/expands with a
 * correct aria-expanded state, and clicking a verb chip refocuses the ribbon.
 */

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView (used by the tier auto-scroll).
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const getToggle = () => screen.getByRole('button', { name: /command verb hierarchy reference/i });

describe('CommandVerbHierarchy', () => {
  it('renders the header and all six tier groups without a selected verb', () => {
    render(<CommandVerbHierarchy />);
    expect(screen.getByText('HSC Command Verb Hierarchy')).toBeTruthy();
    expect(screen.getByText(/Reference • 6 Bands/i)).toBeTruthy();
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the detail card (definition, band ceiling) for the current verb', () => {
    render(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    // Header chip + detail card heading both carry the verb.
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(screen.getByText('Marks')).toBeTruthy();
  });

  it('collapses and re-expands via the header toggle with aria-expanded in sync', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const toggle = getToggle();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('re-opens when the current verb changes, so a new question is explained', () => {
    const { rerender } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
  });

  // …but a collapse is a decision, and it used to be undone by the very next
  // question. The selection still follows the question; only the fold stays.
  it('stays folded once collapsed by hand, and still follows the verb', () => {
    const { rerender } = render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    fireEvent.click(getToggle());
    expect(getToggle().getAttribute('aria-expanded')).toBe('false');

    rerender(<CommandVerbHierarchy currentVerb={'EVALUATE' as PromptVerb} />);
    expect(getToggle().getAttribute('aria-expanded')).toBe('false');

    // Re-opening by hand shows the new question's verb, not the stale one.
    fireEvent.click(getToggle());
    expect(getToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('EVALUATE').length).toBeGreaterThanOrEqual(2);
  });

  it('lets a keyboard user select a tier from the card header', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const header = screen.getByRole('button', { name: /Band 1 ceiling Remember & List/i });

    expect(header.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(header);
    // Tier 1's first verb (alphabetical) becomes the active detail card.
    expect(screen.getAllByText('CALCULATE').length).toBeGreaterThanOrEqual(2);
  });

  it('selecting a verb chip moves the detail card to that verb', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    fireEvent.click(screen.getByRole('button', { name: 'IDENTIFY' }));
    expect(screen.getAllByText('IDENTIFY').length).toBeGreaterThanOrEqual(2);
  });

  // The ribbon lives below the syllabus navigator, so it is usually off screen
  // when a question is picked. `scrollIntoView` cannot be told to leave the
  // page alone: it scrolled the WINDOW down to the ribbon, dragging the reader
  // away from the question they had just chosen. Only the strip may move.
  it('scrolls its own strip rather than the page when the tier changes', () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    (Element.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;

    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'SYNTHESISE' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('cognitive timeline steps are keyboard-reachable buttons that select the tier', () => {
    render(<CommandVerbHierarchy currentVerb={'DESCRIBE' as PromptVerb} />);
    const step = screen.getByRole('button', { name: /Highlight band 6/i });
    fireEvent.click(step);
    // Tier 6's first verb (alphabetical) becomes the active detail card.
    expect(screen.getByText('Band Cap')).toBeTruthy();
    expect(step.getAttribute('aria-label')).toMatch(/Evaluate/i);
  });
});
