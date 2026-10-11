import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import HowToAnswer from '../../components/HowToAnswer';
import type { PromptVerb } from '../../types';

/**
 * The how-to-answer method card. Its verbs are chosen from the command-term
 * data for the shape each one exercises: DISTINGUISH has two method steps,
 * EXPLAIN a term list, COMPARE a template, and DESCRIBE a lead with a cost and
 * nothing else.
 */

afterEach(cleanup);

const trigger = () => screen.getByRole('button', { name: /how to answer a .* question/i });
const card = () => document.getElementById(trigger().getAttribute('aria-controls') ?? '');

/** A controlled wrapper, so the open state behaves as it does in the editor. */
const Harness: React.FC<{
  verb: PromptVerb;
  read?: boolean;
  onToggle?: () => void;
  initiallyOpen?: boolean;
}> = ({ verb, read = false, onToggle, initiallyOpen = false }) => {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <HowToAnswer
      verb={verb}
      open={open}
      read={read}
      onToggle={() => {
        onToggle?.();
        setOpen((o) => !o);
      }}
    />
  );
};

describe('HowToAnswer', () => {
  describe('the trigger', () => {
    it('is a labelled control that names the verb, and says whether it is open', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} />);

      // The visible words stay on the button at every width.
      expect(trigger().textContent).toContain('How to answer');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(trigger().getAttribute('aria-controls')).toBeTruthy();
    });

    it('shows the definition beside the verb, outside the control', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} />);

      const meaning = screen.getByText('Provide characteristics and features.');
      expect(meaning.closest('button')).toBeNull();
    });

    it('calls onToggle when pressed', () => {
      const onToggle = vi.fn();
      render(<Harness verb={'DESCRIBE' as PromptVerb} onToggle={onToggle} />);

      fireEvent.click(trigger());
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });

    it('marks the card read once it has been opened and shut again', () => {
      const { rerender } = render(<Harness verb={'DESCRIBE' as PromptVerb} read />);
      expect(screen.getByText(/^Read$/i)).toBeTruthy();

      rerender(<Harness verb={'DESCRIBE' as PromptVerb} read={false} />);
      expect(screen.queryByText(/^Read$/i)).toBeNull();
    });
  });

  describe('the card', () => {
    it('is inert while shut, so nothing in it can be reached', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} />);
      expect(card()?.hasAttribute('inert')).toBe(true);
    });

    it('is reachable once open', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} initiallyOpen />);
      expect(card()?.hasAttribute('inert')).toBe(false);
    });

    it('is always mounted, so opening it does not shift the writing area', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} />);
      expect(card()).not.toBeNull();
    });
  });

  describe('the method stepper', () => {
    it('numbers the lead move 1 and each further step after it', () => {
      render(<Harness verb={'DISTINGUISH' as PromptVerb} initiallyOpen />);

      const steps = card()!.querySelector('ol') as HTMLElement;
      const items = Array.from(steps.querySelectorAll(':scope > li'));
      expect(items.length).toBe(2);
      expect(items.map((li) => li.querySelector('span')?.textContent)).toEqual(['1', '2']);
      expect(items[1].textContent).toContain('Make each difference unmistakable and precise.');
    });

    it('sets the lead at reading size and the later steps a step down', () => {
      render(<Harness verb={'DISTINGUISH' as PromptVerb} initiallyOpen />);

      const items = Array.from(card()!.querySelectorAll('ol > li'));
      const lead = items[0].querySelector('p') as HTMLElement;
      const step = items[1].querySelector('p') as HTMLElement;
      expect(lead.className).toContain('text-base');
      expect(step.className).toContain('text-sm');
    });

    it('takes the question tier colour through the band system, not a literal', () => {
      render(<Harness verb={'DISTINGUISH' as PromptVerb} initiallyOpen />);

      const marker = card()!.querySelector('ol > li span.band-edge') as HTMLElement;
      expect(marker).toBeTruthy();
      expect(marker.style.getPropertyValue('--band-rgb')).toMatch(/^\d+ \d+ \d+$/);
    });

    it('has one step, and no numbering beyond it, for a method with no further steps', () => {
      // EXPLAIN's method is its lead; its one caveat goes under "Watch for".
      render(<Harness verb={'EXPLAIN' as PromptVerb} initiallyOpen />);

      const items = card()!.querySelectorAll('ol > li');
      expect(items.length).toBe(1);
      expect(items[0].querySelector('span')?.textContent).toBe('1');
    });
  });

  describe('watch for', () => {
    it('sets a cost under a warning label, not as a numbered step', () => {
      render(<Harness verb={'EXPLAIN' as PromptVerb} initiallyOpen />);

      const heading = within(card()!).getByRole('heading', { name: /watch for/i });
      expect(heading).toBeTruthy();
      expect(heading.querySelector('svg')).not.toBeNull();

      const caveat = within(card()!).getByText("Facts alone don't explain — connections do.");
      expect(caveat.closest('ol')).toBeNull();
      expect(caveat.closest('ul')).not.toBeNull();
    });

    it('is absent when the method has nothing to watch for', () => {
      render(<Harness verb={'DISTINGUISH' as PromptVerb} initiallyOpen />);
      expect(within(card()!).queryByRole('heading', { name: /watch for/i })).toBeNull();
    });
  });

  describe('words to use', () => {
    it('offers each term as a chip', () => {
      render(<Harness verb={'EXPLAIN' as PromptVerb} initiallyOpen />);

      expect(within(card()!).getByRole('heading', { name: /words to use/i })).toBeTruthy();
      for (const word of ['because', 'leads to', 'results in', 'therefore']) {
        expect(within(card()!).getByRole('button', { name: word })).toBeTruthy();
      }
    });

    it('adds the word to the draft when its chip is pressed', () => {
      const received: string[] = [];
      const listener = (event: Event) => received.push((event as CustomEvent).detail);
      window.addEventListener('insert-text', listener);

      try {
        render(<Harness verb={'EXPLAIN' as PromptVerb} initiallyOpen />);
        fireEvent.click(within(card()!).getByRole('button', { name: 'leads to' }));
        expect(received).toEqual(['leads to']);
      } finally {
        window.removeEventListener('insert-text', listener);
      }
    });

    it('is absent when the verb offers no terms', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} initiallyOpen />);
      expect(within(card()!).queryByRole('heading', { name: /words to use/i })).toBeNull();
    });
  });

  describe('sentence shape', () => {
    it('sets a template as a quotation', () => {
      render(<Harness verb={'COMPARE' as PromptVerb} initiallyOpen />);

      const heading = within(card()!).getByRole('heading', { name: /sentence shape/i });
      expect(heading).toBeTruthy();
      const quote = card()!.querySelector('blockquote') as HTMLElement;
      expect(quote.textContent).toContain('whereas');
      expect(quote.className).toContain('italic');
      expect(quote.className).toContain('border-l-2');
    });

    it('is absent when the verb offers no template', () => {
      render(<Harness verb={'DESCRIBE' as PromptVerb} initiallyOpen />);
      expect(within(card()!).queryByRole('heading', { name: /sentence shape/i })).toBeNull();
    });
  });
});
