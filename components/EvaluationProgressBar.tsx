
import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Search, 
  Scale, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  Loader2 
} from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

const STEPS = [
  { label: "Analyzing Command Verb & Criteria", icon: Search, duration: 2000 },
  { label: "Scanning for Syllabus Keywords", icon: FileText, duration: 2500 },
  { label: "Measuring Cognitive Depth (Tier)", icon: BrainCircuit, duration: 3000 },
  { label: "Mapping to NESA Performance Bands", icon: Scale, duration: 3000 },
  { label: "Synthesizing Exemplar Response", icon: Sparkles, duration: 3500 },
];

const EvaluationProgressBar: React.FC = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  
  // Use purple/blue theme for the AI "Brain" look
  const bandConfig = getBandConfig(6); 

  useEffect(() => {
    const startTime = Date.now();
    const totalDuration = STEPS.reduce((acc, step) => acc + step.duration, 0);
    
    // Progress Bar Timer
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const calculatedProgress = Math.min((elapsed / totalDuration) * 100, 98); // Cap at 98% until real completion
      setProgress(calculatedProgress);
    }, 50);

    // Step Switcher
    let accumulatedTime = 0;
    const timeouts = STEPS.map((step, index) => {
      const timeout = setTimeout(() => {
        setCurrentStepIndex(index);
      }, accumulatedTime);
      accumulatedTime += step.duration;
      return timeout;
    });

    return () => {
      clearInterval(progressInterval);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-[rgb(var(--color-bg-base))]/70 backdrop-blur-md rounded-2xl transition-all duration-500 animate-fade-in">
      <div className={`
        w-full max-w-md p-8 rounded-3xl
        border border-[rgb(var(--color-border-secondary))]
        bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-xl
        shadow-2xl shadow-[rgb(var(--color-primary))/0.3]
        relative overflow-hidden
      `}>
        {/* Decorative Background Elements */}
        <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${bandConfig.gradient} opacity-10 blur-[80px] rounded-full pointer-events-none`} />
        
        <div className="text-center mb-8 relative z-10">
          <div className={`
            inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4
            bg-gradient-to-br ${bandConfig.gradient} shadow-lg shadow-purple-500/20
            animate-pulse-glow ring-1 ring-white/10
          `}>
            <BrainCircuit className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight mb-1">
            AI Evaluation in Progress
          </h3>
          <p className="text-xs text-[rgb(var(--color-text-secondary))] uppercase tracking-widest font-bold">
            Applying Strict Marking Guidelines
          </p>
        </div>

        {/* Steps List */}
        <div className="space-y-3 mb-8 relative z-10">
          {STEPS.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            const Icon = step.icon;

            return (
              <div 
                key={index}
                className={`
                  flex items-center gap-3 p-2.5 rounded-xl transition-all duration-500
                  ${isActive ? 'bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-accent))]/20 translate-x-1 shadow-sm' : 'border border-transparent'}
                  ${isCompleted ? 'opacity-50' : 'opacity-30'}
                  ${isActive ? '!opacity-100' : ''}
                `}
              >
                <div className={`
                  flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300
                  ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : ''}
                  ${isActive ? `bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))]` : 'bg-[rgb(var(--color-bg-surface-inset))] text-gray-500'}
                `}>
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : (isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />)}
                </div>
                
                <div className="flex-1">
                  <p className={`text-xs font-bold transition-colors duration-300 ${isActive ? 'text-white' : 'text-[rgb(var(--color-text-muted))]'}`}>
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="relative z-10">
          <div className="flex justify-between text-[10px] font-black text-[rgb(var(--color-text-secondary))] mb-2 uppercase tracking-wider">
             <span>Processing</span>
             <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full bg-[rgb(var(--color-bg-surface-inset))] rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]">
            <div 
              className={`h-full bg-gradient-to-r ${bandConfig.gradient} transition-all duration-200 ease-out relative`}
              style={{ width: `${progress}%` }}
            >
                <div className="absolute inset-0 bg-white/30 animate-shimmer" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EvaluationProgressBar;
