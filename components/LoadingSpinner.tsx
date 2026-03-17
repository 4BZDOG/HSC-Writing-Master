
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, AlertTriangle, Cpu, Loader2, BrainCircuit, ScanSearch, PenTool, Layers } from 'lucide-react';

interface LoadingSpinnerProps {
  message: string | null;
  error?: string | null;
  isError?: boolean;
}

// Educational & Technical phases for the "Studio" feel
const COGNITIVE_PHASES: Record<string, string[]> = {
  evaluation: [
    "Deconstructing response structure...",
    "Mapping against NESA criteria...",
    "Evaluating causal reasoning...",
    "Calibrating performance band...",
    "Synthesising marker feedback..."
  ],
  generation: [
    "Consulting syllabus outcomes...",
    "Designing authentic scenario...",
    "Aligning cognitive complexity...",
    "Refining academic vocabulary...",
    "Finalising marking rubric..."
  ],
  enrichment: [
    "Indexing syllabus context...",
    "Extracting domain terminology...",
    "Optimising heuristic constraints...",
    "Validating content alignment...",
    "Enhancing pedagogical value..."
  ],
  default: [
    "Initialising neural engine...",
    "Allocating compute resources...",
    "Processing linguistic models...",
    "Verifying output integrity...",
    "Finalising synthesis..."
  ]
};

const MeshOverlay = ({ opacity = "opacity-[0.05]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23000000' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, error, isError = false }) => {
  const [phaseIndex, setPhaseIndex] = useState(0);

  // Determine the task type based on the message string
  const taskType = useMemo(() => {
    const msg = message?.toLowerCase() || '';
    if (msg.includes('evaluat')) return 'evaluation';
    if (msg.includes('generat') || msg.includes('drafting')) return 'generation';
    if (msg.includes('enrich') || msg.includes('analyzing') || msg.includes('analysing')) return 'enrichment';
    return 'default';
  }, [message]);

  const phases = COGNITIVE_PHASES[taskType];

  useEffect(() => {
    if (isError) return;
    const interval = setInterval(() => {
      setPhaseIndex(prev => (prev + 1) % phases.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [phases, isError]);

  const theme = isError 
    ? {
        icon: AlertTriangle,
        ring: 'border-red-500/30',
        glow: 'shadow-red-500/20',
        iconColor: 'text-red-500',
        textColor: 'text-red-600',
        bg: 'bg-red-50/90'
      }
    : {
        icon: taskType === 'evaluation' ? ScanSearch : taskType === 'generation' ? PenTool : Sparkles,
        ring: 'border-indigo-500/30',
        glow: 'shadow-indigo-500/20',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        textColor: 'text-slate-800 dark:text-slate-100',
        bg: 'bg-white/90 dark:bg-slate-900/90'
      };

  return (
    <div className={`
        relative overflow-hidden
        ${theme.bg} backdrop-blur-3xl
        rounded-[32px] shadow-2xl ${theme.glow}
        border border-white/20 dark:border-white/10
        p-8 w-[340px] flex flex-col items-center justify-center gap-6
        transition-all duration-500 animate-in fade-in zoom-in-95
    `}>
      <MeshOverlay opacity="opacity-[0.03] dark:opacity-[0.05]" />

      {/* Central Animation Hub */}
      <div className="relative w-20 h-20 flex items-center justify-center z-10">
        {/* Pulsing Outer Ring */}
        <div className={`absolute inset-0 rounded-full border-2 ${theme.ring} opacity-20 animate-ping`} />
        
        {/* Rotating Dashed Ring */}
        <div className={`absolute inset-0 rounded-full border-2 border-dashed ${theme.ring} animate-spin-slow`} />
        
        {/* Inner Active Ring */}
        <div className={`
            absolute inset-1 rounded-full border-2 border-transparent 
            border-t-current ${theme.iconColor} opacity-50
            animate-spin
        `} style={{ animationDuration: '1.5s' }} />

        {/* Center Icon */}
        <div className={`
            relative w-12 h-12 rounded-2xl flex items-center justify-center
            bg-gradient-to-br from-white to-slate-100 dark:from-slate-800 dark:to-slate-900 
            shadow-lg border border-white/40 dark:border-white/10
        `}>
          <theme.icon className={`w-6 h-6 ${theme.iconColor} ${isError ? '' : 'animate-pulse'}`} />
        </div>
      </div>

      {/* Status Text */}
      <div className="text-center z-10 w-full space-y-2">
        <h3 className={`text-lg font-bold tracking-tight ${theme.textColor}`}>
            {isError ? 'System Interruption' : (message || 'Processing')}
        </h3>
        
        <div className="h-6 flex items-center justify-center overflow-hidden">
            <p className={`
                text-[10px] font-bold uppercase tracking-widest 
                text-slate-400 dark:text-slate-500 
                animate-fade-in-up key-${phaseIndex}
            `}>
                {isError ? (error || 'Operation failed.') : phases[phaseIndex]}
            </p>
        </div>
      </div>

      {/* Progress Indicators */}
      {!isError && (
        <div className="flex gap-1.5 z-10">
            {phases.map((_, i) => (
                <div 
                    key={i} 
                    className={`
                        h-1 rounded-full transition-all duration-500 
                        ${i === phaseIndex 
                            ? 'w-6 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' 
                            : 'w-1.5 bg-slate-200 dark:bg-slate-700'}
                    `} 
                />
            ))}
        </div>
      )}

      {/* Micro-Metadata Footer */}
      {!isError && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 opacity-30">
             <div className="flex items-center gap-1">
                 <BrainCircuit className="w-2.5 h-2.5" />
                 <span className="text-[8px] font-mono font-bold">GEMINI-3-PRO</span>
             </div>
             <div className="flex items-center gap-1">
                 <Layers className="w-2.5 h-2.5" />
                 <span className="text-[8px] font-mono font-bold">REASONING</span>
             </div>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
