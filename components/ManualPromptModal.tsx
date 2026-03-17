
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CourseOutcome, Prompt } from '../types';
import { refineManualPrompt } from '../services/geminiService';
import { getBandConfig } from '../utils/renderUtils';
import { X, Sparkles, PenTool, Save, Wand2, Target } from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';

interface ManualPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
  courseName: string;
  topicName: string;
  outcomes: CourseOutcome[];
}

const MeshOverlay = ({ opacity = "opacity-[0.05]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

const ManualPromptModal: React.FC<ManualPromptModalProps> = ({ 
    isOpen, onClose, onSave, courseName, topicName, outcomes 
}) => {
    // Diagnostic Logging
    const renderId = useRef(Math.random().toString(36).substr(2, 5));
    // console.log(`[ManualPromptModal:${renderId.current}] Render cycle. isOpen=${isOpen}`);

    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [draftQuestion, setDraftQuestion] = useState('');
    const [marks, setMarks] = useState<number>(5); // Default to 5 marks
    const [isRefining, setIsRefining] = useState(false);
    const [result, setResult] = useState<Prompt | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => {
            setMounted(false);
        };
    }, []);

    const handleClose = () => {
        if (isRefining) return;
        setDraftQuestion('');
        setMarks(5);
        setStep('input');
        setResult(null);
        setError(null);
        onClose();
    };

    const handleRefine = async () => {
        if (!draftQuestion.trim()) {
            setError("Please enter a draft question first.");
            return;
        }

        setIsRefining(true);
        setError(null);

        try {
            const refinedPrompt = await refineManualPrompt(draftQuestion, courseName, topicName, outcomes, marks);
            setResult(refinedPrompt);
            setStep('preview');
        } catch (err) {
            console.error(`[ManualPromptModal:${renderId.current}] Gemini Error:`, err);
            setError(err instanceof Error ? err.message : "Refinement failed.");
        } finally {
            setIsRefining(false);
        }
    };

    const handleConfirm = () => {
        if (result) {
            onSave(result);
            handleClose();
        }
    };

    // --- Safety Checks ---

    if (!isOpen) return null;
    if (!mounted) return null;
    if (typeof document === 'undefined') return null;

    const targetContainer = document.body;
    if (!targetContainer) return null;

    const bandConfig = getBandConfig(result ? 6 : 3); // Dynamic color based on state
    
    // Heuristic for band color based on marks selected
    const markBandColor = marks >= 15 ? 'text-purple-400' : marks >= 10 ? 'text-blue-400' : marks >= 5 ? 'text-emerald-400' : 'text-orange-400';
    const markGradient = marks >= 15 ? 'from-purple-500 to-indigo-500' : marks >= 10 ? 'from-blue-500 to-sky-500' : marks >= 5 ? 'from-emerald-500 to-teal-500' : 'from-orange-500 to-amber-500';

    try {
        return createPortal(
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" onClick={handleClose}>
                <div 
                    className={`
                        bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] shadow-2xl 
                        w-full max-w-4xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300
                        animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh] relative
                    `} 
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`px-10 py-8 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 light:from-indigo-50 light:to-purple-50 relative flex-shrink-0`}>
                         <MeshOverlay />
                         <div className="flex justify-between items-start relative z-10">
                             <div className="flex items-center gap-5">
                                 <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg flex items-center justify-center border border-white/20">
                                     <PenTool className="w-7 h-7 text-white" />
                                 </div>
                                 <div>
                                     <h2 className="text-2xl font-black text-white light:text-slate-900 tracking-tight leading-none uppercase italic">Manual Entry</h2>
                                     <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1.5">
                                         {step === 'input' ? 'Draft your concept' : 'Review & Polish'}
                                     </p>
                                 </div>
                             </div>
                             <button onClick={handleClose} className="p-3 rounded-xl hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
                                 <X className="w-6 h-6" />
                             </button>
                         </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-10 bg-[rgb(var(--color-bg-surface))] light:bg-white custom-scrollbar">
                        
                        {step === 'input' && (
                            <div className="flex flex-col h-full animate-fade-in space-y-8">
                                
                                {/* Mark Slider Section */}
                                <div className="p-6 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
                                    <div className="flex justify-between items-end mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-[rgb(var(--color-bg-surface))] border border-[rgb(var(--color-border-secondary))]">
                                                <Target className={`w-5 h-5 ${markBandColor}`} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-wide">Allocated Marks</h4>
                                                <p className="text-[10px] text-slate-500 font-medium">AI will select a verb to match this difficulty.</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-4xl font-black ${markBandColor} tracking-tighter tabular-nums`}>{marks}</span>
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-2">Marks</span>
                                        </div>
                                    </div>
                                    <div className="h-4 bg-black/40 rounded-full border border-white/5 p-1 shadow-inner relative group/slider">
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="20" 
                                            value={marks} 
                                            onChange={(e) => setMarks(Number(e.target.value))} 
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                                        />
                                        <div className={`h-full bg-gradient-to-r ${markGradient} rounded-full transition-all duration-300 relative`} style={{ width: `${(marks / 20) * 100}%` }}>
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl scale-125 group-hover/slider:scale-150 transition-transform" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between mt-2 px-1">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Simple (1)</span>
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Complex (20)</span>
                                    </div>
                                </div>

                                {/* Text Input Section */}
                                <div className="flex flex-col flex-1 min-h-0">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                                        Your Rough Question Idea
                                    </label>
                                    <textarea
                                        value={draftQuestion}
                                        onChange={(e) => setDraftQuestion(e.target.value)}
                                        placeholder="e.g. Ask the student about how caching works in a CPU and why it's faster..."
                                        className="w-full h-40 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-2xl p-6 text-lg font-medium text-white light:text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-shadow shadow-inner"
                                    />
                                </div>

                                {error && (
                                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center gap-3">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 'preview' && result && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-100 rounded-2xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
                                        <Sparkles className="w-12 h-12 text-indigo-400 rotate-12" />
                                    </div>
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">Polished Question</label>
                                    <p className="text-xl font-serif font-medium text-white light:text-slate-900 leading-relaxed">
                                        {result.question}
                                    </p>
                                    <div className="flex items-center gap-4 mt-4">
                                         <div className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                                             {result.verb}
                                         </div>
                                         <div className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                                             {result.totalMarks} Marks
                                         </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Scenario</label>
                                         <div className="p-5 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] text-sm text-slate-300 light:text-slate-700 leading-relaxed font-serif italic">
                                             "{result.scenario}"
                                         </div>
                                    </div>
                                    <div className="space-y-2">
                                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Marking Criteria</label>
                                         <div className="p-5 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] text-xs text-slate-400 light:text-slate-600 font-mono whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar">
                                             {result.markingCriteria}
                                         </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-10 py-6 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))]/50 light:bg-slate-50 backdrop-blur-md flex justify-between items-center relative z-20">
                        {step === 'preview' ? (
                            <button 
                                onClick={() => setStep('input')}
                                className="text-xs font-bold text-slate-500 hover:text-white transition-colors"
                            >
                                Back to Edit
                            </button>
                        ) : (
                            <div />
                        )}

                        {step === 'input' ? (
                            <button 
                                onClick={handleRefine} 
                                disabled={!draftQuestion.trim() || isRefining}
                                className={`
                                    group px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white shadow-xl transition-all flex items-center gap-3
                                    ${!draftQuestion.trim() || isRefining 
                                        ? 'bg-slate-700 opacity-50 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-105 active:scale-95'
                                    }
                                `}
                            >
                                {isRefining ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Polishing...</>
                                ) : (
                                    <><Wand2 className="w-4 h-4 group-hover:rotate-12 transition-transform" /> Refine with AI</>
                                )}
                            </button>
                        ) : (
                            <button 
                                onClick={handleConfirm}
                                className="group px-10 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                            >
                                <Save className="w-4 h-4" /> Save to Syllabus
                            </button>
                        )}
                    </div>

                    {isRefining && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
                            <LoadingIndicator 
                                messages={["Analysing draft concept...", `Calibrating for ${marks} marks...`, "Selecting appropriate verb...", "Constructing scenario...", "Drafting rubric..."]} 
                                duration={8} 
                                band={Math.min(6, Math.ceil(marks/2))} 
                            />
                        </div>
                    )}
                </div>
            </div>,
            targetContainer
        );
    } catch (portalError) {
        console.error(`[ManualPromptModal:${renderId.current}] FATAL: createPortal failed.`, portalError);
        return null;
    }
};

export default ManualPromptModal;
