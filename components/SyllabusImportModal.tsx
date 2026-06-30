import React, { useState, useMemo } from 'react';
import { Course, CourseOutcome } from '../types';
import {
  parseOutcomesFromText,
  parseSyllabusStructure,
  fetchSyllabusContentFromUrl,
  splitSyllabusIntoTopics,
} from '../services/geminiService';
import type { SyllabusPreviewNode } from '../utils/dataManagerUtils';
import LoadingSpinner from './LoadingSpinner';
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
} from 'lucide-react';
import { generateId } from '../utils/idUtils';

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
    targetTopicId?: string
  ) => void;
}

interface TopicTab {
  id: string;
  name: string;
  content: string;
}

const SyllabusImportModal: React.FC<SyllabusImportModalProps> = ({
  isOpen,
  onClose,
  courses,
  onImport,
}) => {
  const [courseName, setCourseName] = useState('');
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

  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewNode[]>([]);
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);

  const activeTab = topicTabs.find((t) => t.id === activeTabId) || topicTabs[0];
  const targetCourse = targetCourseId ? courses.find((c) => c.id === targetCourseId) : undefined;
  const targetTopic = targetCourse?.topics.find((t) => t.id === targetTopicId);
  // The course name the import will actually use (existing course's name when merging).
  const effectiveCourseName = targetCourse ? targetCourse.name : courseName;
  const isBusy = isParsingOutcomes || isAnalyzing || isFetchingUrl || isSplitting;

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
    onClose();
  };

  const handleParseOutcomes = async () => {
    if (!outcomesText.trim()) return;
    setIsParsingOutcomes(true);
    setError(null);
    try {
      const parsed = await parseOutcomesFromText(outcomesText);
      setParsedOutcomes(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse outcomes.');
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

  const handleFetchFromUrl = async () => {
    if (!urlInput.trim()) return;
    setIsFetchingUrl(true);
    setError(null);
    try {
      // Use AI to "read" the webpage via search grounding, then split it into
      // one editable tab per topic (falling back to a single tab).
      const content = await fetchSyllabusContentFromUrl(urlInput);
      const topics = await splitSyllabusIntoTopics(content).catch(() => []);
      if (topics.length > 1) {
        const newTabs = tabsFromTopics(topics);
        setTopicTabs(newTabs);
        setActiveTabId(newTabs[0].id);
      } else {
        handleUpdateTab('content', content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch syllabus content.');
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
      setError(err instanceof Error ? err.message : 'Failed to split topics.');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!targetCourseId && !courseName.trim()) {
      setError('Course name is required.');
      return;
    }

    // Filter out empty tabs
    const validTabs = topicTabs.filter((t) => t.content.trim().length > 0);
    if (validTabs.length === 0) {
      setError('Please enter syllabus content for at least one topic.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Analyse each topic independently and resiliently: one failed/garbled
      // topic must not lose the rest of the import.
      const results = await Promise.allSettled(
        validTabs.map((tab) => parseSyllabusStructure(`Topic Name: ${tab.name}\n\n${tab.content}`))
      );

      const aggregatedPreview: PreviewNode[] = [];
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
      setError(err instanceof Error ? err.message : 'Failed to analyse syllabus structure.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Editable preview: let the user prune AI mistakes before importing ---
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
    onImport(
      effectiveCourseName,
      previewData,
      parsedOutcomes,
      targetCourseId ?? undefined,
      targetTopicId ?? undefined
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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-6xl border border-[rgb(var(--color-border-secondary))] clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">
                  Full Syllabus Import
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                  {step === 'input'
                    ? 'Construct your course structure.'
                    : 'Review the identified structure before importing.'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))] transition-colors" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-hidden flex flex-col">
          {/* Step 1: Input */}
          {step === 'input' && (
            <div className="flex flex-col h-full overflow-hidden animate-fade-in">
              {/* Top Controls */}
              <div className="p-6 pb-2 grid grid-cols-1 lg:grid-cols-2 gap-6 flex-shrink-0">
                <div>
                  <label
                    htmlFor="import-target"
                    className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2"
                  >
                    Import Into
                  </label>
                  <select
                    id="import-target"
                    value={targetCourseId ?? '__new__'}
                    onChange={(e) =>
                      handleChangeTargetCourse(e.target.value === '__new__' ? null : e.target.value)
                    }
                    className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                  >
                    <option value="__new__">➕ New course…</option>
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
                          className="mt-2 w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
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
                      <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
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
                      className="mt-2 w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">
                    Import Outcomes (Optional)
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      rows={1}
                      value={outcomesText}
                      onChange={(e) => setOutcomesText(e.target.value)}
                      placeholder="Paste list of outcomes..."
                      className="flex-grow bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] resize-none"
                    />
                    <button
                      onClick={handleParseOutcomes}
                      disabled={isParsingOutcomes || !outcomesText.trim()}
                      className="flex-shrink-0 px-4 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] hover:bg-[rgb(var(--color-bg-surface-elevated))] border border-[rgb(var(--color-border-secondary))] transition text-xs font-bold"
                    >
                      {isParsingOutcomes ? 'Parsing...' : 'Parse'}
                    </button>
                  </div>
                  {parsedOutcomes.length > 0 && (
                    <p className="text-xs text-green-400 mt-1 ml-1">
                      ✓ Found {parsedOutcomes.length} outcomes
                    </p>
                  )}
                </div>
              </div>

              <div className="mx-6 mb-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]">
                <label className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                    Fetch Syllabus from URL (Experimental)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://educationstandards.nsw.edu.au/..."
                    className="flex-grow bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                  />
                  <button
                    onClick={handleFetchFromUrl}
                    disabled={isFetchingUrl || !urlInput.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {isFetchingUrl ? (
                      <Sparkles className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isFetchingUrl ? 'Fetching...' : 'Fetch Content'}
                  </button>
                </div>
              </div>

              {/* Topic Builder Interface */}
              <div className="flex flex-1 overflow-hidden border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30">
                {/* Sidebar Tabs */}
                <div className="w-64 flex-shrink-0 border-r border-[rgb(var(--color-border-secondary))] overflow-y-auto bg-[rgb(var(--color-bg-surface-inset))]/50 flex flex-col">
                  <div className="p-3">
                    <button
                      onClick={handleAddTab}
                      className="w-full py-2 px-3 rounded-lg border border-dashed border-[rgb(var(--color-border-secondary))] text-[rgb(var(--color-text-muted))] hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/5 transition-all text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Topic
                    </button>
                  </div>
                  <div className="flex-1 px-2 pb-4 space-y-1">
                    {topicTabs.map((tab, index) => (
                      <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`
                                            group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all
                                            ${
                                              activeTabId === tab.id
                                                ? 'bg-[rgb(var(--color-bg-surface-elevated))] text-white shadow-sm border border-[rgb(var(--color-border-secondary))]'
                                                : 'text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-bg-surface-light))]/50 hover:text-[rgb(var(--color-text-secondary))] border border-transparent'
                                            }
                                        `}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex-shrink-0 w-5 h-5 rounded-md bg-black/20 flex items-center justify-center text-[10px] font-bold opacity-70">
                            {index + 1}
                          </span>
                          <span className="truncate text-sm font-medium">
                            {tab.name || 'Untitled Topic'}
                          </span>
                        </div>
                        {topicTabs.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveTab(tab.id, e)}
                            className="p-1 rounded hover:bg-red-500/20 text-transparent group-hover:text-red-400 transition-colors"
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
                <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[rgb(var(--color-bg-surface))]/30">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1.5">
                      Topic Name
                    </label>
                    <input
                      type="text"
                      value={activeTab.name}
                      onChange={(e) => handleUpdateTab('name', e.target.value)}
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2 px-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">
                        Paste Syllabus Content for "{activeTab.name}"
                      </label>
                      <button
                        onClick={handleSplitActiveTab}
                        disabled={isBusy || !activeTab.content.trim()}
                        title="Use AI to split this text into one tab per topic"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/20 hover:bg-[rgb(var(--color-accent))]/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Auto-split topics
                      </button>
                    </div>
                    <textarea
                      value={activeTab.content}
                      onChange={(e) => handleUpdateTab('content', e.target.value)}
                      placeholder="Paste dot points, sub-topics, or raw text here..."
                      className="flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview Tree */}
          {step === 'preview' && (
            <div className="animate-fade-in p-6 overflow-y-auto h-full">
              <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-[rgb(var(--color-bg-surface-elevated))] border-b border-[rgb(var(--color-border-secondary))] text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] flex justify-between items-center">
                  <span>
                    {targetCourse ? `Merge into "${targetCourse.name}"` : 'Structure Preview'}
                  </span>
                  <span>
                    {previewStats.topics} topics · {previewStats.subTopics} sub-topics ·{' '}
                    {previewStats.dotPoints} dot points
                  </span>
                </div>
                {previewData.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[rgb(var(--color-text-muted))]">
                    Nothing left to import. Go back to add or re-analyse content.
                  </div>
                ) : (
                  <div className="p-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                    {previewData.map((topic, tIdx) => {
                      const topicId = `topic-${tIdx}`;
                      const isExpanded = expandedPreviewIds.has(topicId);

                      return (
                        <div key={tIdx} className="mb-2 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] transition">
                            <button
                              onClick={() => togglePreviewExpand(topicId)}
                              className="flex-1 flex items-center gap-2 p-2 text-left min-w-0"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <Folder className="w-4 h-4 text-purple-400 flex-shrink-0" />
                              <span className="font-bold text-sm text-[rgb(var(--color-text-primary))] truncate">
                                {topic.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full">
                                {topic.subTopics?.length || 0} sub-topics
                              </span>
                            </button>
                            <button
                              onClick={() => removeTopic(tIdx)}
                              className="p-1.5 mr-1 rounded text-transparent group-hover:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
                              title="Remove topic"
                              aria-label={`Remove topic ${topic.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="ml-6 pl-2 border-l border-[rgb(var(--color-border-secondary))]/30 mt-1 space-y-1">
                              {(topic.subTopics || []).map((st, stIdx) => (
                                <div key={stIdx} className="py-1">
                                  <div className="group/st flex items-center gap-2 px-2 py-1 rounded hover:bg-[rgb(var(--color-bg-surface-light))]/50">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 flex-shrink-0"></div>
                                    <span className="text-sm font-medium text-[rgb(var(--color-text-secondary))] truncate">
                                      {st.name}
                                    </span>
                                    <button
                                      onClick={() => removeSubTopic(tIdx, stIdx)}
                                      className="ml-auto p-1 rounded text-transparent group-hover/st:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
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
                                          className="group/dp flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))] rounded hover:bg-[rgb(var(--color-bg-surface-light))]/40"
                                        >
                                          <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 flex-shrink-0"></span>
                                          <span className="flex-1">{dp}</span>
                                          <button
                                            onClick={() => removeDotPoint(tIdx, stIdx, dpIdx)}
                                            className="p-0.5 rounded text-transparent group-hover/dp:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
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
              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Review the structure and remove anything the AI got wrong (hover a row for the
                  delete button). If content is missing, go back and clean up the raw text before
                  re-analysing.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="mx-6 mt-4 text-red-400 text-sm bg-red-900/30 p-3 rounded-md animate-fade-in">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3 flex-shrink-0">
          {step === 'input' ? (
            <>
              <button
                onClick={handleClose}
                className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                disabled={isBusy}
                className="py-2.5 px-5 rounded-lg text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg transition disabled:opacity-50 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing ? 'Analysing All Topics...' : 'Analyse Syllabus'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('input')}
                className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
              >
                Back to Edit
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={previewData.length === 0}
                className="py-2.5 px-5 rounded-lg text-white font-semibold bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {targetCourse ? (
                  <GitMerge className="w-4 h-4" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                {targetCourse ? `Merge into ${targetCourse.name}` : 'Confirm & Import'}
              </button>
            </>
          )}
        </div>

        {isBusy && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
            <LoadingSpinner
              message={
                isFetchingUrl
                  ? 'Visiting URL & splitting into topics...'
                  : isSplitting
                    ? 'Splitting into topics...'
                    : isAnalyzing
                      ? 'Analysing Syllabus Structure...'
                      : 'Parsing Outcomes...'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SyllabusImportModal;
