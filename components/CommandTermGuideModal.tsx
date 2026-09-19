import React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CommandTermInfo } from '../types';
import { X } from 'lucide-react';
import { BandConfig, getBandRgb, getTierBandConfig } from '../utils/renderUtils';
import { getTierTargetBand } from '../data/commandTerms';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';

interface CommandTermGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  termInfo: CommandTermInfo;
}

/**
 * One figure in the guide's at-a-glance row.
 *
 * Five tiles, each with a circular icon badge over a big number over a small
 * label — which is the treatment the design skill names as the generic default,
 * and these five are not five separate things worth five boxes. They are the
 * shape of the answer, read in one line: a tier, a mark range, a ceiling, a
 * time, a length. The figures keep their weight and the mono face; the boxes,
 * the badges and the five glyphs go.
 */
const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  config: BandConfig;
}> = ({ label, value, config }) => (
  <div>
    <p className={`font-mono font-bold tabular-nums text-lg leading-tight ${config.text}`}>
      {value}
    </p>
    <p className="t-label mt-0.5 text-[rgb(var(--color-text-muted))]">{label}</p>
  </div>
);

/**
 * A named part of the guide.
 *
 * Every one of these was a bordered, tinted box with an icon beside its
 * heading — seven of them stacked, identical, so nothing said which mattered
 * and each glyph was the third thing announcing "this is a section" after the
 * heading and the box. A rule and a heading do it, and the definition below
 * gets to be the one thing on the page with a fill.
 */
const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <section className="pt-5 mt-5 border-t border-[rgb(var(--color-border-secondary))] first:pt-0 first:mt-0 first:border-t-0">
    <h3 className="t-section text-[rgb(var(--color-text-muted))]">{title}</h3>
    {note && <p className="t-label mt-1 text-[rgb(var(--color-text-dim))]">{note}</p>}
    <div className="mt-2.5">{children}</div>
  </section>
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
        clip-stable w-full max-w-xl rounded-2xl shadow-lg
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
            {/* The verb IS the title, so nothing beside it needs to say
                "information". An `Info` glyph in a tile sat here doing exactly
                that, and the meta line under it repeated the tier and the mark
                range that the figures further down now state properly.

                What the header owes a reader is what they are looking AT: a
                student arrives here by pressing a word in their own question,
                and "Command verb" is what that word is. */}
            <div>
              <p className="t-label text-white/70">Command verb</p>
              <h2
                id="command-term-title"
                className="text-2xl font-black text-white tracking-tight mt-0.5"
              >
                {termInfo.term}
              </h2>
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

        {/* The guide as a reading document.

          It was seven bordered, tinted boxes stacked down the page, each with
          a glyph beside its heading and a five-tile stat grid above them. Every
          section looked exactly as important as every other one, which for a
          student who has stopped writing to ask "what does this word want?" is
          the one thing the page must not say. The definition is what they came
          for, so it is the one thing here with a fill; everything else is a
          heading over prose, divided by rules. */}
        <div className="px-6 sm:px-7 py-6 overflow-y-auto flex-1">
          {/* The answer to the question they opened this with. */}
          <p
            className={`rounded-xl border band-edge ${bandConfig.bg} px-4 py-3.5 font-serif italic ${PROSE_BLOCK} text-base sm:text-lg leading-relaxed text-[rgb(var(--color-text-primary))]`}
          >
            {termInfo.definition}
          </p>

          {/* The shape of the answer, at a glance.

              Five figures, not five cards: a tier, a mark range, a ceiling, a
              time and a length are one reading — "what am I being asked for,
              and how much of it" — and they belong on one line. */}
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
            <Stat label="Command tier" value={termInfo.tier} config={bandConfig} />
            <Stat label="Marks" value={termInfo.markRange.join('–')} config={bandConfig} />
            <Stat label="Band ceiling" value={bandTarget} config={bandConfig} />
            <Stat label="Minutes" value={termInfo.timeRange.join('–')} config={bandConfig} />
            <Stat label="Pages" value={termInfo.pageEstimate} config={bandConfig} />
          </div>

          <div className="mt-6">
            {/* `termInfo.tip` — the one thing in this record that tells a
                student what to DO. A reader who has stopped to open this modal
                has stopped precisely because they do not know how to start. */}
            <Section title="How to answer it">
              <div className="space-y-1.5">
                {termInfo.tip.split('\n').map((line, i) => (
                  <p
                    key={i}
                    className={`text-sm ${PROSE_FLOW} text-[rgb(var(--color-text-secondary))] leading-relaxed`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </Section>

            {/* The phrases that make a response READ as the verb it was asked
                in, which is most of what separates a response that answers the
                question from one that circles it. */}
            {termInfo.structuralKeywords.length > 0 && (
              <Section
                title={`The language of a ${termInfo.term} answer`}
                note="Marker-facing phrasing — work these in where they fit"
              >
                {/* Spaced words in the band colour rather than bordered chips,
                    matching `StrategyBrief`: these are words to WRITE, not
                    controls to press. */}
                <p className={`flex flex-wrap gap-x-5 gap-y-1 font-serif ${bandConfig.text}`}>
                  {termInfo.structuralKeywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </p>
              </Section>
            )}

            <Section title="What separates a strong answer">
              <p
                className={`text-sm ${PROSE_FLOW} text-[rgb(var(--color-text-secondary))] leading-relaxed`}
              >
                {termInfo.bandDiscrimination}
              </p>
            </Section>

            {/* Headed "NESA Marking Guide" until a previous pass: it is not.
                These rows are this application's own generic guidance, written
                against the tier ladder in `projectDocs/GoldStandard.md`. */}
            <Section
              title="How the marks usually fall"
              note="A general guide — your paper&rsquo;s own marking guidelines win"
            >
              <ul className="space-y-2">
                {termInfo.genericMarkingGuide.map((criterion, index) => (
                  <li
                    key={index}
                    className={`border-l-2 ${bandConfig.border} pl-3 text-sm ${PROSE_FLOW} leading-relaxed text-[rgb(var(--color-text-secondary))]`}
                  >
                    {criterion}
                  </li>
                ))}
              </ul>
            </Section>

            {/* An abstract definition plus one concrete question is how a
                reader checks they have understood the definition at all. */}
            <Section title="A question that asks for this">
              <p
                className={`font-serif italic ${PROSE_BLOCK} text-sm sm:text-base leading-relaxed text-[rgb(var(--color-text-secondary))]`}
              >
                &ldquo;{termInfo.exampleQuestion}&rdquo;
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandTermGuideModal;
