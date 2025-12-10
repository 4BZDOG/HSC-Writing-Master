
import React, { useState, useRef, useEffect } from 'react';
import { Course, StatePath, EvaluationResult, Prompt, UserRole, Topic, SubTopic, DotPoint, SampleAnswer } from '../types';
import PromptDisplay from './PromptDisplay';
import ReferenceMaterials from './ReferenceMaterials';
import CommandTermGuideModal from './CommandTermGuideModal';
import Breadcrumb from './Breadcrumb';
import { getCommandTermInfo } from '../data/commandTerms';
import { findAndUpdateItem } from '../utils/stateUtils';
import { generateId } from '../utils/idUtils';
import WorkspaceRightPanel from './WorkspaceRightPanel';

// Helper hook for keyboard shortcuts
const useKeyboardShortcuts = (shortcuts: { [key: string]: (e: KeyboardEvent) => void }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused, unless it's a specific modifier combo we allow globally
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      if (isInput) {
          if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
               e.preventDefault();
               if (shortcuts['F']) shortcuts['F'](e);
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
               if (shortcuts['Enter']) shortcuts['Enter'](e);
          }
          // Allow escape to blur
          if (e.key === 'Escape') {
              target.blur();
          }
          return; 
      }

      if (shortcuts[e.key]) {
        shortcuts[e.key](e);
      } else if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (shortcuts['F']) shortcuts['F'](e);
      }
    };

    // Cast to any to bypass TS EventListener issues
    window.addEventListener('keydown', handleKeyDown as any);
    return () => window.removeEventListener('keydown', handleKeyDown as any);
  }, [shortcuts]);
};

interface WorkspaceProps {
  courses: Course[];
  statePath: StatePath;
  currentSelection: {
    currentCourse?: Course;
    currentTopic?: Topic;
    currentSubTopic?: SubTopic;
    currentDotPoint?: DotPoint;
    currentPrompt?: Prompt;
  };
  editorRef: React.RefObject<{ getText: () => string; setText: (text: string) => void; insertText: (text: string) => void }>;
  userAnswer: string;
  debouncedUserAnswer: string;
  setUserAnswer: (val: string) => void;
  evaluationResult: EvaluationResult | null;
  isEvaluating: boolean;
  evaluationError: string | null;
  isEnriching: boolean;
  enrichError: string | null;
  isImproving: boolean;
  improveAnswerError: string | null;
  evaluatedAnswer: string;
  handleEvaluate: () => void;
  geminiHandlers: any;
  modalHandlers: any;
  syllabusHandlers: any;
  userRole: UserRole;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

const Workspace: React.FC<WorkspaceProps> = ({
  courses,
  statePath,
  currentSelection,
  editorRef, // Kept for backward compat or parent refs if needed
  userAnswer,
  debouncedUserAnswer,
  setUserAnswer,
  evaluationResult,
  isEvaluating,
  evaluationError,
  isEnriching,
  enrichError,
  isImproving,
  improveAnswerError,
  evaluatedAnswer,
  handleEvaluate,
  geminiHandlers,
  modalHandlers,
  syllabusHandlers,
  userRole,
  isFocusMode,
  onToggleFocusMode,
}) => {
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt } = currentSelection;
  
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [editorHeight, setEditorHeight] = useState<string | undefined>(undefined);
  
  const promptDisplayRef = useRef<HTMLDivElement>(null);

  const courseOutcomes = currentCourse?.outcomes || [];

  // Auto-scroll to results when evaluation completes
  useEffect(() => {
    if (evaluationResult) {
        const el = document.getElementById('evaluation-results');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [evaluationResult]);

  // Sync Editor Height with PromptDisplay
  useEffect(() => {
    if (!isFocusMode && promptDisplayRef.current) {
        const measure = () => {
            if (promptDisplayRef.current) {
                const height = promptDisplayRef.current.offsetHeight;
                // Ensure a comfortable minimum height (e.g., 500px) so it's never too small
                setEditorHeight(`${Math.max(height, 500)}px`);
            }
        };
        
        // Measure immediately
        measure();

        // Set up observer to handle dynamic content changes (e.g. enrichment loading, resizing)
        const observer = new ResizeObserver(() => {
            requestAnimationFrame(measure);
        });
        observer.observe(promptDisplayRef.current);

        return () => observer.disconnect();
    }
  }, [isFocusMode, currentPrompt?.id]);

  // Save Draft Functionality
  const handleSaveDraft = () => {
      if (!currentPrompt) return;
      if (userAnswer !== currentPrompt.userDraft) {
          syllabusHandlers.updateCourses((draft: any) => {
            findAndUpdateItem(draft, statePath, (p: any) => {
                p.userDraft = userAnswer;
            });
          });
      }
  };

  const handleAddWord = (word: string) => {
    // Access the editor instance via the ref passed to WorkspaceRightPanel -> Editor
    // Since WorkspaceRightPanel creates its own ref, we need a way to pass this up or access it.
    // However, the cleanest way without ref forwarding hell is to rely on WorkspaceRightPanel to handle the insertion
    // But ReferenceMaterials is a sibling.
    
    // Correction: WorkspaceRightPanel is a child of Workspace. ReferenceMaterials is also a child.
    // We need a shared ref or callback.
    // The `editorRef` prop passed to Workspace IS used in App.tsx but seemingly unused inside Workspace currently?
    // Let's check App.tsx... ah, App.tsx creates it but doesn't attach it to the Editor component, WorkspaceRightPanel does.
    
    // To solve this simply: We will dispatch a custom event that the Editor listens to, or better yet,
    // Since WorkspaceRightPanel holds the editor, we can just pass a callback if we lift the ref?
    // Actually, WorkspaceRightPanel creates its OWN `editorRef`. 
    // Let's use a custom event for simplicity across layout components or just accept that 
    // ReferenceMaterials needs to communicate with the Editor.
    
    // BETTER FIX: We can trigger the insertion by updating a transient state or event.
    // OR, simpler: We can find the textarea element by ID or class if we really have to, but that's messy.
    
    // Let's implement a simple event bus or just look for the active element? No.
    // Let's use the window event dispatch.
    const event = new CustomEvent('insert-text', { detail: word });
    window.dispatchEvent(event);
  };
  
  // Wrapper for evaluation to also save draft
  const onInternalEvaluate = () => {
      handleSaveDraft();
      handleEvaluate();
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'Enter': (e: KeyboardEvent) => {
      if (!isEvaluating && userAnswer.trim() && (e.ctrlKey || e.metaKey)) {
        onInternalEvaluate();
      }
    },
    'F': () => {
      onToggleFocusMode();
    }
  });

  const handleRunQualityCheck = (content: string, type: 'question' | 'code') => {
      modalHandlers.showQualityCheck({
          content,
          type,
          onUpdate: (newContent: string) => {
             syllabusHandlers.updateCourses((draft: any) => {
                findAndUpdateItem(draft, statePath, (p: any) => {
                    if (type === 'question') {
                        p.question = newContent;
                    }
                });
             });
          }
      });
  };

  // Sync userAnswer with the selected prompt's saved draft
  useEffect(() => {
      if (currentPrompt) {
          setUserAnswer(currentPrompt.userDraft || '');
      } else {
          setUserAnswer('');
      }
  }, [currentPrompt?.id]);

  // --- DEV TOOLS HANDLERS ---
  const handleDevMockEvaluation = () => {
      const mockResult: EvaluationResult = {
          overallBand: 4,
          overallMark: Math.floor(currentPrompt ? currentPrompt.totalMarks * 0.6 : 10),
          overallFeedback: "This is a simulated evaluation result for testing UI layouts and feedback rendering. The analysis highlights key areas but notes missing depth in specific examples.",
          criteria: [
              { criterion: "Understanding of key concepts", mark: 2, maxMark: 3, feedback: "Demonstrates sound understanding." },
              { criterion: "Application to scenario", mark: 2, maxMark: 4, feedback: "Some application present but generic." }
          ],
          strengths: ["Clear structure.", "Correct definition of core terms."],
          improvements: ["Include more specific examples.", "Link cause and effect more clearly."],
          userFeedback: undefined
      };
      geminiHandlers.setEvaluationResult(mockResult);
  };

  const handleDevMockImprovement = () => {
      const currentText = userAnswer || "This is a placeholder answer for testing purposes.";
      
      const mockImproved = currentText + "\n\n**Improved Section:**\nHere is an example of how the AI might expand on your answer. It uses *precise terminology* and links concepts to the **syllabus outcomes** more effectively.\n\n- Point 1: Clearer definition.\n- Point 2: Stronger link to the question verb.";
      
      geminiHandlers.setOriginalAnswerForImprovement(currentText);
      geminiHandlers.setImprovedAnswer(mockImproved);
  };

  if (!currentPrompt) return null;

  const breadcrumbItems = [
    { label: currentCourse?.name || 'Course' },
    { label: currentTopic?.name || 'Topic' },
    { label: currentSubTopic?.name || 'SubTopic' },
    { label: currentDotPoint?.description || 'Dot Point' },
    { label: currentPrompt.question || 'Question' }
  ];

  return (
    <div className="flex flex-col h-full">
        
        {!isFocusMode && (
            <div className="w-full px-4 sm:px-0 mb-4 flex-shrink-0">
                <Breadcrumb items={breadcrumbItems.map(b => ({ label: b.label }))} />
            </div>
        )}

        <div className={`grid grid-cols-1 ${isFocusMode ? 'lg:grid-cols-1 w-full' : 'lg:grid-cols-12'} gap-6 flex-1 min-h-0 transition-all duration-500`}>
            
            {/* Left Column: Context & Reference */}
            {!isFocusMode && (
                <div className="lg:col-span-5 space-y-6 flex flex-col h-full overflow-y-auto px-4 pb-20 pt-4 scrollbar-hide">
                    <div ref={promptDisplayRef}>
                        <PromptDisplay 
                            prompt={currentPrompt}
                            isEnriching={isEnriching}
                            enrichError={enrichError}
                            onVerbClick={() => setIsGuideOpen(true)}
                            onGenerateScenario={geminiHandlers.handleGenerateScenario}
                            onUpdatePrompt={(updates) => syllabusHandlers.updateCourses((draft: any) => {
                                findAndUpdateItem(draft, statePath, (p: any) => Object.assign(p, updates));
                            })}
                            isGeneratingScenario={geminiHandlers.isGeneratingScenario}
                            generateScenarioError={geminiHandlers.generateScenarioError}
                            courseOutcomes={courseOutcomes}
                            onOutcomeClick={(outcome) => { /* Handle outcome click if needed */ }}
                            userRole={userRole}
                            onDismissEnrichError={() => geminiHandlers.setEnrichError(null)}
                            onRunQualityCheck={handleRunQualityCheck}
                        />
                    </div>
                    
                    <ReferenceMaterials 
                        prompt={currentPrompt}
                        topic={currentTopic}
                        onKeywordsChange={(keywords) => {
                            syllabusHandlers.updateCourses((draft: any) => {
                                findAndUpdateItem(draft, statePath, (p: any) => { p.keywords = keywords });
                            });
                        }}
                        onMarkingCriteriaChange={(criteria) => {
                            syllabusHandlers.updateCourses((draft: any) => {
                                findAndUpdateItem(draft, statePath, (p: any) => { p.markingCriteria = criteria });
                            });
                        }}
                        isEnriching={isEnriching}
                        onRegenerateKeywords={geminiHandlers.handleRegenerateKeywords}
                        isRegeneratingKeywords={geminiHandlers.isRegeneratingKeywords}
                        regenerateKeywordsError={geminiHandlers.regenerateKeywordsError}
                        onSuggestKeywords={geminiHandlers.handleSuggestKeywords}
                        isSuggestingKeywords={geminiHandlers.isSuggestingKeywords}
                        suggestKeywordsError={geminiHandlers.suggestKeywordsError}
                        userRole={userRole}
                        userAnswer={userAnswer}
                        onAddWord={handleAddWord}
                    />
                </div>
            )}

            {/* Right Column: Editor & Evaluation */}
            {isFocusMode && (
                <div className="animate-fade-in transition-all duration-500 ease-out max-w-5xl mx-auto w-full">
                    <div className="flex items-center gap-2 mb-3 px-1 opacity-60 select-none">
                        <div className="h-px bg-[rgb(var(--color-border-secondary))] flex-1" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--color-text-muted))]">Reference Question</span>
                        <div className="h-px bg-[rgb(var(--color-border-secondary))] flex-1" />
                    </div>
                    <div className="opacity-95 hover:opacity-100 transition-opacity">
                        <PromptDisplay 
                            prompt={currentPrompt} 
                            isEnriching={isEnriching} 
                            enrichError={enrichError}
                            onVerbClick={() => setIsGuideOpen(true)} 
                            onGenerateScenario={geminiHandlers.handleGenerateScenario} 
                            onUpdatePrompt={(updates) => syllabusHandlers.updateCourses((draft: any) => {
                                findAndUpdateItem(draft, statePath, (p: any) => Object.assign(p, updates));
                            })}
                            isGeneratingScenario={geminiHandlers.isGeneratingScenario} 
                            generateScenarioError={geminiHandlers.generateScenarioError} 
                            courseOutcomes={courseOutcomes} 
                            onOutcomeClick={() => {}} 
                            userRole={userRole}
                            onDismissEnrichError={() => geminiHandlers.setEnrichError(null)}
                            onRunQualityCheck={handleRunQualityCheck}
                        />
                    </div>
                </div>
            )}

            <WorkspaceRightPanel 
                isFocusMode={isFocusMode}
                editorHeight={editorHeight}
                userAnswer={userAnswer}
                setUserAnswer={setUserAnswer}
                debouncedUserAnswer={debouncedUserAnswer}
                currentPrompt={currentPrompt}
                isEvaluating={isEvaluating}
                evaluationResult={evaluationResult}
                evaluationError={evaluationError}
                onEvaluate={onInternalEvaluate}
                onSaveDraft={handleSaveDraft}
                isImproving={isImproving}
                improveAnswerError={improveAnswerError}
                evaluatedAnswer={evaluatedAnswer}
                geminiHandlers={geminiHandlers}
                syllabusHandlers={syllabusHandlers}
                statePath={statePath}
                userRole={userRole}
                breadcrumbItems={breadcrumbItems}
                handleRunQualityCheck={handleRunQualityCheck}
                onToggleFocusMode={onToggleFocusMode}
                handleDevMockEvaluation={handleDevMockEvaluation}
                handleDevMockImprovement={handleDevMockImprovement}
            />

            {/* Command Term Guide Modal */}
            <CommandTermGuideModal 
                isOpen={isGuideOpen} 
                onClose={() => setIsGuideOpen(false)} 
                termInfo={getCommandTermInfo(currentPrompt.verb)} 
            />
        </div>
    </div>
  );
};

export default Workspace;
