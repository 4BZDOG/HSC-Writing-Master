import React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CommandTermInfo } from '../types';
import {
  X,
  Info,
  Award,
  Target,
  Hash,
  Zap,
  ChevronRight,
  Lightbulb,
  Tag,
  Clock,
  FileText,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BandConfig, getBandRgb, getTierBandConfig } from '../utils/renderUtils';
import { getTierTargetBand } from '../data/commandTerms';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface CommandTermGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  termInfo: CommandTermInfo;
}

/**
 * One figure in the guide's at-a-glance row.
 *
 * Three hand-copied blocks became five when `timeRange` and `pageEstimate`
 * joined them, and five copies of the same twelve lines is how the fourth one
 * ends up subtly different from the other three.
 */
const Stat: React.FC<{
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  config: BandConfig;
}> = ({ icon: Icon, label, value, config }) => (
  <div className="p-3 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/50 text-center">
    <div
      className={`w-9 h-9 mx-auto mb-2 rounded-full flex items-center justify-center ${config.iconBg} border band-edge`}
    >
      <Icon className={`w-4 h-4 ${config.text}`} />
    </div>
    <p className="t-label text-[rgb(var(--color-text-muted))] mb-1">{label}</p>
    {/* `font-bold`, not the `font-black` the three larger cards used to
        carry: at five across these values sit at 18px, and 900 is display
        weight (DesignSpec §4, pinned by `weightLadder.test.ts`).
        `tabular-nums` because every one of them is a figure, so the five
        line up rather than drifting by digit width. */}
    <p className={`font-bold tabular-nums text-lg leading-tight ${config.text}`}>{value}</p>
  </div>
);

const CommandTermGuideModal: React.FC<CommandTermGuideModalProps> = ({
  isOpen,
  onClose,
  termInfo,
}) => {
  // Colour by the verb's target band so the guide matches the prompt/writing area.
  const bandConfig = getTierBandConfig(termInfo.tier);
  // The band `bandConfig` resolves to, named once so the edge colour and the
  // config cannot come from two different bands.
  const bandTarget = getTierTargetBand(termInfo.tier);

  // Shared hook rather than a private listener, so this guide also registers
  // itself as an open overlay and Escape dismisses it without also exiting
  // Focus Mode underneath.
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCloseKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-modal p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-term-title"
    >
      <div
        // `--band-rgb` once, here: custom properties inherit, so every
        // `band-edge` below draws from this without the colour being handed
        // down by hand.
        style={{ '--band-rgb': getBandRgb(bandTarget) } as React.CSSProperties}
        className={`
        clip-stable w-full max-w-3xl rounded-2xl shadow-lg
        border-2 band-edge-strong ${bandConfig.glow}
        bg-[rgb(var(--color-bg-surface))]/95
        animate-fade-in-up
        overflow-hidden flex flex-col max-h-[90vh]
      `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero Header - Matching PromptGeneratorModal Style */}
        <div
          className={`
          px-6 py-5 border-b-2 band-edge
          bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0
        `}
        >
          <div className="absolute inset-0 bg-white/10 mix-blend-overlay opacity-20"></div>

          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/30">
                <Info className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2
                  id="command-term-title"
                  className="text-2xl font-bold text-white tracking-tight flex items-center gap-2"
                >
                  {termInfo.term}
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-white/90 font-medium text-sm">
                  <span className="t-label bg-white/20 px-2 py-0.5 rounded-lg">
                    Tier {termInfo.tier}
                  </span>
                  <span>·</span>
                  <span>{termInfo.markRange.join('-')} Marks</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              onKeyDown={handleCloseKeyDown}
              className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 flex items-center justify-center group backdrop-blur-sm"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Definition */}
          <div
            className={`
            p-5 rounded-xl border-2 band-edge
            bg-[rgb(var(--color-bg-surface-inset))]/30
            transition-all duration-200 hover:shadow-lg ${bandConfig.glow}
          `}
          >
            <div className="flex items-center gap-3 mb-3">
              <Zap className={`w-5 h-5 ${bandConfig.text}`} />
              <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))]">
                Definition
              </h3>
            </div>
            <p className="text-lg text-[rgb(var(--color-text-secondary))] italic leading-relaxed font-serif">
              "{termInfo.definition}"
            </p>
          </div>

          {/* The shape of the answer, at a glance.

              Five now, not three. `timeRange` and `pageEstimate` were written
              for every verb and shown only on the ribbon; "how long should
              this be?" is the question a student asks immediately after "what
              is this verb asking me for?", and this is the surface they opened
              to ask it. */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat icon={Target} label="Command tier" value={termInfo.tier} config={bandConfig} />
            <Stat
              icon={Hash}
              label="Marks"
              value={termInfo.markRange.join('–')}
              config={bandConfig}
            />
            <Stat
              icon={Award}
              label="Band ceiling"
              value={`Band ${bandTarget}`}
              config={bandConfig}
            />
            <Stat
              icon={Clock}
              label="Time"
              value={`${termInfo.timeRange.join('–')} min`}
              config={bandConfig}
            />
            <Stat
              icon={FileText}
              label="Length"
              value={`${termInfo.pageEstimate} pg`}
              config={bandConfig}
            />
          </div>

          {/* How to answer it.

              `termInfo.tip` — the one thing in this record that tells a
              student what to DO, and until now the guide about a verb did not
              show it. It is on the writing surface, which is where it earns
              its keep mid-draft; a reader who has stopped to open this modal
              has stopped precisely because they do not know how to start. */}
          <div className="p-5 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/30">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] mb-3">
              <Lightbulb className={`w-4 h-4 ${bandConfig.text}`} />
              How to answer it
            </h3>
            <div className="space-y-1.5">
              {termInfo.tip.split('\n').map((line, i) => (
                <p
                  key={i}
                  className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* The words that do the work.

              `structuralKeywords` was in every one of these records and
              rendered nowhere in the application. It is the most directly
              usable thing here: the phrases that make a response READ as the
              verb it was asked in, which is most of what separates a response
              that answers the question from one that circles it. */}
          {termInfo.structuralKeywords.length > 0 && (
            <div className="p-5 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/30">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] mb-1">
                <Tag className={`w-4 h-4 ${bandConfig.text}`} />
                The language of a {termInfo.term} answer
              </h3>
              <p className="t-label mb-3 text-[rgb(var(--color-text-muted))]">
                Marker-facing phrasing — work these in where they fit
              </p>
              <ul className="flex flex-wrap gap-2">
                {termInfo.structuralKeywords.map((keyword) => (
                  <li
                    key={keyword}
                    className={`t-label px-2.5 py-1 rounded-lg border band-edge ${bandConfig.bg} ${bandConfig.text}`}
                  >
                    {keyword}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Band Discrimination */}
          <div
            className={`
            p-5 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/30
          `}
          >
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] mb-3">
              <ChevronRight className={`w-4 h-4 ${bandConfig.text}`} />
              What separates a strong answer
            </h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed pl-6 border-l-2 border-[rgb(var(--color-border-secondary))]">
              {termInfo.bandDiscrimination}
            </p>
          </div>

          {/* Marking guide.

              Headed "NESA Marking Guide" until now, which it is not. These
              rows are this application's own generic guidance, written against
              the tier ladder in `projectDocs/GoldStandard.md`; NESA publishes
              marking guidelines per paper, not per verb. A teacher reading a
              heading with NESA's name on it is entitled to assume they are
              reading NESA, so the heading now says whose guidance this is. */}
          <div
            className={`
            p-5 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/30
          `}
          >
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] mb-1">
              <Award className={`w-4 h-4 ${bandConfig.text}`} />
              How the marks usually fall
            </h3>
            <p className="t-label mb-3 text-[rgb(var(--color-text-muted))]">
              A general guide — your paper&rsquo;s own marking guidelines win
            </p>
            <ul className="space-y-2">
              {termInfo.genericMarkingGuide.map((criterion, index) => (
                <li
                  key={index}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg
                    bg-[rgb(var(--color-bg-surface))]/80
                    border-l-4 ${bandConfig.border}
                    shadow-sm
                  `}
                >
                  <span className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed font-medium">
                    {criterion}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* A question that uses it.

              `exampleQuestion` was the other field written for all 36 verbs
              and rendered nowhere. An abstract definition plus one concrete
              question is how a reader checks they have understood the
              definition at all. */}
          <div className="p-5 rounded-xl border band-edge bg-[rgb(var(--color-bg-surface-inset))]/30">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] mb-3">
              <HelpCircle className={`w-4 h-4 ${bandConfig.text}`} />A question that asks for this
            </h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed font-serif italic">
              &ldquo;{termInfo.exampleQuestion}&rdquo;
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/30 border-t border-[rgb(var(--color-border-secondary))] flex justify-end">
          <button
            onClick={onClose}
            className={`
                    px-6 py-2.5 rounded-xl font-bold text-white shadow-lg
                    bg-gradient-to-r ${bandConfig.gradient}
                    hover:shadow-lg hover:brightness-110 active:scale-[0.98] transition-all
                `}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandTermGuideModal;
