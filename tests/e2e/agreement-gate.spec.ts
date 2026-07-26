import { test, expect, Page } from '@playwright/test';

/**
 * The agreement gate, as a user actually meets it.
 *
 * Unit tests cover the rules; this covers the thing those rules exist to
 * guarantee — that a signed-in user cannot reach the workspace without
 * accepting, that acceptance sticks across a reload, and that a guest is never
 * held up. Those are properties of the whole app wiring (App.tsx renders the
 * workspace conditionally), so they can only be checked here.
 *
 * Runs against the default mock-mode dev server, where the demo accounts work
 * and nothing touches a real backend.
 */

const WORKSPACE_MARKER = 'Ready to Write';
const STUDENT_CHARTER = 'How we work together';

/** Fresh browser state per test: acceptance is remembered, which is the point. */
const signIn = async (page: Page, username: string, password: string) => {
  await page.goto('/');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
};

const acceptAgreement = async (page: Page) => {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /agree and continue/i }).click();
};

/**
 * The quick-start guide opens by itself over the app on a first sign-in.
 * Waits for it rather than probing visibility immediately — it appears a beat
 * after acceptance, and a bare `isVisible()` would race it and skip.
 */
const dismissQuickStart = async (page: Page) => {
  const close = page.getByRole('button', { name: /start writing/i });
  await close.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (await close.isVisible().catch(() => false)) await close.click();
};

test.describe('agreement gate', () => {
  test('a student cannot reach the workspace without accepting', async ({ page }) => {
    await signIn(page, 'user', 'user');

    await expect(page.getByText(STUDENT_CHARTER)).toBeVisible();
    // The gate is not an overlay over a live app — the workspace is not
    // rendered at all, so there is nothing to reach around it to.
    await expect(page.getByText(WORKSPACE_MARKER)).toHaveCount(0);

    // The button does nothing until the box is ticked.
    const continueButton = page.getByRole('button', { name: /agree and continue/i });
    await expect(continueButton).toBeDisabled();

    await acceptAgreement(page);
    await dismissQuickStart(page);
    await expect(page.getByText(WORKSPACE_MARKER)).toBeVisible();
  });

  test('acceptance survives a reload', async ({ page }) => {
    await signIn(page, 'user', 'user');
    await acceptAgreement(page);
    await dismissQuickStart(page);

    await page.reload();

    await expect(page.getByText(WORKSPACE_MARKER)).toBeVisible();
    await expect(page.getByText(STUDENT_CHARTER)).toHaveCount(0);
  });

  test('a blocking gate always offers a way out', async ({ page }) => {
    await signIn(page, 'user', 'user');
    await expect(page.getByText(STUDENT_CHARTER)).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();

    // Back to the sign-in page rather than trapped behind a dialog.
    await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();
  });

  test('a teacher reads the staff charter', async ({ page }) => {
    await signIn(page, 'teacher', 'teacher');
    await expect(page.getByText('What you are signing up to')).toBeVisible();
    await expect(page.getByText(/duty of care/i)).toBeVisible();
  });

  test('a guest is shown the charter but never blocked by it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /continue as guest/i }).click();

    await expect(page.getByText(STUDENT_CHARTER)).toBeVisible();
    // Nothing to sign: a read-only trial that persists nothing server-side is
    // not the moment to demand a signature.
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    await page.getByRole('button', { name: /let me look around/i }).click();
    await dismissQuickStart(page);
    await expect(page.getByText(WORKSPACE_MARKER)).toBeVisible();
  });

  test('the terms are readable before signing in, not only after', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /terms & privacy/i }).click();

    await expect(page.getByRole('heading', { name: /terms & privacy/i })).toBeVisible();
    // Both documents are reachable from the reader.
    await expect(page.getByRole('button', { name: /privacy notice/i }).first()).toBeVisible();
  });
});
