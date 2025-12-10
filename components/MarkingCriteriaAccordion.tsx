
import React, { useState, useMemo } from 'react';
import { Prompt, UserRole } from '../types';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { Edit3, Save, X, ListChecks, Table as TableIcon } from 'lucide-react';
import { formatMarkingCriteria } from '../utils/dataManagerUtils';

interface MarkingCriteriaAccordionProps {
  prompt: Prompt;
  markingCriteria: string;
  onSave: (newCriteria: string) => void;
  band: number;
  userRole: UserRole;
}

interface MarkingCriteriaItem {
    markLabel: string;
    markRange: [number, number]; // [min, max]
    description: string;
    band: number;
}

const MarkingCriteriaManager: React.FC<MarkingCriteriaAccordionProps> = ({
  prompt,
  markingCriteria,
  onSave,
  band,
  userRole,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(markingCriteria);
  const isAdmin = userRole === 'admin';
  
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  // Robust Parser Logic
  const parsedCriteria: MarkingCriteriaItem[] = useMemo(() => {
    // Pre-process criteria to fix common formatting issues and strip HTML
    const formattedCriteria = formatMarkingCriteria(markingCriteria);
    if (!formattedCriteria) return [];
    
    const items: MarkingCriteriaItem[] = [];
    let rawText = formattedCriteria.trim();

    // 1. Try Parsing JSON
    if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
            const json = JSON.parse(rawText);
            // Handle Array format: [{marks: "1-2", criteria: "..."}]
            if (Array.isArray(json)) {
                 json.forEach((item: any) => {
                     if (item.marks && item.criteria) {
                         const range = parseMarkRange(item.marks);
                         items.push({
                             markLabel: item.marks.toString(),
                             markRange: range,
                             description: item.criteria,
                             band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier)
                         });
                     }
                 });
            } 
            // Handle Object format: {"1-2 marks": "..."}
            else if (typeof json === 'object' && json !== null) {
                Object.entries(json).forEach(([key, value]) => {
                    const range = parseMarkRange(key);
                    items.push({
                        markLabel: key,
                        markRange: range,
                        description: String(value),
                        band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier)
                    });
                });
            }
        } catch (e) {
            // Fallback to text parsing if JSON fails
        }
    }

    // 2. Text Parsing (if JSON failed or empty)
    if (items.length === 0) {
        // Pre-processing: Ensure items on separate lines if they look like a list but lack newlines
        // Replace • or similar bullets with newlines if they are embedded in text
        if (!rawText.includes('\n') || rawText.split('\n').length < 2) {
             // Split on bullets (•, *) or hyphens preceded by space/start
             rawText = rawText.replace(/([•*])/g, '\n$1').replace(/(^|\s)- /g, '$1\n- ');
        }

        const lines = rawText.split('\n');
        let currentItem: MarkingCriteriaItem | null = null;

        // Regex Strategies
        
        // A. Starts with mark: "- 1-2 marks: Description" OR "1-2: Description" OR "5 marks: Description"
        // Allows optional bullet at start. Allows optional "marks" word. Separator can be :, |, ., ) or - or space
        const startMarkRegex = /^[-•*|]?\s*(\d+(?:\s*[-–]\s*\d+)?)(?:\s*marks?[:|.)-]?|\s*[:|.)-])\s*(.*)/i;
        
        // B. Ends with mark: "Description (1 mark)" or "Description (1-2 marks)."
        const endMarkRegex = /^[-*•\s]*(.*?)\s*\((\d+(?:\s*[-–]\s*\d+)?)\s*marks?\)\.?[,;]?\s*$/i;

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (!cleanLine) return;
            if (cleanLine.match(/^[|-]+$/)) return; // Skip table separator lines

            let match = cleanLine.match(startMarkRegex);
            let matchType = 'start';

            // If no start match, check for end match
            if (!match) {
                const endMatch = cleanLine.match(endMarkRegex);
                if (endMatch) {
                    match = endMatch;
                    matchType = 'end';
                }
            }

            if (match) {
                // New Item Found
                if (currentItem) items.push(currentItem);

                let label = '';
                let desc = '';

                if (matchType === 'start') {
                    // Group 1 is label (number), Group 2 is desc
                    label = match[1].trim();
                    desc = match[2].trim().replace(/\|$/, '').trim(); // Clean trailing pipe
                } else {
                    // Group 1 is desc, Group 2 is label
                    desc = match[1].trim();
                    label = match[2].trim();
                }

                const range = parseMarkRange(label);

                currentItem = {
                    markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
                    markRange: range,
                    description: desc,
                    band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier)
                };
            } else {
                // Continuation of previous item (multi-line descriptions)
                if (currentItem) {
                    currentItem.description += ' ' + cleanLine;
                } else {
                    // Content before any marks defined (preamble) - ignored for grid
                }
            }
        });

        if (currentItem) items.push(currentItem);
    }

    // Sort by max mark descending
    return items.sort((a, b) => b.markRange[1] - a.markRange[1]);

  }, [markingCriteria, prompt.totalMarks, commandTermInfo.tier]);

  // Helper: Parse "1-2" or "3" into [1, 2] or [3, 3]
  function parseMarkRange(str: string): [number, number] {
      const numbers = str.match(/(\d+)/g);
      if (!numbers) return [0, 0];
      const nums = numbers.map(Number);
      if (nums.length === 1) return [nums[0], nums[0]];
      return [Math.min(...nums), Math.max(...nums)];
  }

  const bandConfig = getBandConfig(band);

  const handleSave = () => {
    onSave(editText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(markingCriteria);
    setIsEditing(false);
  };

  return (
    <div className={`
      rounded-xl overflow-hidden border border-[rgb(var(--color-border-secondary))]/50
      bg-[rgb(var(--color-bg-surface-inset))]/30 transition-all hover:border-[rgb(var(--color-border-secondary))]
      flex flex-col
    `}>
       {/* Header Toolbar */}
       <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--color-border-secondary))]/30 bg-[rgb(var(--color-bg-surface-inset))]/20">
           <div className="flex items-center gap-2">
                <TableIcon className={`w-4 h-4 ${bandConfig.text}`} />
                <h4 className="text-sm font-bold text-[rgb(var(--color-text-primary))]">
                    Marking Guidelines
                </h4>
           </div>
           {isAdmin && (
             <div className="flex space-x-1">
                {!isEditing ? (
                    <button
                    onClick={() => setIsEditing(true)}
                    className={`
                        p-1.5 rounded-lg transition-all duration-200 hover-scale
                        text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]
                        hover:bg-[rgb(var(--color-bg-surface-light))]
                    `}
                    title="Edit Criteria"
                    >
                    <Edit3 className="w-4 h-4" />
                    </button>
                ) : (
                    <>
                        <button
                            onClick={handleCancel}
                            className={`
                                p-1.5 rounded-lg transition-all duration-200 hover-scale
                                text-red-400 hover:bg-red-500/10
                            `}
                            title="Cancel"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSave}
                            className={`
                                p-1.5 rounded-lg transition-all duration-200 hover-scale
                                text-green-400 hover:bg-green-500/10
                            `}
                            title="Save"
                        >
                            <Save className="w-4 h-4" />
                        </button>
                    </>
                )}
             </div>
           )}
       </div>

      <div className="p-0">
        {isEditing && isAdmin ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={12}
            className="w-full bg-[rgb(var(--color-bg-surface-light))] border-none p-4 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] transition text-sm font-mono leading-relaxed resize-y"
            autoFocus
            placeholder={`Format:\n\n1-2 marks: Description\n3-4 marks: Description\n\nOR Markdown Table:\n| Marks | Criteria |\n| 1-2 | ... |`}
          />
        ) : (
          <div className="flex flex-col"> 
            {parsedCriteria.length > 0 ? (
                parsedCriteria.map((criterion, index) => {
                    const itemConfig = getBandConfig(criterion.band);
                    return (
                        <div 
                            key={index} 
                            className={`
                                relative flex flex-row overflow-hidden group
                                border-b last:border-b-0 border-[rgb(var(--color-border-secondary))]/20
                            `}
                        >
                            {/* Band-colored background tint - Increased visibility via solidBg + opacity */}
                            <div className={`absolute inset-0 ${itemConfig.solidBg} opacity-[0.12] light:opacity-[0.15] transition-colors`} />
                            
                            {/* Solid Band Color Bar on Left - Inset to avoid border overlap */}
                            <div className={`absolute left-1 top-1 bottom-1 w-1.5 rounded-full ${itemConfig.solidBg}`} />

                             {/* Mark Column */}
                             <div className={`
                                relative z-10
                                w-24 sm:w-32 flex-shrink-0 flex flex-col items-center justify-center p-4 pl-6
                                border-r border-[rgb(var(--color-border-secondary))]/10
                             `}>
                                <div className="text-center">
                                    <span className={`block text-xl font-black ${itemConfig.text} leading-none mb-1`}>
                                        {criterion.markLabel}
                                    </span>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider opacity-80 ${itemConfig.text}`}>
                                        Marks
                                    </span>
                                </div>
                            </div>
                            
                            {/* Description Column */}
                            <div className="flex-1 p-4 flex items-center relative z-10">
                                <div className={`text-sm leading-relaxed text-[rgb(var(--color-text-secondary))] group-hover:text-[rgb(var(--color-text-primary))] transition-colors prose prose-sm max-w-none`}>
                                    {renderFormattedText(criterion.description, prompt.keywords, prompt.verb)}
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                // Fallback for content that exists but couldn't be parsed into the grid structure
                markingCriteria ? (
                    <div className="p-6 text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed whitespace-pre-wrap font-serif">
                        {renderFormattedText(markingCriteria, prompt.keywords, prompt.verb)}
                    </div>
                ) : (
                    // Empty state
                    <div className="p-8 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgb(var(--color-bg-surface-inset))] mb-3">
                             <ListChecks className="w-6 h-6 text-[rgb(var(--color-text-muted))]" />
                        </div>
                        <p className="text-sm text-[rgb(var(--color-text-muted))] italic">
                            No explicit marking criteria defined.
                        </p>
                    </div>
                )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkingCriteriaManager;
