import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Course,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  StatePath,
  CommandTermInfo,
  SampleAnswer,
} from '../../types';
import {
  BatchTask,
  runBatchOperations,
  BatchProgress,
  BatchFatalError,
} from '../../utils/batchProcessor';
import { setBatchModelOverride } from '../../services/aiConfig';
import { AI_MODELS } from '../../services/aiModels';
import {
  generateNewPrompt,
  generateSampleAnswer,
  generateRubricForPrompt,
  reviseRubricForPrompt,
  suggestOutcomesForPrompt,
  evaluateAnswer,
  screenContentQuality,
} from '../../services/geminiService';
import {
  getCommandTermsForMarks,
  extractCommandVerb,
  getBandForMark,
  getCommandTermInfo,
} from '../../data/commandTerms';
import { isCurriculumRemote } from '../../services/curriculumService';
import {
  savePromptContribution,
  saveSampleAnswerContribution,
} from '../../services/contributionService';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useScrollLock } from '../../hooks/useScrollLock';
import {
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
  FileText,
  X,
  Folder,
  Layers,
  Hash,
  BookOpen,
  Filter,
  Terminal,
  PieChart,
  Activity,
  Link2,
  Search,
  RotateCcw,
  Scale,
  Cpu,
  Wrench,
  UploadCloud,
  Gauge,
  AlertTriangle,
} from 'lucide-react';

// --- Shared Components ---

const MeshOverlay = ({ opacity = 'opacity-[0.03]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const InstrumentMetric = ({
  label,
  value,
  subValue,
  colorClass,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  colorClass: string;
}) => (
  <div className="flex flex-col gap-1 px-4 md:px-8 py-3 md:py-4 border-r border-white/5 light:border-slate-200 last:border-r-0">
    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 light:text-slate-500 whitespace-nowrap">
      {label}
    </span>
    <div className="flex items-baseline gap-2">
      <span className={`text-4xl font-black tracking-tighter tabular-nums ${colorClass}`}>
        {value}
      </span>
      {subValue && (
        <span className="text-xs font-bold text-white/10 light:text-slate-300 uppercase tracking-widest">
          {subValue}
        </span>
      )}
    </div>
  </div>
);

// --- Types ---

interface ContentAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  updateCourses: (updater: (draft: any) => void) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type NodeType = 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt';

interface TreeNode {
  id: string;
  parentId?: string;
  type: NodeType;
  label: string;
  children?: TreeNode[];
  stats: {
    questions: number;
    samples: number;
    enriched: number;
    missingOutcomes: number;
    missingMarkingCriteria: number;
    rubricNotDescending: number;
    totalDotPoints: number;
    coveredDotPoints: number;
  };
  verbInfo?: {
    term: string;
    tier: number;
  };
  dataRef: any;
  path: StatePath;
}

type VisibilityFilter =
  | 'emptyDotPoints'
  | 'missingSamples'
  | 'unEnriched'
  | 'missingOutcomes'
  | 'missingRubrics'
  | 'rubricNotDescending'
  | 'hasSamples'
  | 'lowQuality'
  | 'flagged'
  | null;

type BulkActionType =
  | 'generateQuestions'
  | 'generateSamples'
  | 'generateRubrics'
  | 'reviseRubrics'
  | 'linkOutcomes'
  | 'recalibrateSamples'
  | 'screenQuality'
  | 'fixAllGaps';

// Gap predicates shared by the task assembly, the button target counts, and
// the tree badges — one definition of "what counts as a gap".
const isEmptyDotPoint = (n: TreeNode) => n.type === 'dotPoint' && n.stats.questions === 0;
const needsSamples = (n: TreeNode) => n.type === 'prompt' && n.stats.samples === 0;
const needsRubric = (n: TreeNode) =>
  n.type === 'prompt' && (n.stats.missingMarkingCriteria > 0 || n.stats.rubricNotDescending > 0);
const hasNonStandardRubric = (n: TreeNode) =>
  n.type === 'prompt' && n.stats.rubricNotDescending > 0;
const needsOutcomes = (n: TreeNode) => n.type === 'prompt' && n.stats.missingOutcomes > 0;
const hasSamplesToRecalibrate = (n: TreeNode) => n.type === 'prompt' && n.stats.samples > 0;
const qualityOf = (n: TreeNode): number | null =>
  n.type === 'prompt' ? ((n.dataRef as Prompt).qualityScore ?? null) : null;
// Thresholds match the Review Queue's QualityBadge: <50 needs a close look.
const isLowQuality = (n: TreeNode) => {
  const q = qualityOf(n);
  return q !== null && q < 50;
};
// A question counts as flagged when it, or any of its sample answers, carries
// an OPEN user-raised content flag (see ContentFlag in types.ts).
const isFlagged = (n: TreeNode): boolean => {
  if (n.type !== 'prompt') return false;
  const p = n.dataRef as Prompt;
  return (
    p.contentFlag?.status === 'open' ||
    (p.sampleAnswers || []).some((sa) => sa.contentFlag?.status === 'open')
  );
};

const GAP_BADGE_BASE =
  'px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-wider whitespace-nowrap';

/**
 * Inline data-quality flags on tree rows, colour-matched to the filter chips
 * above, so problem content is identifiable while browsing — not only after
 * toggling a filter.
 */
const GapBadges: React.FC<{ node: TreeNode }> = ({ node }) => {
  const badges: { label: string; tone: string; title: string }[] = [];

  if (isEmptyDotPoint(node))
    badges.push({
      label: 'No Questions',
      tone: 'bg-red-500/10 border-red-500/30 text-red-400',
      title: 'This dot point has no questions yet',
    });
  if (isFlagged(node)) {
    const p = node.dataRef as Prompt;
    const reason =
      p.contentFlag?.status === 'open'
        ? p.contentFlag.reason
        : (p.sampleAnswers || []).find((sa) => sa.contentFlag?.status === 'open')?.contentFlag
            ?.reason;
    badges.push({
      label: 'Flagged',
      tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      title: reason ? `Flagged by a user: ${reason}` : 'Flagged by a user for review',
    });
  }
  if (node.type === 'prompt') {
    if (node.stats.missingMarkingCriteria > 0)
      badges.push({
        label: 'No Rubric',
        tone: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
        title: 'No marking guide',
      });
    else if (node.stats.rubricNotDescending > 0)
      badges.push({
        label: 'Rubric ⚠',
        tone: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        title: 'Non-standard rubric format (marks not in descending bands)',
      });
    if (needsSamples(node))
      badges.push({
        label: 'No Samples',
        tone: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        title: 'No sample answers',
      });
    if (needsOutcomes(node))
      badges.push({
        label: 'No Outcomes',
        tone: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
        title: 'No syllabus outcomes linked',
      });
    const q = qualityOf(node);
    if (q !== null)
      badges.push({
        label: `AI ${q}`,
        tone:
          q >= 75
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : q >= 50
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        title:
          (node.dataRef as Prompt).qualityNotes ||
          'AI quality pre-screen score (advisory — review the content itself)',
      });
  }

  if (badges.length === 0) return null;
  return (
    <span className="hidden md:flex items-center gap-1.5 shrink-0">
      {badges.map((b) => (
        <span key={b.label} title={b.title} className={`${GAP_BADGE_BASE} ${b.tone}`}>
          {b.label}
        </span>
      ))}
    </span>
  );
};

// --- Helpers ---

const isNonStandardRubric = (criteria: string | undefined): boolean => {
  if (!criteria || criteria.trim().length <= 25) return false; // Handled by missing logic

  const lines = criteria.split('\n');
  let lastVal = Infinity;
  let foundAny = false;

  for (const line of lines) {
    // Look for lines starting with numbers (allowing bullets/dashes) followed by "mark"
    const match = line.match(/^\s*[-•*]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?/i);
    if (match) {
      foundAny = true;
      // Get the highest number in the range (e.g. "4-5 marks" -> 5)
      const val = match[2] ? parseInt(match[2]) : parseInt(match[1]);

      if (val > lastVal) return true; // Ascending order detected -> Non-standard
      lastVal = val;
    }
  }

  // If we have text but no standard "X marks" lines found, it's non-standard format
  return !foundAny;
};

// --- Tree Builder Helper ---

const buildAuditTree = (courses: Course[]): TreeNode[] => {
  const mapStats = (nodes: TreeNode[]): TreeNode['stats'] => {
    return nodes.reduce(
      (acc, node) => ({
        questions: acc.questions + node.stats.questions,
        samples: acc.samples + node.stats.samples,
        enriched: acc.enriched + node.stats.enriched,
        missingOutcomes: acc.missingOutcomes + node.stats.missingOutcomes,
        missingMarkingCriteria: acc.missingMarkingCriteria + node.stats.missingMarkingCriteria,
        rubricNotDescending: acc.rubricNotDescending + node.stats.rubricNotDescending,
        totalDotPoints: acc.totalDotPoints + node.stats.totalDotPoints,
        coveredDotPoints: acc.coveredDotPoints + node.stats.coveredDotPoints,
      }),
      {
        questions: 0,
        samples: 0,
        enriched: 0,
        missingOutcomes: 0,
        missingMarkingCriteria: 0,
        rubricNotDescending: 0,
        totalDotPoints: 0,
        coveredDotPoints: 0,
      }
    );
  };

  return courses.map((course) => {
    const courseOutcomeCodes = new Set(course.outcomes.map((o) => o.code));

    const topics = (course.topics || []).map((topic) => {
      const subTopics = (topic.subTopics || []).map((st) => {
        const dotPoints = (st.dotPoints || []).map((dp) => {
          const verbInfo = extractCommandVerb(dp.description);
          const prompts = (dp.prompts || []).map((p) => {
            // 1. Outcomes
            const validOutcomes = Array.isArray(p.linkedOutcomes)
              ? p.linkedOutcomes.filter(
                  (o) => typeof o === 'string' && o.trim().length > 0 && courseOutcomeCodes.has(o)
                )
              : [];

            // 2. Keywords
            const validKeywords = Array.isArray(p.keywords)
              ? p.keywords.filter((k) => typeof k === 'string' && k.trim().length > 0)
              : [];

            // 3. Scenario
            const hasScenario = typeof p.scenario === 'string' && p.scenario.trim().length > 15;

            // 4. Rubric
            const hasRubric =
              typeof p.markingCriteria === 'string' && p.markingCriteria.trim().length > 25;
            const rubricNonStd = isNonStandardRubric(p.markingCriteria);

            // 5. Samples
            const validSamples = Array.isArray(p.sampleAnswers)
              ? p.sampleAnswers.filter(
                  (sa) => typeof sa.answer === 'string' && sa.answer.trim().length > 30
                )
              : [];

            const isEnriched = validKeywords.length > 0 && hasScenario;

            return {
              id: p.id,
              parentId: dp.id,
              type: 'prompt' as NodeType,
              label: p.question,
              stats: {
                questions: 1,
                samples: validSamples.length,
                enriched: isEnriched ? 1 : 0,
                missingOutcomes: validOutcomes.length === 0 ? 1 : 0,
                missingMarkingCriteria: !hasRubric ? 1 : 0,
                rubricNotDescending: rubricNonStd ? 1 : 0,
                totalDotPoints: 0,
                coveredDotPoints: 0,
              },
              dataRef: p,
              path: {
                courseId: course.id,
                topicId: topic.id,
                subTopicId: st.id,
                dotPointId: dp.id,
                promptId: p.id,
              },
            };
          });

          return {
            id: dp.id,
            parentId: st.id,
            type: 'dotPoint' as NodeType,
            label: dp.description,
            children: prompts,
            stats: {
              questions: prompts.length,
              samples: prompts.reduce((sum, p) => sum + p.stats.samples, 0),
              enriched: prompts.reduce((sum, p) => sum + p.stats.enriched, 0),
              missingOutcomes: prompts.reduce((sum, p) => sum + p.stats.missingOutcomes, 0),
              missingMarkingCriteria: prompts.reduce(
                (sum, p) => sum + p.stats.missingMarkingCriteria,
                0
              ),
              rubricNotDescending: prompts.reduce((sum, p) => sum + p.stats.rubricNotDescending, 0),
              totalDotPoints: 1,
              coveredDotPoints: prompts.length > 0 ? 1 : 0,
            },
            verbInfo: verbInfo ? { term: verbInfo.term, tier: verbInfo.tier } : undefined,
            dataRef: dp,
            path: { courseId: course.id, topicId: topic.id, subTopicId: st.id, dotPointId: dp.id },
          };
        });

        return {
          id: st.id,
          parentId: topic.id,
          type: 'subTopic' as NodeType,
          label: st.name,
          children: dotPoints,
          stats: mapStats(dotPoints),
          dataRef: st,
          path: { courseId: course.id, topicId: topic.id, subTopicId: st.id },
        };
      });

      return {
        id: topic.id,
        parentId: course.id,
        type: 'topic' as NodeType,
        label: topic.name,
        children: subTopics,
        stats: mapStats(subTopics),
        dataRef: topic,
        path: { courseId: course.id, topicId: topic.id },
      };
    });

    return {
      id: course.id,
      parentId: undefined,
      type: 'course' as NodeType,
      label: course.name,
      children: topics,
      stats: mapStats(topics),
      dataRef: course,
      path: { courseId: course.id },
    };
  });
};

const ContentAuditModal: React.FC<ContentAuditModalProps> = ({
  isOpen,
  onClose,
  courses,
  updateCourses,
  showToast,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  // 'default' = the app's per-role engine selection; otherwise an AI_MODELS
  // id that every call in the batch is routed to.
  const [batchEngine, setBatchEngine] = useState<string>('default');

  // Prompts changed by batch runs but not yet pushed to the shared Supabase
  // library. Repairs land in local IndexedDB first (updateCourses); in remote
  // mode the admin then syncs them through contributionService as `pending`
  // contributions, keeping the moderation loop as the single publish path.
  // Keyed by prompt app-id so repeated repairs to one prompt dedupe.
  const touchedRef = useRef<
    Map<string, { promptAppId: string; dotPointAppId: string; label: string }>
  >(new Map());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const recordTouch = (promptAppId: string, dotPointAppId: string, label: string) => {
    touchedRef.current.set(promptAppId, { promptAppId, dotPointAppId, label });
    setPendingSyncCount(touchedRef.current.size);
  };
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<VisibilityFilter>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Escape closes the studio — but never while a batch is running (that
  // needs an explicit Stop so no run is abandoned by a stray key press).
  useEscapeKey(isOpen && !isProcessing, onClose);
  useScrollLock(isOpen);

  const treeData = useMemo(() => buildAuditTree(courses), [courses]);

  const flatMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const traverse = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        map.set(n.id, n);
        if (n.children) traverse(n.children);
      });
    };
    traverse(treeData);
    return map;
  }, [treeData]);

  const counts = useMemo(() => {
    let emptyDotPoints = 0;
    let missingSamples = 0;
    let unEnriched = 0;
    let missingOutcomes = 0;
    let missingRubrics = 0;
    let nonStandardRubrics = 0;
    let hasSamples = 0;
    let lowQuality = 0;
    let flagged = 0;

    flatMap.forEach((node) => {
      if (node.type === 'dotPoint' && node.stats.questions === 0) emptyDotPoints++;
      if (node.type === 'prompt') {
        if (node.stats.samples === 0) missingSamples++;
        if (node.stats.enriched === 0) unEnriched++;
        if (node.stats.missingOutcomes > 0) missingOutcomes++;
        if (node.stats.missingMarkingCriteria > 0) missingRubrics++;
        if (node.stats.rubricNotDescending > 0) nonStandardRubrics++;
        if (node.stats.samples > 0) hasSamples++;
        if (isLowQuality(node)) lowQuality++;
        if (isFlagged(node)) flagged++;
      }
    });

    return {
      emptyDotPoints,
      missingSamples,
      unEnriched,
      missingOutcomes,
      missingRubrics,
      nonStandardRubrics,
      hasSamples,
      lowQuality,
      flagged,
    };
  }, [flatMap]);

  // How many items the CURRENT SELECTION actually targets, per action — so
  // the footer buttons can show what a click will do (and disable when it
  // would do nothing) instead of failing with a toast after the fact.
  const selectionTargets = useMemo(() => {
    let questions = 0;
    let rubrics = 0;
    let rubricRevisions = 0;
    let samples = 0;
    let outcomes = 0;
    let recalibrations = 0;
    let screenings = 0;

    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node) return;
      if (isEmptyDotPoint(node)) questions++;
      if (needsRubric(node)) rubrics++;
      if (hasNonStandardRubric(node)) rubricRevisions++;
      if (needsSamples(node)) samples++;
      if (needsOutcomes(node)) outcomes++;
      if (hasSamplesToRecalibrate(node))
        recalibrations += (node.dataRef as Prompt).sampleAnswers?.length || 0;
      if (node.type === 'prompt') screenings++;
    });

    return {
      questions,
      rubrics,
      rubricRevisions,
      samples,
      outcomes,
      recalibrations,
      screenings,
      allGaps: questions + rubrics + samples + outcomes,
    };
  }, [selectedIds, flatMap]);

  const filteredTreeData = useMemo(() => {
    if (!searchQuery && !activeFilter) return treeData;

    const filterNode = (node: TreeNode): TreeNode | null => {
      const matchesSearch = node.label.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesGap = true;
      if (activeFilter) {
        if (activeFilter === 'emptyDotPoints')
          matchesGap = node.type === 'dotPoint' && node.stats.questions === 0;
        else if (activeFilter === 'missingSamples')
          matchesGap = node.type === 'prompt' && node.stats.samples === 0;
        else if (activeFilter === 'unEnriched')
          matchesGap = node.type === 'prompt' && node.stats.enriched === 0;
        else if (activeFilter === 'missingOutcomes')
          matchesGap = node.type === 'prompt' && node.stats.missingOutcomes > 0;
        else if (activeFilter === 'missingRubrics')
          matchesGap = node.type === 'prompt' && node.stats.missingMarkingCriteria > 0;
        else if (activeFilter === 'rubricNotDescending')
          matchesGap = node.type === 'prompt' && node.stats.rubricNotDescending > 0;
        else if (activeFilter === 'hasSamples')
          matchesGap = node.type === 'prompt' && node.stats.samples > 0;
        else if (activeFilter === 'lowQuality') matchesGap = isLowQuality(node);
        else if (activeFilter === 'flagged') matchesGap = isFlagged(node);
      }

      // Recursive check for children
      const filteredChildren = (node.children || [])
        .map((child) => filterNode(child))
        .filter(Boolean) as TreeNode[];

      const hasVisibleChildren = filteredChildren.length > 0;

      // A node is visible if it matches both conditions OR has visible children
      if (hasVisibleChildren) {
        return { ...node, children: filteredChildren };
      }

      // Base case matches
      if (matchesSearch && matchesGap) {
        // Special case: higher level nodes only show if they match the query AND we are not filtering for a gap they can't have
        // (except for dotPoints being empty)
        if (
          node.type === 'prompt' ||
          (node.type === 'dotPoint' && activeFilter === 'emptyDotPoints')
        ) {
          return node;
        }
        // If we are searching and there's no gap filter, we show the path
        if (searchQuery && !activeFilter) return node;
      }

      return null;
    };

    return treeData.map((node) => filterNode(node)).filter(Boolean) as TreeNode[];
  }, [treeData, searchQuery, activeFilter]);

  // Ids currently visible in the (search + filter) narrowed tree, so "Select
  // All Filtered" only ever selects what's actually on screen.
  const filteredIds = useMemo(() => {
    const ids = new Set<string>();
    const traverse = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        ids.add(n.id);
        if (n.children) traverse(n.children);
      });
    };
    traverse(filteredTreeData);
    return ids;
  }, [filteredTreeData]);

  // Auto-expand top-level courses once when the modal opens. Using a ref
  // (rather than "expandedIds.size === 0") means a user who deliberately
  // collapses everything stays collapsed instead of being snapped back open.
  const hasAutoExpandedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasAutoExpandedRef.current) {
      setExpandedIds(new Set(treeData.map((c) => c.id)));
      hasAutoExpandedRef.current = true;
    }
    if (!isOpen) {
      hasAutoExpandedRef.current = false;
    }
  }, [isOpen, treeData]);

  useEffect(() => {
    // Optional call: scrollIntoView is missing in some environments (jsdom).
    logsEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [progress?.logs]);

  const toggleSelect = (id: string, checked: boolean) => {
    if (isProcessing) return;
    const newSelected = new Set(selectedIds);
    const node = flatMap.get(id);
    if (!node) return;

    const toggleNode = (n: TreeNode, isChecked: boolean) => {
      if (isChecked) newSelected.add(n.id);
      else newSelected.delete(n.id);
      if (n.children) n.children.forEach((c) => toggleNode(c, isChecked));
    };

    toggleNode(node, checked);
    setSelectedIds(newSelected);
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  const expandAll = () => {
    const all = new Set<string>();
    flatMap.forEach((_, id) => all.add(id));
    setExpandedIds(all);
  };

  const collapseAll = () => setExpandedIds(new Set());

  const clearSelection = () => setSelectedIds(new Set());

  const handleFilterToggle = (criteria: VisibilityFilter) => {
    if (activeFilter === criteria) {
      setActiveFilter(null);
    } else {
      setActiveFilter(criteria);
      // Auto-expand everything that matches
      const newExpanded = new Set(expandedIds);
      const traverse = (nodes: TreeNode[]) => {
        nodes.forEach((n) => {
          newExpanded.add(n.id);
          if (n.children) traverse(n.children);
        });
      };
      traverse(treeData);
      setExpandedIds(newExpanded);
    }
  };

  const handleSmartSelect = (criteria: VisibilityFilter) => {
    if (!criteria) return;
    const newSelected = new Set<string>();
    const newExpanded = new Set<string>(expandedIds);

    flatMap.forEach((node) => {
      // Only select items currently visible under the active search + filter,
      // not every match in the whole library.
      if (!filteredIds.has(node.id)) return;

      let match = false;
      if (criteria === 'emptyDotPoints' && node.type === 'dotPoint' && node.stats.questions === 0)
        match = true;
      if (criteria === 'missingSamples' && node.type === 'prompt' && node.stats.samples === 0)
        match = true;
      if (criteria === 'unEnriched' && node.type === 'prompt' && node.stats.enriched === 0)
        match = true;
      if (
        criteria === 'missingOutcomes' &&
        node.type === 'prompt' &&
        node.stats.missingOutcomes > 0
      )
        match = true;
      if (
        criteria === 'missingRubrics' &&
        node.type === 'prompt' &&
        node.stats.missingMarkingCriteria > 0
      )
        match = true;
      if (
        criteria === 'rubricNotDescending' &&
        node.type === 'prompt' &&
        node.stats.rubricNotDescending > 0
      )
        match = true;
      if (criteria === 'hasSamples' && node.type === 'prompt' && node.stats.samples > 0)
        match = true;
      if (criteria === 'lowQuality' && isLowQuality(node)) match = true;

      if (match) {
        newSelected.add(node.id);
        let current = node;
        while (current.parentId) {
          newExpanded.add(current.parentId);
          const parent = flatMap.get(current.parentId);
          if (parent) current = parent;
          else break;
        }
      }
    });

    setSelectedIds(newSelected);
    setExpandedIds(newExpanded);
    showToast(`Selected ${newSelected.size} items for optimisation.`, 'success');
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // Don't clear isProcessing here — a task may still be in flight and
      // its AI result would otherwise land after the UI claims we've
      // stopped. runBatchOperations now waits for in-flight tasks to drain
      // before resolving; handleBulkAction clears isProcessing then.
      setIsStopping(true);
      showToast('Stopping… waiting for the current task to finish.', 'info');
    }
  };

  // --- Per-node task builders --------------------------------------------
  // Each returns the batch task(s) that repair one kind of gap on one node.
  // Both the single-action buttons and "Fix All Gaps" compose from these.

  const findDraftPrompt = (draft: any, path: StatePath) =>
    draft
      .find((x: any) => x.id === path.courseId)
      ?.topics.find((x: any) => x.id === path.topicId)
      ?.subTopics.find((x: any) => x.id === path.subTopicId)
      ?.dotPoints.find((x: any) => x.id === path.dotPointId)
      ?.prompts.find((x: any) => x.id === path.promptId);

  const makeQuestionTask = (node: TreeNode): BatchTask<void> => ({
    id: `q-${node.id}`,
    description: `Generating question: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const path = node.path;
      const course = courses.find((c) => c.id === path.courseId);
      const topic = course?.topics.find((t) => t.id === path.topicId);
      if (!course || !topic) return;

      const description = node.dataRef.description;
      const syllabusVerbInfo = extractCommandVerb(description);
      let targetMarks = 5;
      let verbsToUse: CommandTermInfo[] = [];

      if (syllabusVerbInfo) {
        const maxTier = syllabusVerbInfo.tier;
        const tierRanges: Record<number, [number, number]> = {
          1: [1, 2],
          2: [3, 4],
          3: [4, 6],
          4: [5, 8],
          5: [6, 10],
          6: [8, 12],
        };
        const range = tierRanges[maxTier] || [4, 8];
        targetMarks = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        const { terms } = getCommandTermsForMarks(targetMarks);
        verbsToUse = terms;
        if (!verbsToUse.find((v) => v.term === syllabusVerbInfo.term))
          verbsToUse.unshift(syllabusVerbInfo);
      } else {
        const { terms } = getCommandTermsForMarks(5);
        verbsToUse = terms;
      }

      const prompt = await generateNewPrompt(
        course.name,
        topic.name,
        description,
        targetMarks,
        verbsToUse,
        course.outcomes
      );
      updateCourses((draft) => {
        const dp = draft
          .find((x: any) => x.id === path.courseId)
          ?.topics.find((x: any) => x.id === path.topicId)
          ?.subTopics.find((x: any) => x.id === path.subTopicId)
          ?.dotPoints.find((x: any) => x.id === path.dotPointId);
        if (dp) {
          if (!dp.prompts) dp.prompts = [];
          dp.prompts.push(prompt);
        }
      });
      if (path.dotPointId) recordTouch(prompt.id, path.dotPointId, prompt.question);
    },
  });

  const makeSampleTask = (node: TreeNode): BatchTask<void> => ({
    id: `sa-${node.id}`,
    description: `Drafting sample answer: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = node.dataRef as Prompt;
      const answer = await generateSampleAnswer(prompt, prompt.totalMarks, []);
      updateCourses((draft) => {
        const p = findDraftPrompt(draft, node.path);
        if (p) {
          if (!p.sampleAnswers) p.sampleAnswers = [];
          p.sampleAnswers.push(answer);
        }
      });
      if (node.path.promptId && node.path.dotPointId)
        recordTouch(node.path.promptId, node.path.dotPointId, node.label);
    },
  });

  const makeRubricTask = (node: TreeNode): BatchTask<void> => ({
    id: `rubric-${node.id}`,
    description: `Synthesising rubric: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = node.dataRef as Prompt;
      const course = courses.find((c) => c.id === node.path.courseId);
      if (!course) return;
      const rubric = await generateRubricForPrompt(prompt, course.outcomes);
      updateCourses((draft) => {
        const p = findDraftPrompt(draft, node.path);
        if (p) p.markingCriteria = rubric;
      });
      if (node.path.promptId && node.path.dotPointId)
        recordTouch(node.path.promptId, node.path.dotPointId, node.label);
    },
  });

  const makeRubricRevisionTask = (node: TreeNode): BatchTask<void> => ({
    id: `revise-rubric-${node.id}`,
    description: `Revising rubric: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = node.dataRef as Prompt;
      if (!prompt.markingCriteria) return;
      const revised = await reviseRubricForPrompt(prompt, prompt.markingCriteria);
      updateCourses((draft) => {
        const p = findDraftPrompt(draft, node.path);
        if (p) p.markingCriteria = revised;
      });
      if (node.path.promptId && node.path.dotPointId)
        recordTouch(node.path.promptId, node.path.dotPointId, node.label);
    },
  });

  const makeOutcomeTask = (node: TreeNode): BatchTask<void> => ({
    id: `link-${node.id}`,
    description: `Linking outcomes: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = node.dataRef as Prompt;
      const course = courses.find((c) => c.id === node.path.courseId);
      if (!course) return;
      const suggested = await suggestOutcomesForPrompt(
        prompt.question,
        course.outcomes,
        prompt.totalMarks
      );
      updateCourses((draft) => {
        const p = findDraftPrompt(draft, node.path);
        if (p) p.linkedOutcomes = suggested;
      });
      if (node.path.promptId && node.path.dotPointId)
        recordTouch(node.path.promptId, node.path.dotPointId, node.label);
    },
  });

  const makeRecalibrationTasks = (node: TreeNode): BatchTask<void>[] => {
    const prompt = node.dataRef as Prompt;
    // Calculate strict constraints based on the Prompt's Verb
    const verbInfo = getCommandTermInfo(prompt.verb);
    const verbTier = verbInfo.tier;
    if (!prompt.sampleAnswers || prompt.sampleAnswers.length === 0) return [];

    return prompt.sampleAnswers.map((sample) => ({
      id: `recal-${sample.id}`,
      description: `Recalibrating sample (Band ${verbTier} rules): ${node.label.slice(0, 20)}...`,
      action: async () => {
        // 1. Create a clean calibration prompt without existing samples to prevent bias
        const calibrationPrompt = { ...prompt, sampleAnswers: [] };

        // 2. Ask AI to evaluate the Mark (quality), passing the Tier context
        const result = await evaluateAnswer(sample.answer, calibrationPrompt, verbInfo);

        // 3. Enforce STRICT band calculation based on the AI's Mark and the Question's Tier.
        // This overrides any band hallucinated by the AI, ensuring structural consistency across the dataset.
        const strictBand = getBandForMark(result.overallMark, prompt.totalMarks, verbTier);

        updateCourses((draft) => {
          const p = findDraftPrompt(draft, node.path);
          if (p && p.sampleAnswers) {
            const targetSample = p.sampleAnswers.find((s: SampleAnswer) => s.id === sample.id);
            if (targetSample) {
              targetSample.mark = result.overallMark;
              targetSample.band = strictBand; // Apply strict band
              targetSample.feedback = result.overallFeedback;
              targetSample.quickTip = result.quickTip;
            }
          }
        });
        if (node.path.promptId && node.path.dotPointId)
          recordTouch(node.path.promptId, node.path.dotPointId, node.label);
      },
    }));
  };

  /**
   * AI quality pre-screen for an existing question. Structural gaps are caught
   * by the badges; this catches content that EXISTS but is weak. The score is
   * stored on the prompt (persisted locally, shown as an inline badge, and
   * carried to the shared library on sync so reviewers can triage).
   */
  const makeScreeningTask = (node: TreeNode): BatchTask<void> => ({
    id: `screen-${node.id}`,
    description: `Screening quality: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = node.dataRef as Prompt;
      const quality = await screenContentQuality(prompt.question, 'question');
      // screenContentQuality swallows its own errors; surface that as a
      // failed task rather than silently recording nothing.
      if (!quality) throw new Error('Quality screening returned no result.');
      updateCourses((draft) => {
        const p = findDraftPrompt(draft, node.path);
        if (p) {
          p.qualityScore = quality.score;
          p.qualityNotes = quality.notes;
        }
      });
    },
  });

  const buildTasks = (actionType: BulkActionType): BatchTask<void>[] => {
    const tasks: BatchTask<void>[] = [];
    const all = actionType === 'fixAllGaps';

    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node) return;

      if ((all || actionType === 'generateQuestions') && isEmptyDotPoint(node))
        tasks.push(makeQuestionTask(node));
      if ((all || actionType === 'generateRubrics') && needsRubric(node))
        tasks.push(makeRubricTask(node));
      if (actionType === 'reviseRubrics' && hasNonStandardRubric(node))
        tasks.push(makeRubricRevisionTask(node));
      if ((all || actionType === 'linkOutcomes') && needsOutcomes(node))
        tasks.push(makeOutcomeTask(node));
      if ((all || actionType === 'generateSamples') && needsSamples(node))
        tasks.push(makeSampleTask(node));
      if (actionType === 'recalibrateSamples' && hasSamplesToRecalibrate(node))
        tasks.push(...makeRecalibrationTasks(node));
      if (actionType === 'screenQuality' && node.type === 'prompt')
        tasks.push(makeScreeningTask(node));
    });

    return tasks;
  };

  /**
   * Shared batch runner: progress wiring, stop handling, cleanup, and an
   * end-of-run summary (the processing terminal collapses when the batch
   * ends, so the outcome must survive as a toast).
   */
  const executeBatch = async (
    tasks: BatchTask<void>[],
    summarise: (done: number, failed: number, aborted: boolean, fatal?: BatchFatalError) => void
  ) => {
    setIsProcessing(true);
    setProgress(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let finalProgress: BatchProgress | null = null;
    try {
      await runBatchOperations(
        tasks,
        1,
        (prog) => {
          finalProgress = prog;
          setProgress(prog);
        },
        controller.signal
      );
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      abortControllerRef.current = null;
    }

    summarise(
      finalProgress?.completed ?? 0,
      finalProgress?.failed ?? 0,
      controller.signal.aborted,
      finalProgress?.fatalError
    );
  };

  const handleBulkAction = async (actionType: BulkActionType) => {
    if (isProcessing) return; // a batch is already running

    const tasks = buildTasks(actionType);
    if (tasks.length === 0) {
      showToast('No target items found in current selection.', 'info');
      return;
    }

    // Route every AI call in this batch to the engine the admin picked for
    // the run (or leave the app's per-role defaults when 'default').
    setBatchModelOverride(batchEngine === 'default' ? null : batchEngine);
    try {
      await executeBatch(tasks, (done, failed, aborted, fatal) => {
        if (aborted) {
          showToast(`Batch stopped — ${done} of ${tasks.length} completed.`, 'info');
        } else if (fatal) {
          showToast(`Batch halted: ${fatal.userMessage} ${fatal.suggestion}`, 'error');
        } else if (failed > 0) {
          showToast(
            `Batch finished: ${done} succeeded, ${failed} failed. Check the processing log for details.`,
            'error'
          );
        } else {
          showToast(`Batch complete: ${done} item${done === 1 ? '' : 's'} updated.`, 'success');
        }
      });
    } finally {
      setBatchModelOverride(null);
    }
  };

  /**
   * Push everything the studio has repaired to the shared Supabase library
   * through the sanctioned contribution write path. Content lands as
   * `pending`, flowing through the same review queue as user submissions —
   * the moderation loop stays the single road to `approved`. Items are only
   * removed from the outbox on success, so a failed push is retryable.
   */
  const handleSyncToLibrary = async () => {
    if (isProcessing) return;
    const entries = Array.from(touchedRef.current.values());
    if (entries.length === 0) return;

    const tasks: BatchTask<void>[] = entries.map((t) => ({
      id: `sync-${t.promptAppId}`,
      description: `Syncing to library: ${t.label.slice(0, 30)}...`,
      action: async () => {
        // Read the CURRENT prompt from the tree — it carries every repair
        // applied since the touch was recorded.
        const node = flatMap.get(t.promptAppId);
        const prompt = node?.dataRef as Prompt | undefined;
        if (!prompt) throw new Error('Prompt no longer exists locally.');

        // Carry the AI pre-screen (if this prompt has been scored) so the
        // review queue can triage the pushed repair.
        const quality =
          prompt.qualityScore != null
            ? { score: prompt.qualityScore, notes: prompt.qualityNotes ?? '' }
            : undefined;
        await savePromptContribution(t.dotPointAppId, prompt, 'pending', quality);
        for (const sa of prompt.sampleAnswers ?? []) {
          await saveSampleAnswerContribution(prompt.id, sa, 'pending');
        }

        touchedRef.current.delete(t.promptAppId);
        setPendingSyncCount(touchedRef.current.size);
      },
    }));

    await executeBatch(tasks, (done, failed, aborted) => {
      if (aborted) {
        showToast(`Sync stopped — ${done} of ${tasks.length} pushed.`, 'info');
      } else if (failed > 0) {
        showToast(`Sync finished: ${done} pushed, ${failed} failed (kept in the outbox).`, 'error');
      } else {
        showToast(
          `Synced ${done} item${done === 1 ? '' : 's'} to the shared library — now pending review.`,
          'success'
        );
      }
    });
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isSelected = selectedIds.has(node.id);
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const coveragePct =
      node.stats.totalDotPoints > 0
        ? Math.round((node.stats.coveredDotPoints / node.stats.totalDotPoints) * 100)
        : 0;
    const coverageColor =
      coveragePct < 50 ? 'text-red-400' : coveragePct < 80 ? 'text-amber-400' : 'text-emerald-400';

    return (
      <div key={node.id} className="relative">
        {level > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-white/5 light:bg-slate-200"
            style={{ left: `${level * 24 + 23}px` }}
          />
        )}
        <div
          className={`flex items-center py-2.5 px-6 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-all group border-b border-white/5 light:border-slate-200 ${isSelected ? 'bg-indigo-500/5 light:bg-indigo-50' : ''}`}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <button
            onClick={() => toggleSelect(node.id, !isSelected)}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${node.label}`}
            className={`mr-4 transition-all ${isSelected ? 'opacity-100 scale-110' : 'opacity-60 group-hover:opacity-100'}`}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-indigo-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-500" />
            )}
          </button>
          <button
            onClick={() => toggleExpand(node.id)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
            className={`mr-2 p-1 text-slate-500 ${hasChildren ? 'visible' : 'invisible'}`}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
            {node.type === 'course' && <BookOpen className="w-4 h-4 text-sky-400" />}
            {node.type === 'topic' && <Layers className="w-4 h-4 text-purple-400" />}
            {node.type === 'subTopic' && <Folder className="w-4 h-4 text-indigo-400" />}
            {node.type === 'dotPoint' && <Hash className="w-4 h-4 text-slate-600" />}
            {node.type === 'prompt' && <FileText className="w-4 h-4 text-emerald-400" />}
            <span
              className={`text-sm truncate font-medium ${node.type === 'course' || node.type === 'topic' ? 'font-black text-white light:text-slate-900 uppercase tracking-tight' : 'text-slate-300 light:text-slate-700'}`}
            >
              {node.label}
            </span>
            <GapBadges node={node} />
          </div>
          {node.type !== 'prompt' && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-white/5 light:border-slate-200 ${coverageColor} bg-black/20 light:bg-slate-100`}
            >
              <PieChart className="w-3 h-3" /> {coveragePct}%
            </div>
          )}
          <div className="flex items-center gap-6 ml-4 text-[10px] font-bold text-slate-500 font-mono">
            {node.type !== 'prompt' && (
              <div className="w-12 text-right">{node.stats.questions} Q</div>
            )}
            {node.type !== 'prompt' && (
              <div className="w-12 text-right">{node.stats.samples} S</div>
            )}
          </div>
        </div>
        {isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const totalQuestions = treeData.reduce((sum, n) => sum + n.stats.questions, 0);
  const totalSamples = treeData.reduce((sum, n) => sum + n.stats.samples, 0);
  const totalDotPoints = treeData.reduce((sum, n) => sum + n.stats.totalDotPoints, 0);
  const coveredDotPoints = treeData.reduce((sum, n) => sum + n.stats.coveredDotPoints, 0);
  const healthPercentage =
    totalDotPoints > 0 ? Math.round((coveredDotPoints / totalDotPoints) * 100) : 0;
  const healthColor =
    healthPercentage < 50
      ? 'text-red-400'
      : healthPercentage < 80
        ? 'text-amber-400'
        : 'text-emerald-400';

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[rgb(var(--color-bg-base))] light:bg-slate-50 flex flex-col animate-fade-in">
      {/* Studio Header */}
      <div className="flex-shrink-0 border-b border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white z-20 shadow-2xl light:shadow-lg relative">
        <MeshOverlay opacity="opacity-[0.05]" />
        <div className="px-5 md:px-10 py-6 md:py-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 md:gap-10">
          <div className="flex items-start gap-4 md:gap-8 flex-1 min-w-0">
            <div className="w-14 h-14 md:w-20 md:h-20 rounded-[24px] md:rounded-[32px] bg-gradient-to-br from-indigo-500/20 to-purple-600/20 light:from-indigo-100 light:to-purple-100 border border-white/10 light:border-indigo-200 flex items-center justify-center shadow-2xl shadow-indigo-900/20 light:shadow-indigo-200/50 shrink-0">
              <Activity className="w-7 h-7 md:w-10 md:h-10 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] md:tracking-[0.5em] text-indigo-400 whitespace-nowrap">
                  Content Overview
                </span>
                <div className="h-px w-12 bg-indigo-500/20" />
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-white light:text-slate-900 tracking-tighter italic uppercase leading-none">
                Content Audit Studio
              </h2>
              <p className="text-sm text-slate-400 light:text-slate-600 font-medium mt-4 leading-relaxed max-w-lg">
                Analytical overview of curriculum coverage. Detect resource gaps and perform bulk
                synthesis to align content with NESA performance standards.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center w-full lg:w-auto bg-black/40 light:bg-slate-50 rounded-[28px] md:rounded-[40px] border border-white/5 light:border-slate-200 p-2 shadow-inner light:shadow-sm gap-y-2">
            <div className="flex items-center gap-4 md:gap-6 px-4 md:px-10 py-3 md:py-4 sm:border-r border-white/5 light:border-slate-200">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="transform -rotate-90 w-16 h-16" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className="text-white/5 light:text-slate-100"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={176}
                    strokeDashoffset={176 - healthPercentage * 1.76}
                    strokeLinecap="round"
                    className={`${healthColor} transition-all duration-1000`}
                  />
                </svg>
                <span className={`absolute text-xs font-black ${healthColor}`}>
                  {healthPercentage}%
                </span>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 light:text-slate-500">
                  Overall Health
                </span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-black ${healthColor} tracking-tighter`}>
                    {coveredDotPoints}
                  </span>
                  <span className="text-[10px] font-bold text-white/40 light:text-slate-500 uppercase">
                    / {totalDotPoints} Points
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <InstrumentMetric
                label="Content Units"
                value={totalQuestions}
                subValue="Questions"
                colorClass="text-white light:text-slate-900"
              />
              <InstrumentMetric
                label="Proof Data"
                value={totalSamples}
                subValue="Samples"
                colorClass="text-indigo-400"
              />
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-3 md:p-4 rounded-full hover:bg-white/5 light:hover:bg-slate-200 text-slate-500 light:text-slate-400 transition-colors ml-auto lg:ml-4 mr-2"
            >
              <X className="w-6 h-6 md:w-8 md:h-8" />
            </button>
          </div>
        </div>

        {/* Smart Select Action Bar */}
        <div className="px-5 md:px-10 pb-6 md:pb-8 flex flex-wrap gap-3 md:gap-4 items-center">
          <div className="flex items-center gap-4 bg-black/20 light:bg-slate-100 rounded-2xl p-1.5 border border-white/5 light:border-slate-200 mr-2 transition-all group focus-within:border-indigo-500/50 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="relative group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/search:text-indigo-400 transition-colors" />
              <input
                type="text"
                placeholder="Search curriculum..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent pl-11 pr-4 py-1.5 text-sm text-white light:text-slate-900 placeholder-slate-600 light:placeholder-slate-400 focus:outline-none w-64"
              />
            </div>
            {(searchQuery || activeFilter) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter(null);
                }}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white light:hover:text-slate-900 flex items-center gap-2 border-l border-white/5 light:border-slate-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
          </div>

          <div className="flex items-center bg-black/20 light:bg-slate-100 rounded-2xl p-1.5 border border-white/5 light:border-slate-200">
            <button
              onClick={expandAll}
              title="Expand every branch of the tree"
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white light:hover:text-slate-900 flex items-center gap-1.5 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" /> Expand All
            </button>
            <div className="w-px h-4 bg-white/5 light:bg-slate-300" />
            <button
              onClick={collapseAll}
              title="Collapse the whole tree"
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white light:hover:text-slate-900 flex items-center gap-1.5 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" /> Collapse All
            </button>
          </div>

          <div className="h-8 w-px bg-white/5 light:bg-slate-300 mx-2" />

          <button
            onClick={() => handleFilterToggle('emptyDotPoints')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'emptyDotPoints' ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-lg' : 'bg-red-500/5 border-red-500/10 text-red-400 hover:bg-red-500/10'}`}
          >
            <span>Empty Dot Points</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.emptyDotPoints}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('missingRubrics')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'missingRubrics' ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 shadow-lg' : 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10'}`}
          >
            <span>No Marking Guide</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.missingRubrics}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('rubricNotDescending')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'rubricNotDescending' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400 shadow-lg' : 'bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10'}`}
          >
            <span>Non-Std Rubric</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.nonStandardRubrics}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('missingSamples')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'missingSamples' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-lg' : 'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10'}`}
          >
            <span>Missing Samples</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.missingSamples}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('missingOutcomes')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'missingOutcomes' ? 'bg-pink-500/20 border-pink-500/40 text-pink-400 shadow-lg' : 'bg-pink-500/5 border-pink-500/10 text-pink-400 hover:bg-pink-500/10'}`}
          >
            <span>Missing Outcomes</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.missingOutcomes}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('hasSamples')}
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'hasSamples' ? 'bg-teal-500/20 border-teal-500/40 text-teal-400 shadow-lg' : 'bg-teal-500/5 border-teal-500/10 text-teal-400 hover:bg-teal-500/10'}`}
          >
            <span>Has Samples</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.hasSamples}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('lowQuality')}
            title="Questions whose AI quality pre-screen scored below 50 (run Screen Quality to score content)"
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'lowQuality' ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-lg' : 'bg-rose-500/5 border-rose-500/10 text-rose-400 hover:bg-rose-500/10'}`}
          >
            <span>Low Quality</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.lowQuality}
            </span>
          </button>
          <button
            onClick={() => handleFilterToggle('flagged')}
            title="Questions (or their sample answers) that a user flagged as looking off"
            className={`group relative overflow-hidden px-3 md:px-5 h-10 md:h-12 rounded-2xl border text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center gap-2 md:gap-4 ${activeFilter === 'flagged' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-lg' : 'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10'}`}
          >
            <span>Flagged</span>
            <span className="bg-black/40 light:bg-black/10 px-2 py-0.5 rounded-lg text-[10px]">
              {counts.flagged}
            </span>
          </button>

          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <button
              onClick={clearSelection}
              disabled={isProcessing}
              className="px-5 h-12 rounded-2xl bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900 transition-all flex items-center gap-2 disabled:opacity-40"
            >
              <Square className="w-4 h-4" /> Clear Selection ({selectedIds.size})
            </button>
          )}
          {activeFilter && (
            <button
              onClick={() => handleSmartSelect(activeFilter)}
              className="px-6 h-12 rounded-2xl bg-white/10 light:bg-indigo-50 border border-white/20 light:border-indigo-200 text-white light:text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white/20 light:hover:bg-indigo-100 transition-all flex items-center gap-2 shadow-lg"
            >
              <CheckSquare className="w-4 h-4" /> Select All Filtered
            </button>
          )}
        </div>
      </div>

      {/* Tree Container */}
      <div className="flex-1 min-h-0 overflow-auto bg-[rgb(var(--color-bg-base))] custom-scrollbar">
        <div className="min-w-[700px] pb-40">
          {filteredTreeData.length > 0 ? (
            filteredTreeData.map((node) => renderNode(node))
          ) : (
            <div className="py-40 text-center animate-fade-in">
              <div className="w-24 h-24 rounded-[40px] bg-white/5 light:bg-slate-100 flex items-center justify-center border border-white/5 light:border-slate-200 mb-8 mx-auto shadow-inner">
                <Filter className="w-12 h-12 text-slate-700 light:text-slate-300" />
              </div>
              <h3 className="text-2xl font-black text-white light:text-slate-900 tracking-tight italic uppercase">
                No items found
              </h3>
              <p className="text-sm text-slate-500 mt-2 font-bold uppercase tracking-widest">
                Refine your search or filters
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Operations Terminal (Footer) */}
      <div
        className={`border-t border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white px-4 md:px-10 flex flex-col flex-shrink-0 relative shadow-[0_-32px_64px_-16px_rgba(0,0,0,0.5)] light:shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.1)] transition-all duration-500 ${isProcessing ? 'h-80' : 'min-h-[6rem] py-3'}`}
      >
        <MeshOverlay opacity="opacity-[0.05]" />
        {isProcessing && progress && (
          <div className="flex-1 overflow-hidden flex flex-col py-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 light:text-slate-500 italic">
                  Processing Log
                </span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/40 light:bg-slate-100 border border-white/10 light:border-slate-200 text-[9px] font-black uppercase tracking-widest text-indigo-400">
                  <Cpu className="w-3 h-3" />
                  {batchEngine === 'default'
                    ? 'App Default'
                    : (AI_MODELS.find((m) => m.id === batchEngine)?.label ?? batchEngine)}
                </span>
              </div>
              <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest">
                <span className="text-emerald-400">Completed: {progress.completed}</span>
                <span className="text-red-400">Failed: {progress.failed}</span>
                <span className="text-slate-500">Total: {progress.total}</span>
              </div>
            </div>
            <div className="flex-1 bg-black/40 light:bg-slate-50 rounded-3xl border border-white/5 light:border-slate-200 p-6 overflow-y-auto font-mono text-xs space-y-2 custom-scrollbar shadow-inner">
              {progress.fatalError && (
                <div className="flex items-start gap-3 p-3 mb-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 light:text-red-600 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-xs">{progress.fatalError.userMessage}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {progress.fatalError.suggestion}
                    </p>
                  </div>
                </div>
              )}
              {progress.logs.map((log, i) => {
                let colour = 'text-indigo-300/60 light:text-indigo-600/70';
                if (log.includes('✓')) colour = 'text-emerald-400 light:text-emerald-600';
                else if (log.includes('⛔')) colour = 'text-red-400 light:text-red-600';
                else if (log.includes('⚠')) colour = 'text-amber-400 light:text-amber-600';
                else if (log.includes('✗')) colour = 'text-red-300 light:text-red-500';
                return (
                  <div key={i} className={`animate-fade-in truncate ${colour}`}>{`> ${log}`}</div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        <div
          className={`flex items-center justify-between transition-all duration-500 ${isProcessing ? 'h-20 border-t border-white/5 light:border-slate-200' : 'h-full'}`}
        >
          {isProcessing && progress ? (
            <div className="w-full flex items-center gap-8 animate-fade-in">
              <div className="flex-1 h-3 bg-black/40 light:bg-slate-100 rounded-full overflow-hidden border border-white/5 light:border-slate-200 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 relative rounded-full"
                  style={{
                    width: `${((progress.completed + progress.failed) / progress.total) * 100}%`,
                  }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                </div>
              </div>
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-10 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStopping ? 'Stopping…' : 'Stop Process'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between w-full gap-4 md:gap-6">
              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                <div className="p-3 rounded-xl bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-200 text-white light:text-slate-900 font-black text-2xl tracking-tighter italic">
                  {selectedIds.size.toString().padStart(2, '0')}
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 light:text-slate-500">
                  Selected
                </span>

                <div className="flex flex-col gap-1 ml-4">
                  <label
                    htmlFor="audit-engine"
                    className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 light:text-slate-500 flex items-center gap-1.5"
                  >
                    <Cpu className="w-3 h-3" /> Batch Engine
                  </label>
                  <select
                    id="audit-engine"
                    value={batchEngine}
                    onChange={(e) => setBatchEngine(e.target.value)}
                    title={
                      batchEngine === 'default'
                        ? 'Uses the app-wide engine selection per call type'
                        : AI_MODELS.find((m) => m.id === batchEngine)?.description
                    }
                    className="bg-black/40 light:bg-slate-50 border border-white/10 light:border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-white light:text-slate-900 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    <option value="default">App Default</option>
                    {AI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isCurriculumRemote() && pendingSyncCount > 0 && (
                  <button
                    onClick={handleSyncToLibrary}
                    title="Push the questions repaired by this studio to the shared library as pending contributions — they go through the review queue before publishing"
                    className="ml-2 px-5 h-12 rounded-[20px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-black text-xs uppercase tracking-[0.15em] transition-all flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Sync to Library ({pendingSyncCount})
                  </button>
                )}
              </div>

              <div className="flex gap-3 flex-wrap justify-end">
                <button
                  onClick={handleBulkAction.bind(null, 'generateQuestions')}
                  disabled={selectionTargets.questions === 0}
                  title="Generate a question for each selected empty dot point"
                  className="px-5 h-12 rounded-[20px] bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                >
                  Questions ({selectionTargets.questions})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'generateRubrics')}
                  disabled={selectionTargets.rubrics === 0}
                  title="Generate a rubric for each selected question with a missing or non-standard marking guide"
                  className="px-5 h-12 rounded-[20px] bg-sky-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                >
                  Rubrics ({selectionTargets.rubrics})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'reviseRubrics')}
                  disabled={selectionTargets.rubricRevisions === 0}
                  title="Revise non-standard rubrics into correct descending format while preserving existing criteria"
                  className="px-5 h-12 rounded-[20px] bg-amber-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                >
                  Revise Rubrics ({selectionTargets.rubricRevisions})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'linkOutcomes')}
                  disabled={selectionTargets.outcomes === 0}
                  title="Suggest syllabus outcomes for each selected question with none linked"
                  className="px-5 h-12 rounded-[20px] bg-pink-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  Outcomes ({selectionTargets.outcomes})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'generateSamples')}
                  disabled={selectionTargets.samples === 0}
                  title="Draft a full-mark sample answer for each selected question with none"
                  className="px-5 h-12 rounded-[20px] bg-purple-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                >
                  Samples ({selectionTargets.samples})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'recalibrateSamples')}
                  disabled={selectionTargets.recalibrations === 0}
                  title="Re-mark every existing sample answer under the strict verb/band rules"
                  className="px-5 h-12 rounded-[20px] bg-teal-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                >
                  <Scale className="w-4 h-4" />
                  Recalibrate ({selectionTargets.recalibrations})
                </button>
                <button
                  onClick={handleBulkAction.bind(null, 'screenQuality')}
                  disabled={selectionTargets.screenings === 0}
                  title="AI-score every selected question (0–100) so weak content is flagged, filterable, and triaged in the review queue"
                  className="px-5 h-12 rounded-[20px] bg-rose-600 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                >
                  <Gauge className="w-4 h-4" />
                  Screen Quality ({selectionTargets.screenings})
                </button>
                <div className="w-px h-8 bg-white/10 light:bg-slate-300 self-center" />
                <button
                  onClick={handleBulkAction.bind(null, 'fixAllGaps')}
                  disabled={selectionTargets.allGaps === 0}
                  title="One run that fills every gap in the selection: missing questions, rubrics, outcomes and samples"
                  className="px-6 h-12 rounded-[20px] bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-xs uppercase tracking-[0.15em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  Fix All Gaps ({selectionTargets.allGaps})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ContentAuditModal;
