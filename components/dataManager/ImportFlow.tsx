
import React, { useState, useMemo, useEffect } from 'react';
import { Course, DataValidationResult, Topic } from '../../types';
import { findConflicts, generateValidationReport, buildTree, analyzeAndSanitizeImportData, filterDataBySelection, regenerateTopicIds, migrateAnalyseVerb, getLLMImportTemplate } from '../../utils/dataManagerUtils';
import FileDropzone from './FileDropzone';
import ConflictResolutionView from './ConflictResolutionView';
import { ActionButtons } from './common';
import ValidationSummary from './ValidationSummary';
import SelectionTree from '../SelectionTree';
import { useSelectionTree } from '../../hooks/useSelectionTree';
import Combobox from '../Combobox';
import { Award, FileJson, GitMerge, ArrowRight, CheckCircle, UploadCloud, Sparkles } from 'lucide-react';

interface ImportFlowProps {
  existingCourses: Course[];
  onImport: (importedCourses: Course[], conflictResolutions: Map<string, 'merge' | 'skip'>) => void;
  onImportTopic: (courseId: string, topic: Topic) => void;
  onClose: () => void;
}

const ImportFlow: React.FC<ImportFlowProps> = ({ existingCourses, onImport, onImportTopic, onClose }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'resolve' | 'selectTarget'>('upload');
  const [importedCourses, setImportedCourses] = useState<Course[]>([]);
  const [importedTopic, setImportedTopic] = useState<Topic | null>(null);
  const [conflicts, setConflicts] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<DataValidationResult | null>(null);
  const [targetCourseId, setTargetCourseId] = useState<string | undefined>(undefined);

  // Bulk Settings State
  const [markAsPastHSC, setMarkAsPastHSC] = useState(false);
  const [bulkYear, setBulkYear] = useState('');
  
  // Mapping State: importedCourseId -> existingCourseId
  const [courseMapping, setCourseMapping] = useState<Map<string, string>>(new Map());

  const treeData = useMemo(() => buildTree(importedCourses), [importedCourses]);
  const {
    selectedIds,
    expandedIds,
    handleToggleSelect,
    handleToggleExpand,
    selectAll,
    deselectAll
  } = useSelectionTree(treeData);

  const filteredCoursesForPreview = useMemo(
    () => filterDataBySelection(importedCourses, selectedIds),
    [importedCourses, selectedIds]
  );

  const dynamicValidationReport = useMemo(
    () => generateValidationReport(filteredCoursesForPreview),
    [filteredCoursesForPreview]
  );

  useEffect(() => {
    if (step === 'preview') {
      selectAll();
      const autoMap = new Map<string, string>();
      importedCourses.forEach(imp => {
          const match = existingCourses.find(ex => ex.name.trim().toLowerCase() === imp.name.trim().toLowerCase());
          if (match) {
              autoMap.set(imp.id, match.id);
          }
      });
      setCourseMapping(autoMap);
    }
  }, [step, importedCourses, existingCourses, selectAll]);

  const resetState = () => {
    setStep('upload');
    setImportedCourses([]);
    setImportedTopic(null);
    setConflicts([]);
    setError(null);
    setFileName(null);
    setValidationReport(null);
    setTargetCourseId(undefined);
    setMarkAsPastHSC(false);
    setBulkYear('');
    setCourseMapping(new Map());
  };

  const handleBackToUpload = () => {
    resetState();
  };

  const handleFileDrop = (file: File) => {
    setError(null);
    
    if (!file.name.toLowerCase().endsWith('.json')) {
         setError('Invalid file type. Please upload a valid .json file.');
         return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rawData = JSON.parse(text);
        const analysis = analyzeAndSanitizeImportData(rawData);

        if (analysis.type === 'invalid') {
          setError(analysis.error || 'Invalid file format.');
          setFileName(null);
          return;
        }

        if (analysis.type === 'courses') {
          const courses = migrateAnalyseVerb(analysis.data as Course[]);
          setImportedCourses(courses);
          setStep('preview');
        } else if (analysis.type === 'topic') {
          const topic = analysis.data as Topic;
          const report = generateValidationReport([{ id: 'temp', name: 'Imported Topic', outcomes: [], topics: [topic] }]);
          setImportedTopic(topic);
          setValidationReport(report);
          setStep('selectTarget');
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse JSON file.');
        setFileName(null);
      }
    };
    reader.onerror = () => setError('Error reading file.');
    reader.readAsText(file);
  };

  const handleCourseMappingChange = (importedId: string, targetId: string) => {
      const newMap = new Map(courseMapping);
      if (targetId === 'create_new') {
          newMap.delete(importedId);
      } else {
          newMap.set(importedId, targetId);
      }
      setCourseMapping(newMap);
  };

  const handleProceedToImport = () => {
    let coursesToProcess = filteredCoursesForPreview.map(c => {
        const mappedId = courseMapping.get(c.id);
        if (mappedId) {
            return { ...c, id: mappedId };
        }
        return c;
    });
    
    if (markAsPastHSC) {
        const year = bulkYear ? parseInt(bulkYear) : undefined;
        coursesToProcess = coursesToProcess.map(c => ({
            ...c,
            topics: c.topics.map(t => ({
                ...t,
                subTopics: t.subTopics.map(st => ({
                    ...st,
                    dotPoints: st.dotPoints.map(dp => ({
                        ...dp,
                        prompts: dp.prompts.map(p => ({
                            ...p,
                            isPastHSC: true,
                            hscYear: year || p.hscYear
                        }))
                    }))
                }))
            }))
        }));
    }

    const foundConflicts = findConflicts(coursesToProcess, existingCourses);
    
    setImportedCourses(coursesToProcess);

    if (foundConflicts.length > 0) {
      setConflicts(foundConflicts);
      setStep('resolve');
    } else {
      onImport(coursesToProcess, new Map());
      onClose();
    }
  };
  
  const handleConfirmTopicImport = () => {
    if (importedTopic && targetCourseId) {
      let topicToImport = importedTopic;

      if (markAsPastHSC) {
          const year = bulkYear ? parseInt(bulkYear) : undefined;
          topicToImport = {
              ...topicToImport,
              subTopics: topicToImport.subTopics.map(st => ({
                  ...st,
                  dotPoints: st.dotPoints.map(dp => ({
                      ...dp,
                      prompts: dp.prompts.map(p => ({
                          ...p,
                          isPastHSC: true,
                          hscYear: year || p.hscYear
                      }))
                  }))
              }))
          };
      }

      const topicWithNewIds = regenerateTopicIds(topicToImport);
      onImportTopic(targetCourseId, topicWithNewIds);
      onClose();
    }
  };

  const handleResolve = (resolutions: Map<string, 'merge' | 'skip'>) => {
    onImport(importedCourses, resolutions);
    onClose();
  };
  
  const handleDownloadTemplate = () => {
    const template = getLLMImportTemplate();
    const blob = new Blob([template], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hsc_content_template_for_llm.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[rgb(var(--color-bg-surface-inset))]/20">
      {step === 'upload' && (
        <div className="flex-1 flex flex-col p-8 items-center justify-center">
            <div className="w-full max-w-2xl space-y-8">
                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-[rgb(var(--color-text-primary))]">Import Content</h3>
                    <p className="text-[rgb(var(--color-text-secondary))]">Upload a JSON file containing Courses or Topics.</p>
                </div>

                <FileDropzone onFileDrop={handleFileDrop} />
                
                {fileName && (
                    <div className="flex items-center gap-2 justify-center text-emerald-400 bg-emerald-500/10 py-2 px-4 rounded-lg border border-emerald-500/20">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Selected: {fileName}</span>
                    </div>
                )}
                
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                        <p className="text-sm text-red-400 font-medium">{error}</p>
                    </div>
                )}
                
                <div className="border-t border-[rgb(var(--color-border-secondary))] my-8" />
                
                <div className="bg-[rgb(var(--color-bg-surface))]/50 border border-[rgb(var(--color-border-secondary))] rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                     <div className="text-center sm:text-left">
                         <h4 className="text-sm font-bold text-[rgb(var(--color-text-primary))] flex items-center justify-center sm:justify-start gap-2">
                             <Sparkles className="w-4 h-4 text-purple-400" /> AI Generation Template
                         </h4>
                         <p className="text-xs text-[rgb(var(--color-text-muted))] mt-1">Use this schema to generate compatible content with LLMs.</p>
                     </div>
                     <button 
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgb(var(--color-bg-surface-elevated))] hover:bg-[rgb(var(--color-border-secondary))] border border-[rgb(var(--color-border-secondary))] text-xs font-bold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] transition-all hover-scale whitespace-nowrap"
                     >
                         <FileJson className="w-4 h-4" /> Download Template
                     </button>
                </div>
            </div>
        </div>
      )}

      {step === 'preview' && (
        <>
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
                {/* Left Column: Selection Tree */}
                <div className="flex flex-col h-full border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))]">
                     <div className="px-4 py-3 bg-[rgb(var(--color-bg-surface-elevated))]/50 border-b border-[rgb(var(--color-border-secondary))] flex items-center justify-between">
                         <h4 className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">Select Content</h4>
                         <div className="flex gap-2">
                            <button onClick={selectAll} className="text-[10px] font-bold text-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent-glow))]">All</button>
                            <span className="text-[rgb(var(--color-border-secondary))]">|</span>
                            <button onClick={deselectAll} className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]">None</button>
                         </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                         <SelectionTree
                            items={treeData}
                            selectedIds={selectedIds}
                            expandedIds={expandedIds}
                            onToggleSelect={handleToggleSelect}
                            onToggleExpand={handleToggleExpand}
                         />
                     </div>
                </div>

                {/* Right Column: Settings */}
                <div className="flex flex-col h-full overflow-y-auto custom-scrollbar bg-[rgb(var(--color-bg-surface))]/30">
                     <div className="px-4 py-3 bg-[rgb(var(--color-bg-surface-elevated))]/50 border-b border-[rgb(var(--color-border-secondary))]">
                         <h4 className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">Configuration</h4>
                     </div>
                     
                     <div className="p-6 space-y-6">
                        {importedCourses.length > 0 && (
                            <div className="space-y-3">
                                <h5 className="text-sm font-bold text-[rgb(var(--color-text-primary))] flex items-center gap-2">
                                    <GitMerge className="w-4 h-4 text-purple-400" /> Merge Strategy
                                </h5>
                                {importedCourses.map(course => {
                                    if (!selectedIds.has(course.id)) return null;
                                    const currentTarget = courseMapping.get(course.id);
                                    return (
                                        <div key={course.id} className="p-3 rounded-lg bg-[rgb(var(--color-bg-surface))] border border-[rgb(var(--color-border-secondary))]">
                                            <div className="text-xs font-medium text-[rgb(var(--color-text-secondary))] mb-2 truncate" title={course.name}>{course.name}</div>
                                            <div className="flex items-center gap-2">
                                                <ArrowRight className="w-3 h-3 text-[rgb(var(--color-text-muted))]" />
                                                <select
                                                    value={currentTarget || 'create_new'}
                                                    onChange={(e) => handleCourseMappingChange(course.id, e.target.value)}
                                                    className="flex-1 bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-accent))]"
                                                >
                                                    <option value="create_new">Create New Course</option>
                                                    {existingCourses.length > 0 && <optgroup label="Merge into Existing...">
                                                        {existingCourses.map(ex => (
                                                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                                                        ))}
                                                    </optgroup>}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        <div className="space-y-3 pt-4 border-t border-[rgb(var(--color-border-secondary))]/50">
                            <h5 className="text-sm font-bold text-[rgb(var(--color-text-primary))] flex items-center gap-2">
                                <Award className="w-4 h-4 text-amber-400" /> Bulk Attributes
                            </h5>
                            <label className="flex items-center justify-between cursor-pointer p-3 rounded-lg bg-[rgb(var(--color-bg-surface))] border border-[rgb(var(--color-border-secondary))] hover:border-[rgb(var(--color-accent))]/50 transition-colors">
                                <span className="text-xs font-medium text-[rgb(var(--color-text-secondary))]">Mark as Past HSC</span>
                                <input 
                                    type="checkbox" 
                                    checked={markAsPastHSC}
                                    onChange={e => setMarkAsPastHSC(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))]"
                                />
                            </label>
                             {markAsPastHSC && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgb(var(--color-bg-surface))] border border-[rgb(var(--color-border-secondary))] animate-fade-in">
                                    <span className="text-xs text-[rgb(var(--color-text-muted))]">Year:</span>
                                    <input 
                                        type="number" 
                                        value={bulkYear}
                                        onChange={e => setBulkYear(e.target.value)}
                                        placeholder="e.g. 2023"
                                        className="w-full bg-transparent border-b border-[rgb(var(--color-border-secondary))] py-1 text-xs text-[rgb(var(--color-text-primary))] focus:outline-none focus:border-[rgb(var(--color-accent))]"
                                    />
                                </div>
                            )}
                        </div>

                        {dynamicValidationReport && <ValidationSummary result={dynamicValidationReport} />}
                     </div>
                </div>
            </div>

            <ActionButtons
                onCancel={handleBackToUpload}
                onConfirm={handleProceedToImport}
                confirmText="Import Selected"
                isConfirmDisabled={selectedIds.size === 0}
            />
        </>
      )}

      {step === 'selectTarget' && importedTopic && validationReport && (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-8 space-y-6 max-w-2xl mx-auto w-full overflow-y-auto custom-scrollbar">
                  <div className="text-center mb-4">
                        <h3 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Import Single Topic</h3>
                        <p className="text-[rgb(var(--color-text-secondary))] text-sm">Select where to add "{importedTopic.name}"</p>
                  </div>

                  <Combobox
                    label="Target Course"
                    options={existingCourses.map(c => ({ id: c.id, label: c.name }))}
                    value={targetCourseId || ''}
                    onChange={setTargetCourseId}
                    placeholder="Select a course..."
                  />

                   <div className="bg-[rgb(var(--color-bg-surface))] p-4 rounded-xl border border-[rgb(var(--color-border-secondary))]">
                        <label className="flex items-center justify-between cursor-pointer mb-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))]">
                                <Award className="w-4 h-4 text-amber-400" />
                                <span>Past HSC Metadata</span>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={markAsPastHSC}
                                onChange={e => setMarkAsPastHSC(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))]"
                            />
                        </label>
                        {markAsPastHSC && (
                             <div className="flex items-center gap-3 animate-fade-in pl-6">
                                 <span className="text-xs text-[rgb(var(--color-text-muted))]">Default Year:</span>
                                 <input 
                                    type="number" 
                                    value={bulkYear}
                                    onChange={e => setBulkYear(e.target.value)}
                                    placeholder="e.g. 2023"
                                    className="w-24 bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded px-2 py-1 text-sm focus:outline-none focus:border-[rgb(var(--color-accent))]"
                                 />
                             </div>
                        )}
                    </div>
                  
                  <ValidationSummary result={validationReport} />
            </div>
            
            <ActionButtons
                onCancel={handleBackToUpload}
                onConfirm={handleConfirmTopicImport}
                confirmText="Import Topic"
                isConfirmDisabled={!targetCourseId}
            />
        </div>
      )}

      {step === 'resolve' && (
        <ConflictResolutionView
          conflicts={conflicts}
          onResolve={handleResolve}
          onBack={() => setStep('preview')}
        />
      )}
    </div>
  );
};

export default ImportFlow;
