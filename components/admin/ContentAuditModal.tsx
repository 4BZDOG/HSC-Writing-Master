
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Course, Topic, SubTopic, DotPoint, Prompt, StatePath, CommandTermInfo, SampleAnswer } from '../../types';
import { BatchTask, runBatchOperations, BatchProgress } from '../../utils/batchProcessor';
import { generateNewPrompt, generateSampleAnswer, generateRubricForPrompt, suggestOutcomesForPrompt, evaluateAnswer } from '../../services/geminiService';
import { getCommandTermsForMarks, extractCommandVerb, getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { getBandConfig, escapeRegExp } from '../../utils/renderUtils';
import { filterDataBySelection } from '../../utils/dataManagerUtils';
import CognitiveSpectrum from '../CognitiveSpectrum';
import { 
  ChevronRight, ChevronDown, CheckSquare, Square, Sparkles, 
  FileText, X, Folder, Layers, Hash, BookOpen, Database, Zap,
  BarChart3, Play, Square as StopSquare, Filter, AlertTriangle, Terminal,
  PieChart, Link, Download, Cpu, Activity, ShieldCheck, ListChecks, Link2,
  Search, RotateCcw, Scale, Gauge
} from 'lucide-react';

// --- Shared Components ---

const MeshOverlay = ({ opacity = "opacity-[0.03]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

const InstrumentMetric = ({ label, value, subValue, colorClass }: { label: string, value: string | number, subValue?: string, colorClass: string }) => (
    <div className="flex flex-col gap-1 px-8 py-4 border-r border-white/5 last:border-r-0">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">{label}</span>
        <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-black tracking-tighter tabular-nums ${colorClass}`}>{value}</span>
            {subValue && <span className="text-xs font-bold text-white/10 uppercase tracking-widest">{subValue}</span>}
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

type VisibilityFilter = 'emptyDotPoints' | 'missingSamples' | 'unEnriched' | 'missingOutcomes' | 'missingRubrics' | 'rubricNotDescending' | 'hasSamples' | null;

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
    return nodes.reduce((acc, node) => ({
      questions: acc.questions + node.stats.questions,
      samples: acc.samples + node.stats.samples,
      enriched: acc.enriched + node.stats.enriched,
      missingOutcomes: acc.missingOutcomes + node.stats.missingOutcomes,
      missingMarkingCriteria: acc.missingMarkingCriteria + node.stats.missingMarkingCriteria,
      rubricNotDescending: acc.rubricNotDescending + node.stats.rubricNotDescending,
      totalDotPoints: acc.totalDotPoints + node.stats.totalDotPoints,
      coveredDotPoints: acc.coveredDotPoints + node.stats.coveredDotPoints,
    }), { questions: 0, samples: 0, enriched: 0, missingOutcomes: 0, missingMarkingCriteria: 0, rubricNotDescending: 0, totalDotPoints: 0, coveredDotPoints: 0 });
  };

  return courses.map(course => {
    const courseOutcomeCodes = new Set(course.outcomes.map(o => o.code));

    const topics = (course.topics || []).map(topic => {
      const subTopics = (topic.subTopics || []).map(st => {
        const dotPoints = (st.dotPoints || []).map(dp => {
            const verbInfo = extractCommandVerb(dp.description);
            const prompts = (dp.prompts || []).map(p => {
                // 1. Outcomes
                const validOutcomes = Array.isArray(p.linkedOutcomes) 
                    ? p.linkedOutcomes.filter(o => typeof o === 'string' && o.trim().length > 0 && courseOutcomeCodes.has(o)) 
                    : [];
                
                // 2. Keywords
                const validKeywords = Array.isArray(p.keywords) 
                    ? p.keywords.filter(k => typeof k === 'string' && k.trim().length > 0)
                    : [];
                
                // 3. Scenario
                const hasScenario = typeof p.scenario === 'string' && p.scenario.trim().length > 15;
                
                // 4. Rubric
                const hasRubric = typeof p.markingCriteria === 'string' && p.markingCriteria.trim().length > 25;
                const rubricNonStd = isNonStandardRubric(p.markingCriteria);

                // 5. Samples
                const validSamples = Array.isArray(p.sampleAnswers) 
                    ? p.sampleAnswers.filter(sa => typeof sa.answer === 'string' && sa.answer.trim().length > 30)
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
                        coveredDotPoints: 0
                    },
                    dataRef: p,
                    path: { courseId: course.id, topicId: topic.id, subTopicId: st.id, dotPointId: dp.id, promptId: p.id }
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
                    missingMarkingCriteria: prompts.reduce((sum, p) => sum + p.stats.missingMarkingCriteria, 0),
                    rubricNotDescending: prompts.reduce((sum, p) => sum + p.stats.rubricNotDescending, 0),
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

const ContentAuditModal: React.FC<ContentAuditModalProps> = ({ isOpen, onClose, courses, updateCourses, showToast }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<VisibilityFilter>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const treeData = useMemo(() => buildAuditTree(courses), [courses]);

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

  const counts = useMemo(() => {
      let emptyDotPoints = 0;
      let missingSamples = 0;
      let unEnriched = 0;
      let missingOutcomes = 0;
      let missingRubrics = 0;
      let nonStandardRubrics = 0;
      let hasSamples = 0;
      
      flatMap.forEach(node => {
          if (node.type === 'dotPoint' && node.stats.questions === 0) emptyDotPoints++;
          if (node.type === 'prompt') {
              if (node.stats.samples === 0) missingSamples++;
              if (node.stats.enriched === 0) unEnriched++;
              if (node.stats.missingOutcomes > 0) missingOutcomes++;
              if (node.stats.missingMarkingCriteria > 0) missingRubrics++;
              if (node.stats.rubricNotDescending > 0) nonStandardRubrics++;
              if (node.stats.samples > 0) hasSamples++;
          }
      });
      
      return { emptyDotPoints, missingSamples, unEnriched, missingOutcomes, missingRubrics, nonStandardRubrics, hasSamples };
  }, [flatMap]);

  const filteredTreeData = useMemo(() => {
      if (!searchQuery && !activeFilter) return treeData;

      const filterNode = (node: TreeNode): TreeNode | null => {
          const matchesSearch = node.label.toLowerCase().includes(searchQuery.toLowerCase());
          
          let matchesGap = true;
          if (activeFilter) {
              if (activeFilter === 'emptyDotPoints') matchesGap = node.type === 'dotPoint' && node.stats.questions === 0;
              else if (activeFilter === 'missingSamples') matchesGap = node.type === 'prompt' && node.stats.samples === 0;
              else if (activeFilter === 'unEnriched') matchesGap = node.type === 'prompt' && node.stats.enriched === 0;
              else if (activeFilter === 'missingOutcomes') matchesGap = node.type === 'prompt' && node.stats.missingOutcomes > 0;
              else if (activeFilter === 'missingRubrics') matchesGap = node.type === 'prompt' && node.stats.missingMarkingCriteria > 0;
              else if (activeFilter === 'rubricNotDescending') matchesGap = node.type === 'prompt' && node.stats.rubricNotDescending > 0;
              else if (activeFilter === 'hasSamples') matchesGap = node.type === 'prompt' && node.stats.samples > 0;
          }

          // Recursive check for children
          const filteredChildren = (node.children || [])
              .map(child => filterNode(child))
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
              if (node.type === 'prompt' || (node.type === 'dotPoint' && activeFilter === 'emptyDotPoints')) {
                  return node;
              }
              // If we are searching and there's no gap filter, we show the path
              if (searchQuery && !activeFilter) return node;
          }

          return null;
      };

      return treeData.map(node => filterNode(node)).filter(Boolean) as TreeNode[];
  }, [treeData, searchQuery, activeFilter]);

  useEffect(() => {
    if (isOpen && expandedIds.size === 0) {
        setExpandedIds(new Set(treeData.map(c => c.id)));
    }
  }, [isOpen, treeData, expandedIds.size]);

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
  
  const handleFilterToggle = (criteria: VisibilityFilter) => {
      if (activeFilter === criteria) {
          setActiveFilter(null);
      } else {
          setActiveFilter(criteria);
          // Auto-expand everything that matches
          const newExpanded = new Set(expandedIds);
          const traverse = (nodes: TreeNode[]) => {
              nodes.forEach(n => {
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
          let match = false;
          if (criteria === 'emptyDotPoints' && node.type === 'dotPoint' && node.stats.questions === 0) match = true;
          if (criteria === 'missingSamples' && node.type === 'prompt' && node.stats.samples === 0) match = true;
          if (criteria === 'unEnriched' && node.type === 'prompt' && node.stats.enriched === 0) match = true;
          if (criteria === 'missingOutcomes' && node.type === 'prompt' && node.stats.missingOutcomes > 0) match = true;
          if (criteria === 'missingRubrics' && node.type === 'prompt' && node.stats.missingMarkingCriteria > 0) match = true;
          if (criteria === 'rubricNotDescending' && node.type === 'prompt' && node.stats.rubricNotDescending > 0) match = true;
          if (criteria === 'hasSamples' && node.type === 'prompt' && node.stats.samples > 0) match = true;

          if (match) {
              newSelected.add(node.id);
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
      showToast(`Selected ${newSelected.size} items for optimisation.`, 'success');
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        showToast("Optimisation engine stopped.", "info");
    }
    setIsProcessing(false);
  };

  const handleBulkAction = async (actionType: 'generateQuestions' | 'generateSamples' | 'generateRubrics' | 'linkOutcomes' | 'recalibrateSamples') => {
      setIsProcessing(true);
      setProgress(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const tasks: BatchTask<any>[] = [];

      selectedIds.forEach(id => {
          const node = flatMap.get(id);
          if (!node) return;

          if (actionType === 'generateQuestions' && node.type === 'dotPoint' && node.stats.questions === 0) {
              tasks.push({
                  id: `q-${node.id}`,
                  description: `Generating question: ${node.label.slice(0, 30)}...`,
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
                          const tierRanges: Record<number, [number, number]> = { 1: [1, 2], 2: [3, 4], 3: [4, 6], 4: [5, 8], 5: [6, 10], 6: [8, 12] };
                          const range = tierRanges[maxTier] || [4, 8];
                          targetMarks = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
                          const { terms } = getCommandTermsForMarks(targetMarks);
                          verbsToUse = terms;
                          if (!verbsToUse.find(v => v.term === syllabusVerbInfo.term)) verbsToUse.unshift(syllabusVerbInfo);
                      } else {
                          const { terms } = getCommandTermsForMarks(5);
                          verbsToUse = terms;
                      }
                      
                      const prompt = await generateNewPrompt(course.name, topic.name, description, targetMarks, verbsToUse, course.outcomes);
                      updateCourses(draft => {
                          const dp = draft.find((x: any) => x.id === path.courseId)?.topics.find((x: any) => x.id === path.topicId)?.subTopics.find((x: any) => x.id === path.subTopicId)?.dotPoints.find((x: any) => x.id === path.dotPointId);
                          if (dp) dp.prompts.push(prompt);
                      });
                  }
              });
          }

          if (actionType === 'generateSamples' && node.type === 'prompt' && node.stats.samples === 0) {
              tasks.push({
                  id: `sa-${node.id}`,
                  description: `Drafting sample answer: ${node.label.slice(0, 30)}...`,
                  action: async () => {
                      const prompt = node.dataRef as Prompt;
                      const answer = await generateSampleAnswer(prompt, prompt.totalMarks, []);
                      updateCourses(draft => {
                          const p = draft.find((x: any) => x.id === node.path.courseId)?.topics.find((x: any) => x.id === node.path.topicId)?.subTopics.find((x: any) => x.id === node.path.subTopicId)?.dotPoints.find((x: any) => x.id === node.path.dotPointId)?.prompts.find((x: any) => x.id === node.path.promptId);
                          if (p) { if (!p.sampleAnswers) p.sampleAnswers = []; p.sampleAnswers.push(answer); }
                      });
                  }
              });
          }

          if (actionType === 'generateRubrics' && node.type === 'prompt' && (node.stats.missingMarkingCriteria > 0 || node.stats.rubricNotDescending > 0)) {
              tasks.push({
                  id: `rubric-${node.id}`,
                  description: `Synthesising rubric: ${node.label.slice(0, 30)}...`,
                  action: async () => {
                      const prompt = node.dataRef as Prompt;
                      const course = courses.find(c => c.id === node.path.courseId);
                      if (!course) return;
                      const rubric = await generateRubricForPrompt(prompt, course.outcomes);
                      updateCourses(draft => {
                          const p = draft.find((x: any) => x.id === node.path.courseId)?.topics.find((x: any) => x.id === node.path.topicId)?.subTopics.find((x: any) => x.id === node.path.subTopicId)?.dotPoints.find((x: any) => x.id === node.path.dotPointId)?.prompts.find((x: any) => x.id === node.path.promptId);
                          if (p) p.markingCriteria = rubric;
                      });
                  }
              });
          }

          if (actionType === 'linkOutcomes' && node.type === 'prompt' && node.stats.missingOutcomes > 0) {
              tasks.push({
                  id: `link-${node.id}`,
                  description: `Linking outcomes: ${node.label.slice(0, 30)}...`,
                  action: async () => {
                      const prompt = node.dataRef as Prompt;
                      const course = courses.find(c => c.id === node.path.courseId);
                      if (!course) return;
                      const suggested = await suggestOutcomesForPrompt(prompt.question, course.outcomes, prompt.totalMarks);
                      updateCourses(draft => {
                          const p = draft.find((x: any) => x.id === node.path.courseId)?.topics.find((x: any) => x.id === node.path.topicId)?.subTopics.find((x: any) => x.id === node.path.subTopicId)?.dotPoints.find((x: any) => x.id === node.path.dotPointId)?.prompts.find((x: any) => x.id === node.path.promptId);
                          if (p) p.linkedOutcomes = suggested;
                      });
                  }
              });
          }

          if (actionType === 'recalibrateSamples' && node.type === 'prompt' && node.stats.samples > 0) {
             const prompt = node.dataRef as Prompt;
             // Calculate strict constraints based on the Prompt's Verb
             const verbInfo = getCommandTermInfo(prompt.verb);
             const verbTier = verbInfo.tier;

             // Only recalibrate existing samples
             if (prompt.sampleAnswers && prompt.sampleAnswers.length > 0) {
                 prompt.sampleAnswers.forEach(sample => {
                     tasks.push({
                         id: `recal-${sample.id}`,
                         description: `Recalibrating sample (Tier ${verbTier} rules): ${node.label.slice(0, 20)}...`,
                         action: async () => {
                             // 1. Create a clean calibration prompt without existing samples to prevent bias
                             const calibrationPrompt = { ...prompt, sampleAnswers: [] };
                             
                             // 2. Ask AI to evaluate the Mark (quality), passing the Tier context
                             const result = await evaluateAnswer(sample.answer, calibrationPrompt, verbInfo);
                             
                             // 3. Enforce STRICT band calculation based on the AI's Mark and the Question's Tier.
                             // This overrides any band hallucinated by the AI, ensuring structural consistency across the dataset.
                             const strictBand = getBandForMark(result.overallMark, prompt.totalMarks, verbTier);

                             updateCourses(draft => {
                                 const p = draft.find((x: any) => x.id === node.path.courseId)?.topics.find((x: any) => x.id === node.path.topicId)?.subTopics.find((x: any) => x.id === node.path.subTopicId)?.dotPoints.find((x: any) => x.id === node.path.dotPointId)?.prompts.find((x: any) => x.id === node.path.promptId);
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
                         }
                     });
                 });
             }
          }
      });

      if (tasks.length === 0) {
          showToast("No target items found in current selection.", "info");
          setIsProcessing(false);
          return;
      }

      await runBatchOperations(tasks, 1, (prog) => setProgress(prog), controller.signal); 
      setIsProcessing(false);
      abortControllerRef.current = null;
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
      const isSelected = selectedIds.has(node.id);
      const isExpanded = expandedIds.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const coveragePct = node.stats.totalDotPoints > 0 ? Math.round((node.stats.coveredDotPoints / node.stats.totalDotPoints) * 100) : 0;
      const coverageColor = coveragePct < 50 ? 'text-red-400' : coveragePct < 80 ? 'text-amber-400' : 'text-emerald-400';

      return (
          <div key={node.id} className="relative">
              {level > 0 && <div className="absolute left-0 top-0 bottom-0 w-px bg-white/5" style={{ left: `${level * 24 + 23}px` }} />}
              <div className={`flex items-center py-2.5 px-6 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-all group border-b border-white/5 ${isSelected ? 'bg-indigo-500/5' : ''}`} style={{ paddingLeft: `${level * 24 + 16}px` }}>
                  <button onClick={() => toggleSelect(node.id, !isSelected)} className={`mr-4 transition-all ${isSelected ? 'opacity-100 scale-110' : 'opacity-30 group-hover:opacity-100'}`}>
                      {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                  </button>
                  <button onClick={() => toggleExpand(node.id)} className={`mr-2 p-1 text-slate-500 ${hasChildren ? 'visible' : 'invisible'}`}>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                      {node.type === 'course' && <BookOpen className="w-4 h-4 text-sky-400" />}
                      {node.type === 'topic' && <Layers className="w-4 h-4 text-purple-400" />}
                      {node.type === 'subTopic' && <Folder className="w-4 h-4 text-indigo-400" />}
                      {node.type === 'dotPoint' && <Hash className="w-4 h-4 text-slate-600" />}
                      {node.type === 'prompt' && <FileText className="w-4 h-4 text-emerald-400" />}
                      <span className={`text-sm truncate font-medium ${node.type === 'course' || node.type === 'topic' ? 'font-black text-white light:text-slate-900 uppercase tracking-tight' : 'text-slate-300 light:text-slate-700'}`}>
                          {node.label}
                      </span>
                  </div>
                  {node.type !== 'prompt' && (
                      <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-white/5 ${coverageColor} bg-black/20`}>
                          <PieChart className="w-3 h-3" /> {coveragePct}%
                      </div>
                  )}
                  <div className="flex items-center gap-6 ml-4 text-[10px] font-bold text-slate-500 font-mono">
                      {node.type !== 'prompt' && <div className="w-12 text-right">{node.stats.questions} Q</div>}
                      {node.type !== 'prompt' && <div className="w-12 text-right">{node.stats.samples} S</div>}
                  </div>
              </div>
              {isExpanded && node.children && <div>{node.children.map(child => renderNode(child, level + 1))}</div>}
          </div>
      );
  };

  if (!isOpen) return null;

  const totalQuestions = treeData.reduce((sum, n) => sum + n.stats.questions, 0);
  const totalSamples = treeData.reduce((sum, n) => sum + n.stats.samples, 0);
  const totalDotPoints = treeData.reduce((sum, n) => sum + n.stats.totalDotPoints, 0);
  const coveredDotPoints = treeData.reduce((sum, n) => sum + n.stats.coveredDotPoints, 0);
  const healthPercentage = totalDotPoints > 0 ? Math.round((coveredDotPoints / totalDotPoints) * 100) : 0;
  const healthColor = healthPercentage < 50 ? 'text-red-400' : healthPercentage < 80 ? 'text-amber-400' : 'text-emerald-400';

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-[rgb(var(--color-bg-base))] light:bg-slate-50 flex flex-col animate-fade-in">
        {/* Studio Header */}
        <div className="flex-shrink-0 border-b border-white/5 bg-[rgb(var(--color-bg-surface))] light:bg-white z-20 shadow-2xl relative">
            <MeshOverlay opacity="opacity-[0.05]" />
            <div className="px-10 py-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10">
                <div className="flex items-start gap-8 flex-1">
                    <div className="w-20 h-20 rounded-[32px] bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center shadow-2xl shadow-indigo-900/20 shrink-0">
                        <Activity className="w-10 h-10 text-indigo-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-indigo-400">Content Overview</span>
                             <div className="h-px w-12 bg-indigo-500/20" />
                        </div>
                        <h2 className="text-4xl font-black text-white light:text-slate-900 tracking-tighter italic uppercase leading-none">Content Audit Studio</h2>
                        <p className="text-sm text-slate-400 font-medium mt-4 leading-relaxed max-w-lg">Analytical overview of curriculum coverage. Detect resource gaps and perform bulk synthesis to align content with NESA performance standards.</p>
                    </div>
                </div>

                <div className="flex items-center bg-black/40 light:bg-slate-50 rounded-[40px] border border-white/5 p-2 shadow-inner">
                    <div className="flex items-center gap-6 px-10 py-4 border-r border-white/5">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="transform -rotate-90 w-16 h-16" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
                                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={176} strokeDashoffset={176 - (healthPercentage * 1.76)} strokeLinecap="round" className={`${healthColor} transition-all duration-1000`} />
                            </svg>
                            <span className={`absolute text-xs font-black ${healthColor}`}>{healthPercentage}%</span>
                        </div>
                        <div>
                             <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Overall Health</span>
                             <div className="flex items-baseline gap-2">
                                <span className={`text-3xl font-black ${healthColor} tracking-tighter`}>{coveredDotPoints}</span>
                                <span className="text-[10px] font-bold text-white/10 uppercase">/ {totalDotPoints} Points</span>
                             </div>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <InstrumentMetric label="Content Units" value={totalQuestions} subValue="Questions" colorClass="text-white" />
                        <InstrumentMetric label="Proof Data" value={totalSamples} subValue="Samples" colorClass="text-indigo-400" />
                    </div>
                    <button onClick={onClose} className="p-4 rounded-full hover:bg-white/5 text-slate-500 transition-colors ml-4 mr-2">
                        <X className="w-8 h-8" />
                    </button>
                </div>
            </div>

            {/* Smart Select Action Bar */}
            <div className="px-10 pb-8 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-4 bg-black/20 rounded-2xl p-1.5 border border-white/5 mr-2 transition-all group focus-within:border-indigo-500/50 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                    <div className="relative group/search">
                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/search:text-indigo-400 transition-colors" />
                         <input 
                            type="text" 
                            placeholder="Search curriculum..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent pl-11 pr-4 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none w-64"
                         />
                    </div>
                    {(searchQuery || activeFilter) && (
                        <button 
                            onClick={() => { setSearchQuery(''); setActiveFilter(null); }}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white flex items-center gap-2 border-l border-white/5 transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Reset
                        </button>
                    )}
                </div>

                <div className="h-8 w-px bg-white/5 mx-2" />

                <button 
                    onClick={() => handleFilterToggle('emptyDotPoints')} 
                    className={`group relative overflow-hidden px-6 h-12 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all flex items-center gap-4 ${activeFilter === 'emptyDotPoints' ? 'bg-red-500/20 border-red-500/40 text-red-400 shadow-lg' : 'bg-red-500/5 border-red-500/10 text-red-400 hover:bg-red-500/10'}`}
                >
                    <span>Empty Dot Points</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-lg text-[10px]">{counts.emptyDotPoints}</span>
                </button>
                <button 
                    onClick={() => handleFilterToggle('missingRubrics')} 
                    className={`group relative overflow-hidden px-6 h-12 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all flex items-center gap-4 ${activeFilter === 'missingRubrics' ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 shadow-lg' : 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10'}`}
                >
                    <span>No Marking Guide</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-lg text-[10px]">{counts.missingRubrics}</span>
                </button>
                <button 
                    onClick={() => handleFilterToggle('rubricNotDescending')} 
                    className={`group relative overflow-hidden px-6 h-12 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all flex items-center gap-4 ${activeFilter === 'rubricNotDescending' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400 shadow-lg' : 'bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10'}`}
                >
                    <span>Non-Std Rubric</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-lg text-[10px]">{counts.nonStandardRubrics}</span>
                </button>
                <button 
                    onClick={() => handleFilterToggle('missingSamples')} 
                    className={`group relative overflow-hidden px-6 h-12 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all flex items-center gap-4 ${activeFilter === 'missingSamples' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-lg' : 'bg-amber-500/5 border-amber-500/10 text-amber-400 hover:bg-amber-500/10'}`}
                >
                    <span>Missing Samples</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-lg text-[10px]">{counts.missingSamples}</span>
                </button>
                <button 
                    onClick={() => handleFilterToggle('hasSamples')} 
                    className={`group relative overflow-hidden px-6 h-12 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all flex items-center gap-4 ${activeFilter === 'hasSamples' ? 'bg-teal-500/20 border-teal-500/40 text-teal-400 shadow-lg' : 'bg-teal-500/5 border-teal-500/10 text-teal-400 hover:bg-teal-500/10'}`}
                >
                    <span>Has Samples</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-lg text-[10px]">{counts.hasSamples}</span>
                </button>

                <div className="flex-1" />
                
                {activeFilter && (
                    <button 
                        onClick={() => handleSmartSelect(activeFilter)}
                        className="px-6 h-12 rounded-2xl bg-white/10 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2 shadow-lg"
                    >
                        <CheckSquare className="w-4 h-4" /> Select All Filtered
                    </button>
                )}
            </div>
        </div>

        {/* Tree Container */}
        <div className="flex-1 overflow-y-auto bg-[rgb(var(--color-bg-base))] custom-scrollbar">
             <div className="min-w-[1000px] pb-40">
                 {filteredTreeData.length > 0 ? (
                     filteredTreeData.map(node => renderNode(node))
                 ) : (
                     <div className="py-40 text-center animate-fade-in">
                         <div className="w-24 h-24 rounded-[40px] bg-white/5 flex items-center justify-center border border-white/5 mb-8 mx-auto shadow-inner">
                            <Filter className="w-12 h-12 text-slate-700" />
                         </div>
                         <h3 className="text-2xl font-black text-white tracking-tight italic uppercase">No items found</h3>
                         <p className="text-sm text-slate-500 mt-2 font-bold uppercase tracking-widest">Refine your search or filters</p>
                     </div>
                 )}
             </div>
        </div>

        {/* Operations Terminal (Footer) */}
        <div className={`border-t border-white/5 bg-[rgb(var(--color-bg-surface))] px-10 flex flex-col flex-shrink-0 relative shadow-[0_-32px_64px_-16px_rgba(0,0,0,0.5)] transition-all duration-500 ${isProcessing ? 'h-80' : 'h-24'}`}>
            <MeshOverlay opacity="opacity-[0.05]" />
            {isProcessing && progress && (
                <div className="flex-1 overflow-hidden flex flex-col py-6 animate-fade-in">
                     <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <Terminal className="w-5 h-5 text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic">Processing Log</span>
                        </div>
                        <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest">
                            <span className="text-emerald-400">Completed: {progress.completed}</span>
                            <span className="text-red-400">Failed: {progress.failed}</span>
                            <span className="text-slate-500">Total: {progress.total}</span>
                        </div>
                    </div>
                    <div className="flex-1 bg-black/40 rounded-3xl border border-white/5 p-6 overflow-y-auto font-mono text-xs text-indigo-300/60 space-y-2 custom-scrollbar shadow-inner">
                        {progress.logs.map((log, i) => <div key={i} className="animate-fade-in truncate">> {log}</div>)}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}

            <div className={`flex items-center justify-between transition-all duration-500 ${isProcessing ? 'h-20 border-t border-white/5' : 'h-full'}`}>
                 {isProcessing && progress ? (
                    <div className="w-full flex items-center gap-8 animate-fade-in">
                        <div className="flex-1 h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                            <div className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 relative rounded-full" style={{ width: `${(progress.completed / progress.total) * 100}%` }}>
                                <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                            </div>
                        </div>
                        <button onClick={handleStop} className="px-10 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">Stop Process</button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-white font-black text-2xl tracking-tighter italic">
                                {selectedIds.size.toString().padStart(2, '0')}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Selected for Optimisation</span>
                        </div>
                        
                        <div className="flex gap-4">
                            <button onClick={handleBulkAction.bind(null, 'generateQuestions')} disabled={selectedIds.size === 0} className="px-6 h-12 rounded-[20px] bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">Generate Questions</button>
                            <button onClick={handleBulkAction.bind(null, 'generateRubrics')} disabled={selectedIds.size === 0} className="px-6 h-12 rounded-[20px] bg-sky-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">Generate Rubrics</button>
                            <button onClick={handleBulkAction.bind(null, 'generateSamples')} disabled={selectedIds.size === 0} className="px-6 h-12 rounded-[20px] bg-purple-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">Generate Samples</button>
                            <button onClick={handleBulkAction.bind(null, 'recalibrateSamples')} disabled={selectedIds.size === 0} className="px-6 h-12 rounded-[20px] bg-teal-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-2"><Scale className="w-4 h-4"/>Recalibrate Samples</button>
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
