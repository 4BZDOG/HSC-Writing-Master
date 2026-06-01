import { User, UserRole, UserPreferences, UserStats } from '../types';
import {
  safeSetItem,
  safeGetItem,
  loadUserProfile,
  saveUserProfile,
  STORAGE_KEYS,
} from '../utils/storageUtils';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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

/**
 * TODO: REMOVE BEFORE PRODUCTION (SEC-02)
 * These are plaintext demo credentials for local development and the public
 * demo only. They are gated behind `VITE_ENABLE_MOCK_AUTH` so they are NOT
 * active in a production build unless that flag is explicitly set. Before any
 * real-user deployment, replace this with a proper auth provider (Supabase,
 * Firebase Auth, Clerk, etc.). See ProjectHealth.md → SEC-02 / IDEA-02.
 */
const MOCK_AUTH_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_AUTH === 'true';

const MOCK_USERS: Record<string, { password: string; role: UserRole; name: string }> =
  MOCK_AUTH_ENABLED
    ? {
        admin: { password: 'admin', role: 'admin', name: 'Administrator' },
        user: { password: 'user', role: 'user', name: 'Student User' },
      }
    : {};

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
}

/**
 * Supabase uses `admin | teacher | student`; the app uses `admin | user |
 * guest`. Teachers curate content, so they map to the app's admin
 * capabilities. (Adjust here if teachers should be restricted.)
 */
export const mapSupabaseRole = (role?: string | null): UserRole => {
  switch (role) {
    case 'admin':
    case 'teacher':
      return 'admin';
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
  return {
    username,
    role: mapSupabaseRole(profile?.role),
    displayName: profile?.display_name || username,
    preferences: { ...DEFAULT_PREFERENCES, ...(profile?.preferences || {}) },
    stats: { ...DEFAULT_STATS, ...(profile?.stats || {}) },
  };
};

// ----------------------------------------------------------------------------
// Mock auth (used when Supabase is not configured) — unchanged behaviour
// ----------------------------------------------------------------------------

const mockLogin = async (username: string, password: string): Promise<User> => {
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

const supabaseLogin = async (email: string, password: string): Promise<User> => {
  const client = supabase!;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error('Invalid username or password');
  }

  const { data: profile } = await client
    .from('profiles')
    .select('username, display_name, role, preferences, stats')
    .eq('id', data.user.id)
    .single();

  const user = mapProfileToUser(data.user.email ?? email, profile as ProfileRow | null);
  user.stats = calculateStreak(user.stats);

  // Persist the refreshed streak/preferences back to the profile (best-effort).
  await client
    .from('profiles')
    .update({ stats: user.stats, preferences: user.preferences })
    .eq('id', data.user.id);

  safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  return user;
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
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

  // Called on app mount to ensure streak is updated even if user didn't explicitly log out
  refreshSession: async (user: User): Promise<User> => {
    if (user.role === 'guest') return user;

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
