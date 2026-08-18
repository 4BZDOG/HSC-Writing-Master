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
import { getPastHscLabel } from '../utils/pastHscUtils';
import { isFeatureLocked, isQuestionTierLocked, requestUpgrade } from '../services/entitlements';
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
}

// Static lookup map for Tailwind classes to ensure they are not purged.
// The five journey levels use clearly separated hues (blue → purple → teal →
// pink → amber); completion is a SEPARATE semantic (emerald tick on the rail),
// so a level's hue never doubles as a status light.
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

const THEMES: Record<string, any> = {
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
        className={`${base} w-[1.15rem] h-[1.15rem] bg-emerald-500 border-2 border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.45)] ${justCompleted ? 'animate-fade-in-up-sm' : ''}`}
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

const StepHeader = ({ icon: Icon, label, colorKey }: any) => {
  const theme = THEMES[colorKey] || THEMES.blue; // Defensive fallback
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`p-1.5 rounded-md ${theme.headerIcon}`}>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <span className="text-xs font-black uppercase tracking-widest text-[rgb(var(--color-text-primary))] light:text-slate-900">
        {label}
      </span>
    </div>
  );
};

const ActionButton = ({
  onClick,
  icon: Icon,
  title,
  label,
  variant = 'default',
  locked = false,
}: any) => (
  <button
    onClick={locked ? () => requestUpgrade('aiContentStudio') : onClick}
    className={`relative p-2 ${label ? 'sm:px-3' : ''} rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 border flex items-center gap-1.5 ${
      locked
        ? 'bg-amber-400/10 border-amber-400/40 text-amber-500 light:text-amber-600'
        : variant === 'danger'
          ? 'bg-red-500/10 border-red-500/20 text-red-400 light:text-red-600'
          : variant === 'special'
            ? 'bg-amber-500/10 border-amber-500/20 text-yellow-400 light:text-amber-600'
            : variant === 'primary'
              ? 'bg-gradient-to-r from-indigo-500 to-sky-500 border-transparent text-white shadow-md'
              : variant === 'vault'
                ? 'bg-blue-600/10 light:bg-blue-50 border-blue-600/20 light:border-blue-300 text-blue-400 light:text-blue-700'
                : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-white/5 light:border-slate-400 text-[rgb(var(--color-text-secondary))] light:text-slate-600'
    }`}
    title={locked ? `${title} — part of Band 6 Plus` : title}
  >
    {Icon && <Icon className="w-4 h-4" />}
    {label && (
      <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
    )}
    {locked && (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
        <Lock className="w-2.5 h-2.5" />
      </span>
    )}
  </button>
);

const PromptSelector: React.FC<PromptSelectorProps> = ({
  courses = [],
  statePath = {} as StatePath,
  onPathChange,
  onAddCourse,
  onRequestCourse,
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
}) => {
  const [focusEditorOpen, setFocusEditorOpen] = useState(false);
  const canCurate = canCurateContent(userRole);
  const canGenerate = canUseAiGeneration(userRole);
  const isAdmin = isSystemAdmin(userRole);
  // Courses and topics are the shared skeleton everyone navigates, so creating
  // one is admin-only — see canCreateCurriculum in utils/permissions.ts. A
  // teacher still curates everything below a topic, and can ASK for a course
  // that doesn't exist yet through the request link under the course picker.
  const canCreateTree = canCreateCurriculum(userRole);
  // Only offered to people who cannot simply ADD the course themselves, and
  // only when there is a backend to record it in — a local-only session has
  // nowhere to put the request and would be promising something it can't keep.
  const canRequestCourse = !canCreateTree && isCourseDemandAvailable(userRole) && !!onRequestCourse;
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
      courses.map((c) => ({
        id: c.id,
        label: c.name,
        isNew: newlyAddedIds.has(c.id),
        renderLabel: (
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-500 light:bg-blue-100 light:text-blue-700 border border-blue-500/20 flex-shrink-0">
              <Book className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{c.name}</span>
            {/* Both years together: the question is "is this course ready to
                show someone", and it is not ready if half of it is empty. */}
            {canCurate && <CoverageChip coverage={questionCoverage(c)} label={c.name} />}
          </div>
        ),
      })),
    [courses, newlyAddedIds, canCurate]
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
            <div className={`flex items-center gap-3 ${selectable ? '' : 'opacity-60'}`}>
              <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-500 light:bg-blue-100 light:text-blue-700 border border-blue-500/20 flex-shrink-0">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{y.label}</span>
                {/* Only on a row that can never be SELECTED. The trigger draws
                    the selected option's own label, so a note here would ride
                    up into the closed control and read as part of the year's
                    name. A curator who goes there gets the same message with
                    more room, from the empty state under the topic picker. */}
                {!selectable && (
                  <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))]">
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
      yearTopics.map((t) => ({
        id: t.id,
        label: t.name,
        isNew: newlyAddedIds.has(t.id),
        renderLabel: (
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-500 light:bg-purple-100 light:text-purple-700 border border-purple-500/20 flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-medium flex-1 min-w-0 truncate">{t.name}</span>
            {/* Per topic, so a half-finished course says WHICH half. */}
            {canCurate && (
              <CoverageChip coverage={questionCoverage({ topics: [t] })} label={t.name} />
            )}
          </div>
        ),
      })),
    [yearTopics, newlyAddedIds, canCurate]
  );

  const subTopicOptions = useMemo(
    () =>
      selectedTopic?.subTopics?.map((st) => ({
        id: st.id,
        label: st.name,
        isNew: newlyAddedIds.has(st.id),
        renderLabel: (
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-indigo-500/20 text-indigo-500 light:bg-indigo-100 light:text-indigo-700 border border-indigo-500/20 flex-shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <span className="font-medium">{st.name}</span>
          </div>
        ),
      })) || [],
    [selectedTopic, newlyAddedIds]
  );

  const dotPointOptions = useMemo(
    () =>
      selectedSubTopic?.dotPoints?.map((dp) => {
        // The statement only. Its "including …" list is what the Active Focus
        // menu beside this one is FOR — printing it here as well made every row
        // a paragraph and said the same thing twice. `searchText` keeps the
        // hidden items findable, so typing a focus area still locates its dot
        // point.
        const { stem, items } = splitDotPointDescription(dp.description);
        return {
          id: dp.id,
          label: stem,
          searchText: items.join(' '),
          isNew: newlyAddedIds.has(dp.id),
          renderLabel: (
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-pink-500/20 text-pink-500 light:bg-pink-100 light:text-pink-700 border border-pink-500/20 mt-0.5 flex-shrink-0">
                <List className="w-4 h-4" />
              </div>
              <span className="min-w-0">
                <span className="block leading-snug font-medium">{stem}</span>
                {items.length > 0 && (
                  <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500/80">
                    {items.length} focus area{items.length === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </div>
          ),
        };
      }) || [],
    [selectedSubTopic, newlyAddedIds]
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
                className={`p-1.5 rounded-md border transition-all ${isSelected ? 'bg-emerald-500 text-white border-emerald-400/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}
              >
                <Target className="w-4 h-4" />
              </div>
              <span className={`font-medium ${isSelected ? 'text-white' : ''}`}>{item}</span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
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
                className={`flex items-start gap-3 w-full overflow-hidden p-2 rounded-lg transition-colors ${tierLocked ? 'opacity-60' : ''} ${tierConfig.bg}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${tierConfig.solidBg} ${tierConfig.border} shadow-sm`}
                >
                  {tierLocked ? (
                    <Lock className="w-5 h-5 text-white/70" />
                  ) : (
                    <FileQuestion className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="leading-snug font-bold line-clamp-2 block break-words text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    {p.question}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border ${tierConfig.solidBg} ${tierConfig.solidText} ${tierConfig.border} shadow-sm`}
                    >
                      {verbInfo.term}
                    </span>
                    <span className="text-[10px] font-mono font-black text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      {p.totalMarks} {p.totalMarks === 1 ? 'Mark' : 'Marks'}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border ${tierConfig.bg} ${tierConfig.text} ${tierConfig.border}`}
                      title={`A full-mark response to this question reaches Band ${targetBand}`}
                    >
                      Band {targetBand}
                    </span>
                    {pastHsc && (
                      <span
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border bg-amber-500/15 light:bg-amber-100 text-amber-400 light:text-amber-800 border-amber-500/40 light:border-amber-400"
                        title={pastHsc.title}
                      >
                        <Landmark className="w-2.5 h-2.5" />
                        {pastHsc.text}
                      </span>
                    )}
                    {attempt && (
                      <span
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border bg-emerald-500/15 light:bg-emerald-100 text-emerald-400 light:text-emerald-800 border-emerald-500/40 light:border-emerald-500"
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
                    {tierLocked && <PlusLockChip />}
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
  // control pointing outside the axis it now spans.
  const activeQuestionFilter = useMemo(
    () =>
      questionFilter ? clampFilter(questionFilter, questionBounds) : widestFilter(questionBounds),
    [questionFilter, questionBounds]
  );

  const { visiblePromptOptions, matchingQuestionCount } = useMemo(
    () => ({
      // The selected question is pinned in even when it fails the filter: the
      // closed control renders the SELECTED option's label, so dropping it
      // would leave the picker showing a placeholder while the workspace beside
      // it displays the question.
      visiblePromptOptions: applyQuestionFilter(
        promptOptions,
        activeQuestionFilter,
        statePath.promptId
      ),
      matchingQuestionCount: promptOptions.filter((o) => matchesFilter(o, activeQuestionFilter))
        .length,
    }),
    [promptOptions, activeQuestionFilter, statePath.promptId]
  );

  // Same threshold as the picker's own search box: the point at which a list
  // stops being scannable is the point at which it is worth narrowing, and one
  // rule is easier to reason about than two.
  const showQuestionFilters = promptOptions.length >= SEARCH_THRESHOLD;

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

  return (
    <div className="flex flex-col pl-4 md:pl-12 relative animate-fade-in">
      <div className="absolute left-[1.35rem] md:left-[2.35rem] top-0 bottom-0 w-px bg-white/5 light:bg-slate-400 z-0"></div>

      {/* 1. Course Selection */}
      <div className={getContainerClasses(isCourseSelected, 'z-50')}>
        <div className={getBoxClasses(isCourseSelected, !isCourseSelected, 'blue')}>
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
            <RailNode isSelected={isCourseSelected} isComplete={isTopicSelected} colorKey="blue" />
          </div>
          {!isCourseSelected && <StepHeader icon={BookOpen} label="Course" colorKey="blue" />}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 w-full">
              <Combobox
                label={null}
                options={courseOptions}
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
                placeholder="Select Course..."
                color="blue"
                emptyAction={
                  canRequestCourse
                    ? {
                        label: "Can't find it? Request this course →",
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
                  value={syllabusYear}
                  onChange={handleYearChange}
                  placeholder="Select Year..."
                  color="blue"
                />
              </div>
            )}
            {canCurate && (
              <div className="flex items-center gap-2 gap-y-2 flex-wrap justify-end">
                {/* Creating a course, and the AI import that builds one, are
                    both admin-only (canCreateCurriculum). A teacher who needs a
                    course that isn't here uses the request link below the
                    picker instead. */}
                {canCreateTree && (
                  <ActionButton onClick={onAddCourse} icon={Plus} title="Add Course" label="Add" />
                )}
                {canCreateTree && canGenerate && (
                  <ActionButton
                    onClick={onImportSyllabus}
                    icon={UploadCloud}
                    title="Import Syllabus (AI) — build or update a course from NESA syllabus text or a URL"
                    label="Import Syllabus"
                    variant="special"
                    locked={studioLocked}
                  />
                )}
                {isAdmin && (
                  <ActionButton
                    onClick={onOpenDataManager}
                    icon={Database}
                    title="Data Vault (Import/Export/Reorder)"
                    variant="vault"
                  />
                )}
                {selectedCourse && (
                  <>
                    <ActionButton onClick={onEditOutcomes} icon={Settings} title="Edit Outcomes" />
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
              Can’t find your course? Request it →
            </button>
          )}
        </div>
      </div>

      {/* 2. Topic Selection */}
      {selectedCourse && (
        <div className={getContainerClasses(isTopicSelected, 'z-40')}>
          <div className={getBoxClasses(isTopicSelected, !isTopicSelected, 'purple')}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isTopicSelected}
                isComplete={isSubTopicSelected}
                colorKey="purple"
              />
            </div>
            {!isTopicSelected && <StepHeader icon={Layers} label="Topic" colorKey="purple" />}
            {topicOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {/* Named, because "no topics yet" on a course full of Year 12
                    content reads as data loss rather than as an empty year. */}
                No {yearShortLabel(syllabusYear)} topics yet.{' '}
                {canCurate
                  ? 'Use From Syllabus to build a topic from pasted NESA text or a syllabus URL, add one manually, or import a topic file.'
                  : 'Ask a teacher or admin to add content for this course.'}
              </p>
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={topicOptions}
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
                  placeholder="Select Topic..."
                  color="purple"
                />
              </div>
              {canCurate && (
                <div className="flex items-center gap-2 gap-y-2 flex-wrap justify-end">
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
                          label="Add from Syllabus"
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
                          title={inlineTopicOpen ? 'Cancel' : 'Add Topic'}
                          label={inlineTopicOpen ? 'Cancel' : 'Add'}
                        />
                        {canGenerate && (
                          <ActionButton
                            onClick={onAddTopicFromSyllabus}
                            icon={UploadCloud}
                            title="Build a new topic from NESA syllabus text or a URL (AI)"
                            label="From Syllabus"
                            variant="special"
                            locked={studioLocked}
                          />
                        )}
                        <ActionButton
                          onClick={onImportTopic}
                          icon={Upload}
                          title="Import Topic (.json)"
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
                  <p className="text-xs font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-500">
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
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {inlineParsing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Parsing…
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          {inlineSyllabusText.trim() ? 'Create & Parse' : 'Create Topic'}
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
          <div className={getBoxClasses(isSubTopicSelected, !isSubTopicSelected, 'teal')}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isSubTopicSelected}
                isComplete={isDotPointSelected}
                colorKey="teal"
              />
            </div>
            {!isSubTopicSelected && (
              <StepHeader icon={FolderOpen} label="Sub-Topic" colorKey="teal" />
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={subTopicOptions}
                  value={statePath.subTopicId || ''}
                  onChange={(id) =>
                    onPathChange({
                      subTopicId: id,
                      dotPointId: undefined,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  placeholder="Select Sub-Topic..."
                  color="teal"
                />
              </div>
              {canCurate && (
                <div className="flex items-center gap-2 gap-y-2 flex-wrap justify-end">
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
                      title="Add Sub-Topic"
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
          <div className={getBoxClasses(isDotPointSelected, !isDotPointSelected, 'pink')}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode
                isSelected={isDotPointSelected}
                isComplete={isPromptSelected}
                colorKey="pink"
              />
            </div>
            {!isDotPointSelected && (
              <StepHeader icon={List} label="Syllabus Content" colorKey="pink" />
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
              {/* Main Dot Point Selector - Grows to take most space */}
              <div className="flex-[3] w-full min-w-0">
                <Combobox
                  label={isDotPointSelected && hasSubItems ? 'Syllabus Point' : null}
                  options={dotPointOptions}
                  value={statePath.dotPointId || ''}
                  onChange={(id) =>
                    onPathChange({
                      dotPointId: id,
                      promptId: undefined,
                      selectedSubItems: undefined,
                    })
                  }
                  placeholder="Select Dot Point..."
                  color="pink"
                />
              </div>

              {/* Syllabus Focus Selector - Rendered side-by-side if dot point selected and has sub-items */}
              {selectedDotPoint && hasSubItems && (
                <div className="flex-1 w-full lg:min-w-[240px] animate-fade-in">
                  <Combobox
                    label="Active Focus"
                    options={subItemOptions}
                    value={activeFocusCount > 0 ? 'MULTIPLE' : ''}
                    onChange={handleSubItemToggle}
                    placeholder="Refine Scope..."
                    color="green"
                  />
                </div>
              )}

              {/* Admin Actions */}
              {canCurate && (
                <div className="flex items-center gap-2 pt-2 lg:pt-0 flex-wrap justify-end lg:self-center">
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
                          className={`p-2 rounded-lg border transition-all shadow-sm ${
                            focusAreasOverridden
                              ? 'bg-emerald-500/20 text-emerald-400 light:text-emerald-700 border-emerald-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 light:text-emerald-700 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
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
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                          title="Reset Focus"
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
                    <ActionButton
                      onClick={onGenerateDotPoints}
                      icon={Sparkles}
                      title="Generate dot points for this sub-topic (AI)"
                      label="Generate"
                      variant="special"
                      locked={studioLocked}
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
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 light:text-emerald-800 text-[10px] font-black uppercase border border-emerald-500/20"
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

      {/* 5. Question Selection */}
      {selectedDotPoint && (
        <div className={getContainerClasses(isPromptSelected, 'z-10')}>
          <div className={getBoxClasses(isPromptSelected, !isPromptSelected, 'amber')}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
              <RailNode isSelected={isPromptSelected} isComplete={false} colorKey="amber" />
            </div>
            {!isPromptSelected && (
              <StepHeader icon={FileQuestion} label="Question" colorKey="amber" />
            )}
            {promptOptions.length === 0 && (
              <p className="mb-3 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                <FileQuestion className="w-3.5 h-3.5" />
                No questions for this syllabus point yet.{' '}
                {canCurate ? 'Generate one or add it manually.' : 'Check back soon.'}
              </p>
            )}
            {showQuestionFilters && (
              <QuestionFilterBar
                bounds={questionBounds}
                filter={activeQuestionFilter}
                onChange={setQuestionFilter}
                shown={matchingQuestionCount}
              />
            )}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={visiblePromptOptions}
                  value={statePath.promptId || ''}
                  onChange={(id) => {
                    const opt = promptOptions.find((o) => o.id === id);
                    if (opt?.disabled) {
                      requestUpgrade('advancedQuestions');
                      return;
                    }
                    onPathChange({ promptId: id });
                  }}
                  placeholder="Select Question..."
                  color="amber"
                />
              </div>
              {canCurate && (
                <div className="flex items-center gap-2 gap-y-2 flex-wrap justify-end">
                  {selectedPrompt ? (
                    <>
                      {canGenerate && (
                        <ActionButton
                          onClick={onGeneratePrompt}
                          icon={Sparkles}
                          title="Generate New"
                          variant="primary"
                          locked={studioLocked}
                        />
                      )}
                      <ActionButton
                        onClick={onManualEntry}
                        icon={PenTool}
                        title="Manual Input"
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
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-bold text-xs uppercase tracking-widest border border-purple-500/30 transition-all"
                      >
                        <PenTool className="w-4 h-4" /> Manual
                      </button>
                      {canGenerate && (
                        <button
                          onClick={
                            studioLocked
                              ? () => requestUpgrade('aiContentStudio')
                              : onGeneratePrompt
                          }
                          title={
                            studioLocked
                              ? 'AI question generation is part of Band 6 Plus — tap to learn more'
                              : undefined
                          }
                          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all ${
                            studioLocked
                              ? 'bg-amber-400/15 text-amber-500 light:text-amber-600 border border-amber-400/40'
                              : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white'
                          }`}
                        >
                          <Sparkles className="w-4 h-4" /> Generate
                          {studioLocked && <PlusLockChip />}
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
