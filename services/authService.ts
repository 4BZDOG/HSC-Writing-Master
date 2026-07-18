import { User, UserRole, UserPreferences, UserStats } from '../types';
import {
  safeSetItem,
  safeGetItem,
  loadUserProfile,
  saveUserProfile,
  STORAGE_KEYS,
} from '../utils/storageUtils';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { Provider } from '@supabase/auth-js';

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultFocusMode: false,
  autoSave: true,
  highContrast: false,
  showTips: true,
  theme: 'dark', // Default theme
};

const DEFAULT_STATS: UserStats = {
  xp: 0,
  level: 1,
  questionsAnswered: 0,
  totalWordsWritten: 0,
  averageBand: 0,
  lastActive: Date.now(),
  streakDays: 1,
};

const MOCK_USERS: Record<string, { password: string; role: UserRole; name: string }> = {
  admin: { password: 'admin', role: 'admin', name: 'Administrator' },
  teacher: { password: 'teacher', role: 'teacher', name: 'Teacher User' },
  user: { password: 'user', role: 'user', name: 'Student User' },
};

/**
 * The demo (mock) accounts exist for local development and evaluation. A
 * production build only offers them when explicitly opted in — otherwise a
 * deploy that forgot its Supabase env vars would silently ship a working
 * admin/admin login. Guest access (read-only, local-only) is not gated.
 */
export const isDemoAuthEnabled = (): boolean =>
  Boolean(import.meta.env.DEV) || import.meta.env.VITE_ENABLE_DEMO_AUTH === 'true';

// Helper to calculate daily streak
const calculateStreak = (stats: UserStats): UserStats => {
  const now = new Date();
  const last = new Date(stats.lastActive);

  // Normalize to midnight to compare calendar days
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();

  const oneDay = 1000 * 60 * 60 * 24;
  const diffTime = today - lastDate;
  const diffDays = Math.round(diffTime / oneDay);

  let newStreak = stats.streakDays;

  if (diffDays === 1) {
    // User logged in yesterday, increment streak
    newStreak += 1;
  } else if (diffDays > 1) {
    // Missed a day or more, reset streak
    newStreak = 1;
  }
  // If diffDays === 0, do nothing (streak continues for today)

  return {
    ...stats,
    streakDays: Math.max(1, newStreak),
    lastActive: Date.now(),
  };
};

// ----------------------------------------------------------------------------
// Supabase role / profile mapping
// ----------------------------------------------------------------------------

interface ProfileRow {
  username?: string | null;
  display_name?: string | null;
  role?: string | null;
  preferences?: Partial<UserPreferences> | null;
  stats?: Partial<UserStats> | null;
  stripe_plan?: string | null;
  plan_period_end?: string | null;
}

/**
 * Supabase uses `admin | teacher | student`; the app uses `admin | teacher |
 * user | guest`. Teachers keep their own role: they can curate content and
 * moderate the review queue (the server's `is_reviewer()` covers both roles)
 * but do NOT get system-administration tools — see utils/permissions.ts for
 * the capability mapping.
 */
export const mapSupabaseRole = (role?: string | null): UserRole => {
  switch (role) {
    case 'admin':
      return 'admin';
    case 'teacher':
      return 'teacher';
    case 'student':
      return 'user';
    default:
      return 'user';
  }
};

export const mapProfileToUser = (
  authEmail: string | undefined,
  profile: ProfileRow | null
): User => {
  const username = profile?.username || authEmail || 'user';
  const stripePlan = profile?.stripe_plan as User['stripePlan'];
  return {
    username,
    role: mapSupabaseRole(profile?.role),
    displayName: profile?.display_name || username,
    preferences: { ...DEFAULT_PREFERENCES, ...(profile?.preferences || {}) },
    stats: { ...DEFAULT_STATS, ...(profile?.stats || {}) },
    ...(stripePlan && stripePlan !== 'free' ? { stripePlan } : {}),
    ...(profile?.plan_period_end ? { planPeriodEnd: profile.plan_period_end } : {}),
  };
};

// ----------------------------------------------------------------------------
// Mock auth (used when Supabase is not configured) — unchanged behaviour
// ----------------------------------------------------------------------------

const mockLogin = async (username: string, password: string): Promise<User> => {
  if (!isDemoAuthEnabled()) {
    throw new Error(
      'Sign-in is not configured for this deployment. Configure Supabase ' +
        '(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) or explicitly enable the ' +
        'demo accounts with VITE_ENABLE_DEMO_AUTH=true.'
    );
  }

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const userLower = username.toLowerCase();
  const mockUser = MOCK_USERS[userLower];

  if (mockUser && mockUser.password === password) {
    // Try to load existing profile from IndexedDB to get persistent stats/prefs
    let fullUser = await loadUserProfile(userLower);

    if (!fullUser) {
      // Initialize new profile for first-time login
      fullUser = {
        username: userLower,
        role: mockUser.role,
        displayName: mockUser.name,
        preferences: { ...DEFAULT_PREFERENCES },
        stats: { ...DEFAULT_STATS },
      };
    }

    // Update streak and last active
    fullUser.stats = calculateStreak(fullUser.stats);

    await saveUserProfile(fullUser);
    safeSetItem(STORAGE_KEYS.AUTH_USER, fullUser);

    return fullUser;
  } else {
    throw new Error('Invalid username or password');
  }
};

// ----------------------------------------------------------------------------
// Supabase auth (used when configured)
// ----------------------------------------------------------------------------

/**
 * Reads the caller's profile row. THROWS on a failed read (network/REST error)
 * and returns null only when the row genuinely does not exist. The distinction
 * matters: callers write stats/preferences back to this row, and treating a
 * transient read failure as "no profile" would overwrite the user's real data
 * with defaults (and downgrade a cached admin to 'user').
 */
const fetchProfile = async (userId: string): Promise<ProfileRow | null> => {
  // stripe_plan / plan_period_end are what the Stripe webhook writes after a
  // purchase — omitting them here silently broke the entire upgrade loop
  // (users paid, the plan never reached the client).
  const { data: profile, error } = await supabase!
    .from('profiles')
    .select('username, display_name, role, preferences, stats, stripe_plan, plan_period_end')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Profile fetch failed: ${error.message}`);
  return profile as ProfileRow | null;
};

/** Best-effort write-back of streak/preferences; only call with real data. */
const persistProfileState = async (userId: string, user: User): Promise<void> => {
  await supabase!
    .from('profiles')
    .update({ stats: user.stats, preferences: user.preferences })
    .eq('id', userId);
};

/**
 * School seat licence: members of a school with an active licence hold the
 * 'school' plan (webhook keeps schools.plan_status in sync; past_due keeps
 * the plan — same grace rule as personal subscriptions). Runs as a SEPARATE
 * soft query so a database that predates the licence columns degrades to
 * "no school plan" instead of failing the whole sign-in.
 */
const applySchoolPlan = async (userId: string, user: User): Promise<User> => {
  // A personal paid plan already covers everything the school plan grants.
  if (user.stripePlan && user.stripePlan !== 'free') return user;
  try {
    const { data, error } = await supabase!
      .from('profiles')
      .select('school:school_id (plan_status, plan_period_end)')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return user;
    const school = (Array.isArray(data.school) ? data.school[0] : data.school) as {
      plan_status?: string;
      plan_period_end?: string | null;
    } | null;
    if (school && ['active', 'trialing', 'past_due'].includes(school.plan_status ?? '')) {
      return {
        ...user,
        stripePlan: 'school',
        ...(school.plan_period_end ? { planPeriodEnd: school.plan_period_end } : {}),
      };
    }
    return user;
  } catch {
    return user;
  }
};

const supabaseLogin = async (email: string, password: string): Promise<User> => {
  const client = supabase!;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error('Invalid username or password');
  }

  let profile: ProfileRow | null = null;
  let profileReadOk = true;
  try {
    profile = await fetchProfile(data.user.id);
  } catch {
    // Transient read failure: continue the login with session defaults, but
    // remember NOT to write those defaults over the real row.
    profileReadOk = false;
  }

  let user = mapProfileToUser(data.user.email ?? email, profile);
  user.stats = calculateStreak(user.stats);
  user = await applySchoolPlan(data.user.id, user);

  if (profileReadOk) {
    await persistProfileState(data.user.id, user);
  }

  safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  return user;
};

/**
 * Auth errors that indicate a transient network problem rather than a
 * rejected/expired session. supabase-js raises AuthRetryableFetchError (status
 * 0 or undefined) when the Auth server is unreachable — being offline must NOT
 * log the user out; the whole point of the IndexedDB cache is offline use.
 */
const isTransientAuthError = (error: { name?: string; status?: number }): boolean =>
  (error.name ?? '').includes('Retryable') || error.status === 0 || error.status === undefined;

/**
 * Re-validates against the live Supabase session rather than trusting the
 * cached localStorage user. Two things this catches that the cache alone
 * cannot: (1) a session that expired/was revoked since the last visit, and
 * (2) a role change made server-side (e.g. an admin promotion) — the cached
 * `role` is otherwise stale until the next full login.
 *
 * Returns `null` only when the session is positively invalid (rejected by the
 * Auth server), signalling the caller to fall back to the login screen. On
 * transient failures (offline, flaky network) the cached user is returned
 * unchanged so the app keeps working from the local cache.
 */
const supabaseRefreshSession = async (cachedUser: User): Promise<User | null> => {
  const client = supabase!;
  const { data, error } = await client.auth.getUser();
  if (error) {
    return isTransientAuthError(error) ? cachedUser : null;
  }
  if (!data.user) {
    return null;
  }

  let profile: ProfileRow | null;
  try {
    profile = await fetchProfile(data.user.id);
  } catch {
    // Session is valid but the profile read failed — keep the cached user
    // (role, stats, preferences intact) and skip the write-back.
    return cachedUser;
  }

  let user = mapProfileToUser(data.user.email ?? cachedUser.username, profile);
  user.stats = calculateStreak(user.stats);
  user = await applySchoolPlan(data.user.id, user);

  await persistProfileState(data.user.id, user);

  safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  return user;
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    // In Supabase mode the username field is treated as the account email.
    if (isSupabaseConfigured && supabase) {
      return supabaseLogin(username, password);
    }
    return mockLogin(username, password);
  },

  loginAsGuest: async (): Promise<User> => {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const guestUser: User = {
      username: 'guest',
      role: 'guest',
      displayName: 'Guest Visitor',
      preferences: { ...DEFAULT_PREFERENCES },
      stats: { ...DEFAULT_STATS },
    };

    safeSetItem(STORAGE_KEYS.AUTH_USER, guestUser);
    return guestUser;
  },

  loginWithOAuth: async (provider: Provider): Promise<void> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('OAuth login requires Supabase to be configured.');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Origin alone drops the base path on sub-path hosting (GitHub Pages
        // serves at /<repo>/) — the provider would bounce the user to a 404
        // and the session tokens would never reach the app.
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`,
        // School computers are shared: always let the student pick the
        // account rather than silently reusing whoever signed in last.
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });
    if (error) throw new Error(error.message);
  },

  handleOAuthCallback: async (): Promise<User | null> => {
    if (!isSupabaseConfigured || !supabase) return null;

    // supabase-js processes the provider redirect (URL hash tokens or PKCE
    // ?code exchange) ASYNCHRONOUSLY after the client is created. On a fast
    // mount, getSession() runs before that finishes and reports no session —
    // which used to dump a successfully signed-in user back on the login
    // page until they manually refreshed. When the URL shows we're mid
    // OAuth-return, wait (bounded) for the SIGNED_IN event instead.
    const client = supabase;
    let session = (await client.auth.getSession()).data.session;

    if (!session) {
      const url = `${window.location.hash}${window.location.search}`;
      const isOAuthReturn = /access_token=|refresh_token=|[?&]code=/.test(url);
      if (!isOAuthReturn) return null;

      session = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          subscription.unsubscribe();
          resolve(null);
        }, 8000);
        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((_event, s) => {
          if (s) {
            clearTimeout(timer);
            subscription.unsubscribe();
            resolve(s);
          }
        });
      });
    }
    if (!session?.user) return null;
    const authUser = session.user;

    let profile: ProfileRow | null = null;
    let profileReadOk = true;
    try {
      profile = await fetchProfile(authUser.id);
    } catch {
      profileReadOk = false;
    }

    let user = mapProfileToUser(authUser.email ?? '', profile);
    user.stats = calculateStreak(user.stats);
    user = await applySchoolPlan(authUser.id, user);

    if (profileReadOk) {
      await persistProfileState(authUser.id, user);
    }

    safeSetItem(STORAGE_KEYS.AUTH_USER, user);

    // Clear leftover token/code fragments so a refresh or copied URL doesn't
    // carry credentials. (supabase-js strips the hash itself in most flows,
    // but not the PKCE ?code param.)
    try {
      if (
        /access_token=|refresh_token=|[?&]code=/.test(window.location.hash + window.location.search)
      ) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      /* cosmetic only */
    }

    return user;
  },

  logout: (): void => {
    if (isSupabaseConfigured && supabase) {
      // Fire-and-forget; the local cache clear below is what gates the UI.
      void supabase.auth.signOut();
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    }
  },

  getCurrentUser: (): User | null => {
    return safeGetItem<User | null>(STORAGE_KEYS.AUTH_USER, null);
  },

  // Called on app mount to ensure streak is updated even if user didn't explicitly log out.
  // Returns null when a cached Supabase user no longer has a valid session
  // (expired/revoked) — the caller should send them back to the login screen.
  refreshSession: async (user: User): Promise<User | null> => {
    if (user.role === 'guest') return user;

    if (isSupabaseConfigured && supabase) {
      return supabaseRefreshSession(user);
    }

    const updatedStats = calculateStreak(user.stats);

    // Only save if something changed (e.g. date changed)
    if (
      updatedStats.streakDays !== user.stats.streakDays ||
      updatedStats.lastActive !== user.stats.lastActive
    ) {
      const updatedUser = { ...user, stats: updatedStats };
      await authService.updateUser(updatedUser);
      return updatedUser;
    }
    return user;
  },

  updateUser: async (user: User): Promise<void> => {
    if (isSupabaseConfigured && supabase && user.role !== 'guest') {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from('profiles')
          .update({
            display_name: user.displayName,
            preferences: user.preferences,
            stats: user.stats,
          })
          .eq('id', data.user.id);
      }
    } else if (user.role !== 'guest') {
      await saveUserProfile(user);
    }
    safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  },
};
