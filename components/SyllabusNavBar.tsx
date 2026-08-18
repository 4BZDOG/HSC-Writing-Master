import React from 'react';
import { ChevronRight, BookOpen, Layers, Folder, Hash, Pencil, Award, Link2 } from 'lucide-react';
import { Prompt } from '../types';
import { getTargetBand, getCommandTermInfo } from '../data/commandTerms';
import { getTierScaleConfig } from '../utils/renderUtils';

export interface SyllabusCrumb {
  label: string;
  onClick?: () => void;
}

interface SyllabusNavBarProps {
  /** Course → Topic → Sub-Topic → Dot Point (the path above the question). */
  crumbs: SyllabusCrumb[];
  prompt: Prompt;
  /** Re-open the full syllabus navigator without changing the selection. */
  onExpand: () => void;
  /** Copy a shareable link to this question (teachers/admins only). */
  onShareAssignment?: () => void;
}

const CRUMB_ICONS = [BookOpen, Layers, Folder, Hash];

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
}) => {
  const verbInfo = getCommandTermInfo(prompt.verb);
  const targetBand = getTargetBand(prompt.totalMarks, verbInfo.tier);
  // Tier-identity colour; the band number stays in the text badge.
  const band = getTierScaleConfig(verbInfo.tier);

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
          {/* Path breadcrumb — each level jumps back to re-choose. */}
          <ol className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            {crumbs.map((crumb, i) => {
              const Icon = CRUMB_ICONS[Math.min(i, CRUMB_ICONS.length - 1)];
              return (
                <li key={i} className="flex items-center flex-shrink-0">
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 mx-1 text-[rgb(var(--color-text-muted))]/40" />
                  )}
                  <button
                    onClick={crumb.onClick}
                    disabled={!crumb.onClick}
                    title={crumb.onClick ? `Change ${crumb.label}` : crumb.label}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-light))]/40 disabled:hover:bg-transparent active:scale-95 transition-colors max-w-[220px]"
                  >
                    <Icon className="w-3 h-3 shrink-0 opacity-70" />
                    <span className="truncate">{crumb.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

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
