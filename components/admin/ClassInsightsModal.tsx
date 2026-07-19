import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, BarChart3, RefreshCw, Users, Layers, Gauge, Info, AlertTriangle } from 'lucide-react';
import { fetchClassAnalytics, type ClassAnalytics } from '../../services/responseService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { commandTerms } from '../../data/commandTerms';
import { getTierBandConfig } from '../../utils/renderUtils';
import { rankByWeakness, formatBand, NO_TIER } from '../../utils/classAnalytics';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { PromptVerb } from '../../types';
import LoadingIndicator from '../LoadingIndicator';

interface ClassInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const WINDOWS = [30, 90, 365] as const;
type Dimension = 'verb' | 'topic';
const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'verb', label: 'By verb' },
  { id: 'topic', label: 'By topic' },
];

/** Cognitive tier for a verb, or null when it isn't a known command term.
 *  The RPC returns free-form verb strings (incl. "Unspecified"); the Map is
 *  keyed by PromptVerb, so an unknown key simply misses and yields null. */
const tierOf = (verb: string): number | null => commandTerms.get(verb as PromptVerb)?.tier ?? null;

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({
  icon,
  label,
  value,
  sub,
}) => (
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

/** Struggling-rate bar; amber past a third, red past two-thirds. The number is
 *  always alongside as text, so state is never colour-alone. */
const StruggleBar: React.FC<{ pct: number }> = ({ pct }) => {
  const tone = pct >= 66 ? 'bg-red-500' : pct >= 33 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-black/40 light:bg-slate-200 overflow-hidden border border-white/5 light:border-slate-300">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 tabular-nums">
        {pct}%
      </span>
    </div>
  );
};

/**
 * Teacher/admin view of where a cohort is struggling: cohort headline numbers
 * and a per-command-verb table ranked weakest-first (highest share of band ≤ 3
 * attempts). Reads the reviewer-gated get_class_analytics RPC, which aggregates
 * persisted responses server-side — no raw student work is transferred. Gated
 * to reviewers + Supabase mode.
 */
const ClassInsightsModal: React.FC<ClassInsightsModalProps> = ({ isOpen, onClose, showToast }) => {
  const remote = isCurriculumRemote();
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [dimension, setDimension] = useState<Dimension>('verb');
  const [data, setData] = useState<ClassAnalytics | null>(null);

  useEscapeKey(isOpen, onClose);

  const load = useCallback(async () => {
    if (!remote) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setData(await fetchClassAnalytics(days));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load class analytics.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [remote, days, showToast]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const rows = useMemo(() => {
    const source = dimension === 'verb' ? data?.byVerb : data?.byTopic;
    return rankByWeakness(source ?? [], dimension === 'verb' ? tierOf : NO_TIER);
  }, [data, dimension]);
  const totals = data?.totals;

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 shadow-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                Class Insights
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                Where the cohort is struggling, by verb or topic
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={isLoading || !remote}
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
                Class analytics requires Supabase.
              </p>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 max-w-sm mx-auto mt-1">
                Student responses are only persisted centrally in Supabase mode, so there is nothing
                to aggregate in local mode.
              </p>
            </div>
          ) : (
            <>
              {/* Window + dimension selectors */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-400">
                    Window
                  </span>
                  {WINDOWS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setDays(w)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        days === w
                          ? 'bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border-[rgb(var(--color-accent))]/30'
                          : 'bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
                      }`}
                    >
                      {w === 365 ? '1y' : `${w}d`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-400">
                    Break down
                  </span>
                  {DIMENSIONS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDimension(d.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        dimension === d.id
                          ? 'bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border-[rgb(var(--color-accent))]/30'
                          : 'bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <LoadingIndicator messages={['Loading class insights…']} duration={2} />
                </div>
              ) : (
                <>
                  {/* Headline numbers */}
                  <div className="flex flex-wrap gap-3">
                    <StatTile
                      icon={<Layers className="w-3.5 h-3.5" />}
                      label="Attempts"
                      value={String(totals?.total_attempts ?? 0)}
                      sub={`marked responses · last ${days === 365 ? 'year' : `${days} days`}`}
                    />
                    <StatTile
                      icon={<Users className="w-3.5 h-3.5" />}
                      label="Active Students"
                      value={String(totals?.active_students ?? 0)}
                      sub="submitted at least one"
                    />
                    <StatTile
                      icon={<Gauge className="w-3.5 h-3.5" />}
                      label="Avg Band"
                      value={formatBand(totals?.avg_band ?? null)}
                      sub="across all attempts"
                    />
                  </div>

                  {/* Per-dimension weakness table */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {dimension === 'verb' ? 'Struggle by command verb' : 'Struggle by topic'}
                    </h3>
                    {rows.length === 0 ? (
                      <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic py-4">
                        No marked responses in this window yet.
                      </p>
                    ) : (
                      <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                            <tr>
                              <th className="px-4 py-2.5">
                                {dimension === 'verb' ? 'Verb' : 'Topic'}
                              </th>
                              <th className="px-4 py-2.5 text-right">Attempts</th>
                              <th className="px-4 py-2.5 text-right">Students</th>
                              <th className="px-4 py-2.5 text-right">Avg Band</th>
                              <th className="px-4 py-2.5">Struggling (band ≤ 3)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                            {rows.map((r) => {
                              const cfg = r.tier ? getTierBandConfig(r.tier) : null;
                              return (
                                <tr
                                  key={r.label}
                                  className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50"
                                >
                                  <td className="px-4 py-2.5">
                                    <span className="text-[rgb(var(--color-text-primary))] light:text-slate-800 font-semibold">
                                      {r.label}
                                    </span>
                                    {cfg && (
                                      <span
                                        className={`ml-2 px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                                      >
                                        Tier {r.tier}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                    {r.attempts}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                    {r.students}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                    {formatBand(r.avg_band)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <StruggleBar pct={r.lowBandPct} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
                      Ranked weakest-first by the share of attempts scoring band 3 or below.
                      Aggregated server-side — individual student work is never shown here.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ClassInsightsModal;
