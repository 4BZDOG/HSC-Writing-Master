import { test, expect, Page } from '@playwright/test';
import { AGREEMENT_VERSION, QUICK_START_VERSION } from '../../data/agreementVersion';

/**
 * Class Insights / Student Progress ranking e2e — runs ONLY in the
 * `supabase-chromium` project (Supabase-configured dev server on port 3100,
 * see playwright.config.ts). Every Supabase request is intercepted, so the real
 * UI renders real components against deterministic aggregates with no backend.
 *
 * ## What this is guarding
 *
 * The weakness ranking used to sort on `low_band_rate` (attempts at band ≤ 3).
 * The Verb Gate caps a question's band at its verb's cognitive tier, so full
 * marks on an IDENTIFY question is band 1 and on an EXPLAIN question band 3 —
 * every tier 1–3 verb read 100% "struggling" however well it was answered, and
 * the ranking inverted the truth. The fixture below is deliberately the
 * pathological case: EXPLAIN is band-capped at 100% struggling while being the
 * cohort's STRONGEST verb by marks, and EVALUATE reports the lowest band ≤ 3
 * rate on the worst marks. A regression would put EXPLAIN back at the top.
 *
 * The numbers are the real aggregates from a seeded 12-student / 10-week cohort
 * over the Enterprise Computing bank (447 attempts), not invented for the test.
 */

const TEACHER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface Persona {
  id: string;
  email: string;
  role: 'teacher';
  username: string;
}

const TEACHER: Persona = {
  id: TEACHER_ID,
  email: 'demo-teacher@demo.invalid',
  role: 'teacher',
  username: 'demo.teacher',
};

/**
 * Per-verb aggregates as `get_class_analytics` returns them.
 *
 * Read the two rate columns against each other: `low_band_rate` (the old
 * ranking key) and `avg_mark_frac` (the new one) disagree about which verbs the
 * cohort is weakest on, and the mark column is the one that is comparable
 * across tiers.
 */
const BY_VERB = [
  // Band-capped at 3, so 100% "struggling" — yet the best marks on the chart.
  { label: 'EXPLAIN', attempts: 107, students: 12, avg_mark: 2.9, avg_band: 2.29, low_band_rate: 1, avg_mark_frac: 0.577 },
  // Band-capped at 1: every attempt is "struggling", every mark is half.
  { label: 'IDENTIFY', attempts: 104, students: 12, avg_mark: 1.0, avg_band: 1, low_band_rate: 1, avg_mark_frac: 0.483 },
  { label: 'Unspecified', attempts: 74, students: 12, avg_mark: 2.9, avg_band: 2.2, low_band_rate: 1, avg_mark_frac: 0.587 },
  { label: 'DESCRIBE', attempts: 55, students: 12, avg_mark: 1.8, avg_band: 1.45, low_band_rate: 1, avg_mark_frac: 0.453 },
  { label: 'DISTINGUISH', attempts: 50, students: 12, avg_mark: 3.3, avg_band: 3.1, low_band_rate: 0.9, avg_mark_frac: 0.55 },
  // The LOWEST band ≤ 3 rate — the old ranking's "least worrying" verb — on
  // nearly half the available marks lost.
  { label: 'EVALUATE', attempts: 23, students: 11, avg_mark: 4.3, avg_band: 3.48, low_band_rate: 0.435, avg_mark_frac: 0.532 },
  { label: 'OUTLINE', attempts: 23, students: 10, avg_mark: 1.6, avg_band: 1.3, low_band_rate: 1, avg_mark_frac: 0.543 },
  // Weakest by marks after DESCRIBE.
  { label: 'ASSESS', attempts: 11, students: 7, avg_mark: 3.2, avg_band: 2.82, low_band_rate: 0.727, avg_mark_frac: 0.455 },
];

const BY_TOPIC = [
  { label: 'Data visualisation', attempts: 171, students: 12, avg_mark: 2.4, avg_band: 1.9, low_band_rate: 0.91, avg_mark_frac: 0.757 },
  { label: 'Intelligent systems', attempts: 104, students: 12, avg_mark: 2.2, avg_band: 1.8, low_band_rate: 1, avg_mark_frac: 0.816 },
  { label: 'Data science', attempts: 88, students: 12, avg_mark: 2.3, avg_band: 1.9, low_band_rate: 0.98, avg_mark_frac: 0.807 },
  { label: 'Enterprise project', attempts: 84, students: 12, avg_mark: 2.3, avg_band: 2.0, low_band_rate: 0.95, avg_mark_frac: 0.798 },
];

const CLASS_ANALYTICS = {
  byVerb: BY_VERB,
  byTopic: BY_TOPIC,
  totals: { total_attempts: 447, active_students: 12, avg_band: 1.99, avg_mark_frac: 0.531 },
};

const ROSTER = [
  { username: 'demo.olivia', attempts: 36, avg_band: 2.08, last_active: new Date().toISOString() },
  { username: 'demo.chen', attempts: 37, avg_band: 2.57, last_active: new Date().toISOString() },
];

/**
 * Olivia — the verb-blocked archetype, and the case the tier profile exists to
 * catch. She reaches the ceiling on recall and description and falls apart once
 * the verb demands judgement, but her overall average band (2.08) is mid-table
 * and hides it entirely.
 */
const STUDENT_PROGRESS = {
  username: 'demo.olivia',
  byVerb: [
    { label: 'IDENTIFY', attempts: 9, students: 1, avg_mark: 1, avg_band: 1, low_band_rate: 1, avg_mark_frac: 0.482 },
    { label: 'DESCRIBE', attempts: 6, students: 1, avg_mark: 3.6, avg_band: 2, low_band_rate: 1, avg_mark_frac: 0.889 },
    { label: 'EXPLAIN', attempts: 11, students: 1, avg_mark: 4.3, avg_band: 3, low_band_rate: 1, avg_mark_frac: 0.865 },
    { label: 'DISTINGUISH', attempts: 5, students: 1, avg_mark: 3, avg_band: 4, low_band_rate: 0, avg_mark_frac: 0.5 },
    { label: 'ASSESS', attempts: 2, students: 1, avg_mark: 1.8, avg_band: 2, low_band_rate: 1, avg_mark_frac: 0.25 },
    { label: 'EVALUATE', attempts: 3, students: 1, avg_mark: 2.7, avg_band: 2, low_band_rate: 1, avg_mark_frac: 0.333 },
  ],
  totals: { total_attempts: 36, active_students: 1, avg_band: 2.08, avg_mark_frac: 0.636 },
  trend: [2, 3, 2, 4, 3, 5, 4, 5, 6, 5].map((band, i) => ({
    at: new Date(Date.now() - (10 - i) * 86_400_000).toISOString(),
    band,
    mark: band,
  })),
};

/**
 * Per-student cohort fixture (get_class_cohort).
 *
 * Olivia and Kayla are the pair the heatmap exists for: Olivia reaches the
 * ceiling on recall/description and collapses on judgement, Kayla is thin
 * everywhere. Their overall bands are 2.08 and 1.15 — close enough that a
 * cohort average or a single band hides the difference entirely.
 */
const COHORT = {
  byStudent: [
    { username: 'demo.olivia', verb: 'DESCRIBE', attempts: 6, avg_band: 2, avg_mark_frac: 0.889 },
    { username: 'demo.olivia', verb: 'EXPLAIN', attempts: 11, avg_band: 3, avg_mark_frac: 0.865 },
    { username: 'demo.olivia', verb: 'EVALUATE', attempts: 3, avg_band: 2, avg_mark_frac: 0.333 },
    { username: 'demo.kayla', verb: 'DESCRIBE', attempts: 4, avg_band: 1, avg_mark_frac: 0.357 },
    { username: 'demo.kayla', verb: 'EXPLAIN', attempts: 8, avg_band: 1, avg_mark_frac: 0.233 },
    { username: 'demo.kayla', verb: 'EVALUATE', attempts: 2, avg_band: 1, avg_mark_frac: 0.2 },
    { username: 'demo.chen', verb: 'EXPLAIN', attempts: 12, avg_band: 3, avg_mark_frac: 0.817 },
    // A question carrying no marks: must render as "n/a", never as 0%.
    { username: 'demo.chen', verb: 'Unspecified', attempts: 3, avg_band: 2, avg_mark_frac: null },
  ],
  weekly: [
    // Olivia climbs, Kayla declines, Chen is flat — three shapes on one scale.
    { username: 'demo.olivia', week: 0, attempts: 4, avg_band: 2, avg_mark_frac: 0.44 },
    { username: 'demo.olivia', week: 2, attempts: 4, avg_band: 3, avg_mark_frac: 0.69 },
    { username: 'demo.olivia', week: 4, attempts: 4, avg_band: 3, avg_mark_frac: 0.78 },
    { username: 'demo.kayla', week: 0, attempts: 2, avg_band: 1, avg_mark_frac: 0.56 },
    { username: 'demo.kayla', week: 4, attempts: 2, avg_band: 1, avg_mark_frac: 0.2 },
    { username: 'demo.chen', week: 0, attempts: 5, avg_band: 3, avg_mark_frac: 0.7 },
    { username: 'demo.chen', week: 4, attempts: 5, avg_band: 3, avg_mark_frac: 0.7 },
  ],
  daily: [
    { day: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), attempts: 7 },
    { day: new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10), attempts: 11 },
  ],
  weeks: 5,
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

const json = (body: unknown, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json', ...CORS },
  body: JSON.stringify(body),
});

const authUserJson = (p: Persona) => ({
  id: p.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: p.email,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const installStub = async (page: Page, persona: Persona) => {
  await page.route('**://stub.supabase.test/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (url.pathname.endsWith('/auth/v1/token')) {
      return route.fulfill(
        json({
          access_token: `stub-access-${persona.id}`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'stub-refresh',
          user: authUserJson(persona),
        })
      );
    }
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill(json(authUserJson(persona)));
    if (url.pathname.endsWith('/auth/v1/logout')) {
      return route.fulfill({ status: 204, headers: CORS });
    }

    const restMatch = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (restMatch) {
      const isRpc = Boolean(restMatch[1]);
      const name = restMatch[2];

      if (isRpc) {
        if (name === 'get_class_analytics') return route.fulfill(json(CLASS_ANALYTICS));
        if (name === 'get_response_students') return route.fulfill(json(ROSTER));
        if (name === 'get_student_progress') return route.fulfill(json(STUDENT_PROGRESS));
        if (name === 'get_class_cohort') return route.fulfill(json(COHORT));
        // Quota/plan RPCs the shell calls on boot; a 204 leaves them unset,
        // which the client already treats as "not available".
        return route.fulfill({ status: 204, headers: CORS });
      }

      if (name === 'profiles') {
        if (method === 'PATCH') return route.fulfill({ status: 204, headers: CORS });
        return route.fulfill(
          json({
            username: persona.username,
            display_name: 'Ms Bennett (Demo)',
            role: persona.role,
            preferences: {},
            stats: {},
            // An established account: the agreement gate would otherwise hold
            // the app before the workspace renders. Onboarding is covered by
            // agreement-gate.spec.ts.
            agreement_version: AGREEMENT_VERSION,
            agreement_accepted_at: new Date().toISOString(),
            agreement_audience: 'teacher',
            quick_start_seen_version: QUICK_START_VERSION,
          })
        );
      }

      // Curriculum read path: empty is fine — this spec never touches the tree,
      // and the app falls back to its bundled seeds.
      return route.fulfill(json([]));
    }

    return route.fulfill(json({ error: `Unstubbed: ${method} ${url.pathname}` }, 500));
  });
};

const login = async (page: Page, persona: Persona) => {
  await page.goto('/');
  await page.fill('#username', persona.email);
  await page.fill('#password', 'stub-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  // The stubbed curriculum read path is empty (this spec never touches the
  // tree), so the app offers its first-run Content Library import. That modal
  // covers the header, and the analytics buttons live in the header.
  const skip = page.getByRole('button', { name: /skip import/i });
  await skip.click({ timeout: 30_000 }).catch(() => {
    /* Already dismissed, or a build that doesn't offer it — carry on. */
  });
  await expect(skip).toBeHidden({ timeout: 15_000 });
};

/** Dimension labels in the Class Insights table, top (weakest) first. */
const rankedLabels = async (page: Page): Promise<string[]> => {
  const cells = page.locator('table tbody tr td:first-child');
  await expect(cells.first()).toBeVisible({ timeout: 20_000 });
  const labels = await cells.allInnerTexts();
  // A verb cell also carries a tier badge, which innerText concatenates with no
  // separator ("DESCRIBEB2"). Strip that trailing badge, not the whole label —
  // topic labels contain spaces and must survive intact.
  return labels.map((t) => t.trim().replace(/\s*B\d$/, ''));
};

test.describe('Weakness ranking uses marks, not bands (stubbed Supabase)', () => {
  test.setTimeout(90_000);

  test('Class Insights ranks by marks lost, not by the band-capped rate', async ({ page }) => {
    await installStub(page, TEACHER);
    await login(page, TEACHER);

    await page.getByRole('button', { name: /class insights/i }).click();

    const verbs = await rankedLabels(page);

    // Weakest by marks: DESCRIBE (45.3%) then ASSESS (45.5%) then IDENTIFY.
    expect(verbs.slice(0, 3)).toEqual(['DESCRIBE', 'ASSESS', 'IDENTIFY']);

    // The regression guard: EXPLAIN sits at 100% band ≤ 3 but earns the most
    // marks of any verb here, so it must NOT be ranked as the top weakness.
    expect(verbs[0]).not.toBe('EXPLAIN');
    expect(verbs.indexOf('EXPLAIN')).toBeGreaterThan(verbs.indexOf('ASSESS'));

    // EVALUATE has the lowest band ≤ 3 rate (43.5%) but loses more marks than
    // EXPLAIN, so on marks it must rank as the weaker of the two.
    expect(verbs.indexOf('EVALUATE')).toBeLessThan(verbs.indexOf('EXPLAIN'));

    // Both measures are on screen: the ranked one and the band one for reference.
    await expect(page.getByRole('columnheader', { name: /marks lost/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /band ≤ 3/i })).toBeVisible();

    // The cohort headline carries the mark share the ranking is built on.
    await expect(page.getByText('53%', { exact: true }).first()).toBeVisible();

    await page.screenshot({ path: 'test-results/class-insights-marks.png', fullPage: false });
  });

  test('topic dimension ranks on marks too', async ({ page }) => {
    await installStub(page, TEACHER);
    await login(page, TEACHER);

    await page.getByRole('button', { name: /class insights/i }).click();
    await page.getByRole('button', { name: /by topic/i }).click();

    const topics = await rankedLabels(page);
    // Data visualisation loses the most marks (24.3%) despite NOT having the
    // highest band ≤ 3 rate — Intelligent systems does, at 100%, and ranks last.
    expect(topics).toEqual([
      'Data visualisation',
      'Enterprise project',
      'Data science',
      'Intelligent systems',
    ]);
  });

  test('Student Progress tier bars track marks, so they do not draw a staircase', async ({
    page,
  }) => {
    await installStub(page, TEACHER);
    await login(page, TEACHER);

    await page.getByRole('button', { name: /student progress/i }).click();

    // Pick Olivia from the roster.
    await page.getByRole('button', { name: /demo\.olivia/i }).click();

    // Her verb table shows the mark share per verb.
    await expect(page.getByRole('columnheader', { name: /^marks$/i })).toBeVisible({
      timeout: 20_000,
    });

    // The tier profile: recall/description near the ceiling, judgement far from
    // it. On the old band ÷ 6 bars this student's tier-2 bar could not have
    // exceeded 33% no matter how well she answered.
    const tierRows = page.locator('section', { hasText: 'Command verb profile' });
    await expect(tierRows.getByText('89%')).toBeVisible(); // tier 2 — at the ceiling
    await expect(tierRows.getByText('33%')).toBeVisible(); // tier 6 — collapsed

    // Overall she looks mid-table on band, which is exactly why the breakdown
    // is needed: 64% of marks overall, average band 2.1.
    await expect(page.getByText('64%', { exact: true }).first()).toBeVisible();

    await page.screenshot({ path: 'test-results/student-progress-marks.png', fullPage: false });
  });

  test('the by-student breakdown separates two students one band apart', async ({ page }) => {
    await installStub(page, TEACHER);
    await login(page, TEACHER);

    await page.getByRole('button', { name: /class insights/i }).click();
    await page.getByRole('button', { name: /by student/i }).click();

    // Heatmap: weakest student first, so Kayla leads and Chen is last.
    const names = page.locator('table tbody tr td:first-child');
    await expect(names.first()).toBeVisible({ timeout: 20_000 });
    // innerText concatenates the attempt count onto the username with no
    // separator ("demo.kayla14"), so strip the trailing digits.
    const order = (await names.allInnerTexts()).map((t) => t.trim().replace(/\s*\d+$/, ''));
    expect(order).toEqual(['demo.kayla', 'demo.olivia', 'demo.chen']);

    // Olivia's row is the point of the view: strong on tier 2, collapsed on tier 6.
    const olivia = page.locator('tr', { hasText: 'demo.olivia' });
    await expect(olivia.getByText('89%')).toBeVisible();
    await expect(olivia.getByText('33%')).toBeVisible();

    // A verb group carrying no marks reads "n/a", never 0%.
    await expect(page.locator('tr', { hasText: 'demo.chen' }).getByText('n/a')).toBeVisible();

    // Trajectories: one panel per student, with the change over the window.
    await expect(page.getByText(/Weekly trajectories/i)).toBeVisible();
    await expect(page.getByText(/▲ \+34 pts/)).toBeVisible(); // Olivia, 44% → 78%
    await expect(page.getByText(/▼ -36 pts/)).toBeVisible(); // Kayla, 56% → 20%

    // Cohort activity renders from the daily series.
    await expect(page.getByText(/Cohort activity/i)).toBeVisible();
    await expect(page.getByText(/18 attempts · peak 11\/day/)).toBeVisible();

    await page.screenshot({ path: 'test-results/cohort-breakdown.png', fullPage: false });

    // The trajectories and activity chart sit below the fold of the modal body.
    await page.getByText(/Cohort activity/i).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/cohort-breakdown-lower.png', fullPage: false });
  });
});
