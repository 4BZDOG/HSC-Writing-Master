import React from 'react';
import { ArrowUpCircle, Columns2, RefreshCw, Zap } from 'lucide-react';
import {
  BandConfig,
  getBandHex,
  renderFormattedText,
  stripHtmlTags,
} from '../../utils/renderUtils';
import { Prompt } from '../../types';
import { planLabelForFeature, requestUpgrade } from '../../services/entitlements';
import { PlusLockChip } from '../UpgradeModal';
import { CARD, SectionHeading } from './FeedbackPieces';

interface ImprovedResponseSectionProps {
  /** The rewrite as this client may present it; empty when there is none to show. */
  revisedText: string;
  prompt: Prompt;
  /** The student's own mark, which the rewrite is measured against. */
  overallMark: number;
  exemplarMark: number;
  exemplarBand: number;
  exemplarConfig: BandConfig;
  /** The plan withholds the rewrite: the section is drawn as its locked state. */
  upgradesLocked: boolean;
  isImproving: boolean;
  /** Open the side-by-side diff. Absent until an improvement has been made. */
  onCompareImprovement?: () => void;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
}

/**
 * The rewrite of the student's answer, one mark higher. It is either the text
 * with its controls, or the locked state a free plan sees in its place.
 */
const ImprovedResponseSection: React.FC<ImprovedResponseSectionProps> = ({
  revisedText,
  prompt,
  overallMark,
  exemplarMark,
  exemplarBand,
  exemplarConfig,
  upgradesLocked,
  isImproving,
  onCompareImprovement,
  onUseRevisedAnswer,
  onImproveAnswer,
}) => {
  if (!revisedText && !(upgradesLocked && overallMark < prompt.totalMarks)) return null;

  return (
    <section className="relative">
      <SectionHeading
        icon={Zap}
        label="Improved Response"
        tone={exemplarConfig.text}
        toneBg={exemplarConfig.bg}
      >
        {revisedText && overallMark < exemplarMark && (
          <span className="t-label ml-auto text-slate-600 dark:text-slate-400 tabular-nums">
            {exemplarMark}/{prompt.totalMarks} · Band {exemplarBand} · +{exemplarMark - overallMark}{' '}
            mark
            {exemplarMark - overallMark === 1 ? '' : 's'}
          </span>
        )}
        {upgradesLocked && <PlusLockChip />}
      </SectionHeading>
      <div className={`${CARD} overflow-hidden`}>
        <div
          className="h-1"
          style={{ backgroundColor: getBandHex(exemplarBand) }}
          aria-hidden="true"
        />
        {revisedText ? (
          <>
            <div className="px-6 sm:px-8 pt-6 pb-6">
              <p className="t-label mb-3 text-slate-600 dark:text-slate-400">
                Your answer with the marker&apos;s edits made
              </p>
              <div className="font-serif text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-200">
                {renderFormattedText(revisedText, prompt.keywords, prompt.verb)}
              </div>
            </div>
            <div className="px-6 sm:px-8 py-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-wrap items-center gap-2.5 no-print">
              {/* The comparison is the point: the rewrite is an EDIT of
                  the student's own answer, and reading it as a block of
                  prose hides the handful of words that earned the mark. */}
              {onCompareImprovement && (
                <button
                  onClick={onCompareImprovement}
                  className={`t-label px-5 py-2.5 rounded-xl text-white font-semibold ${exemplarConfig.solidBg} hover:brightness-110 transition-[filter] flex items-center gap-2`}
                >
                  <Columns2 className="w-4 h-4" />
                  See the edits
                </button>
              )}
              <button
                onClick={() => onUseRevisedAnswer(stripHtmlTags(revisedText))}
                className="t-label px-5 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 transition-colors flex items-center gap-2"
              >
                <ArrowUpCircle className="w-4 h-4" />
                Use this version
              </button>
              {/* Gated on MARKS, not bands: a student sitting at 5/6
                  inside the top band still has a mark to win, and the
                  band test hid the control from them. */}
              {overallMark < prompt.totalMarks && (
                <button
                  onClick={onImproveAnswer}
                  disabled={isImproving}
                  className="t-label sm:ml-auto px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${isImproving ? 'animate-spin' : ''}`} />
                  {isImproving ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 px-6 py-10 no-print">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Your answer, rewritten one mark higher — in your own words
            </p>
            <p className="max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {planLabelForFeature('answerUpgrades')} rewrites what you wrote to reach{' '}
              {exemplarMark}/{prompt.totalMarks}, keeping your structure and voice, and marks every
              edit so you can see exactly what the extra mark was for.
            </p>
            <button
              onClick={() => requestUpgrade('answerUpgrades')}
              className={`t-label mt-1 px-6 py-2.5 rounded-xl text-white font-semibold ${exemplarConfig.solidBg} hover:brightness-110 transition-[filter]`}
            >
              See what Plus unlocks
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ImprovedResponseSection;
