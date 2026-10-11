import React, { useId, useState, useMemo } from 'react';
import { Prompt, Topic, UserRole, CourseOutcome } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import { ChevronDown, Sparkles, ListChecks } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import { useSupportResource } from '../hooks/useSupportResource';
import type { SupportResourceId } from '../utils/supportEngagement';

interface AccordionSectionProps {
  title: string;
  /** Second line under the title, matching the exemplars panel's band line. */
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  band?: number;
  /** Question id — clears the "read" tick when the student moves on. */
  resetKey?: string;
  /** Which of the question's supports this panel is, for the feedback report. */
  supportId?: SupportResourceId;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  subtitle,
  icon,
  children,
  defaultOpen = false,
  band = 6,
  resetKey,
  supportId,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bandConfig = useMemo(() => getBandConfig(band), [band]);
  const panelId = useId();
  const opened = useOpenedOnce(isOpen, resetKey);
  // `resetKey` is the prompt id everywhere this panel is used for a question.
  useSupportResource(resetKey, supportId, isOpen);

  return (
    <div className={`${PANEL_SURFACE} mb-3 last:mb-0`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`w-full ${PANEL_ROW_MIN_H} py-3.5 px-5 flex items-center justify-between transition-all group ${isOpen ? PANEL_HEADER_OPEN : PANEL_HEADER_CLOSED}`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 ${isOpen ? `${bandConfig.solidBg} border-white/20 ${bandConfig.solidText} shadow-lg` : 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'}`}
          >
            {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
          </div>
          <span className="text-left">
            <span
              // The panel's NAME, so it takes the section treatment; the
              // subtitle under it stays `.t-label`, which is what makes the
              // pair read as a heading and its caption rather than two labels.
              className={`t-section block ${isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {title}
            </span>
            {subtitle && (
              <span className="t-label block text-slate-600 dark:text-slate-400">{subtitle}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <PanelReadChip show={opened && !isOpen} />
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-500 ${isOpen ? 'rotate-180 text-slate-900 dark:text-white' : ''}`}
          />
        </div>
      </button>

      {/* A grid-rows transition rather than a max-height one. The old
          `max-h-[2000px]` was a guess at how tall the content could get, and
          anything past it — a long marking guide, a stack of exemplars — was
          silently cut off with no way to scroll to it. `1fr` animates to
          whatever the content actually needs.

          `inert` while collapsed, because zero height is not zero REACH: every
          button inside a shut panel stayed in the tab order, so a keyboard user
          tabbed through controls that were not on screen and a screen reader
          read out a panel the UI had told them was closed. It costs nothing
          visually — unlike hiding the content, which would fight the animation. */}
      <div
        id={panelId}
        inert={!isOpen}
        className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="p-5 pt-0 border-t border-slate-300 dark:border-white/10">
            <div className="mt-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReferenceMaterialsProps {
  prompt: Prompt;
  topic: Topic | undefined;
  onKeywordsChange: (keywords: string[]) => void;
  onMarkingCriteriaChange: (criteria: string) => void;
  isEnriching: boolean;
  onRegenerateKeywords: () => void;
  isRegeneratingKeywords: boolean;
  regenerateError: React.ReactNode | null;
  onSuggestKeywords: () => void;
  isSuggestingKeywords: boolean;
  suggestError: React.ReactNode | null;
  userRole: UserRole;
  userAnswer?: string;
  onAddWord?: (word: string) => void;
  courseOutcomes?: CourseOutcome[];
  /** The syllabus dot point text this question sits under — one of the levels
   *  the terms panel reads to tell a must-use term from a supporting one. */
  dotPointText?: string;
  /** The sub-topic the dot point sits under — the level between it and the
   *  topic, and the last one the terms panel reads. */
  subTopicName?: string;
  /** Course → Topic → Sub-Topic → Dot Point labels, shown in the outcome modal. */
  breadcrumb?: string[];
}

const ReferenceMaterials: React.FC<ReferenceMaterialsProps> = (props) => {
  const { prompt, topic, userRole, courseOutcomes = [] } = props;

  // Only the tier's ceiling is needed here now: What's Assessed, Common
  // mistakes and Grade Standards are off the workspace for the time being, and
  // the data behind them (linked outcomes, `commonStudentErrors`,
  // `markerNotes`, band descriptors) is left untouched so they can return.
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const maxPossibleBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );

  return (
    <div className="flex flex-col gap-1 animate-fade-in">
      <AccordionSection
        title="Syllabus Terms"
        icon={<Sparkles />}
        band={4}
        resetKey={prompt.id}
        supportId="keywords"
      >
        <KeywordEditor
          {...props}
          topicName={topic?.name}
          onRegenerate={props.onRegenerateKeywords}
          isRegenerating={props.isRegeneratingKeywords}
          onSuggest={props.onSuggestKeywords}
          isSuggesting={props.isSuggestingKeywords}
        />
      </AccordionSection>

      <AccordionSection
        title="Marking Guide"
        // It said "Top level: Band 2" over an empty panel, as though a guide
        // existed and topped out there.
        subtitle={
          prompt.markingCriteria?.trim() ? `Written to Band ${maxPossibleBand}` : 'Not written yet'
        }
        icon={<ListChecks />}
        band={5}
        resetKey={prompt.id}
        supportId="markingGuide"
      >
        <MarkingCriteriaManager
          prompt={prompt}
          markingCriteria={prompt.markingCriteria || ''}
          onSave={props.onMarkingCriteriaChange}
          band={5}
          userRole={userRole}
          courseOutcomes={courseOutcomes}
          embedded
        />
      </AccordionSection>

      {/* The exemplars used to sit here, under the Marking Guide. They are now
          docked beneath the student's own writing, where the comparison that
          makes them useful actually happens — see Workspace. */}
    </div>
  );
};

export default ReferenceMaterials;
