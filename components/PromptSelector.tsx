import React, { useMemo } from 'react';
import { Course, StatePath, UserRole, PromptVerb } from '../types';
import { canCurateContent, isSystemAdmin } from '../utils/permissions';
import Combobox from './Combobox';
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
} from 'lucide-react';
import { getCommandTermInfo, extractCommandVerb } from '../data/commandTerms';
import { getTierScaleConfig } from '../utils/renderUtils';
import { parseSubItemsFromDescription } from '../utils/dataManagerUtils';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';

interface PromptSelectorProps {
  courses: Course[];
  statePath: StatePath;
  onPathChange: (path: Partial<StatePath>) => void;
  onAddCourse: () => void;
  onAddTopic: () => void;
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
  onGenerateDotPoints: () => void;
  onImportTopic: () => void;
  onImportSyllabus: () => void;
  newlyAddedIds: Set<string>;
  userRole: UserRole;
}

// Static lookup map for Tailwind classes to ensure they are not purged.
// The five journey levels use clearly separated hues (blue → purple → teal →
// pink → amber); completion is a SEPARATE semantic (emerald tick on the rail),
// so a level's hue never doubles as a status light.
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

const PromptSelector: React.FC<PromptSelectorProps> = ({
  courses = [],
  statePath = {} as StatePath,
  onPathChange,
  onAddCourse,
  onAddTopic,
  onAddSubTopic,
  onGeneratePrompt,
  onManualEntry,
  onEditOutcomes,
  onOpenDataManager,
  onRenameItem,
  onDeleteItem,
  onAddTopicFromSyllabus,
  onGenerateDotPoints,
  onImportTopic,
  onImportSyllabus,
  newlyAddedIds,
  userRole,
}) => {
  const canCurate = canCurateContent(userRole);
  const isAdmin = isSystemAdmin(userRole);
  // AI generation controls stay visible when gated — amber + lock, and a click
  // opens the upgrade prompt instead. See services/entitlements.
  const studioLocked = isFeatureLocked('aiContentStudio');

  const selectedCourse = courses.find((c) => c.id === statePath.courseId);
  const selectedTopic = selectedCourse?.topics?.find((t) => t.id === statePath.topicId);
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

  const subItems = useMemo(() => {
    return selectedDotPoint?.description
      ? parseSubItemsFromDescription(selectedDotPoint.description)
      : [];
  }, [selectedDotPoint]);

  const hasSubItems = subItems.length > 0;
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
            <span className="font-medium">{c.name}</span>
          </div>
        ),
      })),
    [courses, newlyAddedIds]
  );

  const topicOptions = useMemo(
    () =>
      selectedCourse?.topics?.map((t) => ({
        id: t.id,
        label: t.name,
        isNew: newlyAddedIds.has(t.id),
        renderLabel: (
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-500 light:bg-purple-100 light:text-purple-700 border border-purple-500/20 flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-medium">{t.name}</span>
          </div>
        ),
      })) || [],
    [selectedCourse, newlyAddedIds]
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
      selectedSubTopic?.dotPoints?.map((dp) => ({
        id: dp.id,
        label: dp.description,
        isNew: newlyAddedIds.has(dp.id),
        renderLabel: (
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-md bg-pink-500/20 text-pink-500 light:bg-pink-100 light:text-pink-700 border border-pink-500/20 mt-0.5 flex-shrink-0">
              <List className="w-4 h-4" />
            </div>
            <span className="leading-snug font-medium">{dp.description}</span>
          </div>
        ),
      })) || [],
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

  const promptOptions = useMemo(() => {
    if (!selectedDotPoint?.prompts) return [];
    const resolveVerbInfo = (verb?: string, question?: string) => {
      if (verb) {
        const normalized = verb.toUpperCase() as PromptVerb;
        const info = getCommandTermInfo(normalized);
        if (info.term !== 'EXPLAIN' || normalized === 'EXPLAIN') return info;
      }
      if (question) {
        const extracted = extractCommandVerb(question);
        if (extracted) return extracted;
      }
      return getCommandTermInfo('EXPLAIN');
    };

    return [...selectedDotPoint.prompts]
      .sort((a, b) => a.totalMarks - b.totalMarks)
      .map((p) => {
        const verbInfo = resolveVerbInfo(p.verb, p.question);
        const safeTier = Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)));
        // Colour each question by its VERB TIER identity (red … purple), the
        // same scale as the verb hierarchy — so a Tier-1 question is red in
        // the picker, the prompt and the writing area alike. Band NUMBERS
        // still come from the band model and appear in copy only.
        const tierConfig = getTierScaleConfig(safeTier);

        return {
          id: p.id,
          label: p.question,
          marks: p.totalMarks,
          verb: verbInfo.term,
          tier: safeTier,
          isNew: newlyAddedIds.has(p.id),
          renderLabel: (
            <div
              className={`flex items-start gap-3 w-full overflow-hidden p-2 rounded-lg transition-colors ${tierConfig.bg}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${tierConfig.solidBg} ${tierConfig.border} shadow-sm`}
              >
                <FileQuestion className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className={`leading-snug font-bold line-clamp-2 block break-words ${tierConfig.text}`}
                >
                  {p.question}
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border ${tierConfig.solidBg} text-white ${tierConfig.border} shadow-sm`}
                  >
                    {verbInfo.term}
                  </span>
                  <span
                    className={`text-[10px] opacity-70 font-mono font-black ${tierConfig.text}`}
                  >
                    • {p.totalMarks} Marks
                  </span>
                </div>
              </div>
            </div>
          ),
        };
      });
  }, [selectedDotPoint, newlyAddedIds]);

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
    if (isComplete) {
      return (
        <div
          className={`${base} w-[1.15rem] h-[1.15rem] bg-emerald-500 border-2 border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.45)]`}
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
                  ? 'bg-blue-600/10 border-blue-600/20 text-blue-400'
                  : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-white/5 light:border-slate-400 text-[rgb(var(--color-text-secondary))] light:text-slate-600'
      }`}
      title={locked ? `${title} — part of Writing Studio Plus` : title}
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
              />
            </div>
            {canCurate && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <ActionButton onClick={onAddCourse} icon={Plus} title="Add Course" label="Add" />
                <ActionButton
                  onClick={onImportSyllabus}
                  icon={UploadCloud}
                  title="Import Syllabus (AI) — build or update a course from NESA syllabus text or a URL"
                  label="Import Syllabus"
                  variant="special"
                  locked={studioLocked}
                />
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
                No topics yet.{' '}
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {selectedTopic ? (
                    <>
                      <ActionButton
                        onClick={onAddTopicFromSyllabus}
                        icon={UploadCloud}
                        title={`Add sub-topics and dot points into "${selectedTopic.name}" from NESA syllabus text or a URL (AI)`}
                        label="Add from Syllabus"
                        variant="special"
                        locked={studioLocked}
                      />
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
                    <>
                      <ActionButton
                        onClick={onAddTopic}
                        icon={Plus}
                        title="Add Topic"
                        label="Add"
                      />
                      <ActionButton
                        onClick={onAddTopicFromSyllabus}
                        icon={UploadCloud}
                        title="Build a new topic from NESA syllabus text or a URL (AI)"
                        label="From Syllabus"
                        variant="special"
                        locked={studioLocked}
                      />
                      <ActionButton
                        onClick={onImportTopic}
                        icon={Upload}
                        title="Import Topic (.json)"
                        label="Import"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
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
                            name: selectedDotPoint.description,
                          })
                        }
                        icon={Trash2}
                        title="Delete"
                        variant="danger"
                      />
                    </>
                  ) : (
                    <ActionButton
                      onClick={onGenerateDotPoints}
                      icon={Sparkles}
                      title="Generate dot points for this sub-topic (AI)"
                      label="Generate"
                      variant="special"
                      locked={studioLocked}
                    />
                  )}
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
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex-1 w-full">
                <Combobox
                  label={null}
                  options={promptOptions}
                  value={statePath.promptId || ''}
                  onChange={(id) => onPathChange({ promptId: id })}
                  placeholder="Select Question..."
                  color="amber"
                />
              </div>
              {canCurate && (
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {selectedPrompt ? (
                    <>
                      <ActionButton
                        onClick={onGeneratePrompt}
                        icon={Sparkles}
                        title="Generate New"
                        variant="primary"
                        locked={studioLocked}
                      />
                      <ActionButton
                        onClick={onManualEntry}
                        icon={PenTool}
                        title="Manual Input"
                        variant="special"
                      />
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
                      <button
                        onClick={
                          studioLocked ? () => requestUpgrade('aiContentStudio') : onGeneratePrompt
                        }
                        title={
                          studioLocked
                            ? 'AI question generation is part of Writing Studio Plus — tap to learn more'
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
