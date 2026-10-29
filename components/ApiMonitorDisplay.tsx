import React, { useState, useEffect } from 'react';
import { Zap, Hash, BarChart, X, RotateCcw, Gauge } from 'lucide-react';
import { useApiMonitor } from '../hooks/useApiMonitor';
import { apiMonitor } from '../services/geminiService';
import { isCurriculumRemote } from '../services/curriculumService';
import AiEngineSelector from './admin/AiEngineSelector';
import {
  fetchMyQuotaStatus,
  fetchRoleQuotas,
  setRoleQuota,
  setUserQuotaOverride,
  type QuotaStatus,
  type QuotaRole,
  QUOTA_ROLES,
} from '../services/quotaService';

const QUOTA_ROLE_LABELS: Record<QuotaRole, string> = {
  admin: 'Admins',
  teacher: 'Teachers',
  student: 'Students',
  parent: 'Parents',
};

/**
 * Admin console for the server-side AI quotas (per role/group, with per-user
 * overrides — supabase/schema.sql §11). Only rendered in remote mode: without
 * Supabase there is no identity to meter, so the proxy doesn't enforce.
 */
const AiQuotaPanel: React.FC = () => {
  const [myStatus, setMyStatus] = useState<QuotaStatus | null>(null);
  const [limits, setLimits] = useState<Record<QuotaRole, string>>({
    admin: '',
    teacher: '',
    student: '',
    parent: '',
  });
  const [overrideUser, setOverrideUser] = useState('');
  const [overrideLimit, setOverrideLimit] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, roleQuotas] = await Promise.all([fetchMyQuotaStatus(), fetchRoleQuotas()]);
        if (cancelled) return;
        setMyStatus(status);
        const next = { admin: '', teacher: '', student: '', parent: '' } as Record<
          QuotaRole,
          string
        >;
        roleQuotas.forEach((q) => {
          next[q.role] = String(q.daily_limit);
        });
        setLimits(next);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : 'Failed to load quota data.');
          setMessageIsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const report = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const handleSaveLimits = async () => {
    setIsBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      // Check every group before writing any, so one bad field saves nothing.
      const parsedLimits = QUOTA_ROLES.map((role) => {
        const parsed = Number.parseInt(limits[role], 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${QUOTA_ROLE_LABELS[role]}: enter a non-negative number.`);
        }
        return { role, limit: parsed };
      });
      for (const { role, limit } of parsedLimits) {
        await setRoleQuota(role, limit);
      }
      report('Group limits saved.');
    } catch (e) {
      report(e instanceof Error ? e.message : 'Failed to save limits.', true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetOverride = async (clear: boolean) => {
    const username = overrideUser.trim();
    if (!username) {
      report('Enter a username for the override.', true);
      return;
    }
    const parsed = clear ? null : Number.parseInt(overrideLimit, 10);
    if (!clear && (!Number.isFinite(parsed as number) || (parsed as number) < 0)) {
      report('Enter a non-negative daily limit, or use Clear.', true);
      return;
    }
    setIsBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      await setUserQuotaOverride(username, parsed);
      report(
        clear
          ? `Override cleared for ${username} (role default applies).`
          : `${username} now has a personal limit of ${parsed}/day.`
      );
    } catch (e) {
      report(e instanceof Error ? e.message : 'Failed to update the override.', true);
    } finally {
      setIsBusy(false);
    }
  };

  const inputClass =
    'w-16 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 text-[rgb(var(--color-text-secondary))] light:text-slate-700 px-2 py-1 outline-none focus:border-[rgb(var(--color-accent))]/60 transition-colors text-right font-mono';

  return (
    <div className="mt-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200">
      <div className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-600 mb-2 flex items-center gap-2">
        <Gauge className="w-3.5 h-3.5" />
        Daily AI Quotas
      </div>

      {myStatus && (
        <div className="mb-3">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-[rgb(var(--color-text-secondary))] light:text-slate-600">
              My usage today
            </span>
            <span className="font-mono font-bold text-white light:text-slate-900">
              {myStatus.used}/{myStatus.limit}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 light:bg-slate-200 overflow-hidden border border-white/5 light:border-slate-300">
            <div
              className={`h-full transition-all ${myStatus.remaining === 0 ? 'bg-red-500' : 'bg-[rgb(var(--color-accent))]'}`}
              style={{
                width: `${myStatus.limit > 0 ? Math.min(100, (myStatus.used / myStatus.limit) * 100) : 100}%`,
              }}
            />
          </div>

          {/* The school's shared pool (schema §12) — every member's calls
              draw from it, so it sits right under the personal bar. Only
              shown when the school actually has a pooled cap. */}
          {myStatus.school && myStatus.school.limit !== null && (
            <div className="mt-2">
              <div className="flex justify-between items-center text-xs mb-1">
                <span
                  className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 truncate mr-2"
                  title={`Shared daily pool for ${myStatus.school.name}`}
                >
                  {myStatus.school.name} (shared)
                </span>
                <span className="font-mono font-bold text-white light:text-slate-900">
                  {myStatus.school.used}/{myStatus.school.limit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/40 light:bg-slate-200 overflow-hidden border border-white/5 light:border-slate-300">
                <div
                  className={`h-full transition-all ${myStatus.school.used >= myStatus.school.limit ? 'bg-red-500' : 'bg-sky-500'}`}
                  style={{
                    width: `${myStatus.school.limit > 0 ? Math.min(100, (myStatus.school.used / myStatus.school.limit) * 100) : 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {QUOTA_ROLES.map((role) => (
          <label key={role} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-600">
              {QUOTA_ROLE_LABELS[role]}
            </span>
            <input
              type="number"
              min={0}
              aria-label={`${QUOTA_ROLE_LABELS[role]} daily limit`}
              value={limits[role]}
              onChange={(e) => setLimits((prev) => ({ ...prev, [role]: e.target.value }))}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <button
        onClick={handleSaveLimits}
        disabled={isBusy}
        className="t-label w-full mt-2 py-1.5 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 transition-all disabled:opacity-50"
      >
        Save Group Limits
      </button>

      <div className="mt-3 pt-3 border-t border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200">
        <span className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-600 block mb-1.5">
          Per-user override (beats the group limit)
        </span>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="username"
            aria-label="Override username"
            value={overrideUser}
            onChange={(e) => setOverrideUser(e.target.value)}
            className="flex-1 min-w-0 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 text-[rgb(var(--color-text-secondary))] light:text-slate-700 px-2 py-1 outline-none focus:border-[rgb(var(--color-accent))]/60"
          />
          <input
            type="number"
            min={0}
            placeholder="limit"
            aria-label="Override daily limit"
            value={overrideLimit}
            onChange={(e) => setOverrideLimit(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={() => handleSetOverride(false)}
            disabled={isBusy}
            className="t-label flex-1 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:text-white light:hover:text-slate-800 transition-all disabled:opacity-50 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300"
          >
            Set Override
          </button>
          <button
            onClick={() => handleSetOverride(true)}
            disabled={isBusy}
            className="t-label flex-1 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-white light:hover:text-slate-800 transition-all disabled:opacity-50 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300"
          >
            Clear
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`mt-2 text-[10px] leading-relaxed ${
            messageIsError
              ? 'text-red-400 light:text-red-600'
              : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600'
          }`}
          role={messageIsError ? 'alert' : 'status'}
          aria-live={messageIsError ? 'assertive' : 'polite'}
        >
          {message}
        </p>
      )}
    </div>
  );
};

const formatTokens = (tokens: number): string => {
  if (tokens > 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
};

const ApiMonitorDisplay: React.FC = () => {
  const { sessionCalls, sessionTokens, totalCalls, totalTokens } = useApiMonitor();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleResetSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    apiMonitor.resetSession();
  };

  return (
    // Under every dialog (z-usage-pill, tailwind.config.js): it is a counter for
    // an admin, and over a dialog on a phone it covered the primary action.
    //
    // On a phone the closed button tucks half off the right edge, a tab in the page's
    // 16px gutter. Whole, it sat over the right of whatever card was beneath it (a
    // marker's commentary, an answer) for as long as the page was open.
    <div
      className={`fixed bottom-4 right-4 z-usage-pill select-none font-sans ${
        isExpanded ? '' : 'max-sm:right-0 max-sm:translate-x-1/2'
      }`}
    >
      {!isExpanded ? (
        // On a phone the chip is a 44px round button holding the bolt alone: its
        // two counts sat over the content beneath it at 390px. The counts stay in
        // the aria-label, so a screen reader still gets them.
        <button
          onClick={() => setIsExpanded(true)}
          aria-label={`Show API usage details: ${sessionCalls} requests, ${formatTokens(sessionTokens)} tokens`}
          className="
            flex items-center justify-center gap-4 h-11 w-11 p-0 sm:h-auto sm:w-auto sm:px-4 sm:py-2 rounded-full
            bg-[rgb(var(--color-bg-surface-elevated))]/80 light:bg-surface-elevated/95 backdrop-blur-md
            border border-[rgb(var(--color-border-accent))]/30 light:border-slate-300
            shadow-lg hover:shadow-[rgb(var(--color-accent))]/20 hover:border-[rgb(var(--color-border-accent))]/60
            transition-all duration-300 animate-fade-in
            text-[rgb(var(--color-accent))] light:text-sky-700
            hover:text-[rgb(var(--color-accent-glow))]
            hover-lift
          "
          title="Show API Usage Details"
        >
          {/* On a phone the bolt sits in the visible half of the tab. */}
          <div className="flex items-center gap-1.5 text-xs font-bold max-sm:-translate-x-2.5">
            <Zap className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono max-sm:hidden">{sessionCalls}</span>
          </div>
          <div className="max-sm:hidden w-px h-3 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
          <div className="max-sm:hidden flex items-center gap-1.5 text-xs font-bold">
            <Hash className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono">{formatTokens(sessionTokens)}</span>
          </div>
        </button>
      ) : (
        <div
          className="
            w-72 p-5 rounded-2xl
            bg-[rgb(var(--color-bg-surface-elevated))]/90 light:bg-surface-elevated/95 backdrop-blur-xl
            border border-[rgb(var(--color-border-accent))]/30 light:border-slate-300
            shadow-lg animate-fade-in-up ring-1 ring-[rgb(var(--color-accent))]/10
          "
          role="dialog"
          aria-labelledby="api-monitor-title"
        >
          <div className="flex justify-between items-center mb-4 border-b border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 pb-3">
            <h3
              id="api-monitor-title"
              className="flex items-center gap-2 text-sm font-black text-[rgb(var(--color-accent))]"
            >
              <BarChart className="w-4 h-4" />
              API Telemetry
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 text-[rgb(var(--color-text-muted))] hover:text-white light:hover:text-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 rounded-xl p-3 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200">
              <div className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-600 mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Current Session
              </div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                  Requests
                </span>
                <span className="font-mono text-sm font-bold text-white light:text-slate-900">
                  {sessionCalls}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                  Tokens
                </span>
                <span className="font-mono text-sm font-bold text-[rgb(var(--color-accent))]">
                  {formatTokens(sessionTokens)}
                </span>
              </div>
            </div>

            <div className="px-3 pt-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600">
                  Lifetime Calls
                </span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                  {totalCalls}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600">
                  Lifetime Tokens
                </span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                  {formatTokens(totalTokens)}
                </span>
              </div>
            </div>
          </div>

          <AiEngineSelector className="mt-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]/30" />

          {isCurriculumRemote() && <AiQuotaPanel />}

          <button
            onClick={handleResetSession}
            className="w-full mt-4 text-xs font-bold flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-100 text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:text-white light:hover:text-slate-800 hover:bg-white/10 light:hover:bg-slate-200 transition-all active:scale-[0.98] hover:shadow-lg border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Session Metrics
          </button>
        </div>
      )}
    </div>
  );
};

export default ApiMonitorDisplay;
