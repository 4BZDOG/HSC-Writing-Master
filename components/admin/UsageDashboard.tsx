import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
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
  School,
  Plus,
  ScrollText,
  Compass,
} from 'lucide-react';
import {
  fetchMyQuotaStatus,
  fetchRoleQuotas,
  fetchUsageReport,
  fetchModelUsageReport,
  fetchSchools,
  createSchool,
  setSchoolQuota,
  assignUserSchool,
  setRoleQuota,
  setUserQuotaOverride,
  fetchFreeEvaluationLimit,
  setFreeEvaluationLimit,
  LIVE_LICENCE_STATUSES,
  type QuotaStatus,
  type QuotaRole,
  type UsageReportRow,
  type ModelUsageRow,
  type SchoolRow,
} from '../../services/quotaService';
import {
  fetchCourseDemand,
  setCourseRequestStatus,
  type CourseDemandRow,
  type CourseRequestStatus,
} from '../../services/courseDemandService';
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
import { fetchAcceptanceReport, type AcceptanceRow } from '../../services/agreementService';
import { AGREEMENT_VERSION } from '../../data/legalContent';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useScrollLock } from '../../hooks/useScrollLock';
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
      <div className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 mt-0.5">
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
 * A school's seat licence at a glance: is it live, and are more people using it
 * than were paid for?
 *
 * The over-seat warning is the reason this cell exists. Seats are the billed
 * quantity and membership is not capped per login, so a school can quietly grow
 * past what it bought — which is a conversation to have early and politely, not
 * a discovery to make at renewal. `plan_seats === undefined` means the RPC
 * predates the licence columns, which is "unknown", not "no licence".
 */
const LicenceCell: React.FC<{ school: SchoolRow }> = ({ school }) => {
  if (school.plan_status === undefined) {
    return (
      <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 italic">
        unknown
      </span>
    );
  }
  const live = LIVE_LICENCE_STATUSES.includes(school.plan_status);
  if (!live) {
    return (
      <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 italic">
        {school.plan_status === 'none' ? 'no licence' : school.plan_status}
      </span>
    );
  }
  const seats = school.plan_seats ?? 0;
  const overSeats = seats > 0 && school.members > seats;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            school.plan_status === 'past_due' ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
        />
        <span className="text-[rgb(var(--color-text-secondary))] light:text-slate-700 font-mono tabular-nums">
          {seats} seat{seats === 1 ? '' : 's'}
        </span>
        {school.plan_status === 'past_due' && (
          <span className="text-amber-500">payment failing</span>
        )}
      </span>
      {overSeats && (
        <span className="text-[10px] font-bold text-amber-500">
          {school.members - seats} over — top up seats
        </span>
      )}
      {school.plan_period_end && (
        <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
          renews{' '}
          {new Date(school.plan_period_end).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      )}
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
  // Schools (shared quota pools, schema §12). null = the RPC is absent
  // (database pre-dates the migration) and the section hides itself.
  const [schools, setSchools] = useState<SchoolRow[] | null>([]);
  // null = the acceptance RPC is unavailable (mock mode / unmigrated database),
  // which hides the panel rather than reporting a false zero.
  const [acceptance, setAcceptance] = useState<AcceptanceRow[] | null>(null);
  const [schoolLimitDrafts, setSchoolLimitDrafts] = useState<Record<string, string>>({});
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolLimit, setNewSchoolLimit] = useState('');
  const [memberUser, setMemberUser] = useState('');
  const [memberSchool, setMemberSchool] = useState('');
  // The paywall's headline number, as the DATABASE is enforcing it right now.
  // null = unreadable (mock mode, or a database predating §14) and the control
  // hides rather than offering to change something it cannot read.
  const [freeEvalLimit, setFreeEvalLimit] = useState<number | null>(null);
  const [freeEvalDraft, setFreeEvalDraft] = useState('');
  // Course demand (schema §21). null = the RPC is absent, same progressive-
  // enhancement rule as schools and acceptance below.
  const [demand, setDemand] = useState<CourseDemandRow[] | null>(null);
  const [showClosedDemand, setShowClosedDemand] = useState(false);
  // The same flag, readable from `load` without making it a dependency.
  const showClosedRef = useRef(showClosedDemand);
  showClosedRef.current = showClosedDemand;

  useEscapeKey(isOpen && !isBusy, onClose);
  useScrollLock(isOpen);

  /**
   * Refetch the demand list alone. Separate from `load` so the "Show closed"
   * toggle and a status change cost one RPC rather than a full dashboard
   * reload — and so neither discards the edits sitting in the other panels.
   */
  const loadDemand = useCallback(async (includeClosed: boolean) => {
    try {
      setDemand(await fetchCourseDemand(includeClosed));
    } catch {
      // Absent before §21: hide the panel rather than fail the dashboard.
      setDemand(null);
    }
  }, []);

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

    // Schools are the same kind of progressive enhancement: list_schools is
    // absent on a database that pre-dates §12, so a failure hides the section
    // rather than breaking the dashboard.
    try {
      setSchools(await fetchSchools());
      setSchoolLimitDrafts({});
    } catch {
      setSchools(null);
    }

    // Same pattern again: agreement_acceptance_report() is absent on a database
    // that pre-dates §15, and its absence must hide the panel, not fail the load.
    setAcceptance(await fetchAcceptanceReport());

    // The live free-tier allowance. fetchFreeEvaluationLimit swallows its own
    // failures and answers null, so an unmigrated database hides the control.
    const liveLimit = await fetchFreeEvaluationLimit();
    setFreeEvalLimit(liveLimit);
    setFreeEvalDraft(liveLimit !== null ? String(liveLimit) : '');

    // Course demand: absent before §21, and its absence hides the panel.
    // Read through a ref rather than taking `showClosedDemand` as a dependency:
    // as a dependency, ticking "Show closed" would re-run the WHOLE dashboard
    // load, throwing away every unsaved draft in it (the allowance, the
    // per-user overrides, the school pools) and re-issuing six unrelated RPCs
    // to refetch one list. As a hardcoded `false` it was wrong the other way —
    // the modal is never unmounted, so reopening it left the checkbox ticked
    // with the closed rows silently gone.
    await loadDemand(showClosedRef.current);
  }, [remote, showToast, loadDemand]);

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

  // --- Paywall settings -----------------------------------------------------

  const handleSaveFreeEvalLimit = async () => {
    const parsed = Number.parseInt(freeEvalDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      showToast('Enter a daily allowance between 0 and 1000.', 'error');
      return;
    }
    setIsBusy(true);
    try {
      await setFreeEvaluationLimit(parsed);
      setFreeEvalLimit(parsed);
      showToast(
        parsed === 0
          ? 'Free marking is now switched off — free accounts get no evaluations.'
          : `Free accounts now get ${parsed} marked evaluations a day.`,
        'success'
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save that allowance.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // --- Course demand --------------------------------------------------------

  const handleDemandStatus = async (row: CourseDemandRow, status: CourseRequestStatus) => {
    setIsBusy(true);
    try {
      await setCourseRequestStatus(row.id, status);
      await loadDemand(showClosedDemand);
      showToast(`“${row.name}” marked ${status}.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update that request.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // --- Schools (shared quota pools) ---------------------------------------

  const runSchoolAction = async (action: () => Promise<void>, successMessage: string) => {
    setIsBusy(true);
    try {
      await action();
      showToast(successMessage, 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The school update failed.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateSchool = () => {
    const name = newSchoolName.trim();
    if (!name) {
      showToast('Enter a name for the new school.', 'error');
      return;
    }
    const limit = newSchoolLimit.trim() === '' ? null : Number.parseInt(newSchoolLimit, 10);
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      showToast('Pooled limit must be a non-negative number, or blank for no pooled cap.', 'error');
      return;
    }
    runSchoolAction(async () => {
      await createSchool(name, limit);
      setNewSchoolName('');
      setNewSchoolLimit('');
    }, `School "${name}" created.`);
  };

  const handleSchoolLimit = (name: string, clear: boolean) => {
    const draft = schoolLimitDrafts[name] ?? '';
    const limit = clear ? null : Number.parseInt(draft, 10);
    if (!clear && (!Number.isFinite(limit as number) || (limit as number) < 0)) {
      showToast('Enter a non-negative pooled limit, or use Clear.', 'error');
      return;
    }
    runSchoolAction(
      () => setSchoolQuota(name, limit),
      clear
        ? `"${name}" now has no pooled cap — members are only individually limited.`
        : `"${name}" now shares ${limit} calls/day.`
    );
  };

  const handleAssignMember = (clear: boolean) => {
    const username = memberUser.trim();
    if (!username) {
      showToast('Enter the username to place.', 'error');
      return;
    }
    if (!clear && !memberSchool) {
      showToast('Pick the school to place them in.', 'error');
      return;
    }
    runSchoolAction(
      () => assignUserSchool(username, clear ? null : memberSchool),
      clear ? `${username} removed from their school.` : `${username} placed in "${memberSchool}".`
    );
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
        <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar space-y-6">
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
              <LoadingIndicator messages={['Loading usage data…']} duration={2} />
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
                  <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[360px]">
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
                              <span className="ml-2 font-mono text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
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
                  <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                    Estimated at each engine's blended per-call price (see the engine registry) —
                    good for comparing engines and sanity-checking spend, not an invoice.
                  </p>
                </section>
              )}

              {/* Agreement acceptance — a compliance question a school will be
                  asked ("has every student agreed to the current terms?") and
                  could not previously answer. Progressive enhancement: hidden
                  entirely when the RPC is absent, rather than showing an empty
                  table that would read as "nobody has accepted". */}
              {acceptance && acceptance.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                    <ScrollText className="w-3.5 h-3.5" /> Agreement v{AGREEMENT_VERSION} ·
                    acceptance
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tabular-nums">
                      {acceptance.filter((a) => a.accepted).length}
                      <span className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                        {' '}
                        / {acceptance.length}
                      </span>
                    </span>
                    <span className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      accounts have accepted the current agreement.
                    </span>
                  </div>
                  {acceptance.some((a) => !a.accepted) && (
                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">
                        Yet to accept
                      </p>
                      <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed">
                        {acceptance
                          .filter((a) => !a.accepted)
                          .slice(0, 30)
                          .map((a) => a.username)
                          .join(', ')}
                        {acceptance.filter((a) => !a.accepted).length > 30 && ' …'}
                      </p>
                      <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                        They will be asked the next time they sign in — nobody reaches the workspace
                        without accepting.
                      </p>
                    </div>
                  )}
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
                  <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[500px]">
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
                <div className="mt-3 flex flex-wrap items-center gap-2 md:gap-3">
                  <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-500 font-medium">
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500">
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
                <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                  Budgets reset at midnight UTC. A personal override always beats its group limit.
                </p>
              </section>

              {/* The paywall's headline number. Distinct from the budgets above:
                  those protect the provider bill and apply to everyone, this one
                  is the commercial limit and only bites on the free plan. It was
                  adjustable in the database from the day it shipped but had no
                  control here, so changing it meant opening the SQL editor.
                  Hidden when the setting can't be read (mock mode, or a database
                  predating §14) rather than offering to change a guess. */}
              {freeEvalLimit !== null && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                    <ScrollText className="w-3.5 h-3.5" /> Free plan · daily marked evaluations
                  </h3>
                  <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 mb-3 max-w-xl">
                    How many answers a free account can have marked each day. Paid plans, teachers
                    and admins are never metered by this. It takes effect on the very next
                    evaluation — no redeploy — and the app quotes whatever you set here, so the
                    number students see and the number enforced cannot drift apart.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500">
                        Evaluations per day
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        aria-label="Free plan daily evaluation allowance"
                        value={freeEvalDraft}
                        onChange={(e) => setFreeEvalDraft(e.target.value)}
                        className="w-24 text-sm rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-3 py-2 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                      />
                    </label>
                    <button
                      onClick={handleSaveFreeEvalLimit}
                      disabled={isBusy || freeEvalDraft.trim() === String(freeEvalLimit)}
                      className="px-4 py-2 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      Save Allowance
                    </button>
                    <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 pb-2.5">
                      Currently enforcing <strong className="font-mono">{freeEvalLimit}</strong> a
                      day
                    </span>
                  </div>
                </section>
              )}

              {/* Schools — shared quota pools. Hidden when the database
                  pre-dates the schools migration (schema §12). */}
              {schools !== null && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                    <School className="w-3.5 h-3.5" /> Schools · shared daily pools
                  </h3>
                  <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 mb-3 max-w-xl">
                    Place students and teachers in a school to give them one shared daily AI budget.
                    Every member&apos;s calls draw from the pool as well as their personal limit —
                    whichever runs out first stops the call. Leave the pool blank to use a school as
                    a grouping only.
                  </p>

                  {schools.length > 0 && (
                    <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto mb-3">
                      <table className="w-full text-left text-sm min-w-[480px]">
                        <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                          <tr>
                            <th className="px-4 py-2.5">School</th>
                            <th className="px-4 py-2.5 text-right">Members</th>
                            <th className="px-4 py-2.5">Seat licence</th>
                            <th className="px-4 py-2.5">Pool today</th>
                            <th className="px-4 py-2.5 text-right">Pooled limit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                          {schools.map((s) => (
                            <tr
                              key={s.id}
                              className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50"
                            >
                              <td className="px-4 py-2.5 font-medium text-[rgb(var(--color-text-primary))] light:text-slate-800">
                                {s.name}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                {s.members}
                              </td>
                              <td className="px-4 py-2.5">
                                <LicenceCell school={s} />
                              </td>
                              <td className="px-4 py-2.5">
                                {s.daily_ai_limit !== null ? (
                                  <UsageMeter used={s.used_today} limit={s.daily_ai_limit} />
                                ) : (
                                  <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 italic">
                                    no pooled cap
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <input
                                    type="number"
                                    min={0}
                                    aria-label={`Pooled daily limit for ${s.name}`}
                                    placeholder={
                                      s.daily_ai_limit !== null ? String(s.daily_ai_limit) : '—'
                                    }
                                    value={schoolLimitDrafts[s.name] ?? ''}
                                    onChange={(e) =>
                                      setSchoolLimitDrafts((prev) => ({
                                        ...prev,
                                        [s.name]: e.target.value,
                                      }))
                                    }
                                    className="w-20 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                                  />
                                  <button
                                    onClick={() => handleSchoolLimit(s.name, false)}
                                    disabled={isBusy}
                                    aria-label={`Set pooled limit for ${s.name}`}
                                    title="Set the shared daily pool for this school"
                                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  {s.daily_ai_limit !== null && (
                                    <button
                                      onClick={() => handleSchoolLimit(s.name, true)}
                                      disabled={isBusy}
                                      aria-label={`Clear pooled limit for ${s.name}`}
                                      title="Remove the pooled cap — members are only individually limited"
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

                  {/* Create a school */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                      New school:
                    </span>
                    <input
                      type="text"
                      placeholder="name, e.g. Northmead High"
                      aria-label="New school name"
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      className="w-48 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="pool (optional)"
                      aria-label="New school pooled daily limit"
                      value={newSchoolLimit}
                      onChange={(e) => setNewSchoolLimit(e.target.value)}
                      className="w-28 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 text-right font-mono outline-none focus:border-[rgb(var(--color-accent))]/60"
                    />
                    <button
                      onClick={handleCreateSchool}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create
                    </button>
                  </div>

                  {/* Place a user in a school */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                      Place a user:
                    </span>
                    <input
                      type="text"
                      placeholder="username"
                      aria-label="Username to place in a school"
                      value={memberUser}
                      onChange={(e) => setMemberUser(e.target.value)}
                      className="w-36 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60"
                    />
                    <select
                      aria-label="School to place the user in"
                      value={memberSchool}
                      onChange={(e) => setMemberSchool(e.target.value)}
                      className="text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60 text-[rgb(var(--color-text-secondary))] light:text-slate-700"
                    >
                      <option value="">choose school…</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssignMember(false)}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Place
                    </button>
                    <button
                      onClick={() => handleAssignMember(true)}
                      disabled={isBusy}
                      title="Remove this user from whichever school they are in"
                      className="px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))] text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </section>
              )}

              {/* Course demand — what people came looking for and did not find.
                  Creating a course is admin-only, so this is the other half of
                  that decision: the queue it produces, in the one place someone
                  who CAN create a course is already looking. Hidden on a
                  database that pre-dates §21. */}
              {demand !== null && (
                <section>
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 flex items-center gap-2">
                      <Compass className="w-3.5 h-3.5" /> Course demand
                      {demand.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 text-[10px] font-black tabular-nums">
                          {demand.length}
                        </span>
                      )}
                    </h3>
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showClosedDemand}
                        onChange={(e) => {
                          setShowClosedDemand(e.target.checked);
                          void loadDemand(e.target.checked);
                        }}
                        className="accent-[rgb(var(--color-accent))]"
                      />
                      Show closed
                    </label>
                  </div>
                  <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 mb-3 max-w-xl">
                    Courses people searched for and could not find. Each row counts distinct people,
                    not clicks, so the order is genuine demand. Marking one <em>planned</em> tells
                    the next admin it is in hand; <em>available</em> closes it once the course is in
                    the tree.
                  </p>

                  {demand.length === 0 ? (
                    <p className="text-[11px] text-[rgb(var(--color-text-dim))] light:text-slate-500 italic">
                      Nothing requested yet.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
                      <table className="w-full text-left text-sm min-w-[560px]">
                        <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                          <tr>
                            <th className="px-4 py-2.5">Course</th>
                            <th className="px-4 py-2.5 text-right">People</th>
                            <th className="px-4 py-2.5 text-right">Teachers</th>
                            <th className="px-4 py-2.5">Last asked</th>
                            <th className="px-4 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                          {demand.map((row) => (
                            <tr
                              key={row.id}
                              className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50 align-top"
                            >
                              <td className="px-4 py-2.5">
                                <span className="font-medium text-[rgb(var(--color-text-primary))] light:text-slate-800">
                                  {row.name}
                                </span>
                                {/* The most recent note is usually the useful
                                    part — "Year 11, starting Term 3" tells you
                                    more than the count does. */}
                                {row.notes[0]?.note && (
                                  <span className="block mt-0.5 text-[10px] italic text-[rgb(var(--color-text-dim))] light:text-slate-500 max-w-xs">
                                    “{row.notes[0].note}”
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                                {row.requesters}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                {row.teachers}
                              </td>
                              <td className="px-4 py-2.5 text-[11px] text-[rgb(var(--color-text-secondary))] light:text-slate-700 whitespace-nowrap">
                                {row.lastRequested
                                  ? new Date(row.lastRequested).toLocaleDateString('en-AU', {
                                      day: 'numeric',
                                      month: 'short',
                                    })
                                  : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(
                                    ['planned', 'available', 'declined'] as CourseRequestStatus[]
                                  ).map((status) => (
                                    <button
                                      key={status}
                                      onClick={() => handleDemandStatus(row, status)}
                                      disabled={isBusy || row.status === status}
                                      className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all disabled:opacity-100 ${
                                        row.status === status
                                          ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                                          : 'bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))] disabled:opacity-50'
                                      }`}
                                    >
                                      {status}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UsageDashboard;
