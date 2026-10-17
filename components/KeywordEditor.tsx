import React, { useState, useEffect, useMemo } from 'react';
import { Prompt, UserRole } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import { AlertCircle, Sparkles, RefreshCw, Plus, X, Check, BookMarked } from 'lucide-react';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { getBandConfig, textContainsKeyword } from '../utils/renderUtils';
import {
  classifySyllabusTerms,
  SYLLABUS_TERM_SOURCE_LABEL,
  type SyllabusTermContext,
} from '../utils/syllabusTermSource';
import {
  describeAccess,
  isFeatureLocked,
  planLabelForFeature,
  requestUpgrade,
} from '../services/entitlements';
import LadderRow, { ladderBandVars } from './LadderRow';
import {
  LADDER_EDGE_SHUT,
  LADDER_EMPTY,
  LADDER_SOLID,
  LADDER_STACK,
  LADDER_TOOL_ICON,
  LADDER_TOOL_INPUT,
  LADDER_TOOL_LOCKED_ICON,
} from '../utils/ladderChrome';
import {
  TERM_PILL_DOT,
  TERM_PILL_FRAME,
  TERM_PILL_MAIN,
  TERM_PILL_OPEN,
  TERM_PILL_QUIET_COVERED,
  TERM_PILL_REMOVE,
} from '../utils/termChrome';

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
  /** The syllabus this question sits under. A term named at ANY level of it —
   *  or in the question or scenario, both read off `prompt` — is a must-use
   *  term rather than a supporting one. */
  dotPointText?: string;
  subTopicName?: string;
  topicName?: string;
}

/** The icon-only tools in the toolbar: the guide's `LADDER_TOOL_ICON`, with the
 *  plan's lock in amber when the plan withholds the AI, and the disabled state in
 *  colour rather than opacity. */
const toolIconClass = (locked: boolean): string =>
  `${LADDER_TOOL_ICON} ${
    locked
      ? LADDER_TOOL_LOCKED_ICON
      : 'text-slate-600 dark:text-slate-300 can-hover:hover:text-slate-900 dark:can-hover:hover:text-white'
  } disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-500`;

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
  dotPointText,
  subTopicName,
  topicName,
}) => {
  const [keywords, setKeywords] = useState<string[]>(prompt.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const canCurate = canCurateContent(userRole);
  const canGenerate = canUseAiGeneration(userRole);
  // Keyword suggestion is an AI Content Studio action, so it carries the same
  // plan lock as the rest of the authoring surface. Role decides whether the
  // buttons exist; plan decides whether they fire.
  const studioLocked = isFeatureLocked('aiContentStudio');

  // Colour the groups in the question's TARGET band, the same band the guide and
  // the exemplars are drawn in, so the panel's header, its rows and the guide agree.
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
    // Shares the highlighter's matcher, so a pill is covered exactly when the term
    // lights up in the writing area — never one without the other.
    const map = new Map<string, boolean>();
    keywords.forEach((kw) => map.set(kw, textContainsKeyword(userAnswer, kw)));
    return map;
  }, [userAnswer, keywords]);

  // Which terms the question and its syllabus name themselves (vs supporting
  // terms the AI added around them), and which level names each — the pill's
  // title says so, because "named in the question" and "named in the topic" are
  // not the same claim on a student's answer.
  const syllabusContext = useMemo<SyllabusTermContext>(
    () => ({
      question: prompt.question,
      scenario: prompt.scenario,
      dotPointText,
      subTopicName,
      topicName,
    }),
    [prompt.question, prompt.scenario, dotPointText, subTopicName, topicName]
  );
  const syllabusMap = useMemo(
    () => classifySyllabusTerms(keywords, syllabusContext),
    [keywords, syllabusContext]
  );

  // The two groups, kept apart rather than concatenated, so the rule for which is
  // which is stated once. Each group that has a term gets its own row on the
  // ladder; a group with none gets no row.
  const syllabusKeywords = useMemo(
    () => keywords.filter((kw) => syllabusMap.get(kw)),
    [keywords, syllabusMap]
  );
  const supportingKeywords = useMemo(
    () => keywords.filter((kw) => !syllabusMap.get(kw)),
    [keywords, syllabusMap]
  );

  const isLoading = isEnriching || isSuggesting || isRegenerating;
  const error = regenerateError || suggestError;

  const total = keywords.length;
  const usedCount = useMemo(() => Array.from(usageMap.values()).filter(Boolean).length, [usageMap]);
  // The key terms and the supporting terms, each counted against itself: the
  // question's own terms are a Band 6 answer's floor, and a supporting term only
  // strengthens it, so one tick is not the same claim as the other.
  const keyUsed = useMemo(
    () => syllabusKeywords.filter((kw) => usageMap.get(kw)).length,
    [syllabusKeywords, usageMap]
  );
  const supportingUsed = usedCount - keyUsed;

  // The plan is named, not the feature: a tooltip that says "the AI Content
  // Studio" where the chip beside it says "Band 6 Plus" is two answers to one
  // question, and it goes stale the moment a deployment moves the studio.
  const studioLockedNote = describeAccess('aiContentStudio').explanation;
  // The title is the accessible name of an icon-only control, so it keeps the action.
  const suggestTitle = studioLocked ? `Suggest with AI — ${studioLockedNote}` : 'Suggest with AI';
  const regenerateTitle = studioLocked ? `Regenerate all — ${studioLockedNote}` : 'Regenerate all';

  // One pill: a term button (which inserts it) and, for a curator, a remove button.
  // Two controls side by side, not one inside the other, so each is reached and
  // announced on its own.
  const renderPill = (kw: string, group: 'key' | 'supporting') => {
    const isUsed = usageMap.get(kw) === true;
    const source = syllabusMap.get(kw);

    // A covered key term is the band's solid pair, the colour the gutter wears. A
    // covered supporting term keeps the quiet ground and takes the band's edge and
    // ink. An uncovered term is neutral in both groups.
    const frameState = isUsed
      ? group === 'key'
        ? `${LADDER_SOLID} border-transparent`
        : `${TERM_PILL_QUIET_COVERED} ${bandConfig.text}`
      : TERM_PILL_OPEN;

    return (
      <span key={kw} className={`${TERM_PILL_FRAME} ${frameState}`}>
        <button
          type="button"
          onClick={() => onAddWord?.(kw)}
          title={
            source
              ? `Named in ${SYLLABUS_TERM_SOURCE_LABEL[source]} — a must-use term`
              : 'Supporting term — click to add it to your answer'
          }
          className={TERM_PILL_MAIN}
        >
          {isUsed ? (
            <Check className="w-3 h-3 shrink-0" strokeWidth={3} aria-hidden="true" />
          ) : (
            <span className={TERM_PILL_DOT} aria-hidden="true" />
          )}
          <span>{kw}</span>
        </button>
        {canCurate && (
          <button
            type="button"
            onClick={() => handleRemoveKeyword(kw)}
            title={`Remove ${kw}`}
            aria-label={`Remove ${kw}`}
            className={TERM_PILL_REMOVE}
          >
            <X className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
          </button>
        )}
      </span>
    );
  };

  const caption =
    syllabusKeywords.length > 0
      ? `Weave the key terms into a Band ${targetBand} response.`
      : `Use these to strengthen a Band ${targetBand} response.`;

  const emptyLine = canCurate
    ? canGenerate
      ? 'No syllabus terms yet — add one above, or start with AI Suggest.'
      : 'No syllabus terms yet — add one above.'
    : 'No syllabus terms for this question yet. Your teacher can add them.';

  return (
    <div className="flex flex-col gap-3">
      {/* The curator's toolbar, in the guide's family: a slim input and the same icon
          tools the guide's Edit uses. A student cannot add or generate terms, so
          there is no toolbar for them at all. */}
      {canCurate && (
        <div className="flex items-center gap-2">
          <form onSubmit={handleAddKeyword} className="flex flex-1 min-w-0 items-center gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Add new term…"
              aria-label="New syllabus term"
              autoComplete="off"
              className={LADDER_TOOL_INPUT}
            />
            <button
              type="submit"
              disabled={!newKeyword.trim()}
              aria-label="Add term"
              title="Add term"
              className={`${toolIconClass(false)} shrink-0`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </form>
          {canGenerate && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={studioLocked ? () => requestUpgrade('aiContentStudio') : onSuggest}
                disabled={isLoading}
                aria-label={suggestTitle}
                title={suggestTitle}
                className={toolIconClass(studioLocked)}
              >
                <Sparkles
                  className={`w-4 h-4 ${isSuggesting ? 'animate-pulse' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={studioLocked ? () => requestUpgrade('aiContentStudio') : onRegenerate}
                disabled={isLoading}
                aria-label={regenerateTitle}
                title={regenerateTitle}
                className={toolIconClass(studioLocked)}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
      )}

      {total > 0 && <p className="t-label text-slate-600 dark:text-slate-400">{caption}</p>}

      {total === 0 ? (
        <div className={`${LADDER_EMPTY} ${LADDER_EDGE_SHUT}`} style={ladderBandVars(targetBand)}>
          <BookMarked className={`w-8 h-8 mx-auto mb-2 ${bandConfig.text}`} aria-hidden="true" />
          {/* The line is the only thing this state says, so it is a pair, on both grounds. */}
          <p className="t-label text-slate-700 dark:text-slate-300">{emptyLine}</p>
        </div>
      ) : (
        <div className={LADDER_STACK}>
          {syllabusKeywords.length > 0 && (
            // The key terms: the question's ceiling band, solid, as the guide's gutters are.
            <LadderRow
              band={targetBand}
              markLabel={String(keyUsed)}
              total={syllabusKeywords.length}
              bandCaption="Key terms"
              phoneGutter="narrow"
            >
              <div
                role="group"
                aria-label="Named in the question or syllabus"
                className="flex flex-wrap gap-2"
              >
                {syllabusKeywords.map((kw) => renderPill(kw, 'key'))}
              </div>
            </LadderRow>
          )}
          {supportingKeywords.length > 0 && (
            // The supporting terms: the same band, quiet, so the two rows read as one ladder.
            <LadderRow
              quiet
              band={targetBand}
              markLabel={String(supportingUsed)}
              total={supportingKeywords.length}
              bandCaption="Supporting"
              phoneGutter="narrow"
            >
              <div role="group" aria-label="Supporting terms" className="flex flex-wrap gap-2">
                {supportingKeywords.map((kw) => renderPill(kw, 'supporting'))}
              </div>
            </LadderRow>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-red-600/40 bg-red-500/10 t-label text-red-800 dark:border-red-400/40 dark:text-red-300 flex items-start gap-2 animate-fade-in"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default KeywordEditor;
