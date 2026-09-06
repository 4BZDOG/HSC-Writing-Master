import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  createKeywordRegex,
  textContainsKeyword,
  renderFormattedText,
  VERB_HIGHLIGHT_CLASS,
} from '../../utils/renderUtils';
import { commandTermsList } from '../../data/commandTerms';

/**
 * Every command term lights up in every form a writer actually uses.
 *
 * `renderFormattedText` builds the verb highlighter from the prompt's recorded
 * verb alone, so a form the matcher cannot derive is a verb that renders
 * uncoloured in its own question. Five of the thirty-eight — IDENTIFY, CLARIFY,
 * CLASSIFY, APPLY, JUSTIFY — did exactly that in the past tense: a consonant
 * plus "y" takes "-ied", and the general rule spelled "identifyed".
 *
 * The same matcher drives the keyword coverage meter and the PDF exporter, so a
 * gap here silently under-credits a student as well as under-colouring them.
 */

/** The standard English forms of a command term. */
const formsOf = (verb: string): string[] => {
  const b = verb.toLowerCase();
  if (b.endsWith('e')) return [b, b.slice(0, -1) + 'ing', b + 'd', b + 's'];
  if (/[^aeiou]y$/.test(b)) return [b, b.slice(0, -1) + 'ies', b.slice(0, -1) + 'ied', b + 'ing'];
  if (/(s|x|z|ch|sh)$/.test(b)) return [b, b + 'es', b + 'ing', b + 'ed'];
  return [b, b + 's', b + 'ing', b + 'ed'];
};

describe('command term inflections', () => {
  it('matches every standard form of every command term', () => {
    const gaps: string[] = [];
    for (const term of commandTermsList) {
      const regex = createKeywordRegex([term.term]);
      for (const form of formsOf(term.term)) {
        // A fresh regex per probe: the shared one carries /g, so `test` is
        // stateful and would skip every other call.
        const fresh = regex ? new RegExp(regex.source, regex.flags) : null;
        if (!fresh || !fresh.test(`Candidates should ${form} the source.`)) {
          gaps.push(`${term.term} misses "${form}"`);
        }
      }
    }
    expect(gaps, gaps.join('\n')).toEqual([]);
  });

  it('resolves an inflected form back to its command term', () => {
    // The reverse direction matters because a curator may store the keyword in
    // whatever form the syllabus used.
    expect(textContainsKeyword('We identify the enzyme.', 'identified')).toBe(true);
    expect(textContainsKeyword('We justify the claim.', 'justified')).toBe(true);
    expect(textContainsKeyword('We apply the rule.', 'applied')).toBe(true);
  });

  it('no longer derives the misspelling the general rule produced', () => {
    const regex = createKeywordRegex(['IDENTIFY']);
    const fresh = new RegExp(regex!.source, regex!.flags);
    expect(fresh.test('They identifyed the enzyme.')).toBe(false);
  });

  it('carries the doubled-consonant spelling for -l keywords', () => {
    // "Control" is a keyword in the shipped Biology data; a student writes
    // "controlled variable", which matched nothing before.
    expect(textContainsKeyword('the controlled variable', 'Control')).toBe(true);
    expect(textContainsKeyword('controlling for temperature', 'Control')).toBe(true);
    expect(textContainsKeyword('modelling the process', 'model')).toBe(true);
  });

  it('actually paints the span, not just the match', () => {
    // The regex is only half the path — this is what a student sees. One
    // element per highlighted verb, carrying the accent treatment.
    const highlighted = (text: string, verb: string): string[] => {
      const { container } = render(
        React.createElement('div', null, renderFormattedText(text, [], verb as never))
      );
      // Matched on the full class string rather than by selector: the
      // treatment contains characters (`[`, `(`, `/`) that a CSS selector
      // would have to escape, and `CSS.escape` is not in this environment.
      return Array.from(container.querySelectorAll('span'))
        .filter((n) => n.getAttribute('class') === VERB_HIGHLIGHT_CLASS)
        .map((n) => n.textContent ?? '');
    };

    expect(highlighted('Having identified the enzyme, continue.', 'IDENTIFY')).toEqual([
      'identified',
    ]);
    expect(highlighted('The claim is justified by the data.', 'JUSTIFY')).toEqual(['justified']);
    // The base form was never broken; it must still paint exactly once.
    expect(highlighted('Identify the enzyme.', 'IDENTIFY')).toEqual(['Identify']);
  });

  it('keeps the stem floor that stops a short word cross-matching', () => {
    // The -l/-ll swap is deliberately not applied below a four-character stem,
    // or "filing" would light up "filling".
    expect(textContainsKeyword('filling the tube', 'filing')).toBe(false);
    expect(textContainsKeyword('filing a report', 'fill')).toBe(false);
  });
});
