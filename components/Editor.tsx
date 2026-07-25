import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
  useMemo,
} from 'react';
import {
  renderEditorHighlights,
  getBandConfig,
  getBandHex,
  getBandHexDark,
  getBandName,
} from '../utils/renderUtils';
import { getCommandTermInfo } from '../data/commandTerms';
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
  ChevronDown,
} from 'lucide-react';
import { PromptVerb, WritingMode } from '../types';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { MAX_CARD_HEIGHT, isTwoColumnWidth } from '../utils/layoutConstants';
import { PlusLockChip } from './UpgradeModal';
import StrategyTip from './StrategyTip';

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
  /** The workspace-wide reading size. One setting drives the prompt, the
   *  writing surface and the exemplars — see Workspace. */
  syncedFontSize?: number;
  onFontSizeChange?: (size: number) => void;
  maxBand?: number; // Cap for color progression (1-6)
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  minTotalHeight?: number;
  onFooterResize?: (height: number) => void;
  minFooterHeight?: number;
  writingMode?: WritingMode;
  onWritingModeChange?: (mode: WritingMode) => void;
  /** Primary action (Evaluate), docked at the right end of the footer bar.
   *  It lives in the chrome rather than over — or above — the writing surface:
   *  floating, it hid the student's own words; in a row of its own it took
   *  ~90px out of a card whose height is fixed by the question beside it. */
  footerAction?: React.ReactNode;
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
      onFontSizeChange,
      maxBand = 6,
      onHeaderResize,
      minHeaderHeight,
      minTotalHeight,
      onFooterResize,
      minFooterHeight,
      writingMode = 'coach',
      onWritingModeChange,
      footerAction,
    },
    ref
  ) => {
    // Exam Mode strips every live-feedback affordance: no keyword/verb
    // highlighting, no band-progress, no "phase" cues — just a calm page.
    const isExamMode = writingMode === 'exam';
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const headerContentRef = useRef<HTMLDivElement>(null);
    const contentWrapRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const footerContentRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    // Open on a desktop, folded on a phone. The tip runs to ~180px, which on a
    // narrow viewport is most of a writing card that is only ~300px tall — the
    // coaching is worth a tap there, not the writing surface.
    const [showStrategy, setShowStrategy] = useState(() =>
      typeof window === 'undefined' ? true : isTwoColumnWidth(window.innerWidth)
    );

    const wordCount = useMemo(() => value.trim().split(/\s+/).filter(Boolean).length, [value]);

    const highlightedContent = useMemo(
      () => (isExamMode ? value : renderEditorHighlights(value, keywords, verb)),
      [value, keywords, verb, isExamMode]
    );

    // The reading size is owned by the workspace, not by this card. It used to
    // be mirrored into local state that stopped following the parent as soon as
    // the student touched these buttons — so the prompt's zoom silently went
    // dead and the two cards drifted apart.
    const internalFontSize = syncedFontSize || 18;

    const verbInfo = useMemo(() => getCommandTermInfo(verb), [verb]);
    const verbTier = verbInfo.tier;

    // Live-feedback theme. The writing surface is painted in the question's
    // TIER colour (one fixed hue per question). Progress isn't shown by
    // cycling through unrelated hues — instead that one colour "fills in":
    // a dark veil sits over it and lifts as the response develops, so the
    // closer to a complete answer, the more vivid the surface glows.
    const chroma = useMemo(() => {
      // Exam Mode: a calm, neutral "exam booklet" header — no band colours, no
      // progress-driven glow, so nothing hints at how the response is scoring.
      if (isExamMode) {
        return {
          name: 'Exam',
          targetBand: 0,
          accent: '#94a3b8', // slate-400 caret
          background: 'linear-gradient(135deg, #334155 0%, #1e293b 55%, #0f172a 100%)',
          veil: 0,
          glow: 'shadow-slate-950/40',
          border: 'border-slate-600/50 light:border-slate-300',
          mesh: '%23ffffff',
          energy: 'none',
          iconColor: 'text-white',
        };
      }

      const targetBand = Math.max(1, Math.min(6, maxBand));
      // Colour identity = the verb's TIER (red … purple), matching the picker,
      // prompt card and hierarchy ribbon — a Tier-1 question writes on a red
      // surface even though its target is "Band 2". The band NUMBER stays in
      // copy (footer, progress row) via targetBand/name below.
      const hue = Math.max(1, Math.min(6, verbTier));
      const targetHex = getBandHex(hue);
      const targetHexDark = getBandHexDark(hue);
      const targetConfig = getBandConfig(hue);

      const p = Math.max(0, Math.min(1, progress));
      // Dark veil over the band colour: 60% opaque at a blank page, lifting to
      // fully transparent as the answer approaches the target length/coverage.
      const veil = (1 - p) * 0.6;

      return {
        name: getBandName(targetBand),
        targetBand,
        accent: targetHex,
        background: `linear-gradient(135deg, ${targetHex} 0%, ${targetHexDark} 100%)`,
        veil,
        glow: p > 0.85 ? targetConfig.glow : 'shadow-none',
        border: targetConfig.border,
        mesh: '%23ffffff',
        energy: p > 0.85 ? 'shadow-[0_0_30px_rgba(255,255,255,0.15)]' : 'none',
        iconColor: 'text-white',
      };
    }, [progress, maxBand, verbTier, isExamMode]);

    // Header height observation. Reports the header's NATURAL height (content
    // + own padding) rather than its rendered box: the rendered box includes
    // the synced minHeight, which would turn the cross-card height sync into a
    // one-way ratchet that locks in transient wrapped layouts forever.
    useEffect(() => {
      if (!headerContentRef.current || !onHeaderResize) return;

      const observer = new ResizeObserver(() => {
        const header = headerRef.current;
        const content = headerContentRef.current;
        if (!header || !content) return;
        const cs = getComputedStyle(header);
        onHeaderResize(
          content.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        );
      });

      observer.observe(headerContentRef.current);
      return () => observer.disconnect();
    }, [onHeaderResize, progress, chroma]);

    // Footer height observation. Like the header, this reports the NATURAL
    // height (content + own padding). The rendered box carries the synced
    // minFooterHeight, so measuring it fed the inflated value back into the
    // sync and the two footers could only ever grow — a footer that wrapped to
    // two rows at a narrow width stayed tall after widening again.
    useEffect(() => {
      if (!footerContentRef.current || !onFooterResize) return;

      const observer = new ResizeObserver(() => {
        const footer = footerRef.current;
        const content = footerContentRef.current;
        if (!footer || !content) return;
        const cs = getComputedStyle(footer);
        onFooterResize(
          content.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        );
      });

      observer.observe(footerContentRef.current);
      return () => observer.disconnect();
    }, [onFooterResize]);

    const handleManualResize = (newSize: number) => onFontSizeChange?.(newSize);

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

    // Keep the caret in view while writing.
    //
    // The textarea is stacked in a grid and sized to its own content
    // (`h-full` of a content-sized row) with `overflow-hidden`, so it never
    // scrolls itself — which means the browser never has a reason to reveal
    // the caret. The card around it is what scrolls, and it does not follow
    // the caret on its own: past roughly thirty lines a student was typing
    // below the fold, unable to see the words appearing.
    //
    // A mirror element with the textarea's text metrics gives the caret's
    // y-offset: render the text UP TO the caret and take its height. One
    // detached node is reused for the life of the component.
    const caretMirrorRef = useRef<HTMLDivElement | null>(null);

    useEffect(
      () => () => {
        caretMirrorRef.current?.remove();
        caretMirrorRef.current = null;
      },
      []
    );

    const scrollCaretIntoView = () => {
      const el = textareaRef.current;
      const body = bodyRef.current;
      if (!el || !body) return;

      let mirror = caretMirrorRef.current;
      if (!mirror) {
        mirror = document.createElement('div');
        mirror.setAttribute('aria-hidden', 'true');
        mirror.style.cssText =
          'position:absolute;top:0;left:-9999px;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;';
        document.body.appendChild(mirror);
        caretMirrorRef.current = mirror;
      }

      const cs = getComputedStyle(el);
      for (const prop of [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'textTransform',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
      ] as const) {
        mirror.style[prop] = cs[prop];
      }
      mirror.style.width = `${el.clientWidth}px`;
      // The zero-width space stops a trailing newline from collapsing, so the
      // caret on a fresh empty line still measures as a line of its own.
      mirror.textContent = el.value.slice(0, el.selectionStart) + '\u200B';

      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.8;
      const caretBottom = mirror.offsetHeight - parseFloat(cs.paddingBottom);
      const caretTop = caretBottom - lineHeight;

      // Breathing room so the caret never sits flush against either edge.
      const MARGIN = Math.round(lineHeight * 1.5);
      const viewTop = body.scrollTop;
      const viewBottom = viewTop + body.clientHeight;

      if (caretBottom > viewBottom - MARGIN) {
        body.scrollTop = caretBottom - body.clientHeight + MARGIN;
      } else if (caretTop < viewTop + MARGIN) {
        body.scrollTop = Math.max(0, caretTop - MARGIN);
      }
    };

    // Runs after React has committed the new value, so the mirror measures the
    // text the student can actually see.
    const queueCaretScroll = () => requestAnimationFrame(scrollCaretIntoView);

    useImperativeHandle(ref, () => ({
      getText: () => value,
      setText: (text: string) => onChange(text),
      insertText: (text: string) => insertText(text),
    }));

    const insertTextRef = useRef(insertText);
    insertTextRef.current = insertText;

    useEffect(() => {
      const handleCustomInsert = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) insertTextRef.current(customEvent.detail);
      };
      window.addEventListener('insert-text', handleCustomInsert);
      return () => window.removeEventListener('insert-text', handleCustomInsert);
    }, []);

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
    // The Evaluate action used to float over this surface, with bottom padding
    // here meant to keep clear of it. That only ever protected the END of the
    // draft: the padding scrolls with the text while the button is pinned to
    // the card, so any mid-document line long enough to reach the bottom-right
    // corner was simply hidden behind it. The action now has its own row.
    // No min-height: the writing surface fills whatever the card gives it (the
    // grid is `min-h-full`), and the card's height comes from the question
    // prompt. A fixed 300px floor here used to exceed the space available
    // under a short prompt, so an EMPTY editor rendered a scrollbar with
    // nothing to scroll to.
    const gridStackItemStyles =
      'col-start-1 row-start-1 px-5 sm:px-8 pt-8 pb-8 font-serif leading-[1.8] whitespace-pre-wrap break-words overflow-hidden';

    return (
      <div
        // `transition-all` here animated min/max-height, so on load — as the
        // prompt card was measured and the synced height arrived — both cards
        // visibly grew into place. Only the colour-and-shadow chrome animates.
        className={`clip-stable flex flex-col w-full h-auto bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] overflow-hidden border-2 ${chroma.border} shadow-2xl ${chroma.glow} transition-[box-shadow,border-color,background-color] duration-700 ease-in-out ${className}`}
        // Pinned to the question prompt's height: min and max are the same
        // value, so the writing area matches the card beside it exactly and a
        // response longer than that scrolls inside it. The fallback only
        // applies before the prompt has been measured, so a long saved draft
        // cannot stretch the page during the first paint.
        style={{
          minHeight: `${minTotalHeight || 300}px`,
          maxHeight: `${minTotalHeight || MAX_CARD_HEIGHT}px`,
        }}
      >
        <div ref={contentWrapRef} className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div
            ref={headerRef}
            // `items-center`, not `items-start`: this header is stretched to
            // match the prompt card's taller header (minHeaderHeight), and with
            // the content pinned to the top the surplus read as a broken block
            // of empty band colour. Centred, the padding sits either side of the
            // title row and the stretch looks deliberate.
            className={`px-4 sm:px-8 py-4 sm:py-5 text-white flex justify-between items-center relative overflow-hidden flex-shrink-0 rounded-t-[30px] transition-[background,box-shadow] duration-1000 ease-in-out`}
            style={{
              minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto',
              background: chroma.background,
            }}
          >
            {/* Progress veil: dims the target-band colour when the response is
              still thin, lifting to full vividness as it nears completion. */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-out"
              style={{ backgroundColor: `rgba(2, 6, 23, ${chroma.veil})` }}
            />

            <MeshOverlay opacity="opacity-20" color="%23ffffff" />

            {/* Content Wrapper — wraps whenever the row is too tight (not just
              below md) so the pill toolbar drops below the title instead of
              painting over it. */}
            <div
              ref={headerContentRef}
              className="relative z-10 w-full flex flex-wrap justify-between items-start gap-y-3 gap-x-4"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg group flex-shrink-0">
                  <PenTool
                    className={`w-6 h-6 group-hover:scale-110 transition-transform ${chroma.iconColor}`}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-none drop-shadow-sm">
                    Written Response
                  </h3>
                  {isExamMode ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] bg-red-500/90 px-2 py-0.5 rounded-md border border-white/20 font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                        <GraduationCap className="w-3 h-3" /> Exam
                      </span>
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em]">
                        No assistance
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-md border border-white/15 font-black uppercase tracking-widest shadow-sm backdrop-blur-sm">
                        Band {chroma.targetBand}
                      </span>
                      <div className="h-1 w-16 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-1000 ease-out"
                          style={{ width: `${Math.min(100, progress * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em] whitespace-nowrap">
                        {Math.min(100, Math.round(progress * 100))}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Functional Pill Toolbar — ml-auto keeps it right-aligned when
                the header row wraps it onto its own line. */}
              <div className="flex items-center gap-1 bg-black/20 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-inner flex-shrink-0 ml-auto">
                {onWritingModeChange && (
                  <>
                    <div
                      className="flex items-center gap-0.5"
                      role="group"
                      aria-label="Writing mode"
                    >
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
                        onClick={() => {
                          if (isFeatureLocked('examMode')) {
                            requestUpgrade('examMode');
                          } else {
                            onWritingModeChange('exam');
                          }
                        }}
                        aria-pressed={isExamMode}
                        title="Exam Mode — HSC exam simulation: no assistance, timed"
                        className={`px-2.5 h-7 rounded-lg flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${isExamMode ? 'bg-red-500 text-white shadow' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Exam</span>
                        {isFeatureLocked('examMode') && <PlusLockChip className="ml-0.5" />}
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

          {/* Writing Strategy Tip — Coach mode only */}
          {!isExamMode && verb && (
            <div className="border-t border-white/10 light:border-slate-200">
              <button
                type="button"
                onClick={() => setShowStrategy((s) => !s)}
                className="w-full flex items-center gap-2 px-4 sm:px-6 py-2 text-left hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                  {verbInfo.term} Strategy
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[rgb(var(--color-text-dim))] ml-auto transition-transform duration-200 ${showStrategy ? 'rotate-180' : ''}`}
                />
              </button>
              {showStrategy && (
                <div className="px-4 sm:px-6 pb-3 animate-fade-in">
                  <p className="text-xs font-semibold text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed mb-2">
                    {verbInfo.definition}
                  </p>
                  <StrategyTip tip={verbInfo.tip} />
                </div>
              )}
            </div>
          )}

          {/* Editor Body with Grid Stacking for Auto-Height */}
          <div
            ref={bodyRef}
            className="relative flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-white overflow-y-auto min-h-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[rgb(var(--color-accent))]/30"
          >
            {/* Progress-Aware Background Bloom */}
            <div
              className="absolute inset-0 opacity-10 light:opacity-5 transition-all duration-1000 ease-in-out pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${chroma.accent}88, transparent 70%)`,
                filter: 'blur(40px)',
              }}
            />

            <MeshOverlay opacity="opacity-[0.04]" color={chroma.mesh} />

            <div className="grid w-full relative z-10 min-h-full">
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
                onChange={(e) => {
                  onChange(e.target.value);
                  queueCaretScroll();
                }}
                onKeyDown={handleKeyDown}
                // Arrow keys, Home/End and click-to-place move the caret
                // without changing the text, so onChange never fires.
                onKeyUp={queueCaretScroll}
                onClick={queueCaretScroll}
                onBlur={() => onSave?.()}
                placeholder={
                  isExamMode ? 'Begin your response. The clock is running…' : placeholder
                }
                disabled={disabled}
                // The focus indicator moves to the scroll region around it
                // (focus-within, inset): a textarea always matches
                // :focus-visible, and the global rule's outline was being
                // clipped by the card down to a single bar across the page.
                className={`${gridStackItemStyles} bg-transparent text-transparent caret-[currentColor] resize-none border-none outline-none focus-visible:outline-none placeholder:text-[rgb(var(--color-text-dim))] focus:ring-0 selection:bg-[rgb(var(--color-accent))]/20 z-10 h-full`}
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
            ref={footerRef}
            className={`px-4 sm:px-6 py-3 flex items-center border-t border-white/10 light:border-slate-200 bg-[rgb(var(--color-bg-surface))]/80 light:bg-slate-50 rounded-b-[30px] transition-[box-shadow,border-color] duration-700 ease-in-out ${chroma.energy} flex-shrink-0`}
            style={{ minHeight: minFooterHeight || 52 }}
          >
            {/* Inner wrapper carries the row layout so its height stays
              content-driven — the outer box is inflated by the synced
              minFooterHeight and cannot be measured. */}
            <div
              ref={footerContentRef}
              className="w-full flex flex-wrap justify-between items-center gap-x-4 gap-y-1.5"
            >
              <div className="flex items-center gap-4 sm:gap-6 text-[10px] text-[rgb(var(--color-text-dim))] font-black uppercase tracking-widest select-none whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 opacity-50" /> {value.length}{' '}
                  {value.length === 1 ? 'Char' : 'Chars'}
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 opacity-50" /> {wordCount}{' '}
                  {wordCount === 1 ? 'Word' : 'Words'}
                </span>
              </div>
              <div className="flex items-center gap-3 sm:gap-5 ml-auto">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full transition-colors duration-700 ring-2 ring-white/10"
                    style={{ backgroundColor: chroma.accent }}
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-text-secondary))]">
                    {isExamMode
                      ? 'Exam Conditions'
                      : `Band ${chroma.targetBand} Target · ${chroma.name}`}
                  </span>
                </div>
                {footerAction}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

Editor.displayName = 'Editor';

export default Editor;
