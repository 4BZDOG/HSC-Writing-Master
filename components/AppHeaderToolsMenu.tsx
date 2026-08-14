import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  Database,
  Gauge,
  HardDrive,
  KeyRound,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { isCurriculumRemote } from '../services/curriculumService';
import { canModerate, isSystemAdmin } from '../utils/permissions';
import {
  HEADER_ACTION,
  HEADER_ACTION_OPEN,
  HEADER_MENU_FOOTER,
  HEADER_MENU_GROUP_LABEL,
  HEADER_MENU_ITEM,
  HEADER_MENU_ITEM_HINT,
  HEADER_MENU_PANEL,
  HEADER_TELEMETRY,
} from '../utils/headerChrome';
import { StorageStatus } from '../utils/storageUtils';
import { ModalName } from '../hooks/useModalManager';
import { User } from '../types';

/**
 * The admin and moderator tools, behind one control.
 *
 * There were eight of them on the rail, identically dressed, in an order that
 * split the two storage tools four buttons apart — and an admin on a Supabase
 * deployment met all eight before reaching any content. They are the same eight
 * tools here, grouped by what they are for, one Tab stop instead of eight.
 *
 * The panel is NON-modal, and the mechanics are lifted from
 * `components/PdfExportOptions.tsx`, which DesignSpec §3 names as the exemplar:
 * `role="dialog"` with no `aria-modal`, no focus trap, a capture-phase Escape
 * listener, click-away on `mousedown`, and focus put back on the trigger by
 * hand because the trap that would normally do it is the thing we must not use.
 */

interface AppHeaderToolsMenuProps {
  user: User;
  storageStatus: StorageStatus;
  openModal: (name: ModalName) => void;
  onOpenAudit: () => void;
  onOpenReviewQueue: () => void;
  onOpenClassInsights: () => void;
  onOpenStudentProgress: () => void;
  onOpenUsageDashboard: () => void;
  onOpenRuntimeKeys: () => void;
}

/** Mirrors `w-64` in `HEADER_MENU_PANEL`; the clamping needs it as a number. */
const PANEL_WIDTH = 256;
/** Only used for the first frame, before the panel can be measured. */
const ESTIMATED_PANEL_HEIGHT = 360;

/**
 * `Data Vault (Import/Export/Reorder)` → `['Data Vault', 'Import/Export/Reorder']`.
 *
 * The whole string is the `title` and the accessible name, byte for byte, because
 * that is what the e2e specs select on. Showing it whole would need a panel
 * twice this wide, so the parenthetical drops to a second line — the same shape
 * as `PdfExportOptions`' rows. Deriving the two halves rather than writing them
 * out keeps one copy of each label, which is the copy the tests pin.
 */
const splitLabel = (label: string): [string, string | null] => {
  const parts = label.match(/^(.+?) \((.+)\)$/);
  return parts ? [parts[1], parts[2]] : [label, null];
};

const ToolItem: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
}> = ({ icon: Icon, label, onSelect }) => {
  const [name, hint] = splitLabel(label);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={HEADER_MENU_ITEM}
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="min-w-0">
        {name}
        {hint && <span className={HEADER_MENU_ITEM_HINT}>{hint}</span>}
      </span>
    </button>
  );
};

const ToolGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className={HEADER_MENU_GROUP_LABEL}>
        {label}
      </div>
      {children}
    </div>
  );
};

const AppHeaderToolsMenu: React.FC<AppHeaderToolsMenuProps> = ({
  user,
  storageStatus,
  openModal,
  onOpenAudit,
  onOpenReviewQueue,
  onOpenClassInsights,
  onOpenStudentProgress,
  onOpenUsageDashboard,
  onOpenRuntimeKeys,
}) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /**
   * Closing puts focus back where it came from by hand.
   *
   * `useFocusTrap` would do it, and every modal in the app leans on it for
   * exactly this — but §3 forbids a trap on a non-modal popover, because the
   * page behind this one is live and Tab is meant to walk out of it. The
   * restore is the half of the hook we still owe the keyboard user.
   */
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Right-aligned to the trigger, which sits near the right edge of the rail,
    // then clamped so it cannot hang off either side of a narrow viewport.
    const left = Math.max(
      12,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 12)
    );
    const height = panelRef.current?.offsetHeight ?? ESTIMATED_PANEL_HEIGHT;
    const below = rect.bottom + 8;
    const top =
      below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - 8) : below;
    setAnchor({ left, top });
  }, []);

  // Passive, not layout: refs are attached child-first, so a layout effect here
  // would run before the trigger has one and measure nothing.
  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    place();
    // Again with the panel measured, so a flip decided from the estimate settles
    // on the real height before anyone sees it.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, place]);

  // The header is sticky, so the trigger does not move on scroll — but the page
  // under a fixed panel does, and a resize moves the trigger for real.
  useEffect(() => {
    if (!open) return;
    const update = () => place();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, place]);

  /**
   * Escape closes THIS panel and nothing else.
   *
   * Every dismissible surface in the app listens for Escape on `window` through
   * `useEscapeKey`, which arbitrates by stack. Adding another bubble-phase
   * listener beside that stack means one press fires both, and the popover takes
   * whatever is beneath it down with it. A capture-phase listener runs on the
   * way DOWN, before any of them, so stopping propagation there leaves the stack
   * untouched: a press it never sees is a press it cannot act on. This is the
   * arbitration `PdfExportOptions` settled on, and the reason the popover
   * deliberately does not register with `useEscapeKey` at all.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  // Click-away on `mousedown` rather than `click`, so the panel is gone before
  // the click lands on whatever was underneath it. The trigger is excluded: it
  // toggles the panel itself, and closing here first would make it a button that
  // never opens anything.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // No focus restore here — the press has already moved the user somewhere
      // else, and yanking focus back to the header would be a surprise.
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const runTool = (action: () => void) => {
    close();
    action();
  };

  // A moderator on a local curriculum has no review queue to moderate, so the
  // trigger would open on nothing. Hooks first, then the gate.
  const hasTools = isSystemAdmin(user.role) || (canModerate(user.role) && isCurriculumRemote());
  if (!hasTools) return null;

  // Labelled for what the role can actually do with it. `Teaching tools` reads
  // as an insult to nobody; `Admin tools` on a teacher's screen would be a lie.
  const triggerLabel = isSystemAdmin(user.role) ? 'Admin tools' : 'Teaching tools';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={triggerLabel}
        aria-label={triggerLabel}
        className={open ? `${HEADER_ACTION} ${HEADER_ACTION_OPEN}` : HEADER_ACTION}
      >
        <SlidersHorizontal className="w-5 h-5" />
      </button>

      {open &&
        anchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            /* No `aria-modal`, and no focus trap to go with it. DesignSpec §3:
               the page behind a non-modal popover is live, and Tab is expected
               to move on out of it. */
            aria-label={triggerLabel}
            style={{ left: anchor.left, top: anchor.top }}
            className={HEADER_MENU_PANEL}
          >
            {isSystemAdmin(user.role) && (
              <ToolGroup label="Library">
                <ToolItem
                  icon={Database}
                  label="Data Vault (Import/Export/Reorder)"
                  onSelect={() => runTool(() => openModal('dataManager'))}
                />
                <ToolItem
                  icon={Activity}
                  label="Syllabus Audit Studio"
                  onSelect={() => runTool(onOpenAudit)}
                />
                <ToolItem
                  icon={HardDrive}
                  label="Internal Database Health"
                  onSelect={() => runTool(() => openModal('databaseDashboard'))}
                />
              </ToolGroup>
            )}
            {canModerate(user.role) && isCurriculumRemote() && (
              <ToolGroup label="Moderation">
                <ToolItem
                  icon={ShieldCheck}
                  label="Review Queue (approve/reject contributions)"
                  onSelect={() => runTool(onOpenReviewQueue)}
                />
                <ToolItem
                  icon={BarChart3}
                  label="Class Insights (where the cohort is struggling)"
                  onSelect={() => runTool(onOpenClassInsights)}
                />
                <ToolItem
                  icon={LineChart}
                  label="Student Progress (one student across verb groups)"
                  onSelect={() => runTool(onOpenStudentProgress)}
                />
              </ToolGroup>
            )}
            {isSystemAdmin(user.role) && (
              <ToolGroup label="AI">
                <ToolItem
                  icon={Gauge}
                  label="AI Usage Dashboard (monitor & adjust quotas)"
                  onSelect={() => runTool(onOpenUsageDashboard)}
                />
                <ToolItem
                  icon={KeyRound}
                  label="Runtime AI Keys (paste a key to test models)"
                  onSelect={() => runTool(onOpenRuntimeKeys)}
                />
              </ToolGroup>
            )}
            {/* Where the work is going. It used to be shouted from a pill on the
                rail that vanished below `lg` — loudest exactly when there was
                least room to be sure of anything. Down here it is available to
                whoever is likely to care, and the failure case does not rely on
                it: that gets its own chip on the rail. */}
            <div className={HEADER_MENU_FOOTER}>
              <span className={HEADER_TELEMETRY}>Storage · {storageStatus}</span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default AppHeaderToolsMenu;
