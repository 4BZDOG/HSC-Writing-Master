
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, BrainCircuit, Sparkles, Layers, Search, Database, Cpu, FileCode, PenTool } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import { TIER_GROUPS } from '../data/commandTerms';

interface LoadingIndicatorProps {
  messages: string[];
  duration: number;
  className?: string;
  readonly band?: number;
}

// "Technical" micro-logs to display underneath the main message
// Differentiated by complexity to match the Band/Tier
const MICRO_LOGS = {
  low: [
    "accessing_syllabus_db...",
    "retrieving_definitions...",
    "formatting_text_output...",
    "checking_spelling...",
    "finalising_response...",
    "allocating_tokens..."
  ],
  mid: [
    "parsing_command_verb...",
    "scanning_knowledge_base...",
    "linking_concepts...",
    "structuring_paragraphs...",
    "validating_examples...",
    "optimising_flow...",
    "checking_word_count..."
  ],
  high: [
    "synthesising_arguments...",
    "evaluating_evidence_weight...",
    "cross_referencing_criteria...",
    "applying_critical_lens...",
    "refining_vocabulary_matrix...",
    "checking_logical_cohesion...",
    "generating_nuance...",
    "polishing_rhetoric..."
  ]
};

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  messages, 
  duration, 
  className = '', 
  band = 6 
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentLog, setCurrentLog] = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const bandConfig = getBandConfig(band);
  const tierInfo = useMemo(() => TIER_GROUPS.find(g => g.tier === band), [band]);

  // 1. Main Message Rotation (Slow)
  useEffect(() => {
    if (messages.length > 0) {
      // Ensure we show the first message immediately
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
      }, 3000); // Rotate every 3s
      return () => clearInterval(interval);
    }
  }, [messages]);

  // 2. Micro Log Rotation (Fast)
  useEffect(() => {
    const logs = band <= 2 ? MICRO_LOGS.low : band <= 4 ? MICRO_LOGS.mid : MICRO_LOGS.high;
    
    const interval = setInterval(() => {
      const randomLog = logs[Math.floor(Math.random() * logs.length)];
      setCurrentLog(`> ${randomLog}`);
    }, 400); // Update every 400ms

    return () => clearInterval(interval);
  }, [band]);

  // 3. Progress & Time
  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedTime(elapsed);
      
      // Non-linear progress for realism (fast start, slow end)
      const calculatedProgress = Math.min(
        (elapsed / duration) * 100, 
        99
      );
      
      setProgress(calculatedProgress);
    }, 50);

    return () => clearInterval(timer);
  }, [duration]);
  
  const remainingTime = Math.max(duration - elapsedTime, 0);
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Contextual Icon
  const Icon = useMemo(() => {
      if (band <= 2) return Search;
      if (band <= 4) return Layers;
      return BrainCircuit; 
  }, [band]);

  // Phase Calculation
  const totalPhases = messages.length;
  const currentPhase = currentMessageIndex + 1;

  return (
    <div 
      className={`
        relative flex flex-col items-center justify-center w-full
        bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-xl
        border-2 ${bandConfig.border}
        rounded-3xl shadow-2xl ${bandConfig.glow}
        p-8 overflow-hidden
        transition-all duration-500 animate-fade-in-up
        ${className}
      `}
    >
      {/* Background Mesh Effect */}
      <div className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} opacity-5 pointer-events-none`} />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay pointer-events-none" />

      {/* Header Section */}
      <div className="relative z-10 flex flex-col items-center mb-6">
        <div className="relative">
            <div className={`
                w-16 h-16 rounded-2xl flex items-center justify-center
                bg-gradient-to-br ${bandConfig.gradient} shadow-lg text-white
                relative z-10
            `}>
                <Icon className="w-8 h-8 animate-pulse" />
            </div>
            {/* Orbital Ring */}
            <div className="absolute inset-0 -m-2 border-2 border-[rgb(var(--color-border-secondary))] rounded-3xl animate-spin-slow opacity-30" />
        </div>
        
        {tierInfo && (
             <div className={`mt-4 px-3 py-1 rounded-full bg-[rgb(var(--color-bg-surface-inset))] border ${bandConfig.border} flex items-center gap-2`}>
                 <span className={`w-2 h-2 rounded-full ${bandConfig.solidBg} animate-pulse`}></span>
                 <span className={`text-[10px] font-black uppercase tracking-widest ${bandConfig.text}`}>
                    Tier {tierInfo.tier}: {tierInfo.title}
                 </span>
             </div>
        )}
      </div>

      {/* Main Content */}
      <div className="w-full max-w-xs relative z-10 text-center space-y-6">
          
          {/* Macro Message */}
          <div className="h-14 flex flex-col items-center justify-center">
              <p className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wide mb-1">
                  Step {currentPhase} of {totalPhases}
              </p>
              <p className="text-lg font-bold text-white leading-tight animate-fade-in key-{currentMessageIndex}">
                  {messages[currentMessageIndex]}
              </p>
          </div>

          {/* Progress Bar */}
          <div className="relative">
              <div className="flex justify-between text-xs font-medium text-[rgb(var(--color-text-muted))] mb-1.5">
                  <span className="font-mono">{Math.round(progress)}%</span>
                  <span className="font-mono">{formatTime(remainingTime)}</span>
              </div>
              <div className="h-2 w-full bg-[rgb(var(--color-bg-surface-inset))] rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]">
                  <div 
                      className={`h-full bg-gradient-to-r ${bandConfig.gradient} transition-all duration-200 ease-out relative`}
                      style={{ width: `${progress}%` }}
                  >
                      <div className="absolute inset-0 bg-white/30 animate-shimmer" />
                  </div>
              </div>
          </div>

          {/* Micro Log Terminal */}
          <div className="w-full bg-black/40 rounded-lg border border-[rgb(var(--color-border-secondary))]/50 p-2.5 text-left overflow-hidden">
              <div className="flex items-center gap-2 mb-1 border-b border-white/5 pb-1">
                  <Cpu className="w-3 h-3 text-[rgb(var(--color-accent))]" />
                  <span className="text-[9px] font-bold text-[rgb(var(--color-text-muted))] uppercase">System Activity</span>
              </div>
              <p className="font-mono text-[10px] text-[rgb(var(--color-text-secondary))] h-4 truncate animate-pulse">
                  {currentLog}
              </p>
          </div>
      </div>

    </div>
  );
};

export default LoadingIndicator;
