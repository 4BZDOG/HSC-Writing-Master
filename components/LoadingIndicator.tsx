import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  AlertTriangle,
  PenTool,
  ScanSearch,
  BrainCircuit,
  Layers,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { getBandHex } from '../utils/renderUtils';
import { getSelectionSnapshot } from '../services/aiConfig';
import { getModelById } from '../services/aiModels';

/**
 * The ONE AI progress card. Every AI-backed wait in the app renders this
 * component (the former near-duplicate LoadingSpinner has been folded into it)
 * so spinners look and behave identically everywhere:
 *  - the phase lines + icon are chosen from the task being performed, either
 *    via the explicit `task` prop or sniffed from the message;
 *  - the footer names the ACTUAL engine the task routes to (from the admin's
 *    AI Engine selection) instead of a hard-coded model string;
 *  - an optional `band` tints the hub and progress bar with that band's
 *    canonical colour, tying an upgrade/regeneration wait to its target band.
 */

export type AiTaskType = 'evaluation' | 'generation' | 'enrichment' | 'default';

interface LoadingIndicatorProps {
  message?: string | null;
  error?: string | null;
  isError?: boolean;
  /** Estimated duration in seconds — drives the progress bar's pace. */
  duration?: number;
  /** Target band accent (e.g. exemplar regeneration). Uses BAND_HEX. */
  band?: number;
  /** Custom phase lines; overrides the task-derived defaults. */
  messages?: string[];
  /** Explicit task type. Falls back to sniffing the message when omitted. */
  task?: AiTaskType;
}

// Educational & Technical phases for the "Studio" feel
const COGNITIVE_PHASES: Record<AiTaskType, string[]> = {
  evaluation: [
    'Deconstructing response structure...',
    'Mapping against NESA criteria...',
    'Evaluating causal reasoning...',
    'Calibrating performance band...',
    'Synthesising marker feedback...',
  ],
  generation: [
    'Consulting syllabus outcomes...',
    'Designing authentic scenario...',
    'Aligning cognitive complexity...',
    'Refining academic vocabulary...',
    'Finalising marking rubric...',
  ],
  enrichment: [
    'Indexing syllabus context...',
    'Extracting domain terminology...',
    'Optimising heuristic constraints...',
    'Validating content alignment...',
    'Enhancing pedagogical value...',
  ],
  default: [
    'Preparing request...',
    'Consulting the AI engine...',
    'Processing response...',
    'Verifying output integrity...',
    'Finalising...',
  ],
};

const TASK_META: Record<AiTaskType, { icon: typeof Sparkles; fallbackTitle: string }> = {
  evaluation: { icon: ScanSearch, fallbackTitle: 'Marking response' },
  generation: { icon: PenTool, fallbackTitle: 'Generating content' },
  enrichment: { icon: Sparkles, fallbackTitle: 'Analysing content' },
  default: { icon: Sparkles, fallbackTitle: 'Processing' },
};

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23000000' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

/** Infer the task type from a status message when no explicit task is given. */
const sniffTask = (message?: string | null): AiTaskType => {
  const msg = message?.toLowerCase() || '';
  if (msg.includes('evaluat') || msg.includes('marking')) return 'evaluation';
  if (msg.includes('generat') || msg.includes('drafting') || msg.includes('regenerat'))
    return 'generation';
  if (
    msg.includes('enrich') ||
    msg.includes('analyzing') ||
    msg.includes('analysing') ||
    msg.includes('parsing')
  )
    return 'enrichment';
  return 'default';
};

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message,
  error,
  isError = false,
  duration = 5,
  band,
  messages,
  task,
}) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const taskType: AiTaskType = task ?? sniffTask(message);
  const phases = messages && messages.length > 0 ? messages : COGNITIVE_PHASES[taskType];
  // Content key, NOT array identity: callers pass inline `messages` arrays, so
  // keying the effects on the array itself restarts the timer every parent
  // re-render — fast-re-rendering parents would freeze the checklist on step 1.
  const phasesKey = phases.join('¦');

  // The marking path routes through the 'reasoning' engine; lighter tasks
  // (parsing, suggestions) route through 'basic'. Read once per render — the
  // card only lives for the duration of one request.
  const engineLabel = useMemo(() => {
    const role = taskType === 'evaluation' || taskType === 'generation' ? 'reasoning' : 'basic';
    return getModelById(getSelectionSnapshot()[role])?.label ?? 'AI Engine';
  }, [taskType]);

  // Walk the checklist forward, pacing the steps across the expected duration
  // and holding on the final step (a checklist that loops back reads as a
  // glitch). Completed steps stay ticked.
  useEffect(() => {
    setPhaseIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesKey]);
  useEffect(() => {
    if (isError || phases.length <= 1) return;
    const stepMs = Math.max(1400, Math.min(4000, (duration * 1000 * 0.85) / phases.length));
    const interval = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, phases.length - 1));
    }, stepMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesKey, duration, isError]);

  useEffect(() => {
    if (isError) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const p = Math.min(98, (elapsed / duration) * 100);
      setProgress(p);
    }, 100);
    return () => clearInterval(interval);
  }, [duration, isError]);

  // Optional band accent — canonical band hex so an upgrade wait matches the
  // band branding of the result it produces. Indigo remains the neutral brand.
  const accentHex = !isError && band ? getBandHex(band) : undefined;

  const theme = isError
    ? {
        icon: AlertTriangle,
        ring: 'border-red-500/30',
        glow: 'shadow-red-500/20',
        iconColor: 'text-red-500',
        textColor: 'text-red-600',
        bg: 'bg-red-50/90',
      }
    : {
        icon: TASK_META[taskType].icon,
        ring: 'border-indigo-500/30',
        glow: 'shadow-indigo-500/20',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        textColor: 'text-slate-800 dark:text-slate-100',
        bg: 'bg-white/90 dark:bg-slate-900/90',
      };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        relative overflow-hidden
        ${theme.bg} backdrop-blur-3xl
        rounded-[32px] shadow-2xl ${theme.glow}
        border border-white/20 dark:border-white/10
        p-8 w-full max-w-[340px] mx-auto
        flex flex-col items-center justify-center gap-6
        transition-all duration-500 animate-in fade-in zoom-in-95
    `}
    >
      <MeshOverlay opacity="opacity-[0.03] dark:opacity-[0.05]" />

      {/* Central Animation Hub */}
      <div className="relative w-20 h-20 flex items-center justify-center z-10">
        {/* Pulsing Outer Ring */}
        <div
          className={`absolute inset-0 rounded-full border-2 ${theme.ring} opacity-20 animate-ping`}
          style={accentHex ? { borderColor: accentHex } : undefined}
        />

        {/* Rotating Dashed Ring */}
        <div
          className={`absolute inset-0 rounded-full border-2 border-dashed ${theme.ring} animate-spin-slow`}
          style={accentHex ? { borderColor: `${accentHex}4d` } : undefined}
        />

        {/* Inner Active Ring */}
        <div
          className={`
            absolute inset-1 rounded-full border-2 border-transparent
            border-t-current ${theme.iconColor} opacity-50
            animate-spin
        `}
          style={{ animationDuration: '1.5s', ...(accentHex ? { color: accentHex } : {}) }}
        />

        {/* Center Icon */}
        <div
          className={`
            relative w-12 h-12 rounded-2xl flex items-center justify-center
            bg-gradient-to-br from-white to-slate-100 dark:from-slate-800 dark:to-slate-900
            shadow-lg border border-white/40 dark:border-white/10
        `}
        >
          <theme.icon
            className={`w-6 h-6 ${theme.iconColor} ${isError ? '' : 'animate-pulse'}`}
            style={accentHex ? { color: accentHex } : undefined}
          />
        </div>
      </div>

      {/* Status Text + Phase Checklist */}
      <div className="text-center z-10 w-full space-y-3">
        <h3 className={`text-lg font-bold tracking-tight ${theme.textColor}`}>
          {isError ? 'System Interruption' : message || TASK_META[taskType].fallbackTitle}
        </h3>

        {isError ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-4">
            {error || 'Operation failed.'}
          </p>
        ) : (
          /* The wait as a visible pipeline: steps tick off as the request
             progresses, so students watch the marking process happen instead
             of staring at one looping line. */
          <ul className="text-left space-y-1.5 px-3" aria-live="polite">
            {phases.slice(0, 5).map((phase, i) => {
              const state = i < phaseIndex ? 'done' : i === phaseIndex ? 'active' : 'pending';
              return (
                <li
                  key={i}
                  className={`flex items-center gap-2.5 transition-opacity duration-500 ${
                    state === 'pending' ? 'opacity-35' : 'opacity-100'
                  }`}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {state === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in duration-300" />
                    ) : state === 'active' ? (
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin text-indigo-500 dark:text-indigo-400"
                        style={accentHex ? { color: accentHex } : undefined}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    )}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                      state === 'active'
                        ? 'text-slate-700 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {phase}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Progress bar */}
      {!isError && (
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative z-10">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              ...(accentHex ? { backgroundImage: 'none', backgroundColor: accentHex } : {}),
            }}
          />
        </div>
      )}

      {/* Engine footer — names the engine this task actually routes to. Only
          shown for waits identified as AI work (an explicit task or a titled
          message); plain data loads passing only custom phase lines skip it. */}
      {!isError && (task !== undefined || !!message) && (
        <div className="flex justify-center gap-4 opacity-40 z-10 -mt-2">
          <div className="flex items-center gap-1">
            <BrainCircuit className="w-2.5 h-2.5" />
            <span className="text-[8px] font-mono font-bold uppercase">{engineLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span className="text-[8px] font-mono font-bold uppercase">{taskType}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadingIndicator;
