import React, { useId } from 'react';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * One rung of the syllabus navigator: its container, its rail node, its header
 * and whatever pickers and actions the level puts inside it.
 *
 * The five levels used to be five near-identical wrappers written out longhand
 * in `PromptSelector.tsx` — container div, rail-node div, `StepHeader`, box div
 * — which is why none of them had a name, a role or a place in a list. A screen
 * reader met five anonymous boxes and, once a level was chosen, its header
 * disappeared and took the only mention of the word "Course" with it.
 *
 * Nothing here paints anything new. The class strings, the `THEMES` lookup and
 * the two class builders arrived from `PromptSelector.tsx` verbatim, so that the
 * step that gives the navigator a shape cannot also change how it looks.
 */

/** Which rung of the ladder. Drives the hue, the icon and the name. */
export type NavigatorLevel = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'question';

// Static lookup map for Tailwind classes to ensure they are not purged.
// The five journey levels use clearly separated hues (blue → purple → teal →
// pink → amber); completion is a SEPARATE semantic (emerald tick on the rail),
// so a level's hue never doubles as a status light.
export const THEMES: Record<string, any> = {
  blue: {
    activeBorder: 'border-blue-500/30 light:border-blue-600',
    activeShadow: 'shadow-blue-900/10',
    selectedBorder: 'border-blue-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]',
    headerIcon:
      'bg-blue-500/10 text-blue-400 light:bg-blue-100 light:text-blue-700 border-blue-500/20',
  },
  purple: {
    activeBorder: 'border-purple-500/30 light:border-purple-600',
    activeShadow: 'shadow-purple-900/10',
    selectedBorder: 'border-purple-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]',
    headerIcon:
      'bg-purple-500/10 text-purple-400 light:bg-purple-100 light:text-purple-700 border-purple-500/20',
  },
  teal: {
    activeBorder: 'border-teal-500/30 light:border-teal-600',
    activeShadow: 'shadow-teal-900/10',
    selectedBorder: 'border-teal-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]',
    headerIcon:
      'bg-teal-500/10 text-teal-400 light:bg-teal-100 light:text-teal-700 border-teal-500/20',
  },
  pink: {
    activeBorder: 'border-pink-500/30 light:border-pink-600',
    activeShadow: 'shadow-pink-900/10',
    selectedBorder: 'border-pink-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)]',
    headerIcon:
      'bg-pink-500/10 text-pink-400 light:bg-pink-100 light:text-pink-700 border-pink-500/20',
  },
  amber: {
    activeBorder: 'border-amber-500/30 light:border-amber-600',
    activeShadow: 'shadow-amber-900/10',
    selectedBorder: 'border-amber-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    headerIcon:
      'bg-amber-500/10 text-amber-400 light:bg-amber-100 light:text-amber-700 border-amber-500/20',
  },
  green: {
    activeBorder: 'border-emerald-500/30 light:border-emerald-600',
    activeShadow: 'shadow-emerald-900/10',
    selectedBorder: 'border-emerald-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
    headerIcon:
      'bg-emerald-500/10 text-emerald-400 light:bg-emerald-100 light:text-emerald-700 border-emerald-500/20',
  },
};

/**
 * The hue each level is painted in. A lookup rather than a prop, so that a call
 * site says which rung it is and never which colour it wants — the colours are
 * decoration and the level is the fact.
 */
const LEVEL_HUES: Record<NavigatorLevel, string> = {
  course: 'blue',
  topic: 'purple',
  subTopic: 'teal',
  dotPoint: 'pink',
  question: 'amber',
};

/**
 * Progress node on the vertical rail. One consistent semantic everywhere:
 * done = emerald tick, current = ring in the level's hue, upcoming = hollow
 * grey — the previous version glowed each dot in its level's hue, which read
 * like a random traffic light.
 *
 * Decorative: the slot around it is `aria-hidden`, and what it depicts is said
 * in words by the step's own accessible name. It used to carry "Step complete"
 * and "Current step" as `title` attributes on a `<div>`, which is not an
 * accessible name, is unreachable by keyboard and is absent on touch.
 */
const RailNode = ({
  isSelected,
  isComplete,
  colorKey,
}: {
  isSelected: boolean;
  isComplete: boolean;
  colorKey: string;
}) => {
  const theme = THEMES[colorKey] || THEMES.blue;
  const base =
    'absolute -left-[0.95rem] top-1/2 -translate-y-1/2 rounded-full transition-all duration-500 z-10 flex items-center justify-center';
  if (isComplete) {
    return (
      <div
        className={`${base} w-[1.15rem] h-[1.15rem] bg-emerald-500 border-2 border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.45)]`}
      >
        <Check className="w-3 h-3 text-white" strokeWidth={4} />
      </div>
    );
  }
  if (isSelected) {
    return <div className={`${base} w-4 h-4 border-2 scale-125 ${theme.nodeSelected}`} />;
  }
  return (
    <div
      className={`${base} w-4 h-4 border-2 bg-[rgb(var(--color-bg-surface))] light:bg-slate-200 border-white/20 light:border-slate-400 scale-90 opacity-50`}
    />
  );
};

const getContainerClasses = (isSelected: boolean, zIndex: string) => `
    relative transition-all duration-500 ease-in-out w-full ${zIndex} ${isSelected ? 'mb-1' : 'mb-6'}
  `;

const getBoxClasses = (isSelected: boolean, isActive: boolean, colorKey: string) => {
  const theme = THEMES[colorKey] || THEMES.blue; // Defensive fallback
  if (isSelected) {
    return `relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface))]/60 light:bg-white border ${theme.selectedBorder} light:border-slate-300 light:shadow-sm py-3 px-4 z-10`;
  }
  if (isActive) {
    return `relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 ${theme.activeBorder} shadow-xl ${theme.activeShadow} py-6 px-6 scale-[1.01] z-20`;
  }
  return `relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-white/5 light:border-slate-300 py-4 px-6 opacity-60 grayscale hover:grayscale-0 hover:opacity-100`;
};

interface NavigatorStepProps {
  /** Which rung of the ladder. Drives the hue, the icon and the name. */
  level: NavigatorLevel;
  /** 'Course', 'Topic', 'Sub-Topic', 'Syllabus Content', 'Question'. */
  label: string;
  icon: LucideIcon;
  isSelected: boolean;
  isComplete: boolean;
  /** What was chosen, for the step's accessible name. */
  chosenLabel?: string;
  /** Nothing to choose from yet — said in the name, not only in the empty state. */
  isEmpty?: boolean;
  zIndex: string;
  children: React.ReactNode;
}

/**
 * The step's accessible name, which has to hold the level AND its state. The
 * level's own word is the part that used to vanish: the visible header is drawn
 * only while the level is unchosen, so once a course was picked the trigger read
 * "Software Engineering, button" and nothing anywhere said "Course".
 */
const stepName = (
  label: string,
  isSelected: boolean,
  chosenLabel: string | undefined,
  isEmpty: boolean
): string => {
  if (isSelected) return `${label} — chosen: ${chosenLabel ?? ''}`.trimEnd();
  if (isEmpty) return `${label} — none available yet`;
  return `${label} — current step`;
};

const NavigatorStep: React.FC<NavigatorStepProps> = ({
  level,
  label,
  icon: Icon,
  isSelected,
  isComplete,
  chosenLabel,
  isEmpty = false,
  zIndex,
  children,
}) => {
  const nameId = useId();
  const colorKey = LEVEL_HUES[level];
  const theme = THEMES[colorKey] || THEMES.blue; // Defensive fallback
  const name = stepName(label, isSelected, chosenLabel, isEmpty);

  return (
    <div className={getContainerClasses(isSelected, zIndex)} role="listitem">
      <div
        className={getBoxClasses(isSelected, !isSelected, colorKey)}
        role="group"
        // The visible header IS the name while the level is unchosen, which is
        // the association to prefer. Once it is chosen the header goes and the
        // step has no visible text of its own, so the name becomes an attribute
        // rather than an `sr-only` copy of the chosen label: repeating the
        // question text into the DOM would put it on screen twice as far as
        // `getByText` and a find-in-page are concerned.
        aria-label={isSelected ? name : undefined}
        aria-labelledby={isSelected ? undefined : nameId}
      >
        <div
          className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center"
          aria-hidden="true"
        >
          <RailNode isSelected={isSelected} isComplete={isComplete} colorKey={colorKey} />
        </div>
        {!isSelected && (
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-md ${theme.headerIcon}`} aria-hidden="true">
              {Icon && <Icon className="w-4 h-4" />}
            </div>
            <span
              id={nameId}
              className="text-xs font-black uppercase tracking-widest text-[rgb(var(--color-text-primary))] light:text-slate-900"
            >
              {label}
              <span className="sr-only">{name.slice(label.length)}</span>
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default NavigatorStep;
