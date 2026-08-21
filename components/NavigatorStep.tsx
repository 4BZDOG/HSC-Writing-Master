import React, { useId } from 'react';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  NAV_LEVELS,
  NAV_NODE_BASE,
  NAV_NODE_COMPLETE,
  NAV_NODE_CURRENT,
  NAV_NODE_SLOT,
  NAV_STEP_BOX_ACTIVE,
  NAV_STEP_BOX_DONE,
  NAV_STEP_CONTAINER,
  NAV_STEP_EDGE,
  NAV_STEP_HEADER_LABEL,
  NAV_STEP_HEADER_TILE,
  NavigatorLevel,
} from '../utils/navigatorChrome';

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
 * Everything it wears comes from `utils/navigatorChrome.ts`, so the redesign of
 * the navigator's colour is a diff of that file rather than of this one.
 */

/**
 * Progress node on the vertical rail. Two states, because only two can occur:
 * done = emerald tick, current = ring in the level's hue. The previous version
 * glowed each dot in its level's hue, which read like a random traffic light,
 * and carried a third "not yet reached" state that could never render — a step
 * is not drawn at all until its parent is chosen.
 *
 * Decorative: the slot around it is `aria-hidden`, and what it depicts is said
 * in words by the step's own accessible name. It used to carry "Step complete"
 * and "Current step" as `title` attributes on a `<div>`, which is not an
 * accessible name, is unreachable by keyboard and is absent on touch.
 */
const RailNode = ({
  isSelected,
  isComplete,
  level,
}: {
  isSelected: boolean;
  isComplete: boolean;
  level: NavigatorLevel;
}) => {
  // The node has to agree with the box beside it. `isSelected` folds the box
  // away — the level is chosen and the reader has moved past it — so it must
  // mean "done" on the rail too. It used to mean `NAV_NODE_CURRENT`, whose own
  // doc comment reads "the step the reader is standing on", which left the ring
  // on the last CHOSEN step while the step actually being worked in wore the
  // hollow not-yet-reached dot. The rail pointed one step behind the reader.
  //
  // A step only renders once its parent is chosen, so exactly one rendered step
  // is ever unchosen: the deepest. That one is the current step, and it is the
  // only thing the ring can honestly mean.
  if (isComplete || isSelected) {
    return (
      <div className={`${NAV_NODE_BASE} ${NAV_NODE_COMPLETE}`}>
        <Check className="w-3 h-3 text-white" strokeWidth={4} />
      </div>
    );
  }
  return <div className={`${NAV_NODE_BASE} ${NAV_NODE_CURRENT} ${NAV_LEVELS[level].node}`} />;
};

/**
 * The box itself. Two states, not three: every call site draws a step that is
 * either chosen or the one being worked on, so the old third branch — the only
 * `grayscale` in the component — had never rendered.
 *
 * Neither state takes a hue any more. The box used to carry the level's colour
 * on its border and its shadow, which is the largest surface in the component
 * spent on the one thing here that means nothing.
 */
const boxClasses = (isSelected: boolean): string =>
  isSelected ? NAV_STEP_BOX_DONE : NAV_STEP_BOX_ACTIVE;

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
  const name = stepName(label, isSelected, chosenLabel, isEmpty);

  return (
    <div
      className={`${NAV_STEP_CONTAINER} ${zIndex} ${isSelected ? 'mb-1' : 'mb-6'}`}
      role="listitem"
    >
      <div
        className={boxClasses(isSelected)}
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
        {!isSelected && (
          // Where the level's hue went. Two pixels down the leading edge of the
          // step the reader is standing on — enough to tell this step from the
          // one above it, too little to read as a claim about difficulty.
          <div className={`${NAV_STEP_EDGE} ${NAV_LEVELS[level].edge}`} aria-hidden="true" />
        )}
        <div className={NAV_NODE_SLOT} aria-hidden="true">
          <RailNode isSelected={isSelected} isComplete={isComplete} level={level} />
        </div>
        {!isSelected && (
          <div className="flex items-center gap-2 mb-3">
            <div className={`${NAV_STEP_HEADER_TILE} ${NAV_LEVELS[level].icon}`} aria-hidden="true">
              {Icon && <Icon className="w-4 h-4" />}
            </div>
            <span id={nameId} className={NAV_STEP_HEADER_LABEL}>
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
