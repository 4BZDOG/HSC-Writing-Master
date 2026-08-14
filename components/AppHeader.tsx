import React from 'react';
import {
  Sparkles,
  Database,
  Activity,
  ShieldCheck,
  BarChart3,
  LineChart,
  HardDrive,
  Gauge,
  KeyRound,
  LifeBuoy,
  Sun,
  Moon,
} from 'lucide-react';
import { ApiStatus } from '../services/geminiService';
import { authService } from '../services/authService';
import { isCurriculumRemote } from '../services/curriculumService';
import { canModerate, isSystemAdmin } from '../utils/permissions';
import {
  HEADER_ACTION,
  HEADER_ADMIN_BUTTON,
  HEADER_BAR,
  HEADER_INNER,
  HEADER_MARK_TILE,
  HEADER_PROFILE,
  HEADER_SUBLABEL,
  HEADER_WORDMARK,
} from '../utils/headerChrome';
import { StorageStatus } from '../utils/storageUtils';
import { ModalName } from '../hooks/useModalManager';
import { User } from '../types';

interface AppHeaderProps {
  user: User;
  onUpdateUser: (user: User) => void;
  apiStatus: ApiStatus;
  storageStatus: StorageStatus;
  openModal: (name: ModalName) => void;
  onOpenAudit: () => void;
  onOpenReviewQueue: () => void;
  onOpenClassInsights: () => void;
  onOpenStudentProgress: () => void;
  onOpenUsageDashboard: () => void;
  onOpenRuntimeKeys: () => void;
}

/**
 * The application header. Extracted verbatim from `App.tsx` so the redesign
 * that follows has a file of its own to work in; the Focus Mode guard that
 * decides whether it renders at all stays with the app shell.
 *
 * The class strings now come from `utils/headerChrome.ts`, unchanged. What each
 * one is painted on is documented there, and that is where the redesign happens.
 */
const AppHeader: React.FC<AppHeaderProps> = ({
  user,
  onUpdateUser,
  apiStatus,
  storageStatus,
  openModal,
  onOpenAudit,
  onOpenReviewQueue,
  onOpenClassInsights,
  onOpenStudentProgress,
  onOpenUsageDashboard,
  onOpenRuntimeKeys,
}) => {
  return (
    <header className={HEADER_BAR}>
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-500 opacity-100" />
      {/* Wraps below sm so admin/moderator tool buttons drop onto their own
          row instead of overlapping the title on narrow screens. */}
      <div className={HEADER_INNER}>
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className={HEADER_MARK_TILE}>
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className={HEADER_WORDMARK}>Band 6</h1>
            <span className={HEADER_SUBLABEL}>HSC Writing Coach</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4 ml-auto">
          {(isSystemAdmin(user.role) || canModerate(user.role)) && (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:mr-2">
              {isSystemAdmin(user.role) && (
                <>
                  <button
                    onClick={() => openModal('dataManager')}
                    className={HEADER_ADMIN_BUTTON}
                    title="Data Vault (Import/Export/Reorder)"
                    aria-label="Data Vault (Import/Export/Reorder)"
                  >
                    <Database className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenAudit}
                    className={HEADER_ADMIN_BUTTON}
                    title="Syllabus Audit Studio"
                    aria-label="Syllabus Audit Studio"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                </>
              )}
              {canModerate(user.role) && isCurriculumRemote() && (
                <>
                  <button
                    onClick={onOpenReviewQueue}
                    className={HEADER_ADMIN_BUTTON}
                    title="Review Queue (approve/reject contributions)"
                    aria-label="Review Queue (approve/reject contributions)"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenClassInsights}
                    className={HEADER_ADMIN_BUTTON}
                    title="Class Insights (where the cohort is struggling)"
                    aria-label="Class Insights (where the cohort is struggling)"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenStudentProgress}
                    className={HEADER_ADMIN_BUTTON}
                    title="Student Progress (one student across verb groups)"
                    aria-label="Student Progress (one student across verb groups)"
                  >
                    <LineChart className="w-4 h-4" />
                  </button>
                </>
              )}
              {isSystemAdmin(user.role) && (
                <>
                  <button
                    onClick={() => openModal('databaseDashboard')}
                    className={HEADER_ADMIN_BUTTON}
                    title="Internal Database Health"
                    aria-label="Internal Database Health"
                  >
                    <HardDrive className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenUsageDashboard}
                    className={HEADER_ADMIN_BUTTON}
                    title="AI Usage Dashboard (monitor & adjust quotas)"
                    aria-label="AI Usage Dashboard (monitor & adjust quotas)"
                  >
                    <Gauge className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onOpenRuntimeKeys}
                    className={HEADER_ADMIN_BUTTON}
                    title="Runtime AI Keys (paste a key to test models)"
                    aria-label="Runtime AI Keys (paste a key to test models)"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="hidden lg:flex items-center gap-6 px-5 py-2 rounded-2xl bg-black/20 backdrop-blur-md border border-white/10">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${apiStatus.state === 'HEALTHY' ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`}
              />
              <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                API {apiStatus.state}
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white/80">
                {storageStatus} Active
              </span>
            </div>
          </div>
          <button
            onClick={() => openModal('quickStart')}
            title="Quick start guide, plans and the fine print"
            aria-label="Quick start guide, plans and the fine print"
            className={HEADER_ACTION}
          >
            <LifeBuoy className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              const next = user.preferences.theme === 'light' ? 'dark' : 'light';
              const updatedUser: User = {
                ...user,
                preferences: { ...user.preferences, theme: next },
              };
              onUpdateUser(updatedUser);
              authService.updateUser(updatedUser);
            }}
            title={
              user.preferences.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
            }
            aria-label={
              user.preferences.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
            }
            className={HEADER_ACTION}
          >
            {user.preferences.theme === 'light' ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => openModal('userProfile')}
            title="Open your profile"
            aria-label="Open your profile"
            className={HEADER_PROFILE}
          >
            <span className="text-xs font-bold text-white hidden sm:block">{user.displayName}</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-lg">
              {user.displayName.charAt(0)}
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
