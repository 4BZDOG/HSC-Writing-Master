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
