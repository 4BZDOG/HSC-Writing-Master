/**
 * Who is allowed to create an account, and what counts as a usable password.
 *
 * Kept as pure functions in their own module (no React, no Supabase) because
 * both the UI and `authService.signUp` have to agree: a rule enforced only in
 * the form is not a rule, it is a suggestion that a fetch call ignores.
 *
 * **Sign-up is not free.** A new account is created as `student` (see
 * `handle_new_user` in supabase/schema.sql) and a student carries a 60-call
 * daily AI budget, spent against the deployment's provider key. Open
 * registration on a public URL therefore hands out AI spend to anyone who finds
 * it. `VITE_SIGNUP_ALLOWED_DOMAINS` is the lever for that, and for a school
 * deployment it should almost always be set.
 */

/** Shortest password this app will accept. Supabase's own floor is 6. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Is self-registration switched on for this deployment?
 *
 * Defaults to ON — the form exists to be used. Set `VITE_ENABLE_SIGNUP=false`
 * on a deployment where every account is provisioned centrally (admin-created
 * or SSO), which removes the "Create one" affordance entirely rather than
 * leaving a form that a policy will reject.
 */
export const isSignupEnabled = (raw: string | undefined): boolean =>
  (raw ?? '').trim().toLowerCase() !== 'false';

/**
 * Email domains permitted to self-register, from `VITE_SIGNUP_ALLOWED_DOMAINS`
 * (comma-separated, e.g. `education.nsw.gov.au,det.nsw.edu.au`). Unset means no
 * restriction.
 *
 * Sub-domains of a listed domain are accepted — a NSW DoE tenant hands out
 * addresses at `education.nsw.gov.au` but a school may sit on a sub-domain, and
 * listing every one of them is not maintainable.
 */
export const parseAllowedDomains = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

/**
 * The allowlist this deployment is running, from the environment.
 *
 * `VITE_ALLOWED_EMAIL_DOMAINS` governs BOTH ways an account can appear —
 * self-registration and SSO — because restricting one and not the other
 * restricts nothing. `VITE_SIGNUP_ALLOWED_DOMAINS` is the older, sign-up-only
 * name and is still read so an existing configuration keeps working; prefer the
 * general one.
 */
export const resolveAllowedDomains = (env: {
  VITE_ALLOWED_EMAIL_DOMAINS?: string;
  VITE_SIGNUP_ALLOWED_DOMAINS?: string;
}): string[] => {
  const general = parseAllowedDomains(env.VITE_ALLOWED_EMAIL_DOMAINS);
  return general.length > 0 ? general : parseAllowedDomains(env.VITE_SIGNUP_ALLOWED_DOMAINS);
};

/** Does this address sit in one of the allowed domains? Empty list = anything. */
export const isEmailDomainAllowed = (email: string, allowed: string[]): boolean => {
  if (allowed.length === 0) return true;
  // Split on the LAST '@': the local part of an address may legally contain one.
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
};

/** Wording for a refused domain. Names the domains so the user can act on it. */
export const allowedDomainMessage = (allowed: string[]): string =>
  allowed.length === 1
    ? `Accounts are limited to @${allowed[0]} email addresses.`
    : `Accounts are limited to these email domains: ${allowed.map((d) => `@${d}`).join(', ')}.`;

export interface SignupFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/**
 * Validate the sign-up form. Returns one message per offending field so the UI
 * can mark them individually instead of showing a single vague banner.
 *
 * Deliberately checks the password against the confirmation BEFORE length, so
 * someone who typed two different passwords is told that, rather than being
 * told the second one is too short.
 */
export const validateSignup = (input: {
  email: string;
  password: string;
  confirmPassword: string;
  allowedDomains: string[];
}): SignupFieldErrors => {
  const errors: SignupFieldErrors = {};
  const email = input.email.trim();

  if (!email) {
    errors.email = 'Enter an email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'That does not look like an email address.';
  } else if (!isEmailDomainAllowed(email, input.allowedDomains)) {
    errors.email = allowedDomainMessage(input.allowedDomains);
  }

  if (!input.password) {
    errors.password = 'Choose a password.';
  } else if (input.confirmPassword && input.password !== input.confirmPassword) {
    errors.confirmPassword = 'The two passwords do not match.';
  } else if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!errors.confirmPassword && input.password && !input.confirmPassword) {
    errors.confirmPassword = 'Re-enter the password to confirm it.';
  }

  return errors;
};

export const hasSignupErrors = (errors: SignupFieldErrors): boolean =>
  Object.values(errors).some(Boolean);
