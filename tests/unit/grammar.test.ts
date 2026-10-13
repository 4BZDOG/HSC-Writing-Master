import { describe, it, expect } from 'vitest';
import { withIndefiniteArticle } from '../../utils/grammar';

describe('withIndefiniteArticle', () => {
  it('uses "an" before a vowel sound, which is the case for most command verbs', () => {
    expect(withIndefiniteArticle('EXPLAIN')).toBe('an EXPLAIN');
    expect(withIndefiniteArticle('EVALUATE')).toBe('an EVALUATE');
    expect(withIndefiniteArticle('IDENTIFY')).toBe('an IDENTIFY');
    expect(withIndefiniteArticle('OUTLINE')).toBe('an OUTLINE');
    expect(withIndefiniteArticle('ANALYSE')).toBe('an ANALYSE');
    expect(withIndefiniteArticle('INVESTIGATE')).toBe('an INVESTIGATE');
  });

  it('uses "a" before a consonant sound', () => {
    expect(withIndefiniteArticle('DESCRIBE')).toBe('a DESCRIBE');
    expect(withIndefiniteArticle('DIFFERENTIATE')).toBe('a DIFFERENTIATE');
    expect(withIndefiniteArticle('STATE')).toBe('a STATE');
  });

  it('follows the sound of a vowel letter that is pronounced as a consonant', () => {
    expect(withIndefiniteArticle('unique')).toBe('a unique');
    expect(withIndefiniteArticle('USAGE')).toBe('a USAGE');
    expect(withIndefiniteArticle('one-off')).toBe('a one-off');
  });

  it('uses "an" before a silent h', () => {
    expect(withIndefiniteArticle('hour')).toBe('an hour');
    expect(withIndefiniteArticle('honest')).toBe('an honest');
  });

  it('keeps the case of the word it is given', () => {
    expect(withIndefiniteArticle('Explain')).toBe('an Explain');
    expect(withIndefiniteArticle('describe')).toBe('a describe');
  });

  it('trims surrounding space and returns nothing for an empty word', () => {
    expect(withIndefiniteArticle('  EXPLAIN ')).toBe('an EXPLAIN');
    expect(withIndefiniteArticle('')).toBe('');
    expect(withIndefiniteArticle('   ')).toBe('');
  });
});
