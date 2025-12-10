
import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { renderEditorHighlights } from '../utils/renderUtils';
import { 
  Maximize, Minimize, Bold, Italic, List, Copy, 
  Check, PenTool, Type, Eraser, ListOrdered, X, ZoomIn, ZoomOut
} from 'lucide-react';
import { PromptVerb } from '../types';

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
  tip?: React.ReactNode;
  onCloseTip?: () => void;
}

// Moved outside to prevent re-mounting on every render which can cause issues
const ToolbarButton: React.FC<{ 
    onClick: () => void; 
    icon: React.ReactNode; 
    tooltip: string; 
    active?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'danger';
}> = ({ onClick, icon, tooltip, active, disabled, variant = 'default' }) => (
    <button
        type="button"
        onClick={(e) => { e.preventDefault(); onClick(); }}
        disabled={disabled}
        title={tooltip}
        className={`
            p-1.5 rounded-lg transition-all duration-200 hover-scale
            ${active 
                ? 'bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))]' 
                : variant === 'danger' 
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300 light:text-red-500 light:hover:bg-red-50 light:hover:text-red-600'
                    : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-light))] light:text-slate-500 light:hover:text-slate-900 light:hover:bg-slate-200'
            }
            disabled:opacity-30 disabled:cursor-not-allowed
        `}
    >
        {icon}
    </button>
);

const Editor = forwardRef<{ getText: () => string; setText: (text: string) => void; insertText: (text: string) => void }, EditorProps>(
  ({ value, onChange, onEvaluate, onSave, disabled, placeholder, className = '', keywords, verb, isFocusMode, onToggleFocusMode, tip, onCloseTip }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [fontSize, setFontSize] = useState(18); // Default font size in pixels

    // Sync scroll position from textarea to backdrop
    const handleScroll = () => {
      if (backdropRef.current && textareaRef.current) {
        backdropRef.current.scrollTop = textareaRef.current.scrollTop;
        backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    };
    
    // Ensure scroll sync on resize or content change
    useEffect(() => {
        handleScroll();
    }, [value, isFocusMode, fontSize]);

    const insertText = (textToInsert: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // Important: Focus first to ensure we can act on the selection
        textarea.focus();

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        // Insert with space if needed
        const prefix = (start > 0 && text[start-1] !== ' ' && text[start-1] !== '\n') ? ' ' : '';
        const suffix = (end < text.length && text[end] !== ' ' && text[end] !== '\n' && text[end] !== '.' && text[end] !== ',') ? ' ' : '';
        
        const finalInsert = prefix + textToInsert + suffix;
        const newText = text.substring(0, start) + finalInsert + text.substring(end);
        
        // Update state
        onChange(newText);
        
        // Use RAF to restore cursor position after the render cycle completes
        const newCursorPos = start + finalInsert.length;
        
        requestAnimationFrame(() => {
            if(textareaRef.current) {
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

    // Listen for custom insert event from siblings
    useEffect(() => {
        const handleCustomInsert = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                insertText(customEvent.detail);
            }
        };
        window.addEventListener('insert-text', handleCustomInsert);
        return () => window.removeEventListener('insert-text', handleCustomInsert);
    }, [value]); // Dep on value to ensure closure has fresh state if needed, though ref handles it
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        if (e.key === 'Tab') {
            e.preventDefault();
            insertText('  '); // Insert 2 spaces
            return;
        }
        
        // Auto-list continuation and Ctrl+Enter
        if (e.key === 'Enter' && !e.shiftKey) {
            // Ctrl+Enter to evaluate
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                onSave?.();
                onEvaluate?.();
                return;
            }

            const start = textarea.selectionStart;
            const value = textarea.value;
            
            // Find start of current line
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const currentLine = value.substring(lineStart, start);

            // Regex for bullet list (- or *) with capturing groups for indent, marker, space, content
            const bulletMatch = currentLine.match(/^(\s*)([\-\*])(\s+)(.*)$/);
            // Regex for numbered list (1. )
            const numberMatch = currentLine.match(/^(\s*)(\d+)\.(\s+)(.*)$/);

            if (bulletMatch || numberMatch) {
                e.preventDefault();
                
                const match = numberMatch || bulletMatch;
                // TypeScript safety: match is guaranteed not null here due to if check
                if (!match) return;

                const indent = match[1];
                const space = match[3]; // preserve existing spacing style
                const content = match[4];
                
                let nextMarker = '';
                if (numberMatch) {
                    const currentNum = parseInt(numberMatch[2], 10);
                    nextMarker = `${currentNum + 1}.`;
                } else {
                    nextMarker = match[2]; // - or *
                }

                if (content.trim().length > 0) {
                    // Continue list: insert newline and next marker
                    insertText(`\n${indent}${nextMarker}${space}`);
                } else {
                    // Terminate list: remove the empty bullet/number line entirely
                    // This sets the text to everything before the current line start + everything after cursor
                    const newValue = value.substring(0, lineStart) + value.substring(start);
                    onChange(newValue);
                    
                    requestAnimationFrame(() => {
                        if (textareaRef.current) {
                             textareaRef.current.selectionStart = textareaRef.current.selectionEnd = lineStart;
                        }
                    });
                }
                return;
            }
        }

        // Formatting shortcuts
        if (e.metaKey || e.ctrlKey) {
            if (e.key === 's') {
                e.preventDefault();
                onSave?.();
            }
            if (e.key === 'b') {
                e.preventDefault();
                handleFormat('bold');
            }
            if (e.key === 'i') {
                e.preventDefault();
                handleFormat('italic');
            }
            // Zoom Shortcuts
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                handleZoom(1);
            }
            if (e.key === '-') {
                e.preventDefault();
                handleZoom(-1);
            }
        }
    };

    const handleFormat = (type: 'bold' | 'italic' | 'list' | 'list-ordered') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        let newText = text;
        let newCursorPos = end;

        if (type === 'bold') {
            newText = text.substring(0, start) + `**${selection}**` + text.substring(end);
            newCursorPos = end + 4; // ** + **
            if (!selection) newCursorPos = start + 2; // Place inside **|**
        } else if (type === 'italic') {
            newText = text.substring(0, start) + `*${selection}*` + text.substring(end);
            newCursorPos = end + 2; // * + *
            if (!selection) newCursorPos = start + 1; // Place inside *|*
        } else if (type === 'list') {
            const prefix = '\n- ';
            newText = text.substring(0, start) + prefix + selection + text.substring(end);
            newCursorPos = start + prefix.length + selection.length;
        } else if (type === 'list-ordered') {
             const prefix = '\n1. ';
            newText = text.substring(0, start) + prefix + selection + text.substring(end);
            newCursorPos = start + prefix.length + selection.length;
        }

        onChange(newText);

        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                // If wrapping selection, keep selection
                if (selection && (type === 'bold' || type === 'italic')) {
                    textareaRef.current.setSelectionRange(start, newCursorPos);
                } else {
                    textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                }
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

    const handleClear = () => {
        if (!value) return;
        // Use a slight delay to prevent any event propagation issues
        setTimeout(() => {
             if (window.confirm("Are you sure you want to clear your answer? This cannot be undone.")) {
                onChange('');
                requestAnimationFrame(() => {
                    if(textareaRef.current) {
                        textareaRef.current.focus();
                    }
                });
            }
        }, 0);
    }
    
    const handleZoom = (direction: 1 | -1) => {
        setFontSize(prev => Math.max(12, Math.min(32, prev + (direction * 2))));
    };

    // SHARED STYLES: Critical for alignment.
    // We inject the dynamic fontSize here.
    const commonStyles = `
      absolute inset-0 w-full h-full 
      p-6 
      font-serif leading-relaxed 
      whitespace-pre-wrap break-words 
      overflow-y-scroll scrollbar-thin scrollbar-thumb-[rgb(var(--color-border-secondary))] light:scrollbar-thumb-slate-300 scrollbar-track-transparent
    `;
    
    const dynamicStyle = { fontSize: `${fontSize}px` };

    return (
      <div className={`flex flex-col h-full transition-all duration-500 ${className}`}>
         {/* Header / Toolbar */}
         <div className={`
            flex items-center justify-between px-4 py-3 flex-shrink-0
            border-b border-[rgb(var(--color-border-secondary))]
            bg-[rgb(var(--color-bg-surface))]/50 backdrop-blur-sm
            light:bg-white light:border-slate-300
         `}>
             <div className="flex items-center gap-3">
                 <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] light:bg-slate-100 light:border-slate-300">
                    <PenTool className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                 </div>
                 <div>
                    <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">Student Response</h3>
                    <p className="text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 font-medium">Markdown Supported</p>
                 </div>
             </div>

             <div className="flex items-center gap-1 bg-[rgb(var(--color-bg-surface-inset))]/50 p-1 rounded-xl border border-[rgb(var(--color-border-secondary))]/50 light:bg-slate-100 light:border-slate-300">
                 <ToolbarButton onClick={() => handleFormat('bold')} icon={<Bold className="w-4 h-4" />} tooltip="Bold (Ctrl+B)" disabled={disabled} />
                 <ToolbarButton onClick={() => handleFormat('italic')} icon={<Italic className="w-4 h-4" />} tooltip="Italic (Ctrl+I)" disabled={disabled} />
                 <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                 <ToolbarButton onClick={() => handleFormat('list')} icon={<List className="w-4 h-4" />} tooltip="Bullet List" disabled={disabled} />
                 <ToolbarButton onClick={() => handleFormat('list-ordered')} icon={<ListOrdered className="w-4 h-4" />} tooltip="Numbered List" disabled={disabled} />
                 <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                 <ToolbarButton onClick={() => handleZoom(-1)} icon={<ZoomOut className="w-4 h-4" />} tooltip="Decrease Font Size (Ctrl+-)" disabled={disabled || fontSize <= 12} />
                 <ToolbarButton onClick={() => handleZoom(1)} icon={<ZoomIn className="w-4 h-4" />} tooltip="Increase Font Size (Ctrl++)" disabled={disabled || fontSize >= 32} />
                 <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                 <ToolbarButton onClick={handleCopy} icon={copied ? <Check className="w-4 h-4 text-green-400 light:text-green-600" /> : <Copy className="w-4 h-4" />} tooltip="Copy to Clipboard" disabled={!value} />
                 <ToolbarButton onClick={handleClear} icon={<Eraser className="w-4 h-4" />} tooltip="Clear Text" disabled={!value || disabled} variant="danger" />
                 
                 {onToggleFocusMode && (
                     <>
                        <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                        <button
                            type="button"
                            onClick={onToggleFocusMode}
                            className={`
                                flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all duration-300 ease-out ml-1 hover-scale
                                ${isFocusMode 
                                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-300 ring-offset-2 ring-offset-[rgb(var(--color-bg-surface))] font-bold' 
                                    : 'text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-transparent'
                                }
                            `}
                            title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
                        >
                            {isFocusMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                            <span className={`text-xs ${isFocusMode ? 'inline' : 'hidden sm:inline'}`}>
                                {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
                            </span>
                        </button>
                     </>
                 )}
             </div>
         </div>
         
         {/* Tip Banner */}
         {tip && (
            <div className="bg-[rgb(var(--color-bg-surface-elevated))] border-b border-[rgb(var(--color-border-secondary))] py-2 px-4 flex justify-between items-start animate-fade-in light:bg-slate-50 light:border-slate-300">
                <div className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 mr-2 flex-1">
                    {tip}
                </div>
                {onCloseTip && (
                    <button onClick={onCloseTip} className="text-[rgb(var(--color-text-muted))] light:text-slate-400 hover:text-white light:hover:text-slate-600 hover-scale transition-colors">
                        <X className="w-3 h-3"/>
                    </button>
                )}
            </div>
         )}

        <div className={`
            relative flex-grow h-full overflow-hidden 
            bg-[rgb(var(--color-bg-surface-inset))] light:bg-white
            transition-all duration-200
        `}>
          
          {/* Backdrop Layer (Visuals) */}
          <div 
            ref={backdropRef}
            className={`${commonStyles} z-0 pointer-events-none text-[rgb(var(--color-text-primary))] light:text-slate-800`}
            style={dynamicStyle}
            aria-hidden="true"
          >
             {renderEditorHighlights(value, keywords, verb)}
          </div>

          {/* Textarea Layer (Input) */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave?.()}
            placeholder={placeholder}
            disabled={disabled}
            className={`${commonStyles} z-10 bg-transparent text-transparent caret-[rgb(var(--color-accent))] resize-none border-none outline-none placeholder:text-[rgb(var(--color-text-dim))] light:placeholder:text-slate-400`}
            style={dynamicStyle}
            spellCheck="false"
            autoCapitalize="sentences"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
        
        {/* Footer Stats */}
        <div className="px-4 py-2 flex justify-between items-center border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface))]/30 light:bg-slate-50 light:border-slate-300 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 font-medium select-none">
             <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                    <Type className="w-3 h-3" />
                    {value.length} characters
                </span>
                <span className="flex items-center gap-1.5">
                    <List className="w-3 h-3" />
                    {value.trim().split(/\s+/).filter(Boolean).length} words
                </span>
             </div>
             <div>
                {isFocusMode ? <span className="text-amber-500 font-bold flex items-center gap-1"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" /> Focus Mode Active</span> : 'Draft saved'}
             </div>
        </div>
      </div>
    );
  }
);

Editor.displayName = 'Editor';

export default Editor;
