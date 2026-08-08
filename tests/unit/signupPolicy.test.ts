import { describe, it, expect } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  resolveAllowedDomains,
  isSignupEnabled,
  parseAllowedDomains,
  isEmailDomainAllowed,
  allowedDomainMessage,
  validateSignup,
  hasSignupErrors,
} from '../../services/signupPolicy';

/**
 * The rules that decide who may create an account.
 *
 * These matter beyond tidiness: `handle_new_user` creates every new account as
 * `student`, and a student carries a 60-call daily AI budget spent against the
 * deployment's own provider key. A domain allowlist that fails open is
 * therefore a billing hole, not a cosmetic one — so the "when in doubt, refuse"
 * cases below are the point of the file.
 */

describe('isSignupEnabled', () => {
  it('defaults to on when unset — the form exists to be used', () => {
    expect(isSignupEnabled(undefined)).toBe(true);
    expect(isSignupEnabled('')).toBe(true);
  });

  it('is off only for an explicit "false"', () => {
    expect(isSignupEnabled('false')).toBe(false);
    expect(isSignupEnabled('  FALSE  ')).toBe(false);
  });

  it('treats every other value as on, rather than guessing', () => {
    // '0' and 'no' read as "off" to a human but are not the documented value.
    // Guessing either way is worse than one documented spelling; what must not
    // happen is a deployment that thinks it disabled sign-up and did not, so
    // this is the direction to be loud about in the docs.
    for (const value of ['true', '1', 'yes', 'off', '0', 'no']) {
      expect(isSignupEnabled(value)).toBe(true);
    }
  });
});

describe('parseAllowedDomains', () => {
  it('is empty when unset — no restriction', () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains('   ')).toEqual([]);
  });

  it('splits, trims, lowercases and tolerates a leading @', () => {
    expect(parseAllowedDomains(' @Education.NSW.gov.au , det.nsw.edu.au ,, ')).toEqual([
      'education.nsw.gov.au',
      'det.nsw.edu.au',
    ]);
  });
});

describe('resolveAllowedDomains', () => {
  it('is empty when neither variable is set', () => {
    expect(resolveAllowedDomains({})).toEqual([]);
  });

  it('reads the general variable, which governs sign-up AND SSO', () => {
    expect(resolveAllowedDomains({ VITE_ALLOWED_EMAIL_DOMAINS: 'education.nsw.gov.au' })).toEqual([
      'education.nsw.gov.au',
    ]);
  });

  it('falls back to the older sign-up-only name, so existing config keeps working', () => {
    expect(resolveAllowedDomains({ VITE_SIGNUP_ALLOWED_DOMAINS: 'det.nsw.edu.au' })).toEqual([
      'det.nsw.edu.au',
    ]);
  });

  it('prefers the general name when both are set', () => {
    expect(
      resolveAllowedDomains({
        VITE_ALLOWED_EMAIL_DOMAINS: 'new.edu.au',
        VITE_SIGNUP_ALLOWED_DOMAINS: 'old.edu.au',
      })
    ).toEqual(['new.edu.au']);
  });
});

describe('isEmailDomainAllowed', () => {
  const doe = ['education.nsw.gov.au'];

  it('allows anything when no domains are configured', () => {
    expect(isEmailDomainAllowed('anyone@example.com', [])).toBe(true);
  });

  it('allows an exact domain match, case-insensitively', () => {
    expect(isEmailDomainAllowed('jane.smith@education.nsw.gov.au', doe)).toBe(true);
    expect(isEmailDomainAllowed('Jane.Smith@EDUCATION.NSW.GOV.AU', doe)).toBe(true);
  });

  it('allows sub-domains, which schools actually use', () => {
    expect(isEmailDomainAllowed('j@central.education.nsw.gov.au', doe)).toBe(true);
  });

  it('refuses a different domain', () => {
    expect(isEmailDomainAllowed('someone@gmail.com', doe)).toBe(false);
  });

  it('refuses a look-alike domain that merely ENDS with the allowed one', () => {
    // The dangerous near-miss: a plain `endsWith` would accept this, and
    // "noteducation.nsw.gov.au" is registrable by anyone.
    expect(isEmailDomainAllowed('a@notedcuation.nsw.gov.au', doe)).toBe(false);
    expect(isEmailDomainAllowed('a@fakeeducation.nsw.gov.au', doe)).toBe(false);
  });

  it('refuses a domain that merely CONTAINS the allowed one', () => {
    expect(isEmailDomainAllowed('a@education.nsw.gov.au.evil.com', doe)).toBe(false);
  });

  it('splits on the last @, since a local part may contain one', () => {
    expect(isEmailDomainAllowed('"odd@name"@education.nsw.gov.au', doe)).toBe(true);
  });

  it('refuses malformed addresses rather than letting them through', () => {
    for (const bad of ['', 'no-at-sign', '@education.nsw.gov.au', 'trailing@']) {
      expect(isEmailDomainAllowed(bad, doe)).toBe(false);
    }
  });
});

describe('allowedDomainMessage', () => {
  it('names the single domain so the reader can act on it', () => {
    expect(allowedDomainMessage(['education.nsw.gov.au'])).toContain('@education.nsw.gov.au');
  });

  it('lists them all when there are several', () => {
    const message = allowedDomainMessage(['a.edu.au', 'b.edu.au']);
    expect(message).toContain('@a.edu.au');
    expect(message).toContain('@b.edu.au');
  });
});

describe('validateSignup', () => {
  const valid = {
    email: 'student@example.com',
    password: 'correct-horse',
    confirmPassword: 'correct-horse',
    allowedDomains: [] as string[],
  };

  it('passes a well-formed submission', () => {
    expect(hasSignupErrors(validateSignup(valid))).toBe(false);
  });

  it('reports a mismatch against the CONFIRM field, not the password', () => {
    const errors = validateSignup({ ...valid, confirmPassword: 'something-else' });
    expect(errors.confirmPassword).toMatch(/do not match/i);
    expect(errors.password).toBeUndefined();
  });

  it('reports the mismatch before the length, when both are wrong', () => {
    // Someone who typed two different passwords needs to hear that first —
    // being told the second one is too short sends them fixing the wrong box.
    const errors = validateSignup({ ...valid, password: 'short', confirmPassword: 'other' });
    expect(errors.confirmPassword).toMatch(/do not match/i);
    expect(errors.password).toBeUndefined();
  });

  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const errors = validateSignup({ ...valid, password: short, confirmPassword: short });
    expect(errors.password).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH}`));
  });

  it('accepts exactly the minimum length', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    const errors = validateSignup({ ...valid, password: exact, confirmPassword: exact });
    expect(errors.password).toBeUndefined();
  });

  it('asks for the confirmation when it is missing', () => {
    expect(validateSignup({ ...valid, confirmPassword: '' }).confirmPassword).toBeTruthy();
  });

  it('flags an empty or malformed email', () => {
    expect(validateSignup({ ...valid, email: '' }).email).toBeTruthy();
    expect(validateSignup({ ...valid, email: 'not-an-email' }).email).toBeTruthy();
  });

  it('flags a disallowed domain with the message naming the allowed one', () => {
    const errors = validateSignup({
      ...valid,
      email: 'someone@gmail.com',
      allowedDomains: ['education.nsw.gov.au'],
    });
    expect(errors.email).toContain('@education.nsw.gov.au');
  });

  it('ignores surrounding whitespace on the email', () => {
    const errors = validateSignup({
      ...valid,
      email: '  student@education.nsw.gov.au  ',
      allowedDomains: ['education.nsw.gov.au'],
    });
    expect(errors.email).toBeUndefined();
  });
});
