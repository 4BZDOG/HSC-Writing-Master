import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ShowToast, ToastType } from '../../hooks/useToast';
import { createPortal } from 'react-dom';
import type { Updater } from 'use-immer';
import {
  Course,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  StatePath,
  CommandTermInfo,
  CourseOutcome,
  SampleAnswer,
} from '../../types';
import { outcomesForYear, yearOfTopic } from '../../utils/syllabusYear';
import {
  buildTopicExportPayload,
  filterDataBySelection,
  mergeOrAddTopic,
  reconcileImportedTopicIds,
} from '../../utils/dataManagerUtils';
import { clearQuestionsInScopeDraft } from '../../utils/stateUtils';
import MeshOverlay from '../MeshOverlay';
import {
  TreeNode,
  VisibilityFilter,
  BulkActionType,
  AUDIT_FILTERS,
  buildAuditTree,
  countFilterMatches,
  matchesFilter,
  isEmptyDotPoint,
  needsSamples,
  needsRubric,
  hasNonStandardRubric,
  needsOutcomes,
  hasSamplesToRecalibrate,
  hasOffSyllabusTerms,
  offSyllabusTermCount,
  syllabusTermGaps,
} from './contentAudit/auditModel';
import { InstrumentMetric, AuditActionButton, FilterRow } from './contentAudit/AuditPieces';
import AuditTreeRow, { INDENT_STEP } from './contentAudit/AuditTreeRow';
import TopicImportModal from '../TopicImportModal';
import ConfirmationModal from '../ConfirmationModal';
import { BatchTask, BatchFatalError } from '../../utils/batchProcessor';
import { useBatchRun } from '../../hooks/useBatchRun';
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
import { dropNonSyllabusTerms } from '../../services/geminiService';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import {
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
  X,
  Filter,
  Terminal,
  Link2,
  Search,
  RefreshCw,
  RotateCcw,
  Scale,
  Cpu,
  Wrench,
  UploadCloud,
  Gauge,
  AlertTriangle,
  Download,
  Eraser,
  ListPlus,
  Trash2,
} from 'lucide-react';

// --- Types ---

/**
 * A question the studio repaired locally and has not yet pushed to the shared
 * library. `label` is carried so the sync log can name it even if the question
 * has since been reworded.
 */
interface TouchedPrompt {
  promptAppId: string;
  dotPointAppId: string;
  label: string;
}

/**
 * What each batch action is called when something other than its own button
 * has to name it — the retry control, and the toast that follows a retry. The
 * button labels themselves stay at their call sites, where the target count
 * belongs.
 */
/**
 * How much longer a run has, from how long it has taken so far.
 *
 * A batch is paced at 1.5s between calls and runs one at a time, so two
 * hundred questions is upwards of ten minutes — long enough that the honest
 * question is "can I go and do something else", and a bar creeping along
 * answers it only by being watched. Two tasks in is enough for the average to
 * mean something; before that the figure would swing between wild numbers on
 * every update, which is worse than saying nothing.
 */
export const estimateRemaining = (
  elapsedMs: number,
  done: number,
  total: number
): string | null => {
  const left = total - done;
  if (done < 2 || left <= 0 || elapsedMs <= 0) return null;
  const seconds = Math.round((elapsedMs / done / 1000) * left);
  if (seconds < 90) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s left`;
  return `~${Math.round(seconds / 60)} min left`;
};

const ACTION_LABELS: Record<BulkActionType, string> = {
  generateQuestions: 'Write Questions',
  generateRubrics: 'Write Marking Guides',
  reviseRubrics: 'Reformat Guides',
  linkOutcomes: 'Link Outcomes',
  generateSamples: 'Draft Samples',
  recalibrateSamples: 'Re-mark Samples',
  screenQuality: 'Score Quality',
  fixAllGaps: 'Fix All Gaps',
};

const OUTBOX_STORAGE_KEY = 'hsc.contentAudit.syncOutbox.v1';

/**
 * The one toast slot every per-step notice from a batch run shares, so a run
 * reports its progress in place rather than as a queue of hundreds. See the
 * effect that raises them, and `ShowToast`'s own note.
 */
const AUDIT_STEP_TOAST_SLOT = 'audit-batch-step';

/**
 * Read/write helpers for the repair outbox. Both swallow storage failures: a
 * browser with storage disabled must still be able to run the studio, it just
 * loses the across-reload half of the guarantee. Anything unreadable is
 * discarded rather than crashing the modal on open.
 */
const readOutbox = (): TouchedPrompt[] => {
  try {
    const raw = window.localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is TouchedPrompt =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as TouchedPrompt).promptAppId === 'string' &&
        typeof (e as TouchedPrompt).dotPointAppId === 'string'
    );
  } catch {
    return [];
  }
};

const writeOutbox = (entries: TouchedPrompt[]): void => {
  try {
    if (entries.length === 0) window.localStorage.removeItem(OUTBOX_STORAGE_KEY);
    else window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — the in-memory outbox still works for this session */
  }
};

interface ContentAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  updateCourses: Updater<Course[]>;
  showToast: ShowToast;
  /**
   * Bring the studio back to the front. Offered on the toast that follows
   * closing it mid-run, and on the one that reports the run finished, because
   * both are the moment someone wants to look at it again — and while a run is
   * in flight the studio is also the only place to stop it.
   */
  onReopen?: () => void;
  /**
   * Told whenever a run starts or ends, so the surface that mounts this studio
   * can keep it mounted while one is in flight. Closing the studio unmounts it
   * otherwise, and `useBatchRun` aborts the run it owns on unmount — so
   * without this, "close during a run" would silently mean "cancel the run".
   */
  onRunStateChange?: (running: boolean) => void;
}

const ContentAuditModal: React.FC<ContentAuditModalProps> = ({
  isOpen,
  onClose,
  courses,
  updateCourses,
  showToast,
  onReopen,
  onRunStateChange,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Course id an "Import JSON…" click will import a topic into — set only
  // while that nested TopicImportModal is open.
  const [importCourseId, setImportCourseId] = useState<string | null>(null);
  // Set while the "Clear Questions" confirmation is open, so the destructive
  // action never fires without the shared ConfirmationModal in between.
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  /**
   * The run lifecycle lives in `useBatchRun`, shared with the
   * starter-questions step. The two surfaces had each written their own, and
   * the other one's version could never report a stopped run as ended — see
   * the hook's own note.
   */
  const { progress, isRunning: isProcessing, isStopping, run: runBatch, stop } = useBatchRun();
  // 'default' = the app's per-role engine selection; otherwise an AI_MODELS
  // id that every call in the batch is routed to.
  const [batchEngine, setBatchEngine] = useState<string>('default');

  // Prompts changed by batch runs but not yet pushed to the shared Supabase
  // library. Repairs land in local IndexedDB first (updateCourses); in remote
  // mode the admin then syncs them through contributionService as `pending`
  // contributions, keeping the moderation loop as the single publish path.
  // Keyed by prompt app-id so repeated repairs to one prompt dedupe.
  const touchedRef = useRef<Map<string, TouchedPrompt>>(new Map());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  /**
   * The outbox survives a reload.
   *
   * It used to live only in this ref, so an admin who repaired fifty questions
   * and then refreshed — or closed the tab, or lost the container — lost the
   * queue with no warning and no way to tell which repairs had never reached
   * the library. The repairs themselves were safe in IndexedDB; only the record
   * of what still needed pushing was gone, which is the part that cannot be
   * reconstructed by looking at the data.
   */
  const persistOutbox = () => {
    setPendingSyncCount(touchedRef.current.size);
    writeOutbox(Array.from(touchedRef.current.values()));
  };

  const recordTouch = (promptAppId: string, dotPointAppId: string, label: string) => {
    touchedRef.current.set(promptAppId, { promptAppId, dotPointAppId, label });
    persistOutbox();
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<VisibilityFilter>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  // When the run in flight started, for the estimate in the progress row.
  // A ref rather than state: nothing should re-render because the clock moved,
  // only because a task finished.
  const runStartedAtRef = useRef<number | null>(null);

  /**
   * The live library, for tasks that run long after they were built.
   *
   * A batch task captured `courses` and its own `node.dataRef` at assembly
   * time, then ran minutes later against whatever the AI returned in between —
   * so under "Fix All Gaps" the sample-answer task drafted from a copy of the
   * question that predated the marking guide the same run had just written for
   * it. Tasks resolve their question through this ref at action time instead,
   * which also lets them stop cleanly when the question was deleted mid-run.
   */
  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  /**
   * The studio can be left while a run is in flight, and the run carries on.
   *
   * It could not before, and the reason was sound as far as it went: closing
   * walked away from a batch that kept spending AI quota and writing to the
   * library with its progress log and its Stop control gone from the screen.
   * The answer to that is not to hold someone on a screen for ten minutes —
   * it is to keep telling them what is happening and to leave a way back, so
   * closing now raises a notice per completed step and every one of those
   * notices, plus this one, carries a control that reopens the studio.
   *
   * `onRunStateChange` is the other half: the surface that mounts this studio
   * unmounts it on close, and `useBatchRun` aborts on unmount, so without
   * being told a run is in flight "close" would quietly mean "cancel".
   */
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const reopenAction = onReopen ? { label: 'Open studio', onClick: onReopen } : undefined;
  // Read from a ref where it is needed after an await: a batch summary lands
  // minutes after the handler that started it was created.
  const reopenActionRef = useRef(reopenAction);
  reopenActionRef.current = reopenAction;

  const handleCloseStudio = React.useCallback(() => {
    if (isProcessing && progress) {
      const done = progress.completed + progress.failed;
      /**
       * Plain, for the same reason the step notices are.
       *
       * This was the first thing raised after leaving, and carrying the reopen
       * control gave it fourteen seconds and a place at the front of the
       * queue — so it sat on screen while the whole run went past behind it
       * and not one step notice was ever shown. The offer belongs on the
       * notice that ENDS the run, where there is no stream to starve; getting
       * back before then is what the Admin tools menu is for, and it reopens
       * this same studio with the run still in it.
       */
      showToast(
        `Batch still running — ${done} of ${progress.total} done. It carries on in the background, and each step reports here.`,
        'info'
      );
    }
    onClose();
  }, [isProcessing, progress, showToast, onClose]);

  useEscapeKey(isOpen, handleCloseStudio);
  useScrollLock(isOpen);

  useEffect(() => {
    onRunStateChange?.(isProcessing);
  }, [isProcessing, onRunStateChange]);

  // A studio torn down for good (the admin signs out mid-run) must not leave
  // the mount condition stuck on "running".
  useEffect(() => () => onRunStateChange?.(false), [onRunStateChange]);

  /**
   * Filtering the tree walks every node and lowercases every label; at ~1,500
   * nodes that is enough to make each keystroke in the search box feel like it
   * lands late. Deferring the query lets React paint the typed character first
   * and re-filter behind it.
   */
  const deferredSearchQuery = React.useDeferredValue(searchQuery);

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

  /**
   * The chip counts, derived from the one filter registry rather than from a
   * second hand-written copy of every predicate. The old block listed eleven
   * `if`s that had to be kept in step with `filterNode` and `handleSmartSelect`
   * by hand, and were not.
   */
  const counts = useMemo(() => countFilterMatches(flatMap.values()), [flatMap]);

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
    let termLists = 0;
    let termGaps = 0;

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
      if (hasOffSyllabusTerms(node)) termLists++;
      if (syllabusTermGaps(node).length > 0) termGaps++;
    });

    return {
      questions,
      rubrics,
      rubricRevisions,
      samples,
      outcomes,
      recalibrations,
      screenings,
      termLists,
      termGaps,
      allGaps: questions + rubrics + samples + outcomes,
    };
  }, [selectedIds, flatMap]);

  /**
   * What is selected, in the words a teacher would use.
   *
   * The footer showed the size of the selection as one large figure, and 47
   * could be one course, or eleven dot points, or forty-seven questions —
   * three selections whose batches cost wildly different amounts of AI quota
   * and time. The number stays; this says what it is made of, coarsest level
   * first, and names only the levels actually in the selection.
   */
  const selectionSummary = useMemo(() => {
    if (selectedIds.size === 0) return 'Nothing yet — tick a faculty, course or topic';
    const tally: Record<string, number> = {};
    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (node) tally[node.type] = (tally[node.type] ?? 0) + 1;
    });
    const say = (type: string, one: string, many: string) => {
      const n = tally[type] ?? 0;
      return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
    };
    // Sub-topics are deliberately absent: they are always carried along by the
    // topic that cascaded into them, so naming them adds a number nobody
    // chose. The two coarsest levels present say what the scope is, and the
    // question count says how much AI work it is — which is the pair that
    // actually decides whether a run is a minute or an hour. Anything more and
    // this is a list of five figures joined by dots, which §5 of DesignSpec
    // says to write as words rather than as a longer meta line.
    const scope = [
      say('faculty', 'faculty', 'faculties'),
      say('course', 'course', 'courses'),
      say('topic', 'topic', 'topics'),
      say('dotPoint', 'dot point', 'dot points'),
    ].filter(Boolean) as string[];
    const questions = say('prompt', 'question', 'questions');
    return [...scope.slice(0, 2), ...(questions ? [questions] : [])].join(' · ');
  }, [selectedIds, flatMap]);

  /**
   * The single course/topic a click on "Export JSON" would export, or `null`
   * when the selection doesn't resolve to exactly one. `toggleSelect`
   * cascades a course/topic pick down to every descendant, so this looks for
   * the ROOT of the selection (a selected node whose parent isn't also
   * selected) rather than counting every id — selecting one topic (which
   * also selects its sub-topics/dot points/prompts) must still count as one
   * exportable target, not many.
   */
  const exportTarget = useMemo(() => {
    const roots: TreeNode[] = [];
    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node) return;
      if (node.parentId && selectedIds.has(node.parentId)) return;
      roots.push(node);
    });
    if (roots.length !== 1) return null;
    const [root] = roots;
    return root.type === 'course' || root.type === 'topic' ? root : null;
  }, [selectedIds, flatMap]);

  const handleExportJson = () => {
    if (!exportTarget) return;

    const dataToExport =
      exportTarget.type === 'topic'
        ? buildTopicExportPayload(courses, exportTarget.path.courseId!, exportTarget.id)
        : filterDataBySelection(courses, new Set([exportTarget.id]));

    if (dataToExport.length === 0) {
      showToast('Nothing to export. Widen the filters, or select some items first.', 'info');
      return;
    }

    // Filename convention matches the Data Manager's Export flow
    // (components/dataManager/ExportFlow.tsx) so exports look consistent
    // wherever a teacher makes them.
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

    const exportedCourse = dataToExport[0];
    const courseName = sanitize(exportedCourse.name);
    const filename =
      exportedCourse.topics.length === 1
        ? `${courseName}${sanitize(exportedCourse.topics[0].name)}${dateStr}`
        : `${courseName}${dateStr}`;

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported "${exportTarget.label}" as JSON.`, 'success');
  };

  /**
   * The course an "Import JSON…" click would import a topic into — the same
   * single-root selection `exportTarget` resolves, just reported as a course
   * id rather than a tree node: a selected topic imports into its own
   * course, a selected course imports directly into itself.
   */
  const importTargetCourseId = useMemo(() => {
    if (!exportTarget) return null;
    return exportTarget.type === 'course' ? exportTarget.id : (exportTarget.path.courseId ?? null);
  }, [exportTarget]);

  const importTargetCourse = useMemo(
    () => courses.find((c) => c.id === importCourseId) ?? null,
    [courses, importCourseId]
  );

  /**
   * Every selected root "Clear Questions" would act on — the same root-finding
   * rule as `exportTarget` (a selected node whose parent isn't also selected,
   * so a topic and one of its own dot points selected together only count as
   * one scope), but allowing multiple roots at once rather than requiring
   * exactly one. `clearQuestionsInScope` has no scope of its own for a lone
   * `prompt` node (there's no "clear just this question" — that's already
   * covered by the existing per-item delete), so prompt roots are dropped
   * rather than silently doing nothing when clicked.
   */
  const clearTargets = useMemo(() => {
    const roots: TreeNode[] = [];
    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node) return;
      if (node.parentId && selectedIds.has(node.parentId)) return;
      roots.push(node);
    });
    // A faculty is a grouping, not a scope `clearQuestionsInScopeDraft` can
    // take — it has no `courseId` of its own — so it resolves to the courses
    // under it, which is what "clear this faculty" means anyway.
    return roots
      .flatMap((n) => (n.type === 'faculty' ? (n.children ?? []) : [n]))
      .filter((n) => n.type !== 'prompt');
  }, [selectedIds, flatMap]);

  // Live count of questions the current selection would delete — computed
  // from the same per-node `stats.questions` totals the tree rows already
  // show, so it always matches what's on screen before anything is cleared.
  const clearQuestionsCount = useMemo(
    () => clearTargets.reduce((sum, n) => sum + n.stats.questions, 0),
    [clearTargets]
  );

  const clearQuestionsMessage = useMemo(() => {
    if (clearTargets.length === 0) return '';
    const qWord = clearQuestionsCount === 1 ? 'question' : 'questions';
    if (clearTargets.length === 1) {
      return `Delete all ${clearQuestionsCount} ${qWord} under "${clearTargets[0].label}"? Sub-topics, dot points and the topic itself are kept — you can reimport questions into this exact structure afterward.`;
    }
    const names = clearTargets.map((n) => `"${n.label}"`).join(', ');
    return `Delete all ${clearQuestionsCount} ${qWord} across the ${clearTargets.length} selected scopes (${names})? Sub-topics, dot points and the scopes themselves are kept — you can reimport questions into this exact structure afterward.`;
  }, [clearTargets, clearQuestionsCount]);

  const handleConfirmClearQuestions = () => {
    if (clearTargets.length === 0) return;
    const total = clearQuestionsCount;

    updateCourses((draft: Course[]) => {
      clearTargets.forEach((node) => {
        clearQuestionsInScopeDraft(draft, {
          courseId: node.path.courseId!,
          type: node.type as 'course' | 'topic' | 'subTopic' | 'dotPoint',
          id: node.id,
        });
      });
    });

    showToast(
      `${total} question${total === 1 ? '' : 's'} deleted. Structure kept — you can reimport into ${clearTargets.length === 1 ? 'this topic' : 'these scopes'}.`,
      'success'
    );
    setIsClearConfirmOpen(false);
  };

  /**
   * Applies an imported topic the same way `handleImportTopic`
   * (`hooks/useSyllabusData.ts`) does from the main navigator:
   * `reconcileImportedTopicIds` reconciles the imported topic's ids against
   * the target course's CURRENT topics — matched nodes take on the existing
   * node's id (so the merge below finds them directly, by id, no text
   * fallback needed even when an external edit changed the matching text
   * field), unmatched nodes get a fresh, collision-safe id exactly like the
   * old `regenerateTopicIds` gave everything. Then `mergeOrAddTopic`
   * (`utils/dataManagerUtils.ts`) merges it into an existing topic (matched
   * by id-or-name) or pushes it as new — the same shared helper
   * `handleImportTopic` calls, kept here as a direct `updateCourses` call
   * because the Studio only has that, not `syllabusHandlers`.
   *
   * `importTargetCourse` (derived from the `courses` prop) is read before
   * `updateCourses` runs, rather than looked up inside the updater, because
   * the reconciliation needs the target course's existing topics as input,
   * not just as something to mutate — it comes from the same `courses` /
   * `updateCourses` pair, so it reflects the same pre-update state the
   * updater's own `draft.find` would see.
   */
  const handleImportTopicConfirm = (topic: Topic) => {
    if (!importCourseId || !importTargetCourse) return;
    const topicWithNewIds = reconcileImportedTopicIds(topic, importTargetCourse.topics);
    let resultTopicName = topicWithNewIds.name;

    updateCourses((draft: Course[]) => {
      const course = draft.find((c: Course) => c.id === importCourseId);
      if (!course) return;
      resultTopicName = mergeOrAddTopic(course.topics, topicWithNewIds).name;
    });

    showToast(`Topic "${resultTopicName}" imported.`, 'success');
    setImportCourseId(null);
  };

  const filteredTreeData = useMemo(() => {
    if (!deferredSearchQuery && !activeFilter) return treeData;

    // Lowercased once rather than once per node — the old form called
    // `searchQuery.toLowerCase()` inside the comparison for all ~1,500 of them.
    const needle = deferredSearchQuery.toLowerCase();

    const filterNode = (node: TreeNode): TreeNode | null => {
      const matchesSearch = !needle || node.label.toLowerCase().includes(needle);
      const matchesGap = matchesFilter(node, activeFilter);

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
        if (deferredSearchQuery && !activeFilter) return node;
      }

      return null;
    };

    return treeData.map((node) => filterNode(node)).filter(Boolean) as TreeNode[];
  }, [treeData, deferredSearchQuery, activeFilter]);

  /**
   * A search or a filter narrows the tree to a handful of rows, and those rows
   * are only useful expanded — so while either is on, everything shown is open.
   *
   * This used to be done by writing every id in the library into `expandedIds`
   * when a chip was clicked, which had two costs: it built a 1,500-entry Set on
   * each toggle, and it permanently destroyed whatever the admin had collapsed,
   * because clearing the filter did not put it back. Deriving it leaves
   * `expandedIds` as the record of the admin's own choices.
   */
  const isNarrowed = !!deferredSearchQuery || !!activeFilter;

  const activeFilterLabel = activeFilter
    ? (AUDIT_FILTERS.find((f) => f.id === activeFilter)?.label ?? null)
    : null;

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
      // Faculties and the courses inside them, so the studio opens on the same
      // "every course, topics folded" view it did before faculties existed —
      // an opening screen of eight collapsed faculty bands would show a head
      // teacher nothing about their library.
      setExpandedIds(
        new Set(treeData.flatMap((f) => [f.id, ...(f.children ?? []).map((c) => c.id)]))
      );
      hasAutoExpandedRef.current = true;
    }
    // Closing mid-run is now allowed, and reopening should put the admin back
    // where they were rather than re-folding the tree under a batch they are
    // watching.
    if (!isOpen && !isProcessing) {
      hasAutoExpandedRef.current = false;
    }
  }, [isOpen, treeData]);

  useEffect(() => {
    // Optional call: scrollIntoView is missing in some environments (jsdom).
    logsEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [progress?.logs]);

  useEffect(() => {
    runStartedAtRef.current = isProcessing ? Date.now() : null;
  }, [isProcessing]);

  /**
   * One notice per completed step, for a run being watched from somewhere else.
   *
   * The batch runner already writes a line for every task; while the studio is
   * on screen that line lands in the processing log, which is the right place
   * for it — a toast per step there would sit on the studio's own Stop button
   * for the length of the run (DesignSpec §5: a transient notice never sits on
   * a control). Off screen there is no log, so the same line becomes the
   * notice, with the count so far and a way back into the studio.
   *
   * Keyed on the number of tasks ACCOUNTED FOR rather than on the log, because
   * the runner republishes progress several times per task — when one starts,
   * when the guard trips, when the queue drains — and only one of those is a
   * step finishing.
   */
  const announcedStepsRef = useRef(0);
  useEffect(() => {
    if (!progress) {
      announcedStepsRef.current = 0;
      return;
    }
    const done = progress.completed + progress.failed;
    if (done <= announcedStepsRef.current) return;
    announcedStepsRef.current = done;
    if (isOpen) return;

    // The freshest log line, without the timestamp the terminal wants and
    // without the glyph the toast's own colour already carries.
    const raw = (progress.logs[0] ?? '').replace(/^\[[^\]]*\]\s*/, '');
    const type: ToastType = /⛔|✗/.test(raw) ? 'error' : /⚠/.test(raw) ? 'warning' : 'success';
    const line = raw.replace(/^[✓⛔⚠✗]\s*/, '').trim();

    /**
     * Plain, and holding one slot rather than queueing.
     *
     * Two properties of `useToast` decide this. An actionable toast gets
     * fourteen seconds instead of five and is protected from being dropped
     * when the queue is full — right for an offer, wrong for a notice arriving
     * every second or two, and the first version put the reopen control here
     * and watched one step notice hold the screen while the rest of the run
     * went past behind it. And the queue holds four: a stream this fast fills
     * it, starves everything else the app has to say for the length of the
     * run, and still shows the reader only every third step or so.
     *
     * `AUDIT_STEP_TOAST_SLOT` makes each step update the same notice instead,
     * under a countdown that keeps running — so the reader sees the latest
     * step, the notice goes away when the run does, and nothing else is
     * crowded out. The way back rides on the notice that ENDS the run.
     */
    showToast(
      `${line || 'Step complete'} (${done} of ${progress.total})`,
      type,
      undefined,
      AUDIT_STEP_TOAST_SLOT
    );
  }, [progress, isOpen, showToast]);

  /**
   * Restore the repair outbox when the studio opens, dropping anything whose
   * question is no longer in the library — a stale entry could otherwise sit in
   * the queue forever, failing every sync with "Prompt no longer exists
   * locally" and never clearing, because only a SUCCESSFUL push removes one.
   */
  useEffect(() => {
    if (!isOpen || touchedRef.current.size > 0) return;
    const restored = readOutbox().filter((entry) => flatMap.has(entry.promptAppId));
    if (restored.length === 0) {
      if (readOutbox().length > 0) writeOutbox([]);
      return;
    }
    touchedRef.current = new Map(restored.map((entry) => [entry.promptAppId, entry]));
    setPendingSyncCount(touchedRef.current.size);
    writeOutbox(restored);
  }, [isOpen, flatMap]);

  /**
   * Forget selected ids whose nodes are gone.
   *
   * Every consumer of the selection already skips a missing node, so nothing
   * misfired — but `selectedIds.size` is on screen as the big figure in the
   * footer, and after "Clear Questions" removed 40 questions it still counted
   * them. The set only ever shrinks here, so a live node's selection is never
   * disturbed.
   */
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const live = new Set([...current].filter((id) => flatMap.has(id)));
      return live.size === current.size ? current : live;
    });
  }, [flatMap]);

  /**
   * The rows on screen, top to bottom, so a shift-click knows what lies
   * between two ticks. Read through a ref by `toggleSelect`, which must keep
   * one identity for the life of the studio — it is passed to 1,500 memoised
   * rows, and a callback rebuilt whenever a branch opens would re-render every
   * one of them.
   */
  const visibleOrder = useMemo(() => {
    const order: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        order.push(n.id);
        const open = isNarrowed || expandedIds.has(n.id);
        if (open && n.children) walk(n.children);
      });
    };
    walk(filteredTreeData);
    return order;
  }, [filteredTreeData, expandedIds, isNarrowed]);

  const visibleOrderRef = useRef(visibleOrder);
  visibleOrderRef.current = visibleOrder;

  // Where the last plain tick landed. A shift-click reaches back to it.
  const selectionAnchorRef = useRef<string | null>(null);

  const toggleSelect = React.useCallback(
    (id: string, checked: boolean, extend = false) => {
      if (isProcessing) return;
      const node = flatMap.get(id);
      if (!node) return;

      const cascade = (into: Set<string>, n: TreeNode, isChecked: boolean) => {
        if (isChecked) into.add(n.id);
        else into.delete(n.id);
        if (n.children) n.children.forEach((c) => cascade(into, c, isChecked));
      };

      /**
       * Shift-clicking a second row takes everything on screen between it and
       * the last row ticked. Selecting a topic's worth of questions used to be
       * one click per row, and the studio's whole job is running one action
       * over a lot of content at once.
       *
       * It only ever ADDS. File managers move the anchor's meaning around on a
       * shift-click, and getting that subtly wrong here deselects work an admin
       * has spent minutes assembling; extending a selection is the useful half
       * and it cannot lose anything. The anchor stays put, so a second
       * shift-click reaches from the same place.
       */
      const anchor = selectionAnchorRef.current;
      if (extend && anchor && anchor !== id) {
        const order = visibleOrderRef.current;
        const from = order.indexOf(anchor);
        const to = order.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          setSelectedIds((current) => {
            const newSelected = new Set(current);
            order.slice(lo, hi + 1).forEach((rowId) => {
              const rowNode = flatMap.get(rowId);
              if (rowNode) cascade(newSelected, rowNode, true);
            });
            return newSelected;
          });
          return;
        }
      }

      selectionAnchorRef.current = id;
      setSelectedIds((current) => {
        const newSelected = new Set(current);
        cascade(newSelected, node, checked);
        return newSelected;
      });
    },
    [flatMap, isProcessing]
  );

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedIds((current) => {
      const newExpanded = new Set(current);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const expandAll = () => {
    const all = new Set<string>();
    flatMap.forEach((_, id) => all.add(id));
    setExpandedIds(all);
  };

  const collapseAll = () => setExpandedIds(new Set());

  const clearSelection = () => setSelectedIds(new Set());

  // Rows under a filter are expanded by derivation (`isNarrowed`), so toggling
  // one is now only a change of filter — no Set rebuild, and the admin's own
  // collapsed branches are still collapsed when the filter comes off.
  const handleFilterToggle = (criteria: VisibilityFilter) => {
    setActiveFilter((current) => (current === criteria ? null : criteria));
  };

  /** Back to the whole library: no search, no filter. */
  const resetNarrowing = () => {
    setSearchQuery('');
    setActiveFilter(null);
  };

  /**
   * What "Select All Filtered" would actually select: the rows the narrowing
   * is ABOUT, not every row on screen.
   *
   * A filtered tree also shows the courses and topics above each match, as the
   * path to it. Selecting those too would be the difference between "clear the
   * three questions I searched for" and "clear the topic they are in", so a
   * node counts only when it matches in its own right — the filter's predicate,
   * or the search term in its own label.
   */
  const isOwnMatch = React.useCallback(
    (node: TreeNode) => {
      if (!filteredIds.has(node.id)) return false;
      if (activeFilter) {
        const definition = AUDIT_FILTERS.find((f) => f.id === activeFilter);
        if (!definition || !definition.matches(node)) return false;
      }
      if (deferredSearchQuery)
        return node.label.toLowerCase().includes(deferredSearchQuery.toLowerCase());
      return !!activeFilter;
    },
    [filteredIds, activeFilter, deferredSearchQuery]
  );

  const filteredMatchCount = useMemo(() => {
    if (!isNarrowed) return 0;
    let n = 0;
    flatMap.forEach((node) => {
      if (isOwnMatch(node)) n++;
    });
    return n;
  }, [flatMap, isNarrowed, isOwnMatch]);

  /**
   * Select everything the narrowing is showing.
   *
   * The predicate now comes from the filter registry. The hand-written copy
   * that used to live here had fallen three filters behind the rail —
   * `verbNotInQuestion`, `flagged` and `exemplarMismatch` matched nothing, so
   * the button selected zero items and then reported "Selected 0 items for
   * optimisation" as though that were a result. It also only ever worked for a
   * filter: after a search you were left ticking each row by hand.
   */
  const handleSelectAllShown = () => {
    if (!isNarrowed) return;
    const definition = activeFilter ? AUDIT_FILTERS.find((f) => f.id === activeFilter) : null;
    const scope = definition ? `under "${definition.label}"` : `matching "${deferredSearchQuery}"`;

    const newSelected = new Set<string>();
    const newExpanded = new Set<string>(expandedIds);

    flatMap.forEach((node) => {
      if (!isOwnMatch(node)) return;

      newSelected.add(node.id);
      let current = node;
      while (current.parentId) {
        newExpanded.add(current.parentId);
        const parent = flatMap.get(current.parentId);
        if (parent) current = parent;
        else break;
      }
    });

    setSelectedIds(newSelected);
    setExpandedIds(newExpanded);
    showToast(
      newSelected.size === 0
        ? `Nothing on screen matches ${scope}.`
        : `Selected ${newSelected.size} item${newSelected.size === 1 ? '' : 's'} ${scope}.`,
      newSelected.size === 0 ? 'info' : 'success'
    );
  };

  // The hook holds the controller and clears `isProcessing` only when the
  // runner returns, so a task still in flight cannot land after the UI has
  // claimed the run stopped.
  const handleStop = () => {
    stop();
    showToast('Stopping… waiting for the current task to finish.', 'info');
  };

  // --- Per-node task builders --------------------------------------------
  // Each returns the batch task(s) that repair one kind of gap on one node.
  // Both the single-action buttons and "Fix All Gaps" compose from these.

  const findPromptIn = (courses: Course[], path: StatePath) =>
    courses
      .find((c) => c.id === path.courseId)
      ?.topics.find((t) => t.id === path.topicId)
      ?.subTopics.find((st) => st.id === path.subTopicId)
      ?.dotPoints.find((dp) => dp.id === path.dotPointId)
      ?.prompts.find((p) => p.id === path.promptId);

  const findDraftPrompt = findPromptIn;

  /**
   * The question as it stands NOW, not as it stood when the batch was
   * assembled. A run of 200 tasks takes minutes and rewrites the library as it
   * goes; reading `node.dataRef` at that point returns the question as it was
   * before any of it happened.
   */
  const livePrompt = (path: StatePath): Prompt | undefined =>
    findPromptIn(coursesRef.current, path);

  /** The same, but a missing question stops the task instead of skipping it silently. */
  const requireLivePrompt = (path: StatePath): Prompt => {
    const prompt = livePrompt(path);
    if (!prompt) throw new Error('The question was deleted before this task ran.');
    return prompt;
  };

  /**
   * The outcomes an AI may link a question to, for a question anywhere in the
   * tree. An audit run walks a whole course, so it crosses both years in one
   * pass — `course.outcomes` would offer HSC outcomes to a Year 11 question and
   * write the link without anyone reviewing it.
   */
  const outcomesForNode = (course: Course, path: StatePath): CourseOutcome[] =>
    outcomesForYear(course, yearOfTopic(course.topics.find((t) => t.id === path.topicId)));

  const makeQuestionTask = (node: TreeNode): BatchTask<void> => ({
    id: `q-${node.id}`,
    description: `Generating question: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const path = node.path;
      const course = coursesRef.current.find((c) => c.id === path.courseId);
      const topic = course?.topics.find((t) => t.id === path.topicId);
      if (!course || !topic) throw new Error('The topic was deleted before this task ran.');

      const dp = node.dataRef as DotPoint;
      const syllabusVerbInfo = extractCommandVerb(dp.description);
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
        dp.description,
        targetMarks,
        verbsToUse,
        outcomesForNode(course, path)
      );
      updateCourses((draft) => {
        const draftDp = draft
          .find((c) => c.id === path.courseId)
          ?.topics.find((t) => t.id === path.topicId)
          ?.subTopics.find((st) => st.id === path.subTopicId)
          ?.dotPoints.find((d) => d.id === path.dotPointId);
        if (draftDp) {
          if (!draftDp.prompts) draftDp.prompts = [];
          draftDp.prompts.push(prompt);
        }
      });
      if (path.dotPointId) recordTouch(prompt.id, path.dotPointId, prompt.question);
    },
  });

  const makeSampleTask = (node: TreeNode): BatchTask<void> => ({
    id: `sa-${node.id}`,
    description: `Drafting sample answer: ${node.label.slice(0, 30)}...`,
    action: async () => {
      // Read live: under "Fix All Gaps" the marking guide for this same
      // question is written earlier in the run, and the exemplar should be
      // drafted against it rather than against the gap it replaced.
      const prompt = requireLivePrompt(node.path);
      // The dot point travels with a prompt node, so a batch-written exemplar
      // is built on the syllabus's own terms rather than the question's wording
      // alone — the same brief the workspace generator gets.
      const answer = await generateSampleAnswer(prompt, prompt.totalMarks, [], {
        dotPoint: node.dotPointText,
      });
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
    description: `Writing marking guide: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = requireLivePrompt(node.path);
      const course = coursesRef.current.find((c) => c.id === node.path.courseId);
      if (!course) throw new Error('The course was deleted before this task ran.');
      const rubric = await generateRubricForPrompt(prompt, outcomesForNode(course, node.path));
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
    description: `Reformatting marking guide: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = requireLivePrompt(node.path);
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
      const prompt = requireLivePrompt(node.path);
      const course = coursesRef.current.find((c) => c.id === node.path.courseId);
      if (!course) throw new Error('The course was deleted before this task ran.');
      const suggested = await suggestOutcomesForPrompt(
        prompt.question,
        outcomesForNode(course, node.path),
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
      // Tier, not band: `verbTier` is the command verb's cognitive tier, which
      // is what caps the band. Calling it "Band 4" in the log said the sample
      // was being marked to Band 4.
      description: `Recalibrating sample (tier ${verbTier} rules): ${node.label.slice(0, 20)}...`,
      action: async () => {
        const current = requireLivePrompt(node.path);
        const liveSample = (current.sampleAnswers ?? []).find((s) => s.id === sample.id);
        if (!liveSample) throw new Error('The sample answer was deleted before this task ran.');

        // 1. Create a clean calibration prompt without existing samples to prevent bias
        const calibrationPrompt = { ...current, sampleAnswers: [] };

        // 2. Ask AI to evaluate the Mark (quality), passing the Tier context
        const result = await evaluateAnswer(liveSample.answer, calibrationPrompt, verbInfo);

        // 3. Enforce STRICT band calculation based on the AI's Mark and the Question's Tier.
        // This overrides any band hallucinated by the AI, ensuring structural consistency across the dataset.
        const strictBand = getBandForMark(result.overallMark, current.totalMarks, verbTier);

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
    description: `Scoring quality: ${node.label.slice(0, 30)}...`,
    action: async () => {
      const prompt = requireLivePrompt(node.path);
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
      // The score is one of the things `handleSyncToLibrary` carries, and the
      // outbox is what decides whether a question is ever pushed — so a
      // screened question that was never queued could never take its score to
      // the review queue, which is the only reason the score is stored.
      if (node.path.promptId && node.path.dotPointId)
        recordTouch(node.path.promptId, node.path.dotPointId, node.label);
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
   * Run a set of tasks and summarise the outcome. The terminal collapses when
   * the batch ends, so the result has to survive as a toast.
   */
  const executeBatch = async (
    tasks: BatchTask<void>[],
    summarise: (done: number, failed: number, aborted: boolean, fatal?: BatchFatalError) => void
  ) => {
    const outcome = await runBatch(tasks, 1);

    if (outcome.runnerError) {
      // The runner counts and carries on from task failures, so reaching here
      // means the runner itself broke. Reporting "0 completed" and nothing else
      // would read as a batch that quietly did nothing.
      showToast(
        `The batch could not run: ${outcome.runnerError instanceof Error ? outcome.runnerError.message : 'unknown error'}`,
        'error'
      );
      return null;
    }

    summarise(outcome.completed, outcome.failed, outcome.aborted, outcome.fatalError);
    return outcome;
  };

  /**
   * What a run left unfinished, kept so it can be run again.
   *
   * A batch of two hundred that ends "184 succeeded, 16 failed" used to leave
   * the admin reading a scrolling log, matching descriptions back to questions
   * by eye, and re-selecting them by hand — and the failures are usually the
   * transient half of a long run, a rate limit or a truncated response, which
   * a second attempt clears. The tasks themselves are safe to keep: each one
   * resolves its question through `coursesRef` at action time rather than from
   * anything captured when the batch was assembled, so a retry runs against the
   * library as it stands now.
   */
  const [failedTasks, setFailedTasks] = useState<{ label: string; tasks: BatchTask<void>[] }>({
    label: '',
    tasks: [],
  });

  const keepFailures = (label: string, tasks: BatchTask<void>[], failedIds: string[]) => {
    const byId = new Set(failedIds);
    setFailedTasks({ label, tasks: tasks.filter((t) => byId.has(t.id)) });
  };

  const handleBulkAction = async (actionType: BulkActionType) => {
    if (isProcessing) return; // a batch is already running

    const tasks = buildTasks(actionType);
    if (tasks.length === 0) {
      showToast(
        'Nothing in this selection needs that action. Widen the filters and try again.',
        'info'
      );
      return;
    }

    // A new run supersedes whatever the last one left behind — its failures
    // are about to be re-attempted or replaced by this run's own.
    setFailedTasks({ label: '', tasks: [] });

    // Route every AI call in this batch to the engine the admin picked for
    // the run (or leave the app's per-role defaults when 'default').
    setBatchModelOverride(batchEngine === 'default' ? null : batchEngine);
    try {
      const outcome = await executeBatch(tasks, (done, failed, aborted, fatal) => {
        // A run can now finish while the studio is closed, so its summary
        // carries the way back in — read at completion time rather than
        // captured when the batch was assembled, because the studio was still
        // open then and the offer would be pointless.
        const back = isOpenRef.current ? undefined : reopenActionRef.current;
        if (aborted) {
          showToast(`Batch stopped — ${done} of ${tasks.length} completed.`, 'info', back);
        } else if (fatal) {
          showToast(`Batch halted: ${fatal.userMessage} ${fatal.suggestion}`, 'error', back);
        } else if (failed > 0) {
          showToast(
            `Batch finished: ${done} succeeded, ${failed} failed. Check the processing log for details.`,
            'error',
            back
          );
        } else {
          showToast(
            `Batch complete: ${done} item${done === 1 ? '' : 's'} updated.`,
            'success',
            back
          );
        }
      });
      if (outcome && outcome.failedTaskIds.length > 0)
        keepFailures(ACTION_LABELS[actionType], tasks, outcome.failedTaskIds);
    } finally {
      setBatchModelOverride(null);
    }
  };

  /**
   * Take everything that is not a syllabus term out of the selected questions'
   * term lists.
   *
   * The only repair on this screen that needs no AI: `dropNonSyllabusTerms` is
   * a rule the app already owns and already applies to every list it generates,
   * so this is one local edit rather than a batch run. Putting it through the
   * batch runner would have spent its 1.5s-per-task provider pacing on two
   * hundred writes to IndexedDB.
   *
   * It only ever REMOVES, and it does not cap the list: generation stops at
   * twelve terms because that is a sensible size for something being written
   * from scratch, and applying that to a curated list of nineteen would throw
   * away seven real terms a teacher put there.
   */
  const handleTidyTerms = () => {
    if (isProcessing) return;
    const targets: { path: StatePath; label: string; dropped: number }[] = [];
    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node || !hasOffSyllabusTerms(node)) return;
      targets.push({
        path: node.path,
        label: node.label,
        dropped: offSyllabusTermCount(node.dataRef as Prompt),
      });
    });
    if (targets.length === 0) return;

    const droppedTotal = targets.reduce((sum, t) => sum + t.dropped, 0);

    updateCourses((draft) => {
      targets.forEach(({ path }) => {
        const prompt = findDraftPrompt(draft, path);
        if (prompt) prompt.keywords = dropNonSyllabusTerms(prompt.keywords, prompt.verb);
      });
    });

    targets.forEach(({ path, label }) => {
      if (path.promptId && path.dotPointId) recordTouch(path.promptId, path.dotPointId, label);
    });

    showToast(
      `Removed ${droppedTotal} entr${droppedTotal === 1 ? 'y' : 'ies'} that ${droppedTotal === 1 ? 'was' : 'were'} not a syllabus term, across ${targets.length} question${targets.length === 1 ? '' : 's'}.`,
      'success'
    );
  };

  /**
   * Put the terms the syllabus dot point and the question are built on onto the
   * question's Syllabus Terms list.
   *
   * The other half of Tidy Terms, and local for the same reason: the judgement
   * is `missingSyllabusTerms`, which needs no model. It only ever APPENDS, and
   * only terms none of the existing entries already covers, so a curated list
   * keeps its own wording and its own order.
   */
  const handleAddTerms = () => {
    if (isProcessing) return;
    const targets: { path: StatePath; label: string; terms: string[] }[] = [];
    selectedIds.forEach((id) => {
      const node = flatMap.get(id);
      if (!node) return;
      const terms = syllabusTermGaps(node);
      if (terms.length > 0) targets.push({ path: node.path, label: node.label, terms });
    });
    if (targets.length === 0) return;

    const added = targets.reduce((sum, t) => sum + t.terms.length, 0);

    updateCourses((draft) => {
      targets.forEach(({ path, terms }) => {
        const prompt = findDraftPrompt(draft, path);
        if (prompt) prompt.keywords = [...(prompt.keywords ?? []), ...terms];
      });
    });

    targets.forEach(({ path, label }) => {
      if (path.promptId && path.dotPointId) recordTouch(path.promptId, path.dotPointId, label);
    });

    showToast(
      `Added ${added} syllabus term${added === 1 ? '' : 's'} across ${targets.length} question${targets.length === 1 ? '' : 's'} — each one taken from the wording of the dot point the question sits under.`,
      'success'
    );
  };

  /**
   * Run the last batch's failures again, and nothing else.
   *
   * It goes through the same engine picker as any other run, so an admin whose
   * batch was rate-limited on Pro can drop to Flash and retry the remainder
   * without rebuilding the selection.
   */
  const handleRetryFailed = async () => {
    if (isProcessing || failedTasks.tasks.length === 0) return;
    const { label, tasks } = failedTasks;
    setFailedTasks({ label: '', tasks: [] });

    setBatchModelOverride(batchEngine === 'default' ? null : batchEngine);
    try {
      const outcome = await executeBatch(tasks, (done, failed, aborted) => {
        if (aborted) showToast(`Retry stopped — ${done} of ${tasks.length} completed.`, 'info');
        else if (failed > 0)
          showToast(`Retry finished: ${done} succeeded, ${failed} still failing.`, 'error');
        else
          showToast(
            `Retry complete: ${done} item${done === 1 ? '' : 's'} updated on the second attempt.`,
            'success'
          );
      });
      if (outcome && outcome.failedTaskIds.length > 0)
        keepFailures(label, tasks, outcome.failedTaskIds);
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

        // The studio's own Quality Check score stays local. It used to ride
        // along into the row, but the score column is server-owned now — a
        // number this client chose is exactly what the review queue must not
        // sort on — so a synced repair arrives unscored and leads the queue.
        await savePromptContribution(t.dotPointAppId, prompt, 'pending');
        for (const sa of prompt.sampleAnswers ?? []) {
          await saveSampleAnswerContribution(prompt.id, sa, 'pending');
        }

        touchedRef.current.delete(t.promptAppId);
        persistOutbox();
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

  /**
   * One branch of the tree, with the semantics a tree is supposed to carry.
   *
   * The rows were nested `div`s with buttons in them: a screen reader was told
   * nothing about depth, about which branches were open, or about what was
   * selected — all three of which are the whole point of this surface. The
   * shape is unchanged; `role="tree"`/`treeitem`/`group` plus `aria-level`,
   * `aria-expanded` and `aria-selected` now describe it. The row itself is a
   * memoised component, so redrawing this recursion no longer redraws its
   * contents.
   */
  const renderNode = (node: TreeNode, level: number = 0) => {
    const isSelected = selectedIds.has(node.id);
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = hasChildren && (isNarrowed || expandedIds.has(node.id));

    return (
      <div
        key={node.id}
        role="treeitem"
        data-node-id={node.id}
        tabIndex={node.id === tabbableId ? 0 : -1}
        // Only when the focus landed HERE. React's onFocus is focusin, which
        // bubbles, so a row taking focus otherwise announces itself to every
        // ancestor treeitem it sits inside — and each of them claims to be the
        // active row, leaving a ring on the whole path back to the faculty.
        onFocus={(e) => {
          if (e.target === e.currentTarget) setActiveId(node.id);
        }}
        aria-label={node.label}
        aria-level={level + 1}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        className="relative outline-none"
      >
        {level > 1 && (
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-px bg-white/5 light:bg-slate-200"
            style={{ left: `${(level - 1) * INDENT_STEP + 23}px` }}
          />
        )}
        <AuditTreeRow
          node={node}
          level={level}
          isSelected={isSelected}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          isActive={treeHasFocus && node.id === activeId}
          onToggleSelect={toggleSelect}
          onToggleExpand={toggleExpand}
        />
        {isExpanded && node.children && (
          <div role="group">{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  /**
   * The tree as a keyboard widget.
   *
   * It has said `role="tree"` since it was built, which is a promise about
   * arrow keys that nothing kept — and the DOM underneath was worse than
   * silent: every row carries two buttons, so Tab walked a keyboard user
   * through three thousand stops to cross the shipped library, and there was
   * no other way in. The buttons are out of the tab order now and the tree is
   * one stop with roving focus inside it, which is both the ARIA pattern and
   * the faster way to work: down the rows, space to tick, left to fold a
   * branch away.
   *
   * `activeId` is the row focus is on. `treeHasFocus` gates the ring, so a row
   * that was merely clicked does not sit there looking focused afterwards.
   */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [treeHasFocus, setTreeHasFocus] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  // Exactly one row is tabbable, so Tab enters the tree once and Shift+Tab
  // leaves it once. It is wherever the arrow keys last were, or the first row.
  const tabbableId =
    activeId && visibleOrder.includes(activeId) ? activeId : (visibleOrder[0] ?? null);

  const focusRow = React.useCallback((id: string) => {
    setActiveId(id);
    treeRef.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`)?.focus();
  }, []);

  const handleTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const order = visibleOrder;
    if (order.length === 0) return;
    const currentId = activeId && order.includes(activeId) ? activeId : order[0];
    const index = order.indexOf(currentId);
    const node = flatMap.get(currentId);
    const branches = !!node?.children?.length;
    // A search or a filter opens every row it shows (see `isNarrowed`), so
    // folding one while narrowed would do nothing visible. Left then means
    // "out to the parent" for the whole depth of the tree.
    const isOpen = branches && (isNarrowed || expandedIds.has(currentId));
    const canFold = branches && !isNarrowed && expandedIds.has(currentId);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (index < order.length - 1) focusRow(order[index + 1]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index > 0) focusRow(order[index - 1]);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(order[0]);
        break;
      case 'End':
        e.preventDefault();
        focusRow(order[order.length - 1]);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (branches && !isOpen) toggleExpand(currentId);
        else if (isOpen && order[index + 1]) focusRow(order[index + 1]);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (canFold) toggleExpand(currentId);
        else if (node?.parentId && order.includes(node.parentId)) focusRow(node.parentId);
        break;
      case ' ':
      case 'Enter':
        /**
         * Space is the tick. Held with shift it extends from the last one, the
         * same reach a shift-click makes.
         *
         * Unless a control inside the row has focus. The row's buttons are out
         * of the tab order but a click still focuses them, and this handler
         * sits on the tree, so without the guard a curator who clicked "Write
         * Marking Guides" and pressed Enter to run it again would have the
         * keypress swallowed here and the row's tick flipped instead. Arrow
         * keys are left to bubble either way — moving off a button and on to
         * the next row is what they should do.
         */
        if ((e.target as HTMLElement).closest('button')) break;
        e.preventDefault();
        if (node) toggleSelect(currentId, !selectedIds.has(currentId), e.shiftKey);
        break;
      default:
        break;
    }
  };

  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

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
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Content audit studio"
      className="fixed inset-0 z-modal-elevated bg-[rgb(var(--color-bg-base))] light:bg-slate-50 flex flex-col overflow-hidden animate-fade-in"
    >
      {/* Header.
          It used to be a 10rem band holding the title, a paragraph, an
          instrument cluster and the whole filter rail, capped at 42vh because
          the rail wrapped onto three lines and pushed the tree off the bottom
          of the screen. The rail has moved to the column on the left, so what
          is left here is what a header is for: what this screen is, and how
          much of the syllabus is covered. */}
      <header className="flex-shrink-0 border-b border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white z-20 shadow-lg light:shadow-sm relative">
        <MeshOverlay opacity="opacity-[0.05]" />
        <div className="relative w-full max-w-[1800px] px-5 md:px-8 pr-16 md:pr-20 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-black text-white light:text-slate-900 tracking-tighter italic leading-none">
              Content Audit Studio
            </h2>
            <p className="hidden md:block text-xs text-slate-400 light:text-slate-600 mt-2 leading-relaxed max-w-[64ch]">
              Every syllabus dot point, and what each of its questions is still missing — a marking
              guide, sample answers, linked outcomes. Pick a scope and fill the gaps in one run.
            </p>
          </div>

          <div className="flex flex-wrap items-center ml-auto bg-black/40 light:bg-slate-50 rounded-panel border border-white/5 light:border-slate-200 py-2 shadow-inner light:shadow-sm">
            <div className="flex items-center gap-4 px-4 md:px-6 border-r border-white/5 light:border-slate-200">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                <svg className="transform -rotate-90 w-14 h-14" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className="text-white/5 light:text-slate-200"
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
                <span className={`absolute text-[11px] font-bold ${healthColor}`}>
                  {healthPercentage}%
                </span>
              </div>
              <div>
                <span className="t-label text-white/50 light:text-slate-500 whitespace-nowrap">
                  Dot points covered
                </span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-black ${healthColor} tracking-tighter`}>
                    {coveredDotPoints}
                  </span>
                  <span className="t-label text-white/40 light:text-slate-500">
                    of {totalDotPoints}
                  </span>
                </div>
              </div>
            </div>
            {/* "Content Units" and "Proof Data" named the storage, not the
                thing: they are questions and sample answers everywhere else
                in the app, and the second line of each metric was already
                saying so under the first. */}
            <InstrumentMetric
              label="Questions"
              value={totalQuestions}
              colorClass="text-white light:text-slate-900"
            />
            <InstrumentMetric
              label="Sample answers"
              value={totalSamples}
              colorClass="text-indigo-400"
            />
          </div>

          {/* Escape was already blocked during a run, but this button was
              not — clicking it walked away from a live batch that kept
              spending AI quota and writing to the library with its progress
              log and its Stop control gone from the screen. */}
        </div>
        <button
          onClick={handleCloseStudio}
          aria-label="Close"
          title={
            isProcessing
              ? 'Close the studio — the batch carries on, and each step reports as it finishes'
              : 'Close'
          }
          className="absolute top-4 right-4 md:right-6 w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
        >
          <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
        </button>
      </header>

      {/* The work area: a control rail beside the tree.
          Before this the studio was three full-width bands stacked on top of
          each other, each one holding its content out at the left and right
          edges — so on the wide window this screen is actually used on, the
          middle of every band, and the middle of every tree row, was empty.
          The rail spends that space on the thing an admin reaches for most
          (which gap am I working on?) and lets the tree keep the rest. */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside
          aria-label="Find and filter the curriculum"
          className="shrink-0 w-full md:w-[17rem] flex flex-col gap-3 md:gap-5 md:overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface))]/40 light:bg-white px-4 py-3 md:py-5"
        >
          <div>
            <div className="relative group/search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/search:text-indigo-400 transition-colors" />
              <input
                type="search"
                aria-label="Search the curriculum by course, topic, dot point or question"
                placeholder="Search curriculum…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/20 light:bg-slate-100 border border-white/5 light:border-slate-200 rounded-xl pl-9 pr-3 h-10 text-sm text-white light:text-slate-900 placeholder-slate-600 light:placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            {isNarrowed && (
              <div className="flex items-center justify-between mt-2 px-1">
                {/* What a narrowed tree is showing, said in numbers. Without it
                    a filter that matches nothing and a filter that matches
                    everything look the same until you scroll. */}
                <span
                  className="t-label text-slate-500 tabular-nums"
                  title="Rows in the narrowed tree, out of every row in the library"
                >
                  {filteredIds.size} of {flatMap.size} rows
                </span>
                <button
                  onClick={resetNarrowing}
                  title="Clear the search and the active filter"
                  className="t-label text-slate-500 hover:text-white light:hover:text-slate-900 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              title="Expand every branch of the tree"
              className="t-label flex-1 h-9 rounded-lg text-slate-400 light:text-slate-600 hover:bg-white/5 light:hover:bg-slate-100 hover:text-white light:hover:text-slate-900 flex items-center justify-center gap-1.5 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" /> Expand All
            </button>
            <button
              onClick={collapseAll}
              title="Collapse the whole tree"
              className="t-label flex-1 h-9 rounded-lg text-slate-400 light:text-slate-600 hover:bg-white/5 light:hover:bg-slate-100 hover:text-white light:hover:text-slate-900 flex items-center justify-center gap-1.5 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" /> Collapse All
            </button>
          </div>

          {/* The filters, rendered from the one registry, grouped by what the
              studio can do about them: content that is missing and can be
              generated, then content that exists and reads wrong. */}
          <div className="flex md:flex-col gap-4 md:gap-5 overflow-x-auto md:overflow-x-visible custom-scrollbar pb-1 md:pb-0">
            {(['missing', 'review'] as const).map((group) => (
              <div key={group} className="shrink-0 md:shrink">
                <h3 className="t-section text-white/40 light:text-slate-500 px-2.5 mb-2">
                  {group === 'missing' ? 'Missing' : 'Needs review'}
                </h3>
                <div className="flex md:flex-col gap-1 md:gap-0.5">
                  {AUDIT_FILTERS.filter((f) => f.group === group).map((filter) => (
                    <FilterRow
                      key={filter.id}
                      active={activeFilter === filter.id}
                      tone={filter.tone}
                      label={filter.label}
                      count={counts[filter.id]}
                      title={filter.title}
                      onClick={() => handleFilterToggle(filter.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {isNarrowed && (
            <button
              onClick={handleSelectAllShown}
              disabled={isProcessing || filteredMatchCount === 0}
              title="Select every item the search and the active filter are showing"
              className="t-label w-full h-10 rounded-xl bg-white/10 light:bg-indigo-50 border border-white/20 light:border-indigo-200 text-white light:text-indigo-700 hover:bg-white/20 light:hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CheckSquare className="w-4 h-4" /> Select All Filtered
            </button>
          )}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Tree */}
          <div className="flex-1 min-h-0 overflow-auto bg-[rgb(var(--color-bg-base))] light:bg-slate-50 custom-scrollbar">
            <div className="min-w-[700px] max-w-[1528px] pb-16">
              {filteredTreeData.length > 0 ? (
                <div
                  ref={treeRef}
                  role="tree"
                  aria-multiselectable="true"
                  aria-label="Curriculum — arrow keys to move, space to select, left and right to fold"
                  onKeyDown={handleTreeKeyDown}
                  onFocus={() => setTreeHasFocus(true)}
                  onBlur={() => setTreeHasFocus(false)}
                >
                  {filteredTreeData.map((node) => renderNode(node))}
                </div>
              ) : (
                /* An empty screen is a place to act from. It used to say "No items
                   found / Refine your search or filters" whether the library was
                   empty, the search matched nothing, or a chip had nothing left to
                   show — three different situations and one shrug. */
                <div className="py-32 text-center animate-fade-in">
                  <div className="w-20 h-20 rounded-tile bg-white/5 light:bg-slate-100 flex items-center justify-center border border-white/5 light:border-slate-200 mb-6 mx-auto shadow-inner">
                    <Filter className="w-10 h-10 text-slate-700 light:text-slate-300" />
                  </div>
                  {treeData.length === 0 ? (
                    <>
                      <h3 className="text-2xl font-black text-white light:text-slate-900 tracking-tight italic">
                        No courses to audit
                      </h3>
                      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                        Import or create a course first — the studio audits what is already in the
                        library.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-2xl font-black text-white light:text-slate-900 tracking-tight italic">
                        {activeFilterLabel
                          ? `Nothing is flagged as “${activeFilterLabel}”`
                          : 'Nothing matches that search'}
                      </h3>
                      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                        {activeFilterLabel && deferredSearchQuery
                          ? 'The filter and the search have no overlap.'
                          : activeFilterLabel
                            ? 'That is the good outcome — nothing in the library has this gap.'
                            : 'Try a shorter term, or a word from the question itself.'}
                      </p>
                      <button
                        onClick={resetNarrowing}
                        className="t-label mt-6 px-5 h-10 rounded-xl bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-200 text-slate-300 light:text-slate-700 hover:bg-white/10 light:hover:bg-slate-200 transition-all inline-flex items-center gap-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Show the whole library
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operations Terminal (Footer) */}
      <div
        className={`border-t border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white flex flex-col flex-shrink-0 relative shadow-[0_-32px_64px_-16px_rgba(0,0,0,0.5)] light:shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.1)] transition-all duration-500 ${isProcessing ? 'h-80' : ''}`}
      >
        <MeshOverlay opacity="opacity-[0.05]" />
        <div className="relative w-full max-w-[1800px] px-4 md:px-8 flex flex-col flex-1 min-h-0">
          {isProcessing && progress && (
            <div className="flex-1 overflow-hidden flex flex-col py-5 animate-fade-in">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-4">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  <span className="t-label text-white/40 light:text-slate-500 italic">
                    Processing Log
                  </span>
                  <span className="t-label flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/40 light:bg-slate-100 border border-white/10 light:border-slate-200 text-indigo-400">
                    <Cpu className="w-3 h-3" />
                    {batchEngine === 'default'
                      ? 'App Default'
                      : (AI_MODELS.find((m) => m.id === batchEngine)?.label ?? batchEngine)}
                  </span>
                </div>
                <div className="t-label flex gap-8">
                  <span className="text-emerald-400">Completed: {progress.completed}</span>
                  <span className="text-red-400">Failed: {progress.failed}</span>
                  <span className="text-slate-500">Total: {progress.total}</span>
                </div>
              </div>
              <div
                role="log"
                aria-live="polite"
                aria-label="Processing log"
                className="flex-1 bg-black/40 light:bg-slate-50 rounded-panel border border-white/5 light:border-slate-200 p-5 overflow-y-auto font-mono text-xs space-y-2 custom-scrollbar shadow-inner"
              >
                {progress.fatalError && (
                  <div className="flex items-start gap-3 p-3 mb-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 light:text-red-600 animate-fade-in">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs">{progress.fatalError.userMessage}</p>
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

          {isProcessing && progress ? (
            <div className="h-20 border-t border-white/5 light:border-slate-200 flex items-center gap-6 animate-fade-in">
              <div className="flex-1 min-w-0">
                {/* `progress.currentTask` was being computed by the batch runner
                    and thrown away. During a long run the bar moved and nothing
                    said which of two hundred questions it was on. */}
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <span className="t-label text-slate-400 light:text-slate-600 truncate">
                    {progress.currentTask ?? 'Working…'}
                  </span>
                  <span className="t-label text-slate-500 tabular-nums whitespace-nowrap">
                    {progress.completed + progress.failed} of {progress.total}
                    {(() => {
                      const eta = estimateRemaining(
                        runStartedAtRef.current ? Date.now() - runStartedAtRef.current : 0,
                        progress.completed + progress.failed,
                        progress.total
                      );
                      return eta ? <span className="ml-3 text-slate-600">{eta}</span> : null;
                    })()}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.completed + progress.failed}
                  aria-label="Batch progress"
                  className="h-3 bg-black/40 light:bg-slate-100 rounded-full overflow-hidden border border-white/5 light:border-slate-200 p-0.5"
                >
                  <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 relative rounded-full"
                    style={{
                      width: `${progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0}%`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                  </div>
                </div>
              </div>
              <button
                onClick={handleStop}
                disabled={isStopping}
                title="Finish the task in flight, then stop the run"
                className="t-label px-10 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isStopping ? 'Stopping…' : 'Stop Process'}
              </button>
            </div>
          ) : (
            /* One left-to-right flow rather than two clusters pinned to
               opposite edges: the scope, then what it will run on, then the
               run. Capped and independently scrollable, because the button row
               keeps growing and without a cap that wrapped growth is what
               pushes the tree toward 0px on a short viewport. */
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 max-h-[38vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-3 shrink-0">
                <div className="px-3 py-1.5 rounded-xl bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-200 text-white light:text-slate-900 font-black text-xl tracking-tighter italic tabular-nums">
                  {selectedIds.size}
                </div>
                <div className="min-w-0">
                  <span className="t-label text-white/50 light:text-slate-500 block">Selected</span>
                  {/* A bare count could not tell one selected course from forty
                      selected questions, and those run very different batches. */}
                  <span className="t-label text-slate-500 block whitespace-nowrap">
                    {selectionSummary}
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <button
                    onClick={clearSelection}
                    disabled={isProcessing}
                    title="Deselect everything in the tree"
                    className="t-label px-2.5 h-8 rounded-lg text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-white/5 light:hover:bg-slate-100 transition-all flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Square className="w-3.5 h-3.5" /> Clear Selection ({selectedIds.size})
                  </button>
                )}
              </div>

              <div className="w-px h-8 bg-white/10 light:bg-slate-200 hidden lg:block" />

              <div className="flex items-center gap-2 shrink-0">
                <label
                  htmlFor="audit-engine"
                  className="t-label text-white/50 light:text-slate-500 flex items-center gap-1.5"
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
                  className="bg-black/40 light:bg-slate-50 border border-white/10 light:border-slate-300 rounded-lg px-3 h-9 text-xs font-medium text-white light:text-slate-900 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                >
                  <option value="default">App Default</option>
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-px h-8 bg-white/10 light:bg-slate-200 hidden lg:block" />

              {/* The "AI Operations" caption above this row is gone: every
                  button below now leads with its own verb, so the caption was
                  a label over content that already named itself. The buttons
                  used to be nouns — "Rubrics (8)" — beside a chip that said
                  "No Marking Guide" and a row badge that said "No Rubric", for
                  one thing under three names. */}
              <div className="flex flex-wrap items-center gap-2">
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'generateQuestions')}
                  disabled={isProcessing || selectionTargets.questions === 0}
                  title="Write a question for each selected dot point that has none"
                  tone="red"
                  label="Write Questions"
                  count={selectionTargets.questions}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'generateRubrics')}
                  disabled={isProcessing || selectionTargets.rubrics === 0}
                  title="Write a marking guide for each selected question missing one, or whose guide is non-standard"
                  tone="indigo"
                  label="Write Marking Guides"
                  count={selectionTargets.rubrics}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'generateSamples')}
                  disabled={isProcessing || selectionTargets.samples === 0}
                  title="Draft a full-mark sample answer for each selected question with none"
                  tone="amber"
                  label="Draft Samples"
                  count={selectionTargets.samples}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'linkOutcomes')}
                  disabled={isProcessing || selectionTargets.outcomes === 0}
                  title="Suggest syllabus outcomes for each selected question with none linked"
                  tone="pink"
                  label="Link Outcomes"
                  count={selectionTargets.outcomes}
                  icon={<Link2 className="w-3.5 h-3.5" />}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'reviseRubrics')}
                  disabled={isProcessing || selectionTargets.rubricRevisions === 0}
                  title="Reformat non-standard marking guides into descending mark bands, keeping the criteria they already carry"
                  tone="orange"
                  label="Reformat Guides"
                  count={selectionTargets.rubricRevisions}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'recalibrateSamples')}
                  disabled={isProcessing || selectionTargets.recalibrations === 0}
                  title="Re-mark every existing sample answer under the strict verb/band rules"
                  tone="teal"
                  label="Re-mark Samples"
                  count={selectionTargets.recalibrations}
                  icon={<Scale className="w-3.5 h-3.5" />}
                />
                <AuditActionButton
                  onClick={handleAddTerms}
                  disabled={isProcessing || selectionTargets.termGaps === 0}
                  title="Add the terms the syllabus dot point and the question are built on, that the Syllabus Terms list leaves out. Appends only; nothing already on a list is touched. A local edit: no AI, no quota, instant."
                  tone="lime"
                  label="Add Terms"
                  count={selectionTargets.termGaps}
                  icon={<ListPlus className="w-3.5 h-3.5" />}
                />
                <AuditActionButton
                  onClick={handleTidyTerms}
                  disabled={isProcessing || selectionTargets.termLists === 0}
                  title="Remove the entries that are not syllabus terms — the command verb, generic words, connectives like “therefore”, over-long phrases and duplicates — from the selected questions' Syllabus Terms lists. A local edit: no AI, no quota, instant."
                  tone="sky"
                  label="Tidy Terms"
                  count={selectionTargets.termLists}
                  icon={<Eraser className="w-3.5 h-3.5" />}
                />
                <AuditActionButton
                  onClick={handleBulkAction.bind(null, 'screenQuality')}
                  disabled={isProcessing || selectionTargets.screenings === 0}
                  title="AI-score every selected question (0-100) so weak content is flagged, filterable, and triaged in the review queue"
                  tone="fuchsia"
                  label="Score Quality"
                  count={selectionTargets.screenings}
                  icon={<Gauge className="w-3.5 h-3.5" />}
                />
                <button
                  onClick={handleBulkAction.bind(null, 'fixAllGaps')}
                  disabled={isProcessing || selectionTargets.allGaps === 0}
                  title="One run that fills every gap in the selection: missing questions, marking guides, outcomes and samples"
                  className="t-label px-4 h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.03] active:scale-[0.98] transition-all disabled:opacity-25 disabled:grayscale disabled:shadow-none disabled:hover:scale-100 flex items-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  Fix All Gaps ({selectionTargets.allGaps})
                </button>
              </div>

              <div className="w-px h-8 bg-white/10 light:bg-slate-200 hidden lg:block" />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportJson}
                  disabled={isProcessing || !exportTarget}
                  title={
                    exportTarget
                      ? `Export "${exportTarget.label}" as a JSON file`
                      : 'Select exactly one topic or course to export'
                  }
                  className="t-label px-3.5 h-10 rounded-xl bg-emerald-500/10 light:bg-emerald-50 border border-emerald-500/30 light:border-emerald-300 text-emerald-300 light:text-emerald-700 hover:bg-emerald-500/20 light:hover:bg-emerald-100 transition-all flex items-center gap-2 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
                <button
                  onClick={() => importTargetCourseId && setImportCourseId(importTargetCourseId)}
                  disabled={isProcessing || !importTargetCourseId}
                  title={
                    importTargetCourseId
                      ? `Import a topic JSON file into "${courses.find((c) => c.id === importTargetCourseId)?.name ?? ''}"`
                      : 'Select exactly one topic or course to import into'
                  }
                  className="t-label px-3.5 h-10 rounded-xl bg-sky-500/10 light:bg-sky-50 border border-sky-500/30 light:border-sky-300 text-sky-300 light:text-sky-700 hover:bg-sky-500/20 light:hover:bg-sky-100 transition-all flex items-center gap-2 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Import JSON…
                </button>
                {failedTasks.tasks.length > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    disabled={isProcessing}
                    title={`Run the ${failedTasks.tasks.length} task${failedTasks.tasks.length === 1 ? '' : 's'} that failed in the last "${failedTasks.label}" run again — the selection does not need rebuilding, and the engine picker above still applies`}
                    className="t-label px-3.5 h-10 rounded-xl bg-amber-500/10 light:bg-amber-50 border border-amber-500/30 light:border-amber-300 text-amber-300 light:text-amber-700 hover:bg-amber-500/20 light:hover:bg-amber-100 transition-all flex items-center gap-2 disabled:opacity-30"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Failed ({failedTasks.tasks.length})
                  </button>
                )}
                {isCurriculumRemote() && pendingSyncCount > 0 && (
                  <button
                    onClick={handleSyncToLibrary}
                    disabled={isProcessing}
                    title="Push the questions repaired by this studio to the shared library as pending contributions — they go through the review queue before publishing"
                    className="t-label px-3.5 h-10 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-30"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Sync to Library ({pendingSyncCount})
                  </button>
                )}
                <button
                  onClick={() => setIsClearConfirmOpen(true)}
                  disabled={isProcessing || clearTargets.length === 0}
                  title={
                    clearTargets.length > 0
                      ? `Delete all questions under the selected scope(s), keeping the topic/sub-topic/dot point structure`
                      : 'Select a course, topic, sub-topic or dot point to clear its questions'
                  }
                  className="t-label px-3.5 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white active:scale-[0.98] transition-all disabled:opacity-25 disabled:grayscale disabled:hover:bg-red-500/10 disabled:hover:text-red-400 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Questions ({clearQuestionsCount})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested import modal — a second, independent instance of the same
          component the main navigator opens (see AppModals.tsx), scoped to
          whatever course the current selection resolves to. This modal isn't
          part of that navigator's useModalManager stack (the Studio itself
          sits outside it, as a full-screen surface of its own), so it's
          rendered directly here rather than through openModal — no stack to
          nest inside. */}
      {importCourseId && importTargetCourse && (
        <TopicImportModal
          isOpen={!!importCourseId}
          onClose={() => setImportCourseId(null)}
          courseName={importTargetCourse.name}
          existingTopics={importTargetCourse.topics}
          onImport={handleImportTopicConfirm}
        />
      )}

      <ConfirmationModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleConfirmClearQuestions}
        title="Clear questions?"
        message={clearQuestionsMessage}
        confirmButtonText="Clear Questions"
        isDestructive
      />
    </div>,
    document.body
  );
};

export default ContentAuditModal;
