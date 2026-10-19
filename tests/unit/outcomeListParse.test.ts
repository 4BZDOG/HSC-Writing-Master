import { describe, it, expect } from 'vitest';
import { parseOutcomeList, yearOfOutcomeCode } from '../../utils/outcomeCodes';

describe('yearOfOutcomeCode', () => {
  it.each([
    ['HM-11-01', 'year11'],
    ['HM-12-10', 'year12'],
    ['BI-11WS-03', 'year11'],
    ['BI-12WS-07', 'year12'],
    ['EE1-12-02', 'year12'],
    ['EE1-11-06', 'year11'],
    ['BIO11-8', 'year11'],
    ['BIO12-12', 'year12'],
    ['P1', 'year11'],
    ['H10', 'year12'],
    ['H1.2', 'year12'],
  ])('reads %s as %s', (code, year) => {
    expect(yearOfOutcomeCode(code)).toBe(year);
  });

  it('leaves a code with no year in it alone', () => {
    expect(yearOfOutcomeCode('AB-01')).toBeUndefined();
    expect(yearOfOutcomeCode('X1')).toBeUndefined();
  });
});

describe('parseOutcomeList', () => {
  it('reads code-then-description lines, with a space or a tab', () => {
    const parsed = parseOutcomeList(
      'HM-12-01 analyses the health status of Australians\nHM-12-02\tevaluates training methods'
    );
    expect(parsed).toEqual([
      {
        code: 'HM-12-01',
        description: 'analyses the health status of Australians',
        year: 'year12',
      },
      { code: 'HM-12-02', description: 'evaluates training methods', year: 'year12' },
    ]);
  });

  it('reads a code on its own line with the description under it, as the curriculum site copies', () => {
    const parsed = parseOutcomeList(
      'Outcomes\nA student:\nESD-11-01\nexplains how language shapes meaning\nESD-11-02\ncomposes texts for purpose'
    );
    expect(parsed.map((o) => [o.code, o.description, o.year])).toEqual([
      ['ESD-11-01', 'explains how language shapes meaning', 'year11'],
      ['ESD-11-02', 'composes texts for purpose', 'year11'],
    ]);
  });

  it('joins a wrapped description and stops at a capitalised line', () => {
    const parsed = parseOutcomeList(
      'BI-12-01 explains the mechanisms of inheritance and\nthe processes of reproduction\nContent\nsomething else'
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].description).toBe(
      'explains the mechanisms of inheritance and the processes of reproduction'
    );
  });

  it('places codes without a year under the heading they sit beneath', () => {
    const parsed = parseOutcomeList(
      'Year 11 outcomes\nSOC1 describes culture\nYear 12 outcomes\nSOC2 analyses change'
    );
    expect(parsed.map((o) => [o.code, o.year])).toEqual([
      ['SOC1', 'year11'],
      ['SOC2', 'year12'],
    ]);
  });

  it('reads the P and H codes of the older syllabuses', () => {
    const parsed = parseOutcomeList(
      'P1 discusses the nature of business\nH1 critically analyses the role of business'
    );
    expect(parsed.map((o) => [o.code, o.year])).toEqual([
      ['P1', 'year11'],
      ['H1', 'year12'],
    ]);
  });

  it('strips bullets and ignores prose with no codes', () => {
    expect(parseOutcomeList('• HM-11-01 explains health').map((o) => o.code)).toEqual(['HM-11-01']);
    expect(parseOutcomeList('Students learn about health and movement.')).toEqual([]);
  });
});
