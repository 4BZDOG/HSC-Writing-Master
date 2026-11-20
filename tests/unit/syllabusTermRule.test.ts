import { describe, it, expect } from 'vitest';
import {
  isSyllabusTerm,
  isProperNameTerm,
  dropNonSyllabusTerms,
  INSTRUCTION_PHRASE,
} from '../../services/geminiService';

/**
 * The length test that decides what the Off-Syllabus Terms filter and Tidy
 * Terms remove. A bare word count dropped real syllabus terms — named Acts,
 * conventions and schools, and longer phrases the question itself uses — so the
 * rule keeps up to six words outright, proper names up to ten, phrases of up to
 * eight only when the text says them, and drops task-instruction wording
 * ("close reference to the prescribed text") at any length.
 */

describe('isProperNameTerm', () => {
  it.each([
    'Universal Declaration of Human Rights',
    'Aboriginal and Torres Strait Islander Peoples',
    'Convention on the Rights of the Child',
    'Little Rock Central High School',
    'Family Law Act 1975 (Cth)',
    'Residential Tenancies Act 2010 (NSW)',
  ])('recognises "%s" as a proper name', (term) => {
    expect(isProperNameTerm(term)).toBe(true);
  });

  it.each(['Data that should be stored', 'ideas expressed in the text', 'data', 'Evaluate'])(
    'does not treat "%s" as a proper name',
    (term) => {
      expect(isProperNameTerm(term)).toBe(false);
    }
  );
});

describe('isSyllabusTerm — the length rule', () => {
  it('keeps the named examples and real long phrases with no context', () => {
    for (const term of [
      'Universal Declaration of Human Rights',
      'Family Law Act 1975 (Cth)',
      'Aboriginal and Torres Strait Islander Peoples',
      'International Covenant on Civil and Political Rights',
      'Convention on the Rights of the Child',
      'Residential Tenancies Act 2010 (NSW)',
      'Little Rock Central High School',
      'movement along the supply curve',
      'law of increasing opportunity cost',
      'basket of goods and services',
      'duty to take reasonable care',
      'S + T + M = I + G + X',
      'detention as a last resort',
      'so far as is reasonably practicable',
      'deflection in a magnetic field',
      'best interests of the child',
      'family and domestic violence leave',
      'relationship between texts and contexts',
      '2 to 3 per cent',
    ]) {
      expect(isSyllabusTerm(term), term).toBe(true);
    }
  });

  it('drops task-instruction wording at any length, even when the context has it', () => {
    for (const term of [
      'close reference to the prescribed text',
      'close reference to both prescribed texts',
      'study of the prescribed text',
      'at least two prescribed poems',
    ]) {
      expect(isSyllabusTerm(term), term).toBe(false);
      expect(isSyllabusTerm(term, undefined, term), term).toBe(false);
    }
    expect(INSTRUCTION_PHRASE.test('Close Reference to the text')).toBe(true);
    expect(INSTRUCTION_PHRASE.test('prescribed content')).toBe(false);
  });

  it('keeps a seven- or eight-word phrase only when the context uses it', () => {
    const seven = 'the ways that the data is stored';
    expect(seven.split(' ')).toHaveLength(7);
    expect(isSyllabusTerm(seven)).toBe(false);
    expect(isSyllabusTerm(seven, undefined, `Discuss ${seven}.`)).toBe(true);

    const eight = 'the ways that the data should be stored';
    expect(eight.split(' ')).toHaveLength(8);
    expect(isSyllabusTerm(eight)).toBe(false);
    expect(isSyllabusTerm(eight, undefined, `Discuss ${eight} in this scenario.`)).toBe(true);
  });

  it('drops a nine-word phrase with no proper name even when the context has it', () => {
    const nine = 'the ways in which data should be stored safely';
    expect(nine.split(' ')).toHaveLength(9);
    expect(isSyllabusTerm(nine, undefined, nine)).toBe(false);
  });

  it('keeps a five-word clause with no context (the trade-off of the six-word cap)', () => {
    // "ideas expressed in the text" is five words, so it is a term outright now.
    // A clause of this length that no question uses is kept, and that is accepted.
    const five = 'ideas expressed in the text';
    expect(five.split(' ')).toHaveLength(5);
    expect(isSyllabusTerm(five)).toBe(true);
    expect(isSyllabusTerm(five, undefined, 'Compare the arguments presented.')).toBe(true);
  });

  it('keeps a phrase the context uses verbatim, and matches it on whole words', () => {
    expect(
      isSyllabusTerm(
        'law of conservation of mass in reactions',
        undefined,
        'Explain the Law of Conservation of Mass in reactions.'
      )
    ).toBe(true);
    expect(
      isSyllabusTerm('best interests of the child', undefined, 'the best interests, of the child!')
    ).toBe(true);
    // Seven words, so the context must hold the whole phrase, not a part of it.
    expect(
      isSyllabusTerm(
        'best interests of the child and family',
        undefined,
        'the best interests of the child'
      )
    ).toBe(false);
  });

  it('leaves the ≤4-word behaviour unchanged', () => {
    expect(isSyllabusTerm('data')).toBe(false);
    expect(isSyllabusTerm('therefore')).toBe(false);
    expect(isSyllabusTerm('evaluate')).toBe(false);
    expect(isSyllabusTerm('evaluating test data')).toBe(true);
    expect(isSyllabusTerm('big data')).toBe(true);
    expect(isSyllabusTerm('primary data sources')).toBe(true);
  });
});

describe('dropNonSyllabusTerms — context passes through, nothing else changes', () => {
  const context = 'Explain the law of conservation of mass. Scenario: a Universal Declaration.';

  it('keeps proper names and context-backed phrases, drops junk, dedupes, keeps order', () => {
    const raw = [
      'Universal Declaration of Human Rights',
      'law of conservation of mass',
      'close reference to the prescribed text',
      'the ways in which data should be stored safely',
      'data',
      'Universal Declaration of Human Rights',
      'Convention on the Rights of the Child',
    ];
    expect(dropNonSyllabusTerms(raw, 'Explain', context)).toEqual([
      'Universal Declaration of Human Rights',
      'law of conservation of mass',
      'Convention on the Rights of the Child',
    ]);
  });

  it('without context drops a phrase past eight words the text uses', () => {
    const long = 'the ways in which data should be stored safely';
    expect(dropNonSyllabusTerms([long], 'Explain')).toEqual([]);
    expect(dropNonSyllabusTerms([long], 'Explain', long)).toEqual([]);
    const seven = 'the ways that the data is stored';
    expect(dropNonSyllabusTerms([seven], 'Explain')).toEqual([]);
    expect(dropNonSyllabusTerms([seven], 'Explain', seven)).toEqual([seven]);
  });

  it('does not cap the list', () => {
    const many = Array.from({ length: 19 }, (_, i) => `term number ${i}`);
    expect(dropNonSyllabusTerms(many, 'Explain')).toHaveLength(19);
  });
});
