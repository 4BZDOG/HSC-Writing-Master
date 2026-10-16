import React, { useState, useRef, useCallback } from 'react';
import { FileText, ShieldCheck, ChevronRight } from 'lucide-react';
import {
  getLegalDocuments,
  renderLegalText,
  AGREEMENT_VERSION,
  LEGAL_CONFIG,
  type LegalDocumentId,
} from '../data/legalContent';

/**
 * The reader for the full Terms of Use and Privacy Notice.
 *
 * Used in two places: standalone (LegalDocumentModal, from the profile and the
 * sign-in page) and embedded inside the acceptance gate, so a user who wants
 * the detail before agreeing never has to leave the dialog to find it.
 *
 * Legal text is unavoidably long. What makes it readable here: a section rail
 * that jumps you straight to the clause you care about, generous line height,
 * and short paragraphs — the content file enforces the last one by storing
 * each paragraph separately.
 *
 * The clauses are set in the manuscript serif (Newsreader), the face the app
 * already uses for long prose, and the column is bounded by measure rather than
 * by the dialog. At the dialog's width an unbounded column runs past 90
 * characters a line, which is where a clause stops being read and starts being
 * scanned. The rail is a strip on the paper, not part of it.
 */

const DOC_ICONS: Record<LegalDocumentId, typeof FileText> = {
  terms: FileText,
  privacy: ShieldCheck,
};

interface LegalDocumentReaderProps {
  /** Which document opens first. */
  initialDocument?: LegalDocumentId;
  /** Tailwind height for the scroll area; the modal and the gate want different ones. */
  scrollAreaClassName?: string;
}

const LegalDocumentReader: React.FC<LegalDocumentReaderProps> = ({
  initialDocument = 'terms',
  scrollAreaClassName = 'max-h-[55vh]',
}) => {
  const [activeDoc, setActiveDoc] = useState<LegalDocumentId>(initialDocument);
  const scrollRef = useRef<HTMLDivElement>(null);

  const documents = getLegalDocuments();
  const doc = documents.find((d) => d.id === activeDoc) ?? documents[0];

  // Scroll WITHIN the reader rather than using an anchor href, which would
  // scroll the page behind the modal and leave the dialog where it was.
  const jumpTo = useCallback((sectionId: string) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop - container.offsetTop - 8, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Document switcher */}
      <div className="flex gap-2">
        {documents.map((d) => {
          const Icon = DOC_ICONS[d.id];
          const isActive = d.id === activeDoc;
          return (
            <button
              key={d.id}
              onClick={() => {
                setActiveDoc(d.id);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
              aria-pressed={isActive}
              className={`t-label flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all border ${
                isActive
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400 light:bg-indigo-100/70 light:border-indigo-400 light:text-indigo-700'
                  : 'bg-white/[0.03] border-white/5 text-[rgb(var(--color-text-muted))] light:bg-surface-elevated light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {d.title}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-[rgb(var(--color-text-secondary))] font-medium">
        {renderLegalText(doc.subtitle)}{' '}
        <span className="text-[rgb(var(--color-text-muted))]">Version {AGREEMENT_VERSION}.</span>
      </p>

      <div className="flex gap-6">
        {/* Section rail — lg and up. Long documents are only tolerable when you
            can jump to the clause you actually came for. A rail is a strip, so
            it takes the elevated rung rather than a white card. */}
        <nav
          aria-label={`${doc.title} sections`}
          className="hidden lg:block w-56 shrink-0 space-y-0.5 self-start rounded-panel p-2 bg-white/[0.03] light:bg-surface-elevated border border-white/5 light:border-slate-200"
        >
          {doc.sections.map((section) => (
            <button
              key={section.id}
              onClick={() => jumpTo(section.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--color-text-muted))] hover:bg-white/5 light:hover:bg-surface-inset hover:text-[rgb(var(--color-text-primary))] transition-colors flex items-start gap-1.5 group"
            >
              <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="-ml-4 group-hover:ml-0 transition-all">{section.heading}</span>
            </button>
          ))}
        </nav>

        <div
          ref={scrollRef}
          className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar pr-2 ${scrollAreaClassName}`}
        >
          <div className="max-w-[32rem] space-y-8">
            {doc.sections.map((section) => (
              <section key={section.id} data-section={section.id} className="scroll-mt-4">
                <h4 className="font-serif text-lg font-bold leading-snug text-[rgb(var(--color-text-primary))] mb-2.5">
                  {section.heading}
                </h4>
                <div className="space-y-3">
                  {section.body.map((paragraph, i) => (
                    <p
                      key={i}
                      className="font-serif text-base leading-relaxed text-[rgb(var(--color-text-secondary))]"
                    >
                      {renderLegalText(paragraph)}
                    </p>
                  ))}
                </div>
                {section.bullets && (
                  <ul className="mt-3 space-y-2">
                    {section.bullets.map((bullet, i) => (
                      <li
                        key={i}
                        className="font-serif text-base leading-relaxed text-[rgb(var(--color-text-secondary))] flex gap-3"
                      >
                        <span className="mt-2.5 shrink-0 w-1 h-1 rounded-full bg-indigo-400 light:bg-indigo-600" />
                        <span>{renderLegalText(bullet)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <p className="text-xs leading-relaxed text-[rgb(var(--color-text-muted))] pt-4 border-t border-white/10 light:border-slate-300">
              {renderLegalText(
                '{{product}}, published by {{entity}}. These documents are written in plain English on purpose — if something here is unclear, ask rather than guess.'
              )}
              {LEGAL_CONFIG.contact && (
                <>
                  {' '}
                  <a
                    href={`mailto:${LEGAL_CONFIG.contact}`}
                    className="text-indigo-400 light:text-indigo-700 font-bold hover:underline"
                  >
                    {LEGAL_CONFIG.contact}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalDocumentReader;
