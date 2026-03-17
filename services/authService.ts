import { User, UserRole, UserPreferences, UserStats } from '../types';
import {
  safeSetItem,
  safeGetItem,
  loadUserProfile,
  saveUserProfile,
  STORAGE_KEYS,
} from '../utils/storageUtils';

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
  user: { password: 'user', role: 'user', name: 'Student User' },
};

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

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
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
      await saveUserProfile(updatedUser);
      safeSetItem(STORAGE_KEYS.AUTH_USER, updatedUser);
      return updatedUser;
    }
    return user;
  },

  updateUser: async (user: User): Promise<void> => {
    if (user.role !== 'guest') {
      await saveUserProfile(user);
    }
    safeSetItem(STORAGE_KEYS.AUTH_USER, user);
  },
};
