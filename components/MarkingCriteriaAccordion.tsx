import React, { useState, useMemo, useRef } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { AlertCircle, BookOpen, Edit3, Save, X, Sparkles, Loader2, ListChecks } from 'lucide-react';
import { generateRubricForPrompt } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import MathSymbolToolbar from './MathSymbolToolbar';
import LadderRow from './LadderRow';
import { LADDER_MODEL_ANSWER, LADDER_STACK } from '../utils/ladderChrome';
import {
  exemplarMarkForItem,
  isBandLabelled,
  parseMarkingCriteria,
} from '../utils/markingGuideParse';
import { requestOpenExemplar } from '../utils/ladderLink';

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
  const criteriaTextareaRef = useRef<HTMLTextAreaElement>(null);
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

  // The rows of the guide, highest mark first. The parser lives in
  // utils/markingGuideParse so the Sample Answers panel can read the same rows.
  const parsedCriteria = useMemo(
    () => parseMarkingCriteria(markingCriteria, prompt.totalMarks, commandTermInfo.tier),
    [markingCriteria, prompt.totalMarks, commandTermInfo.tier]
  );
  const sampleAnswers = prompt.sampleAnswers ?? [];

  const handleSave = () => {
    onSave(editText);
    setIsEditing(false);
  };
  const handleCancel = () => {
    setEditText(markingCriteria);
    setIsEditing(false);
  };

  const handleGenerateRubric = async () => {
    if (isGenerating) return;
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
              className={`t-label flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shadow-sm hover:shadow-lg ${
                studioLocked
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-500 light:text-amber-600'
                  : 'bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 hover:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
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
          : 'clip-stable bg-white dark:bg-[rgb(var(--color-bg-surface))] rounded-panel border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col'
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
              <h3 className="t-section text-slate-900 dark:text-white">Marking Criteria</h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                Top Level: Band {maxPossibleBand}
              </p>
            </div>
          </div>
          {curatorControls}
        </div>
      )}

      <div className={embedded ? '' : 'p-4 bg-slate-50/30 dark:bg-black/20'}>
        {generateError && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-500/20 text-[10px] font-medium text-red-600 dark:text-red-400 flex items-center justify-between gap-2 animate-fade-in">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {generateError}
            </span>
            <button
              onClick={() => setGenerateError(null)}
              aria-label="Dismiss"
              className="p-1 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {isEditing ? (
          <div>
            <MathSymbolToolbar
              textareaRef={criteriaTextareaRef}
              value={editText}
              onChange={setEditText}
            />
            <textarea
              ref={criteriaTextareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={8}
              className="w-full bg-white dark:bg-[rgb(var(--color-bg-surface-inset))] border border-slate-200 dark:border-white/10 rounded-xl p-4 text-xs font-mono leading-relaxed resize-y text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g. 5 marks: Analyses effectively..."
            />
          </div>
        ) : (
          <div className={LADDER_STACK}>
            {parsedCriteria.length > 0 ? (
              parsedCriteria.map((item, idx) => {
                // The row's exemplar, if the question has one at this level. The
                // chip only says that one exists; the Sample Answers panel decides
                // what it shows.
                const exemplarMark = exemplarMarkForItem(
                  item,
                  sampleAnswers,
                  prompt.totalMarks,
                  commandTermInfo.tier
                );
                return (
                  // The shared ladder row, so the guide and the exemplars draw one
                  // gutter, one radius and one type scale. The band's colour is
                  // taken from `getBandConfig` inside LadderRow, which is the one
                  // place a band's fill, ink and edge are read from; the note there
                  // says why a light tint is a `-100` and why the edge is
                  // `band-edge` and not the token.
                  <LadderRow
                    key={idx}
                    band={item.band}
                    markLabel={item.markLabel}
                    // A band-labelled row already says "Band N" in its label.
                    bandCaption={isBandLabelled(item) ? false : `Band ${item.band}`}
                    footer={
                      exemplarMark !== undefined ? (
                        <button
                          type="button"
                          onClick={() => requestOpenExemplar(prompt.id, exemplarMark)}
                          aria-label={`See the model answer for ${exemplarMark} ${exemplarMark === 1 ? 'mark' : 'marks'}`}
                          className={LADDER_MODEL_ANSWER}
                        >
                          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                          Model answer
                        </button>
                      ) : undefined
                    }
                  >
                    <div className="t-body font-serif text-slate-600 dark:text-slate-300">
                      {renderFormattedText(item.description, prompt.keywords, prompt.verb)}
                    </div>
                  </LadderRow>
                );
              })
            ) : markingCriteria ? (
              <div
                className={`p-4 rounded-xl border ${maxBandConfig.border} bg-white dark:bg-black/20 t-body text-slate-600 dark:text-slate-300 font-serif shadow-sm`}
              >
                {renderFormattedText(markingCriteria, prompt.keywords, prompt.verb)}
              </div>
            ) : (
              <div className="py-8 px-4 text-center border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl">
                {/* A pair, where it was a bare `text-slate-400` — a dark-theme
                    tone with no light partner, measuring 2.56:1 on the white
                    panel behind it. It is also the only thing this state says,
                    so it is the one reading on the surface that has to be
                    legible. DesignSpec §2. */}
                <p className="t-label text-slate-600 dark:text-slate-400">
                  {canCurate
                    ? canGenerate
                      ? 'No marking criteria yet — add them with Edit, or start one with AI Draft.'
                      : 'No marking criteria yet — add them with Edit.'
                    : 'No marking criteria for this question yet. Your teacher can add them.'}
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
