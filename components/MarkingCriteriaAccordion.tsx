import React, { useState, useMemo, useRef, useEffect, useId, useCallback } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { AlertCircle, BookOpen, Edit3, Save, X, Sparkles, Loader2, ListChecks } from 'lucide-react';
import { generateRubricForPrompt } from '../services/geminiService';
import {
  describeAccess,
  isFeatureLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import MathSymbolToolbar from './MathSymbolToolbar';
import LadderRow, { ladderBandVars } from './LadderRow';
import {
  LADDER_READING,
  LADDER_EDGE_SHUT,
  LADDER_EMPTY,
  LADDER_FALLBACK,
  LADDER_FILL,
  LADDER_LINKED,
  LADDER_LINK,
  LADDER_STACK,
  LADDER_TOOL,
  LADDER_TOOL_ICON,
  LADDER_TOOL_LOCKED,
} from '../utils/ladderChrome';
import {
  criterionForMark,
  exemplarMarkForItem,
  isBandLabelled,
  parseMarkingCriteria,
} from '../utils/markingGuideParse';
import {
  requestOpenExemplar,
  useLinkedExemplar,
  useOpenCriterionRequest,
} from '../utils/ladderLink';
import { PANEL_NAME } from './PanelDisclosure';

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

/**
 * Plays a linked row's pulse again. The pulse is a CSS animation, and it runs once each
 * time the row takes it: a row that is already linked keeps its finished animation, so a
 * jump to it from the exemplar would not show anything. Clearing the animation and reading
 * layout before restoring it starts it from the top, and clearing the inline value hands
 * it back to the stylesheet, so nothing is left behind on the row.
 */
const replayLinkedPulse = (row: HTMLElement): void => {
  if (!row.classList.contains(LADDER_LINKED)) return;
  row.style.animation = 'none';
  void row.offsetWidth;
  row.style.animation = '';
};

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

  // The exemplar the student has open in the Sample Answers panel, if any, and the
  // guide row that holds its mark: that row is drawn as linked, with a ring and a
  // badge. The hook reads the last announcement for this question on mount, so a
  // guide that mounts after the exemplar opened still shows the link.
  const linkedMark = useLinkedExemplar(prompt.id);
  const rowFor = useCallback(
    (mark: number) =>
      criterionForMark(
        parsedCriteria,
        mark,
        getBandForMark(mark, prompt.totalMarks, commandTermInfo.tier)
      ),
    [parsedCriteria, prompt.totalMarks, commandTermInfo.tier]
  );
  const linkedItem = useMemo(
    () => (linkedMark === null ? undefined : rowFor(linkedMark)),
    [linkedMark, rowFor]
  );

  // The rows' elements by position, so an exemplar's "View marking criterion" can
  // bring the matching row into view and move focus to it.
  const rowId = useId();
  const rowEls = useRef(new Map<number, HTMLDivElement>());
  const jumpTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(jumpTimer.current), []);

  useOpenCriterionRequest(prompt.id, (mark) => {
    const target = rowFor(mark);
    const index = target ? parsedCriteria.indexOf(target) : -1;
    const el = index >= 0 ? rowEls.current.get(index) : undefined;
    if (!el) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bringIntoView = () => {
      el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
      // Reduced motion keeps the row still: its pulse is stilled by the stylesheet, and
      // there is nothing to replay.
      if (!reduceMotion) replayLinkedPulse(el);
    };
    // The panel that holds the guide opens on the same request, and it grows over half
    // a second. While it is still shut the row has no position to scroll to, so the
    // jump waits for the panel to finish opening.
    const panelIsShut = el.closest('[inert]') !== null;
    window.clearTimeout(jumpTimer.current);
    if (panelIsShut) {
      jumpTimer.current = window.setTimeout(bringIntoView, reduceMotion ? 50 : 560);
    } else {
      bringIntoView();
    }
  });

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
  // the curator controls still need a home, as a toolbar in the same family as
  // the exemplars' tools.
  const curatorControls = canCurate ? (
    <div className="flex items-center gap-2">
      {!isEditing ? (
        <>
          {canGenerate && (
            <button
              type="button"
              onClick={
                studioLocked ? () => requestUpgrade('aiContentStudio') : handleGenerateRubric
              }
              disabled={isGenerating}
              title={studioLocked ? describeAccess('aiContentStudio').explanation : undefined}
              className={studioLocked ? LADDER_TOOL_LOCKED : LADDER_TOOL}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {/* On a phone the tool is its icon alone, and the name stays for a screen reader. */}
              <span className="max-sm:sr-only">AI Draft</span>
              {studioLocked && <PlusLockChip feature="aiContentStudio" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditText(markingCriteria);
              setIsEditing(true);
            }}
            title="Edit criteria"
            aria-label="Edit criteria"
            className={`${LADDER_TOOL_ICON} text-slate-600 dark:text-slate-300 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white`}
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel edit"
            className={`${LADDER_TOOL_ICON} text-red-600 dark:text-red-400`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            aria-label="Save"
            className={`${LADDER_TOOL_ICON} text-green-700 dark:text-green-400`}
          >
            <Save className="w-4 h-4" aria-hidden="true" />
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
              <h3 className={`${PANEL_NAME} text-slate-900 dark:text-white`}>Marking criteria</h3>
              <p className="t-label text-slate-600 dark:text-slate-400">
                Top Level: Band {maxPossibleBand}
              </p>
            </div>
          </div>
          {curatorControls}
        </div>
      )}

      <div className={embedded ? '' : 'p-4 bg-slate-50/30 dark:bg-black/20'}>
        {generateError && (
          <div className="mb-3 p-3 rounded-xl border border-red-600/40 bg-red-500/10 t-label text-red-800 dark:border-red-400/40 dark:text-red-300 flex items-center justify-between gap-2 animate-fade-in">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {generateError}
            </span>
            <button
              type="button"
              onClick={() => setGenerateError(null)}
              aria-label="Dismiss"
              className={`${LADDER_TOOL_ICON} text-red-800 dark:text-red-300`}
            >
              <X className="w-4 h-4" aria-hidden="true" />
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
              placeholder="e.g. 5 marks: Analyses effectively…"
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
                  // gutter, one radius and one type scale. A band-labelled row is
                  // drawn at the mark its band starts at, so its figure is a mark
                  // over the total like every other row, and the band goes in the
                  // caption. The band's colour is read from `getBandConfig` inside
                  // LadderRow, the one place a band's fill and ink come from.
                  <LadderRow
                    key={idx}
                    id={`${rowId}-criterion-${idx}`}
                    rowRef={(el) => {
                      if (el) rowEls.current.set(idx, el);
                      else rowEls.current.delete(idx);
                    }}
                    linked={item === linkedItem}
                    band={item.band}
                    markLabel={isBandLabelled(item) ? String(item.markRange[0]) : item.markLabel}
                    total={prompt.totalMarks}
                    // A row's criterion is always shown, like a closed exemplar's preview, so
                    // the narrow gutter (56px on a phone) gives the text the width.
                    phoneGutter="narrow"
                    footer={
                      exemplarMark !== undefined ? (
                        <button
                          type="button"
                          onClick={() => requestOpenExemplar(prompt.id, exemplarMark)}
                          aria-label={`See the model answer for ${exemplarMark} ${exemplarMark === 1 ? 'mark' : 'marks'}`}
                          // On a phone the link is a small text link, and on a band's wash
                          // in the dark theme its ink is light (the slate-900 is the solid's).
                          className={`${LADDER_LINK} max-sm:dark:text-slate-100`}
                        >
                          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                          Model answer
                        </button>
                      ) : undefined
                    }
                  >
                    <div className={LADDER_READING}>
                      {renderFormattedText(item.description, prompt.keywords, prompt.verb)}
                    </div>
                  </LadderRow>
                );
              })
            ) : markingCriteria ? (
              // A guide that did not split into rows, shown as one block. It is drawn as
              // a row's shape with no gutter, in the same band edge and fill, so it reads
              // as this question's ladder and not as a stray box.
              <div
                className={`${LADDER_FALLBACK} ${LADDER_EDGE_SHUT} ${LADDER_FILL}`}
                style={ladderBandVars(maxPossibleBand)}
              >
                {renderFormattedText(markingCriteria, prompt.keywords, prompt.verb)}
              </div>
            ) : (
              <div
                className={`${LADDER_EMPTY} ${LADDER_EDGE_SHUT}`}
                style={ladderBandVars(maxPossibleBand)}
              >
                <ListChecks
                  className={`w-8 h-8 mx-auto mb-2 ${maxBandConfig.text}`}
                  aria-hidden="true"
                />
                {/* The line is the only thing this state says, so it is the one reading
                    on the surface that has to be legible: a pair, on both grounds. */}
                <p className="t-label text-slate-700 dark:text-slate-300">
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
