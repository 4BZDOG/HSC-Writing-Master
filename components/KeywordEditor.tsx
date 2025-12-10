
import React, { useState, useEffect, useMemo } from 'react';
import { Prompt, UserRole } from '../types';
import { AlertCircle, Sparkles, RefreshCw, Plus, X, Tag, Check, Copy } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import { getBandConfig, getKeywordVariants, escapeRegExp } from '../utils/renderUtils';

interface KeywordEditorProps {
  prompt: Prompt;
  onKeywordsChange: (keywords: string[]) => void;
  isEnriching: boolean;
  onRegenerate: () => void;
  isRegenerating: boolean;
  regenerateError: React.ReactNode | null;
  onSuggest: () => void;
  isSuggesting: boolean;
  suggestError: React.ReactNode | null;
  userRole: UserRole;
  userAnswer?: string;
  onAddWord?: (word: string) => void;
}

const KeywordEditor: React.FC<KeywordEditorProps> = ({ 
  prompt, 
  onKeywordsChange, 
  isEnriching, 
  onRegenerate, 
  isRegenerating,
  regenerateError,
  onSuggest,
  isSuggesting,
  suggestError,
  userRole,
  userAnswer = '',
  onAddWord
}) => {
  const [keywords, setKeywords] = useState<string[]>(prompt.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const isAdmin = userRole === 'admin';

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const bandConfig = useMemo(() => getBandConfig(commandTermInfo.tier), [commandTermInfo.tier]);

  useEffect(() => {
    setKeywords(prompt.keywords || []);
  }, [prompt.keywords]);

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim()) && isAdmin) {
      const updatedKeywords = [...keywords, newKeyword.trim()];
      setKeywords(updatedKeywords);
      onKeywordsChange(updatedKeywords);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    if (!isAdmin) return;
    const updatedKeywords = keywords.filter(kw => kw !== keywordToRemove);
    setKeywords(updatedKeywords);
    onKeywordsChange(updatedKeywords);
  };
  
  // Usage tracking logic
  const usageMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const textLower = userAnswer.toLowerCase();
    
    keywords.forEach(kw => {
        const variants = getKeywordVariants(kw);
        const isUsed = variants.some(v => {
            try {
                return new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(textLower);
            } catch { return false; }
        });
        map.set(kw, isUsed);
    });
    
    return map;
  }, [userAnswer, keywords]);
  
  const usedCount = Array.from(usageMap.values()).filter(Boolean).length;
  
  const isLoading = isEnriching || isSuggesting || isRegenerating;
  const error = regenerateError || suggestError;

  return (
    <div className={`
      rounded-xl overflow-hidden border border-[rgb(var(--color-border-secondary))]/50
      bg-[rgb(var(--color-bg-surface-inset))]/30
    `}>
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--color-border-secondary))]/30">
            <div className="flex items-center gap-2">
                <Tag className={`w-4 h-4 ${bandConfig.text}`} />
                <h4 className="text-sm font-bold text-[rgb(var(--color-text-primary))]">
                    Syllabus Keywords
                </h4>
                {/* Styled Count Chip */}
                <div className="flex items-center text-[10px] font-bold bg-[rgb(var(--color-bg-surface-elevated))] rounded-full border border-[rgb(var(--color-border-secondary))] overflow-hidden">
                    <span className="px-1.5 py-0.5 text-emerald-400 bg-emerald-500/10 border-r border-[rgb(var(--color-border-secondary))]">{usedCount}</span>
                    <span className="px-1.5 py-0.5 text-[rgb(var(--color-text-dim))]">{keywords.length}</span>
                </div>
            </div>
            {isAdmin && (
             <div className="flex space-x-1">
                <button
                    onClick={onSuggest}
                    disabled={isLoading}
                    className={`
                        p-1.5 rounded-lg transition-all duration-200 hover-scale
                        text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]
                        hover:bg-[rgb(var(--color-bg-surface-light))]
                        disabled:opacity-50
                    `}
                    title="Suggest more keywords with AI"
                >
                    <Sparkles className={`w-4 h-4 ${isSuggesting ? 'animate-pulse text-[rgb(var(--color-accent))]' : ''}`} />
                </button>
                 <button
                    onClick={onRegenerate}
                    disabled={isLoading}
                    title="Regenerate keywords from scratch"
                    className={`
                        p-1.5 rounded-lg transition-all duration-200 hover-scale
                        text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]
                        hover:bg-[rgb(var(--color-bg-surface-light))]
                        disabled:opacity-50
                    `}
                >
                    <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin text-[rgb(var(--color-accent))]' : ''}`} />
                </button>
             </div>
            )}
        </div>

        <div className="p-4 space-y-4">
            {error && !isLoading && (
              <div className="bg-red-900/30 p-3 rounded-lg border border-red-500/50 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-300 leading-relaxed">{error}</div>
              </div>
            )}
          
            {isEnriching && !prompt.keywords?.length ? (
                <div className="flex flex-col items-center justify-center py-6 text-[rgb(var(--color-text-dim))] gap-2">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" />
                    <p className="text-xs italic">Analysing question context...</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        {keywords.map(kw => {
                            const isUsed = usageMap.get(kw);
                            return (
                                <button 
                                    key={kw} 
                                    onClick={() => onAddWord && onAddWord(kw)}
                                    title={onAddWord ? "Click to insert" : undefined}
                                    className={`
                                        group inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200
                                        border shadow-sm
                                        ${isUsed 
                                            ? `bg-emerald-500/10 text-emerald-400 border-emerald-500/30` 
                                            : `bg-[rgb(var(--color-bg-surface))] text-[rgb(var(--color-text-secondary))] border-[rgb(var(--color-border-secondary))] hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-text-primary))]`
                                        }
                                        ${onAddWord ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}
                                    `}
                                >
                                    {isUsed && <Check className="w-3 h-3 flex-shrink-0" />}
                                    <span>{kw}</span>
                                    {isAdmin && (
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); handleRemoveKeyword(kw); }} 
                                            className={`
                                                p-0.5 rounded-full opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity
                                                hover:bg-red-500/20 hover:text-red-400 -mr-1 ml-1 cursor-pointer
                                            `}
                                            title="Remove"
                                        >
                                            <X className="w-3 h-3" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        {keywords.length === 0 && (
                            <p className="text-sm text-[rgb(var(--color-text-muted))] italic py-2 w-full text-center">
                                No keywords defined. {isAdmin ? "Add some below or use AI to suggest." : ""}
                            </p>
                        )}
                    </div>
                    
                    {isAdmin && (
                        <form onSubmit={handleAddKeyword} className="relative group">
                            <input
                                type="text"
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.target.value)}
                                placeholder="Add a specific term..."
                                className="
                                    w-full bg-[rgb(var(--color-bg-surface-light))]/50 
                                    border border-[rgb(var(--color-border-secondary))] 
                                    rounded-lg py-2 pl-3 pr-10 text-sm 
                                    focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-transparent 
                                    focus:bg-[rgb(var(--color-bg-surface-light))]
                                    transition-all duration-200
                                    placeholder:text-[rgb(var(--color-text-dim))]
                                "
                            />
                            <button 
                                type="submit" 
                                disabled={!newKeyword.trim()}
                                className={`
                                    absolute right-1 top-1 bottom-1 px-2 rounded-md 
                                    flex items-center justify-center transition-all duration-200 hover-scale active:scale-95
                                    ${newKeyword.trim() 
                                        ? 'bg-[rgb(var(--color-accent))] text-white hover:bg-[rgb(var(--color-accent-dark))]' 
                                        : 'text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-border-secondary))] cursor-default'
                                    }
                                `}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </form>
                    )}
                </>
            )}
        </div>
    </div>
  );
};

export default KeywordEditor;
