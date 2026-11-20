import { describe, it, expect } from 'vitest';
import {
  isSyllabusTerm,
  isProperNameTerm,
  dropNonSyllabusTerms,
} from '../../services/geminiService';

/**
 * The length test that decides what the Off-Syllabus Terms filter and Tidy
 * Terms remove. A bare word count dropped real syllabus terms — named Acts,
 * conventions and schools, and clause-length phrases the question itself uses —
 * so the rule now keeps proper names outright and a phrase only when the text
 * says it.
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
  it('keeps the named examples with no context', () => {
    for (const term of [
      'Universal Declaration of Human Rights',
      'Family Law Act 1975 (Cth)',
      'Aboriginal and Torres Strait Islander Peoples',
      'International Covenant on Civil and Political Rights',
      'Convention on the Rights of the Child',
      'Residential Tenancies Act 2010 (NSW)',
      'Little Rock Central High School',
    ]) {
      expect(isSyllabusTerm(term), term).toBe(true);
    }
  });

  it('keeps a clause-length phrase only when the context uses it', () => {
    const term = 'law of conservation of mass';
    expect(isSyllabusTerm(term)).toBe(false);
    expect(
      isSyllabusTerm(term, undefined, 'Explain the Law of Conservation of Mass in this reaction.')
    ).toBe(true);
    expect(isSyllabusTerm('circular flow of income model')).toBe(false);
    expect(
      isSyllabusTerm(
        'circular flow of income model',
        undefined,
        'Describe the circular flow of income model.'
      )
    ).toBe(true);
    expect(isSyllabusTerm('best interests of the child')).toBe(false);
    expect(
      isSyllabusTerm(
        'best interests of the child',
        undefined,
        'Discuss the best interests of the child.'
      )
    ).toBe(true);
  });

  it('matches the context on whole words, ignoring punctuation and apostrophes', () => {
    expect(isSyllabusTerm('ideas expressed in the text', undefined, 'ideas expressed in the')).toBe(
      false
    );
    expect(
      isSyllabusTerm('best interests of the child', undefined, 'the best interests, of the child!')
    ).toBe(true);
    expect(
      isSyllabusTerm('best interests of the chil', undefined, 'the best interests of the child')
    ).toBe(false);
  });

  it('drops clause-like junk the text does not name', () => {
    expect(isSyllabusTerm('ideas expressed in the text')).toBe(false);
    expect(isSyllabusTerm('data that should be stored')).toBe(false);
    expect(
      isSyllabusTerm('ideas expressed in the text', undefined, 'Compare the arguments presented.')
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

  it('still drops a phrase of seven or more words with no proper name, even if the context has it', () => {
    const long = 'the long run average annual rainfall over the catchment';
    expect(isSyllabusTerm(long, undefined, long)).toBe(false);
  });
});

describe('dropNonSyllabusTerms — context passes through, nothing else changes', () => {
  const context = 'Explain the law of conservation of mass. Scenario: a Universal Declaration.';

  it('keeps proper names and context-backed phrases, drops clauses, dedupes, keeps order', () => {
    const raw = [
      'Universal Declaration of Human Rights',
      'law of conservation of mass',
      'ideas expressed in the text',
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

  it('without context drops the context-only phrase', () => {
    expect(dropNonSyllabusTerms(['law of conservation of mass'], 'Explain')).toEqual([]);
  });

  it('does not cap the list', () => {
    const many = Array.from({ length: 19 }, (_, i) => `term number ${i}`);
    expect(dropNonSyllabusTerms(many, 'Explain')).toHaveLength(19);
  });
});
