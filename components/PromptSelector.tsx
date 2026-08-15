import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Course, StatePath, UserRole } from '../types';
import {
  canCreateCurriculum,
  canCurateContent,
  canUseAiGeneration,
  isSystemAdmin,
} from '../utils/permissions';
import Combobox, { SEARCH_THRESHOLD } from './Combobox';
import NavigatorStep from './NavigatorStep';
import {
  NAV_ACTION_BUTTON,
  NAV_ACTION_VARIANTS,
  NAV_FOCUS_PILL,
  NAV_INLINE_INPUT,
  NAV_INLINE_PANEL,
  NAV_LEVELS,
  NAV_OPTION_TILE,
  NAV_RAIL_LINE,
  NAV_ROOT,
} from '../utils/navigatorChrome';
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
import type { LucideIcon } from 'lucide-react';
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

/**
 * Where focus lands when the navigator is put back on screen. Choosing a
 * question unmounts this whole subtree and pressing "Change" mounts it again,
 * and `useNavigatorFold` needs somewhere to hand the keyboard over TO —
 * the landmark itself, so its name is heard before its contents.
 */
export const SYLLABUS_NAVIGATOR_ID = 'syllabus-navigator';

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
 * The six rungs of the path, in the order the cascade clears them, with the word
 * each one is called in speech.
 *
 * "Syllabus point" rather than "Syllabus Content": the visible heading over that
 * step says the latter, but the picker's own label says the former, and a
 * spoken sentence should use the noun that names one of them rather than the
 * name of the shelf they sit on.
 */
const CASCADE_LEVELS = [
  ['courseId', 'Course'],
  ['syllabusYear', 'Year'],
  ['topicId', 'Topic'],
  ['subTopicId', 'Sub-topic'],
  ['dotPointId', 'Syllabus point'],
  ['promptId', 'Question'],
] as const;

type CascadeKey = (typeof CASCADE_LEVELS)[number][0];
type CascadeSnapshot = Record<CascadeKey, string | undefined>;

/** A syllabus point ends in a full stop and a question in a question mark, so
 *  the sentence they are quoted into must not add a second one. */
const endSentence = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

const joinWithAnd = (items: string[]): string =>
  items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * What just happened to the path, in one sentence, for the navigator's live
 * region.
 *
 * It has to state BOTH halves. Choosing a course clears the four levels beneath
 * it and up to four steps leave the DOM; a reader who cannot see that happen was
 * told nothing at all, which is the half that was actually missing. Choosing a
 * topic is obvious; losing the question you had chosen is not.
 */
export const describeCascade = (
  prev: CascadeSnapshot,
  next: CascadeSnapshot,
  labelFor: (key: CascadeKey) => string
): string => {
  const changed = CASCADE_LEVELS.filter(([key]) => prev[key] !== next[key]);
  if (changed.length === 0) return '';

  const sentences = changed
    .filter(([key]) => next[key])
    .map(([key, name]) => {
      const label = labelFor(key);
      return label ? endSentence(`${name} set to ${label}`) : `${name} changed.`;
    });

  const cleared = changed.filter(([key]) => !next[key]);
  if (cleared.length > 0) {
    const names = cleared.map(([, name], i) => (i === 0 ? name : name.toLowerCase()));
    sentences.push(`${joinWithAnd(names)} cleared.`);
    // Nothing was set, so this is a step BACK — from a breadcrumb, or from the
    // collapsed bar — and the reader is now standing at an empty level with
    // nothing saying what to do about it.
    if (sentences.length === 1) {
      sentences.push(`Choose a ${cleared[0][1].toLowerCase()} to continue.`);
    }
  }

  return sentences.join(' ');
};

/**
 * The action button, at module scope on purpose.
 *
 * It used to be declared INSIDE `PromptSelector`, along with the rail node and
 * the step header, which makes each of them a brand-new component type on every
 * render — so React unmounted and remounted every rail node and every action
 * button whenever anything in the picker changed: a keystroke in a search box, a
 * path change, an attempt history arriving. That threw away DOM state each time,
 * and it is why focus vanished after a dialog closed: the button that opened it
 * no longer existed, so there was nothing to hand focus back to.
 *
 * It reads no component state — only the icons it is given and `requestUpgrade`
 * — so hoisting it was a move, not a rewrite. The rail node and the step header
 * have since moved again, into `NavigatorStep`, for the same reason they were
 * hoisted: the thing that repeats five times should be written once.
 */
interface ActionButtonProps {
  onClick: () => void;
  icon: LucideIcon;
  /** Also the tooltip, and how six of these are found by the import-entry spec
   *  — the strings are load-bearing and must survive byte-identical. */
  title: string;
  /** Only the wider variants carry one; without it the button is a square. */
  label?: string;
  variant?: 'default' | 'danger' | 'special' | 'primary' | 'vault';
  locked?: boolean;
}

/**
 * `variant` used to be an untyped string, so `variant="vault "` or a renamed
 * kind would have fallen quietly through to the default branch with no type
 * error and no test. The chain of ternaries it selected with is now a lookup.
 */
const ActionButton = ({
  onClick,
  icon: Icon,
  title,
  label,
  variant = 'default',
  locked = false,
}: ActionButtonProps) => (
  <button
    onClick={locked ? () => requestUpgrade('aiContentStudio') : onClick}
    className={`${NAV_ACTION_BUTTON} ${label ? 'sm:px-3' : ''} ${
      locked ? NAV_ACTION_VARIANTS.locked : NAV_ACTION_VARIANTS[variant]
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
      // A solid fill pairs with its own text: the padlock was white on
      // amber-500 at 2.15:1, and amber-950 on the same fill measures 6.97:1.
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center shadow">
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

  // --- Saying what the cascade did --------------------------------------
  // Choosing at any level clears every level below it, and until now that was
  // the quietest thing the app does: up to four steps leave the DOM, the
  // question the reader had chosen goes with them, and nothing is announced.
  const [announcement, setAnnouncement] = useState('');
  const previousPath = useRef<CascadeSnapshot | null>(null);

  useEffect(() => {
    const next: CascadeSnapshot = {
      courseId: statePath.courseId,
      syllabusYear: statePath.syllabusYear,
      topicId: statePath.topicId,
      subTopicId: statePath.subTopicId,
      dotPointId: statePath.dotPointId,
      promptId: statePath.promptId,
    };
    const previous = previousPath.current;
    previousPath.current = next;
    // Nothing on mount. An assignment link (utils/assignmentLink.ts) lands a
    // reader on a full path, and reading five levels out on load is noise
    // arriving before they have done anything.
    if (!previous) return;

    setAnnouncement(
      describeCascade(previous, next, (key) => {
        switch (key) {
          case 'courseId':
            return selectedCourse?.name ?? '';
          case 'syllabusYear':
            return SYLLABUS_YEARS.find((y) => y.id === statePath.syllabusYear)?.label ?? '';
          case 'topicId':
            return selectedTopic?.name ?? '';
          case 'subTopicId':
            return selectedSubTopic?.name ?? '';
          case 'dotPointId':
            return selectedDotPoint
              ? splitDotPointDescription(selectedDotPoint.description).stem
              : '';
          case 'promptId':
            return selectedPrompt?.question ?? '';
        }
      })
    );
  }, [
    statePath.courseId,
    statePath.syllabusYear,
    statePath.topicId,
    statePath.subTopicId,
    statePath.dotPointId,
    statePath.promptId,
  ]);

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
            <div
              className={`${NAV_OPTION_TILE} bg-blue-500/20 text-blue-500 light:bg-blue-100 light:text-blue-700 border-blue-500/20`}
            >
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
              <div
                className={`${NAV_OPTION_TILE} bg-blue-500/20 text-blue-500 light:bg-blue-100 light:text-blue-700 border-blue-500/20`}
              >
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
            <div
              className={`${NAV_OPTION_TILE} bg-purple-500/20 text-purple-500 light:bg-purple-100 light:text-purple-700 border-purple-500/20`}
            >
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
            <div
              className={`${NAV_OPTION_TILE} bg-indigo-500/20 text-indigo-500 light:bg-indigo-100 light:text-indigo-700 border-indigo-500/20`}
            >
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
              <div
                className={`${NAV_OPTION_TILE} bg-pink-500/20 text-pink-500 light:bg-pink-100 light:text-pink-700 border-pink-500/20 mt-0.5`}
              >
                <List className="w-4 h-4" />
              </div>
              <span className="min-w-0">
                <span className="block leading-snug font-medium">{stem}</span>
                {items.length > 0 && (
                  // Measured on the dot-point row's own pink-tinted surface,
                  // not on white: emerald-500/80 read 1.96:1 there in the light
                  // theme and 3.86:1 in the dark one, so both halves were under
                  // the floor. The pair is 4.86:1 / 6.89:1.
                  <span className="block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
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
              {/* The solid tile pairs with its own text — white on emerald-500
                  is 2.54:1, emerald-950 on it is 5.97:1. */}
              <div
                className={`${NAV_OPTION_TILE} transition-all ${isSelected ? 'bg-emerald-500 text-emerald-950 border-emerald-400/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}
              >
                <Target className="w-4 h-4" />
              </div>
              {/* No colour of its own. The override said `text-white` and the
                  row it sits on is `bg-emerald-500/10` — which over the light
                  theme's white list surface is white on near-white, measured at
                  1.10:1. The row already sets `text-white light:text-slate-900`
                  (`Combobox.tsx`), which measures 12.52:1 dark and 16.24:1
                  light, so the fix is to stop overriding it. */}
              <span className="font-medium">{item}</span>
            </div>
            {/* Same row, same story one element along and not on the plan's
                list: emerald-400 on that wash measures 1.75:1 in the light
                theme against an icon's 3:1 floor. */}
            {isSelected && <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />}
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
                  {/* The tile takes the tier's own paired text, exactly as the
                      verb chip eleven lines below always has. Hard-coding
                      `text-white` here put a white glyph on tier 3's yellow at
                      1.92:1 dark and 2.15:1 light; `solidText` measures 7.60:1
                      and 6.79:1, and is `text-white` on the other five tiers,
                      so nothing else moves. The padlock loses its `/70` with
                      it — an opacity on a glyph that was already failing. */}
                  {tierLocked ? (
                    <Lock className={`w-5 h-5 ${tierConfig.solidText}`} />
                  ) : (
                    <FileQuestion className={`w-5 h-5 ${tierConfig.solidText}`} />
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

  return (
    // A landmark, because this is the app's primary navigation and had no name,
    // no role and no structure of any kind — one `aria-` attribute in the whole
    // file. `role="list"` rather than an `<ol>`: it keeps the DOM shape and the
    // CSS exactly as they were, and it survives `list-style: none`, which
    // Safari's accessibility tree otherwise takes list semantics away for.
    // `tabIndex={-1}` is what makes the handover across the fold actually move
    // focus: an element with no tabindex at all cannot be focused
    // programmatically, so the move would silently do nothing.
    <nav id={SYLLABUS_NAVIGATOR_ID} tabIndex={-1} aria-label="Syllabus navigator">
      {/* Polite, never assertive: this follows the reader's own action and must
          not interrupt them. `aria-atomic`, or a sentence that changes in two
          places is read in one of them. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className={NAV_ROOT} role="list">
        <div className={NAV_RAIL_LINE} aria-hidden="true"></div>

        {/* 1. Course Selection */}
        <NavigatorStep
          level="course"
          label="Course"
          icon={BookOpen}
          isSelected={isCourseSelected}
          isComplete={isTopicSelected}
          chosenLabel={selectedCourse?.name}
          zIndex="z-50"
        >
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 w-full">
              <Combobox
                label={null}
                name="Course"
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
                color={NAV_LEVELS.course.combobox}
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
                  name="Syllabus year"
                  options={yearOptions}
                  value={syllabusYear}
                  onChange={handleYearChange}
                  placeholder="Select Year..."
                  color={NAV_LEVELS.course.combobox}
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
        </NavigatorStep>

        {/* 2. Topic Selection */}
        {selectedCourse && (
          <NavigatorStep
            level="topic"
            label="Topic"
            icon={Layers}
            isSelected={isTopicSelected}
            isComplete={isSubTopicSelected}
            chosenLabel={selectedTopic?.name}
            zIndex="z-40"
          >
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
                  name="Topic"
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
                  color={NAV_LEVELS.topic.combobox}
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
              <div className={NAV_INLINE_PANEL}>
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
                    className={`${NAV_INLINE_INPUT} font-medium`}
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
                    className={`${NAV_INLINE_INPUT} resize-y`}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setInlineTopicOpen(false);
                    }}
                  />
                  {/* On the panel's own slate-50 surface: red-400 measured
                      2.64:1, red-600 measures 4.62:1. This one sits on a
                      neutral background, so it is the one reading here the
                      contrast suite will gate the moment it can see this
                      component. */}
                  {inlineError && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      {inlineError}
                    </p>
                  )}
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
          </NavigatorStep>
        )}

        {/* 3. Sub-Topic Selection */}
        {selectedTopic && (
          <NavigatorStep
            level="subTopic"
            label="Sub-Topic"
            icon={FolderOpen}
            isSelected={isSubTopicSelected}
            isComplete={isDotPointSelected}
            chosenLabel={selectedSubTopic?.name}
            zIndex="z-30"
          >
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  name="Sub-topic"
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
                  color={NAV_LEVELS.subTopic.combobox}
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
          </NavigatorStep>
        )}

        {/* 4. Dot Point & Syllabus Focus (Merged Row) */}
        {selectedSubTopic && (
          <NavigatorStep
            level="dotPoint"
            label="Syllabus Content"
            icon={List}
            isSelected={isDotPointSelected}
            isComplete={isPromptSelected}
            chosenLabel={
              selectedDotPoint
                ? splitDotPointDescription(selectedDotPoint.description).stem
                : undefined
            }
            zIndex="z-20"
          >
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
              {/* Main Dot Point Selector - Grows to take most space */}
              <div className="flex-[3] w-full min-w-0">
                <Combobox
                  label={isDotPointSelected && hasSubItems ? 'Syllabus Point' : null}
                  name="Syllabus point"
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
                  color={NAV_LEVELS.dotPoint.combobox}
                />
              </div>

              {/* Syllabus Focus Selector - Rendered side-by-side if dot point selected and has sub-items */}
              {selectedDotPoint && hasSubItems && (
                <div className="flex-1 w-full lg:min-w-[240px] animate-fade-in">
                  <Combobox
                    label="Active Focus"
                    name="Active focus"
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
                              : // emerald-600 on hover rather than emerald-500:
                                // the white glyph over it was 2.54:1 and is now
                                // 3.77:1, which is what an icon has to clear.
                                'bg-emerald-500/10 text-emerald-400 light:text-emerald-700 border-emerald-500/20 hover:bg-emerald-600 hover:text-white'
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
                          // red-400 on the red wash measured 2.40:1 in the light
                          // theme; red-600 measures 4.19:1, past the 3:1 an
                          // icon has to clear. The hover state stays as it is —
                          // white on red-500 is 3.76:1 and already clears it.
                          className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-sm"
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
                  <div key={item} className={NAV_FOCUS_PILL}>
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
          </NavigatorStep>
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
              const stillValid = (statePath.selectedSubItems || []).filter((i) =>
                areas.includes(i)
              );
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
          <NavigatorStep
            level="question"
            label="Question"
            icon={FileQuestion}
            isSelected={isPromptSelected}
            isComplete={false}
            chosenLabel={selectedPrompt?.question}
            isEmpty={promptOptions.length === 0}
            zIndex="z-10"
          >
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
                  name="Question"
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
                  color={NAV_LEVELS.question.combobox}
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
                        // "Manual" carries a label, so it answers to 4.5:1 and
                        // not to 3. purple-400 on its own wash measured 2.34:1
                        // in the light theme; purple-700 measures 6.18:1, and
                        // the dark theme keeps the 6.05:1 it already had.
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 font-bold text-xs uppercase tracking-widest border border-purple-500/30 transition-all"
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
          </NavigatorStep>
        )}
      </div>
    </nav>
  );
};

export default PromptSelector;
