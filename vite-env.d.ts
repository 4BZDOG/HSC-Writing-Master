/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. When unset, the app uses local mock auth. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key — safe to expose to the client. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
