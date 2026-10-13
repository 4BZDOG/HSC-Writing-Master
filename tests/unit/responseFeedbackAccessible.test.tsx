import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ResponseFeedback from '../../components/ResponseFeedback';

/**
 * "Rate this evaluation": the controls a student and an assistive technology
 * both have to be able to use. The rating is announced as a pressed state, the
 * comment field has a name once its placeholder is gone, and the field is 16px
 * on a phone so the browser does not zoom in on it.
 */
afterEach(cleanup);

describe('rating the marking', () => {
  it('names the two ratings and says which one is pressed', () => {
    render(<ResponseFeedback onFeedbackSubmit={vi.fn()} />);

    const helpful = screen.getByRole('button', { name: 'Helpful' });
    const notHelpful = screen.getByRole('button', { name: 'Not helpful' });
    expect(helpful.getAttribute('aria-pressed')).toBe('false');
    expect(notHelpful.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(helpful);

    expect(helpful.getAttribute('aria-pressed')).toBe('true');
    expect(notHelpful.getAttribute('aria-pressed')).toBe('false');
  });

  it('gives the comment field a name that outlives its placeholder', () => {
    render(<ResponseFeedback onFeedbackSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

    const field = screen.getByRole('textbox', { name: 'How could this response be improved?' });
    expect(field.className).toContain('text-base');
    expect(field.className).toContain('sm:text-sm');
  });

  it('draws every rating control at the 44px touch target on a phone', () => {
    render(<ResponseFeedback onFeedbackSubmit={vi.fn()} />);

    for (const name of ['Helpful', 'Not helpful']) {
      const control = screen.getByRole('button', { name });
      expect(control.className).toContain('min-h-11');
      expect(control.className).toContain('min-w-11');
      expect(control.className).toContain('sm:min-h-0');
    }
  });
});
