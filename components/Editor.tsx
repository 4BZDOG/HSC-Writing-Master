import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { renderEditorHighlights, getBandConfig } from '../utils/renderUtils';
import {
  Maximize,
  Minimize,
  Bold,
  Italic,
  Copy,
  Check,
  PenTool,
  Type,
  ZoomIn,
  ZoomOut,
  FileText,
  Lightbulb,
  GraduationCap,
} from 'lucide-react';
import { PromptVerb, WritingMode } from '../types';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onEvaluate?: () => void;
  onSave?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  keywords?: string[];
  verb?: PromptVerb;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  progress?: number; // 0 to 1 scale representing completeness/quality
  syncedFontSize?: number;
  maxBand?: number; // Cap for color progression (1-6)
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  minTotalHeight?: number;
  writingMode?: WritingMode;
  onWritingModeChange?: (mode: WritingMode) => void;
}

const MeshOverlay = ({
  opacity = 'opacity-[0.03]',
  color = '%23ffffff',
}: {
  opacity?: string;
  color?: string;
}) => (
  <div
    className={`absolute inset-0 ${opacity} light:opacity-[0.06] pointer-events-none mix-blend-overlay z-0 transition-all duration-700 ease-in-out`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='${color}' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const ToolbarButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
}> = ({ onClick, icon, tooltip, active, disabled }) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    title={tooltip}
    aria-label={tooltip}
    className={`
            p-2 rounded-lg transition-all duration-200 
            ${
              active
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }
            disabled:opacity-30 disabled:cursor-not-allowed active:scale-95
        `}
  >
    {icon}
  </button>
);

// Map bands to specific Hex colors for gradient generation (matching renderUtils/Tailwind config)
const BAND_HEX_MAP: Record<number, string> = {
  1: '#ef4444', // Red (Band 1)
  2: '#f97316', // Orange (Band 2)
  3: '#f59e0b', // Amber (Band 3)
  4: '#10b981', // Emerald (Band 4)
  5: '#0ea5e9', // Sky (Band 5)
  6: '#6366f1', // Indigo (Band 6)
};

const BAND_NAMES: Record<number, string> = {
  1: 'Elementary',
  2: 'Limited',
  3: 'Developing',
  4: 'Sound',
  5: 'Excellent',
  6: 'Outstanding',
};

const Editor = forwardRef<
  { getText: () => string; setText: (text: string) => void; insertText: (text: string) => void },
  EditorProps
>(
  (
    {
      value,
      onChange,
      onEvaluate,
      onSave,
      disabled,
      placeholder,
      className = '',
      keywords,
      verb,
      isFocusMode,
      onToggleFocusMode,
      progress = 0,
      syncedFontSize,
      maxBand = 6,
      onHeaderResize,
      minHeaderHeight,
      minTotalHeight,
      writingMode = 'coach',
      onWritingModeChange,
    },
    ref
  ) => {
    // Exam Mode strips every live-feedback affordance: no keyword/verb
    // highlighting, no band-progress, no "phase" cues — just a calm page.
    const isExamMode = writingMode === 'exam';
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    const wordCount = useMemo(() => value.trim().split(/\s+/).filter(Boolean).length, [value]);

    // The highlight overlay is painted on every keystroke to stay pixel-aligned
    // with the caret, but rebuilding the whole span tree each time makes long
    // answers feel laggy. Memoise it so it only recomputes when the text, the
    // tracked keywords, or the command verb actually change.
    const highlightedContent = useMemo(
      () => (isExamMode ? value : renderEditorHighlights(value, keywords, verb)),
      [value, keywords, verb, isExamMode]
    );

    // Internal Font Size State with Sync Logic
    const [internalFontSize, setInternalFontSize] = useState(syncedFontSize || 18);
    const [userHasResized, setUserHasResized] = useState(false);

    // Advanced Chromatic Progression Config
    const chroma = useMemo(() => {
      // Exam Mode: a calm, neutral "exam booklet" header — no band colours, no
      // progress-driven glow, so nothing hints at how the response is scoring.
      if (isExamMode) {
        return {
          name: 'Exam',
          accent: '#94a3b8', // slate-400 caret
          background: 'linear-gradient(135deg, #334155 0%, #1e293b 55%, #0f172a 100%)',
          glow: 'shadow-slate-950/40',
          border: 'border-slate-600/50 light:border-slate-300',
          mesh: '%23ffffff',
          energy: 'none',
          iconColor: 'text-white',
        };
      }

      // 1. Determine the "Effective Band" based on progress (0.0 - 1.0)
      // We map the progress strictly to the available bands up to maxBand.
      // e.g. If maxBand is 3, then 0-33% is Band 1, 33-66% is Band 2, 66-100% is Band 3.
      const safeMaxBand = Math.max(1, Math.min(6, maxBand));
      const calculatedBand = Math.max(1, Math.min(safeMaxBand, Math.ceil(progress * safeMaxBand)));

      // However, if progress is very low (start), we stay at Band 1 visually but maybe desaturated.
      // For simplicity, we just snap to the calculated band.

      const currentConfig = getBandConfig(calculatedBand);
      const currentHex = BAND_HEX_MAP[calculatedBand];

      // 2. Generate Dynamic Gradient
      // The gradient should show the *path* from Band 1 to MaxBand.
      // The "Current Position" occupies the majority of the header (0% -> 60%).
      // The "Future Potential" occupies the rest (60% -> 100%).

      let gradientString = '';

      if (safeMaxBand === 1) {
        // Single color gradient if only Band 1 is possible
        gradientString = `linear-gradient(135deg, ${BAND_HEX_MAP[1]} 0%, ${BAND_HEX_MAP[1]} 100%)`;
      } else {
        // Build stops.
        // 0% -> 60%: Current Band Color (Dominant)
        // 60% -> 100%: Spectrum of remaining bands up to MaxBand

        let stops = `${currentHex} 0%, ${currentHex} 60%`;

        // If we are at the max band, the whole header is that color
        if (calculatedBand === safeMaxBand) {
          gradientString = `linear-gradient(135deg, ${currentHex} 0%, ${currentHex} 100%)`;
        } else {
          // We have room to grow. Show the future bands.
          // Distribute remaining space (40%) among the remaining bands.
          const remainingBands = [];
          for (let b = calculatedBand + 1; b <= safeMaxBand; b++) {
            remainingBands.push(b);
          }

          if (remainingBands.length > 0) {
            const stepSize = 40 / remainingBands.length;
            remainingBands.forEach((b, index) => {
              const stopPos = 60 + stepSize * (index + 1);
              stops += `, ${BAND_HEX_MAP[b]} ${stopPos}%`;
            });
          }
          gradientString = `linear-gradient(110deg, ${stops})`;
        }
      }

      // Energy glow effect based on progress density relative to the max possible
      const relativeProgress = progress; // 0 to 1
      const energyClass =
        relativeProgress > 0.8 ? `shadow-[0_0_30px_rgba(255,255,255,0.15)]` : 'none';

      return {
        name: BAND_NAMES[calculatedBand],
        accent: currentHex,
        background: gradientString,
        glow: currentConfig.glow,
        border: currentConfig.border,
        mesh: '%23ffffff',
        energy: energyClass,
        iconColor: 'text-white',
      };
    }, [progress, maxBand, isExamMode]);

    // Sync from parent if user hasn't manually overridden
    useEffect(() => {
      if (syncedFontSize && !userHasResized) {
        setInternalFontSize(syncedFontSize);
      }
    }, [syncedFontSize, userHasResized]);

    // Header height observation
    useEffect(() => {
      if (!headerRef.current || !onHeaderResize) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === headerRef.current) {
            onHeaderResize(entry.borderBoxSize[0].blockSize);
          }
        }
      });

      observer.observe(headerRef.current);
      return () => observer.disconnect();
    }, [onHeaderResize, progress, chroma]);

    const handleManualResize = (newSize: number) => {
      setInternalFontSize(newSize);
      setUserHasResized(true);
    };

    const insertText = (textToInsert: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const prefix = start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n' ? ' ' : '';
      const suffix =
        end < text.length &&
        text[end] !== ' ' &&
        text[end] !== '\n' &&
        text[end] !== '.' &&
        text[end] !== ','
          ? ' '
          : '';
      const finalInsert = prefix + textToInsert + suffix;
      const newText = text.substring(0, start) + finalInsert + text.substring(end);
      onChange(newText);
      const newCursorPos = start + finalInsert.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    };

    useImperativeHandle(ref, () => ({
      getText: () => value,
      setText: (text: string) => onChange(text),
      insertText: (text: string) => insertText(text),
    }));

    useEffect(() => {
      const handleCustomInsert = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) insertText(customEvent.detail);
      };
      window.addEventListener('insert-text', handleCustomInsert);
      return () => window.removeEventListener('insert-text', handleCustomInsert);
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        insertText('  ');
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onSave?.();
          onEvaluate?.();
          return;
        }
      }
    };

    const handleFormat = (type: 'bold' | 'italic' | 'list') => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selection = text.substring(start, end);
      let newText = text;
      // Where the caret / selection should land after the edit, so the user can
      // keep typing inside the emphasis markers instead of losing their place.
      let selStart = start;
      let selEnd = end;
      if (type === 'bold') {
        newText = text.substring(0, start) + `**${selection}**` + text.substring(end);
        selStart = start + 2;
        selEnd = selStart + selection.length;
      } else if (type === 'italic') {
        newText = text.substring(0, start) + `*${selection}*` + text.substring(end);
        selStart = start + 1;
        selEnd = selStart + selection.length;
      } else if (type === 'list') {
        // Only add a leading newline when we aren't already at the start of a line.
        const atLineStart = start === 0 || text[start - 1] === '\n';
        const prefix = atLineStart ? '- ' : '\n- ';
        newText = text.substring(0, start) + prefix + selection + text.substring(end);
        selStart = start + prefix.length;
        selEnd = selStart + selection.length;
      }
      onChange(newText);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(selStart, selEnd);
        }
      });
    };

    const handleCopy = async () => {
      if (value) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    // Styling for Grid Stacking (Auto-Grow).
    // Extra bottom padding reserves space for the floating "Evaluate" action
    // button (bottom-right) so a student's last lines are never hidden beneath it.
    const gridStackItemStyles =
      'col-start-1 row-start-1 px-8 pt-8 pb-24 font-serif leading-[1.8] whitespace-pre-wrap break-words overflow-hidden min-h-[300px]';

    return (
      <div
        className={`clip-stable flex flex-col w-full h-auto bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] overflow-hidden border-2 ${chroma.border} shadow-2xl ${chroma.glow} transition-all duration-700 ease-in-out ${className}`}
        style={{ minHeight: minTotalHeight || '300px' }}
      >
        {/* Header */}
        <div
          ref={headerRef}
          className={`px-8 py-5 text-white flex justify-between items-center relative overflow-hidden flex-shrink-0 rounded-t-[30px] transition-all duration-1000 ease-in-out`}
          style={{
            minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto',
            background: chroma.background,
          }}
        >
          <MeshOverlay opacity="opacity-20" color="%23ffffff" />

          {/* Content Wrapper */}
          <div className="relative z-10 w-full flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg group flex-shrink-0">
                <PenTool
                  className={`w-6 h-6 group-hover:scale-110 transition-transform ${chroma.iconColor}`}
                />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-black tracking-tight leading-none flex items-center gap-2">
                  Written Response
                  {isExamMode ? (
                    <span className="text-[10px] bg-red-500/90 px-1.5 py-0.5 rounded border border-white/20 font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                      <GraduationCap className="w-3 h-3" /> Exam
                    </span>
                  ) : (
                    <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded border border-white/10 font-bold uppercase tracking-widest">
                      {chroma.name} Phase
                    </span>
                  )}
                </h3>
                {isExamMode ? (
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-[0.2em] mt-1.5">
                    Exam conditions · no assistance
                  </p>
                ) : (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="h-1 w-20 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-1000 ease-out"
                        style={{ width: `${Math.min(100, progress * 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-bold text-white/70 uppercase tracking-[0.2em]">
                      {Math.min(100, Math.round(progress * 100))}% Complete
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Functional Pill Toolbar */}
            <div className="flex items-center gap-1 bg-black/20 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-inner flex-shrink-0">
              {onWritingModeChange && (
                <>
                  <div className="flex items-center gap-0.5" role="group" aria-label="Writing mode">
                    <button
                      type="button"
                      onClick={() => onWritingModeChange('coach')}
                      aria-pressed={!isExamMode}
                      title="Coach Mode — live highlighting, insights and exemplars"
                      className={`px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${!isExamMode ? 'bg-white text-slate-900 shadow' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Coach</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onWritingModeChange('exam')}
                      aria-pressed={isExamMode}
                      title="Exam Mode — HSC exam simulation: no assistance, timed"
                      className={`px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${isExamMode ? 'bg-red-500 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Exam</span>
                    </button>
                  </div>
                  <div className="w-px h-4 bg-white/20 mx-0.5" />
                </>
              )}
              {!isExamMode && (
                <>
                  <ToolbarButton
                    onClick={() => handleFormat('bold')}
                    icon={<Bold className="w-4 h-4" />}
                    tooltip="Bold"
                    disabled={disabled}
                  />
                  <ToolbarButton
                    onClick={() => handleFormat('italic')}
                    icon={<Italic className="w-4 h-4" />}
                    tooltip="Italic"
                    disabled={disabled}
                  />
                  <div className="w-px h-4 bg-white/20 mx-0.5" />
                </>
              )}
              <ToolbarButton
                onClick={() => handleManualResize(Math.max(12, internalFontSize - 2))}
                icon={<ZoomOut className="w-4 h-4" />}
                tooltip="Smaller text"
                disabled={internalFontSize <= 12}
              />
              <ToolbarButton
                onClick={() => handleManualResize(Math.min(32, internalFontSize + 2))}
                icon={<ZoomIn className="w-4 h-4" />}
                tooltip="Larger text"
                disabled={internalFontSize >= 32}
              />
              <div className="w-px h-4 bg-white/20 mx-0.5" />
              <ToolbarButton
                onClick={handleCopy}
                icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                tooltip="Copy"
                disabled={!value}
              />

              {onToggleFocusMode && (
                <button
                  onClick={onToggleFocusMode}
                  aria-label={isFocusMode ? 'Exit focus mode' : 'Enter focus mode'}
                  aria-pressed={isFocusMode}
                  title={
                    isFocusMode
                      ? 'Exit focus mode (Esc)'
                      : 'Distraction-free writing (Ctrl / ⌘ + Shift + F)'
                  }
                  className={`ml-2 px-3 h-8 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider flex items-center gap-2 ${isFocusMode ? 'bg-amber-500 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isFocusMode ? (
                    <Minimize className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{isFocusMode ? 'Normal' : 'Focus'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Editor Body with Grid Stacking for Auto-Height */}
        <div className="relative flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50/30">
          {/* Progress-Aware Background Bloom */}
          <div
            className="absolute inset-0 opacity-10 light:opacity-5 transition-all duration-1000 ease-in-out pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 0%, ${chroma.accent}88, transparent 70%)`,
              filter: 'blur(40px)',
            }}
          />

          <MeshOverlay opacity="opacity-[0.04]" color={chroma.mesh} />

          <div className="grid w-full relative z-10 h-full">
            {/* Invisible phantom div to force height based on content */}
            <div
              className={`${gridStackItemStyles} invisible`}
              style={{ fontSize: `${internalFontSize}px` }}
            >
              {value + ' '}
            </div>

            {/* Textarea for input */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => onSave?.()}
              placeholder={isExamMode ? 'Begin your response. The clock is running…' : placeholder}
              disabled={disabled}
              className={`${gridStackItemStyles} bg-transparent text-transparent caret-[currentColor] resize-none border-none outline-none placeholder:text-[rgb(var(--color-text-dim))] focus:ring-0 selection:bg-[rgb(var(--color-accent))]/20 z-10 h-full`}
              style={{
                fontSize: `${internalFontSize}px`,
                caretColor: chroma.accent,
              }}
              spellCheck="false"
            />

            {/* Highlights Overlay */}
            <div
              className={`${gridStackItemStyles} pointer-events-none text-[rgb(var(--color-text-primary))] light:text-slate-800 z-0`}
              style={{ fontSize: `${internalFontSize}px` }}
              aria-hidden="true"
            >
              {highlightedContent}
            </div>
          </div>
        </div>

        {/* Footer Metrics */}
        <div
          className={`px-6 py-3 flex justify-between items-center border-t border-white/10 bg-[rgb(var(--color-bg-surface))]/80 rounded-b-[30px] transition-all duration-700 ease-in-out ${chroma.energy} flex-shrink-0`}
        >
          <div className="flex items-center gap-6 text-[10px] text-[rgb(var(--color-text-dim))] font-black uppercase tracking-widest select-none">
            <span className="flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 opacity-50" /> {value.length}{' '}
              {value.length === 1 ? 'Char' : 'Chars'}
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 opacity-50" /> {wordCount}{' '}
              {wordCount === 1 ? 'Word' : 'Words'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
              <div
                className="w-2 h-2 rounded-full transition-colors duration-700"
                style={{ backgroundColor: chroma.accent }}
              ></div>
              <span className="text-[rgb(var(--color-text-secondary))]">
                {isExamMode ? 'Exam Conditions' : `${chroma.name} Phase`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Editor.displayName = 'Editor';

export default Editor;
