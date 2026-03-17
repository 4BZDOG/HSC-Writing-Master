
import React, { useState, useMemo } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { Edit3, Save, X, Target, Sparkles, Loader2, ListChecks } from 'lucide-react';
import { formatMarkingCriteria } from '../utils/dataManagerUtils';
import { generateRubricForPrompt } from '../services/geminiService';

interface MarkingCriteriaAccordionProps {
  prompt: Prompt;
  markingCriteria: string;
  onSave: (newCriteria: string) => void;
  band: number;
  userRole: UserRole;
  courseOutcomes?: CourseOutcome[];
}

interface MarkingCriteriaItem {
    markLabel: string;
    markRange: [number, number];
    description: string;
    band: number;
}

const MarkingCriteriaManager: React.FC<MarkingCriteriaAccordionProps> = ({
  prompt,
  markingCriteria,
  onSave,
  band,
  userRole,
  courseOutcomes = []
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(markingCriteria);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const isAdmin = userRole === 'admin';
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  const maxPossibleBand = useMemo(() => {
    return getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier);
  }, [prompt.totalMarks, commandTermInfo.tier]);

  const maxBandConfig = useMemo(() => getBandConfig(maxPossibleBand), [maxPossibleBand]);

  const parsedCriteria: MarkingCriteriaItem[] = useMemo(() => {
    const formattedCriteria = formatMarkingCriteria(markingCriteria);
    if (!formattedCriteria) return [];
    
    const items: MarkingCriteriaItem[] = [];
    
    // Normalize mid-line bullets into newlines for better parsing
    let normalizedText = formattedCriteria.replace(/ • /g, '\n- ');
    
    const lines = normalizedText.split('\n');
    let currentItem: MarkingCriteriaItem | null = null;
    
    // Regex 1: Standard NESA style "[Marks] marks: [Descriptor]" at START of line
    const startMarkRegex = new RegExp('^[-•*|]?\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?)(?:\\s*marks?[:|.)-]?|\\s*[:|.)-])\\s*(.*)', 'i');
    
    // Regex 2: Point breakdown style "Descriptor... ([Mark] mark)" anywhere in line
    const endMarkRegex = new RegExp('(.*?)\\((\\d+)\\s*marks?\\)', 'i');

    lines.forEach(line => {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.match(new RegExp('^[|\\-]+$'))) return; 
        
        let startMatch = cleanLine.match(startMarkRegex);
        let endMatch = cleanLine.match(endMarkRegex);

        if (startMatch) {
            if (currentItem) items.push(currentItem);
            const range = parseMarkRange(startMatch[1].trim());
            currentItem = {
                markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
                markRange: range,
                description: startMatch[2].trim(),
                band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier)
            };
        } else if (endMatch) {
            const points = parseInt(endMatch[2]);
            const desc = endMatch[1].replace(/^[-•*]\s*/, '').trim();
            
            items.push({
                markLabel: `${points}`,
                markRange: [points, points],
                description: desc,
                band: getBandForMark(points, prompt.totalMarks, commandTermInfo.tier)
            });
        } else if (currentItem) {
            currentItem.description += ' ' + cleanLine;
        }
    });
    
    if (currentItem) items.push(currentItem);
    
    return items.sort((a, b) => b.markRange[1] - a.markRange[1]);
  }, [markingCriteria, prompt.totalMarks, commandTermInfo.tier]);

  function parseMarkRange(str: string): [number, number] {
      const numbers = str.match(new RegExp('(\\d+)', 'g'));
      if (!numbers) return [0, 0];
      const nums = numbers.map(Number);
      if (nums.length === 1) return [nums[0], nums[0]];
      return [Math.min(...nums), Math.max(...nums)];
  }

  const handleSave = () => { onSave(editText); setIsEditing(false); };
  const handleCancel = () => { setEditText(markingCriteria); setIsEditing(false); };

  const handleGenerateRubric = async () => {
      setIsGenerating(true);
      try {
          const rubric = await generateRubricForPrompt(prompt, courseOutcomes);
          setEditText(rubric);
          setIsEditing(true); 
      } catch (e) {
          console.error("Rubric generation failed:", e);
      } finally {
          setIsGenerating(false);
      }
  };

  return (
    <div className="bg-white dark:bg-[rgb(var(--color-bg-surface))] rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
       
       {/* Header - Matching Sample Answers Style */}
       <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${maxBandConfig.bg} ${maxBandConfig.text}`}>
                    <ListChecks className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Marking Criteria</h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium opacity-80">
                        Top Level: Band {maxPossibleBand}
                    </p>
                </div>
            </div>
            
            {isAdmin && (
                <div className="flex gap-2">
                    {!isEditing ? (
                        <>
                            <button 
                                onClick={handleGenerateRubric} 
                                disabled={isGenerating}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shadow-sm text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-500/30 text-indigo-500 dark:text-indigo-400 hover:shadow`}
                            >
                                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                AI Draft
                            </button>
                            <button onClick={() => { setEditText(markingCriteria); setIsEditing(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"><Edit3 className="w-4 h-4" /></button>
                        </>
                    ) : (
                        <div className="flex gap-1.5">
                            <button onClick={handleCancel} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><X className="w-4 h-4" /></button>
                            <button onClick={handleSave} className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"><Save className="w-4 h-4" /></button>
                        </div>
                    )}
                </div>
            )}
       </div>

       <div className="p-4 bg-slate-50/30 dark:bg-black/20">
        {isEditing ? (
          <textarea 
            value={editText} 
            onChange={(e) => setEditText(e.target.value)} 
            rows={8} 
            className="w-full bg-white dark:bg-[rgb(var(--color-bg-surface-inset))] border border-slate-200 dark:border-white/10 rounded-xl p-4 text-xs font-mono leading-relaxed resize-y text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors" 
            placeholder="e.g. 5 marks: Analyses effectively..."
          />
        ) : (
          <div className="space-y-2"> 
            {parsedCriteria.length > 0 ? (
                parsedCriteria.map((item, idx) => {
                    const itemConfig = getBandConfig(item.band);
                    return (
                        <div key={idx} className={`flex items-stretch rounded-xl border ${itemConfig.border} bg-white dark:bg-black/20 overflow-hidden group shadow-sm transition-all border-opacity-40 hover:border-opacity-100`}>
                             <div className={`w-14 flex flex-col items-center justify-center p-2 border-r ${itemConfig.border} ${itemConfig.bg} bg-opacity-20 border-opacity-20 flex-shrink-0`}>
                                <span className={`text-lg font-black ${itemConfig.text} leading-none`}>{item.markLabel}</span>
                            </div>
                            <div className="flex-1 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-serif">
                                {renderFormattedText(item.description, prompt.keywords, prompt.verb)}
                            </div>
                        </div>
                    );
                })
            ) : markingCriteria ? (
                <div className={`p-4 rounded-xl border ${maxBandConfig.border} bg-white dark:bg-black/20 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-serif shadow-sm`}>
                    {renderFormattedText(markingCriteria, prompt.keywords, prompt.verb)}
                </div>
            ) : (
                <div className="py-8 px-4 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No detailed criteria available.</p>
                </div>
            )}
          </div>
        )}
       </div>
    </div>
  );
};

export default MarkingCriteriaManager;
