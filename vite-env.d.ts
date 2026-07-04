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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
