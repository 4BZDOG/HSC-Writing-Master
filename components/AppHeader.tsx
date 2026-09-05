import React from 'react';
import { Sparkles, AlertTriangle, LifeBuoy, Sun, Moon } from 'lucide-react';
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
  HEADER_STORAGE_ALERT,
  HEADER_SUBLABEL,
  HEADER_WORDMARK,
} from '../utils/headerChrome';
import { StorageStatus } from '../utils/storageUtils';
import { ModalName } from '../hooks/useModalManager';
import { User } from '../types';

interface AppHeaderProps {
  user: User;
  onUpdateUser: (user: User) => void;
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
 *
 * There is no routine telemetry on the rail. API health was stated here, in the
 * bottom-left health chip and in the blocked-countdown banner all at once, and
 * the header's version was the least informative of the three; storage mode is
 * worth knowing but is not per-second news, so it moved to the profile control's
 * title and the tools popover's footer, neither of which has a breakpoint. What
 * survives on the rail is the alarm: a storage FAILURE gets a chip at every
 * width, because work that is not saving is the one thing a student must not
 * find out about later.
 */
const AppHeader: React.FC<AppHeaderProps> = ({
  user,
  onUpdateUser,
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
        <div className="flex items-center justify-end gap-2 sm:gap-4 ml-auto shrink-0">
          {/* Only when storage has actually failed, and then at every width.
              `role="status"` so it is announced when it appears rather than only
              when someone happens to look at the top of the screen. Below `lg`
              the label drops and the triangle carries it alone — the rail no
              longer wraps, and a 147px chip there would break the header it is
              warning about. `aria-label` states it in full either way, so what
              a screen reader hears does not change with the viewport. */}
          {storageStatus === 'Error' && (
            <div
              role="status"
              aria-label="Storage error — your work may not be saving"
              title="Your work may not be saving — open your profile to check storage"
              className={HEADER_STORAGE_ALERT}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Storage error</span>
            </div>
          )}
          <AppHeaderToolsMenu
            user={user}
            storageStatus={storageStatus}
            openModal={openModal}
            onOpenAudit={onOpenAudit}
            onOpenReviewQueue={onOpenReviewQueue}
            onOpenClassInsights={onOpenClassInsights}
            onOpenStudentProgress={onOpenStudentProgress}
            onOpenUsageDashboard={onOpenUsageDashboard}
            onOpenRuntimeKeys={onOpenRuntimeKeys}
          />
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
            /* Storage mode rides on the title so a student — who never sees the
               tools popover — can still find out where their work is going, at
               any width. The accessible name stays the plain sentence: the
               button opens a profile, and reading a storage mode out as part of
               its name would be noise every time focus lands on it. */
            title={`Open your profile — storage: ${storageStatus}`}
            aria-label="Open your profile"
            className={HEADER_PROFILE}
          >
            <span className="text-xs font-bold hidden sm:block text-slate-900 dark:text-white">
              {user.displayName}
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-lg">
              {user.displayName.charAt(0)}
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
