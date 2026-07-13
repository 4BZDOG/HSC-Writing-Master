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
import { useEscapeKey } from '../hooks/useEscapeKey';

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

  // Escape closes this modal like every other modal surface — through the
  // same reset path as the X/Cancel buttons, and never mid-operation.
  useEscapeKey(isOpen && !isBusy, handleClose);

  const handleParseOutcomes = async () => {
    if (!outcomesText.trim()) return;
    setIsParsingOutcomes(true);
    setError(null);
    try {
      const parsed = await parseOutcomesFromText(outcomesText);
      setParsedOutcomes(parsed);
      if (parsed.length === 0) {
        setError(
          'No outcomes were found in that text. Check it includes outcome codes (e.g. SE-11-01) with their descriptions, then parse again.'
        );
      }
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
    // Validate before spending an AI call: accept bare domains by assuming
    // https, but reject anything that still isn't a fetchable web address.
    let normalisedUrl = urlInput.trim();
    if (!/^https?:\/\//i.test(normalisedUrl)) normalisedUrl = `https://${normalisedUrl}`;
    try {
      const candidate = new URL(normalisedUrl);
      if (!candidate.hostname.includes('.')) throw new Error('no hostname');
    } catch {
      setError(
        'That does not look like a valid web address. Paste the full NESA syllabus page URL, e.g. https://educationstandards.nsw.edu.au/...'
      );
      return;
    }
    setIsFetchingUrl(true);
    setError(null);
    try {
      // Use AI to "read" the webpage via search grounding, then split it into
      // one editable tab per topic (falling back to a single tab).
      const content = (await fetchSyllabusContentFromUrl(normalisedUrl)).trim();
      if (content.length < 80) {
        throw new Error(
          "Couldn't read any syllabus content from that URL — some pages block automated readers. Open the page yourself and paste the topic text into a tab instead."
        );
      }
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
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-6xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Full Syllabus Import
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {step === 'input'
                    ? 'Construct your course structure.'
                    : 'Review the identified structure before importing.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-hidden flex flex-col">
          {/* Step 1: Input */}
          {step === 'input' && (
            <div className="flex flex-col h-full overflow-hidden animate-fade-in">
              {/* Top Controls */}
              <div className="p-5 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-5 flex-shrink-0">
                {/* Destination */}
                <div className="space-y-2">
                  <label
                    htmlFor="import-target"
                    className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800"
                  >
                    Import Into
                  </label>
                  <select
                    id="import-target"
                    value={targetCourseId ?? '__new__'}
                    onChange={(e) =>
                      handleChangeTargetCourse(e.target.value === '__new__' ? null : e.target.value)
                    }
                    className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                  >
                    <option value="__new__">+ New course...</option>
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
                          className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
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
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                    />
                  )}
                </div>

                {/* Outcomes */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    Import Outcomes
                    <span className="ml-1.5 text-xs font-normal text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      (optional)
                    </span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <textarea
                      rows={2}
                      value={outcomesText}
                      onChange={(e) => setOutcomesText(e.target.value)}
                      placeholder="Paste outcomes text here (e.g. SE-12-01 Describes methods...)"
                      className="flex-grow bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] resize-none leading-relaxed"
                    />
                    <button
                      onClick={handleParseOutcomes}
                      disabled={isParsingOutcomes || !outcomesText.trim()}
                      className="flex-shrink-0 px-4 py-2 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 transition text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-stretch"
                    >
                      {isParsingOutcomes ? 'Parsing...' : 'Parse'}
                    </button>
                  </div>
                  {parsedOutcomes.length > 0 && (
                    <p className="text-xs text-green-400 light:text-green-600 ml-1 font-medium">
                      Found {parsedOutcomes.length} outcomes
                    </p>
                  )}
                </div>
              </div>

              <div className="mx-6 mb-4 pt-4 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200">
                <label className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                    Fetch Syllabus from URL
                    <span className="text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-400 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-1.5 py-0.5 rounded-full normal-case">
                      experimental
                    </span>
                  </span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://educationstandards.nsw.edu.au/..."
                    className="flex-grow bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                  />
                  <button
                    onClick={handleFetchFromUrl}
                    disabled={isFetchingUrl || !urlInput.trim()}
                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 light:bg-blue-500 light:hover:bg-blue-600 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 flex-shrink-0"
                  >
                    <Sparkles className={`w-4 h-4 ${isFetchingUrl ? 'animate-spin' : ''}`} />
                    {isFetchingUrl ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
              </div>

              {/* Topic Builder Interface */}
              <div className="flex flex-col md:flex-row flex-1 overflow-hidden border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50">
                {/* Sidebar Tabs — horizontal scroll on mobile, vertical sidebar on desktop */}
                <div className="md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto md:overflow-x-visible md:overflow-y-auto bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100/50 flex md:flex-col">
                  <div className="p-2 md:p-3 flex-shrink-0">
                    <button
                      onClick={handleAddTab}
                      className="w-full py-2 px-3 rounded-lg border border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/5 transition-all text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" /> Add Topic
                    </button>
                  </div>
                  <div className="flex md:flex-col flex-1 px-2 pb-2 md:pb-4 gap-1 md:gap-0 md:space-y-1">
                    {topicTabs.map((tab, index) => (
                      <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`
                          group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all flex-shrink-0
                          ${
                            activeTabId === tab.id
                              ? 'bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white text-white light:text-slate-900 shadow-sm border border-[rgb(var(--color-border-secondary))] light:border-slate-300'
                              : 'text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-white/50 hover:text-[rgb(var(--color-text-secondary))] light:hover:text-slate-700 border border-transparent'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex-shrink-0 w-5 h-5 rounded-md bg-black/20 light:bg-slate-200 flex items-center justify-center text-[10px] font-bold opacity-70 light:opacity-100 light:text-slate-500">
                            {index + 1}
                          </span>
                          <span className="truncate text-sm font-medium whitespace-nowrap">
                            {tab.name || 'Untitled Topic'}
                          </span>
                        </div>
                        {topicTabs.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveTab(tab.id, e)}
                            className="p-1 rounded hover:bg-red-500/20 light:hover:bg-red-50 text-transparent group-hover:text-red-400 light:group-hover:text-red-500 transition-colors ml-2"
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
                <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden bg-[rgb(var(--color-bg-surface))]/30 light:bg-white min-h-0">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-1.5">
                      Topic Name
                    </label>
                    <input
                      type="text"
                      value={activeTab.name}
                      onChange={(e) => handleUpdateTab('name', e.target.value)}
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2 px-4 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider">
                        Paste Syllabus Content for &ldquo;{activeTab.name}&rdquo;
                      </label>
                      <button
                        onClick={handleSplitActiveTab}
                        disabled={isBusy || !activeTab.content.trim()}
                        title="Use AI to split this text into one tab per topic"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/20 hover:bg-[rgb(var(--color-accent))]/20 transition disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Auto-split topics
                      </button>
                    </div>
                    <textarea
                      value={activeTab.content}
                      onChange={(e) => handleUpdateTab('content', e.target.value)}
                      placeholder="Paste dot points, sub-topics, or raw text here..."
                      className="flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg p-4 text-sm font-mono text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))] light:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-none leading-relaxed min-h-[120px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview Tree */}
          {step === 'preview' && (
            <div className="animate-fade-in p-6 overflow-y-auto h-full">
              <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 flex justify-between items-center">
                  <span>
                    {targetCourse ? `Merge into "${targetCourse.name}"` : 'Structure Preview'}
                  </span>
                  <span className="bg-[rgb(var(--color-bg-surface-inset))] light:bg-white px-2 py-0.5 rounded-full normal-case font-semibold">
                    {previewStats.topics} topics · {previewStats.subTopics} sub-topics ·{' '}
                    {previewStats.dotPoints} dot points
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
                              className="flex-1 flex items-center gap-2 p-2 text-left min-w-0"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <Folder className="w-4 h-4 text-purple-400 light:text-purple-500 flex-shrink-0" />
                              <span className="font-bold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 truncate">
                                {topic.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
                                {topic.subTopics?.length || 0} sub-topics
                              </span>
                            </button>
                            <button
                              onClick={() => removeTopic(tIdx)}
                              className="p-1.5 mr-1 rounded text-transparent group-hover:text-red-400 light:group-hover:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                              title="Remove topic"
                              aria-label={`Remove topic ${topic.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="ml-6 pl-2 border-l border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 mt-1 space-y-1">
                              {(topic.subTopics || []).map((st, stIdx) => (
                                <div key={stIdx} className="py-1">
                                  <div className="group/st flex items-center gap-2 px-2 py-1 rounded hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-slate-100">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 light:bg-indigo-400 flex-shrink-0"></div>
                                    <span className="text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 truncate">
                                      {st.name}
                                    </span>
                                    <button
                                      onClick={() => removeSubTopic(tIdx, stIdx)}
                                      className="ml-auto p-1 rounded text-transparent group-hover/st:text-red-400 light:group-hover/st:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
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
                                          className="group/dp flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600 rounded hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100"
                                        >
                                          <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 light:bg-slate-400 flex-shrink-0"></span>
                                          <span className="flex-1">{dp}</span>
                                          <button
                                            onClick={() => removeDotPoint(tIdx, stIdx, dpIdx)}
                                            className="p-0.5 rounded text-transparent group-hover/dp:text-red-400 light:group-hover/dp:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
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
                  Review the structure and remove anything the AI got wrong (hover a row for the
                  delete button). If content is missing, go back and clean up the raw text before
                  re-analysing.
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
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
          {step === 'input' ? (
            <>
              <button
                onClick={handleClose}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                disabled={isBusy}
                className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing ? 'Analysing All Topics...' : 'Analyse Syllabus'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('input')}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Back to Edit
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={previewData.length === 0}
                className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg active:scale-[0.98] transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
