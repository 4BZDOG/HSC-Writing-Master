import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import AiBusyOverlay from '../../components/AiBusyOverlay';
import Editor from '../../components/Editor';
import EvaluationProgressBar from '../../components/EvaluationProgressBar';
import type { PromptVerb } from '../../types';

/**
 * Where a wait veil sits, and what it covers.
 *
 * The veil used to be a wrapper around the whole writing card, so its blur
 * sampled the 2px border and washed the header to ghost-white. It is now laid
 * inside the card, under the header. These pin that placement: inside the
 * border, under the header, on the card's inner radius, and swallowing
 * pointer events. The class strings are the contract, because the visual
 * result is only checkable in a browser (see the writing-edges screenshots).
 */

afterEach(cleanup);

const WRITING_HEADER = '[class*="rounded-t-surface-inner"]';

const renderEditorWithWait = () =>
  render(
    <Editor
      value=""
      onChange={vi.fn()}
      verb={'DESCRIBE' as PromptVerb}
      writingMode="coach"
      busyOverlay={<div data-testid="busy" />}
    />
  );

describe('the writing card wait veil', () => {
  it('sits inside the card, after the header, and never inside the header', () => {
    const { container } = renderEditorWithWait();
    const card = container.firstElementChild as HTMLElement;
    const header = container.querySelector(WRITING_HEADER) as HTMLElement;
    const busy = screen.getByTestId('busy');

    expect(card.contains(busy)).toBe(true);
    expect(header.contains(busy)).toBe(false);
    expect(header.compareDocumentPosition(busy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('covers the definition row, the writing well and the footer, through one box', () => {
    const { container } = renderEditorWithWait();
    const busy = screen.getByTestId('busy');
    const wrapper = busy.parentElement as HTMLElement;
    const footer = container.querySelector('[class*="rounded-b-surface-inner"]') as HTMLElement;

    // The wrapper is the box the veil is laid in: it starts under the header
    // and ends at the card's inner bottom edge, so the veil is centred on the
    // visible body and not on the whole card.
    expect(wrapper.className).toContain('relative');
    expect(wrapper.contains(footer)).toBe(true);
    expect(wrapper.contains(container.querySelector(WRITING_HEADER) as HTMLElement)).toBe(false);
  });

  it('leaves the 2px card border outside the veil by clipping the card to its padding edge', () => {
    const { container } = renderEditorWithWait();
    const card = container.firstElementChild as HTMLElement;

    // `border-2` is the width the inner radius is computed from, and
    // `overflow-hidden` is what clips the veil's bottom corners to that edge.
    expect(card.className).toContain('border-2');
    expect(card.className).toContain('overflow-hidden');
    expect(card.className).toContain('rounded-surface');
  });

  it('carries the real marking wait, with the shared veil recipe', () => {
    const { container } = render(
      <Editor
        value=""
        onChange={vi.fn()}
        verb={'DESCRIBE' as PromptVerb}
        writingMode="coach"
        busyOverlay={<EvaluationProgressBar />}
      />
    );
    const status = screen.getByRole('status');
    const header = container.querySelector(WRITING_HEADER) as HTMLElement;

    expect(container.firstElementChild?.contains(status)).toBe(true);
    expect(header.contains(status)).toBe(false);
  });
});

describe('AiBusyOverlay', () => {
  it('renders nothing while it is not showing', () => {
    const { container } = render(
      <AiBusyOverlay show={false}>
        <p>wait</p>
      </AiBusyOverlay>
    );
    expect(container.innerHTML).toBe('');
  });

  it('inherits its radius from the box it sits in by default', () => {
    const { container } = render(
      <AiBusyOverlay show>
        <p>wait</p>
      </AiBusyOverlay>
    );
    expect((container.firstElementChild as HTMLElement).className).toContain('rounded-[inherit]');
  });

  it('takes an explicit inner radius in place of the inherited one', () => {
    const { container } = render(
      <AiBusyOverlay show rounded="rounded-b-surface-inner">
        <p>wait</p>
      </AiBusyOverlay>
    );
    const veil = container.firstElementChild as HTMLElement;
    expect(veil.className).toContain('rounded-b-surface-inner');
    expect(veil.className).not.toContain('rounded-[inherit]');
  });

  it('tints with the surface token, not a literal white', () => {
    const { container } = render(
      <AiBusyOverlay show>
        <p>wait</p>
      </AiBusyOverlay>
    );
    const veil = container.firstElementChild as HTMLElement;
    expect(veil.className).toContain('bg-surface/80');
    expect(veil.className).not.toMatch(/(^|\s)bg-white(\s|$)/);
  });

  it('swallows pointer events, so nothing under the veil can be clicked', () => {
    const { container } = render(
      <AiBusyOverlay show>
        <p>wait</p>
      </AiBusyOverlay>
    );
    const veil = container.firstElementChild as HTMLElement;
    expect(veil.className).not.toContain('pointer-events-none');
    expect(veil.className).toContain('cursor-wait');
  });
});
