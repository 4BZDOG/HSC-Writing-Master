import React from 'react';
import { Sparkles, Database, LifeBuoy, Sun, Moon } from 'lucide-react';
import { ApiStatus } from '../services/geminiService';
import { authService } from '../services/authService';
import MeshOverlay from './MeshOverlay';
import AppHeaderToolsMenu from './AppHeaderToolsMenu';
import {
  HEADER_ACTION,
  HEADER_BAR,
  HEADER_HAIRLINE,
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
 * The class strings come from `utils/headerChrome.ts`, which is where the bar's
 * appearance is decided and where what-each-value-is-painted-on is recorded.
 * The bar is a translucent token surface now, not a gradient wall, so the only
 * white-alpha left in this file sits on the brand gradient or on solid indigo.
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
      {/* Texture and edge-lighting, both below the content row's `z-10`.
          The mesh is a dark-theme flourish only. A second pass in slate was
          tried on the light rail and measured at one luminance step in 255 —
          `mix-blend-overlay` resolves to the backdrop wherever the backdrop is
          near white, whatever colour the strokes are, so no stroke colour and
          no honest opacity can make it appear. A texture nobody can see is not
          worth a second DOM node. (MeshOverlay bakes in `light:opacity-[0.06]`
          that a call site cannot outrank; that is the residue measured, and it
          is why `opacity-0` here reads as "off" without being zero.) */}
      <MeshOverlay opacity="opacity-0 dark:opacity-[0.03]" />
      <div className={HEADER_HAIRLINE} aria-hidden="true" />
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
          <AppHeaderToolsMenu
            user={user}
            openModal={openModal}
            onOpenAudit={onOpenAudit}
            onOpenReviewQueue={onOpenReviewQueue}
            onOpenClassInsights={onOpenClassInsights}
            onOpenStudentProgress={onOpenStudentProgress}
            onOpenUsageDashboard={onOpenUsageDashboard}
            onOpenRuntimeKeys={onOpenRuntimeKeys}
          />
          {/* Interim parity only: Step 7 deletes this pill outright (its facts
              are already carried by ApiHealthIndicator). It is paired here
              rather than left white-on-white for the life of one commit. */}
          <div className="hidden lg:flex items-center gap-6 px-5 py-2 rounded-2xl border bg-slate-100/70 border-slate-200 dark:bg-black/20 dark:border-white/10">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${apiStatus.state === 'HEALTHY' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'} animate-pulse`}
              />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-white/80">
                API {apiStatus.state}
              </span>
            </div>
            <div className="w-px h-4 bg-slate-300 dark:bg-white/10" />
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-white/80">
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
            <span className="text-xs font-bold hidden sm:block text-slate-900 dark:text-white">
              {user.displayName}
            </span>
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
