import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Zap, Hash, BarChart, X, RotateCcw, Cpu, Gauge } from 'lucide-react';
import { useApiMonitor } from '../hooks/useApiMonitor';
import { apiMonitor } from '../services/geminiService';
import { getSelectionSnapshot, setSelectedModel, subscribeAiConfig } from '../services/aiConfig';
import { modelsForRole, type AIRole } from '../services/aiModels';
import { isCurriculumRemote } from '../services/curriculumService';
import {
  fetchMyQuotaStatus,
  fetchRoleQuotas,
  setRoleQuota,
  setUserQuotaOverride,
  type QuotaStatus,
  type QuotaRole,
} from '../services/quotaService';

const ROLE_LABELS: Record<AIRole, string> = {
  reasoning: 'Marking & reasoning',
  basic: 'Generation & parsing',
};

const AiEngineSelector: React.FC = () => {
  const selection = useSyncExternalStore(
    subscribeAiConfig,
    getSelectionSnapshot,
    getSelectionSnapshot
  );

  return (
    <div className="mt-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]/30">
      <div className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 flex items-center gap-2">
        <Cpu className="w-3.5 h-3.5" />
        AI Engine
      </div>
      <div className="space-y-2">
        {(['reasoning', 'basic'] as AIRole[]).map((role) => (
          <label key={role} className="block">
            <span className="text-[10px] text-[rgb(var(--color-text-dim))]">
              {ROLE_LABELS[role]}
            </span>
            <select
              value={selection[role]}
              onChange={(e) => setSelectedModel(role, e.target.value)}
              className="mt-0.5 w-full text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 border border-[rgb(var(--color-border-secondary))]/40 text-[rgb(var(--color-text-secondary))] px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60 transition-colors"
            >
              {modelsForRole(role).map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-[rgb(var(--color-text-dim))]">
        Applies to new requests. Non-Gemini engines require their server-side API key.
      </p>
    </div>
  );
};

const QUOTA_ROLE_LABELS: Record<QuotaRole, string> = {
  admin: 'Admins',
  teacher: 'Teachers',
  student: 'Students',
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
  });
  const [overrideUser, setOverrideUser] = useState('');
  const [overrideLimit, setOverrideLimit] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, roleQuotas] = await Promise.all([fetchMyQuotaStatus(), fetchRoleQuotas()]);
        if (cancelled) return;
        setMyStatus(status);
        const next = { admin: '', teacher: '', student: '' } as Record<QuotaRole, string>;
        roleQuotas.forEach((q) => {
          next[q.role] = String(q.daily_limit);
        });
        setLimits(next);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : 'Failed to load quota data.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const report = (text: string) => setMessage(text);

  const handleSaveLimits = async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      for (const role of ['admin', 'teacher', 'student'] as QuotaRole[]) {
        const parsed = Number.parseInt(limits[role], 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${QUOTA_ROLE_LABELS[role]}: enter a non-negative number.`);
        }
        await setRoleQuota(role, parsed);
      }
      report('Group limits saved.');
    } catch (e) {
      report(e instanceof Error ? e.message : 'Failed to save limits.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetOverride = async (clear: boolean) => {
    const username = overrideUser.trim();
    if (!username) {
      report('Enter a username for the override.');
      return;
    }
    const parsed = clear ? null : Number.parseInt(overrideLimit, 10);
    if (!clear && (!Number.isFinite(parsed as number) || (parsed as number) < 0)) {
      report('Enter a non-negative daily limit, or use Clear.');
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      await setUserQuotaOverride(username, parsed);
      report(
        clear
          ? `Override cleared for ${username} (role default applies).`
          : `${username} now has a personal limit of ${parsed}/day.`
      );
    } catch (e) {
      report(e instanceof Error ? e.message : 'Failed to update the override.');
    } finally {
      setIsBusy(false);
    }
  };

  const inputClass =
    'w-16 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 border border-[rgb(var(--color-border-secondary))]/40 text-[rgb(var(--color-text-secondary))] px-2 py-1 outline-none focus:border-[rgb(var(--color-accent))]/60 transition-colors text-right font-mono';

  return (
    <div className="mt-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]/30">
      <div className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 flex items-center gap-2">
        <Gauge className="w-3.5 h-3.5" />
        Daily AI Quotas
      </div>

      {myStatus && (
        <div className="mb-3">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-[rgb(var(--color-text-secondary))]">My usage today</span>
            <span className="font-mono font-bold text-white">
              {myStatus.used}/{myStatus.limit}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all ${myStatus.remaining === 0 ? 'bg-red-500' : 'bg-[rgb(var(--color-accent))]'}`}
              style={{
                width: `${myStatus.limit > 0 ? Math.min(100, (myStatus.used / myStatus.limit) * 100) : 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {(['admin', 'teacher', 'student'] as QuotaRole[]).map((role) => (
          <label key={role} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[rgb(var(--color-text-dim))]">
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
        className="w-full mt-2 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 transition-all disabled:opacity-50"
      >
        Save Group Limits
      </button>

      <div className="mt-3 pt-3 border-t border-[rgb(var(--color-border-secondary))]/20">
        <span className="text-[10px] text-[rgb(var(--color-text-dim))] block mb-1.5">
          Per-user override (beats the group limit)
        </span>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="username"
            aria-label="Override username"
            value={overrideUser}
            onChange={(e) => setOverrideUser(e.target.value)}
            className="flex-1 min-w-0 text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 border border-[rgb(var(--color-border-secondary))]/40 text-[rgb(var(--color-text-secondary))] px-2 py-1 outline-none focus:border-[rgb(var(--color-accent))]/60"
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
            className="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-secondary))] hover:text-white transition-all disabled:opacity-50 border border-[rgb(var(--color-border-secondary))]/30"
          >
            Set Override
          </button>
          <button
            onClick={() => handleSetOverride(true)}
            disabled={isBusy}
            className="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-muted))] hover:text-white transition-all disabled:opacity-50 border border-[rgb(var(--color-border-secondary))]/30"
          >
            Clear
          </button>
        </div>
      </div>

      {message && (
        <p
          className="mt-2 text-[10px] leading-relaxed text-[rgb(var(--color-text-secondary))]"
          role="status"
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
    <div className="fixed bottom-4 right-4 z-[500] select-none font-sans">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="
            flex items-center gap-4 px-4 py-2 rounded-full 
            bg-[rgb(var(--color-bg-surface-elevated))]/80 backdrop-blur-md 
            border border-[rgb(var(--color-border-accent))]/30
            shadow-lg hover:shadow-[rgb(var(--color-accent))]/20 hover:border-[rgb(var(--color-border-accent))]/60
            transition-all duration-300 animate-fade-in 
            text-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent-glow))]
            hover-lift
          "
          title="Show API Usage Details"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Zap className="w-3.5 h-3.5" />
            <span className="font-mono">{sessionCalls}</span>
          </div>
          <div className="w-px h-3 bg-[rgb(var(--color-border-secondary))]" />
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <Hash className="w-3.5 h-3.5" />
            <span className="font-mono">{formatTokens(sessionTokens)}</span>
          </div>
        </button>
      ) : (
        <div
          className="
            w-72 p-5 rounded-2xl 
            bg-[rgb(var(--color-bg-surface-elevated))]/90 backdrop-blur-xl 
            border border-[rgb(var(--color-border-accent))]/30
            shadow-2xl animate-fade-in-up ring-1 ring-[rgb(var(--color-accent))]/10
          "
          role="dialog"
          aria-labelledby="api-monitor-title"
        >
          <div className="flex justify-between items-center mb-4 border-b border-[rgb(var(--color-border-secondary))]/50 pb-3">
            <h3
              id="api-monitor-title"
              className="flex items-center gap-2 text-sm font-black text-[rgb(var(--color-accent))] uppercase tracking-wide"
            >
              <BarChart className="w-4 h-4" />
              API Telemetry
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-muted))] hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 rounded-xl p-3 border border-[rgb(var(--color-border-secondary))]/30">
              <div className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Current Session
              </div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] font-medium">
                  Requests
                </span>
                <span className="font-mono text-sm font-bold text-white">{sessionCalls}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-secondary))] font-medium">
                  Tokens
                </span>
                <span className="font-mono text-sm font-bold text-[rgb(var(--color-accent))]">
                  {formatTokens(sessionTokens)}
                </span>
              </div>
            </div>

            <div className="px-3 pt-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[rgb(var(--color-text-dim))]">Lifetime Calls</span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
                  {totalCalls}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[rgb(var(--color-text-dim))]">Lifetime Tokens</span>
                <span className="font-mono text-xs font-semibold text-[rgb(var(--color-text-secondary))]">
                  {formatTokens(totalTokens)}
                </span>
              </div>
            </div>
          </div>

          <AiEngineSelector />

          {isCurriculumRemote() && <AiQuotaPanel />}

          <button
            onClick={handleResetSession}
            className="w-full mt-4 text-xs font-bold flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-secondary))] hover:text-white hover:bg-[rgb(var(--color-border-secondary))] transition-all active:scale-95 hover:shadow-md border border-[rgb(var(--color-border-secondary))]/30"
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
