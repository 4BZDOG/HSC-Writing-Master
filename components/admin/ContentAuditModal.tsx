
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Course, Topic, SubTopic, DotPoint, Prompt, StatePath, CommandTermInfo } from '../../types';
import { BatchTask, runBatchOperations, BatchProgress } from '../../utils/batchProcessor';
import { generateNewPrompt, generateSampleAnswer, enrichPromptDetails, suggestOutcomesForPrompt } from '../../services/geminiService';
import { getCommandTermsForMarks, extractCommandVerb } from '../../data/commandTerms';
import { getBandConfig, escapeRegExp } from '../../utils/renderUtils';
import { filterDataBySelection } from '../../utils/dataManagerUtils';
import CognitiveSpectrum from '../CognitiveSpectrum';
import SelectionTree from '../SelectionTree';
import { 
  ChevronRight, ChevronDown, CheckSquare, Square, Sparkles, 
  FileText, X, Folder, Layers, Hash, BookOpen, Database, Zap,
  BarChart3, Play, Square as StopSquare, Filter, AlertTriangle, Terminal,
  PieChart, Link, Download
} from 'lucide-react';

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
  parentId?: string; // Added for auto-expand traversal
  type: NodeType;
  label: string;
  children?: TreeNode[];
  stats: {
    questions: number;
    samples: number;
    enriched: number;
    missingOutcomes: number;
    totalDotPoints: number;
    coveredDotPoints: number;
  };
  verbInfo?: {
      term: string;
      tier: number;
  };
  dataRef: any; // Reference to the actual object for generation
  path: StatePath; // Path to find this item for updates
}

// --- Tree Builder Helper ---

const buildAuditTree = (courses: Course[]): TreeNode[] => {
  const mapStats = (nodes: TreeNode[]): TreeNode['stats'] => {
    return nodes.reduce((acc, node) => ({
      questions: acc.questions + node.stats.questions,
      samples: acc.samples + node.stats.samples,
      enriched: acc.enriched + node.stats.enriched,
      missingOutcomes: acc.missingOutcomes + node.stats.missingOutcomes,
      totalDotPoints: acc.totalDotPoints + node.stats.totalDotPoints,
      coveredDotPoints: acc.coveredDotPoints + node.stats.coveredDotPoints,
    }), { questions: 0, samples: 0, enriched: 0, missingOutcomes: 0, totalDotPoints: 0, coveredDotPoints: 0 });
  };

  return courses.map(course => {
    const topics = course.topics.map(topic => {
      const subTopics = topic.subTopics.map(st => {
        const dotPoints = st.dotPoints.map(dp => {
            // Extract syllabus verb info for the dot point
            const verbInfo = extractCommandVerb(dp.description);

            // Prompts are the leaves
            const prompts = (dp.prompts || []).map(p => ({
                id: p.id,
                parentId: dp.id,
                type: 'prompt' as NodeType,
                label: p.question,
                stats: {
                    questions: 1,
                    samples: p.sampleAnswers?.length || 0,
                    enriched: (p.keywords?.length && p.scenario) ? 1 : 0,
                    missingOutcomes: (!p.linkedOutcomes || p.linkedOutcomes.length === 0) ? 1 : 0,
                    totalDotPoints: 0,
                    coveredDotPoints: 0
                },
                dataRef: p,
                path: { courseId: course.id, topicId: topic.id, subTopicId: st.id, dotPointId: dp.id, promptId: p.id }
            }));

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
                    totalDotPoints: 1,
                    coveredDotPoints: prompts.length > 0 ? 1 : 0
                },
                verbInfo: verbInfo ? { term: verbInfo.term, tier: verbInfo.tier } : undefined,
                dataRef: dp,
                path: { courseId: course.id, topicId: topic.id, subTopicId: st.id, dotPointId: dp.id }
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
            path: { courseId: course.id, topicId: topic.id, subTopicId: st.id }
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
        path: { courseId: course.id, topicId: topic.id }
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
      path: { courseId: course.id }
    };
  });
};

// --- Component ---

const ContentAuditModal: React.FC<ContentAuditModalProps> = ({ isOpen, onClose, courses, updateCourses, showToast }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const treeData = useMemo(() => buildAuditTree(courses), [courses]);

  // Cleanup AbortController on unmount
  useEffect(() => {
      return () => {
          if (abortControllerRef.current) {
              abortControllerRef.current.abort();
          }
      };
  }, []);

  // Flatten tree for easier bulk operations logic and smart selection
  const flatMap = useMemo(() => {
      const map = new Map<string, TreeNode>();
      const traverse = (nodes: TreeNode[]) => {
          nodes.forEach(n => {
              map.set(n.id, n);
              if (n.children) traverse(n.children);
          });
      };
      traverse(treeData);
      return map;
  }, [treeData]);

  // Calculate counts for smart selection buttons
  const counts = useMemo(() => {
      let emptyDotPoints = 0;
      let missingSamples = 0;
      let unEnriched = 0;
      let missingOutcomes = 0;
      
      flatMap.forEach(node => {
          if (node.type === 'dotPoint' && node.stats.questions === 0) emptyDotPoints++;
          if (node.type === 'prompt') {
              if (node.stats.samples === 0) missingSamples++;
              if (node.stats.enriched === 0) unEnriched++;
              if (node.stats.missingOutcomes > 0) missingOutcomes++;
          }
      });
      
      return { emptyDotPoints, missingSamples, unEnriched, missingOutcomes };
  }, [flatMap]);

  // Auto-expand top level
  useEffect(() => {
    if (isOpen && expandedIds.size === 0) {
        setExpandedIds(new Set(treeData.map(c => c.id)));
    }
  }, [isOpen, treeData, expandedIds.size]);

  // Auto-scroll logs
  useEffect(() => {
      if (logsEndRef.current) {
          logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [progress?.logs]);

  const toggleSelect = (id: string, checked: boolean) => {
      if (isProcessing) return;
      
      const newSelected = new Set(selectedIds);
      const node = flatMap.get(id);
      if (!node) return;

      // Recursive select/deselect
      const toggleNode = (n: TreeNode, isChecked: boolean) => {
          if (isChecked) newSelected.add(n.id);
          else newSelected.delete(n.id);
          if (n.children) n.children.forEach(c => toggleNode(c, isChecked));
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
  
  // --- Smart Selection Logic ---
  
  const handleSmartSelect = (criteria: 'emptyDotPoints' | 'missingSamples' | 'unEnriched' | 'missingOutcomes') => {
      const newSelected = new Set<string>();
      const newExpanded = new Set<string>(expandedIds);
      
      flatMap.forEach((node) => {
          let match = false;
          if (criteria === 'emptyDotPoints' && node.type === 'dotPoint' && node.stats.questions === 0) match = true;
          if (criteria === 'missingSamples' && node.type === 'prompt' && node.stats.samples === 0) match = true;
          if (criteria === 'unEnriched' && node.type === 'prompt' && node.stats.enriched === 0) match = true;
          if (criteria === 'missingOutcomes' && node.type === 'prompt' && node.stats.missingOutcomes > 0) match = true;

          if (match) {
              newSelected.add(node.id);
              // Auto-expand parents
              let current = node;
              while(current.parentId) {
                  newExpanded.add(current.parentId);
                  const parent = flatMap.get(current.parentId);
                  if (parent) current = parent;
                  else break;
              }
          }
      });
      
      setSelectedIds(newSelected);
      setExpandedIds(newExpanded);
      
      if (newSelected.size > 0) {
          showToast(`Selected ${newSelected.size} items matching criteria.`, 'success');
      } else {
          showToast("No items found matching criteria.", 'info');
      }
  };
  
  // --- Export Logic ---
  const handleExportSelected = () => {
      if (selectedIds.size === 0) {
          showToast("No items selected to export.", "info");
          return;
      }

      const dataToExport = filterDataBySelection(courses, selectedIds);
      
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hsc_audit_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast(`Exported ${selectedIds.size} items for external processing.`, "success");
  };

  // --- Generators ---

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
  };

  const handleBulkAction = async (actionType: 'generateQuestions' | 'generateSamples' | 'enrich' | 'linkOutcomes') => {
      setIsProcessing(true);
      setProgress(null);
      
      // Create a new AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const tasks: BatchTask<any>[] = [];

      // Identify target nodes
      selectedIds.forEach(id => {
          const node = flatMap.get(id);
          if (!node) return;

          if (actionType === 'generateQuestions' && node.type === 'dotPoint') {
              if (node.stats.questions === 0) {
                  tasks.push({
                      id: `q-${node.id}`,
                      description: `Creating question for: ${node.label.slice(0, 40)}...`,
                      action: async () => {
                          const path = node.path;
                          const course = courses.find(c => c.id === path.courseId);
                          const topic = course?.topics.find(t => t.id === path.topicId);
                          if (!course || !topic) return;
                          
                          const description = node.dataRef.description;
                          const syllabusVerbInfo = extractCommandVerb(description);
                          
                          let targetMarks = 5;
                          let verbsToUse: CommandTermInfo[] = [];
                          
                          if (syllabusVerbInfo) {
                              const maxTier = syllabusVerbInfo.tier;
                              let selectedTier = maxTier;
                              if (Math.random() > 0.6 && maxTier > 1) {
                                  selectedTier = Math.floor(Math.random() * (maxTier)) + 1;
                              }
                              
                              const tierRanges: Record<number, [number, number]> = {
                                  1: [1, 2], 2: [3, 4], 3: [4, 6], 4: [5, 8], 5: [6, 10], 6: [8, 12]
                              };
                              const range = tierRanges[selectedTier] || [4, 8];
                              targetMarks = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
                              
                              const { terms } = getCommandTermsForMarks(targetMarks);
                              verbsToUse = terms;
                              
                              if (selectedTier === maxTier && !verbsToUse.find(v => v.term === syllabusVerbInfo.term)) {
                                  verbsToUse.unshift(syllabusVerbInfo);
                              }
                          } else {
                              const { terms } = getCommandTermsForMarks(5);
                              targetMarks = 5;
                              verbsToUse = terms;
                          }
                          
                          const prompt = await generateNewPrompt(
                              course.name, topic.name, description, targetMarks, verbsToUse, course.outcomes
                          );
                          
                          updateCourses(draft => {
                              const c = draft.find((x: Course) => x.id === path.courseId);
                              const t = c?.topics.find((x: Topic) => x.id === path.topicId);
                              const st = t?.subTopics.find((x: SubTopic) => x.id === path.subTopicId);
                              const dp = st?.dotPoints.find((x: DotPoint) => x.id === path.dotPointId);
                              if (dp) dp.prompts.push(prompt);
                          });
                      }
                  });
              }
          }

          if (actionType === 'generateSamples' && node.type === 'prompt') {
              if (node.stats.samples === 0) {
                  tasks.push({
                      id: `sa-${node.id}`,
                      description: `Generating Answer for: ${node.label.slice(0, 40)}...`,
                      action: async () => {
                         const prompt = node.dataRef as Prompt;
                         const answer = await generateSampleAnswer(prompt, prompt.totalMarks, []);
                         updateCourses(draft => {
                             const c = draft.find((x: Course) => x.id === node.path.courseId);
                             const t = c?.topics.find((x: Topic) => x.id === node.path.topicId);
                             const st = t?.subTopics.find((x: SubTopic) => x.id === node.path.subTopicId);
                             const dp = st?.dotPoints.find((x: DotPoint) => x.id === node.path.dotPointId);
                             const p = dp?.prompts.find((x: Prompt) => x.id === node.path.promptId);
                             if (p) {
                                 if (!p.sampleAnswers) p.sampleAnswers = [];
                                 p.sampleAnswers.push(answer);
                             }
                         });
                      }
                  });
              }
          }

          if (actionType === 'enrich' && node.type === 'prompt') {
              if (node.stats.enriched === 0) {
                 tasks.push({
                     id: `en-${node.id}`,
                     description: `Enriching context for: ${node.label.slice(0, 40)}...`,
                     action: async () => {
                         const prompt = node.dataRef as Prompt;
                         const course = courses.find(c => c.id === node.path.courseId);
                         if (!course) return;

                         const enrichedData = await enrichPromptDetails(prompt, { name: course.name, outcomes: course.outcomes });
                         updateCourses(draft => {
                             const c = draft.find((x: Course) => x.id === node.path.courseId);
                             const t = c?.topics.find((x: Topic) => x.id === node.path.topicId);
                             const st = t?.subTopics.find((x: SubTopic) => x.id === node.path.subTopicId);
                             const dp = st?.dotPoints.find((x: DotPoint) => x.id === node.path.dotPointId);
                             const p = dp?.prompts.find((x: Prompt) => x.id === node.path.promptId);
                             if (p) Object.assign(p, enrichedData);
                         });
                     }
                 });
              }
          }
          
          if (actionType === 'linkOutcomes' && node.type === 'prompt') {
              if (node.stats.missingOutcomes > 0) {
                  tasks.push({
                      id: `lo-${node.id}`,
                      description: `Linking outcomes for: ${node.label.slice(0, 40)}...`,
                      action: async () => {
                          const prompt = node.dataRef as Prompt;
                          const course = courses.find(c => c.id === node.path.courseId);
                          if (!course || !course.outcomes.length) return;

                          const linkedOutcomes = await suggestOutcomesForPrompt(prompt.question, course.outcomes, prompt.totalMarks);
                          
                          if (linkedOutcomes && linkedOutcomes.length > 0) {
                              updateCourses(draft => {
                                 const c = draft.find((x: Course) => x.id === node.path.courseId);
                                 const t = c?.topics.find((x: Topic) => x.id === node.path.topicId);
                                 const st = t?.subTopics.find((x: SubTopic) => x.id === node.path.subTopicId);
                                 const dp = st?.dotPoints.find((x: DotPoint) => x.id === node.path.dotPointId);
                                 const p = dp?.prompts.find((x: Prompt) => x.id === node.path.promptId);
                                 if (p) p.linkedOutcomes = linkedOutcomes;
                              });
                          }
                      }
                  });
              }
          }
      });

      if (tasks.length === 0) {
          showToast("No eligible items found for this action in selection.", "info");
          setIsProcessing(false);
          return;
      }

      // Run batch with signal
      await runBatchOperations(tasks, 1, (prog) => setProgress(prog), controller.signal); 
      
      setIsProcessing(false);
      if (!controller.signal.aborted) {
          showToast(`Batch operation completed.`, "success");
      } else {
          showToast("Batch operation cancelled.", "info");
      }
      abortControllerRef.current = null;
  };

  // --- Render Helpers ---

  const getTypeIcon = (type: NodeType) => {
      switch(type) {
          case 'course': return <BookOpen className="w-4 h-4 text-[rgb(var(--color-accent))]" />;
          case 'topic': return <Database className="w-4 h-4 text-purple-400" />;
          case 'subTopic': return <Folder className="w-4 h-4 text-indigo-400" />;
          case 'dotPoint': return <Hash className="w-4 h-4 text-gray-400" />;
          case 'prompt': return <FileText className="w-4 h-4 text-green-400" />;
      }
  };

  const getStatusIndicator = (node: TreeNode) => {
      if (node.type === 'dotPoint') {
          if (node.stats.questions === 0) return <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" title="No questions" />;
          return <span className="w-2.5 h-2.5 rounded-full bg-green-500" title="Has questions" />;
      }
      if (node.type === 'prompt') {
          if (node.stats.samples === 0) return <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]" title="Missing sample answer" />;
          if (node.stats.missingOutcomes > 0) return <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-[0_0_5px_rgba(14,165,233,0.5)]" title="Missing outcomes" />;
          return <span className="w-2.5 h-2.5 rounded-full bg-green-500" title="Complete" />;
      }
      return null;
  };
  
  const renderHighlightedLabel = (label: string, verbTerm?: string, verbConfig?: any) => {
      if (!verbTerm || !verbConfig) return label;
      
      // Split the label by the verb term (case insensitive)
      const parts = label.split(new RegExp(`(${escapeRegExp(verbTerm)})`, 'i'));
      
      return (
          <span>
              {parts.map((part, i) => 
                  part.toLowerCase() === verbTerm.toLowerCase() ? (
                       <span key={i} className={`font-black ${verbConfig.text} underline decoration-2 underline-offset-2 decoration-current`}>
                           {part}
                       </span>
                  ) : (
                      part
                  )
              )}
          </span>
      );
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
      const isSelected = selectedIds.has(node.id);
      const isExpanded = expandedIds.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const verbConfig = node.verbInfo ? getBandConfig(node.verbInfo.tier) : null;
      
      // Calculate Coverage Percentage for container nodes
      const coveragePct = node.stats.totalDotPoints > 0 
        ? Math.round((node.stats.coveredDotPoints / node.stats.totalDotPoints) * 100) 
        : 0;

      let coverageColor = 'text-red-400 bg-red-400/10 border-red-400/20';
      if (coveragePct >= 50) coverageColor = 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      if (coveragePct >= 80) coverageColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';

      return (
          <div key={node.id} className="relative">
              {/* Indentation Guide */}
              {level > 0 && <div className="absolute left-0 top-0 bottom-0 w-px bg-[rgb(var(--color-border-secondary))]/30 light:bg-slate-300/50" style={{ left: `${level * 24 + 23}px` }}></div>}

              <div 
                className={`
                    flex items-center py-2 px-4 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 border-b border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 transition-colors group
                    ${isSelected ? 'bg-[rgb(var(--color-accent))]/5' : ''}
                `}
                style={{ paddingLeft: `${level * 24 + 16}px` }}
              >
                  {/* Checkbox */}
                  <button 
                    onClick={() => toggleSelect(node.id, !isSelected)}
                    className={`mr-3 text-[rgb(var(--color-text-muted))] light:text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors ${isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-100'}`}
                  >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-[rgb(var(--color-accent))]" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Expander */}
                  <button 
                    onClick={() => toggleExpand(node.id)}
                    className={`mr-2 p-1 rounded hover:bg-white/10 light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-400 ${hasChildren ? 'visible' : 'invisible'}`}
                  >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Icon & Label */}
                  <div className="flex items-center gap-3 flex-1 min-w-0 mr-4 overflow-hidden">
                      {getTypeIcon(node.type)}
                      <span className={`text-sm truncate ${node.type === 'course' || node.type === 'topic' ? 'font-bold text-white light:text-slate-900' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600'}`}>
                          {node.type === 'dotPoint' && node.verbInfo && verbConfig
                            ? renderHighlightedLabel(node.label, node.verbInfo.term, verbConfig)
                            : node.label
                          }
                      </span>
                  </div>
                  
                  {/* Coverage Badge for Containers */}
                  {(node.type === 'course' || node.type === 'topic' || node.type === 'subTopic') && (
                      <div className={`
                          ml-auto mr-6 hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border
                          ${coverageColor}
                      `}>
                          <PieChart className="w-3 h-3" />
                          <span>{coveragePct}% Covered</span>
                      </div>
                  )}

                  {/* Syllabus Spectrum for Dot Points */}
                  {node.type === 'dotPoint' && node.verbInfo && verbConfig && (
                      <div className="ml-auto mr-6 hidden sm:block">
                          <div className={`
                              flex items-center gap-3 px-2 py-1 rounded-lg border
                              ${verbConfig.bg} ${verbConfig.border}
                              relative overflow-hidden
                          `}>
                                {/* Gradient Background */}
                                <div className={`absolute inset-0 bg-gradient-to-r ${verbConfig.gradient} opacity-10 pointer-events-none`} />
                                
                                {/* Verb Badge */}
                                <div className={`
                                    px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white shadow-sm
                                    bg-gradient-to-r ${verbConfig.gradient}
                                `}>
                                    {node.verbInfo.term}
                                </div>

                                {/* Spectrum Bars Only */}
                                <CognitiveSpectrum 
                                    tier={node.verbInfo.tier} 
                                    className="!bg-transparent !border-0 !p-0 !gap-0.5"
                                    showLabel={false}
                                />
                          </div>
                      </div>
                  )}

                  {/* Status Indicators */}
                  <div className="flex items-center gap-6 text-xs text-[rgb(var(--color-text-dim))] font-mono">
                      <div className="flex items-center gap-2">
                          {getStatusIndicator(node)}
                      </div>
                      {node.type !== 'prompt' && (
                          <div className="w-16 text-right opacity-70" title="Questions contained">
                              {node.stats.questions} Qs
                          </div>
                      )}
                      {node.type !== 'prompt' && (
                          <div className="w-16 text-right opacity-70" title="Sample Answers contained">
                              {node.stats.samples} SAs
                          </div>
                      )}
                  </div>
              </div>
              
              {isExpanded && node.children && (
                  <div>
                      {node.children.map(child => renderNode(child, level + 1))}
                  </div>
              )}
          </div>
      );
  };

  if (!isOpen) return null;

  // Top level stats
  const totalQuestions = treeData.reduce((sum, n) => sum + n.stats.questions, 0);
  const totalSamples = treeData.reduce((sum, n) => sum + n.stats.samples, 0);
  const selectionCount = selectedIds.size;
  
  // Calculate Health Score
  const totalDotPoints = treeData.reduce((sum, n) => sum + n.stats.totalDotPoints, 0);
  const coveredDotPoints = treeData.reduce((sum, n) => sum + n.stats.coveredDotPoints, 0);
  const healthPercentage = totalDotPoints > 0 ? Math.round((coveredDotPoints / totalDotPoints) * 100) : 0;

  // Calculate Health Color
  let healthColor = 'text-red-400';
  let healthStroke = '#ef4444';
  if (healthPercentage > 50) { healthColor = 'text-amber-400'; healthStroke = '#f59e0b'; }
  if (healthPercentage > 80) { healthColor = 'text-green-400'; healthStroke = '#10b981'; }

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[rgb(var(--color-bg-base))] light:bg-slate-50 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white shadow-sm z-20">
            <div className="px-8 py-8">
                <div className="flex justify-between items-start gap-4">
                    {/* Left Side: Title + Stats Container */}
                    <div className="flex flex-col xl:flex-row gap-8 flex-1">
                        {/* Title Section */}
                        <div className="flex items-start gap-6 max-w-xl">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-700/20 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-900/20 flex-shrink-0 mt-1">
                                <Layers className="w-8 h-8 text-purple-400 light:text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-tight tracking-tight">Content Audit Dashboard</h2>
                                <p className="text-base text-[rgb(var(--color-text-secondary))] light:text-slate-500 mt-2 font-medium leading-relaxed">
                                    Analyze curriculum coverage, identify gaps in resources, and bulk-generate content using AI to improve course quality.
                                </p>
                            </div>
                        </div>

                        {/* Health Stats Card */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-3 rounded-2xl border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 backdrop-blur-sm">
                            {/* Gauge */}
                            <div className="flex items-center gap-6 bg-[rgb(var(--color-bg-surface))] light:bg-white px-8 py-5 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 shadow-sm flex-1 sm:flex-initial min-w-[260px]">
                                <div className="relative w-16 h-16 flex items-center justify-center">
                                    {/* Use explicit viewBox to prevent clipping and slightly reduced radius for padding */}
                                    <svg className="transform -rotate-90 w-16 h-16" viewBox="0 0 64 64">
                                        <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="5" fill="transparent" className="text-[rgb(var(--color-bg-surface-inset))] light:text-slate-200" />
                                        <circle cx="32" cy="32" r="26" stroke={healthStroke} strokeWidth="5" fill="transparent" strokeDasharray={164} strokeDashoffset={164 - (healthPercentage * 1.64)} strokeLinecap="round" className="transition-all duration-1000" />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className={`text-sm font-black ${healthColor}`}>{healthPercentage}%</span>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Health Score</span>
                                    <div className="flex items-baseline gap-2">
                                    <span className={`text-3xl font-black ${healthColor}`}>{coveredDotPoints}</span>
                                    <span className="text-sm font-medium text-[rgb(var(--color-text-dim))]">/ {totalDotPoints} Points</span>
                                    </div>
                                </div>
                            </div>

                            {/* Metrics */}
                            <div className="flex gap-10 px-8 py-4 justify-around sm:justify-start flex-1 sm:flex-initial items-center">
                                <div className="flex flex-col items-center sm:items-start">
                                    <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Questions</span>
                                    <span className="text-3xl font-mono font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-tight">{totalQuestions}</span>
                                </div>
                                <div className="w-px bg-[rgb(var(--color-border-secondary))] light:bg-slate-300 h-12 opacity-50"></div>
                                <div className="flex flex-col items-center sm:items-start">
                                    <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Samples</span>
                                    <span className="text-3xl font-mono font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-tight">{totalSamples}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Close Button */}
                    <button 
                        onClick={onClose} 
                        className="p-2 rounded-xl hover:bg-[rgb(var(--color-bg-surface-inset))] light:hover:bg-slate-100 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] transition-colors"
                        aria-label="Close Dashboard"
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>
                
                {/* Smart Filter Row */}
                <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="flex items-center gap-2.5 text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider h-10 px-3 bg-[rgb(var(--color-bg-surface-inset))]/50 rounded-lg border border-transparent select-none flex-shrink-0">
                        <Filter className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                        <span>Smart Select</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3">
                         <button 
                            onClick={() => handleSmartSelect('emptyDotPoints')} 
                            className="group relative overflow-hidden px-4 py-2.5 rounded-xl bg-red-500/10 light:bg-red-50 border border-red-500/20 light:border-red-200 text-red-400 light:text-red-700 text-xs font-bold hover:bg-red-500/20 light:hover:bg-red-100 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 shadow-sm"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                            <span>Empty Dot Points</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-[10px] border border-red-500/20 min-w-[1.5rem] text-center">{counts.emptyDotPoints}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSmartSelect('missingSamples')} 
                            className="group relative overflow-hidden px-4 py-2.5 rounded-xl bg-amber-500/10 light:bg-amber-50 border border-amber-500/20 light:border-amber-200 text-amber-400 light:text-amber-700 text-xs font-bold hover:bg-amber-500/20 light:hover:bg-amber-100 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 shadow-sm"
                        >
                             <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                            <span>Missing Answers</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] border border-amber-500/20 min-w-[1.5rem] text-center">{counts.missingSamples}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSmartSelect('unEnriched')} 
                            className="group relative overflow-hidden px-4 py-2.5 rounded-xl bg-blue-500/10 light:bg-blue-50 border border-blue-500/20 light:border-blue-200 text-blue-400 light:text-blue-700 text-xs font-bold hover:bg-blue-500/20 light:hover:bg-blue-100 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 shadow-sm"
                        >
                             <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                            <span>Un-enriched</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-[10px] border border-blue-500/20 min-w-[1.5rem] text-center">{counts.unEnriched}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSmartSelect('missingOutcomes')} 
                            className="group relative overflow-hidden px-4 py-2.5 rounded-xl bg-sky-500/10 light:bg-sky-50 border border-sky-500/20 light:border-sky-200 text-sky-400 light:text-sky-700 text-xs font-bold hover:bg-sky-500/20 light:hover:bg-sky-100 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 shadow-sm"
                        >
                             <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500"></div>
                            <span>No Outcomes</span>
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-[10px] border border-sky-500/20 min-w-[1.5rem] text-center">{counts.missingOutcomes}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-[rgb(var(--color-bg-base))] light:bg-slate-50 custom-scrollbar">
             <div className="min-w-[800px] pb-20">
                 {treeData.map(node => renderNode(node))}
             </div>
        </div>

        {/* Footer / Operations Panel */}
        <div className={`
            border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-white px-6 flex flex-col flex-shrink-0 relative shadow-[0_-10px_30px_rgba(0,0,0,0.3)]
            transition-all duration-300 ease-out
            ${isProcessing ? 'h-64' : 'h-20'}
        `}>
            {/* Log View (Visible only when processing) */}
            {isProcessing && progress && (
                <div className="flex-1 overflow-hidden flex flex-col pt-4 pb-2">
                     <div className="flex justify-between text-xs mb-2 text-white light:text-slate-900 font-bold">
                        <span className="flex items-center gap-2"><Terminal className="w-3 h-3 text-[rgb(var(--color-accent))]" /> Operations Log</span>
                        <div className="flex gap-4">
                            <span>Success: {progress.completed}</span>
                            <span className="text-red-400">Failed: {progress.failed}</span>
                            <span>Total: {progress.total}</span>
                        </div>
                    </div>
                    <div className="flex-1 bg-black/40 light:bg-slate-100 rounded-lg border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 p-3 overflow-y-auto font-mono text-xs text-gray-300 light:text-slate-600 space-y-1 custom-scrollbar">
                        {progress.logs.map((log, i) => (
                            <div key={i} className="truncate">{log}</div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}

            {/* Action Bar */}
            <div className={`flex items-center justify-between ${isProcessing ? 'h-16 border-t border-[rgb(var(--color-border-secondary))]/30' : 'h-full'}`}>
                 {isProcessing && progress ? (
                    <div className="w-full flex items-center gap-4">
                        <div className="flex-1 h-2 bg-[rgb(var(--color-bg-surface-inset))] rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]">
                            <div 
                                className="h-full bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] transition-all duration-300 relative"
                                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-shimmer"></div>
                            </div>
                        </div>
                        <button 
                            onClick={handleStop}
                            className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                            <StopSquare className="w-3 h-3 fill-current" /> Stop
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-6 w-full">
                        <div className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600 flex-shrink-0">
                            <span className="text-white light:text-slate-900 font-bold text-lg mr-1">{selectionCount}</span> items selected
                        </div>
                        
                        {selectionCount > 0 ? (
                            <div className="flex gap-3 animate-fade-in-up-sm ml-auto">
                                <button 
                                    onClick={handleExportSelected}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-[rgb(var(--color-accent))]/50 text-sm font-bold transition-all hover-lift text-[rgb(var(--color-text-primary))] light:text-slate-900"
                                    title="Export selected items to JSON for external processing"
                                >
                                    <Download className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                                    Export JSON
                                </button>
                                <div className="w-px h-8 bg-[rgb(var(--color-border-secondary))]/50 light:bg-slate-300 mx-1"></div>
                                <button 
                                    onClick={() => handleBulkAction('generateQuestions')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-purple-500/50 text-sm font-bold transition-all hover-lift text-[rgb(var(--color-text-primary))] light:text-slate-900"
                                    title="Generate questions for dot points that have none"
                                >
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    Generate Questions
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('generateSamples')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-blue-500/50 text-sm font-bold transition-all hover-lift text-[rgb(var(--color-text-primary))] light:text-slate-900"
                                    title="Generate sample answers for questions that have none"
                                >
                                    <FileText className="w-4 h-4 text-blue-400" />
                                    Generate Samples
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('enrich')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-yellow-500/50 text-sm font-bold transition-all hover-lift text-[rgb(var(--color-text-primary))] light:text-slate-900"
                                    title="Add scenarios and keywords to existing questions"
                                >
                                    <Zap className="w-4 h-4 text-yellow-400" />
                                    Enrich Context
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('linkOutcomes')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-sky-500/50 text-sm font-bold transition-all hover-lift text-[rgb(var(--color-text-primary))] light:text-slate-900"
                                    title="Auto-assign syllabus outcomes to questions"
                                >
                                    <Link className="w-4 h-4 text-sky-400" />
                                    Link Outcomes
                                </button>
                            </div>
                        ) : (
                             <div className="ml-auto">
                                <button 
                                    onClick={onClose}
                                    className="px-5 py-2.5 rounded-xl font-medium text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors border border-transparent hover:border-[rgb(var(--color-border-secondary))]"
                                >
                                    Close Dashboard
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>,
    document.body
  );
};

export default ContentAuditModal;
