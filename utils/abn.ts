/**
 * The ABN check, on the client, so a teacher hears about a mistyped ABN while
 * they type it rather than after the request has been refused.
 *
 * This is a copy of `normaliseAbn` in api/_lib/schoolLicence.ts. Client code
 * cannot import from api/, so the two are pinned together instead: the test in
 * tests/unit/abnChecksum.test.ts runs both over the same table. Change one and
 * that test fails until the other follows.
 */

/**
 * Checks an ABN and returns its eleven digits, or null. Spaces are allowed
 * because that is how an ABN is printed on an invoice ("51 824 753 556"). The
 * check is the ATO's: take one from the first digit, weight the digits, and the
 * sum must divide by 89.
 */
export const normaliseAbn = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return null;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const values = digits.split('').map(Number);
  values[0] -= 1;
  const sum = values.reduce((total, digit, i) => total + digit * weights[i], 0);
  return sum % 89 === 0 ? digits : null;
};
