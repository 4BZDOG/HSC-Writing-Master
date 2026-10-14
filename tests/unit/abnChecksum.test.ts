import { describe, it, expect } from 'vitest';
import { normaliseAbn as clientAbn } from '../../utils/abn';
import { normaliseAbn as serverAbn } from '../../api/_lib/schoolLicence';

/**
 * utils/abn.ts is a copy of the server's ABN check, because client code cannot
 * import from api/. This test is what keeps the copy honest: both functions run
 * over the same inputs, and they must agree on every one, valid or not.
 *
 * Two tables. The hand-written list covers the shapes a teacher can type. The
 * generated run covers enough numbers that both outcomes are common: a check
 * digit passes for about one number in eighty-nine, so a short list of valid
 * ABNs would prove little.
 */

const table: unknown[] = [
  '51 824 753 556',
  '51824753556',
  '51 824 753 557',
  '',
  ' 51 824 753 556 ',
  '5182475355',
  '518247535560',
  '51-824-753-556',
  'AB 824 753 556',
  51824753556,
  undefined,
  null,
];

describe('client ABN check matches the server', () => {
  it.each(table.map((value) => [String(JSON.stringify(value)), value] as const))(
    'agrees on %s',
    (_label, input) => {
      expect(clientAbn(input)).toBe(serverAbn(input));
    }
  );

  it('agrees over generated numbers, and both outcomes occur', () => {
    let valid = 0;
    let invalid = 0;
    // A fixed multiplier walks the whole ten-digit range without a random seed,
    // so a failure can be reproduced by its input.
    for (let n = 0; n < 2000; n++) {
      const digits = String((n * 7919 + 1234567) % 1e10).padStart(10, '0');
      for (let last = 0; last <= 9; last++) {
        const input = `${digits}${last}`;
        expect(clientAbn(input), input).toBe(serverAbn(input));
        if (serverAbn(input) === null) invalid++;
        else valid++;
      }
    }
    expect(valid).toBeGreaterThan(50);
    expect(invalid).toBeGreaterThan(50);
  });

  it('returns the eleven digits for the ATO example, with or without spaces', () => {
    expect(clientAbn('51 824 753 556')).toBe('51824753556');
    expect(clientAbn('51824753556')).toBe('51824753556');
    expect(clientAbn('51 824 753 557')).toBeNull();
  });
});
