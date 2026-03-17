
import React, { useState, useMemo } from 'react';
import { CourseOutcome } from '../types';
import { parseOutcomesFromText, parseSyllabusStructure, fetchSyllabusContentFromUrl } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { Sparkles, X, FileText, UploadCloud, ChevronRight, Folder, Hash, Plus, Trash2, Globe } from 'lucide-react';
import { generateId } from '../utils/idUtils';

interface PreviewNode {
    name: string;
    subTopics: {
        name: string;
        dotPoints: string[];
    }[];
}

interface SyllabusImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Updated signature to accept structured data
  onImport: (courseName: string, structure: PreviewNode[], outcomes: CourseOutcome[]) => void;
}

interface TopicTab {
    id: string;
    name: string;
    content: string;
}

const SyllabusImportModal: React.FC<SyllabusImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [courseName, setCourseName] = useState('');
  const [outcomesText, setOutcomesText] = useState('');
  const [parsedOutcomes, setParsedOutcomes] = useState<CourseOutcome[]>([]);
  const [isParsingOutcomes, setIsParsingOutcomes] = useState(false);
  
  // New multi-topic state
  const [topicTabs, setTopicTabs] = useState<TopicTab[]>([{ id: generateId('tab'), name: 'Topic 1', content: '' }]);
  const [activeTabId, setActiveTabId] = useState<string>(topicTabs[0].id);
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewNode[]>([]);
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());
  
  const [error, setError] = useState<string | null>(null);
  
  const activeTab = topicTabs.find(t => t.id === activeTabId) || topicTabs[0];

  const handleClose = () => {
    if (isParsingOutcomes || isAnalyzing || isFetchingUrl) return;
    setCourseName('');
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
      
      const newTabs = topicTabs.filter(t => t.id !== id);
      setTopicTabs(newTabs);
      if (activeTabId === id) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
      }
  };

  const handleUpdateTab = (field: 'name' | 'content', value: string) => {
      setTopicTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, [field]: value } : t));
  };

  const handleFetchFromUrl = async () => {
      if (!urlInput.trim()) return;
      setIsFetchingUrl(true);
      setError(null);
      try {
          // Use AI to "read" the webpage via search grounding
          const content = await fetchSyllabusContentFromUrl(urlInput);
          
          // Simple heuristic: if the AI returns a huge block, put it in the current tab
          // Ideally, we could ask the AI to split it, but for now, let's just dump it into the active tab
          handleUpdateTab('content', content);
      } catch (err) {
           setError(err instanceof Error ? err.message : 'Failed to fetch syllabus content.');
      } finally {
          setIsFetchingUrl(false);
      }
  };

  const handleAnalyze = async () => {
    if (!courseName.trim()) {
      setError('Course name is required.');
      return;
    }

    // Filter out empty tabs
    const validTabs = topicTabs.filter(t => t.content.trim().length > 0);
    if (validTabs.length === 0) {
        setError('Please enter syllabus content for at least one topic.');
        return;
    }
    
    setIsAnalyzing(true);
    setError(null);

    try {
        // Process tabs in parallel to speed up
        const promises = validTabs.map(async (tab) => {
            // We prepend the Topic Name to the content to guide the AI
            const contextContent = `Topic Name: ${tab.name}\n\n${tab.content}`;
            const structure = await parseSyllabusStructure(contextContent);
            return structure;
        });

        const results = await Promise.all(promises);
        
        // Flatten results. Each result is an array of topics (usually 1, but AI might split it)
        const aggregatedPreview: PreviewNode[] = results.flat();

        if (!aggregatedPreview || aggregatedPreview.length === 0) {
            throw new Error("No valid structure found in any topic.");
        }

        setPreviewData(aggregatedPreview);
        setStep('preview');
        
        // Auto expand all topics initially
        const initialExpand = new Set<string>();
        aggregatedPreview.forEach((t: any, idx: number) => initialExpand.add(`topic-${idx}`));
        setExpandedPreviewIds(initialExpand);
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyse syllabus structure.');
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleConfirmImport = () => {
     onImport(courseName, previewData, parsedOutcomes);
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-6xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Full Syllabus Import</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                    {step === 'input' ? 'Construct your course structure.' : 'Review the identified structure before importing.'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
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
                            <label htmlFor="course-name-import" className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">Course Name</label>
                            <input 
                                id="course-name-import" 
                                type="text" 
                                value={courseName} 
                                onChange={e => setCourseName(e.target.value)} 
                                placeholder="e.g., HSC Software Engineering" 
                                className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">Import Outcomes (Optional)</label>
                            <div className="flex gap-2">
                                <textarea 
                                    rows={1}
                                    value={outcomesText}
                                    onChange={e => setOutcomesText(e.target.value)}
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
                                <p className="text-xs text-green-400 mt-1 ml-1">✓ Found {parsedOutcomes.length} outcomes</p>
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
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder="https://educationstandards.nsw.edu.au/..."
                                className="flex-grow bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                            />
                            <button 
                                onClick={handleFetchFromUrl} 
                                disabled={isFetchingUrl || !urlInput.trim()}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
                            >
                                {isFetchingUrl ? <Sparkles className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
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
                                            ${activeTabId === tab.id 
                                                ? 'bg-[rgb(var(--color-bg-surface-elevated))] text-white shadow-sm border border-[rgb(var(--color-border-secondary))]' 
                                                : 'text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-bg-surface-light))]/50 hover:text-[rgb(var(--color-text-secondary))] border border-transparent'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-md bg-black/20 flex items-center justify-center text-[10px] font-bold opacity-70">
                                                {index + 1}
                                            </span>
                                            <span className="truncate text-sm font-medium">{tab.name || 'Untitled Topic'}</span>
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
                                 <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1.5">Topic Name</label>
                                 <input 
                                    type="text" 
                                    value={activeTab.name}
                                    onChange={e => handleUpdateTab('name', e.target.value)}
                                    className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg py-2 px-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                                 />
                             </div>
                             <div className="flex-1 flex flex-col min-h-0">
                                 <label className="block text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1.5">
                                     Paste Syllabus Content for "{activeTab.name}"
                                 </label>
                                 <textarea 
                                    value={activeTab.content}
                                    onChange={e => handleUpdateTab('content', e.target.value)}
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
                            <span>Structure Preview</span>
                            <span>{previewData.length} Topics Found</span>
                        </div>
                        <div className="p-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {previewData.map((topic, tIdx) => {
                                const topicId = `topic-${tIdx}`;
                                const isExpanded = expandedPreviewIds.has(topicId);
                                
                                return (
                                    <div key={tIdx} className="mb-2 last:mb-0">
                                        <button 
                                            onClick={() => togglePreviewExpand(topicId)}
                                            className="w-full flex items-center gap-2 p-2 hover:bg-[rgb(var(--color-bg-surface-light))] rounded-lg transition text-left group"
                                        >
                                            <ChevronRight className={`w-4 h-4 text-[rgb(var(--color-text-muted))] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                            <Folder className="w-4 h-4 text-purple-400" />
                                            <span className="font-bold text-sm text-[rgb(var(--color-text-primary))]">{topic.name}</span>
                                            <span className="ml-auto text-xs text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full">
                                                {topic.subTopics?.length || 0} Sub-topics
                                            </span>
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="ml-6 pl-2 border-l border-[rgb(var(--color-border-secondary))]/30 mt-1 space-y-1">
                                                {topic.subTopics.map((st, stIdx) => (
                                                    <div key={stIdx} className="py-1">
                                                        <div className="flex items-center gap-2 px-2 py-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50"></div>
                                                            <span className="text-sm font-medium text-[rgb(var(--color-text-secondary))]">{st.name}</span>
                                                        </div>
                                                        {st.dotPoints && st.dotPoints.length > 0 && (
                                                            <div className="ml-5 mt-1 space-y-0.5">
                                                                {st.dotPoints.map((dp, dpIdx) => (
                                                                    <div key={dpIdx} className="flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))]">
                                                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 flex-shrink-0"></span>
                                                                        <span>{dp}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-2">
                         <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                         <p>Check the structure above. If topics or dot points are missing, try editing the raw text in the previous step to be cleaner before analysing again.</p>
                    </div>
                </div>
            )}

            {error && <p className="mx-6 mt-4 text-red-400 text-sm bg-red-900/30 p-3 rounded-md animate-fade-in">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3 flex-shrink-0">
          {step === 'input' ? (
              <>
                <button onClick={handleClose} className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">Cancel</button>
                <button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing || isFetchingUrl} 
                    className="py-2.5 px-5 rounded-lg text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg transition disabled:opacity-50 flex items-center gap-2"
                >
                    <Sparkles className="w-4 h-4"/>
                    {isAnalyzing ? 'Analysing All Topics...' : 'Analyse Syllabus'}
                </button>
              </>
          ) : (
              <>
                <button onClick={() => setStep('input')} className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">Back to Edit</button>
                <button 
                    onClick={handleConfirmImport} 
                    className="py-2.5 px-5 rounded-lg text-white font-semibold bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg transition flex items-center gap-2"
                >
                    <UploadCloud className="w-4 h-4"/>
                    Confirm & Import
                </button>
              </>
          )}
        </div>

        {(isParsingOutcomes || isAnalyzing || isFetchingUrl) && (
            <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                <LoadingSpinner 
                    message={
                        isFetchingUrl ? "Visiting URL & Extracting..." :
                        isAnalyzing ? "Analysing Syllabus Structure..." : 
                        "Parsing Outcomes..."
                    }
                />
            </div>
        )}
      </div>
    </div>
  );
};

export default SyllabusImportModal;