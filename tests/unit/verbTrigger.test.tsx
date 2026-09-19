import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  renderFormattedText,
  VERB_HIGHLIGHT_CLASS,
  VERB_TRIGGER_CLASS,
} from '../../utils/renderUtils';
import type { PromptVerb } from '../../types';

/**
 * The command verb in a question opens the guide to that verb.
 *
 * It was always drawn bold, accent-coloured and underlined — a hyperlink in
 * everything but behaviour. The only real way into the guide was a chip up in
 * the card header, dressed exactly like the "4 Marks" and "Band 2" chips that
 * state a fact and do nothing. So the affordance sat on the element that did
 * nothing, and the element that did something had no affordance; a student who
 * did not already know the guide existed had no reason to look for it.
 */

afterEach(cleanup);

const QUESTION = 'Describe the key steps involved in DNA replication.';

describe('the command verb in a question', () => {
  it('opens its guide when there is one to open', () => {
    const onVerbClick = vi.fn();
    render(
      <p>{renderFormattedText(QUESTION, [], 'DESCRIBE' as PromptVerb, onVerbClick)}</p>
    );

    const verb = screen.getByRole('button', { name: /Describe: what this command verb asks for/i });
    fireEvent.click(verb);
    expect(onVerbClick).toHaveBeenCalledTimes(1);
  });

  // The styling was already right; it just was not attached to anything.
  it('keeps the highlight it always had, and adds a pointer to it', () => {
    render(
      <p>{renderFormattedText(QUESTION, [], 'DESCRIBE' as PromptVerb, vi.fn())}</p>
    );

    const verb = screen.getByRole('button', { name: /asks for/i });
    expect(verb.className).toContain(VERB_HIGHLIGHT_CLASS);
    expect(verb.className).toContain('cursor-pointer');
    expect(VERB_TRIGGER_CLASS).toContain('focus-visible:outline-2');
  });

  /**
   * Everywhere this renders except the question card, the verb is being QUOTED
   * rather than asked — feedback, exemplars, marking criteria. A button there
   * would be a control that acts on a different question, so without a handler
   * the verb stays exactly what it was.
   */
  it('stays a plain highlight where there is nothing to open', () => {
    const { container } = render(
      <p>{renderFormattedText(QUESTION, [], 'DESCRIBE' as PromptVerb)}</p>
    );

    expect(screen.queryByRole('button')).toBeNull();
    const span = container.querySelector(`span[class="${VERB_HIGHLIGHT_CLASS}"]`);
    expect(span?.textContent).toBe('Describe');
  });

  // The matcher catches inflections, so the trigger has to follow it — a
  // question that says "Describing" must still be a way in.
  it('follows the verb into the forms a question actually uses', () => {
    render(
      <p>
        {renderFormattedText(
          'Analysing the data, explain the trend.',
          [],
          'ANALYSE' as PromptVerb,
          vi.fn()
        )}
      </p>
    );

    // "What a Analysing question asks for" was neither grammatical nor what
    // the reader pressed; the word comes first and the purpose follows.
    expect(
      screen.getByRole('button', { name: /Analysing: what this command verb asks for/i })
    ).toBeTruthy();
  });
});
