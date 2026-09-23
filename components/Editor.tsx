import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useState,
  useMemo,
  useId,
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
  Baseline,
  ZoomIn,
  ZoomOut,
  Compass,
  GraduationCap,
  ChevronDown,
  X,
  Loader2,
} from 'lucide-react';
import { PromptVerb, WritingMode } from '../types';
import { getReadinessChroma, type ReadinessResult } from '../utils/draftReadiness';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { MAX_CARD_HEIGHT } from '../utils/layoutConstants';
import { useChromeHeightReporter } from '../hooks/useChromeHeightReporter';
import { PlusLockChip } from './UpgradeModal';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import { useSupportResource } from '../hooks/useSupportResource';
import {
  CARD_HEADER_BAR,
  CARD_HEADER_BOX,
  CARD_HEADER_ICON,
  CARD_HEADER_IDENTITY,
  CARD_HEADER_META,
  CARD_HEADER_META_ROW,
  CARD_HEADER_ROW,
  CARD_HEADER_TITLE,
  CARD_HEADER_TITLE_BLOCK,
  CARD_HEADER_TRAY,
} from '../utils/cardChrome';
import StrategyBrief from './StrategyBrief';

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
  /** The question being answered. Only used to record which supports the
   *  student opened before writing — see utils/supportEngagement.ts. */
  promptId?: string;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  progress?: number; // 0 to 1 scale representing completeness/quality
  /** The live draft-readiness signal (see utils/draftReadiness.ts). Optional so
   *  the editor renders identically without it. When present, non-neutral and
   *  not in exam mode, it layers SUBTLE accents on top of the question's fixed
   *  tier hue — a soft outer glow, the caret tint, and a footer completeness
   *  word — never a band name and never any colour under body text. */
  readiness?: ReadinessResult;
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
  /** Whether everything typed has reached storage. See the footer. */
  draftSaved?: boolean;
  /** Refuse pasted (and dragged-in) text, with a note explaining why.
   *  Set for students: an HSC response is worth marking only if it is the
   *  student's own typing. Curators keep paste — they move sample answers and
   *  test material in and out of this surface as part of the job. */
  blockPaste?: boolean;
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
  /** Set when the button discloses further controls, for screen readers. */
  expanded?: boolean;
}> = ({ onClick, icon, tooltip, active, disabled, expanded }) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    disabled={disabled}
    title={tooltip}
    aria-label={tooltip}
    aria-expanded={expanded}
    className={`
            p-1.5 rounded-lg transition-all duration-200 
            ${
              active
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }
            disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]
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
      promptId,
      isFocusMode,
      onToggleFocusMode,
      progress = 0,
      readiness,
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
      blockPaste = false,
      draftSaved,
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
    // Folded, like every panel around it, and quiet from the first frame. The
    // row used to have a LEADING state — amber wash, a lit tile, "Read this
    // first" — because the coaching matters most before the first sentence.
    // The blank writing surface now carries that brief (see the overlay in the
    // editor body), so the row is only ever the way BACK to it mid-draft. Two
    // loud things at word zero would have spent the page's attention twice.
    const [showStrategy, setShowStrategy] = useState(false);
    const strategyOpened = useOpenedOnce(showStrategy, verb);
    // Bold/italic, folded away by default — see the toolbar below.
    const [showFormatting, setShowFormatting] = useState(false);
    const strategyPanelId = useId();

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

    // Exam Mode has no strategy at all, so it must not be reported as a support
    // the student declined to open.
    //
    // The row, and only the row. This briefly also counted a `strategyBriefSeen`
    // — whether the old page-scale brief had been on the blank writing surface
    // — because back then a student could read the strategy exactly as intended
    // without ever touching the row, and reporting otherwise would have told
    // them something untrue at the moment they were looking at a lost mark.
    //
    // That brief is gone. What replaced it is the definition in the strategy
    // row's own header, and that is NOT the strategy: it is one sentence, it is
    // unmissable, and nobody chooses to read it. Opening the row is a choice a
    // student makes, which is the only thing worth reporting as one.
    useSupportResource(
      isExamMode || !verb ? undefined : promptId,
      'strategy',
      showStrategy || strategyOpened
    );

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

    // Readiness accents, layered ON TOP of the tier-hue surface above. The base
    // hue stays the question's fixed tier identity (chroma) — readiness never
    // morphs it. It only drives a soft outer glow, the caret tint and the
    // footer completeness word: decorative surfaces that never sit under body
    // text. Null (no accent) whenever readiness is absent, neutral (an empty /
    // barely-started draft), or exam mode — so exam and the blank page stay
    // exactly as clean as before. Colour comes from getReadinessChroma keyed on
    // chromaLevel — the completeness level CAPPED at the question's target band,
    // so the glow/caret never climb past the best colour the question can be
    // awarded — reusing the canonical band palette (no new band hex).
    const readinessAccent = useMemo(() => {
      if (isExamMode || !readiness || readiness.isNeutral) return null;
      const { hex, config } = getReadinessChroma(readiness.chromaLevel);
      return { hex, glow: config.glow };
    }, [isExamMode, readiness]);

    // Header and footer height observation. Both cards measure their chrome
    // through the same hook, so the two can never disagree about what a header
    // of a given content is worth — see useChromeHeightReporter.
    useChromeHeightReporter(headerRef, headerContentRef, onHeaderResize);
    useChromeHeightReporter(footerRef, footerContentRef, onFooterResize);

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

    // Paste refusal. The point is not that it cannot be worked around — a
    // determined student can retype anything — but that the ordinary,
    // thoughtless route (copy an answer, drop it in, press Evaluate) is closed,
    // and that the student is told why rather than left wondering why ⌘V did
    // nothing. Drops are refused too: dragging selected text in is the same
    // gesture with a different hand.
    const [pasteNotice, setPasteNotice] = useState(false);
    const pasteNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
      () => () => {
        if (pasteNoticeTimer.current) clearTimeout(pasteNoticeTimer.current);
      },
      []
    );

    const refuseTransfer = (e: React.ClipboardEvent | React.DragEvent) => {
      if (!blockPaste) return;
      e.preventDefault();
      setPasteNotice(true);
      if (pasteNoticeTimer.current) clearTimeout(pasteNoticeTimer.current);
      pasteNoticeTimer.current = setTimeout(() => setPasteNotice(false), 6000);
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
        // Soft outer glow slot: readiness (when present, non-neutral, non-exam)
        // tints it in the readiness hue; otherwise the tier-progress glow that
        // only lit at high progress. Either way it is a gentle band-palette
        // shadow with light: variants, never colour under text. The wrapper's
        // existing box-shadow transition is already reduced-motion-safe.
        className={`clip-stable flex flex-col w-full h-auto bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-surface overflow-hidden border-2 ${chroma.border} shadow-lg ${readinessAccent ? readinessAccent.glow : chroma.glow} transition-[box-shadow,border-color,background-color] duration-700 ease-in-out ${className}`}
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
            // Every class here comes from utils/cardChrome, shared with the
            // question card so the two headers are the same object twice.
            className={`${CARD_HEADER_BOX} transition-[background,box-shadow] duration-1000 ease-in-out`}
            style={{
              minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto',
              background: chroma.background,
            }}
          >
            {/* Progress veil: dims the target-band colour when the response is
              still thin, lifting to full vividness as it nears completion. */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-out"
              style={{ opacity: chroma.veil }}
            >
              {/* Themed strength lives on the child, whose opacity multiplies
                  with the progress opacity above — see `.progress-veil`. */}
              <div className="progress-veil" />
            </div>

            <MeshOverlay opacity="opacity-20" color="%23ffffff" />

            <div ref={headerContentRef} className={CARD_HEADER_ROW}>
              <div className={CARD_HEADER_IDENTITY}>
                <div className={CARD_HEADER_ICON}>
                  <PenTool
                    className={`w-5 h-5 group-hover:scale-110 transition-transform ${chroma.iconColor}`}
                  />
                </div>
                <div className={CARD_HEADER_TITLE_BLOCK}>
                  <h3 className={CARD_HEADER_TITLE}>Written Response</h3>
                  {isExamMode ? (
                    <div className={CARD_HEADER_META_ROW}>
                      <span className="t-label leading-none bg-red-500/90 px-2 py-1 rounded-lg border border-white/20 flex items-center gap-1 shadow-sm">
                        <GraduationCap className="w-3 h-3" /> Exam
                      </span>
                      <p className={CARD_HEADER_META}>No assistance</p>
                    </div>
                  ) : (
                    <div className={CARD_HEADER_META_ROW}>
                      {/* The question's fixed goal, and nothing about the
                          draft.

                          A second readiness bar and its percentage used to sit
                          here. `WorkspaceRightPanel` passes
                          `progress={readiness.score / 100}` and `readiness`
                          to this same component, so the number was rendered
                          twice on one card — and the copy up here was the
                          poorer one: white on the band gradient, with no
                          completeness WORD and no band hue, in the title block
                          where a reader is looking for what the card IS rather
                          than how far along it is.

                          The footer's `ReadinessMeter` keeps it, for the reason
                          the footer already records about the completeness word
                          it took back from the target-band pill: the meter's
                          copy is the one with something to explain, and it sits
                          where the decision is made, beside Evaluate. */}
                      <span className="t-label leading-none whitespace-nowrap bg-white/20 px-2 py-1 rounded-lg border border-white/15 shadow-sm backdrop-blur-sm">
                        Band {chroma.targetBand}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* The tools sit in the header's bottom-right corner, where the
                question card keeps its stat pills — same tray, same bar, same
                height. Beside the heading they read as part of the title; on
                the floor of the row they read as the pair of the pills across
                the gap, which is what they are. */}
              <div className={CARD_HEADER_TRAY}>
                <div className={`${CARD_HEADER_BAR} gap-1`}>
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
                          // The NAME is what you call the control; the sentence
                          // is what it does, and `title` is already carrying
                          // that. Without this the visible label is hidden below
                          // 2xl, the accessible name falls back to `title`, and
                          // a screen reader announces the button as "Coach Mode
                          // — live highlighting, draft checks and exemplars,
                          // button". A name that swallows a sentence also
                          // collides with everything: a locator for the draft
                          // check panel matched THIS button, because the words
                          // "draft checks" are inside its tooltip.
                          aria-label="Coach mode"
                          title="Coach Mode — live highlighting, draft checks and exemplars"
                          className={`t-label px-2.5 h-6 rounded-lg flex items-center gap-1.5 transition-all active:scale-[0.98] ${!isExamMode ? 'bg-white text-slate-900 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span className="hidden 2xl:inline">Coach</span>
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
                          aria-label="Exam mode"
                          title="Exam Mode — HSC exam simulation: no assistance, timed"
                          className={`t-label px-2.5 h-6 rounded-lg flex items-center gap-1.5 transition-all active:scale-[0.98] ${isExamMode ? 'bg-red-500 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span className="hidden 2xl:inline">Exam</span>
                          {isFeatureLocked('examMode') && <PlusLockChip className="ml-0.5" />}
                        </button>
                      </div>
                      <div className="w-px h-4 bg-white/20 mx-0.5" />
                    </>
                  )}
                  {/* Bold and italic sat open in the toolbar permanently, and an
                  HSC response is prose — they are pressed once in a session, if
                  ever, while the controls a student does reach for (reading
                  size, focus mode) had to share the row with them. They fold
                  behind one button, which stays put once opened. */}
                  {!isExamMode && (
                    <>
                      <ToolbarButton
                        onClick={() => setShowFormatting((v) => !v)}
                        icon={<Baseline className="w-4 h-4" />}
                        tooltip={showFormatting ? 'Hide formatting' : 'Formatting (bold, italic)'}
                        active={showFormatting}
                        disabled={disabled}
                        expanded={showFormatting}
                      />
                      {showFormatting && (
                        <div
                          className="flex items-center gap-1 animate-fade-in"
                          role="group"
                          aria-label="Text formatting"
                        >
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
                        </div>
                      )}
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
                      className={`t-label ml-1.5 px-2.5 h-6 rounded-lg transition-all flex items-center gap-1.5 ${isFocusMode ? 'bg-amber-500 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {isFocusMode ? (
                        <Minimize className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden 2xl:inline">{isFocusMode ? 'Normal' : 'Focus'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* The verb, and what it wants — a glossary line above the page it
            applies to.

            A NESA command term IS a dictionary entry, so the row is set as
            one: the term in the app's own UI face, its meaning in Newsreader,
            the change of face doing the work a label like "Definition:" would
            otherwise have to do. It reads at a glance and it never moves.

            This row used to say `DESCRIBE strategy` and nothing else, because
            the meaning was carried by a brief drawn ON the blank writing
            surface below. That brief is gone (see `StrategyBrief`), and what
            it was doing has split in two: the definition — the one sentence a
            student most needs — is here, on screen for the whole draft rather
            than only until the first keystroke; and the METHOD is behind this
            disclosure, reachable at any point rather than only while the page
            is empty.

            So the definition is stated once on this surface and the panel
            below opens headless. Every surface in the app that shows a verb
            now names it exactly once. */}
          {!isExamMode && verb && (
            <div className="border-t border-white/10 light:border-slate-300">
              {/* The definition is CONTENT, and the toggle is a control, so
                  they are not the same element.

                  The whole row was one button for a moment, which put the
                  definition inside the control's accessible name: a screen
                  reader announced "DESCRIBE, provide the characteristics and
                  features of something in detail, How to answer, button" as
                  the label of a thing to press. It also meant a student who
                  clicked the sentence to re-read it collapsed the panel they
                  were reading. A named button of its own says exactly what it
                  does, and the sentence beside it stays a sentence. */}
              <div className="flex items-baseline gap-x-3 px-4 sm:px-6 py-2">
                <span className="t-label flex-shrink-0 text-[rgb(var(--color-text-primary))]">
                  {verbInfo.term}
                </span>
                {/* The meaning, in the reading face. It WRAPS rather than
                    truncating: this is the one sentence a student most needs
                    and the longest of them runs past a phone's width, so
                    trimming it would withhold the thing the row is for. */}
                <p className="font-serif text-[13px] leading-snug min-w-0 text-[rgb(var(--color-text-muted))]">
                  {verbInfo.definition}
                </p>
                <button
                  type="button"
                  onClick={() => setShowStrategy((s) => !s)}
                  aria-expanded={showStrategy}
                  aria-controls={strategyPanelId}
                  className="t-label ml-auto flex-shrink-0 self-center flex items-center gap-2 -mr-1.5 px-1.5 py-1 rounded-lg transition-colors duration-300 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-black/5 light:hover:bg-slate-100"
                >
                  <PanelReadChip show={strategyOpened && !showStrategy} />
                  {/* Named, not a bare chevron. It is the one control on this
                      card that can say what a student gets by pressing it, and
                      "How to answer" is the question they arrived with. The
                      verb goes in the accessible name rather than the visible
                      one, which already sits two words to the left. */}
                  <span className="hidden sm:inline">
                    {showStrategy ? 'Hide' : 'How to answer'}
                  </span>
                  <span className="sr-only">
                    {showStrategy ? 'Hide how to answer a ' : 'How to answer a '}
                    {verbInfo.term} question
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      showStrategy ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
              {showStrategy && (
                <div id={strategyPanelId} className="px-4 sm:px-6 pb-4 animate-fade-in">
                  {/* Headless: the row above names the verb and states its
                      meaning, so what is left for the brief is the method and
                      its checks — which is the half a student cannot get from
                      the definition alone. */}
                  <StrategyBrief verb={verb} lead="none" />
                </div>
              )}
            </div>
          )}

          {/* Editor Body with Grid Stacking for Auto-Height */}
          <div
            ref={bodyRef}
            className="relative flex-grow w-full bg-[rgb(var(--color-bg-surface-inset))] overflow-y-auto min-h-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[rgb(var(--color-accent))]/30"
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

            {/* Floated over the writing surface rather than placed in flow: a
              banner that takes up a row would shove the student's text down
              the moment they pressed ⌘V, which is its own small disruption. */}
            {pasteNotice && (
              <div
                role="status"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(28rem,calc(100%-2rem))] animate-fade-in"
              >
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-400/40 bg-amber-50 light:bg-amber-50 dark:bg-amber-950/80 backdrop-blur-xl shadow-lg">
                  <PenTool className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0">
                    <p className="t-label text-amber-600 dark:text-amber-400">
                      Pasting is switched off
                    </p>
                    <p className="text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-100/90 mt-1">
                      Type your response in your own words — that is the part the marker rewards,
                      and the feedback is only useful if the writing is yours.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasteNotice(false)}
                    aria-label="Dismiss"
                    className="ml-auto -mr-1 -mt-1 p-1 rounded-lg text-amber-600/70 dark:text-amber-400/70 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

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
                onPaste={refuseTransfer}
                onDrop={refuseTransfer}
                onBlur={() => onSave?.()}
                placeholder={
                  isExamMode ? 'Begin your response. The clock is running…' : placeholder
                }
                disabled={disabled}
                // The focus indicator moves to the scroll region around it
                // (focus-within, inset): a textarea always matches
                // :focus-visible, and the global rule's outline was being
                // clipped by the card down to a single bar across the page.
                // The placeholder is always visible now. It used to be turned
                // transparent while the page brief was up, on the grounds that
                // the brief was the empty state and saying both was saying the
                // instruction twice. The brief is gone, and what that left
                // behind was the real problem underneath it: a blank writing
                // surface with no invitation to write on it, and a caret that
                // landed behind the brief's first letterform.
                className={`${gridStackItemStyles} bg-transparent text-transparent caret-[currentColor] resize-none border-none outline-none focus-visible:outline-none placeholder:text-[rgb(var(--color-text-dim))] focus:ring-0 selection:bg-[rgb(var(--color-accent))]/20 z-10 h-full`}
                style={{
                  fontSize: `${internalFontSize}px`,
                  // The caret takes the readiness hue when a live signal is
                  // present (non-neutral, non-exam), reinforcing the "filling
                  // in" as the draft develops; otherwise it keeps the tier
                  // accent. A hairline caret, never a surface under text.
                  caretColor: readinessAccent ? readinessAccent.hex : chroma.accent,
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
            className={`px-4 sm:px-6 py-3 flex flex-wrap sm:flex-nowrap gap-y-2 sm:gap-y-0 items-center border-t border-white/10 light:border-slate-300 bg-[rgb(var(--color-bg-surface))]/80 light:bg-[rgb(var(--color-bg-surface-inset))] rounded-b-surface-inner transition-[box-shadow,border-color] duration-700 ease-in-out ${chroma.energy} flex-shrink-0`}
            style={{ minHeight: minFooterHeight || 52 }}
          >
            {/* Inner wrapper carries the row layout so its height stays
              content-driven — the outer box is inflated by the synced
              minFooterHeight and cannot be measured. */}
            <div
              ref={footerContentRef}
              className="w-full flex flex-wrap justify-between items-center gap-x-4 gap-y-1.5"
            >
              <div className="t-label flex items-center gap-4 sm:gap-6 text-[rgb(var(--color-text-dim))] select-none whitespace-nowrap">
                {/* Words, and not also characters.
                    A character count is a text-editor convention, and nothing
                    in this application is measured in characters: the length
                    guidance says "15 words of about 32", the metrics panel
                    counts words, and `commandTerms` estimates pages. It was
                    also load-bearing nowhere — `value.length` was read here and
                    in no other place. Standing beside the counter that DOES
                    mean something, it halved the prominence of the one a
                    student is actually working to. */}
                <span>
                  {wordCount} {wordCount === 1 ? 'Word' : 'Words'}
                </span>
                {/* The draft saves itself a second after typing stops. Saying so
                  is the point: a student who cannot see that their work is kept
                  has no reason to believe it, and this app asks them to type a
                  page of prose into a browser tab. Only shown once there is
                  something to lose. */}
                {draftSaved !== undefined && value.trim() !== '' && (
                  <span
                    className={`hidden sm:flex items-center gap-1.5 transition-colors ${
                      draftSaved
                        ? 'text-emerald-500/80 light:text-emerald-700'
                        : 'text-[rgb(var(--color-text-dim))]'
                    }`}
                    title={draftSaved ? 'Your draft is saved on this device' : 'Saving your draft…'}
                  >
                    {draftSaved ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin opacity-50" />
                    )}
                    {draftSaved ? 'Saved' : 'Saving'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-x-3 sm:gap-x-5 gap-y-2 sm:gap-y-0 ml-auto">
                <div className="flex items-center gap-2.5">
                  {/* The halo separates the band dot from the surface behind
                      it. A white ring does that on the dark footer and vanishes
                      on the light one, so the dot lost its edge in light mode —
                      the footer is a theme surface, unlike the header above it,
                      which is always painted with the band gradient and where a
                      white-alpha treatment is right in both themes. */}
                  <div
                    className="w-2.5 h-2.5 rounded-full transition-colors duration-700 ring-2 ring-slate-900/10 dark:ring-white/10"
                    style={{ backgroundColor: chroma.accent }}
                  />
                  {/* "Band 2 target", not "Band 2 Target · Limited". The band's
                      NESA descriptor beside the word "target" read as though the
                      goal itself were "limited" — to a student aiming at the top
                      of a DESCRIBE question, which is capped at Band 2 by its
                      verb. The descriptor rides in the title for anyone who
                      wants it. `whitespace-nowrap`: at 1280px it broke in two. */}
                  <span
                    className="t-label whitespace-nowrap text-[rgb(var(--color-text-secondary))]"
                    title={
                      isExamMode
                        ? undefined
                        : `The highest band this question can reach: Band ${chroma.targetBand} (${chroma.name})`
                    }
                  >
                    {isExamMode ? 'Exam conditions' : `Band ${chroma.targetBand} target`}
                  </span>
                  {/* The completeness word used to be repeated here, appended
                      to the target-band pill as `· Coming along`. The
                      `ReadinessMeter` a few inches to the right — in this same
                      footer row, inside `footerAction` — already carries it,
                      beside the bar and the percentage it belongs to, so the
                      row read "Band 5 Target · Excellent · Coming along |
                      Coming along ▬▬ 49%": the same two words twice, once
                      hanging off a statement about the QUESTION and once
                      attached to the meter measuring the DRAFT.

                      The meter's copy is the one that survives, because it is
                      the one with something to explain. What is left here is
                      the question's fixed goal, which is what this pill was
                      always for. */}
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
