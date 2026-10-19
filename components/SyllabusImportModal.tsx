import React, { useState, useMemo } from 'react';
import { Course, CourseOutcome, SyllabusYear } from '../types';
import { SYLLABUS_YEARS, yearShortLabel } from '../utils/syllabusYear';
import {
  parseOutcomesFromText,
  parseSyllabusStructure,
  fetchSyllabusPage,
  splitSyllabusIntoTopics,
} from '../services/geminiService';
import type { NesaPage } from '../services/geminiService';
import type { SyllabusPreviewNode } from '../utils/dataManagerUtils';
import {
  comparablePath,
  courseNameFromSyllabus,
  groupSiblings,
  hasNesaStatements,
  mergeOutcomesByCode,
  nesaOutcomes,
  nesaPageToPreviewNode,
  outcomesWithoutRemoved,
  pendingSiblings,
} from '../utils/nesaSyllabus';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import UrlFetchField, { NESA_HOST_HINT, NESA_URL_PLACEHOLDER } from './UrlFetchField';
import DiscardConfirmBar from './DiscardConfirmBar';
import DraftRestoreBanner from './DraftRestoreBanner';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { useImportDraft } from '../hooks/useImportDraft';
import {
  Sparkles,
  X,
  UploadCloud,
  ChevronRight,
  Folder,
  Plus,
  Trash2,
  Globe,
  GitMerge,
  Wand2,
  BookOpen,
  CircleCheck,
} from 'lucide-react';
import { generateId } from '../utils/idUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
} from '../utils/creatorChrome';

type PreviewNode = SyllabusPreviewNode;

interface SyllabusImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  // targetCourseId set → merge into that existing course; otherwise create new.
  // targetTopicId set (with a course) → merge everything into that one topic.
  onImport: (
    courseName: string,
    structure: PreviewNode[],
    outcomes: CourseOutcome[],
    targetCourseId?: string,
    targetTopicId?: string,
    year?: SyllabusYear
  ) => void;
  /** The year the navigator is on, which this opens on. */
  defaultYear: SyllabusYear;
}

/** Sets a textarea's height to its content, so a long dot point is read whole. */
const autoSize = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

interface TopicTab {
  id: string;
  name: string;
  content: string;
}

/**
 * A focus area NESA sent as its own structure. It is kept exactly as read, with
 * the page it came from, which is what stops the same page being added twice.
 */
interface ExactFocusArea {
  path: string;
  node: PreviewNode;
  outcomes: CourseOutcome[];
}

/** The syllabus the exact focus areas belong to, and the rest of its focus areas. */
interface ExactSource {
  syllabus: string;
  siblings: NesaPage['siblings'];
}

const SyllabusImportModal: React.FC<SyllabusImportModalProps> = ({
  isOpen,
  onClose,
  courses,
  onImport,
  defaultYear,
}) => {
  const [courseName, setCourseName] = useState('');
  /**
   * Which year of the course this whole import belongs to.
   *
   * Seeding is the reason this is here. A NESA syllabus document is one year's,
   * and without a control the course-level import could only ever produce
   * Year 12 content — so a Year 11 course had to be built through the topic
   * picker one topic at a time, which is the opposite of what this modal is for.
   */
  const [year, setYear] = useState<SyllabusYear>(defaultYear);
  // null → create a new course; otherwise merge into this existing course.
  const [targetCourseId, setTargetCourseId] = useState<string | null>(null);
  // null → auto (match topic names / create); otherwise merge all into this topic.
  const [targetTopicId, setTargetTopicId] = useState<string | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [outcomesText, setOutcomesText] = useState('');
  const [parsedOutcomes, setParsedOutcomes] = useState<CourseOutcome[]>([]);
  const [isParsingOutcomes, setIsParsingOutcomes] = useState(false);

  // New multi-topic state
  const [topicTabs, setTopicTabs] = useState<TopicTab[]>([
    { id: generateId('tab'), name: 'Topic 1', content: '' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(topicTabs[0].id);
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  // Kept apart from the modal's main error, which renders at the bottom of a
  // scrolling body — a failure from the URL box at the top belongs beside it.
  const [urlError, setUrlError] = useState<string | null>(null);

  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // How far through the tabs the analysis is. Each topic is its own AI call, so
  // a five-topic syllabus is five multi-second waits behind one spinner — with
  // no counter there is nothing to distinguish "working" from "hung".
  const [analysed, setAnalysed] = useState<{ done: number; total: number } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewNode[]>([]);
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);

  // Focus areas NESA read exactly. They skip the AI entirely, so they sit beside
  // the pasted tabs rather than inside them.
  const [exactAreas, setExactAreas] = useState<ExactFocusArea[]>([]);
  const [exactSource, setExactSource] = useState<ExactSource | null>(null);
  // Paths ticked in the "Add more" picker, and how far the reads have got.
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(new Set());
  const [siblingProgress, setSiblingProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [siblingNotice, setSiblingNotice] = useState<string | null>(null);

  const activeTab = topicTabs.find((t) => t.id === activeTabId) || topicTabs[0];
  const targetCourse = targetCourseId ? courses.find((c) => c.id === targetCourseId) : undefined;
  const targetTopic = targetCourse?.topics.find((t) => t.id === targetTopicId);
  // The course name the import will actually use (existing course's name when merging).
  const effectiveCourseName = targetCourse ? targetCourse.name : courseName;
  const isBusy =
    isParsingOutcomes || isAnalyzing || isFetchingUrl || isSplitting || siblingProgress !== null;

  const exactNodes = exactAreas.map((area) => area.node);
  const exactOutcomes = exactAreas.flatMap((area) => area.outcomes);
  // The picker's rows: every focus area of the syllabus that is not in the import yet.
  const siblingGroups = exactSource
    ? pendingSiblings(
        groupSiblings(exactSource.siblings),
        exactAreas.map((area) => area.path)
      )
    : [];
  const pendingChoices = siblingGroups
    .flatMap((group) => [
      ...group.items.map((item) => ({ path: item.path, title: item.title })),
      ...group.lists.flatMap((list) =>
        list.paths.map((path, index) => ({ path, title: list.titles[index] ?? '' }))
      ),
    ])
    .filter((choice) => selectedSiblings.has(choice.path));

  // Switching target course invalidates any chosen target topic.
  const handleChangeTargetCourse = (id: string | null) => {
    setTargetCourseId(id);
    setTargetTopicId(null);
  };

  const handleClose = () => {
    if (isBusy) return;
    setCourseName('');
    setTargetCourseId(null);
    setTargetTopicId(null);
    setOutcomesText('');
    setTopicTabs([{ id: generateId('tab'), name: 'Topic 1', content: '' }]);
    setParsedOutcomes([]);
    setPreviewData([]);
    setStep('input');
    setError(null);
    setUrlInput('');
    setUrlError(null);
    setExactAreas([]);
    setExactSource(null);
    setSelectedSiblings(new Set());
    setSiblingNotice(null);
    setYear(defaultYear);
    onClose();
  };

  /**
   * Whether there is anything here worth keeping.
   *
   * Pasted or fetched syllabus text, a parsed structure waiting to be imported,
   * outcomes already extracted, or a course name typed. Tab NAMES alone do not
   * count — the modal opens with "Topic 1" and nothing in it.
   */
  const hasWork =
    topicTabs.some((t) => t.content.trim().length > 0) ||
    previewData.length > 0 ||
    parsedOutcomes.length > 0 ||
    outcomesText.trim().length > 0 ||
    courseName.trim().length > 0 ||
    exactAreas.length > 0;

  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  /**
   * The same work, kept across a reload.
   *
   * Everything the analyse step reads plus everything the preview holds, so a
   * crash after a five-topic analysis does not cost those five AI calls again.
   * The exact focus areas are part of that work too: they are fetched, not typed.
   */
  const draft = useImportDraft(
    'full-syllabus',
    isOpen,
    {
      courseName,
      year,
      topicTabs,
      outcomesText,
      parsedOutcomes,
      previewData,
      step,
      exactAreas,
      exactSource,
    },
    hasWork
  );

  const restoreDraft = () => {
    const saved = draft.offered?.value;
    if (!saved) return;
    setCourseName(saved.courseName);
    setYear(saved.year);
    setTopicTabs(saved.topicTabs);
    setActiveTabId(saved.topicTabs[0]?.id ?? activeTabId);
    setOutcomesText(saved.outcomesText);
    setParsedOutcomes(saved.parsedOutcomes);
    setPreviewData(saved.previewData);
    // Drafts saved before exact focus areas existed have neither field.
    setExactAreas(saved.exactAreas ?? []);
    setExactSource(saved.exactSource ?? null);
    setStep(saved.step);
    setExpandedPreviewIds(new Set(saved.previewData.map((_, idx) => `topic-${idx}`)));
    draft.accept();
  };

  // Escape asks before discarding, and never interrupts a running parse.
  useEscapeKey(isOpen && !isBusy, guard.requestClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  const handleParseOutcomes = async () => {
    if (!outcomesText.trim()) return;
    setIsParsingOutcomes(true);
    setError(null);
    try {
      const parsed = await parseOutcomesFromText(outcomesText);
      // Replacing the list would drop the outcomes NESA read for the focus areas
      // already added, while those areas still went into the import.
      setParsedOutcomes(mergeOutcomesByCode(exactOutcomes, parsed));
      if (parsed.length === 0) {
        setError(
          'No outcomes were found in that text. Check it includes outcome codes (e.g. SE-11-01) with their descriptions, then parse again.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the outcomes. Try again.');
    } finally {
      setIsParsingOutcomes(false);
    }
  };

  const handleAddTab = () => {
    const newId = generateId('tab');
    const newName = `Topic ${topicTabs.length + 1}`;
    setTopicTabs([...topicTabs, { id: newId, name: newName, content: '' }]);
    setActiveTabId(newId);
  };

  const handleRemoveTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (topicTabs.length === 1) return;

    const newTabs = topicTabs.filter((t) => t.id !== id);
    setTopicTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const handleUpdateTab = (field: 'name' | 'content', value: string) => {
    setTopicTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, [field]: value } : t)));
  };

  const tabsFromTopics = (topics: { name: string; content: string }[]): TopicTab[] =>
    topics.map((t) => ({ id: generateId('tab'), name: t.name, content: t.content }));

  /**
   * Why a NESA page cannot join the import, or null when it can.
   *
   * One import is one syllabus. A focus area from another syllabus would be
   * filed under this course's name, and the picker only offers focus areas of
   * the syllabus already in the import, so that case is refused here.
   */
  const exactProblem = (path: string, nesa: NesaPage): string | null => {
    if (exactAreas.some((area) => comparablePath(area.path) === comparablePath(path))) {
      return 'That focus area is already in this import.';
    }
    if (exactSource && exactSource.syllabus !== nesa.syllabus) {
      return `That page is from "${nesa.syllabus}", not "${exactSource.syllabus}". Start a new import for it, or remove the focus areas above first.`;
    }
    return null;
  };

  /**
   * Adds one focus area's exact structure and its outcomes to the import.
   *
   * The outcomes are merged by code, so two focus areas that both list an outcome
   * give one row, and the page's own title names the area when NESA sent no
   * title for the node.
   */
  const appendExactArea = (path: string, nesa: NesaPage, fallbackName: string) => {
    const built = nesaPageToPreviewNode(nesa);
    const node: PreviewNode = built.name
      ? built
      : { ...built, name: fallbackName.trim() || 'Untitled focus area' };
    const outcomes = nesaOutcomes(nesa);
    setExactAreas((prev) => [...prev, { path, node, outcomes }]);
    setParsedOutcomes((prev) => mergeOutcomesByCode(prev, outcomes));
  };

  const removeExactArea = (path: string) => {
    const removed = exactAreas.find((area) => area.path === path);
    const remaining = exactAreas.filter((area) => area.path !== path);
    setExactAreas(remaining);
    // Without any focus areas left there is no syllabus for the picker to draw
    // from, so the source goes too.
    if (remaining.length === 0) setExactSource(null);
    if (removed) {
      const stillHeld = remaining.flatMap((area) => area.outcomes);
      setParsedOutcomes((prev) => outcomesWithoutRemoved(prev, removed.outcomes, stillHeld));
    }
    setSiblingNotice(null);
  };

  const setSiblingsSelected = (paths: string[], selected: boolean) =>
    setSelectedSiblings((prev) => {
      const next = new Set(prev);
      paths.forEach((path) => (selected ? next.add(path) : next.delete(path)));
      return next;
    });

  /**
   * Reads each chosen focus area in turn and adds it.
   *
   * One at a time, because the reader is the slow part and a page that fails
   * must not stop the rest. A failure is reported by name, and its box stays
   * ticked so it can be tried again without ticking everything once more.
   */
  const handleAddSelected = async () => {
    const chosen = pendingChoices;
    if (chosen.length === 0) return;
    setSiblingNotice(null);
    const failed: { path: string; label: string; reason: string }[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const choice = chosen[i];
      setSiblingProgress({ done: i + 1, total: chosen.length });
      try {
        const page = await fetchSyllabusPage(choice.path);
        if (page.nesa && hasNesaStatements(page.nesa)) {
          appendExactArea(choice.path, page.nesa, choice.title);
        } else {
          failed.push({
            path: choice.path,
            label: choice.title || choice.path,
            // A focus area such as Collaborative Investigation describes a task and
            // lists no content statements, so there is nothing to import from it.
            reason: 'the page has no content statements to import',
          });
        }
      } catch (err) {
        failed.push({
          path: choice.path,
          label: choice.title || choice.path,
          reason: err instanceof Error ? err.message : 'the page could not be read',
        });
      }
    }
    setSiblingProgress(null);
    setSelectedSiblings(new Set(failed.map((f) => f.path)));
    if (failed.length > 0) {
      setSiblingNotice(
        `${failed.length} of ${chosen.length} ${chosen.length === 1 ? 'page' : 'pages'} could not be added: ${failed
          .map((f) => `${f.label} (${f.reason})`)
          .join('; ')}.`
      );
    }
  };

  const handleFetchFromUrl = async (normalisedUrl: string) => {
    setIsFetchingUrl(true);
    setUrlError(null);
    try {
      const page = await fetchSyllabusPage(normalisedUrl);
      /**
       * NESA's own structure, when the reader found it, is used as it stands.
       *
       * Its wording is NESA's, so there is nothing for an AI to read. Sending it
       * would paraphrase the dot points and drop their sub-points, for a paid call.
       * The AI path below is only for a page that came without a structure.
       */
      if (page.nesa && hasNesaStatements(page.nesa)) {
        const nesa = page.nesa;
        const problem = exactProblem(normalisedUrl, nesa);
        if (problem) throw new Error(problem);
        if (exactAreas.length === 0) {
          // The first focus area decides what this import is: its year, and the
          // syllabus the rest of the picker is drawn from.
          if (nesa.year) setYear(nesa.year);
          setExactSource({ syllabus: nesa.syllabus, siblings: nesa.siblings });
        }
        if (!targetCourse && !courseName.trim()) {
          const suggested = courseNameFromSyllabus(nesa.syllabus);
          if (suggested) setCourseName(suggested);
        }
        appendExactArea(normalisedUrl, nesa, nesa.title);
        setSiblingNotice(null);
        setUrlInput('');
        return;
      }
      // Use AI to "read" the webpage via search grounding, then split it into
      // one editable tab per topic (falling back to a single tab).
      const content = page.text.trim();
      if (content.length < 80) {
        throw new Error(
          "Couldn't read any syllabus content from that URL — some pages block automated readers. Open the page yourself and paste the topic text into a tab instead."
        );
      }
      setUrlInput('');
      const topics = await splitSyllabusIntoTopics(content).catch(() => []);
      if (topics.length > 1) {
        const newTabs = tabsFromTopics(topics);
        setTopicTabs(newTabs);
        setActiveTabId(newTabs[0].id);
      } else {
        handleUpdateTab('content', content);
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Could not read that page. Try again.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Split the active tab's pasted text into one tab per detected topic.
  const handleSplitActiveTab = async () => {
    if (!activeTab.content.trim()) return;
    setIsSplitting(true);
    setError(null);
    try {
      const topics = await splitSyllabusIntoTopics(activeTab.content);
      if (topics.length <= 1) {
        setError(
          'Could not detect multiple topics in this tab. Add clear topic headings, or split it manually.'
        );
        return;
      }
      const newTabs = tabsFromTopics(topics);
      setTopicTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === activeTabId);
        const copy = [...prev];
        copy.splice(idx === -1 ? prev.length : idx, idx === -1 ? 0 : 1, ...newTabs);
        return copy;
      });
      setActiveTabId(newTabs[0].id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not split the text into topics. Try again.'
      );
    } finally {
      setIsSplitting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!targetCourseId && !courseName.trim()) {
      setError('Enter a course name.');
      return;
    }

    /**
     * A second course with the same name is a trap, not a duplicate.
     *
     * Import matching pairs courses BY NAME, so two called "HSC Biology" make
     * every later import ambiguous and split a subject's content across two
     * entries that look identical in every picker. `CourseCreatorModal` has
     * refused this since it was written; this path — the one seeding actually
     * uses — did not, and merging is one dropdown away.
     */
    if (!targetCourseId) {
      const clash = courses.find(
        (c) => c.name.trim().toLowerCase() === courseName.trim().toLowerCase()
      );
      if (clash) {
        setError(
          `A course named "${clash.name}" already exists. Choose it under "Import Into" to add this syllabus to it, or use a different name.`
        );
        return;
      }
    }

    // Filter out empty tabs
    const validTabs = topicTabs.filter((t) => t.content.trim().length > 0);
    if (validTabs.length === 0 && exactAreas.length === 0) {
      setError('Enter syllabus content for at least one topic.');
      return;
    }

    // With no pasted text there is nothing for the AI to read. The focus areas
    // NESA read are the whole import, so they go straight to the preview.
    if (validTabs.length === 0) {
      setError(null);
      setPreviewData(exactNodes);
      setStep('preview');
      setExpandedPreviewIds(new Set(exactNodes.map((_t, idx) => `topic-${idx}`)));
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysed({ done: 0, total: validTabs.length });

    try {
      // Analyse each topic independently and resiliently: one failed/garbled
      // topic must not lose the rest of the import.
      const results = await Promise.allSettled(
        validTabs.map((tab) =>
          parseSyllabusStructure(`Topic Name: ${tab.name}\n\n${tab.content}`).finally(() =>
            setAnalysed((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
          )
        )
      );

      // The exact focus areas lead, ahead of whatever the pasted tabs produced.
      const aggregatedPreview: PreviewNode[] = [...exactNodes];
      const failedTabs: string[] = [];
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value.length > 0) {
          aggregatedPreview.push(...res.value);
        } else {
          failedTabs.push(validTabs[idx].name);
        }
      });

      if (aggregatedPreview.length === 0) {
        throw new Error(
          'No structure could be extracted. Try cleaner text, or split very large topics.'
        );
      }

      setPreviewData(aggregatedPreview);
      setStep('preview');

      // Surface partial failures without blocking the rest of the import.
      setError(
        failedTabs.length > 0
          ? `Couldn't parse: ${failedTabs.join(', ')}. The rest is ready below — review and import.`
          : null
      );

      // Auto expand all topics initially
      const initialExpand = new Set<string>();
      aggregatedPreview.forEach((_t, idx) => initialExpand.add(`topic-${idx}`));
      setExpandedPreviewIds(initialExpand);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not analyse the syllabus. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * --- Editable preview: fix AI mistakes before they become content ---
   *
   * Pruning was the only option, which meant a topic the parser named
   * "Module 5 – 5 Module" had to be imported wrong and renamed afterwards, and
   * a dot point with a mangled clause had to be deleted and retyped in the
   * Vault. Both are the text that later drives question generation, so getting
   * them right HERE is worth more than anywhere else in the workflow.
   */
  const renameTopic = (tIdx: number, name: string) =>
    setPreviewData((prev) => prev.map((t, i) => (i === tIdx ? { ...t, name } : t)));

  const renameSubTopic = (tIdx: number, stIdx: number, name: string) =>
    setPreviewData((prev) =>
      prev.map((t, i) =>
        i === tIdx
          ? { ...t, subTopics: t.subTopics.map((st, j) => (j === stIdx ? { ...st, name } : st)) }
          : t
      )
    );

  const editDotPoint = (tIdx: number, stIdx: number, dpIdx: number, text: string) =>
    setPreviewData((prev) =>
      prev.map((t, i) =>
        i === tIdx
          ? {
              ...t,
              subTopics: t.subTopics.map((st, j) =>
                j === stIdx
                  ? { ...st, dotPoints: st.dotPoints.map((dp, k) => (k === dpIdx ? text : dp)) }
                  : st
              ),
            }
          : t
      )
    );

  const removeTopic = (tIdx: number) => setPreviewData((prev) => prev.filter((_, i) => i !== tIdx));

  const removeSubTopic = (tIdx: number, stIdx: number) =>
    setPreviewData((prev) =>
      prev.map((t, i) =>
        i === tIdx ? { ...t, subTopics: t.subTopics.filter((_, j) => j !== stIdx) } : t
      )
    );

  const removeDotPoint = (tIdx: number, stIdx: number, dpIdx: number) =>
    setPreviewData((prev) =>
      prev.map((t, i) =>
        i === tIdx
          ? {
              ...t,
              subTopics: t.subTopics.map((st, j) =>
                j === stIdx ? { ...st, dotPoints: st.dotPoints.filter((_, k) => k !== dpIdx) } : st
              ),
            }
          : t
      )
    );

  const previewStats = useMemo(
    () => ({
      topics: previewData.length,
      subTopics: previewData.reduce((a, t) => a + t.subTopics.length, 0),
      dotPoints: previewData.reduce(
        (a, t) => a + t.subTopics.reduce((b, st) => b + st.dotPoints.length, 0),
        0
      ),
    }),
    [previewData]
  );

  const handleConfirmImport = () => {
    if (previewData.length === 0) return;
    // Names are editable now, so they can be edited to nothing. Trim on the way
    // out and refuse a blank one rather than creating a topic called "" that is
    // unselectable in every picker afterwards. Emptied dot points are simply
    // dropped — a blank line is the same as a deleted one.
    const cleaned: PreviewNode[] = previewData.map((t) => ({
      ...t,
      name: t.name.trim(),
      subTopics: t.subTopics.map((st) => ({
        ...st,
        name: st.name.trim(),
        dotPoints: st.dotPoints.map((dp) => dp.trim()).filter(Boolean),
      })),
    }));
    const blank = cleaned.find((t) => !t.name || t.subTopics.some((st) => !st.name));
    if (blank) {
      setError(
        `Every topic and sub-topic needs a name — check "${blank.name || 'the unnamed topic'}".`
      );
      return;
    }
    draft.complete();
    onImport(
      effectiveCourseName,
      cleaned,
      parsedOutcomes,
      targetCourseId ?? undefined,
      targetTopicId ?? undefined,
      year
    );
    handleClose();
  };

  const togglePreviewExpand = (id: string) => {
    const newSet = new Set(expandedPreviewIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedPreviewIds(newSet);
  };

  if (!isOpen) return null;

  return (
    <div className={CREATOR_BACKDROP} onClick={guard.requestCloseFromBackdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="syllabus-import-title"
        className={`${CREATOR_SHELL} max-w-6xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>
              {effectiveCourseName || 'A new course'} · {yearShortLabel(year)}
            </p>
            <h2 id="syllabus-import-title" className={CREATOR_TITLE}>
              Import a syllabus
            </h2>
          </div>
          <button
            type="button"
            onClick={guard.requestClose}
            aria-label="Close"
            className={CREATOR_CLOSE}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Content. Not CREATOR_BODY: step one is a topic builder with its own
            panes, and each block carries its own padding. This region scrolls
            at every width, so a short window shows the whole builder by
            scrolling rather than by clipping its editor. */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar">
          {/* Step 1: Input */}
          {draft.offered && (
            <DraftRestoreBanner
              savedAt={draft.offered.savedAt}
              summary={
                draft.offered.value.previewData.length > 0
                  ? `${draft.offered.value.previewData.length} analysed topics for "${draft.offered.value.courseName || 'an existing course'}"`
                  : `syllabus text for "${draft.offered.value.courseName || 'an existing course'}"`
              }
              onRestore={restoreDraft}
              onDismiss={draft.dismiss}
            />
          )}

          {step === 'input' && (
            <div className="flex flex-col animate-fade-in">
              {/* Top Controls */}
              <div className="p-5 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-5 flex-shrink-0">
                {/* Destination */}
                <div className="space-y-2">
                  <label
                    htmlFor="import-target"
                    className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800"
                  >
                    Import into
                  </label>
                  <select
                    id="import-target"
                    value={targetCourseId ?? '__new__'}
                    onChange={(e) =>
                      handleChangeTargetCourse(e.target.value === '__new__' ? null : e.target.value)
                    }
                    className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-slate-300 dark:border-white/15 rounded-lg py-2.5 px-4 min-h-11 sm:min-h-0 text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                  >
                    <option value="__new__">New course…</option>
                    {courses.length > 0 && (
                      <optgroup label="Merge into existing course">
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {targetCourse ? (
                    <>
                      {targetCourse.topics.length > 0 && (
                        <select
                          aria-label="Target topic"
                          value={targetTopicId ?? '__auto__'}
                          onChange={(e) =>
                            setTargetTopicId(e.target.value === '__auto__' ? null : e.target.value)
                          }
                          className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-slate-300 dark:border-white/15 rounded-lg py-2 px-4 text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                        >
                          <option value="__auto__">
                            Auto — match topic names / add new topics
                          </option>
                          <optgroup label="Add everything into one topic">
                            {targetCourse.topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                      <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 flex items-center gap-1.5">
                        <GitMerge className="w-3.5 h-3.5 text-[rgb(var(--color-accent))]" />
                        {targetTopic
                          ? `All sub-topics will be added to "${targetTopic.name}".`
                          : 'Topics with matching names will be merged; new ones added.'}
                      </p>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="New course name, e.g., HSC Software Engineering"
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-slate-300 dark:border-white/15 rounded-lg py-2.5 px-4 min-h-11 sm:min-h-0 text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                    />
                  )}
                  {/* A NESA document is one year's. Everything in this import
                      lands in the year chosen here — topics and outcomes. */}
                  <div
                    role="radiogroup"
                    aria-label="Syllabus year"
                    className="flex items-center gap-1 p-1 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100"
                  >
                    {SYLLABUS_YEARS.map((y) => (
                      <button
                        key={y.id}
                        type="button"
                        role="radio"
                        aria-checked={y.id === year}
                        onClick={() => setYear(y.id)}
                        className={`flex-1 py-1.5 px-3 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-colors ${
                          y.id === year
                            ? 'bg-[rgb(var(--color-bg-surface-light))] light:bg-white border-slate-300 dark:border-white/15 text-[rgb(var(--color-text-primary))] light:text-slate-900 shadow-sm'
                            : 'border-transparent text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900'
                        }`}
                      >
                        {y.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Outcomes */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    Import outcomes
                    <span className="ml-1.5 text-xs font-normal text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      (optional)
                    </span>
                  </label>
                  <div className="flex flex-col gap-2">
                    <textarea
                      rows={3}
                      value={outcomesText}
                      onChange={(e) => setOutcomesText(e.target.value)}
                      placeholder={`Paste outcomes text here, e.g.:\nSE-12-01 Describes methods used to plan…\nSE-12-02 Applies appropriate development…`}
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-slate-300 dark:border-white/15 rounded-lg py-2.5 px-4 min-h-11 sm:min-h-0 text-base sm:text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] resize-y min-h-[72px] leading-relaxed font-mono"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleParseOutcomes}
                        disabled={isParsingOutcomes || !outcomesText.trim()}
                        className="px-4 py-2 min-h-11 sm:min-h-0 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 border border-slate-300 dark:border-white/15 transition text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isParsingOutcomes ? 'Parsing…' : 'Parse with AI'}
                      </button>
                      {parsedOutcomes.length > 0 && (
                        <span className="text-xs text-green-400 light:text-green-700 font-medium">
                          {/* Says where they came from: beside an empty box, a bare
                              "10 outcomes found" read as the result of a paste. */}
                          {exactAreas.length > 0
                            ? `${parsedOutcomes.length} outcomes from NESA`
                            : `${parsedOutcomes.length} outcomes found`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-6 mb-4 pt-4 border-t border-slate-200 dark:border-white/10">
                <label className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                    Fetch from URL
                  </span>
                </label>
                <UrlFetchField
                  value={urlInput}
                  onChange={setUrlInput}
                  onFetch={handleFetchFromUrl}
                  onInvalid={setUrlError}
                  error={urlError}
                  isFetching={isFetchingUrl}
                  disabled={isFetchingUrl}
                  label="Syllabus page URL"
                  placeholder={NESA_URL_PLACEHOLDER}
                />
                <p className="mt-2 text-[10px] text-[rgb(var(--color-text-muted))]">
                  {NESA_HOST_HINT}
                </p>
              </div>

              {/* Focus areas NESA read exactly, and the picker for the rest of the
                  syllabus. It appears only once there is one, so an import pasted by
                  hand looks as it always has. */}
              {exactAreas.length > 0 && exactSource && (
                <section
                  aria-labelledby="nesa-exact-title"
                  className="mx-6 mb-4 rounded-xl border border-[rgb(var(--color-accent))]/30 bg-[rgb(var(--color-accent))]/5 p-4 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <CircleCheck
                      className="w-5 h-5 mt-0.5 flex-shrink-0 text-[rgb(var(--color-accent))]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h3
                        id="nesa-exact-title"
                        className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900"
                      >
                        Read from NESA — exact wording, no AI
                      </h3>
                      <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 break-words">
                        {exactSource.syllabus}
                      </p>
                    </div>
                  </div>

                  <ul aria-label="Focus areas in this import" className="space-y-1.5">
                    {exactAreas.map((area) => (
                      <li
                        key={area.path}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgb(var(--color-bg-surface))] light:bg-white border border-slate-200 dark:border-white/10"
                      >
                        <span className="flex-1 min-w-0 truncate text-sm font-medium text-[rgb(var(--color-text-primary))] light:text-slate-800">
                          {area.node.name}
                        </span>
                        <span className="flex-shrink-0 text-[10px] font-semibold text-[rgb(var(--color-text-secondary))] bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 px-2 py-0.5 rounded-full">
                          {yearShortLabel(area.node.year ?? year)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeExactArea(area.path)}
                          aria-label={`Remove ${area.node.name}`}
                          title="Remove focus area"
                          className="p-1.5 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg text-[rgb(var(--color-text-muted))] hover:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {exactSource.siblings.length > 0 && (
                    <fieldset className="space-y-2 pt-3 border-t border-slate-200 dark:border-white/10">
                      <legend className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1">
                        Add more from this syllabus
                      </legend>
                      {siblingGroups.length === 0 ? (
                        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600">
                          Every focus area of this syllabus is in the import.
                        </p>
                      ) : (
                        siblingGroups.map((group) => (
                          <div key={group.year} className="space-y-1">
                            <p className="text-[11px] font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-500">
                              {yearShortLabel(group.year)}
                            </p>
                            {group.items.map((item) => (
                              <label
                                key={item.path}
                                className="flex items-center gap-2 px-2 py-1.5 min-h-11 sm:min-h-0 rounded-lg cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-white/60"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSiblings.has(item.path)}
                                  onChange={(e) =>
                                    setSiblingsSelected([item.path], e.target.checked)
                                  }
                                  disabled={isBusy}
                                  className="w-4 h-4 flex-shrink-0 accent-[rgb(var(--color-accent))]"
                                />
                                <span className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                  {item.title || item.path}
                                </span>
                              </label>
                            ))}
                            {group.lists.map((list) => {
                              const allTicked = list.paths.every((p) => selectedSiblings.has(p));
                              const count = list.paths.length;
                              return (
                                <label
                                  key={`${group.year}:${list.optionsList}`}
                                  className="flex items-center gap-2 px-2 py-1.5 min-h-11 sm:min-h-0 rounded-lg cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-white/60"
                                >
                                  <input
                                    type="checkbox"
                                    checked={allTicked}
                                    onChange={(e) =>
                                      setSiblingsSelected(list.paths, e.target.checked)
                                    }
                                    disabled={isBusy}
                                    className="w-4 h-4 flex-shrink-0 accent-[rgb(var(--color-accent))]"
                                  />
                                  <span className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                    {`${list.optionsList || 'Elective focus areas'} · ${count} ${count === 1 ? 'option' : 'options'}`}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ))
                      )}
                      {siblingGroups.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={handleAddSelected}
                            disabled={isBusy || pendingChoices.length === 0}
                            className="px-3 py-2 min-h-11 sm:min-h-0 rounded-lg text-xs font-bold bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/20 hover:bg-[rgb(var(--color-accent))]/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {pendingChoices.length > 0
                              ? `Add selected (${pendingChoices.length})`
                              : 'Add selected'}
                          </button>
                        </div>
                      )}
                    </fieldset>
                  )}

                  {siblingNotice && (
                    <p
                      role="alert"
                      className="text-red-400 light:text-red-600 text-xs bg-red-900/30 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200"
                    >
                      {siblingNotice}
                    </p>
                  )}
                </section>
              )}

              {/* Topic Builder Interface */}
              {/* A floor, not a height: the builder is as tall as its editor
                  needs, and never shorter than this, so the textarea is not
                  squeezed under the footer. */}
              <div className="flex flex-col md:flex-row md:min-h-[24rem] border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30">
                {/* Sidebar Tabs — horizontal scroll on mobile, vertical sidebar on desktop */}
                <div className="md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 overflow-x-auto md:overflow-x-visible md:overflow-y-auto bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100/50 flex md:flex-col">
                  <div className="p-2 md:p-3 flex-shrink-0">
                    <button
                      onClick={handleAddTab}
                      className="w-full py-2 px-3 min-h-11 sm:min-h-0 rounded-lg border border-dashed border-slate-300 dark:border-white/15 text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/5 transition-all text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" /> Add topic
                    </button>
                  </div>
                  <div className="flex md:flex-col flex-1 px-2 pb-2 md:pb-4 gap-1 md:gap-0 md:space-y-1">
                    {topicTabs.map((tab, index) => (
                      // The row is a container, and the two things you can do
                      // to it are buttons. It used to be a `<div onClick>`
                      // holding the delete button, so switching topic was
                      // mouse-only — no tab stop, no role, no key handler —
                      // and a `<button>` could not wrap it, because a button
                      // may not contain another one.
                      <div
                        key={tab.id}
                        className={`
                          group flex items-center justify-between px-3 py-2.5 rounded-lg transition-all flex-shrink-0
                          ${
                            activeTabId === tab.id
                              ? 'bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white text-white light:text-slate-900 shadow-sm border border-slate-300 dark:border-white/15'
                              : 'text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-white/50 hover:text-[rgb(var(--color-text-secondary))] light:hover:text-slate-700 border border-transparent'
                          }
                        `}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveTabId(tab.id)}
                          aria-current={activeTabId === tab.id ? 'true' : undefined}
                          className="flex items-center gap-2 min-w-0 min-h-11 sm:min-h-0 flex-1 text-left cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-lg bg-black/20 light:bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-300 light:text-slate-600">
                            {index + 1}
                          </span>
                          <span className="truncate text-sm font-medium whitespace-nowrap">
                            {tab.name || 'Untitled Topic'}
                          </span>
                        </button>
                        {topicTabs.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveTab(tab.id, e)}
                            // `text-transparent` until the row is hovered hid
                            // this from a keyboard user completely: they could
                            // tab onto a control they could not see. It shows
                            // on focus as well as on hover now, and says what
                            // it removes rather than relying on a `title`.
                            className="p-1 rounded-lg hover:bg-red-500/20 light:hover:bg-red-50 text-transparent group-hover:text-red-400 light:group-hover:text-red-500 focus-visible:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors ml-2"
                            aria-label={`Remove ${tab.name || 'Untitled Topic'}`}
                            title="Remove Topic"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content Editor Area */}
                <div className="flex-1 flex flex-col p-4 md:p-5 overflow-hidden bg-[rgb(var(--color-bg-surface))]/30 light:bg-white min-h-0">
                  <div className="mb-4 p-3.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-slate-200 dark:border-white/10">
                    <label className="t-label block text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2">
                      Topic name
                    </label>
                    <input
                      type="text"
                      value={activeTab.name}
                      onChange={(e) => handleUpdateTab('name', e.target.value)}
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-slate-300 dark:border-white/15 rounded-lg py-2.5 px-4 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <label className="t-label block text-[rgb(var(--color-text-muted))] light:text-slate-500">
                        Syllabus content
                      </label>
                      <button
                        onClick={handleSplitActiveTab}
                        disabled={isBusy || !activeTab.content.trim()}
                        title="Use AI to split this text into one tab per topic"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/20 hover:bg-[rgb(var(--color-accent))]/20 transition disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Auto-split topics
                      </button>
                    </div>
                    <textarea
                      value={activeTab.content}
                      onChange={(e) => handleUpdateTab('content', e.target.value)}
                      placeholder={`Paste dot points, sub-topics, or raw text here…\n\ne.g.:\nInquiry Question 1\n• describes the features of…\n• outlines the importance of…`}
                      className="flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] border border-slate-300 dark:border-white/15 rounded-xl p-4 text-base sm:text-sm font-mono text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))]/60 light:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-none leading-relaxed min-h-[140px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview Tree */}
          {step === 'preview' && (
            <div className="animate-fade-in p-6">
              <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                <div className="t-label px-4 py-2.5 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 border-b border-slate-200 dark:border-white/10 text-[rgb(var(--color-text-muted))] light:text-slate-500 flex flex-wrap justify-between items-center gap-x-3 gap-y-1">
                  <span>
                    {targetCourse ? `Merge into "${targetCourse.name}"` : 'Structure preview'}
                  </span>
                  <span className="bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full normal-case font-semibold">
                    {previewStats.topics} {previewStats.topics === 1 ? 'topic' : 'topics'} ·{' '}
                    {previewStats.subTopics}{' '}
                    {previewStats.subTopics === 1 ? 'sub-topic' : 'sub-topics'} ·{' '}
                    {previewStats.dotPoints}{' '}
                    {previewStats.dotPoints === 1 ? 'dot point' : 'dot points'}
                  </span>
                </div>
                {previewData.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Nothing left to import. Go back to add or re-analyse content.
                  </div>
                ) : (
                  <div className="p-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                    {previewData.map((topic, tIdx) => {
                      const topicId = `topic-${tIdx}`;
                      const isExpanded = expandedPreviewIds.has(topicId);

                      return (
                        <div key={tIdx} className="mb-2 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 transition">
                            <button
                              onClick={() => togglePreviewExpand(topicId)}
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
                              className="flex items-center gap-2 p-2 text-left flex-shrink-0"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <Folder className="w-4 h-4 text-purple-400 light:text-purple-500 flex-shrink-0" />
                            </button>
                            <input
                              value={topic.name}
                              onChange={(e) => renameTopic(tIdx, e.target.value)}
                              aria-label={`Topic ${tIdx + 1} name`}
                              className="flex-1 min-w-0 bg-transparent font-bold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 rounded-lg px-1.5 py-1 border border-transparent hover:border-slate-300 dark:hover:border-white/15 focus:outline-none focus:border-[rgb(var(--color-accent))] focus:bg-[rgb(var(--color-bg-surface-light))] light:focus:bg-white"
                            />
                            {/* Shown only when the source names a year, so a topic
                                that takes the import's year is not labelled at all. */}
                            {topic.year && (
                              <span className="flex-shrink-0 text-[10px] font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 border border-[rgb(var(--color-accent))]/20 px-2 py-0.5 rounded-full">
                                {yearShortLabel(topic.year)}
                              </span>
                            )}
                            <span className="flex-shrink-0 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
                              {topic.subTopics?.length || 0} sub-topics
                            </span>
                            <button
                              onClick={() => removeTopic(tIdx)}
                              className="p-1.5 mr-1 rounded-lg text-transparent group-hover:text-red-400 light:group-hover:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                              title="Remove topic"
                              aria-label={`Remove topic ${topic.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="ml-6 pl-2 border-l border-slate-200 dark:border-white/10 mt-1 space-y-1">
                              {(topic.subTopics || []).map((st, stIdx) => (
                                <div key={stIdx} className="py-1">
                                  <div className="group/st flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-slate-100">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 light:bg-indigo-400 flex-shrink-0"></div>
                                    <input
                                      value={st.name}
                                      onChange={(e) => renameSubTopic(tIdx, stIdx, e.target.value)}
                                      aria-label={`Sub-topic ${stIdx + 1} name`}
                                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 rounded-lg px-1.5 py-0.5 border border-transparent hover:border-slate-300 dark:hover:border-white/15 focus:outline-none focus:border-[rgb(var(--color-accent))] focus:bg-[rgb(var(--color-bg-surface-light))] light:focus:bg-white"
                                    />
                                    <button
                                      onClick={() => removeSubTopic(tIdx, stIdx)}
                                      className="p-1 rounded-lg text-transparent group-hover/st:text-red-400 light:group-hover/st:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                                      title="Remove sub-topic"
                                      aria-label={`Remove sub-topic ${st.name}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                  {st.dotPoints && st.dotPoints.length > 0 && (
                                    <div className="ml-5 mt-1 space-y-0.5">
                                      {st.dotPoints.map((dp, dpIdx) => (
                                        <div
                                          key={dpIdx}
                                          className="group/dp flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100"
                                        >
                                          <span className="mt-2 w-1 h-1 rounded-full bg-gray-600 light:bg-slate-400 flex-shrink-0"></span>
                                          <textarea
                                            value={dp}
                                            onChange={(e) =>
                                              editDotPoint(tIdx, stIdx, dpIdx, e.target.value)
                                            }
                                            rows={1}
                                            // Grown to its text: at one row, most NESA dot points
                                            // showed only their first line, and on a phone a few words.
                                            ref={autoSize}
                                            onInput={(e) => autoSize(e.currentTarget)}
                                            aria-label={`Dot point ${dpIdx + 1}`}
                                            className="flex-1 min-w-0 bg-transparent resize-none overflow-hidden rounded-lg px-1.5 py-0.5 border border-transparent hover:border-slate-300 dark:hover:border-white/15 focus:outline-none focus:border-[rgb(var(--color-accent))] focus:bg-[rgb(var(--color-bg-surface-light))] light:focus:bg-white text-[rgb(var(--color-text-dim))] light:text-slate-600"
                                          />
                                          <button
                                            onClick={() => removeDotPoint(tIdx, stIdx, dpIdx)}
                                            className="p-0.5 rounded-lg text-transparent group-hover/dp:text-red-400 light:group-hover/dp:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                                            title="Remove dot point"
                                            aria-label="Remove dot point"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 light:bg-blue-50 border border-blue-500/20 light:border-blue-200 text-xs text-blue-200 light:text-blue-700 flex items-start gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400 light:text-blue-500" />
                <p>
                  Every name and dot point here is editable. Fix them now, because this text is what
                  question generation reads. If content is missing, go back and clean up the raw
                  text before analysing again.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="mx-6 mt-4 text-red-400 light:text-red-600 text-sm bg-red-900/30 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200 animate-fade-in">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {guard.isConfirming ? (
          <DiscardConfirmBar
            summary={
              previewData.length > 0
                ? `this import — ${previewStats.topics} ${previewStats.topics === 1 ? 'topic' : 'topics'}, ${previewStats.dotPoints} ${previewStats.dotPoints === 1 ? 'dot point' : 'dot points'}`
                : 'the syllabus content you have entered'
            }
            onKeep={guard.cancelDiscard}
            onDiscard={guard.confirmDiscard}
          />
        ) : (
          <div className={CREATOR_FOOTER}>
            {step === 'input' ? (
              <>
                <button onClick={guard.requestClose} className={CREATOR_SECONDARY_BUTTON}>
                  Cancel
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={isBusy}
                  className={CREATOR_PRIMARY_BUTTON}
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalyzing
                    ? analysed && analysed.total > 1
                      ? `Analysing ${Math.min(analysed.done + 1, analysed.total)} of ${analysed.total}…`
                      : 'Analysing…'
                    : exactAreas.length > 0
                      ? 'Review import'
                      : 'Analyse syllabus'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('input')} className={CREATOR_SECONDARY_BUTTON}>
                  Back to edit
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={previewData.length === 0}
                  className={CREATOR_PRIMARY_BUTTON}
                >
                  {targetCourse ? (
                    <GitMerge className="w-4 h-4" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  {targetCourse ? `Merge into ${targetCourse.name}` : 'Import syllabus'}
                </button>
              </>
            )}
          </div>
        )}

        <AiBusyOverlay show={isBusy}>
          <LoadingIndicator
            // Reading a page is not an AI call; the card must not say "Working with Gemini".
            noAi={siblingProgress !== null || isFetchingUrl}
            task="enrichment"
            message={
              siblingProgress
                ? `Reading ${siblingProgress.done} of ${siblingProgress.total}…`
                : isFetchingUrl
                  ? 'Reading the syllabus page'
                  : isSplitting
                    ? 'Splitting the text into topics'
                    : isAnalyzing
                      ? 'Analysing the syllabus'
                      : 'Reading the outcomes'
            }
            messages={
              siblingProgress
                ? ['Fetching the next focus area', 'Keeping its wording exactly as NESA wrote it']
                : isFetchingUrl
                  ? ['Fetching the page', 'Finding the topic headings']
                  : isSplitting
                    ? ['Finding the topic headings', "Keeping each topic's text as written"]
                    : isAnalyzing
                      ? ['Reading each topic', 'Sorting it into sub-topics and dot points']
                      : [
                          'Reading the outcomes text',
                          'Picking out each outcome and the year it belongs to',
                        ]
            }
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default SyllabusImportModal;
