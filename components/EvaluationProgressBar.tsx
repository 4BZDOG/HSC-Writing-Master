import React, { useEffect, useState } from 'react';

const MICRO_LOGS = [
  'parsing_command_verb...',
  'mapping_nesa_glossary...',
  'evaluating_causal_links...',
  'measuring_lexical_density...',
  'detecting_structural_signposts...',
  'validating_exemplar_alignment...',
  'synthesising_band_justification...',
  'finalising_marker_persona...',
];

const EvaluationProgressBar: React.FC = () => {
  const [logIndex, setLogIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogIndex((prev) => (prev + 1) % MICRO_LOGS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md space-y-2">
        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 animate-progress-indeterminate" />
        </div>
        <p className="text-center text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest animate-pulse">
          {MICRO_LOGS[logIndex]}
        </p>
      </div>
    </div>
  );
};

export default EvaluationProgressBar;
