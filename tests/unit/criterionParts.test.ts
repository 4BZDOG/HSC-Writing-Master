import { describe, it, expect } from 'vitest';
import { criterionParts } from '../../utils/criterionParts';

describe('criterionParts', () => {
  it('keeps a plain criterion whole', () => {
    expect(criterionParts('Provides some relevant information')).toEqual([
      ['Provides some relevant information'],
    ]);
  });

  it('splits NESA OR alternatives where a criterion verb follows', () => {
    expect(
      criterionParts(
        'Outlines ONE way, other than the use of a PWA, to minimise load time OR Identifies TWO ways to minimise load time'
      )
    ).toEqual([
      ['Outlines ONE way, other than the use of a PWA, to minimise load time'],
      ['Identifies TWO ways to minimise load time'],
    ]);
  });

  it('splits the points of one alternative on semicolons', () => {
    expect(
      criterionParts(
        'Explains how the neural network supports the assistant; Includes one positive AND one negative impact'
      )
    ).toEqual([
      [
        'Explains how the neural network supports the assistant',
        'Includes one positive AND one negative impact',
      ],
    ]);
  });

  it('leaves an OR inside a sentence alone', () => {
    for (const text of [
      'Identifies ONE OR TWO dashboard elements with a brief description',
      'Identifies relevant social and/or ethical issues',
      'Outlines how metadata AND/OR data mining can be used',
      'Identifies the forecast OR the system in general terms',
      'Explains ONE effect OR its cause',
    ]) {
      expect(criterionParts(text), text).toEqual([[text]]);
    }
  });

  it('takes a lower-case opener after a comma and OR, and capitalises it', () => {
    expect(
      criterionParts(
        'Classifies TWO components correctly, OR classifies all four with general reasons'
      )
    ).toEqual([
      ['Classifies TWO components correctly'],
      ['Classifies all four with general reasons'],
    ]);
  });
});
