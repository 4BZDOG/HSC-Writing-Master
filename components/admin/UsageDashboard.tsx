import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Gauge,
  RefreshCw,
  Users,
  Zap,
  BatteryMedium,
  TrendingUp,
  Info,
  Check,
  RotateCcw,
  Download,
  DollarSign,
} from 'lucide-react';
import {
  fetchMyQuotaStatus,
  fetchRoleQuotas,
  fetchUsageReport,
  fetchModelUsageReport,
  setRoleQuota,
  setUserQuotaOverride,
  type QuotaStatus,
  type QuotaRole,
  type UsageReportRow,
  type ModelUsageRow,
} from '../../services/quotaService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { getSelectionSnapshot, subscribeAiConfig } from '../../services/aiConfig';
import { estCostForModelId, getModelById, getModelByProviderModel } from '../../services/aiModels';
import {
  usageReportToCsv,
  estimateCostRange,
  formatCostRange,
  formatUsd,
  aggregateModelCosts,
} from '../../utils/usageReport';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import LoadingIndicator from '../LoadingIndicator';

interface UsageDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ROLE_LABEL: Record<QuotaRole, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
};

const ROLE_TONE: Record<QuotaRole, string> = {
  admin: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
  teacher: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  student: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
};

/** UTC date string (yyyy-mm-dd) — the same day-bucket the server counts in. */
const utcDay = (offsetDays = 0): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

const dayLabel = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <div className="flex-1 min-w-[140px] p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1.5">
      {icon}
      {label}
    </div>
    <div className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tabular-nums">
      {value}
    </div>
    {sub && (
      <div className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400 mt-0.5">
        {sub}
      </div>
    )}
  </div>
);

/** Bounded usage meter; status tint only at the meaningful thresholds and the
 *  numbers are always alongside as text, so state is never colour-alone. */
const UsageMeter: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const tone =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[rgb(var(--color-accent))]';
  return (
    <div className="flex items-center gap-3 min-w-[160px]">
      <div className="flex-1 h-1.5 rounded-full bg-black/40 light:bg-slate-200 overflow-hidden border border-white/5 light:border-slate-300">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 tabular-nums whitespace-nowrap">
        {used}/{limit}
      </span>
    </div>
  );
};

/**
 * Admin dashboard for monitoring and adjusting AI usage: headline numbers,
 * a 7-day call trend, per-user usage for today with INLINE override editing,
 * and the group (role) daily limits. All adjustments go through the
 * admin-gated RPCs; enforcement itself lives in the proxy + database.
 */
const UsageDashboard: React.FC<UsageDashboardProps> = ({ isOpen, onClose, showToast }) => {
  const remote = isCurriculumRemote();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [report, setReport] = useState<UsageReportRow[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsageRow[]>([]);
  const [myStatus, setMyStatus] = useState<QuotaStatus | null>(null);
  const [limits, setLimits] = useState<Record<QuotaRole, string>>({
    admin: '',
    teacher: '',
    student: '',
  });
  // Per-row override drafts, keyed by username.
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  // Fallback editor for users with no usage row today.
  const [extraUser, setExtraUser] = useState('');
  const [extraLimit, setExtraLimit] = useState('');

  useEscapeKey(isOpen && !isBusy, onClose);

  const load = useCallback(async () => {
    if (!remote) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [rows, status, roleQuotas] = await Promise.all([
        fetchUsageReport(7),
        fetchMyQuotaStatus(),
        fetchRoleQuotas(),
      ]);
      setReport(rows);
      setMyStatus(status);
      const next = { admin: '', teacher: '', student: '' } as Record<QuotaRole, string>;
      roleQuotas.forEach((q) => {
        next[q.role] = String(q.daily_limit);
      });
      setLimits(next);
      setOverrideDrafts({});
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load usage data.', 'error');
    } finally {
      setIsLoading(false);
    }

    // Per-model breakdown is a progressive enhancement: it reads a table the
    // proxy fills best-effort and an RPC that may be absent on a not-yet-
    // migrated database. Fetch it separately so any failure just hides the
    // breakdown (falling back to the call-count estimate) instead of breaking
    // the whole dashboard.
    try {
      setModelUsage(await fetchModelUsageReport(7));
    } catch {
      setModelUsage([]);
    }
  }, [remote, showToast]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const today = utcDay(0);
  const todayRows = useMemo(
    () => report.filter((r) => r.day === today).sort((a, b) => b.calls - a.calls),
    [report, today]
  );

  const trend = useMemo(() => {
    // Last 7 UTC days, oldest first, zero-filled so quiet days stay visible.
    const byDay = new Map<string, number>();
    report.forEach((r) => byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.calls));
    const days = Array.from({ length: 7 }, (_, i) => utcDay(6 - i));
    const rows = days.map((day) => ({ day, calls: byDay.get(day) ?? 0 }));
    const max = Math.max(1, ...rows.map((r) => r.calls));
    return { rows, max };
  }, [report]);

  const callsToday = todayRows.reduce((sum, r) => sum + r.calls, 0);

  // The active engines set the price band for the spend estimate. Because the
  // quota counter records calls (not which model served each one), the best we
  // can do is bound the cost between the configured basic and reasoning
  // engines — see utils/usageReport.estimateCostRange.
  const selection = useSyncExternalStore(subscribeAiConfig, getSelectionSnapshot);
  const engines = useMemo(() => {
    const basic = getModelById(selection.basic);
    const reasoning = getModelById(selection.reasoning);
    const prices = [estCostForModelId(selection.basic), estCostForModelId(selection.reasoning)];
    const labels = Array.from(
      new Set([basic?.label, reasoning?.label].filter(Boolean) as string[])
    );
    return { prices, labels };
  }, [selection]);
  const costRangeToday = useMemo(
    () => estimateCostRange(callsToday, engines.prices),
    [callsToday, engines.prices]
  );

  // Price a recorded provider-model string from the registry (unknown models
  // keep their raw string and cost nothing, so the breakdown never hides them).
  const modelMeta = useCallback((model: string) => {
    const opt = getModelByProviderModel(model);
    return { label: opt?.label ?? model, price: opt?.estCostPerCall ?? 0 };
  }, []);

  // Exact spend from the per-model tally: today for the headline tile, and over
  // the whole 7-day window for the breakdown section. Empty when the breakdown
  // is unavailable (pre-migration or no calls yet) — the tile then falls back
  // to the call-count range.
  const modelCostToday = useMemo(
    () =>
      aggregateModelCosts(
        modelUsage.filter((r) => r.day === today),
        modelMeta
      ),
    [modelUsage, today, modelMeta]
  );
  const modelCost7d = useMemo(
    () => aggregateModelCosts(modelUsage, modelMeta),
    [modelUsage, modelMeta]
  );
  const hasExactToday = modelCostToday.totalCalls > 0;

  const handleExportCsv = () => {
    if (report.length === 0) {
      showToast('No usage data to export yet.', 'info');
      return;
    }
    try {
      const blob = new Blob([usageReportToCsv(report)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hsc_ai_usage_${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported ${report.length} usage row(s) to CSV.`, 'success');
    } catch {
      showToast('Failed to prepare the CSV download.', 'error');
    }
  };

  const handleSaveLimits = async () => {
    setIsBusy(true);
    try {
      for (const role of ['admin', 'teacher', 'student'] as QuotaRole[]) {
        const parsed = Number.parseInt(limits[role], 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${ROLE_LABEL[role]} limit must be a non-negative number.`);
        }
        await setRoleQuota(role, parsed);
      }
      showToast('Group limits saved — they apply to the next call.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save limits.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const applyOverride = async (username: string, limit: number | null) => {
    setIsBusy(true);
    try {
      await setUserQuotaOverride(username, limit);
      showToast(
        limit === null
          ? `Override cleared for ${username} — the group limit applies.`
          : `${username} now has a personal limit of ${limit}/day.`,
        'success'
      );
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update the override.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRowOverride = (username: string) => {
    const draft = overrideDrafts[username] ?? '';
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showToast('Enter a non-negative daily limit for the override.', 'error');
      return;
    }
    applyOverride(username, parsed);
  };

  const handleExtraOverride = (clear: boolean) => {
    const username = extraUser.trim();
    if (!username) {
      showToast('Enter a username.', 'error');
      return;
    }
    if (clear) {
      applyOverride(username, null);
      return;
    }
    const parsed = Number.parseInt(extraLimit, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showToast('Enter a non-negative daily limit, or use Clear.', 'error');
      return;
    }
    applyOverride(username, parsed);
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 shadow-lg flex items-center justify-center">
              <Gauge className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                AI Usage Dashboard
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                Monitor spending and adjust daily budgets per group or per user
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={isLoading || isBusy || !remote || report.length === 0}
              aria-label="Export usage report as CSV"
              title="Download the usage report (CSV)"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
            </button>
            <button
              onClick={load}
              disabled={isLoading || isBusy || !remote}
              aria-label="Refresh"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
          {!remote ? (
            <div className="text-center py-16">
              <Info className="w-12 h-12 text-[rgb(var(--color-text-muted))] light:text-slate-300 mx-auto mb-3" />
              <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                Usage metering requires Supabase.
              </p>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 max-w-sm mx-auto mt-1">
                In local mode there are no user identities to meter, so the proxy does not enforce
                quotas. Configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (and their server-side
                copies) to enable budgets.
              </p>
            </div>
          ) : isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <LoadingIndicator messages={['Loading usage data…']} duration={2} band={3} />
            </div>
          ) : (
            <>
              {/* Headline numbers */}
              <div className="flex flex-wrap gap-3">
                <StatTile
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="Calls Today"
                  value={String(callsToday)}
                  sub="across all users (UTC day)"
                />
                <StatTile
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="Active Users"
                  value={String(todayRows.length)}
                  sub="made at least one call today"
                />
                <StatTile
                  icon={<BatteryMedium className="w-3.5 h-3.5" />}
                  label="My Remaining"
                  value={myStatus ? String(myStatus.remaining) : '—'}
                  sub={myStatus ? `of ${myStatus.limit} today` : undefined}
                />
                <StatTile
                  icon={<DollarSign className="w-3.5 h-3.5" />}
                  label="Est. Cost Today"
                  value={
                    hasExactToday
                      ? formatUsd(modelCostToday.totalCost)
                      : `~${formatCostRange(costRangeToday)}`
                  }
                  sub={
                    hasExactToday
                      ? `${modelCostToday.totalCalls} call(s) priced by engine`
                      : engines.labels.length > 0
                        ? `est. @ ${engines.labels.join(' / ')}`
                        : 'estimate — call price × calls'
                  }
                />
              </div>

              {/* 7-day trend */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Calls — last 7 days
                </h3>
                <div className="space-y-1.5">
                  {trend.rows.map(({ day, calls }) => (
                    <div
                      key={day}
                      className="flex items-center gap-3"
                      title={`${day}: ${calls} calls`}
                    >
                      <span className="w-24 shrink-0 text-[11px] text-[rgb(var(--color-text-muted))] light:text-slate-500">
                        {dayLabel(day)}
                      </span>
                      <div className="flex-1 h-4 rounded bg-black/30 light:bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-[rgb(var(--color-accent))]/80"
                          style={{ width: `${(calls / trend.max) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 tabular-nums">
                        {calls}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Spend by engine — only rendered once the proxy has recorded
                  per-model usage (best-effort; absent on an un-migrated DB). */}
              {modelCost7d.rows.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5" /> Spend by engine — last 7 days
                  </h3>
                  <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="px-4 py-2.5">Engine</th>
                          <th className="px-4 py-2.5 text-right">Calls</th>
                          <th className="px-4 py-2.5 text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                        {modelCost7d.rows.map((r) => (
                          <tr
                            key={r.model}
                            className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50"
                          >
                            <td className="px-4 py-2.5 text-[rgb(var(--color-text-primary))] light:text-slate-800">
                              {r.label}
                              <span className="ml-2 font-mono text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
                                {r.model}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                              {r.calls}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                              {formatUsd(r.cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold">
                        <tr>
                          <td className="px-4 py-2.5">Total</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {modelCost7d.totalCalls}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatUsd(modelCost7d.totalCost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
                    Estimated at each engine's blended per-call price (see the engine registry) —
                    good for comparing engines and sanity-checking spend, not an invoice.
                  </p>
                </section>
              )}

              {/* Per-user usage today, with inline override editing */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Usage today · per user
                </h3>
                {todayRows.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic py-4">
                    No AI calls yet today.
                  </p>
                ) : (
                  <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="px-4 py-2.5">User</th>
                          <th className="px-4 py-2.5">Group</th>
                          <th className="px-4 py-2.5">Usage</th>
                          <th className="px-4 py-2.5 text-right">Personal Override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                        {todayRows.map((row) => (
                          <tr
                            key={row.username}
                            className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50"
                          >
                            <td className="px-4 py-2.5 font-mono text-[rgb(var(--color-text-primary))] light:text-slate-800">
                              {row.username}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${ROLE_TONE[row.role]}`}
                              >
                                {ROLE_LABEL[row.role]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <UsageMeter used={row.calls} limit={row.limit} />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 justify-end">
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`Override for ${row.username}`}
                                  placeholder={row.override != null ? String(row.override) : '—'}
                                  value={overrideDrafts[row.username] ?? ''}
                                  onChange={(e) =>
                                    setOverrideDrafts((prev) => ({
                                      ...prev,
                                      [row.username]: e.target.value,
                                    }))
                                  }
                                  className="w-16 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                                />
                                <button
                                  onClick={() => handleRowOverride(row.username)}
                                  disabled={isBusy}
                                  aria-label={`Set override for ${row.username}`}
                                  title="Set a personal daily limit for this user"
                                  className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                {row.override != null && (
                                  <button
                                    onClick={() => applyOverride(row.username, null)}
                                    disabled={isBusy}
                                    aria-label={`Clear override for ${row.username}`}
                                    title="Clear the override — the group limit applies again"
                                    className="p-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))] transition-all disabled:opacity-50"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Fallback: adjust a user who hasn't called the AI today */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
                    Adjust another user:
                  </span>
                  <input
                    type="text"
                    placeholder="username"
                    aria-label="Other username"
                    value={extraUser}
                    onChange={(e) => setExtraUser(e.target.value)}
                    className="w-36 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="limit"
                    aria-label="Other user daily limit"
                    value={extraLimit}
                    onChange={(e) => setExtraLimit(e.target.value)}
                    className="w-20 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                  />
                  <button
                    onClick={() => handleExtraOverride(false)}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => handleExtraOverride(true)}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))] text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </section>

              {/* Group limits */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5" /> Group daily limits
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  {(['admin', 'teacher', 'student'] as QuotaRole[]).map((role) => (
                    <label key={role} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-400">
                        {ROLE_LABEL[role]}s
                      </span>
                      <input
                        type="number"
                        min={0}
                        aria-label={`${ROLE_LABEL[role]}s daily limit`}
                        value={limits[role]}
                        onChange={(e) => setLimits((prev) => ({ ...prev, [role]: e.target.value }))}
                        className="w-24 text-sm rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-3 py-2 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                      />
                    </label>
                  ))}
                  <button
                    onClick={handleSaveLimits}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    Save Group Limits
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
                  Budgets reset at midnight UTC. A personal override always beats its group limit.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UsageDashboard;
