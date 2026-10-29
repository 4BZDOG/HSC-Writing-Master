import React, { useId, useMemo, useState } from 'react';
import { Prompt, Topic, UserRole, CourseOutcome } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import { ChevronDown, Sparkles, ListChecks } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../utils/panelStyles';
import {
  HERO_HEAD_WASH,
  HERO_LIT,
  HERO_TILE,
  LADDER_EDGE_SHUT,
  LADDER_SOLID,
} from '../utils/ladderChrome';
import { ladderBandVars } from './LadderRow';
import { useOpenCriterionRequest } from '../utils/ladderLink';
import { questionCeilingBand } from '../utils/markingGuideParse';
import { classifySyllabusTerms, type SyllabusTermContext } from '../utils/syllabusTermSource';
import { PANEL_NAME, PanelReadChip, useOpenedOnce } from './PanelDisclosure';
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
  /** Opens the section each time this number CHANGES to a truthy value, so a
   *  sibling can open it from outside without owning its state. The value at
   *  mount is not a change, so it does not open the section; `defaultOpen` is
   *  what opens one on arrival. */
  forceOpenSignal?: number;
  /** Mounts the children only while the section is open. A body whose rows run
   *  work on mount (the exemplars run text metrics for every row) should not do
   *  that for a section nobody has opened. Off by default, so every other caller
   *  keeps its children mounted and its state across a fold. */
  lazy?: boolean;
  /** Draws the section as a SECONDARY hero (DesignSpec §3): a band-washed header,
   *  a solid icon tile with a glow and, while open, a lit edge with a tier glow
   *  beneath. `band` is the colour it is lit in, so a hero takes the question's
   *  ceiling band and the three reference panels of a question agree. Off by
   *  default, so every other section keeps its calm header. */
  hero?: boolean;
  /** On a phone, the body takes a narrow 12px side inset and no gap above its first
   *  child, so a panel whose rows are wide (the exemplars) gets the width. From `sm`
   *  it is the same as every other section. Off by default. */
  phoneFlush?: boolean;
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
  forceOpenSignal,
  lazy = false,
  hero = false,
  phoneFlush = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // The signal as last seen, kept as state and compared during render (the
  // React pattern for a prop that resets state), so a change opens the section
  // in the same render rather than one frame after it.
  const [seenSignal, setSeenSignal] = useState(forceOpenSignal);
  if (forceOpenSignal !== seenSignal) {
    setSeenSignal(forceOpenSignal);
    if (forceOpenSignal) setIsOpen(true);
  }
  const bandConfig = getBandConfig(band);
  const panelId = useId();
  const opened = useOpenedOnce(isOpen, resetKey);
  // `resetKey` is the prompt id everywhere this panel is used for a question.
  useSupportResource(resetKey, supportId, isOpen);

  return (
    <div
      // The band reaches the panel's own header, body divider and lit edge through
      // `--band-rgb`. Set only on a hero, so an ordinary section draws none of it.
      style={hero ? ladderBandVars(band) : undefined}
      className={`${PANEL_SURFACE} mb-3 last:mb-0 ${hero && isOpen ? HERO_LIT : ''}`}
    >
      {/* The header row is a wrapper around the disclosure, which carries the shared
          row height and the tint. The hero's wash sits on this row, behind the title. */}
      <div
        className={`group flex items-stretch ${PANEL_ROW_MIN_H} transition-all ${isOpen ? PANEL_HEADER_OPEN : PANEL_HEADER_CLOSED} ${hero ? HERO_HEAD_WASH : ''}`}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          // The name and its caption stand 36px tall, so a plain header pads 12px
          // either side to clear the shared 61px line the rest of the column stands
          // on. A hero is 40px at its tile, so it trims its padding to 10px.
          className={`flex-1 min-w-0 ${hero ? 'py-2.5' : 'py-3'} px-5 flex items-center justify-between`}
        >
          <div className="flex items-center gap-4">
            {hero ? (
              <div className={`${HERO_TILE} ${LADDER_SOLID}`}>
                {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
              </div>
            ) : (
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 ${isOpen ? `${bandConfig.solidBg} border-white/20 ${bandConfig.solidText} shadow-lg` : 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'}`}
              >
                {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
              </div>
            )}
            <span className="text-left">
              <span
                // The panel's NAME, in the heading voice; the subtitle under it
                // stays `.t-label`, which is what makes the pair read as a heading
                // and its caption rather than two labels. A hero's name is in the
                // primary ink whether it is open or not: it is the panel's
                // identity, not a state.
                className={`${PANEL_NAME} ${hero || isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {title}
              </span>
              {subtitle && (
                <span
                  className={`t-label block ${hero ? 'text-slate-700 dark:text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {subtitle}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <PanelReadChip show={opened && !isOpen} />
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-500 ${hero ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'} ${isOpen ? 'rotate-180 text-slate-900 dark:text-white' : ''}`}
            />
          </div>
        </button>
      </div>

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
          <div
            className={[
              hero
                ? `p-5 pt-0 border-t ${LADDER_EDGE_SHUT}`
                : 'p-5 pt-0 border-t border-slate-300 dark:border-white/10',
              phoneFlush ? 'max-sm:px-2 max-sm:pb-2' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* A flush panel keeps a small gap on a phone: at none, its first line
                (the syllabus terms' caption) sat on the header's rule. */}
            <div className={phoneFlush ? 'mt-5 max-sm:mt-2.5' : 'mt-5'}>
              {!lazy || isOpen ? children : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MarkingGuidePanelProps {
  prompt: Prompt;
  userRole: UserRole;
  onMarkingCriteriaChange: (criteria: string) => void;
  courseOutcomes?: CourseOutcome[];
}

/**
 * The Marking Guide panel. It is built here once, for the reference rail and for
 * Focus Mode, which have no other shared parent: both had their own copy of this
 * composition, and the two had already drifted apart.
 */
export const MarkingGuidePanel: React.FC<MarkingGuidePanelProps> = ({
  prompt,
  userRole,
  onMarkingCriteriaChange,
  courseOutcomes = [],
}) => {
  // The question's own ceiling, not a fixed band: the hero's tile takes this
  // question's tier hue, and the Sample Answers and Syllabus Terms panels read the
  // same figure, so the three headers of a question agree.
  const ceilingBand = questionCeilingBand(prompt.totalMarks, prompt.verb);
  const written = Boolean(prompt.markingCriteria?.trim());
  // Bumped to open the panel from outside it: an exemplar's "View marking criterion".
  // The guide's rows listen for the same request to scroll to the matching row.
  const [openSignal, setOpenSignal] = useState(0);
  useOpenCriterionRequest(prompt.id, () => setOpenSignal((n) => n + 1));
  return (
    <AccordionSection
      title="Marking guide"
      // The marks lead, so the header says what the guide is FOR before it says
      // where it is written to. It used to say "Top level: Band 2" over an empty
      // panel, as though a guide existed and topped out there.
      subtitle={`${prompt.totalMarks} marks · ${written ? `Written to Band ${ceilingBand}` : 'Not written yet'}`}
      icon={<ListChecks />}
      band={ceilingBand}
      hero
      phoneFlush
      resetKey={prompt.id}
      supportId="markingGuide"
      forceOpenSignal={openSignal}
    >
      <MarkingCriteriaManager
        prompt={prompt}
        markingCriteria={prompt.markingCriteria || ''}
        onSave={onMarkingCriteriaChange}
        band={ceilingBand}
        userRole={userRole}
        courseOutcomes={courseOutcomes}
        embedded
      />
    </AccordionSection>
  );
};

/**
 * The Syllabus Terms header's count: how many of the question's terms the question
 * or the syllabus it comes from names (the must-use ones), against the terms the AI
 * added around them. It is the same split `KeywordEditor` draws its two groups from,
 * so the number in the header and the groups below it cannot disagree.
 */
const termCountLabel = (keywords: string[], context: SyllabusTermContext): string => {
  if (keywords.length === 0) return 'No terms yet';
  const sources = classifySyllabusTerms(keywords, context);
  const key = keywords.filter((kw) => sources.get(kw)).length;
  return `${key} key · ${keywords.length - key} supporting`;
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

/**
 * The Syllabus Terms panel. Built here once, for the reference rail and for Focus
 * Mode, which has no rail: the two used to differ by this panel being missing from
 * Focus Mode altogether, so a student on a phone who folded the page away to write
 * lost the list of terms the marker rewards. It is the same component in both, so
 * the two cannot drift apart again.
 */
export const SyllabusTermsPanel: React.FC<
  Omit<ReferenceMaterialsProps, 'onMarkingCriteriaChange'>
> = (props) => {
  const { prompt, topic, dotPointText, subTopicName } = props;
  const topicName = topic?.name;

  // The Syllabus Terms panel was drawn in a fixed band 4 (green), beside a Marking
  // Guide in the question's own band: a visible mismatch in one column. It is the
  // question's ceiling now, like the guide and the exemplars.
  const ceilingBand = questionCeilingBand(prompt.totalMarks, prompt.verb);
  const termsSubtitle = useMemo(
    () =>
      termCountLabel(prompt.keywords ?? [], {
        question: prompt.question,
        scenario: prompt.scenario,
        dotPointText,
        subTopicName,
        topicName,
      }),
    [prompt.keywords, prompt.question, prompt.scenario, dotPointText, subTopicName, topicName]
  );

  return (
    <AccordionSection
      title="Syllabus terms"
      subtitle={termsSubtitle}
      icon={<Sparkles />}
      band={ceilingBand}
      hero
      phoneFlush
      resetKey={prompt.id}
      supportId="keywords"
    >
      <KeywordEditor
        {...props}
        topicName={topicName}
        onRegenerate={props.onRegenerateKeywords}
        isRegenerating={props.isRegeneratingKeywords}
        onSuggest={props.onSuggestKeywords}
        isSuggesting={props.isSuggestingKeywords}
      />
    </AccordionSection>
  );
};

const ReferenceMaterials: React.FC<ReferenceMaterialsProps> = (props) => {
  const { prompt, userRole, courseOutcomes = [] } = props;

  // What's Assessed, Common mistakes and Grade Standards are off the workspace
  // for the time being, and the data behind them (linked outcomes,
  // `commonStudentErrors`, `markerNotes`, band descriptors) is left untouched so
  // they can return.

  return (
    <div className="flex flex-col gap-1 animate-fade-in">
      <SyllabusTermsPanel {...props} />

      <MarkingGuidePanel
        prompt={prompt}
        userRole={userRole}
        onMarkingCriteriaChange={props.onMarkingCriteriaChange}
        courseOutcomes={courseOutcomes}
      />

      {/* The exemplars used to sit here, under the Marking Guide. They are now
          docked beneath the student's own writing, where the comparison that
          makes them useful actually happens — see Workspace. */}
    </div>
  );
};

export default ReferenceMaterials;
