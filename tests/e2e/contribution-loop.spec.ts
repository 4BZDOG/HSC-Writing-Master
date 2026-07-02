import { test, expect, Page } from '@playwright/test';

/**
 * Contribution-loop e2e — runs ONLY in the `supabase-chromium` project, which
 * serves the app from a Supabase-configured dev server (port 3100, see
 * playwright.config.ts). Every request to the stub Supabase origin and to the
 * /api/gemini proxy is intercepted, so the real UI exercises the full
 * submit → review-queue → approve flow against deterministic fake responses,
 * with no live backend.
 */

const STUDENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// DB uuids for the seeded curriculum; the app addresses rows by legacy_id.
const COURSE_UUID = 'c0000000-0000-4000-8000-000000000001';
const TOPIC_UUID = 'c0000000-0000-4000-8000-000000000002';
const SUB_UUID = 'c0000000-0000-4000-8000-000000000003';
const DOT_UUID = 'c0000000-0000-4000-8000-000000000004';
const PROMPT_UUID = 'c0000000-0000-4000-8000-000000000005';
const PENDING_LOW_UUID = 'c0000000-0000-4000-8000-000000000006';
const PENDING_HIGH_UUID = 'c0000000-0000-4000-8000-000000000007';

const QUESTION_TEXT = 'Explain how the e2e contribution loop works.';

const curriculumRows: Record<string, unknown[]> = {
  courses: [{ id: COURSE_UUID, legacy_id: 'course-e2e-1', name: 'E2E Course', subject: 'TAS' }],
  course_outcomes: [
    { course_id: COURSE_UUID, code: 'O1', description: 'E2E outcome', position: 0 },
  ],
  topics: [
    {
      id: TOPIC_UUID,
      course_id: COURSE_UUID,
      legacy_id: 'topic-e2e-1',
      name: 'E2E Topic',
      position: 0,
      band_descriptors: [],
    },
  ],
  sub_topics: [
    {
      id: SUB_UUID,
      topic_id: TOPIC_UUID,
      legacy_id: 'sub-e2e-1',
      name: 'E2E SubTopic',
      position: 0,
    },
  ],
  dot_points: [
    {
      id: DOT_UUID,
      sub_topic_id: SUB_UUID,
      legacy_id: 'dp-e2e-1',
      description: 'E2E dot point',
      position: 0,
    },
  ],
  prompts: [
    {
      id: PROMPT_UUID,
      dot_point_id: DOT_UUID,
      legacy_id: 'prompt-e2e-1',
      question: QUESTION_TEXT,
      highlighted_question: null,
      total_marks: 5,
      verb: 'EXPLAIN',
      scenario: null,
      marking_criteria: 'E2E criteria',
      linked_outcomes: [],
      related_topics: [],
      prerequisite_knowledge: [],
      marker_notes: [],
      common_student_errors: [],
      keywords: [],
      target_performance_bands: [],
      estimated_time: null,
      is_past_hsc: false,
      hsc_year: null,
      hsc_question_number: null,
      status: 'approved',
    },
  ],
  sample_answers: [],
};

const pendingQueueRows = [
  {
    id: PENDING_LOW_UUID,
    question: 'Low quality pending question',
    created_at: '2026-01-02T00:00:00Z',
    quality_score: 35,
  },
  {
    id: PENDING_HIGH_UUID,
    question: 'High quality pending question',
    created_at: '2026-01-01T00:00:00Z',
    quality_score: 90,
  },
];

interface Persona {
  id: string;
  email: string;
  role: 'student' | 'admin';
  username: string;
}

const STUDENT: Persona = {
  id: STUDENT_ID,
  email: 'student@example.test',
  role: 'student',
  username: 'e2e-student',
};
const ADMIN: Persona = {
  id: ADMIN_ID,
  email: 'admin@example.test',
  role: 'admin',
  username: 'e2e-admin',
};

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

/** PostgREST's "0 rows for a single-object request" response (maybeSingle → null). */
const pgrstNoRows = json(
  {
    code: 'PGRST116',
    message: 'JSON object requested, multiple (or no) rows returned',
    details: 'Results contain 0 rows',
    hint: null,
  },
  406
);

/**
 * Intercepts every request to the stub Supabase origin (auth + REST) and the
 * same-origin /api/gemini proxy. Fulfilled responses are still subject to the
 * browser's CORS checks, hence the ACAO headers and the OPTIONS preflights.
 */
const installSupabaseStub = async (page: Page, persona: Persona) => {
  await page.route('**/api/gemini', (route) =>
    route.fulfill(
      json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { totalTokenCount: 1 },
        text: JSON.stringify({
          status: 'PASS',
          score: 88,
          summary: 'Well-formed question.',
          issues: [],
        }),
      })
    )
  );

  await page.route('**://stub.supabase.test/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const accept = request.headers()['accept'] ?? '';
    const wantsSingleObject = accept.includes('vnd.pgrst.object');

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }

    // ---- Auth ---------------------------------------------------------------
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
    if (url.pathname.endsWith('/auth/v1/user')) {
      return route.fulfill(json(authUserJson(persona)));
    }
    if (url.pathname.endsWith('/auth/v1/logout')) {
      return route.fulfill({ status: 204, headers: CORS });
    }

    // ---- REST ----------------------------------------------------------------
    const restMatch = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (restMatch) {
      const isRpc = Boolean(restMatch[1]);
      const table = restMatch[2];

      if (isRpc) {
        return route.fulfill({ status: 204, headers: CORS });
      }

      if (table === 'profiles') {
        if (method === 'PATCH') return route.fulfill({ status: 204, headers: CORS });
        return route.fulfill(
          json({
            username: persona.username,
            display_name: persona.username,
            role: persona.role,
            preferences: {},
            stats: {},
          })
        );
      }

      if (method === 'POST') {
        // Contribution insert: echo a fresh uuid (insert().select('id').single()).
        return route.fulfill(json({ id: 'd0000000-0000-4000-8000-00000000000d' }, 201));
      }

      // upsertOwned's existence pre-check filters by created_by. NOTE:
      // postgrest-js maybeSingle() on GET sends a plain application/json
      // Accept header and unwraps the array client-side, so this must be
      // matched by query param, not by the object Accept header — and it must
      // return an empty ARRAY ("no prior contribution"), or the app would take
      // the update branch instead of insert.
      if (method === 'GET' && url.searchParams.has('created_by')) {
        return route.fulfill(json([]));
      }

      if (wantsSingleObject) {
        // Non-GET single-object responses (e.g. insert().select().single()).
        if (table === 'dot_points') return route.fulfill(json({ id: DOT_UUID }));
        if (table === 'prompts') return route.fulfill(json({ id: PROMPT_UUID }));
        return route.fulfill(pgrstNoRows);
      }

      // Review-queue reads filter on status=eq.pending.
      if (url.searchParams.get('status') === 'eq.pending') {
        return route.fulfill(json(table === 'prompts' ? pendingQueueRows : []));
      }

      return route.fulfill(json(curriculumRows[table] ?? []));
    }

    // Fail loudly on anything unstubbed so gaps are visible, not flaky.
    return route.fulfill(json({ error: `Unstubbed request: ${method} ${url.pathname}` }, 500));
  });
};

const login = async (page: Page, persona: Persona) => {
  await page.goto('/');
  await page.fill('#username', persona.email);
  await page.fill('#password', 'stub-password');
  await page.getByRole('button', { name: /sign in/i }).click();
};

test.describe('Shared-library contribution loop (stubbed Supabase)', () => {
  test.setTimeout(90_000);

  test('author submits a question to the shared library with an AI quality score', async ({
    page,
  }) => {
    await installSupabaseStub(page, STUDENT);
    // Deep-link to the seeded prompt so the test doesn't depend on tree UI.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'hsc-ai-evaluator-path',
        JSON.stringify({
          courseId: 'course-e2e-1',
          topicId: 'topic-e2e-1',
          subTopicId: 'sub-e2e-1',
          dotPointId: 'dp-e2e-1',
          promptId: 'prompt-e2e-1',
        })
      );
    });

    await login(page, STUDENT);

    // Curriculum came from the stubbed read path and the deep link resolved.
    await expect(page.getByText(QUESTION_TEXT).first()).toBeVisible({ timeout: 30_000 });

    const submitButton = page.getByRole('button', { name: /submit to shared library/i });
    await expect(submitButton).toBeVisible();

    const insertRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/rest/v1/prompts'),
      { timeout: 20_000 }
    );
    await submitButton.click();

    const body = (await insertRequest).postDataJSON() as Record<string, unknown>;
    expect(body.status).toBe('pending');
    expect(body.quality_score).toBe(88);
    expect(body.created_by).toBe(STUDENT_ID);
    expect(body.legacy_id).toBe('prompt-e2e-1');
    expect(body.question).toBe(QUESTION_TEXT);

    await expect(page.getByText(/AI quality score 88\/100/)).toBeVisible();
  });

  test('admin triages the review queue (lowest score first) and approves', async ({ page }) => {
    await installSupabaseStub(page, ADMIN);
    await login(page, ADMIN);

    // Admin header cluster renders once the profile role maps to admin.
    const queueButton = page.locator('button[title^="Review Queue"]');
    await expect(queueButton).toBeVisible({ timeout: 30_000 });
    await queueButton.click();

    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();

    // Lowest quality score sorts first, with the AI badge.
    const items = page.locator('li', { hasText: /pending question/ });
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Low quality pending question');
    await expect(items.first()).toContainText('AI 35/100');

    const rpcRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/rest/v1/rpc/approve_prompt'),
      { timeout: 20_000 }
    );
    await items
      .first()
      .getByRole('button', { name: /approve/i })
      .click();

    const rpcBody = (await rpcRequest).postDataJSON() as Record<string, unknown>;
    expect(rpcBody.p_id).toBe(PENDING_LOW_UUID);

    await expect(page.getByText('Published to the shared library.')).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('High quality pending question');
  });
});
