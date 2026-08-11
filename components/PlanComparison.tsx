import React from 'react';
import { Check, Minus, Crown, Sparkles, School } from 'lucide-react';
import {
  PLAN_LABELS,
  PLAN_PRICING,
  monetisationEnabled,
  requestUpgrade,
  getUserPlan,
  type Plan,
} from '../services/entitlements';
import { buildPlanComparison, COMPARED_PLANS, PLAN_TAGLINES } from '../utils/planComparison';
import type { User } from '../types';

/**
 * Free vs Plus vs School, built from `utils/planComparison.ts` — which is
 * itself derived from the live entitlement rules, so this table cannot drift
 * from what the app actually gates.
 *
 * Two layouts from one data source: a comparison table from `sm` up, and a
 * stack of per-plan cards below it, because a three-column table on a phone
 * is unreadable and most students are on a phone.
 */

const PLAN_ICONS: Record<Plan, typeof Crown> = {
  free: Sparkles,
  plus: Crown,
  school: School,
};

/**
 * A FUNCTION, not a module-level object. Interpolating an imported value at
 * module scope is what shipped a blank page once (see services/planLimits.ts):
 * if the bundler puts this component and `entitlements` in chunks that import
 * each other, the read happens before the other chunk has initialised.
 * `npm run check:bundle` fails the build if that ever becomes true.
 */
const planPriceLine = (plan: Plan): string =>
  ({
    free: 'Free, always',
    plus: `${PLAN_PRICING.yearly}/year or ${PLAN_PRICING.monthly}/month`,
    school: `${PLAN_PRICING.schoolSeat} per student, per year`,
  })[plan];

const Cell: React.FC<{ cell: ReturnType<typeof buildPlanComparison>[0]['cells'][Plan] }> = ({
  cell,
}) => {
  if (cell.kind === 'yes')
    return <Check className="w-4 h-4 text-emerald-500 mx-auto" aria-label="Included" />;
  if (cell.kind === 'no')
    return <Minus className="w-4 h-4 text-slate-600 mx-auto" aria-label="Not included" />;
  return (
    <span
      className={`text-[11px] font-bold ${
        cell.kind === 'partial'
          ? 'text-amber-500'
          : 'text-[rgb(var(--color-text-primary))] light:text-slate-900'
      }`}
    >
      {cell.text}
    </span>
  );
};

interface PlanComparisonProps {
  /** Highlights the plan this user is on, so the table answers "what am I
   *  missing?" rather than just "what exists?". */
  user?: User | null;
  /** Shown under the table when the caller wants the upgrade route offered. */
  showUpgradeCta?: boolean;
}

const PlanComparison: React.FC<PlanComparisonProps> = ({ user, showUpgradeCta = true }) => {
  const rows = buildPlanComparison();
  const currentPlan = getUserPlan(user ?? null);

  return (
    <div>
      {/* Plan headers — also the mobile card headers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {COMPARED_PLANS.map((plan) => {
          const Icon = PLAN_ICONS[plan];
          const isCurrent = plan === currentPlan;
          return (
            <div
              key={plan}
              className={`p-4 rounded-2xl border relative ${
                isCurrent
                  ? 'bg-indigo-500/10 light:bg-indigo-50 border-indigo-500/40 light:border-indigo-300'
                  : 'bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200'
              }`}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-400 light:text-indigo-600 text-[9px] font-black uppercase tracking-widest">
                  Your plan
                </span>
              )}
              <Icon
                className={`w-5 h-5 mb-2 ${plan === 'free' ? 'text-slate-400' : plan === 'plus' ? 'text-amber-500' : 'text-indigo-400'}`}
              />
              <h4 className="text-sm font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 uppercase tracking-wide">
                {PLAN_LABELS[plan]}
              </h4>
              <p className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">
                {planPriceLine(plan)}
              </p>
              <p className="text-[11px] leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 mt-2 font-medium">
                {PLAN_TAGLINES[plan]}
              </p>
            </div>
          );
        })}
      </div>

      {/* Comparison table — sm and up */}
      <div className="hidden sm:block overflow-x-auto custom-scrollbar rounded-2xl border border-white/5 light:border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/[0.03] light:bg-slate-50">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-[rgb(var(--color-text-muted))] light:text-slate-500">
                What you get
              </th>
              {COMPARED_PLANS.map((plan) => (
                <th
                  key={plan}
                  scope="col"
                  className={`px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.15em] ${
                    plan === currentPlan
                      ? 'text-indigo-400 light:text-indigo-600'
                      : 'text-[rgb(var(--color-text-muted))] light:text-slate-500'
                  }`}
                >
                  {PLAN_LABELS[plan]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/5 light:border-slate-200">
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="block text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    {row.label}
                  </span>
                  {row.note && (
                    <span className="block text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-0.5 font-medium">
                      {row.note}
                    </span>
                  )}
                </th>
                {COMPARED_PLANS.map((plan) => (
                  <td
                    key={plan}
                    className={`px-4 py-3 text-center ${plan === currentPlan ? 'bg-indigo-500/5 light:bg-indigo-50/50' : ''}`}
                  >
                    <Cell cell={row.cells[plan]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stacked list — below sm, where a three-column table is unreadable */}
      <div className="sm:hidden space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="p-3 rounded-2xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200"
          >
            <span className="block text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
              {row.label}
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {COMPARED_PLANS.map((plan) => (
                <div key={plan} className="text-center">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1">
                    {PLAN_LABELS[plan]}
                  </span>
                  <Cell cell={row.cells[plan]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Nothing to upgrade to when nothing is for sale — the button would
          open a prompt the UpgradeModal now refuses to show. The table above
          already renders every feature as included in that state. */}
      {showUpgradeCta && currentPlan === 'free' && monetisationEnabled() && (
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-amber-400/5 light:bg-amber-50 border border-amber-400/20 light:border-amber-200">
          <p className="text-xs font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed">
            The free plan resets every day and never expires. Upgrade when you want the full
            feedback, not because you ran out of time.
          </p>
          <button
            onClick={() => requestUpgrade('fullFeedback')}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <Crown className="w-3.5 h-3.5" /> See {PLAN_LABELS.plus}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanComparison;
