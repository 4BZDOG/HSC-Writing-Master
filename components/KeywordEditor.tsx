import React, { useState, useEffect, useMemo } from 'react';
import { Prompt, UserRole } from '../types';
import { canCurateContent } from '../utils/permissions';
import { AlertCircle, Sparkles, RefreshCw, Plus, X, Check, BookMarked } from 'lucide-react';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';

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
  /** Syllabus dot point text — terms found within it are flagged as coming
   *  straight from the syllabus. */
  syllabusText?: string;
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
  onAddWord,
  syllabusText = '',
}) => {
  const [keywords, setKeywords] = useState<string[]>(prompt.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const canCurate = canCurateContent(userRole);

  // Colour used terms in the question's TARGET band — the same predefined band
  // colour the writing area and metrics use — so "a term is in your answer"
  // reads as "you're building toward this band".
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const targetBand = useMemo(
    () => getTargetBand(prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );
  const bandConfig = useMemo(() => getBandConfig(targetBand), [targetBand]);

  useEffect(() => {
    setKeywords(prompt.keywords || []);
  }, [prompt.keywords]);

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim()) && canCurate) {
      const updatedKeywords = [...keywords, newKeyword.trim()];
      setKeywords(updatedKeywords);
      onKeywordsChange(updatedKeywords);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    if (!canCurate) return;
    const updatedKeywords = keywords.filter((kw) => kw !== keywordToRemove);
    setKeywords(updatedKeywords);
    onKeywordsChange(updatedKeywords);
  };

  const usageMap = useMemo(() => {
    // Shares the highlighter's matcher, so a chip ticks exactly when the term
    // lights up in the writing area — never one without the other.
    const map = new Map<string, boolean>();
    keywords.forEach((kw) => map.set(kw, textContainsKeyword(userAnswer, kw)));
    return map;
  }, [userAnswer, keywords]);

  // Which terms come straight from the syllabus dot point (vs supporting terms
  // the AI added around it). Uses the same matcher as the highlighter so the
  // flag is consistent with everything else.
  const syllabusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    keywords.forEach((kw) => map.set(kw, textContainsKeyword(syllabusText, kw)));
    return map;
  }, [syllabusText, keywords]);
  const hasSyllabusSourced = useMemo(
    () => Array.from(syllabusMap.values()).some(Boolean),
    [syllabusMap]
  );

  // Show the syllabus-named terms first (stable within each group), so the
  // authoritative must-use terms lead the list.
  const orderedKeywords = useMemo(() => {
    const fromSyllabus = keywords.filter((kw) => syllabusMap.get(kw));
    const supporting = keywords.filter((kw) => !syllabusMap.get(kw));
    return [...fromSyllabus, ...supporting];
  }, [keywords, syllabusMap]);

  const isLoading = isEnriching || isSuggesting || isRegenerating;
  const error = regenerateError || suggestError;

  const usedCount = useMemo(() => Array.from(usageMap.values()).filter(Boolean).length, [usageMap]);
  const total = keywords.length;
  const allUsed = total > 0 && usedCount === total;

  return (
    <div className="space-y-5">
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
              Weave these syllabus terms in for a{' '}
              <span className={`font-black ${bandConfig.text}`}>Band {targetBand}</span> response.
            </p>
            <span
              className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                allUsed
                  ? `${bandConfig.bg} ${bandConfig.text} ${bandConfig.border}`
                  : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
              }`}
              title="Terms detected in your response so far"
            >
              {usedCount}/{total} used
            </span>
          </div>
          {hasSyllabusSourced && (
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400/80">
              <BookMarked className="w-3 h-3 shrink-0" />
              Terms with this mark are named directly in the syllabus dot point.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {orderedKeywords.map((kw) => {
          const isUsed = usageMap.get(kw);
          const fromSyllabus = syllabusMap.get(kw);

          // Use tier-based coloring if used, or a neutral state if not.
          // Syllabus-sourced (not-yet-used) terms carry a faint emerald ring —
          // the same hue they highlight in — so they read as the authoritative
          // must-use terms even before they appear in the answer.
          const styleClass = isUsed
            ? `${bandConfig.bg} ${bandConfig.text} ${bandConfig.border} shadow-sm`
            : fromSyllabus
              ? 'bg-emerald-50/60 dark:bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300 border-emerald-300/70 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-500/50'
              : 'bg-slate-100/50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-100 dark:hover:bg-white/[0.06]';

          return (
            <button
              key={kw}
              onClick={() => onAddWord && onAddWord(kw)}
              title={
                fromSyllabus
                  ? 'Named in the syllabus dot point — a must-use term'
                  : 'Supporting term — click to add it to your answer'
              }
              className={`
                          group relative inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-tight transition-all duration-300 border
                          ${styleClass}
                          hover:scale-[1.02] active:scale-[0.98]
                        `}
            >
              {isUsed ? (
                <Check className="w-3 h-3" strokeWidth={3} />
              ) : fromSyllabus ? (
                <BookMarked className="w-3 h-3 shrink-0 opacity-70" />
              ) : (
                <div
                  className={`w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-indigo-400 transition-colors`}
                />
              )}
              <span>{kw}</span>
              {canCurate && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveKeyword(kw);
                  }}
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
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">
              No syllabus terms defined
            </span>
          </div>
        )}
      </div>

      {canCurate && (
        <div className="flex gap-2">
          <form onSubmit={handleAddKeyword} className="flex-1 relative">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Add new term..."
              className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2 px-4 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
            <button
              type="submit"
              disabled={!newKeyword.trim()}
              aria-label="Add term"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 dark:hover:text-white disabled:opacity-0 transition-colors"
            >
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
