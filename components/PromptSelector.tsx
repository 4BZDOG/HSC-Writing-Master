import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Course, StatePath, UserRole } from '../types';
import {
  canCreateCurriculum,
  canCurateContent,
  canUseAiGeneration,
  isSystemAdmin,
} from '../utils/permissions';
import Combobox, { SEARCH_THRESHOLD } from './Combobox';
import QuestionFilterBar from './QuestionFilterBar';
import {
  QuestionFilter,
  applyQuestionFilter,
  clampFilter,
  describeQuestions,
  matchesFilter,
  widestFilter,
} from '../utils/questionFilter';
import { suggestNextQuestion } from '../utils/personalOrdering';
import { LEVEL_HUE, LEVEL_TILE } from '../utils/levelColors';
import {
  SYLLABUS_YEARS,
  activeSyllabusYear,
  hasContentForYear,
  topicsForYear,
  yearShortLabel,
} from '../utils/syllabusYear';
import CoverageChip from './CoverageChip';
import { questionCoverage } from '../utils/starterQuestions';
import { useAttemptHistory } from '../hooks/useAttemptHistory';
import {
  Plus,
  Edit3,
  Trash2,
  Sparkles,
  Settings,
  Upload,
  BookOpen,
  Layers,
  FolderOpen,
  List,
  FileQuestion,
  ChevronDown,
  Book,
  ListFilter,
  Target,
  X,
  Check,
  Filter,
  RotateCcw,
  Database,
  PenTool,
  Lock,
  UploadCloud,
  Loader2,
  Link2,
  Landmark,
  History,
  GraduationCap,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import {
  getCommandTermInfo,
  getTargetBand,
  getTierTargetBand,
  tierShortLabel,
  TIER_GROUPS,
} from '../data/commandTerms';
import { getTierScaleConfig } from '../utils/renderUtils';
import { getFocusAreas, splitDotPointDescription } from '../utils/dataManagerUtils';
import FocusAreaEditorModal from './FocusAreaEditorModal';
import {
  countPastHsc,
  countPastHscInSubTopic,
  countPastHscInTopic,
  countPastHscInTopics,
  getPastHscLabel,
  isPastHscInYears,
  pastHscYears,
  readPastHscNavigatorState,
  subTopicHasPastHsc,
  topicHasPastHsc,
  dotPointHasPastHsc,
  writePastHscNavigatorState,
  type PastHscNavigatorState,
} from '../utils/pastHscUtils';
import {
  describeAccess,
  isFeatureLocked,
  isQuestionTierLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { isCourseDemandAvailable } from '../services/courseDemandService';
import { PlusLockChip } from './UpgradeModal';
import { parseSyllabusStructure } from '../services/geminiService';

interface PromptSelectorProps {
  courses: Course[];
  statePath: StatePath;
  onPathChange: (path: Partial<StatePath>) => void;
  onAddCourse: () => void;
  /**
   * Open the "request a course" flow, pre-filled with whatever the user was
   * searching for. Absent when the caller has no backend to log demand into.
   */
  onRequestCourse?: (prefillName?: string) => void;
  /** Admin-only publication toggle — flips a course between draft and published. */
  onToggleCourseStatus: (courseId: string, status: 'draft' | 'published') => void;
  onAddSubTopic: () => void;
  onGeneratePrompt: () => void;
  onManualEntry: () => void;
  onEditOutcomes: () => void;
  onOpenDataManager: () => void;
  onRenameItem: (
    type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt',
    id: string,
    name: string
  ) => void;
  onDeleteItem: (target: {
    type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';
    id: string;
    name: string;
  }) => void;
  onAddTopicFromSyllabus: () => void;
  onAddTopicWithContent: (
    topicName: string,
    subTopics: { name: string; dotPoints: string[] }[]
  ) => void;
  onGenerateDotPoints: () => void;
  onImportTopic: () => void;
  onImportSyllabus: () => void;
  /** Copies a shareable link to the selected question (teachers/admins). */
  onShareAssignment?: () => void;
  /**
   * Hand-set a dot point's focus areas, or pass `undefined` to drop the
   * override and read the syllabus wording again. Absent for a caller with no
   * way to write back to the syllabus, which hides the editor.
   */
  onUpdateFocusAreas?: (dotPointId: string, focusAreas: string[] | undefined) => void;
  newlyAddedIds: Set<string>;
  userRole: UserRole;
  /**
   * The course list has not finished arriving. Until the remote fetch resolves
   * `courses` is legitimately empty, and a picker that opens onto "No options
   * available." tells a returning student their courses do not exist.
   */
  isLoading?: boolean;
  /**
   * Whether the curation rows (Add, Rename, Delete, Generate…) are showing on a
   * phone. Owned by the caller, because the toggle that sets it sits in the
   * navigator's foot beside "Hide navigator", which the caller renders. From
   * `sm` up the rows always show, whatever this says.
   */
  curationOpenOnPhone?: boolean;
}

/**
 * The width every curation group takes from `lg`, where a row is horizontal.
 * Each level's pickers end where its group begins, so they share one right edge
 * instead of ending wherever the group's own width leaves them. Right-aligned
 * inside, so a sparser row leaves its gap on the left.
 *
 * Sized per role, to the widest group THAT role sees. One width for everyone was
 * the admin's course row (seven buttons, four of them labelled), and it left a
 * teacher, whose widest row has four icons, a 380px gap between every picker and
 * its buttons. The buttons' labels show only from `2xl`, where there is room for
 * them, so below that every group is a row of icons and the column stays narrow.
 */
const curationGroupWidth = (canCreateTree: boolean): string =>
  canCreateTree
    ? 'lg:w-[20rem] 2xl:w-[33rem] lg:shrink-0'
    : 'lg:w-[11rem] 2xl:w-[19rem] lg:shrink-0';

// Static lookup map for Tailwind classes to ensure they are not purged.
// The five journey levels use clearly separated hues (blue → purple → teal →
// pink → amber); completion is a SEPARATE semantic (emerald tick on the rail),
// so a level's hue never doubles as a status light. The level → hue mapping is
// the canonical one in `utils/levelColors.ts` (`LEVEL_HUE`), consumed below;
// this THEMES table is only the hue-name → class bundle it resolves to.
/** The tier's own heading, as the cognitive spectrum names it. */
const tierGroupTitle = (tier: number): string =>
  TIER_GROUPS.find((g) => g.tier === tier)?.title ?? `Tier ${tier}`;

/**
 * The heading over the personally suggested question. It names the REASON, not
 * just the fact: "start here" with no explanation is an instruction, and a
 * student who has just scored badly deserves to know why the app is offering
 * another question at the same level rather than a harder one.
 */
const SUGGESTION_HEADINGS: Record<string, (tier: number) => string> = {
  'step-up': (tier) => `Suggested next · one step on from ${tierShortLabel(tier)}`,
  consolidate: (tier) => `Suggested next · more practice at ${tierShortLabel(tier)}`,
};

/**
 * The path's levels, outermost first, and what each is called when a move
 * discards the question below it. Order is load-bearing twice over: a cascade
 * clears everything under whichever level moved, so the FIRST key that differs
 * is the one the move was about, and the level the student is left standing on
 * is the one immediately above it.
 */
const LEVEL_KEYS = ['courseId', 'topicId', 'subTopicId', 'dotPointId'] as const;

const LEVEL_LABEL: Record<(typeof LEVEL_KEYS)[number], string> = {
  courseId: 'course',
  topicId: 'topic',
  subTopicId: 'sub-topic',
  dotPointId: 'syllabus point',
};

/**
 * One hue per level of the path — course, topic, sub-topic, syllabus point,
 * question — so a step is recognisable by colour as well as position.
 *
 * A NOTE ON `activeBorder`, because the two themes were not the same edge.
 * Dark drew it at `/30` and light at a solid `-600`: 5.38:1 against white on
 * the current step's 2px frame, where the completed step above it sits at
 * 1.48:1. Rendered, the first screen after onboarding had one hard-edged
 * purple rectangle on it and nothing else close, and unlike the workspace's
 * question and response cards — whose border is tuned to their own header —
 * this one has nothing to match: the card is white with a 28px icon tile on
 * it, and that tile's own border is `/20`. The soft edge was the intent
 * everywhere in this table except the light half of this one line.
 *
 * Now `-600/50`, which lands the current step at 2.25:1 — still half again the
 * weight of the completed step's neutral edge, and still carrying the shadow,
 * the scale and the deeper padding that also mark it. Kept at `-600` rather
 * than `-500` because the hue has to read on white.
 */
const THEMES: Record<string, any> = {
  blue: {
    activeBorder: 'border-blue-500/30 light:border-blue-600/50',
    activeShadow: 'shadow-blue-900/10',
    selectedBorder: 'border-blue-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]',
    headerIcon:
      'bg-blue-500/10 text-blue-400 light:bg-blue-100 light:text-blue-700 border-blue-500/20',
  },
  purple: {
    activeBorder: 'border-purple-500/30 light:border-purple-600/50',
    activeShadow: 'shadow-purple-900/10',
    selectedBorder: 'border-purple-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]',
    headerIcon:
      'bg-purple-500/10 text-purple-400 light:bg-purple-100 light:text-purple-700 border-purple-500/20',
  },
  teal: {
    activeBorder: 'border-teal-500/30 light:border-teal-600/50',
    activeShadow: 'shadow-teal-900/10',
    selectedBorder: 'border-teal-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]',
    headerIcon:
      'bg-teal-500/10 text-teal-400 light:bg-teal-100 light:text-teal-700 border-teal-500/20',
  },
  pink: {
    activeBorder: 'border-pink-500/30 light:border-pink-600/50',
    activeShadow: 'shadow-pink-900/10',
    selectedBorder: 'border-pink-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.4)]',
    headerIcon:
      'bg-pink-500/10 text-pink-400 light:bg-pink-100 light:text-pink-700 border-pink-500/20',
  },
  amber: {
    activeBorder: 'border-amber-500/30 light:border-amber-600/50',
    activeShadow: 'shadow-amber-900/10',
    selectedBorder: 'border-amber-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    headerIcon:
      'bg-amber-500/10 text-amber-400 light:bg-amber-100 light:text-amber-700 border-amber-500/20',
  },
  green: {
    activeBorder: 'border-emerald-500/30 light:border-emerald-600/50',
    activeShadow: 'shadow-emerald-900/10',
    selectedBorder: 'border-emerald-500/20',
    nodeSelected:
      'bg-[rgb(var(--color-bg-surface))] light:bg-white border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
    headerIcon:
      'bg-emerald-500/10 text-emerald-400 light:bg-emerald-100 light:text-emerald-700 border-emerald-500/20',
  },
};

/**
 * Three presentational pieces of the navigator, at module scope on purpose.
 *
 * They used to be declared INSIDE `PromptSelector`, which makes each of them a
 * brand-new component type on every render — so React unmounted and remounted
 * every rail node and every action button whenever anything in the picker
 * changed: a keystroke in a search box, a path change, an attempt history
 * arriving. That threw away DOM state each time, and it is why focus vanished
 * after a dialog closed: the button that opened it no longer existed, so there
 * was nothing to hand focus back to.
 *
 * None of them read component state — only module-level `THEMES`, the icons
 * they are given, and `requestUpgrade` — so hoisting them is a move, not a
 * rewrite.
 */
/**
 * Progress node on the vertical rail. One consistent semantic everywhere:
 * done = emerald tick, current = ring in the level's hue, upcoming = hollow
 * grey — the previous version glowed each dot in its level's hue, which read
 * like a random traffic light.
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
  // Plays once when a step first turns complete — either right as this node
  // mounts already-done, or the moment the user's own action completes it —
  // and never replays on later re-renders while it merely stays complete.
  const [justCompleted, setJustCompleted] = useState(false);
  const wasComplete = useRef(false);
  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      setJustCompleted(true);
    }
    wasComplete.current = isComplete;
  }, [isComplete]);

  if (isComplete) {
    return (
      <div
        className={`${base} w-[1.15rem] h-[1.15rem] bg-emerald-500 border-2 border-emerald-400/60 ${justCompleted ? 'animate-fade-in-up-sm' : ''}`}
        title="Step complete"
      >
        <Check className="w-3 h-3 text-white" strokeWidth={4} />
      </div>
    );
  }
  if (isSelected) {
    return (
      <div
        className={`${base} w-4 h-4 border-2 scale-125 ${theme.nodeSelected}`}
        title="Current step"
      />
    );
  }
  return (
    <div
      className={`${base} w-4 h-4 border-2 bg-[rgb(var(--color-bg-surface))] light:bg-slate-200 border-white/20 light:border-slate-400 scale-90 opacity-50`}
    />
  );
};

const StepHeader = ({
  icon: Icon,
  label,
  colorKey,
}: {
  icon?: LucideIcon;
  label: string;
  colorKey: string;
}) => {
  const theme = THEMES[colorKey] || THEMES.blue; // Defensive fallback
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`p-1.5 rounded-lg ${theme.headerIcon}`}>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <span className="t-label text-[rgb(var(--color-text-primary))] light:text-slate-900">
        {label}
      </span>
    </div>
  );
};

/** An ActionButton's accessible name: its title when that contains the visible
 *  label, so the name says what the button acts on, else the label. */
const actionName = (title: string, label?: string): string =>
  !label || title.toLowerCase().includes(label.toLowerCase()) ? title : label;

const ActionButton = ({
  onClick,
  icon: Icon,
  title,
  label,
  variant = 'default',
  locked = false,
}: {
  onClick: () => void;
  icon?: LucideIcon;
  title: string;
  label?: string;
  variant?: 'default' | 'danger' | 'special' | 'primary' | 'vault';
  locked?: boolean;
}) => (
  <button
    onClick={locked ? () => requestUpgrade('aiContentStudio') : onClick}
    // 44px tall and wide on a phone, the touch floor the rest of the app keeps;
    // it steps down to the 32px it was from `sm`, where a pointer is the input.
    className={`relative p-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 ${label ? '2xl:px-3' : ''} rounded-lg transition-all duration-200 flex-shrink-0 active:scale-[0.98] border flex items-center justify-center gap-1.5 ${
      locked
        ? 'bg-amber-400/10 border-amber-400/40 text-amber-500 light:text-amber-800'
        : variant === 'danger'
          ? 'bg-red-500/10 border-red-500/20 text-red-400 light:text-red-600'
          : variant === 'special'
            ? 'bg-amber-500/10 border-amber-500/20 text-yellow-400 light:text-amber-800'
            : variant === 'primary'
              ? 'bg-indigo-600 hover:bg-indigo-500 border-transparent text-white shadow-sm'
              : variant === 'vault'
                ? 'bg-blue-600/10 light:bg-blue-50 border-blue-600/20 light:border-blue-300 text-blue-400 light:text-blue-700'
                : 'bg-[rgb(var(--color-bg-surface-inset))] border border-white/5 light:border-slate-400 text-[rgb(var(--color-text-secondary))] light:text-slate-600'
    }`}
    title={locked ? `${title} — ${describeAccess('aiContentStudio').explanation}` : title}
    // An icon-only button has no visible name, and its title alone is a weak one.
    // The label only shows from `2xl`, so below that a bare label left several
    // buttons all called "Add" or "Generate". The title is the name whenever it
    // contains the label ("Add course"), which keeps the visible word inside
    // the name where the label does show; otherwise the label.
    aria-label={actionName(title, label)}
  >
    {Icon && <Icon className="w-4 h-4" />}
    {label && <span className="t-label hidden 2xl:inline whitespace-nowrap">{label}</span>}
    {locked && (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-slate-900 flex items-center justify-center shadow-sm">
        <Lock className="w-2.5 h-2.5" />
      </span>
    )}
  </button>
);

/**
 * The Past HSC count on a navigator row. Shown only while the navigator is on,
 * and a row with none says so rather than vanishing: the selected row is kept
 * on screen even when it fails the filter, and "no past HSC" is what tells the
 * reader why it is there.
 */
const PastHscCount = ({ count, className = '' }: { count: number; className?: string }) => (
  <span
    className={`t-label flex-shrink-0 ${count > 0 ? 'text-amber-400 light:text-amber-800' : 'text-[rgb(var(--color-text-muted))]'} ${className}`}
  >
    {count > 0 ? `${count} past HSC` : 'no past HSC'}
  </span>
);

/**
 * The chip look the navigator and the question filter share, so "Past HSC"
 * reads as one control wherever it appears. Amber is the provenance colour; the
 * fill is what says pressed, as it does in QuestionFilterBar.
 */
const pastHscChipClass = (pressed: boolean): string =>
  `t-label flex items-center gap-1.5 px-2.5 py-1 min-h-11 sm:min-h-0 rounded-lg border transition-all ${
    pressed
      ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-sm'
      : 'bg-[rgb(var(--color-bg-surface))] light:bg-white text-amber-400 light:text-amber-700 border-white/10 light:border-slate-300 hover:border-amber-500/40'
  }`;

/** "a", "a and b", "a, b and c" — for the navigator's summary line. */
const joinWords = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

interface PastHscNavigatorProps {
  on: boolean;
  /** The chosen years. Empty means every year. */
  years: number[];
  /** Every year that past HSC questions in this course carry. */
  availableYears: number[];
  onToggle: () => void;
  onYearsChange: (years: number[]) => void;
  /** What the filter shows and holds back, in words. Null while it is off. */
  summary: string | null;
}

/**
 * The Past HSC switch above the syllabus picker, with its year chips and a line
 * saying what the filter is holding back. It sits under the course because the
 * years belong to the course, and the summary is here rather than in the lists
 * because a reader looking at a shorter list needs to see why it is shorter.
 */
const PastHscNavigator = ({
  on,
  years,
  availableYears,
  onToggle,
  onYearsChange,
  summary,
}: PastHscNavigatorProps) => {
  const toggleYear = (year: number) =>
    onYearsChange(
      years.includes(year)
        ? years.filter((y) => y !== year)
        : [...years, year].sort((a, b) => a - b)
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} aria-pressed={on} className={pastHscChipClass(on)}>
          <Landmark className="w-3 h-3" aria-hidden="true" />
          Past HSC
        </button>
        {on && (
          <div role="group" aria-label="Years" className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onYearsChange([])}
              aria-pressed={years.length === 0}
              className={pastHscChipClass(years.length === 0)}
            >
              All years
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                aria-pressed={years.includes(year)}
                className={pastHscChipClass(years.includes(year))}
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </div>
      {on && summary && (
        <p
          role="status"
          className="text-[10px] font-medium leading-snug text-[rgb(var(--color-text-muted))] light:text-slate-500"
        >
          {summary}
        </p>
      )}
    </div>
  );
};

const PromptSelector: React.FC<PromptSelectorProps> = ({
  courses = [],
  statePath = {} as StatePath,
  onPathChange,
  onAddCourse,
  onRequestCourse,
  onToggleCourseStatus,
  onAddSubTopic,
  onGeneratePrompt,
  onManualEntry,
  onEditOutcomes,
  onOpenDataManager,
  onRenameItem,
  onDeleteItem,
  onAddTopicFromSyllabus,
  onAddTopicWithContent,
  onGenerateDotPoints,
  onImportTopic,
  onImportSyllabus,
  onShareAssignment,
  onUpdateFocusAreas,
  newlyAddedIds,
  userRole,
  isLoading = false,
  curationOpenOnPhone = false,
}) => {
  const [focusEditorOpen, setFocusEditorOpen] = useState(false);
  const canCurate = canCurateContent(userRole);
  // Below `sm` the curation rows show only while the phone toggle is on; from
  // `sm` up they are always laid out. `sm:flex` restores the row whatever the
  // toggle says, so nothing is removed from desktop.
  const curationRowVisibility = `${curationOpenOnPhone ? 'flex' : 'hidden'} sm:flex`;
  const canGenerate = canUseAiGeneration(userRole);
  const isAdmin = isSystemAdmin(userRole);
  // Courses and topics are the shared skeleton everyone navigates, so creating
  // one is admin-only — see canCreateCurriculum in utils/permissions.ts. A
  // teacher still curates everything below a topic, and can ASK for a course
  // that doesn't exist yet through the request link under the course picker.
  const canCreateTree = canCreateCurriculum(userRole);
  const CURATION_GROUP_WIDTH = curationGroupWidth(canCreateTree);
  // Only offered to people who cannot simply ADD the course themselves, and
  // only when there is a backend to record it in — a local-only session has
  // nowhere to put the request and would be promising something it can't keep.
  // ...and not while the list is still arriving: "Can't find your course?"
  // against a list that has not loaded yet is a question nobody has been given
  // the chance to answer.
  const canRequestCourse =
    !canCreateTree && isCourseDemandAvailable(userRole) && !!onRequestCourse && !isLoading;
  // AI generation controls stay visible when gated — amber + lock, and a click
  // opens the upgrade prompt instead. See services/entitlements.
  const studioLocked = isFeatureLocked('aiContentStudio');

  const selectedCourse = courses.find((c) => c.id === statePath.courseId);
  /**
   * Which year of this course is on screen. Resolved rather than read straight
   * off the path: a course with no Year 11 content must not be left showing an
   * empty picker because the previous course had some.
   */
  // `allowEmpty` for curators: someone has to be able to stand in an empty
  // Year 11 to put the first topic in it. A student is bounced back to a year
  // that has something in it, which is the "elegantly disabled" half.
  const syllabusYear = activeSyllabusYear(selectedCourse, statePath.syllabusYear, canCurate);
  const yearTopics = useMemo(
    () => topicsForYear(selectedCourse, syllabusYear),
    [selectedCourse, syllabusYear]
  );

  // Only ever a topic of the year on screen — a path pointing into the other
  // year would otherwise keep its whole branch selected and invisible.
  const selectedTopic = yearTopics.find((t) => t.id === statePath.topicId);
  const selectedSubTopic = selectedTopic?.subTopics?.find((st) => st.id === statePath.subTopicId);
  const selectedDotPoint = selectedSubTopic?.dotPoints?.find(
    (dp) => dp.id === statePath.dotPointId
  );
  const selectedPrompt = selectedDotPoint?.prompts?.find((p) => p.id === statePath.promptId);

  // --- Past HSC navigator -------------------------------------------------
  // A filter over the whole tree, not only the question list: with it on, a
  // topic, sub-topic or syllabus point is listed only if it holds a past HSC
  // question the chosen years admit. It is offered only where the year has past
  // papers at all, and it is remembered per course, so a reader who revises from
  // the real exam papers finds the filter where they left it.
  const pastHscCourseId = statePath.courseId ?? '';
  const pastHscAvailable = useMemo(() => countPastHscInTopics(yearTopics) > 0, [yearTopics]);
  const pastHscYearList = useMemo(() => pastHscYears(yearTopics), [yearTopics]);
  // Storage is the record. The override holds what was set this visit, so the
  // filter still works in a session where storage refuses the write.
  const [pastHscOverride, setPastHscOverride] = useState<{
    courseId: string;
    state: PastHscNavigatorState;
  } | null>(null);
  const storedPastHsc = useMemo(
    () =>
      pastHscOverride?.courseId === pastHscCourseId
        ? pastHscOverride.state
        : readPastHscNavigatorState(pastHscCourseId),
    [pastHscOverride, pastHscCourseId]
  );
  // A year chosen on an earlier visit may no longer exist in this course. It is
  // dropped here rather than left selecting nothing.
  const pastHscYearsInForce = useMemo(
    () => storedPastHsc.years.filter((y) => pastHscYearList.includes(y)),
    [storedPastHsc.years, pastHscYearList]
  );
  const pastHscNavOn = pastHscAvailable && storedPastHsc.on;

  const setPastHscNav = useCallback(
    (next: PastHscNavigatorState) => {
      writePastHscNavigatorState(pastHscCourseId, next);
      setPastHscOverride({ courseId: pastHscCourseId, state: next });
    },
    [pastHscCourseId]
  );

  // The option lists the navigator actually offers. The selected node is always
  // kept in its list, so the path never points at something the picker lost.
  const pastHscTopics = useMemo(
    () =>
      pastHscNavOn
        ? yearTopics.filter(
            (t) => t.id === statePath.topicId || topicHasPastHsc(t, pastHscYearsInForce)
          )
        : yearTopics,
    [yearTopics, pastHscNavOn, pastHscYearsInForce, statePath.topicId]
  );
  const pastHscSubTopics = useMemo(() => {
    const all = selectedTopic?.subTopics ?? [];
    if (!pastHscNavOn) return all;
    return all.filter(
      (st) => st.id === statePath.subTopicId || subTopicHasPastHsc(st, pastHscYearsInForce)
    );
  }, [selectedTopic, pastHscNavOn, pastHscYearsInForce, statePath.subTopicId]);
  const pastHscDotPoints = useMemo(() => {
    const all = selectedSubTopic?.dotPoints ?? [];
    if (!pastHscNavOn) return all;
    return all.filter(
      (dp) => dp.id === statePath.dotPointId || dotPointHasPastHsc(dp, pastHscYearsInForce)
    );
  }, [selectedSubTopic, pastHscNavOn, pastHscYearsInForce, statePath.dotPointId]);
  // The question list's counterpart. Past HSC questions are filtered by the
  // question filter's own Past HSC switch, which the navigator drives; this set
  // is what the chosen years add on top of it.
  const pastHscQuestionIds = useMemo(
    () =>
      new Set(
        (selectedDotPoint?.prompts ?? [])
          .filter((p) => isPastHscInYears(p, pastHscYearsInForce))
          .map((p) => p.id)
      ),
    [selectedDotPoint, pastHscYearsInForce]
  );

  const isCourseSelected = !!selectedCourse;
  const isTopicSelected = !!selectedTopic;
  const isSubTopicSelected = !!selectedSubTopic;
  const isDotPointSelected = !!selectedDotPoint;
  const isPromptSelected = !!selectedPrompt;

  // A teacher's hand-set list wins over the parser — one resolution, shared
  // with the question generator and the AI's keyword grounding.
  const subItems = useMemo(() => getFocusAreas(selectedDotPoint), [selectedDotPoint]);

  const hasSubItems = subItems.length > 0;
  const focusAreasOverridden = !!selectedDotPoint?.focusAreas;
  const activeFocusCount = statePath.selectedSubItems?.length || 0;

  const courseOptions = useMemo(
    () =>
      courses.map((c) => {
        // One row, two renderings. The closed control also carries the meta
        // chips (Draft, Ready) below `sm`, where they take the width the name
        // needs; `inTrigger` hides them there and nowhere else, so the open
        // list still shows them on a phone.
        const row = (inTrigger: boolean) => (
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg border flex-shrink-0 ${LEVEL_TILE.course}`}>
              <Book className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{c.name}</span>
            {canCreateTree && c.status === 'draft' && (
              <span
                className={`t-label px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 light:text-amber-800 border border-amber-500/30 flex-shrink-0 ${inTrigger ? 'hidden sm:inline-flex' : ''}`}
              >
                Draft
              </span>
            )}
            {/* Both years together: the question is "is this course ready to
                show someone", and it is not ready if half of it is empty. */}
            {canCurate && (
              <CoverageChip
                coverage={questionCoverage(c)}
                label={c.name}
                className={inTrigger ? 'hidden sm:inline-flex' : ''}
              />
            )}
          </div>
        );
        return {
          id: c.id,
          label: c.name,
          isNew: newlyAddedIds.has(c.id),
          renderLabel: row(false),
          renderSelected: row(true),
        };
      }),
    [courses, newlyAddedIds, canCurate, canCreateTree]
  );

  /**
   * Year 11 and Year 12 as a choice beside the course name.
   *
   * A year with nothing in it is offered but not selectable, and says why: the
   * point of showing it is that a teacher can see the year exists and needs
   * filling. Hiding it would leave them wondering whether the app knows about
   * Year 11 at all.
   */
  const yearOptions = useMemo(
    () =>
      SYLLABUS_YEARS.map((y) => {
        const available = hasContentForYear(selectedCourse, y.id);
        // A curator may go to an empty year — that is where they add the first
        // topic. Everyone else is offered it, sees that it is empty, and cannot
        // select it.
        const selectable = available || canCurate;
        return {
          id: y.id,
          label: y.label,
          disabled: !selectable,
          renderLabel: (
            <div className="flex items-center gap-3">
              <div
                className={`p-1.5 rounded-lg border flex-shrink-0 ${LEVEL_TILE.course} ${selectable ? '' : 'opacity-60'}`}
              >
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="min-w-0">
                {/* The disabled cue is on the name (a dim tone) and the tile,
                    not on the whole row: a note that says WHY the year cannot
                    be picked is information, and at 60% it measured 2.9:1 in
                    light. */}
                <span
                  className={`block font-medium leading-snug ${selectable ? '' : 'text-[rgb(var(--color-text-dim))]'}`}
                >
                  {y.label}
                </span>
                {/* Only on a row that can never be SELECTED. The trigger draws
                    the selected option's own label, so a note here would ride
                    up into the closed control and read as part of the year's
                    name. A curator who goes there gets the same message with
                    more room, from the empty state under the topic picker. */}
                {!selectable && (
                  <span className="t-label block mt-0.5 text-[rgb(var(--color-text-muted))]">
                    No content yet
                  </span>
                )}
              </span>
            </div>
          ),
        };
      }),
    [selectedCourse, canCurate]
  );

  const handleYearChange = useCallback(
    (id: string) => {
      const next = SYLLABUS_YEARS.find((y) => y.id === id)?.id;
      if (!next || next === syllabusYear) return;
      // The two years share nothing below the course, so everything under it
      // goes — a topic id from Year 12 means nothing in Year 11.
      onPathChange({
        syllabusYear: next,
        topicId: undefined,
        subTopicId: undefined,
        dotPointId: undefined,
        promptId: undefined,
        selectedSubItems: undefined,
      });
    },
    [syllabusYear, onPathChange]
  );

  const topicOptions = useMemo(
    () =>
      pastHscTopics.map((t) => {
        // As the course row: the counts are hidden in the closed control below `sm`.
        const row = (inTrigger: boolean) => (
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg border flex-shrink-0 ${LEVEL_TILE.topic}`}>
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{t.name}</span>
            {/* How much is inside, so the list says where the depth is before
                anyone opens a topic to find out. */}
            {t.subTopics?.length > 0 && (
              <span
                className={`t-label flex-shrink-0 text-[rgb(var(--color-text-muted))] ${inTrigger ? 'hidden sm:inline-flex' : ''}`}
              >
                {t.subTopics.length} sub-topic{t.subTopics.length === 1 ? '' : 's'}
              </span>
            )}
            {pastHscNavOn && (
              <PastHscCount
                count={countPastHscInTopic(t, pastHscYearsInForce)}
                className={inTrigger ? 'hidden sm:inline-flex' : ''}
              />
            )}
            {/* Per topic, so a half-finished course says WHICH half. */}
            {canCurate && (
              <CoverageChip
                coverage={questionCoverage({ topics: [t] })}
                label={t.name}
                className={inTrigger ? 'hidden sm:inline-flex' : ''}
              />
            )}
          </div>
        );
        return {
          id: t.id,
          label: t.name,
          isNew: newlyAddedIds.has(t.id),
          renderLabel: row(false),
          renderSelected: row(true),
        };
      }),
    [pastHscTopics, newlyAddedIds, canCurate, pastHscNavOn, pastHscYearsInForce]
  );

  const subTopicOptions = useMemo(
    () =>
      pastHscSubTopics.map((st) => {
        const questionCount = st.dotPoints.reduce((n, dp) => n + (dp.prompts?.length ?? 0), 0);
        const row = (inTrigger: boolean) => (
          <div className="flex items-center gap-3">
            {/* Teal, from LEVEL_TILE: this tile was hand-written as indigo
                while the picker, the rail and levelColors all said teal. */}
            <div className={`p-1.5 rounded-lg border flex-shrink-0 ${LEVEL_TILE.subTopic}`}>
              <FolderOpen className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{st.name}</span>
            <span
              className={`t-label flex-shrink-0 text-[rgb(var(--color-text-muted))] ${inTrigger ? 'hidden sm:inline-flex' : ''}`}
            >
              {questionCount > 0
                ? `${questionCount} question${questionCount === 1 ? '' : 's'}`
                : 'No questions yet'}
            </span>
            {pastHscNavOn && (
              <PastHscCount
                count={countPastHscInSubTopic(st, pastHscYearsInForce)}
                className={inTrigger ? 'hidden sm:inline-flex' : ''}
              />
            )}
          </div>
        );
        return {
          id: st.id,
          label: st.name,
          isNew: newlyAddedIds.has(st.id),
          renderLabel: row(false),
          renderSelected: row(true),
        };
      }),
    [pastHscSubTopics, newlyAddedIds, pastHscNavOn, pastHscYearsInForce]
  );

  const dotPointOptions = useMemo(
    () =>
      pastHscDotPoints.map((dp) => {
        // The statement only. Its "including …" list is what the Active Focus
        // menu beside this one is FOR — printing it here as well made every row
        // a paragraph and said the same thing twice. `searchText` keeps the
        // hidden items findable, so typing a focus area still locates its dot
        // point.
        const { stem, items } = splitDotPointDescription(dp.description);
        const questionCount = dp.prompts?.length ?? 0;
        return {
          id: dp.id,
          label: stem,
          searchText: items.join(' '),
          isNew: newlyAddedIds.has(dp.id),
          // Chosen, the statement alone: the question step directly below
          // counts its own questions, and a count here said it twice.
          renderSelected: (
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg border flex-shrink-0 ${LEVEL_TILE.dotPoint}`}>
                <List className="w-4 h-4" />
              </div>
              <span className="min-w-0 overflow-hidden text-ellipsis font-medium">{stem}</span>
            </div>
          ),
          renderLabel: (
            <div className="flex items-start gap-3">
              <div
                className={`p-1.5 rounded-lg border mt-0.5 flex-shrink-0 ${LEVEL_TILE.dotPoint}`}
              >
                <List className="w-4 h-4" />
              </div>
              <span className="min-w-0">
                {/* `overflow-hidden text-ellipsis` rather than `truncate`: in the
                    closed control, which is `nowrap`, a long statement ends in
                    an ellipsis instead of running under the chevron; in the
                    open list, which wraps, it still reads in full. */}
                <span className="block leading-snug font-medium overflow-hidden text-ellipsis">
                  {stem}
                </span>
                {/* What is here to practise, in the muted voice every other
                    count in the picker uses. The focus-area count was emerald,
                    which is the rail's "done" colour and nothing else. */}
                <span className="t-label block mt-0.5 text-[rgb(var(--color-text-muted))]">
                  {questionCount > 0
                    ? `${questionCount} question${questionCount === 1 ? '' : 's'}`
                    : 'No questions yet'}
                  {items.length > 0 &&
                    ` · ${items.length} focus area${items.length === 1 ? '' : 's'}`}
                </span>
                {pastHscNavOn && (
                  <PastHscCount
                    count={countPastHsc(dp.prompts ?? [], pastHscYearsInForce)}
                    className="block mt-0.5"
                  />
                )}
              </span>
            </div>
          ),
        };
      }),
    [pastHscDotPoints, newlyAddedIds, pastHscNavOn, pastHscYearsInForce]
  );

  const subItemOptions = useMemo(() => {
    return subItems.map((item) => {
      const isSelected = statePath.selectedSubItems?.includes(item);
      return {
        id: item,
        label: item,
        renderLabel: (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div
                className={`p-1.5 rounded-lg border transition-all ${isSelected ? 'bg-emerald-700 text-white border-emerald-400/30' : 'bg-emerald-500/10 text-emerald-500 light:text-emerald-700 border-emerald-500/20'}`}
              >
                <Target className="w-4 h-4" />
              </div>
              {/* The theme's own text colour, not white: in the light theme the list
                  and the picker are white, and a chosen focus area vanished. */}
              <span
                className={`font-medium ${isSelected ? 'font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900' : ''}`}
              >
                {item}
              </span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-emerald-400 light:text-emerald-700" />}
          </div>
        ),
      };
    });
  }, [subItems, statePath.selectedSubItems]);

  const handleSubItemToggle = (id: string) => {
    const current = statePath.selectedSubItems || [];
    const updated = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];

    onPathChange({ selectedSubItems: updated.length > 0 ? updated : undefined });
  };

  const [inlineTopicOpen, setInlineTopicOpen] = useState(false);
  const [inlineTopicName, setInlineTopicName] = useState('');
  const [inlineSyllabusText, setInlineSyllabusText] = useState('');
  const [inlineParsing, setInlineParsing] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!inlineTopicOpen) {
      setInlineTopicName('');
      setInlineSyllabusText('');
      setInlineError(null);
      setInlineParsing(false);
    }
  }, [inlineTopicOpen]);

  const handleInlineTopicCreate = useCallback(async () => {
    const name = inlineTopicName.trim();
    if (!name) return;

    // Within this year only: a Year 11 "Heredity" and a Year 12 "Heredity" are
    // two different topics, and refusing the second would be refusing a name
    // the course does not actually have.
    const existingNames = yearTopics.map((t) => t.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      // Named with the year, because the same name legitimately exists in the
      // other one — "already exists in this course" reads as a bug when it is
      // the correct answer for a different year.
      setInlineError(
        `A topic named "${name}" already exists in ${yearShortLabel(syllabusYear)} of this course.`
      );
      return;
    }

    const syllabusContent = inlineSyllabusText.trim();
    if (!syllabusContent) {
      onAddTopicWithContent(name, []);
      setInlineTopicOpen(false);
      return;
    }

    // Pasting syllabus text hands it to the plan-gated parser, so the lock
    // applies from here on. Creating the EMPTY topic above does not — that is
    // an admin capability, not a paid one — which is why the check sits below
    // the early return rather than at the top.
    if (studioLocked) {
      requestUpgrade('aiContentStudio');
      return;
    }

    setInlineParsing(true);
    setInlineError(null);
    try {
      const nodes = await parseSyllabusStructure(`Topic Name: ${name}\n\n${syllabusContent}`);
      const subTopics = nodes.length > 0 ? nodes.flatMap((n) => n.subTopics) : [];
      onAddTopicWithContent(name, subTopics);
      setInlineTopicOpen(false);
    } catch {
      setInlineError('Failed to parse syllabus text. Try again or use the full import.');
    } finally {
      setInlineParsing(false);
    }
  }, [inlineTopicName, inlineSyllabusText, onAddTopicWithContent, yearTopics, studioLocked]);

  // --- Personal ordering -------------------------------------------------
  // The app has stored every marked attempt since persistResponse landed and
  // nothing has read it back here. Two things follow: a question already
  // answered is a different object from one never attempted, and there is a
  // knowable NEXT one. Empty in local mode and for a reader with no history,
  // in which case everything below reverts to the impersonal list.
  const dotPointPromptIds = useMemo(
    () => (selectedDotPoint?.prompts ?? []).map((p) => p.id),
    [selectedDotPoint]
  );
  const attempts = useAttemptHistory(dotPointPromptIds);

  /** Every question's tier and marks — what the suggestion rule reasons over. */
  const questionShapes = useMemo(
    () =>
      (selectedDotPoint?.prompts ?? []).map((p) => ({
        id: p.id,
        tier: Math.max(1, Math.min(6, Math.floor(getCommandTermInfo(p.verb).tier || 4))),
        marks: p.totalMarks,
      })),
    [selectedDotPoint]
  );

  const suggestion = useMemo(
    () => suggestNextQuestion(questionShapes, attempts),
    [questionShapes, attempts]
  );

  const promptOptions = useMemo(() => {
    if (!selectedDotPoint?.prompts) return [];

    return (
      [...selectedDotPoint.prompts]
        .map((p) => {
          // EXACTLY the derivation chain PromptDisplay uses for the question
          // card's chrome (getCommandTermInfo → getTierScaleConfig), so a
          // question can never be one colour in the picker and another on the
          // card. The target band stays informative as TEXT (the "Band N"
          // chip) instead of silently recolouring the row.
          const verbInfo = getCommandTermInfo(p.verb);
          const safeTier = Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)));
          const tierConfig = getTierScaleConfig(safeTier);
          const targetBand = getTargetBand(p.totalMarks, safeTier);
          const tierLocked = isQuestionTierLocked(safeTier);
          // Provenance, not difficulty — hence its own amber "archive" colour
          // rather than the tier scale the rest of the row is painted in.
          const pastHsc = getPastHscLabel(p);
          // The reader's own last result on this question. "I got 4/6 on this"
          // is the fact a returning student actually navigates by, and it is
          // the one thing the row could not previously tell them.
          const attempt = attempts.get(p.id);
          const isSuggested = suggestion?.id === p.id;

          return {
            id: p.id,
            label: p.question,
            marks: p.totalMarks,
            verb: verbInfo.term,
            tier: safeTier,
            // The row is two lines in the closed control too (the title clamps
            // at two), so the control must not hold it to one.
            multiline: true,
            // Read by the refinement strip below, which filters on the same
            // three facets the row displays.
            isPastHsc: !!pastHsc,
            attempted: !!attempt,
            isNew: newlyAddedIds.has(p.id),
            disabled: tierLocked,
            // Everything the row displays but the question text does not
            // contain, so searching finds a question by how a teacher thinks
            // of it: "assess", "8 marks", "band 5", "HSC 2023".
            searchText: [
              verbInfo.term,
              `${p.totalMarks} marks`,
              `band ${targetBand}`,
              pastHsc?.text,
              attempt ? 'attempted' : 'not attempted',
            ]
              .filter(Boolean)
              .join(' '),
            renderLabel: (
              <div
                className={`flex items-start gap-3 w-full overflow-hidden p-2 rounded-lg transition-colors ${tierConfig.bg}`}
              >
                {/* A locked question says so by its lock and its `Plus` chip, and
                    by a quieter title. It used to dim the whole row with
                    `opacity-60`, which took the title and the verb chip under AA:
                    opacity fades the ink towards the ground, so the same colour
                    reads paler on every tint, and nothing in the row said why. */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${tierConfig.solidBg} ${tierConfig.border} shadow-sm`}
                >
                  {tierLocked ? (
                    <Lock className={`w-5 h-5 ${tierConfig.solidText}`} />
                  ) : (
                    <FileQuestion className={`w-5 h-5 ${tierConfig.solidText}`} />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  {/* No `block` here: `line-clamp-2` sets its own `display: -webkit-box`,
                  and a `block` on the same element voids the clamp. And
                  `whitespace-normal`, because the title inherits `nowrap` from
                  whatever wraps it: the closed control's `truncate` (lifted for this
                  row by `multiline`), or the list's option. Without it the question
                  was cut at one line, mid-word, whatever the clamp said. */}
                  <span
                    className={`leading-snug font-semibold line-clamp-2 whitespace-normal break-words ${
                      tierLocked
                        ? 'text-[rgb(var(--color-text-secondary))] light:text-slate-700'
                        : 'text-[rgb(var(--color-text-primary))] light:text-slate-900'
                    }`}
                  >
                    {p.question}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span
                      className={`t-label px-1.5 py-px rounded-lg border ${tierConfig.solidBg} ${tierConfig.solidText} ${tierConfig.border} shadow-sm`}
                    >
                      {verbInfo.term}
                    </span>
                    {/* 12px, not 10. On the light tier tints the old `slate-500` was
                    3.9–4.3:1; `slate-700` is 8.5–9.4:1 on the same six. The dark
                    token already clears 4.5:1 over the tint, so it stays. */}
                    <span className="text-xs font-mono font-bold text-[rgb(var(--color-text-muted))] light:text-slate-700">
                      {p.totalMarks} {p.totalMarks === 1 ? 'Mark' : 'Marks'}
                    </span>
                    <span
                      className={`t-label px-1.5 py-px rounded-lg border ${tierConfig.bg} ${tierConfig.text} ${tierConfig.border}`}
                      title={`A full-mark response to this question reaches Band ${targetBand}`}
                    >
                      Band {targetBand}
                    </span>
                    {pastHsc && (
                      <span
                        className="t-label flex items-center gap-1 px-1.5 py-px rounded-lg border bg-amber-500/15 light:bg-amber-100 text-amber-400 light:text-amber-800 border-amber-500/40 light:border-amber-400"
                        title={pastHsc.title}
                      >
                        <Landmark className="w-2.5 h-2.5" />
                        {pastHsc.text}
                      </span>
                    )}
                    {attempt && (
                      <span
                        className="t-label flex items-center gap-1 px-1.5 py-px rounded-lg border bg-emerald-500/15 light:bg-emerald-100 text-emerald-400 light:text-emerald-800 border-emerald-500/40 light:border-emerald-500"
                        title={
                          attempt.mark === null
                            ? 'You have answered this question'
                            : `Your last attempt scored ${attempt.mark}/${p.totalMarks}`
                        }
                      >
                        <History className="w-2.5 h-2.5" />
                        {attempt.mark === null
                          ? 'Attempted'
                          : `You: ${attempt.mark}/${p.totalMarks}`}
                      </span>
                    )}
                    {tierLocked && <PlusLockChip feature="advancedQuestions" />}
                  </div>
                </div>
              </div>
            ),
            // The cognitive tier this question sits at, named. A dot point
            // that has accumulated twenty questions is a wall of near-identical
            // tinted cards; broken into the six tier groups, the same list
            // reads as "here is the recall one, here are the two analysis
            // ones", which is how a teacher picks and how a student should
            // climb. The heading is the tier's own title (TIER_GROUPS), so the
            // picker names tiers the same way the rest of the app does.
            // The suggested question is lifted OUT of its tier group into its
            // own heading at the top rather than being repeated there — one
            // question appearing twice in a picker reads as a bug, and the
            // heading has to say what the row is doing at the top of the list.
            group: isSuggested
              ? SUGGESTION_HEADINGS[suggestion.reason](suggestion.fromTier)
              : `${tierGroupTitle(safeTier)} · Band ${getTierTargetBand(safeTier)}`,
            // Sort rank: the suggestion first, then the tier ladder.
            rank: isSuggested ? 0 : 1,
          };
        })
        // The suggestion, then tier ascending, so the groups come out in ladder
        // order and the rows inside each one climb by marks. Options MUST leave
        // here grouped — Combobox draws a heading wherever the group changes.
        .sort((a, b) => a.rank - b.rank || a.tier - b.tier || a.marks - b.marks)
    );
  }, [selectedDotPoint, newlyAddedIds, attempts, suggestion]);

  // --- Refining a long question list ------------------------------------
  // Grouping says what KIND each question is while the list is being read;
  // this is for the reader who already knows the kind they want. `null` means
  // "nothing set", which is also what a new dot point starts at — a filter
  // carried over from the previous dot point would silently shorten a list the
  // user has not looked at yet.
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter | null>(null);

  useEffect(() => {
    setQuestionFilter(null);
  }, [statePath.dotPointId]);

  const questionBounds = useMemo(() => describeQuestions(promptOptions), [promptOptions]);

  // Re-fitted on every render against the CURRENT bounds, so a question
  // generated into this dot point while a filter is set cannot leave the
  // control pointing outside the axis it now spans. While the navigator is on,
  // its Past HSC state is the question filter's `pastHscOnly`, whichever dot
  // point the reader has moved to: the dot point resets the bar, not the
  // navigator, and the list has to stay past-only through that reset.
  const activeQuestionFilter = useMemo(() => {
    const base = questionFilter
      ? clampFilter(questionFilter, questionBounds)
      : widestFilter(questionBounds);
    return pastHscNavOn ? { ...base, pastHscOnly: true } : base;
  }, [questionFilter, questionBounds, pastHscNavOn]);

  const { visiblePromptOptions, matchingQuestionCount } = useMemo(() => {
    // The chosen years are a second pass over the question list, applied on top
    // of the question filter's own past-only switch.
    const inYears = (id: string) => !pastHscNavOn || pastHscQuestionIds.has(id);
    return {
      // The selected question is pinned in even when it fails the filter: the
      // closed control renders the SELECTED option's label, so dropping it
      // would leave the picker showing a placeholder while the workspace beside
      // it displays the question.
      visiblePromptOptions: applyQuestionFilter(
        promptOptions,
        activeQuestionFilter,
        statePath.promptId
      ).filter((o) => o.id === statePath.promptId || inYears(o.id)),
      matchingQuestionCount: promptOptions.filter(
        (o) => matchesFilter(o, activeQuestionFilter) && inYears(o.id)
      ).length,
    };
  }, [promptOptions, activeQuestionFilter, statePath.promptId, pastHscNavOn, pastHscQuestionIds]);

  /**
   * The question bar's Past HSC chip is the same switch as the navigator while
   * the navigator is on, so the chip must be able to turn it off. Turning the
   * chip on does not turn the navigator on: the chip is a choice for this one
   * dot point, and the navigator's saved state is a choice for the course.
   */
  const onQuestionFilterChange = useCallback(
    (next: QuestionFilter) => {
      if (pastHscNavOn && !next.pastHscOnly) {
        setPastHscNav({ ...storedPastHsc, on: false });
      }
      setQuestionFilter(next);
    },
    [pastHscNavOn, storedPastHsc, setPastHscNav]
  );

  const togglePastHsc = useCallback(() => {
    const nextOn = !storedPastHsc.on;
    setPastHscNav({ ...storedPastHsc, on: nextOn });
    // Off must mean everything: the bar's own past-only switch is cleared too,
    // or a question list would stay shorter than the navigator says it is.
    if (!nextOn) setQuestionFilter((prev) => (prev ? { ...prev, pastHscOnly: false } : prev));
  }, [storedPastHsc, setPastHscNav]);

  /**
   * The navigator's line of account: what it shows, and how many nodes are
   * held back at each level the reader can currently see. Nothing is hidden
   * silently — the same rule the question filter follows.
   */
  const pastHscSummary = useMemo(() => {
    if (!pastHscNavOn) return null;
    const held: string[] = [];
    const count = (n: number, noun: string) => {
      if (n > 0) held.push(`${n} ${noun}${n === 1 ? '' : 's'}`);
    };
    count(yearTopics.length - pastHscTopics.length, 'topic');
    if (selectedTopic) {
      count((selectedTopic.subTopics?.length ?? 0) - pastHscSubTopics.length, 'sub-topic');
    }
    if (selectedSubTopic) {
      count((selectedSubTopic.dotPoints?.length ?? 0) - pastHscDotPoints.length, 'syllabus point');
    }
    if (selectedDotPoint) {
      const shownQuestions = promptOptions.filter(
        (o) => o.id === statePath.promptId || pastHscQuestionIds.has(o.id)
      ).length;
      count(promptOptions.length - shownQuestions, 'question');
    }
    const years =
      pastHscYearsInForce.length === 0 ? 'all years' : joinWords(pastHscYearsInForce.map(String));
    const holding = held.length > 0 ? `holding back ${joinWords(held)}` : 'nothing held back';
    return `Showing past HSC from ${years} · ${holding}`;
  }, [
    pastHscNavOn,
    yearTopics.length,
    pastHscTopics.length,
    selectedTopic,
    pastHscSubTopics.length,
    selectedSubTopic,
    pastHscDotPoints.length,
    selectedDotPoint,
    promptOptions,
    statePath.promptId,
    pastHscQuestionIds,
    pastHscYearsInForce,
  ]);

  // Same threshold as the picker's own search box: the point at which a list
  // stops being scannable is the point at which it is worth narrowing, and one
  // rule is easier to reason about than two.
  const showQuestionFilters = promptOptions.length >= SEARCH_THRESHOLD;

  /**
   * Named because the change is invisible where it lands: choosing a different
   * topic takes the question with it, and the workspace below simply vanishes
   * — the largest state change in the app, with nothing saying what happened.
   * A `role="status"` line rather than a toast: this is ordinary navigation,
   * and `useToast` is `aria-live="assertive"`, which interrupts a student
   * mid-sentence.
   */
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);
  const prevPath = useRef(statePath);
  useEffect(() => {
    const before = prevPath.current;
    prevPath.current = statePath;
    // Nothing was discarded: either there was no question, or there still is
    // one. Either way any standing notice is stale.
    if (!before.promptId || statePath.promptId) {
      setClearedNotice(null);
      return;
    }

    /**
     * The two routes here move the path in opposite directions, and reading
     * only "which key changed first" mistakes one for the other.
     *
     * A stage picker SETS level N and clears N+1…4, so the first differing key
     * is N and it now holds a value — the student chose something, and naming
     * it is right. A breadcrumb crumb does the inverse: it CLEARS N+1…4 and
     * leaves N alone, so the first differing key is N+1 and it is now empty.
     * Naming that key would report the level they walked away FROM as the one
     * they had just picked. What they are actually left on is the level above
     * it, and they chose nothing — they went back up.
     *
     * The dot-point crumb clears nothing but the question, so no level key
     * differs at all. That is not "nothing happened": it is the one press that
     * discards a question and changes literally nothing else on screen except
     * the workspace vanishing, and it used to be the only cascade this notice
     * was completely silent for. The student is left on the deepest level.
     */
    const changedIndex = LEVEL_KEYS.findIndex((k) => before[k] !== statePath[k]);
    const setKey =
      changedIndex !== -1 && statePath[LEVEL_KEYS[changedIndex]] ? LEVEL_KEYS[changedIndex] : null;
    if (setKey) {
      setClearedNotice(`New ${LEVEL_LABEL[setKey]} chosen — your question selection was cleared.`);
      return;
    }
    const returnedTo = changedIndex === -1 ? LEVEL_KEYS.length - 1 : changedIndex - 1;
    setClearedNotice(
      returnedTo >= 0
        ? `Back to the ${LEVEL_LABEL[LEVEL_KEYS[returnedTo]]} — your question selection was cleared.`
        : // Nothing of the path survives (the course itself went), so there is
          // no level to name — but the question still went, and going quiet is
          // the failure this notice exists to prevent.
          'Your question selection was cleared.'
    );
  }, [statePath]);

  const getContainerClasses = (isSelected: boolean, zIndex: string) => `
    relative transition-all duration-500 ease-in-out w-full ${zIndex} ${isSelected ? 'mb-1' : 'mb-6'}
  `;

  const getBoxClasses = (isSelected: boolean, isActive: boolean, colorKey: string) => {
    const theme = THEMES[colorKey] || THEMES.blue; // Defensive fallback
    // An answered step is a single row — the picker and nothing around it.
    // It used to be a tinted card holding a tinted control, five of them
    // stacked, so the steps already answered were the loudest thing on screen
    // and the one still open had to shout over them. The open step keeps its
    // frame and its hue; the answered ones step back.
    if (isSelected) {
      return `relative rounded-2xl transition-all duration-500 ease-out w-full py-1 z-10`;
    }
    // No `scale`: a 1% scale resamples the text inside, and the open step
    // already has the frame, the shadow and the extra padding to mark it.
    if (isActive) {
      return `relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 ${theme.activeBorder} shadow-lg ${theme.activeShadow} py-6 px-6 z-20`;
    }
    // It steps back by tone and colour, not by `opacity`: the text inside is
    // read at its own ink, and an opacity on the card would take it under AA.
    return `relative rounded-2xl transition-all duration-500 ease-out w-full bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-white/5 light:border-slate-300 py-4 px-6 text-[rgb(var(--color-text-secondary))] light:text-slate-600 grayscale hover:grayscale-0`;
  };

  return (
    <div className="flex flex-col pl-4 md:pl-12 relative animate-fade-in">
      <div className="absolute left-[1.35rem] md:left-[2.35rem] top-0 bottom-0 w-px bg-white/5 light:bg-slate-400 z-0"></div>

      {/* 1. Course Selection */}
      <div className={getContainerClasses(isCourseSelected, 'z-50')}>
        <div className={getBoxClasses(isCourseSelected, !isCourseSelected, LEVEL_HUE.course)}>
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
            <RailNode
              isSelected={isCourseSelected}
              isComplete={isTopicSelected}
              colorKey={LEVEL_HUE.course}
            />
          </div>
          {!isCourseSelected && (
            <StepHeader icon={BookOpen} label="Course" colorKey={LEVEL_HUE.course} />
          )}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Course and year share one column, so the year is the picker that
                ends at the curation group's edge, as every other row's does. */}
            <div className="flex-1 w-full min-w-0 flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex-1 w-full min-w-0">
                <Combobox
                  label={null}
                  options={courseOptions}
                  optionNoun="courses"
                  value={statePath.courseId || ''}
                  onChange={(id) =>
                    onPathChange({
                      courseId: id,
                      topicId: undefined,
                      subTopicId: undefined,
                      dotPointId: undefined,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  disabled={isLoading}
                  placeholder={isLoading ? 'Loading courses…' : 'Select course…'}
                  color="blue"
                  appearance="quiet"
                  caption="Course"
                  emptyAction={
                    canRequestCourse
                      ? {
                          label: "Can't find it? Request this course",
                          onAction: (query) => onRequestCourse?.(query),
                        }
                      : undefined
                  }
                />
              </div>
              {/* The year sits beside the course because that is what it belongs
                to: one course name, two syllabuses. Everything below reads from
                whichever is chosen here. */}
              {selectedCourse && (
                <div className="w-full lg:w-[230px] flex-shrink-0 animate-fade-in">
                  <Combobox
                    label={null}
                    options={yearOptions}
                    optionNoun="years"
                    value={syllabusYear}
                    onChange={handleYearChange}
                    placeholder="Select year…"
                    color="blue"
                    appearance="quiet"
                  />
                </div>
              )}
            </div>
            {canCurate && (
              <div
                className={`${curationRowVisibility} items-center gap-2 gap-y-2 flex-wrap justify-end ${CURATION_GROUP_WIDTH}`}
              >
                {/* Creating a course, and the AI import that builds one, are
                    both admin-only (canCreateCurriculum). A teacher who needs a
                    course that isn't here uses the request link below the
                    picker instead. */}
                {canCreateTree && (
                  <ActionButton onClick={onAddCourse} icon={Plus} title="Add course" label="Add" />
                )}
                {canCreateTree && canGenerate && (
                  <ActionButton
                    onClick={onImportSyllabus}
                    icon={UploadCloud}
                    title="Import a syllabus (AI) — build or update a course from NESA syllabus text or a URL"
                    label="Import syllabus"
                    variant="special"
                    locked={studioLocked}
                  />
                )}
                {isAdmin && (
                  <ActionButton
                    onClick={onOpenDataManager}
                    icon={Database}
                    title="Data vault (import, export, reorder)"
                    variant="vault"
                  />
                )}
                {canCreateTree && selectedCourse && (
                  <ActionButton
                    onClick={() =>
                      onToggleCourseStatus(
                        selectedCourse.id,
                        selectedCourse.status === 'draft' ? 'published' : 'draft'
                      )
                    }
                    icon={selectedCourse.status === 'draft' ? Eye : EyeOff}
                    title={
                      selectedCourse.status === 'draft'
                        ? 'Publish — make visible to everyone'
                        : 'Hide — draft, visible to admins only'
                    }
                    label={selectedCourse.status === 'draft' ? 'Publish' : 'Hide'}
                    variant={selectedCourse.status === 'draft' ? 'special' : 'default'}
                  />
                )}
                {selectedCourse && (
                  <>
                    <ActionButton onClick={onEditOutcomes} icon={Settings} title="Edit outcomes" />
                    <ActionButton
                      onClick={() => onRenameItem('course', selectedCourse.id, selectedCourse.name)}
                      icon={Edit3}
                      title="Rename"
                    />
                    <ActionButton
                      onClick={() =>
                        onDeleteItem({
                          type: 'course',
                          id: selectedCourse.id,
                          name: selectedCourse.name,
                        })
                      }
                      icon={Trash2}
                      title="Delete"
                      variant="danger"
                    />
                  </>
                )}
              </div>
            )}
          </div>
          {/* The route out for everyone who cannot add a course themselves. It
              sits under the picker rather than only inside its empty state,
              because the search box only appears once there are seven or more
              courses (Combobox's SEARCH_THRESHOLD) — below that a user scans a
              short list, finds nothing, and would have had nowhere to click. */}
          {canRequestCourse && (
            <button
              type="button"
              onClick={() => onRequestCourse?.()}
              className="mt-2 block text-left text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline"
            >
              Can’t find your course? Request it
            </button>
          )}
        </div>
      </div>

      {/* The navigator sits between the course and topic steps rather than
          inside the course step: its rail node is centred on that step's box,
          and a taller box would drag the node off the course name. Only where
          the year has past papers to filter by, since a control that could
          match nothing is worse than no control. */}
      {isCourseSelected && pastHscAvailable && (
        <div className="mb-4 rounded-xl border border-white/10 light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 px-3 py-2.5">
          <PastHscNavigator
            on={pastHscNavOn}
            years={pastHscYearsInForce}
            availableYears={pastHscYearList}
            onToggle={togglePastHsc}
            onYearsChange={(years) => setPastHscNav({ ...storedPastHsc, years })}
            summary={pastHscSummary}
          />
        </div>
      )}

      {/* 2. Topic Selection */}
      {selectedCourse && (
        <div className={getContainerClasses(isTopicSelected, 'z-40')}>
          <div className={getBoxClasses(isTopicSelected, !isTopicSelected, LEVEL_HUE.topic)}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isTopicSelected}
                isComplete={isSubTopicSelected}
                colorKey={LEVEL_HUE.topic}
              />
            </div>
            {!isTopicSelected && (
              <StepHeader icon={Layers} label="Topic" colorKey={LEVEL_HUE.topic} />
            )}
            {topicOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {/* Named, because "no topics yet" on a course full of Year 12
                    content reads as data loss rather than as an empty year. */}
                No {yearShortLabel(syllabusYear)} topics yet.{' '}
                {canCurate
                  ? 'Use From syllabus to build a topic from pasted NESA text or a syllabus URL, add one manually, or import a topic file.'
                  : 'Ask a teacher or admin to add content for this course.'}
              </p>
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={topicOptions}
                  optionNoun="topics"
                  value={statePath.topicId || ''}
                  onChange={(id) =>
                    onPathChange({
                      topicId: id,
                      subTopicId: undefined,
                      dotPointId: undefined,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  placeholder="Select topic…"
                  color="purple"
                  appearance="quiet"
                  caption="Topic"
                />
              </div>
              {canCurate && (
                <div
                  className={`${curationRowVisibility} items-center gap-2 gap-y-2 flex-wrap justify-end ${CURATION_GROUP_WIDTH}`}
                >
                  {selectedTopic ? (
                    <>
                      {canCreateTree && (
                        <ActionButton
                          onClick={() => setInlineTopicOpen((v) => !v)}
                          icon={inlineTopicOpen ? X : Plus}
                          title={inlineTopicOpen ? 'Cancel' : 'Add another topic'}
                        />
                      )}
                      {canGenerate && (
                        <ActionButton
                          onClick={onAddTopicFromSyllabus}
                          icon={UploadCloud}
                          title={`Add sub-topics and dot points into "${selectedTopic.name}" from NESA syllabus text or a URL (AI)`}
                          label="Add from syllabus"
                          variant="special"
                          locked={studioLocked}
                        />
                      )}
                      <ActionButton
                        onClick={() => onRenameItem('topic', selectedTopic.id, selectedTopic.name)}
                        icon={Edit3}
                        title="Rename"
                      />
                      <ActionButton
                        onClick={() =>
                          onDeleteItem({
                            type: 'topic',
                            id: selectedTopic.id,
                            name: selectedTopic.name,
                          })
                        }
                        icon={Trash2}
                        title="Delete"
                        variant="danger"
                      />
                    </>
                  ) : (
                    /* Every control here CREATES a topic — by hand, from
                       syllabus text, or from a .json export — so the whole set
                       is admin-only. */
                    canCreateTree && (
                      <>
                        <ActionButton
                          onClick={() => setInlineTopicOpen((v) => !v)}
                          icon={inlineTopicOpen ? X : Plus}
                          title={inlineTopicOpen ? 'Cancel' : 'Add topic'}
                          label={inlineTopicOpen ? 'Cancel' : 'Add'}
                        />
                        {canGenerate && (
                          <ActionButton
                            onClick={onAddTopicFromSyllabus}
                            icon={UploadCloud}
                            title="Build a new topic from NESA syllabus text or a URL (AI)"
                            label="From syllabus"
                            variant="special"
                            locked={studioLocked}
                          />
                        )}
                        <ActionButton
                          onClick={onImportTopic}
                          icon={Upload}
                          title="Import a topic (.json)"
                          label="Import"
                        />
                      </>
                    )
                  )}
                </div>
              )}
            </div>

            {inlineTopicOpen && canCreateTree && (
              <div className="mt-3 p-4 rounded-2xl bg-white/5 light:bg-slate-50 border border-purple-500/20 light:border-purple-200 animate-fade-in">
                <div className="flex flex-col gap-3">
                  {/* Which year this lands in. The topic list above is already
                      filtered to it, so a topic created here appears to vanish
                      if the author thought they were in the other one. */}
                  <p className="text-xs font-semibold text-[rgb(var(--color-text-muted))]">
                    New topic in {yearShortLabel(syllabusYear)}
                    {selectedCourse ? ` of ${selectedCourse.name}` : ''}
                  </p>
                  <input
                    type="text"
                    value={inlineTopicName}
                    onChange={(e) => setInlineTopicName(e.target.value)}
                    placeholder="Topic name (e.g. Core 1: Meanings and Values)"
                    className="w-full px-3 py-2 rounded-xl bg-white/10 light:bg-white border border-white/10 light:border-slate-200 text-sm font-medium text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    autoFocus
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        inlineTopicName.trim() &&
                        !inlineSyllabusText.trim()
                      ) {
                        e.preventDefault();
                        handleInlineTopicCreate();
                      }
                      if (e.key === 'Escape') setInlineTopicOpen(false);
                    }}
                  />
                  <textarea
                    value={inlineSyllabusText}
                    onChange={(e) => setInlineSyllabusText(e.target.value)}
                    placeholder="Optional: paste NESA syllabus text here to auto-create sub-topics and dot points…"
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl bg-white/10 light:bg-white border border-white/10 light:border-slate-200 text-sm text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-y"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setInlineTopicOpen(false);
                    }}
                  />
                  {inlineError && <p className="text-xs text-red-400 font-medium">{inlineError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setInlineTopicOpen(false);
                        setInlineTopicName('');
                        setInlineSyllabusText('');
                        setInlineError(null);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleInlineTopicCreate}
                      disabled={!inlineTopicName.trim() || inlineParsing}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {inlineParsing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          Parsing…
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          {inlineSyllabusText.trim() ? 'Create & parse' : 'Create topic'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Sub-Topic Selection */}
      {selectedTopic && (
        <div className={getContainerClasses(isSubTopicSelected, 'z-30')}>
          <div
            className={getBoxClasses(isSubTopicSelected, !isSubTopicSelected, LEVEL_HUE.subTopic)}
          >
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isSubTopicSelected}
                isComplete={isDotPointSelected}
                colorKey={LEVEL_HUE.subTopic}
              />
            </div>
            {!isSubTopicSelected && (
              <StepHeader icon={FolderOpen} label="Sub-topic" colorKey={LEVEL_HUE.subTopic} />
            )}
            {/* Same shape and the same curator/student split as the Topic stage
                above: a picker that opens onto a bare "No options available."
                never says whose problem the emptiness is. */}
            {subTopicOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                {/* Under the navigator the list can be empty for a different reason:
                    the topic has sub-topics, none of them with past papers. */}
                {pastHscNavOn && (selectedTopic?.subTopics?.length ?? 0) > 0 ? (
                  'No sub-topics here have past HSC questions for the years chosen.'
                ) : (
                  <>
                    No sub-topics in this topic yet.{' '}
                    {canCurate
                      ? 'Use Add to create one, or Add from syllabus to build them from NESA text.'
                      : 'Ask a teacher or admin to add content for this topic.'}
                  </>
                )}
              </p>
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={subTopicOptions}
                  optionNoun="sub-topics"
                  value={statePath.subTopicId || ''}
                  onChange={(id) =>
                    onPathChange({
                      subTopicId: id,
                      dotPointId: undefined,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  placeholder="Select sub-topic…"
                  color="teal"
                  appearance="quiet"
                  caption="Sub-topic"
                />
              </div>
              {canCurate && (
                <div
                  className={`${curationRowVisibility} items-center gap-2 gap-y-2 flex-wrap justify-end ${CURATION_GROUP_WIDTH}`}
                >
                  {selectedSubTopic ? (
                    <>
                      <ActionButton
                        onClick={() =>
                          onRenameItem('subTopic', selectedSubTopic.id, selectedSubTopic.name)
                        }
                        icon={Edit3}
                        title="Rename"
                      />
                      <ActionButton
                        onClick={() =>
                          onDeleteItem({
                            type: 'subTopic',
                            id: selectedSubTopic.id,
                            name: selectedSubTopic.name,
                          })
                        }
                        icon={Trash2}
                        title="Delete"
                        variant="danger"
                      />
                    </>
                  ) : (
                    <ActionButton
                      onClick={onAddSubTopic}
                      icon={Plus}
                      title="Add sub-topic"
                      label="Add"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Dot Point & Syllabus Focus (Merged Row) */}
      {selectedSubTopic && (
        <div className={getContainerClasses(isDotPointSelected, 'z-20')}>
          <div
            className={getBoxClasses(isDotPointSelected, !isDotPointSelected, LEVEL_HUE.dotPoint)}
          >
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isDotPointSelected}
                isComplete={isPromptSelected}
                colorKey={LEVEL_HUE.dotPoint}
              />
            </div>
            {!isDotPointSelected && (
              <StepHeader icon={List} label="Syllabus point" colorKey={LEVEL_HUE.dotPoint} />
            )}
            {dotPointOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <List className="w-3.5 h-3.5" />
                {pastHscNavOn && (selectedSubTopic?.dotPoints?.length ?? 0) > 0 ? (
                  'No syllabus points here have past HSC questions for the years chosen.'
                ) : (
                  <>
                    No syllabus points in this sub-topic yet.{' '}
                    {canCurate
                      ? 'Use Generate to draft them from the sub-topic name.'
                      : 'Ask a teacher or admin to add content here.'}
                  </>
                )}
              </p>
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
              {/* Main Dot Point Selector - Grows to take most space */}
              <div className="flex-[3] w-full min-w-0">
                <Combobox
                  label={isDotPointSelected && hasSubItems ? 'Syllabus point' : null}
                  options={dotPointOptions}
                  optionNoun="dot points"
                  value={statePath.dotPointId || ''}
                  onChange={(id) =>
                    onPathChange({
                      dotPointId: id,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  placeholder="Select syllabus point…"
                  color="pink"
                  appearance="quiet"
                  // Beside the focus picker the step already has a label above
                  // it, lined up with "Focus"; a caption too would say
                  // it twice.
                  caption={isDotPointSelected && hasSubItems ? undefined : 'Syllabus point'}
                />
              </div>

              {/* Syllabus Focus Selector - Rendered side-by-side if dot point selected and has sub-items */}
              {selectedDotPoint && hasSubItems && (
                <div className="flex-1 w-full lg:min-w-[240px] animate-fade-in">
                  <Combobox
                    label="Focus"
                    options={subItemOptions}
                    optionNoun="sub-points"
                    // Combobox is single-select, so nothing is "chosen" here: the
                    // selected focus areas are the pills below and the check marks in
                    // the list. The trigger states the count itself, as a chosen
                    // value. A value that matched no option (the old 'MULTIPLE')
                    // read as "All of this syllabus point" even with focus areas chosen.
                    value=""
                    onChange={handleSubItemToggle}
                    summary={
                      activeFocusCount > 0
                        ? `${activeFocusCount} focus area${activeFocusCount === 1 ? '' : 's'}`
                        : undefined
                    }
                    placeholder="All of this syllabus point"
                    color="green"
                    appearance="quiet"
                  />
                </div>
              )}

              {/* Admin Actions */}
              {canCurate && (
                <div
                  className={`${curationRowVisibility} items-center gap-2 pt-2 lg:pt-0 flex-wrap justify-end lg:self-center ${CURATION_GROUP_WIDTH}`}
                >
                  {selectedDotPoint ? (
                    <>
                      {/* Focus areas are read out of syllabus prose by a
                          heuristic, which sometimes splits a concept in half or
                          finds nothing at all. Offered whether or not the parse
                          found anything — a dot point with NO focus areas is
                          exactly the case a teacher most often needs to fix. */}
                      {onUpdateFocusAreas && (
                        <button
                          onClick={() => setFocusEditorOpen(true)}
                          className={`inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg border transition-all shadow-sm ${
                            focusAreasOverridden
                              ? 'bg-emerald-500/20 text-emerald-400 light:text-emerald-700 border-emerald-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 light:text-emerald-700 border-emerald-500/20 hover:bg-emerald-700 hover:text-white'
                          }`}
                          title={
                            focusAreasOverridden
                              ? 'Focus areas set by hand — click to edit'
                              : hasSubItems
                                ? 'Edit the focus areas read from this dot point'
                                : 'No focus areas were found in this dot point — add them by hand'
                          }
                          aria-label="Edit focus areas"
                        >
                          <Target className="w-4 h-4" />
                        </button>
                      )}
                      {hasSubItems && activeFocusCount > 0 && (
                        <button
                          onClick={() => onPathChange({ selectedSubItems: undefined })}
                          className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                          title="Reset focus"
                          aria-label="Reset focus"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <ActionButton
                        onClick={() =>
                          onRenameItem(
                            'dotPoint',
                            selectedDotPoint.id,
                            selectedDotPoint.description
                          )
                        }
                        icon={Edit3}
                        title="Rename"
                      />
                      <ActionButton
                        onClick={() =>
                          onDeleteItem({
                            type: 'dotPoint',
                            id: selectedDotPoint.id,
                            // The statement, so the confirmation reads as a
                            // sentence rather than quoting a bulleted block.
                            name: splitDotPointDescription(selectedDotPoint.description).stem,
                          })
                        }
                        icon={Trash2}
                        title="Delete"
                        variant="danger"
                      />
                    </>
                  ) : canGenerate ? (
                    // Not locked by the plan: typing or pasting dot points is free.
                    // The modal gates its own AI tab, so the lock lives there.
                    <ActionButton
                      onClick={onGenerateDotPoints}
                      icon={Sparkles}
                      title="Add dot points"
                      label="Add dot points"
                      variant="special"
                    />
                  ) : null}
                </div>
              )}
            </div>

            {/* Focus Pills - Displayed beneath selectors in the same container */}
            {activeFocusCount > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 animate-fade-in pl-1">
                {statePath.selectedSubItems?.map((item) => (
                  <div
                    key={item}
                    className="t-label flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 light:text-emerald-800 border border-emerald-500/20"
                  >
                    {item}
                    <button
                      onClick={() => handleSubItemToggle(item)}
                      className="hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedDotPoint && onUpdateFocusAreas && (
        <FocusAreaEditorModal
          isOpen={focusEditorOpen}
          onClose={() => setFocusEditorOpen(false)}
          description={selectedDotPoint.description}
          focusAreas={subItems}
          isOverridden={focusAreasOverridden}
          onSave={(areas) => {
            onUpdateFocusAreas(selectedDotPoint.id, areas);
            // An active focus that no longer exists in the list would keep
            // narrowing generated questions to a phrase the teacher just
            // deleted, and nothing on screen would say so.
            const stillValid = (statePath.selectedSubItems || []).filter((i) => areas.includes(i));
            onPathChange({ selectedSubItems: stillValid.length ? stillValid : undefined });
          }}
          onReset={() => {
            onUpdateFocusAreas(selectedDotPoint.id, undefined);
            onPathChange({ selectedSubItems: undefined });
          }}
        />
      )}

      {/* Deliberately OUTSIDE the `selectedDotPoint` guard below. Three of the
          four cascades that discard a question (course, topic, sub-topic) also
          clear the dot point, so a notice rendered inside the Question card
          would only ever be seen for the fourth. Out here it appears in the gap
          the vanished stages left, which is where the student was looking. */}
      {clearedNotice && (
        <p
          role="status"
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400 animate-fade-in-up-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {clearedNotice}
        </p>
      )}

      {/* 5. Question Selection */}
      {selectedDotPoint && (
        <div className={getContainerClasses(isPromptSelected, 'z-10')}>
          <div className={getBoxClasses(isPromptSelected, !isPromptSelected, LEVEL_HUE.prompt)}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isPromptSelected}
                isComplete={false}
                colorKey={LEVEL_HUE.prompt}
              />
            </div>
            {!isPromptSelected && (
              <StepHeader icon={FileQuestion} label="Question" colorKey={LEVEL_HUE.prompt} />
            )}
            {promptOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <FileQuestion className="w-3.5 h-3.5" />
                No questions for this syllabus point yet.{' '}
                {canCurate ? 'Generate one or add it manually.' : 'Check back soon.'}
              </p>
            )}
            {pastHscNavOn && promptOptions.length > 0 && pastHscQuestionIds.size === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <FileQuestion className="w-3.5 h-3.5" />
                No past HSC questions here for the years chosen.
              </p>
            )}
            {showQuestionFilters && (
              <QuestionFilterBar
                bounds={questionBounds}
                filter={activeQuestionFilter}
                onChange={onQuestionFilterChange}
                shown={matchingQuestionCount}
              />
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={visiblePromptOptions}
                  optionNoun="questions"
                  value={statePath.promptId || ''}
                  onChange={(id) => {
                    const opt = promptOptions.find((o) => o.id === id);
                    if (opt?.disabled) {
                      requestUpgrade('advancedQuestions');
                      return;
                    }
                    onPathChange({ promptId: id });
                  }}
                  placeholder="Select question…"
                  color="amber"
                  caption="Question"
                />
              </div>
              {canCurate && (
                <div
                  className={`${curationRowVisibility} items-center gap-2 gap-y-2 flex-wrap justify-end ${CURATION_GROUP_WIDTH}`}
                >
                  {selectedPrompt ? (
                    <>
                      {canGenerate && (
                        <ActionButton
                          onClick={onGeneratePrompt}
                          icon={Sparkles}
                          title="Generate new"
                          variant="primary"
                          locked={studioLocked}
                        />
                      )}
                      <ActionButton
                        onClick={onManualEntry}
                        icon={PenTool}
                        title="Write a question"
                        variant="special"
                      />
                      {onShareAssignment && (
                        <ActionButton
                          onClick={onShareAssignment}
                          icon={Link2}
                          title="Copy assignment link — students who open it land on this question"
                        />
                      )}
                      <ActionButton
                        onClick={() =>
                          onDeleteItem({
                            type: 'prompt',
                            id: selectedPrompt.id,
                            name: selectedPrompt.question,
                          })
                        }
                        icon={Trash2}
                        title="Delete"
                        variant="danger"
                      />
                    </>
                  ) : (
                    <div className="flex gap-2 flex-wrap justify-end">
                      <button
                        onClick={onManualEntry}
                        className="t-label flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 text-slate-200 light:text-slate-700 border border-white/10 light:border-slate-300 transition-all"
                      >
                        <PenTool className="w-4 h-4" /> Write a question
                      </button>
                      {canGenerate && (
                        <button
                          onClick={
                            studioLocked
                              ? () => requestUpgrade('aiContentStudio')
                              : onGeneratePrompt
                          }
                          title={
                            studioLocked ? describeAccess('aiContentStudio').explanation : undefined
                          }
                          className={`t-label flex items-center gap-2 px-6 py-2.5 rounded-xl shadow-sm active:scale-[0.98] transition-all ${
                            studioLocked
                              ? 'bg-amber-400/15 text-amber-500 light:text-amber-800 border border-amber-400/40'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          }`}
                        >
                          <Sparkles className="w-4 h-4" /> Generate
                          {studioLocked && <PlusLockChip feature="aiContentStudio" />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptSelector;
