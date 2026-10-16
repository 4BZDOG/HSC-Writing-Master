import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Info,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  loadSeatUsage,
  SEAT_USAGE_WINDOWS,
  type SeatUsage,
  type SeatUsageResult,
  type SeatUsageWindow,
} from '../../services/seatEconomicsService';
import { PLAN_PRICING } from '../../services/entitlements';
import {
  parseCostPerCallAud,
  parseSeatRevenueAud,
  projectSeatEconomics,
  type SeatEconomics as SeatEconomicsFigures,
  type SeatUsageMeasures,
  type SeatVerdict,
} from '../../utils/seatEconomics';

/**
 * "Seat economics" in the Billing overview: how many AI calls each paid School seat
 * really uses, and, once a cost per call is configured, whether the seat price
 * covers it. Admin only, read-only. The figures come from `school_seat_usage()`
 * (schema §30) and the arithmetic from utils/seatEconomics.ts.
 *
 * The cost per call is read on the client from VITE_AI_COST_PER_CALL_AUD. That is
 * fine because this panel is admin only and the figure is not a secret. Without it
 * the panel shows calls only.
 */

// en-AU prints AUD as "$", which reads as US dollars next to the app's own prices.
// The app writes "A$" everywhere, so the symbol is added here by hand.
const money = (amount: number, digits: number): string =>
  `${amount < 0 ? '-' : ''}A$${new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(amount))}`;
const aud = (n: number): string => money(n, 2);
const audPerCall = (n: number): string => money(n, 4);
const COUNT = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
const ONE_DP = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });

const TONE: Record<SeatVerdict, { icon: LucideIcon; box: string; ink: string }> = {
  healthy: {
    icon: CircleCheck,
    box: 'border-emerald-500/40 bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-300',
    ink: 'text-emerald-400 light:text-emerald-800',
  },
  thin: {
    icon: TriangleAlert,
    box: 'border-amber-500/40 bg-amber-500/10 light:bg-amber-50 light:border-amber-300',
    ink: 'text-amber-400 light:text-amber-800',
  },
  loss: {
    icon: CircleX,
    box: 'border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300',
    ink: 'text-red-400 light:text-red-800',
  },
  unknown: {
    icon: Info,
    box: 'border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 light:border-slate-300',
    ink: 'text-[rgb(var(--color-text-secondary))] light:text-slate-800',
  },
};

/**
 * The chip says the verdict in words as well as colour and icon, so it reads the
 * same in greyscale and to a screen reader. "No cost set" and "No price to
 * compare" are different reasons for the same unknown verdict.
 */
const verdictWords = (verdict: SeatVerdict, costSet: boolean): string => {
  switch (verdict) {
    case 'healthy':
      return 'Healthy';
    case 'thin':
      return 'Thin margin';
    case 'loss':
      return 'Loss';
    case 'unknown':
      return costSet ? 'No price to compare' : 'No cost set';
  }
};

const VerdictChip: React.FC<{ verdict: SeatVerdict; label: string }> = ({ verdict, label }) => {
  const tone = TONE[verdict];
  const Icon = tone.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold whitespace-nowrap ${tone.box} ${tone.ink}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
};

const Cell: React.FC<{ children: React.ReactNode; strong?: boolean }> = ({ children, strong }) => (
  <td
    className={`px-3 py-2.5 text-sm tabular-nums whitespace-nowrap text-right ${
      strong
        ? 'font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900'
        : 'text-[rgb(var(--color-text-secondary))] light:text-slate-800'
    }`}
  >
    {children}
  </td>
);

const HeadCell: React.FC<{ children: React.ReactNode; first?: boolean }> = ({
  children,
  first,
}) => (
  <th
    scope="col"
    className={`px-3 py-2 text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-700 align-bottom ${
      first ? 'text-left' : 'text-right'
    }`}
  >
    {children}
  </th>
);

/** One table row: a school, or the totals across all of them. */
const SeatRow: React.FC<{
  label: string;
  measures: SeatUsageMeasures;
  costPerCallAud: number | null;
  seatPriceAud: number | null;
  totals?: boolean;
}> = ({ label, measures, costPerCallAud, seatPriceAud, totals }) => {
  const figures: SeatEconomicsFigures = projectSeatEconomics(
    measures,
    costPerCallAud,
    seatPriceAud
  );
  const costSet = costPerCallAud !== null;
  const tone = verdictWords(figures.verdict, costSet);
  return (
    <tr
      className={`border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 ${
        totals ? 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50' : ''
      }`}
    >
      <th
        scope="row"
        className="px-3 py-2.5 text-left text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 min-w-[10rem]"
      >
        {label}
      </th>
      <Cell>{COUNT.format(measures.seats)}</Cell>
      <Cell>{COUNT.format(measures.members)}</Cell>
      <Cell>{COUNT.format(measures.active_users)}</Cell>
      <Cell strong>{COUNT.format(measures.calls_per_seat_per_day)}</Cell>
      <Cell>{ONE_DP.format(measures.p95_calls_per_user_day)}</Cell>
      <td className="px-3 py-2.5 text-right">
        <VerdictChip verdict={figures.verdict} label={tone} />
      </td>
      {costSet && (
        <>
          <Cell>
            {figures.costPerSeatPerYearAud === null
              ? 'Not worked out'
              : aud(figures.costPerSeatPerYearAud)}
          </Cell>
          <Cell>
            {figures.marginPerSeatPerYearAud === null
              ? 'Not worked out'
              : aud(figures.marginPerSeatPerYearAud)}
          </Cell>
          <Cell>
            {figures.heavyUserCostPerYearAud === null
              ? 'Not worked out'
              : aud(figures.heavyUserCostPerYearAud)}
          </Cell>
        </>
      )}
    </tr>
  );
};

const SeatTable: React.FC<{
  usage: SeatUsage;
  costPerCallAud: number | null;
  seatPriceAud: number | null;
}> = ({ usage, costPerCallAud, seatPriceAud }) => {
  const costSet = costPerCallAud !== null;
  return (
    <div className="overflow-x-auto custom-scrollbar rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
      <table className="w-full min-w-[40rem]">
        <caption className="sr-only">
          Seat usage by licensed school over the last {usage.days} days
        </caption>
        <thead>
          <tr>
            <HeadCell first>School</HeadCell>
            <HeadCell>Seats</HeadCell>
            <HeadCell>Members</HeadCell>
            <HeadCell>Active users</HeadCell>
            <HeadCell>Calls per seat per day</HeadCell>
            <HeadCell>95th percentile calls per user day</HeadCell>
            <HeadCell>Verdict</HeadCell>
            {costSet && (
              <>
                <HeadCell>AI cost per seat a year</HeadCell>
                <HeadCell>Margin per seat a year</HeadCell>
                <HeadCell>Heavy user a year</HeadCell>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {usage.schools.map((school) => (
            <SeatRow
              key={school.id}
              label={school.name}
              measures={school}
              costPerCallAud={costPerCallAud}
              seatPriceAud={seatPriceAud}
            />
          ))}
          <SeatRow
            label="All licensed schools"
            measures={usage.totals}
            costPerCallAud={costPerCallAud}
            seatPriceAud={seatPriceAud}
            totals
          />
        </tbody>
      </table>
    </div>
  );
};

/** The explanation sits above the table, because the numbers mean little without it. */
const HowToRead: React.FC = () => (
  <div className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-800 space-y-2">
    <p>These are AI calls, not money. Money appears here only once a cost per call is set.</p>
    <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
      <li>
        <span className="font-bold">Calls per seat per day</span> is the school's calls over the
        window, divided by its paid seats and by the number of days. Compare it with the 300-call
        daily allowance a member can reach.
      </li>
      <li>
        <span className="font-bold">95th percentile calls per user day</span> is the figure that 95
        in 100 member-days with any calls stayed at or under. The heaviest 5 in 100 went above it,
        so it is the heavy-user case.
      </li>
      <li>
        <span className="font-bold">AI cost per seat a year</span> is calls per seat per day, times
        365, times the cost per call. <span className="font-bold">Margin</span> is the seat price
        minus that cost.
      </li>
      <li>
        <span className="font-bold">Verdict:</span> Healthy when the cost is at most half the seat
        price. Thin margin when it is more than half and at most the whole price. Loss when it is
        more than the price.
      </li>
      <li>
        Members are the people in each school today, applied to the whole window. A person who has
        left is not counted, and a new member's earlier calls are counted for the school.
      </li>
    </ul>
  </div>
);

const SeatEconomics: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<SeatUsageWindow>(30);
  const [result, setResult] = useState<SeatUsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Each read takes a number; only the newest may write, so a slow 30-day read
  // cannot land after the 90-day one the admin has just asked for.
  const requestRef = useRef(0);

  // Read at render, not at module load, so a test (or a rebuild) can change it.
  const costPerCallAud = parseCostPerCallAud(import.meta.env.VITE_AI_COST_PER_CALL_AUD);
  const seatPriceAud = parseSeatRevenueAud(PLAN_PRICING.schoolSeat);

  const load = useCallback(async (window: SeatUsageWindow) => {
    const id = ++requestRef.current;
    setLoading(true);
    const next = await loadSeatUsage(window);
    if (id !== requestRef.current) return;
    setResult(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load(days);
  }, [open, days, load]);

  let body: React.ReactNode = null;
  if (open) {
    body = (
      <div className="mt-4 space-y-4">
        <HowToRead />

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Window">
          {SEAT_USAGE_WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              aria-pressed={days === window}
              onClick={() => setDays(window)}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                days === window
                  ? 'bg-[rgb(var(--color-text-primary))] text-[rgb(var(--color-bg-surface))] light:bg-slate-900 light:text-white'
                  : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 text-[rgb(var(--color-text-primary))] light:text-slate-900 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300'
              }`}
            >
              Last {window} days
            </button>
          ))}
        </div>

        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-700">
          {costPerCallAud === null ? (
            'Set VITE_AI_COST_PER_CALL_AUD to see projected cost and margin.'
          ) : (
            <>
              Cost per call {audPerCall(costPerCallAud)} (VITE_AI_COST_PER_CALL_AUD).{' '}
              {seatPriceAud === null
                ? 'The seat price could not be read from VITE_SCHOOL_SEAT_PRICE_DISPLAY, so there are no margins or verdicts.'
                : `Seat price ${aud(seatPriceAud)} a year.`}
            </>
          )}
        </p>

        {loading && (
          <div
            role="status"
            className="h-24 flex items-center justify-center gap-3 text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700"
          >
            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            Loading seat usage…
          </div>
        )}

        {!loading && result?.status === 'unavailable' && (
          <div className="p-4 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100">
            <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900">
              Re-apply the database schema to see seat usage.
            </p>
            <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700 mt-1">
              The report is schema section §30 in supabase/schema.sql. Re-apply the file, then
              refresh.
            </p>
          </div>
        )}

        {!loading && result?.status === 'error' && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 light:bg-red-50 light:border-red-300"
          >
            <p className="text-sm text-red-400 light:text-red-800">{result.message}</p>
            <button
              type="button"
              onClick={() => load(days)}
              className="mt-3 min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 text-[rgb(var(--color-text-primary))] light:text-slate-900"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && result?.status === 'ok' && result.usage.schools.length === 0 && (
          <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700">
            No school has a live licence, so there are no seats to measure.
          </p>
        )}

        {!loading && result?.status === 'ok' && result.usage.schools.length > 0 && (
          <SeatTable
            usage={result.usage}
            costPerCallAud={costPerCallAud}
            seatPriceAud={seatPriceAud}
          />
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="billing-seat-economics"
      className="p-4 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-white"
    >
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="billing-seat-economics-panel"
          className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
        >
          <span
            id="billing-seat-economics"
            className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900"
          >
            Seat economics
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[rgb(var(--color-text-muted))] transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id="billing-seat-economics-panel" hidden={!open}>
        {body}
      </div>
    </section>
  );
};

export default SeatEconomics;
