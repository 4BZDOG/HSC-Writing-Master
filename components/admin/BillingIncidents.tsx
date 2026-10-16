import React, { useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  isMissingSchemaError,
  resolveBillingIncident,
  type BillingIncidentKind,
  type BillingIncidentRow,
  type IncidentSummary,
} from '../../services/billingOverviewService';

/**
 * The open billing incidents on the Billing overview (schema §13, §29). The webhook writes
 * them and never acts on them: a person reads the detail, acts in the Stripe Dashboard, and
 * marks the incident resolved here with an optional note. Marking resolved changes the
 * incident only, never a plan or a licence.
 *
 * Each row names its kind in plain words, says how long ago it was detected, and carries the
 * school's name when there is one. Each has its own "Mark resolved" button. A failed call
 * says so in a sentence and leaves the row open. A database without schema §29 has no
 * resolve function, so the button gives way to a line telling the operator to re-apply it.
 */

export interface BillingIncidentsProps {
  /** The open incidents, or null when they could not be read. */
  summary: IncidentSummary | null;
  error: string | null;
  /** Told after a row is resolved, so the page's own tally can drop it. */
  onResolved?: (id: string) => void;
}

const LABEL: Record<BillingIncidentKind, string> = {
  duplicate_subscription: 'Duplicate subscription',
  duplicate_school_licence: 'Duplicate school licence',
  customer_mismatch: 'Customer mismatch',
  dispute: 'Payment dispute',
  refund: 'Full refund',
};

const DAY_MS = 86_400_000;
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "Detected 3 days ago", or "Detected today". Whole days, so the wording never claims precision it lacks. */
const detectedLabel = (iso: string, nowMs: number): string => {
  const days = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY_MS));
  return `Detected ${rtf.format(-days, 'day')}`;
};

/** Server messages often arrive without a full stop; a sentence bolted onto one needs it. */
const endWithStop = (text: string): string => (/[.!?]$/.test(text.trim()) ? text : `${text}.`);

/** A dispute is the one that carries a deadline, so it takes the stronger tone. */
const TONE = {
  alert: 'border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300',
  warn: 'border-amber-500/40 bg-amber-500/10 light:bg-amber-50 light:border-amber-300',
} as const;

const INPUT =
  'w-full min-h-[44px] sm:min-h-0 sm:py-1.5 px-3 rounded-lg border text-sm border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-light))] light:bg-white text-[rgb(var(--color-text-primary))] light:text-slate-900 disabled:opacity-60';

const BUTTON =
  'min-h-[44px] sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg border text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-500 light:text-emerald-800 hover:bg-emerald-500/20';

interface CardProps {
  row: BillingIncidentRow;
  nowMs: number;
  onResolved: (id: string) => void;
}

const IncidentCard: React.FC<CardProps> = ({ row, nowMs, onResolved }) => {
  const uid = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const noteId = `${uid}-note`;
  const school = row.schools?.name ?? null;

  const resolve = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await resolveBillingIncident(row.id, note.trim() || null);
    } catch (e) {
      setBusy(false);
      const message = e instanceof Error ? e.message : '';
      if (isMissingSchemaError(message)) {
        setSchemaMissing(true);
      } else {
        setError(
          `Could not mark this resolved: ${endWithStop(message || 'Something went wrong')} It is still open.`
        );
      }
      return;
    }
    onResolved(row.id);
  };

  return (
    <li className={`p-3 rounded-xl border ${TONE[row.kind === 'dispute' ? 'alert' : 'warn']}`}>
      <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
        {LABEL[row.kind]}
        {school ? ` · ${school}` : ''}
      </p>
      <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-0.5 break-words">
        {row.detail}
      </p>
      <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mt-1">
        {detectedLabel(row.detected_at, nowMs)}
      </p>

      {schemaMissing ? (
        <p role="status" className="text-xs text-amber-400 light:text-amber-800 mt-3">
          Re-apply the database schema to resolve incidents here.
        </p>
      ) : (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor={noteId}
              className="block text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 mb-1"
            >
              Resolution note (optional)
            </label>
            <input
              id={noteId}
              type="text"
              value={note}
              maxLength={1000}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              className={INPUT}
            />
          </div>
          <button type="button" onClick={resolve} disabled={busy} className={BUTTON}>
            {busy && <RefreshCw className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
            Mark resolved
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400 light:text-red-800 mt-2">
          {error}
        </p>
      )}
    </li>
  );
};

const BillingIncidents: React.FC<BillingIncidentsProps> = ({ summary, error, onResolved }) => {
  const headingId = useId();
  // Rows resolved in this window leave the list at once. The page's own copy is updated
  // through onResolved; this set is what keeps the row gone if the page does not pass it on.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  if (!summary) {
    return error ? (
      <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600">
        Billing incidents were not checked: {endWithStop(error)}
      </p>
    ) : null;
  }

  const rows = summary.items.filter((row) => !gone.has(row.id));
  if (rows.length === 0) return null;

  const remove = (id: string) => {
    setGone((prev) => new Set(prev).add(id));
    onResolved?.(id);
  };

  const nowMs = Date.now();
  return (
    <section aria-labelledby={headingId} className="mb-6">
      <h4
        id={headingId}
        className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-2"
      >
        Open billing incidents ({rows.length})
      </h4>
      <ul className="space-y-2">
        {rows.map((row) => (
          <IncidentCard key={row.id} row={row} nowMs={nowMs} onResolved={remove} />
        ))}
      </ul>
    </section>
  );
};

export default BillingIncidents;
