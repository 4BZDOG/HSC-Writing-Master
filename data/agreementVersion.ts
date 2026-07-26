/**
 * Agreement and quick-start versions — the single source of truth, in a module
 * with NO imports of its own.
 *
 * Why these live apart from the content that uses them: `legalContent.ts`
 * interpolates the real free-tier limits from `services/entitlements.ts`, which
 * reaches `supabaseClient.ts` and `import.meta.env`. That chain is fine in the
 * app and in Vitest, but it cannot be loaded by the Playwright runner, which
 * runs in plain Node — so an e2e spec that needs to stub "this account has
 * already accepted v1.0" could not read the version at all, and would have to
 * hard-code it and silently rot at the next bump.
 *
 * Both constants are re-exported from their content files, so every existing
 * import site keeps working and there is still only one place to change them.
 */

/**
 * Bump whenever the SUBSTANCE of the agreement changes, and add a matching
 * entry to `AGREEMENT_CHANGELOG` in `legalContent.ts` — a test fails the build
 * if you forget. Users who accepted an older version are re-prompted on their
 * next visit and shown what changed. Cosmetic rewording does not need a bump.
 *
 * Format: `major.minor`.
 */
export const AGREEMENT_VERSION = '1.0';

/**
 * Bump when the quick-start guide changes enough that returning users should
 * see it again. Cosmetic edits do not need a bump — the guide is always
 * re-openable from the header and the profile.
 */
export const QUICK_START_VERSION = '1.0';
