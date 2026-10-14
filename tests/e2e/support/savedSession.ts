import { fileURLToPath } from 'node:url';

/**
 * The browser state each mock account is saved in, so a spec can start from a
 * finished preamble instead of repeating it.
 *
 * `tests/e2e/auth.setup.ts` writes these once per run, from the same helpers a
 * spec would otherwise run (sign-in, the onboarding gates, the first question).
 * They are git-ignored and never reused across runs. Each browser project lists
 * its engine's setup under `dependencies`, and Playwright does not start a
 * project whose dependency failed, so a stale or half-written file is never read.
 *
 * A spec opts in with `test.use({ storageState: authFile(account) })` and
 * `openWorkspace(page, { account })`. Anything it changes in the browser stays in
 * its own context, so one test cannot leave state behind for the next.
 */

export const ACCOUNTS = ['user', 'teacher', 'admin'] as const;

export type SavedAccount = (typeof ACCOUNTS)[number];

const AUTH_DIR = fileURLToPath(new URL('../../../playwright/.auth/', import.meta.url));

/** Absolute path of an account's saved state, for `test.use({ storageState })`. */
export const authFile = (account: SavedAccount): string => `${AUTH_DIR}${account}.json`;
