import React, { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { schoolInvoicingEnabled } from '../services/entitlements';
import { useLivePrices } from '../hooks/useLivePrices';
import { buildLicenceNote } from '../utils/licenceNote';
import { LEGAL_CONFIG } from '../data/legalContent';

/**
 * A teacher who cannot buy a School licence themselves gets a note to send the
 * person who can. That is the champion's route: the teacher is the one who
 * wants the licence, and the administrator is the one with the purchasing
 * account, so the app hands over the words rather than a button that cannot work.
 *
 * Copying has three outcomes, and each one tells the teacher what happened:
 *   - copied: the status line says so, and assistive technology hears it;
 *   - the clipboard is not available or refused: the note appears in a read-only
 *     box, selected, so it can be copied by hand;
 *   - before any press, the note is not drawn at all.
 */

type KitState = 'idle' | 'copied' | 'manual';

/** The address of this app as an administrator would open it, including any sub-path. */
export const appAddress = (): string =>
  `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;

const ChampionKit: React.FC<{ schoolName?: string | null; className?: string }> = ({
  schoolName,
  className = '',
}) => {
  const [state, setState] = useState<KitState>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const prices = useLivePrices();
  const note = buildLicenceNote({
    schoolName,
    seatPrice: prices.schoolSeat,
    seatGst: prices.schoolSeatGst,
    seatInterval: prices.schoolSeatInterval,
    productName: LEGAL_CONFIG.productName,
    invoicing: schoolInvoicingEnabled(),
    appUrl: appAddress(),
  });

  // Once the box is shown, put the cursor in it with the whole note selected, so
  // one keypress copies it. A focus move is what a keyboard user needs to find it.
  useEffect(() => {
    if (state === 'manual') {
      areaRef.current?.focus();
      areaRef.current?.select();
    }
  }, [state]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(note);
      setState('copied');
    } catch {
      setState('manual');
    }
  };

  return (
    <div className={`text-left ${className}`}>
      <button
        type="button"
        onClick={copy}
        className="min-h-11 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-secondary))] border border-white/10 light:border-slate-300 hover:brightness-110 transition-[filter] duration-150"
      >
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        Copy a note for your admin
      </button>
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-xs font-medium leading-relaxed text-[rgb(var(--color-text-secondary))]"
      >
        {state === 'copied' && 'Copied. Paste it into a message to your administrator.'}
        {state === 'manual' &&
          'Copying is not available here. The note is selected below, so copy it by hand.'}
      </p>
      {state === 'manual' && (
        <textarea
          ref={areaRef}
          readOnly
          value={note}
          rows={6}
          aria-label="Note for your administrator"
          className="mt-2 w-full rounded-xl p-3 text-base sm:text-xs leading-relaxed bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-primary))] border border-white/10 light:border-slate-300"
        />
      )}
    </div>
  );
};

export default ChampionKit;
