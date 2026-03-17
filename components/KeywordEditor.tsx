import React, { useState, useEffect, useMemo } from 'react';
import { Prompt, UserRole } from '../types';
import { AlertCircle, Sparkles, RefreshCw, Plus, X, Check } from 'lucide-react';
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

  // Get color config based on question type (tier)
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const bandConfig = useMemo(() => getBandConfig(verbInfo.tier), [verbInfo.tier]);

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
  
  const usageMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const textLower = userAnswer.toLowerCase();
    keywords.forEach(kw => {
        const variants = getKeywordVariants(kw);
        const isUsed = variants.some(v => {
            try { return new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(textLower); } catch { return false; }
        });
        map.set(kw, isUsed);
    });
    return map;
  }, [userAnswer, keywords]);
  
  const isLoading = isEnriching || isSuggesting || isRegenerating;
  const error = regenerateError || suggestError;

  return (
    <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
            {keywords.map(kw => {
                const isUsed = usageMap.get(kw);
                
                // Use tier-based coloring if used, or a neutral state if not
                const styleClass = isUsed 
                    ? `${bandConfig.bg} ${bandConfig.text} ${bandConfig.border} shadow-sm` 
                    : 'bg-slate-100/50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-100 dark:hover:bg-white/[0.06]';

                return (
                    <button 
                        key={kw} 
                        onClick={() => onAddWord && onAddWord(kw)}
                        className={`
                          group relative inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-tight transition-all duration-300 border
                          ${styleClass}
                          hover:scale-[1.02] active:scale-[0.98]
                        `}
                    >
                        {isUsed ? (
                          <Check className="w-3 h-3" strokeWidth={3} />
                        ) : (
                          <div className={`w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-indigo-400 transition-colors`} />
                        )}
                        <span>{kw}</span>
                        {isAdmin && (
                            <div 
                              onClick={(e) => { e.stopPropagation(); handleRemoveKeyword(kw); }}
                              className="ml-1 p-0.5 rounded-full hover:bg-red-500/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-2.5 h-2.5" strokeWidth={3} />
                            </div>
                        )}
                    </button>
                );
            })}
            {keywords.length === 0 && (
              <div className="w-full py-4 text-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">No syllabus terms defined</span>
              </div>
            )}
        </div>
        
        {isAdmin && (
            <div className="flex gap-2">
                <form onSubmit={handleAddKeyword} className="flex-1 relative">
                    <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Add new term..."
                        className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2 px-4 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    />
                    <button type="submit" disabled={!newKeyword.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 dark:hover:text-white disabled:opacity-0 transition-colors">
                      <Plus className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                </form>
                <div className="flex gap-1.5">
                    <button 
                      onClick={onSuggest} 
                      disabled={isLoading} 
                      className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all shadow-sm active:scale-90" 
                      title="Suggest with AI"
                    >
                      <Sparkles className={`w-4 h-4 ${isSuggesting ? 'animate-pulse' : ''}`} />
                    </button>
                    <button 
                      onClick={onRegenerate} 
                      disabled={isLoading} 
                      className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all shadow-sm active:scale-90" 
                      title="Regenerate all"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-500/20 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> 
            {error}
          </div>
        )}
    </div>
  );
};

export default KeywordEditor;