import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { ACCOUNTS, authFile } from './support/savedSession';
import {
  clearOnboarding,
  openFirstQuestion,
  openSavedWorkspace,
  signIn,
} from './support/workspace';

/**
 * Signs each mock account in once per run and saves the browser state that the
 * specs start from. Without it every test repeats sign-in, the onboarding gates
 * and the picker walk before its body starts: about 12 s a test on Chromium.
 *
 * The state is taken with the first question open, before anything has been
 * marked, so no counter a test asserts on has been spent. It holds localStorage
 * (the session, the agreement, the chosen question path) and IndexedDB (the
 * imported curriculum). Playwright restores both into a fresh context.
 *
 * A file that does not land on the workspace fails here, once, with its reason,
 * rather than failing every test that would have used it.
 */
for (const account of ACCOUNTS) {
  setup(`save the ${account} session`, async ({ page, context, browser }, testInfo) => {
    testInfo.setTimeout(120_000);

    await signIn(page, account);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    // An AI call that failed during setup can leave the circuit breaker's
    // cooldown in localStorage, and every restored test would then start blocked.
    const guard = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('hsc-ai-evaluator-api-guard') ?? 'null')
    );
    expect(
      (guard as { blockedUntil?: number } | null)?.blockedUntil ?? 0,
      'the AI circuit breaker is cooling down, so the saved state would block AI calls'
    ).toBeLessThan(Date.now());

    // Written beside the target and renamed into place, so a reader never sees
    // half a file and a setup running alongside another engine's cannot interleave.
    const file = authFile(account);
    await mkdir(path.dirname(file), { recursive: true });
    const partial = `${file}.${process.pid}.partial`;
    await context.storageState({ path: partial, indexedDB: true });
    await rename(partial, file);

    // Prove the file lands on the workspace: a fresh context, no sign-in, no picker.
    const restored = await browser.newContext({
      storageState: file,
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      await openSavedWorkspace(await restored.newPage(), account);
    } finally {
      await restored.close();
    }
  });
}
