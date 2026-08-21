import React from 'react';
import { Pencil, Award, Link2 } from 'lucide-react';
import { Prompt } from '../types';
import { getTargetBand, getCommandTermInfo } from '../data/commandTerms';
import { getTierScaleConfig } from '../utils/renderUtils';
import Breadcrumb from './Breadcrumb';
import type { SyllabusCrumb } from '../types';

// The crumb shape now lives in `types.ts` so this bar and the workspace
// breadcrumb build the path from one definition, instead of two that drift
// apart. Re-exported so existing imports of `SyllabusCrumb` from here keep
// working.
export type { SyllabusCrumb };

interface SyllabusNavBarProps {
  /** Course → Topic → Sub-Topic → Dot Point (the path above the question). */
  crumbs: SyllabusCrumb[];
  prompt: Prompt;
  /** Re-open the full syllabus navigator without changing the selection. */
  onExpand: () => void;
  /**
   * The "Change" button, so `App` can hand focus to it when the navigator
   * folds. "Collapse to breadcrumb" makes its own wrapper `inert` on the click
   * that presses it; this bar is what replaces it, and this button is its
   * counterpart control.
   */
  expandButtonRef?: React.Ref<HTMLButtonElement>;
  /** Copy a shareable link to this question (teachers/admins only). */
  onShareAssignment?: () => void;
}

/**
 * The collapsed state of the syllabus navigator. Once a student has chosen a
 * course → … → question, the tall picker folds down into this single elegant
 * bar so the screen belongs to the writing. It stays a live breadcrumb: any
 * level can be clicked to jump back and re-choose, and "Change" re-opens the
 * full navigator with the current selection intact.
 */
const SyllabusNavBar: React.FC<SyllabusNavBarProps> = ({
  crumbs,
  prompt,
  onExpand,
  onShareAssignment,
  expandButtonRef,
}) => {
  const verbInfo = getCommandTermInfo(prompt.verb);
  // Clamped exactly as `PromptSelector` clamps it, so the two surfaces cannot
  // disagree about a question's tier by construction rather than by luck.
  const safeTier = Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)));
  const targetBand = getTargetBand(prompt.totalMarks, safeTier);
  // Tier-identity colour; the band number stays in the text badge.
  const band = getTierScaleConfig(safeTier);

  return (
    <div
      className={`clip-stable relative overflow-hidden rounded-[24px] border ${band.border} bg-[rgb(var(--color-bg-surface-elevated))]/50 light:bg-white backdrop-blur-xl shadow-lg animate-fade-in`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${band.gradient}`}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-4 pl-6 pr-4 py-3.5">
        <div className="min-w-0 flex-1">
          {/* Path breadcrumb — each level jumps back to re-choose. The same
              component the workspace renders, one density down. */}
          <Breadcrumb items={crumbs} size="dense" label="Syllabus path" />

          {/* The selected question + its verb / marks / target band. */}
          <div className="flex items-center gap-2.5 mt-2 pl-2">
            <span
              className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${band.solidBg} ${band.solidText} shadow-sm`}
            >
              {prompt.verb}
            </span>
            <p className="min-w-0 truncate text-[13px] font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-snug">
              {prompt.question}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-text-muted))]">
            <span>{prompt.totalMarks} marks</span>
            <span className="w-px h-3.5 bg-[rgb(var(--color-border-secondary))]" />
            <span className={`flex items-center gap-1.5 ${band.text}`}>
              <Award className="w-3.5 h-3.5" /> Band {targetBand}
            </span>
          </div>
          {onShareAssignment && (
            <button
              onClick={onShareAssignment}
              className={`flex items-center justify-center w-9 h-9 rounded-xl ${band.text} ${band.border} border ${band.bg} hover:brightness-110 active:scale-95 transition-all`}
              title="Copy assignment link — students who open it land on this question"
              aria-label="Copy assignment link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            ref={expandButtonRef}
            onClick={onExpand}
            className={`flex items-center gap-2 px-3.5 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider border ${band.border} ${band.bg} ${band.text} hover:brightness-110 active:scale-95 transition-all`}
            title="Open the syllabus navigator to change your selection"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Change</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyllabusNavBar;
