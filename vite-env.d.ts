/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. When unset, the app uses local mock auth. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key — safe to expose to the client. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Opt-in for the local demo accounts (admin/teacher/user) in PRODUCTION
   * builds. Dev builds always allow them. Without this, a production deploy
   * that forgot its Supabase vars refuses credential logins instead of
   * silently shipping a working admin/admin account.
   */
  readonly VITE_ENABLE_DEMO_AUTH?: string;
  /**
   * Which SSO buttons the login page shows, comma-separated, from
   * `google` / `azure` / `github` — e.g. `azure` for a school that signs in
   * with Microsoft only. `none` hides the section (email/password alone).
   * Unset shows all three, the behaviour before this existed. A provider must
   * also be enabled in the Supabase dashboard; listing one here does not
   * enable it.
   */
  readonly VITE_OAUTH_PROVIDERS?: string;
  /**
   * `'false'` removes self-registration — the "Create one" link and the sign-up
   * form go away, and `authService.signUp` refuses. For a deployment where
   * every account is provisioned centrally (admin-created or SSO). Unset means
   * sign-up is available.
   */
  readonly VITE_ENABLE_SIGNUP?: string;
  /**
   * Email domains permitted to hold an account, comma-separated, e.g.
   * `education.nsw.gov.au`. Sub-domains of a listed domain are accepted.
   *
   * Governs BOTH routes in: self-registration and SSO sign-in. Restricting one
   * and not the other restricts nothing — a multi-tenant Entra registration
   * accepts any Microsoft work or school account in the world.
   *
   * Unset means anyone with any address can get in, and since a new account is
   * a `student` with a daily AI budget, that is spend handed to whoever finds
   * the URL. Set it on any public deployment.
   */
  readonly VITE_ALLOWED_EMAIL_DOMAINS?: string;
  /** @deprecated Older sign-up-only name for VITE_ALLOWED_EMAIL_DOMAINS, still
   *  read as a fallback so an existing configuration keeps working. */
  readonly VITE_SIGNUP_ALLOWED_DOMAINS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  /**
   * Absolute origin of the AI proxy when the frontend is hosted somewhere
   * without serverless functions (e.g. GitHub Pages) and the API lives
   * elsewhere (e.g. Vercel): `https://your-app.vercel.app`. Leave unset for
   * same-origin hosting (Vercel serves both). The API server must set
   * ALLOWED_ORIGIN to the frontend's origin for the browser's CORS check.
   */
  readonly VITE_API_BASE_URL?: string;
  /**
   * `'true'` only on a host that cannot run the serverless AI proxy (GitHub
   * Pages). Lets the client skip a doomed request to /api/gemini. Anything else
   * — including unset — means a proxy is expected, same-origin unless
   * VITE_API_BASE_URL points elsewhere. Do NOT set this on Vercel.
   */
  readonly VITE_STATIC_HOSTING?: string;
  /** `false` opens every paid feature — pilots and demos. Unset means ON. */
  readonly VITE_MONETISATION_ENABLED?: string;
  /**
   * Plan policy overrides for this deployment — `feature:plan` pairs, e.g.
   * `sampleAnswers:free,aiContentStudio:plus`. Set the unprefixed
   * PLAN_FEATURE_OVERRIDES to the same value so the API enforces what the UI
   * shows. See services/planPolicy.ts.
   */
  readonly VITE_PLAN_FEATURE_OVERRIDES?: string;
  /** Free-tier reach, overriding the shipped defaults in services/planLimits.ts. */
  readonly VITE_FREE_TIER_EVAL_LIMIT?: string;
  readonly VITE_FREE_TIER_MAX_QUESTION_TIER?: string;
  readonly VITE_FREE_TIER_MAX_SAMPLE_BAND?: string;
  /** `true` gives free accounts the full criterion-by-criterion feedback. */
  readonly VITE_FREE_TIER_FULL_FEEDBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * The app version from package.json, injected at build time by the `define`
 * blocks in vite.config.ts / vitest.config.ts. Read it via a `typeof` guard
 * (see LoginPage) so environments without the define fall back gracefully.
 */
declare const __APP_VERSION__: string;
