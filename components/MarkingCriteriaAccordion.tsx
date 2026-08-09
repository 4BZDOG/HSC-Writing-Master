import React, { useState, useMemo } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo, markForBand } from '../data/commandTerms';
import { AlertCircle, Edit3, Save, X, Sparkles, Loader2, ListChecks } from 'lucide-react';
import { formatMarkingCriteria } from '../utils/dataManagerUtils';
import { generateRubricForPrompt } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';

interface MarkingCriteriaAccordionProps {
  prompt: Prompt;
  markingCriteria: string;
  onSave: (newCriteria: string) => void;
  band: number;
  userRole: UserRole;
  courseOutcomes?: CourseOutcome[];
  /** Rendered inside an AccordionSection, which supplies the card, the title
   *  and the band line. */
  embedded?: boolean;
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
  courseOutcomes = [],
  embedded = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(markingCriteria);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const canCurate = canCurateContent(userRole);
  // AI drafting is a separate capability from manual editing — see
  // utils/permissions.ts. The ROLE decides whether the control exists at all;
  // the PLAN decides whether it fires or opens the upgrade prompt. Rubric
  // drafting is part of the AI Content Studio and has to carry the same lock as
  // the rest of it — it was the one authoring control the plan gate missed, so
  // an author saw "Generate question" locked and "AI Draft" open on the same
  // screen.
  const canGenerate = canUseAiGeneration(userRole);
  const studioLocked = isFeatureLocked('aiContentStudio');
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  const maxPossibleBand = useMemo(() => {
    return getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier);
  }, [prompt.totalMarks, commandTermInfo.tier]);

  const maxBandConfig = useMemo(() => getBandConfig(maxPossibleBand), [maxPossibleBand]);

  const parsedCriteria: MarkingCriteriaItem[] = useMemo(() => {
    const formattedCriteria = formatMarkingCriteria(markingCriteria);
    if (!formattedCriteria) return [];

    const items: MarkingCriteriaItem[] = [];

    // Normalize: strip markdown bold, mid-line bullets → newlines
    let normalizedText = formattedCriteria.replace(/\*\*/g, '');
    normalizedText = normalizedText.replace(/ • /g, '\n- ');

    const lines = normalizedText.split('\n');
    let currentItem: MarkingCriteriaItem | null = null;

    // Regex 1: "[Marks] marks:" or "[Marks]:" at START of line (with optional bullet/pipe prefix)
    // Matches: "5 marks:", "3-4 marks:", "5:", "3–4 marks -", "• 5 marks:", etc.
    const startMarkRegex = new RegExp(
      '^[-•*|]?\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*(?:marks?)?\\s*[:|.\\-)]+\\s*(.*)',
      'i'
    );

    // Regex 2: Point breakdown style "Descriptor... ([Mark] mark)" anywhere in
    // line. The third group keeps whatever follows the bracket — a row written
    // as "Band 6 (7-8 marks): Comprehensive analysis…" used to be stored as the
    // words before the bracket alone, silently discarding the actual criteria.
    const endMarkRegex = new RegExp(
      '(.*?)\\((\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*marks?\\)\\s*[:.\\-–]?\\s*(.*)',
      'i'
    );

    // Regex 3: "Band N:" or "Band N-M:" pattern (AI sometimes uses band labels)
    const bandStartRegex = new RegExp(
      '^[-•*]?\\s*band\\s+(\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*[:|.\\-)]+\\s*(.*)',
      'i'
    );

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.match(new RegExp('^[|\\-]+$'))) return;

      const startMatch = cleanLine.match(startMarkRegex);
      const endMatch = cleanLine.match(endMarkRegex);
      const bandMatch = cleanLine.match(bandStartRegex);

      if (startMatch && startMatch[1]) {
        if (currentItem) items.push(currentItem);
        const range = parseMarkRange(startMatch[1].trim());
        currentItem = {
          markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
          markRange: range,
          description: startMatch[2].trim(),
          band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier),
        };
      } else if (bandMatch) {
        if (currentItem) items.push(currentItem);
        const bandNums = bandMatch[1].match(/\d+/g)?.map(Number) || [1];
        const topBand = Math.max(...bandNums);
        // The mark this band starts at on THIS question — tier-aware, like every
        // other band figure in the app. The old inline `(band / 6) * totalMarks`
        // ignored the verb's ceiling, so a Tier-2 question's rows were placed
        // against marks it can never award.
        const bandMark = markForBand(topBand, prompt.totalMarks, commandTermInfo.tier);
        currentItem = {
          markLabel: `Band ${topBand}`,
          markRange: [bandMark, bandMark],
          description: bandMatch[2].trim(),
          band: topBand,
        };
      } else if (endMatch) {
        if (currentItem) items.push(currentItem);
        const range = parseMarkRange(endMatch[2].trim());
        const before = endMatch[1].replace(/^[-•*]\s*/, '').trim();
        const after = (endMatch[3] || '').trim();
        // Prefer the criteria that follow the bracket; fall back to the label
        // before it when the row is written as "Describes both features (2 marks)".
        const desc = after || before;

        // Stays the current item rather than being closed off, so wrapped or
        // continuation lines beneath it are appended instead of dropped.
        currentItem = {
          markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
          markRange: range,
          description: desc,
          band: getBandForMark(range[1], prompt.totalMarks, commandTermInfo.tier),
        };
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

  const handleSave = () => {
    onSave(editText);
    setIsEditing(false);
  };
  const handleCancel = () => {
    setEditText(markingCriteria);
    setIsEditing(false);
  };

  const handleGenerateRubric = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const rubric = await generateRubricForPrompt(prompt, courseOutcomes);
      setEditText(rubric);
      setIsEditing(true);
    } catch (e) {
      // Surface the failure — a spinner that stops with no result reads as a
      // dead button, not a failed AI call.
      setGenerateError(e instanceof Error ? e.message : 'AI draft failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Embedded, the enclosing AccordionSection already supplies the card, the
  // title and the band line — leaving this component's own header to announce
  // "Marking Criteria" directly beneath a panel headed "Marking Guide". Only
  // the curator controls still need a home, in the same slim row the exemplars
  // panel uses.
  const curatorControls = canCurate ? (
    <div className="flex gap-2">
      {!isEditing ? (
        <>
          {canGenerate && (
            <button
              onClick={
                studioLocked ? () => requestUpgrade('aiContentStudio') : handleGenerateRubric
              }
              disabled={isGenerating}
              title={
                studioLocked
                  ? 'AI rubric drafting is part of the AI Content Studio — tap to learn more'
                  : undefined
              }
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shadow-sm text-[10px] font-bold uppercase tracking-wider hover:shadow ${
                studioLocked
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-500 light:text-amber-600'
                  : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-500/30 text-indigo-500 dark:text-indigo-400'
              }`}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AI Draft
              {studioLocked && <PlusLockChip feature="aiContentStudio" />}
            </button>
          )}
          <button
            onClick={() => {
              setEditText(markingCriteria);
              setIsEditing(true);
            }}
            title="Edit criteria"
            aria-label="Edit criteria"
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <div className="flex gap-1.5">
          <button
            onClick={handleCancel}
            aria-label="Cancel edit"
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            aria-label="Save"
            className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className={
        embedded
          ? 'flex flex-col gap-3'
          : 'clip-stable bg-white dark:bg-[rgb(var(--color-bg-surface))] rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col'
      }
    >
      {embedded ? (
        curatorControls && <div className="flex justify-end">{curatorControls}</div>
      ) : (
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${maxBandConfig.bg} ${maxBandConfig.text}`}>
              <ListChecks className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
                Marking Criteria
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium opacity-80">
                Top Level: Band {maxPossibleBand}
              </p>
            </div>
          </div>
          {curatorControls}
        </div>
      )}

      <div className={embedded ? '' : 'p-4 bg-slate-50/30 dark:bg-black/20'}>
        {generateError && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-500/20 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center justify-between gap-2 animate-fade-in">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {generateError}
            </span>
            <button
              onClick={() => setGenerateError(null)}
              aria-label="Dismiss"
              className="p-1 rounded hover:bg-red-500/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
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
                  // The band identity is carried by a SOLID mark column, not by
                  // a tinted wash and a half-opacity hairline. In light mode
                  // those two were enough — `border-<hue>-600` at full strength
                  // over a near-white panel reads clearly. On the dark surface
                  // the same pair (`bg-<hue>-500/10`, `border-<hue>-500/50`)
                  // collapsed towards the panel behind it, so a marking guide
                  // that was a legible ladder in light mode was a stack of grey
                  // rows in dark. A solid fill and its band name cannot fade
                  // into any surface, and both themes now say the same thing.
                  <div
                    key={idx}
                    className={`flex items-stretch rounded-xl border ${itemConfig.border} ${itemConfig.bg} overflow-hidden group shadow-sm transition-all`}
                  >
                    <div
                      className={`w-16 flex flex-col items-center justify-center gap-0.5 p-2 ${itemConfig.solidBg} ${itemConfig.solidText} flex-shrink-0 text-center`}
                    >
                      <span className="text-lg font-black leading-none">{item.markLabel}</span>
                      {/* A rubric written in band labels already says "Band 6"
                          in the mark column — repeating it underneath reads as
                          a rendering fault. */}
                      {!/^band/i.test(item.markLabel) && (
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-80 leading-none">
                          Band {item.band}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-serif">
                      {renderFormattedText(item.description, prompt.keywords, prompt.verb)}
                    </div>
                  </div>
                );
              })
            ) : markingCriteria ? (
              <div
                className={`p-4 rounded-xl border ${maxBandConfig.border} bg-white dark:bg-black/20 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-serif shadow-sm`}
              >
                {renderFormattedText(markingCriteria, prompt.keywords, prompt.verb)}
              </div>
            ) : (
              <div className="py-8 px-4 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  No detailed criteria available.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkingCriteriaManager;
