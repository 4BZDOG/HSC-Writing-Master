import React, { useEffect, useRef } from 'react';
import { ArrowRight, Columns2, RefreshCw, Zap } from 'lucide-react';
import { BandConfig, getBandHex, renderFormattedText } from '../../utils/renderUtils';
import { Prompt } from '../../types';
import { describeAccess, planLabelForFeature, requestUpgrade } from '../../services/entitlements';
import { PlusLockChip } from '../UpgradeModal';
import LoadingIndicator from '../LoadingIndicator';
import AiBusyOverlay from '../AiBusyOverlay';
import { ladderBandVars } from '../LadderRow';
import { BAND_GROUND, FEEDBACK_CARD, PRIMARY_ACTION, SECONDARY_ACTION } from './feedbackChrome';
import { SectionHeading } from './FeedbackPieces';

interface ImprovedResponseSectionProps {
  /** The rewrite as this client may present it; empty when there is none to show. */
  revisedText: string;
  /** The edits the marker says it made. Shown beneath the rewrite when there are any. */
  keyChanges: string[];
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
  onImproveAnswer: () => void;
  className?: string;
}

/** The inner radius of the card: its 20px outer radius less the 1px border. A veil
 *  sits inside the border, so it takes this, not the outer radius (see AiBusyOverlay). */

/**
 * The rewrite of the student's answer, one mark higher, as a card directly under
 * the next step. It is the text with its controls, the locked state a free plan
 * sees in its place, or — at full marks — the marker's version to compare against.
 *
 * The regeneration veil is laid INSIDE this card and nowhere else. Over the whole
 * report it sat about 780px above the viewport on a phone, so the student saw a
 * blank veil over a page they could not see the loader on.
 */
const ImprovedResponseSection: React.FC<ImprovedResponseSectionProps> = ({
  revisedText,
  keyChanges,
  prompt,
  overallMark,
  exemplarMark,
  exemplarBand,
  exemplarConfig,
  upgradesLocked,
  isImproving,
  onCompareImprovement,
  onImproveAnswer,
  className = '',
}) => {
  const markGap = Math.max(0, exemplarMark - overallMark);
  const gapWords = markGap === 1 ? 'one mark higher' : `${markGap} marks higher`;
  const atCeiling = overallMark >= prompt.totalMarks;

  // The veil's loader is centred on this card. When the card is taller than the screen
  // and Regenerate was pressed at its foot, the loader can sit above the modal's header,
  // so the card is brought into view. Only then: a card already in view does not move.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isImproving || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const mid = (r.top + r.bottom) / 2;
    const clear = mid > 120 && mid < window.innerHeight - 120;
    if (clear) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cardRef.current.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [isImproving]);

  if (!revisedText && (atCeiling || !upgradesLocked)) return null;

  return (
    <section className={className} style={ladderBandVars(exemplarBand)}>
      <SectionHeading
        icon={Zap}
        label={atCeiling ? "Marker's version" : 'Improved response'}
        tone={exemplarConfig.text}
        toneBg={exemplarConfig.bg}
      >
        {revisedText && !atCeiling && (
          <span className="t-label ml-auto whitespace-nowrap text-slate-600 dark:text-slate-400 tabular-nums">
            {gapWords} · Band {exemplarBand}
          </span>
        )}
        {revisedText && atCeiling && (
          <span className="t-label ml-auto text-slate-600 dark:text-slate-400">
            Already full marks
          </span>
        )}
        {upgradesLocked && <PlusLockChip feature="answerUpgrades" />}
      </SectionHeading>

      <div ref={cardRef} className={`${FEEDBACK_CARD} relative overflow-hidden`}>
        <div
          className="h-1"
          style={{ backgroundColor: getBandHex(exemplarBand) }}
          aria-hidden="true"
        />

        {/* The veil is inside the card and takes no radius of its own: the card's
            overflow clip is its padding edge at the inner radius, so the veil is
            cut to the same corners as the card's content. It covers the card's own
            text and buttons, not the page. */}
        <AiBusyOverlay show={isImproving} rounded="rounded-none">
          <LoadingIndicator
            task="generation"
            message={`Lifting your answer ${gapWords}`}
            messages={[
              'Keeping your wording and structure…',
              'Adding what the marker asked for…',
              'Sharpening the syllabus terminology…',
            ]}
            duration={12}
            band={exemplarBand}
          />
        </AiBusyOverlay>

        {revisedText ? (
          <>
            <div className="px-6 sm:px-8 pt-6 pb-5">
              <p className="t-label mb-3 text-slate-600 dark:text-slate-400">
                {atCeiling
                  ? 'You already have full marks. This is the marker’s version, to compare with yours.'
                  : "Your answer with the marker's edits made"}
              </p>
              {/* The measure of the report's reading column, so the rewrite is read
                  at the same line length as the commentary above it. */}
              <div className="max-w-[40rem] font-serif text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-200">
                {renderFormattedText(revisedText, prompt.keywords, prompt.verb)}
              </div>
            </div>

            {keyChanges.length > 0 && (
              <div className="px-6 sm:px-8 pb-6">
                <p className="t-label mb-2 text-slate-600 dark:text-slate-400">What changed</p>
                <ul className="space-y-2">
                  {keyChanges.map((change, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                    >
                      <ArrowRight
                        className="w-4 h-4 mt-0.5 shrink-0 text-slate-600 dark:text-slate-400"
                        aria-hidden="true"
                      />
                      <span>{renderFormattedText(change, prompt.keywords, prompt.verb)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* The comparison is the point: the rewrite is an EDIT of the student's
                own answer, and reading it as a block of prose hides the handful of
                words that earned the mark. "Use this version" is in the footer. */}
            {(onCompareImprovement || !atCeiling) && (
              <div className="px-6 sm:px-8 py-4 border-t border-slate-200/80 dark:border-white/10 bg-surface-elevated flex flex-wrap items-center gap-2.5 no-print">
                {onCompareImprovement && (
                  <button onClick={onCompareImprovement} className={SECONDARY_ACTION}>
                    <Columns2 className="w-4 h-4" />
                    See the edits
                  </button>
                )}
                {/* Gated on MARKS, not bands: a student sitting at 5/6 inside the top
                    band still has a mark to win. Full marks has nothing to regenerate. */}
                {!atCeiling && (
                  <button
                    onClick={onImproveAnswer}
                    disabled={isImproving}
                    className={`${SECONDARY_ACTION} sm:ml-auto`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isImproving ? 'animate-spin' : ''}`} />
                    {isImproving ? 'Regenerating…' : 'Regenerate'}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 px-6 py-10 no-print">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Your answer, rewritten {gapWords} — in your own words
            </p>
            <p className="max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {planLabelForFeature('answerUpgrades')} rewrites what you wrote, keeping your
              structure and voice, and marks every edit so you can see exactly what the extra mark
              was for.
            </p>
            <button
              onClick={() => requestUpgrade('answerUpgrades')}
              className={`${PRIMARY_ACTION} ${BAND_GROUND} mt-1`}
            >
              {describeAccess('answerUpgrades').ctaLabel}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ImprovedResponseSection;
