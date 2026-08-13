import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, BarChart3, RefreshCw, Users, Layers, Gauge, Info, AlertTriangle } from 'lucide-react';
import {
  fetchClassAnalytics,
  fetchClassCohort,
  fetchMyClasses,
  type ClassAnalytics,
  type ClassCohort,
  type TeachingClass,
} from '../../services/responseService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { commandTerms } from '../../data/commandTerms';
import { getTierBandConfig } from '../../utils/renderUtils';
import { rankByWeakness, formatBand, formatMarkFrac, NO_TIER } from '../../utils/classAnalytics';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { PromptVerb } from '../../types';
import LoadingIndicator from '../LoadingIndicator';
import CohortBreakdown from './CohortBreakdown';

interface ClassInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const WINDOWS = [30, 90, 365] as const;
type Dimension = 'verb' | 'topic' | 'student';
const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'verb', label: 'By verb' },
  { id: 'topic', label: 'By topic' },
  { id: 'student', label: 'By student' },
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
      <div className="text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500 mt-0.5">
        {sub}
      </div>
    )}
  </div>
);

/** Marks-lost bar; amber past a third, red past two-thirds. The number is
 *  always alongside as text, so state is never colour-alone. A null percentage
 *  means the row has no mark data — shown as an em dash, never as 0%, because
 *  "nothing known" is not "nothing lost". */
const StruggleBar: React.FC<{ pct: number | null }> = ({ pct }) => {
  if (pct == null) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-500 italic">
          no marks recorded
        </span>
      </div>
    );
  }
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
 * and a per-command-verb table ranked weakest-first by the share of available
 * marks lost. (Band ≤ 3 is shown for reference but is NOT the ranking key — a
 * question's band is capped at its verb's cognitive tier, so low-tier verbs read
 * 100% however well they were answered. See utils/classAnalytics.ts.) Reads the
 * reviewer-gated get_class_analytics RPC, which aggregates
 * persisted responses server-side — no raw student work is transferred. Gated
 * to reviewers + Supabase mode.
 */
const ClassInsightsModal: React.FC<ClassInsightsModalProps> = ({ isOpen, onClose, showToast }) => {
  const remote = isCurriculumRemote();
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [dimension, setDimension] = useState<Dimension>('verb');
  const [data, setData] = useState<ClassAnalytics | null>(null);
  const [cohort, setCohort] = useState<ClassCohort | null>(null);
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  // null = every class the caller teaches (an admin's whole database).
  const [classId, setClassId] = useState<string | null>(null);
  // Monotonic id of the newest in-flight load; see `load` below.
  const requestSeq = useRef(0);

  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);

  const load = useCallback(async () => {
    if (!remote) {
      setIsLoading(false);
      return;
    }
    // Every control here — window, class, dimension — retriggers the fetch, and
    // a teacher clicking through them leaves several in flight at once. Without
    // a sequence guard the LAST RESPONSE wins rather than the last request, so a
    // slow 7-day call can land after a fast 90-day one and paint 7-day numbers
    // under a "90 days" heading. On the class picker the same race mislabels one
    // class's cohort as another's, which on a panel whose entire purpose is
    // per-class scoping is a correctness failure, not a flicker.
    const seq = ++requestSeq.current;
    const current = () => seq === requestSeq.current;

    setIsLoading(true);
    try {
      // The per-student breakdown is a heavier payload, so it is only fetched
      // while that dimension is actually on screen.
      const [analytics, breakdown] = await Promise.all([
        fetchClassAnalytics(days, classId),
        dimension === 'student' ? fetchClassCohort(days, classId) : Promise.resolve(null),
      ]);
      if (!current()) return;
      setData(analytics);
      if (breakdown) setCohort(breakdown);
    } catch (e) {
      // A superseded request's failure is not the user's problem — the request
      // they are actually waiting on is still running.
      if (!current()) return;
      showToast(e instanceof Error ? e.message : 'Failed to load class analytics.', 'error');
    } finally {
      // Only the newest request may clear the spinner; an older one finishing
      // first would otherwise report "done" while the live call is still out.
      if (current()) setIsLoading(false);
    }
  }, [remote, days, classId, dimension, showToast]);

  // Drop the previous class's payloads the moment the scope changes, so the
  // spinner shows rather than one class's figures sitting under another's name
  // while the new request is in flight — or indefinitely, if it fails.
  useEffect(() => {
    setData(null);
    setCohort(null);
  }, [classId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // The class list is independent of the window/dimension controls, so it loads
  // once per open rather than on every filter change.
  useEffect(() => {
    if (!isOpen || !remote) return;
    let cancelled = false;
    fetchMyClasses()
      .then((rows) => {
        if (!cancelled) setClasses(rows);
      })
      .catch(() => {
        /* Non-fatal: without a list the view stays on "all my classes". */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, remote]);

  const rows = useMemo(() => {
    if (dimension === 'student') return [];
    const source = dimension === 'verb' ? data?.byVerb : data?.byTopic;
    return rankByWeakness(source ?? [], dimension === 'verb' ? tierOf : NO_TIER);
  }, [data, dimension]);
  const totals = data?.totals;

  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Class insights"
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
              {/* Class scope selector — only when the caller teaches more than
                  one, since a single class needs no choosing. */}
              {classes.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500">
                    Class
                  </span>
                  <button
                    onClick={() => setClassId(null)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                      classId === null
                        ? 'bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border-[rgb(var(--color-accent))]/30'
                        : 'bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
                    }`}
                  >
                    All my classes
                  </button>
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClassId(c.id)}
                      title={`${c.school} · ${c.students} student${c.students === 1 ? '' : 's'}`}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        classId === c.id
                          ? 'bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border-[rgb(var(--color-accent))]/30'
                          : 'bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Window + dimension selectors */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500">
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-dim))] light:text-slate-500">
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
                    <StatTile
                      icon={<Gauge className="w-3.5 h-3.5" />}
                      label="Marks Achieved"
                      value={formatMarkFrac(totals?.avg_mark_frac)}
                      sub="mean share of available marks"
                    />
                  </div>

                  {dimension === 'student' ? (
                    <CohortBreakdown
                      cohort={cohort ?? { byStudent: [], weekly: [], daily: [], weeks: 0 }}
                      days={days}
                      tierOf={tierOf}
                    />
                  ) : (
                    /* Per-dimension weakness table */
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
                        <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
                          <table className="w-full text-left text-sm min-w-[500px]">
                            <thead className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-[10px] font-bold">
                              <tr>
                                <th className="px-4 py-2.5">
                                  {dimension === 'verb' ? 'Verb' : 'Topic'}
                                </th>
                                <th className="px-4 py-2.5 text-right">Attempts</th>
                                <th className="px-4 py-2.5 text-right">Students</th>
                                <th className="px-4 py-2.5 text-right">Avg Band</th>
                                <th className="px-4 py-2.5 text-right">Band ≤ 3</th>
                                <th className="px-4 py-2.5">Marks lost</th>
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
                                          B{r.tier}
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
                                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-dim))] light:text-slate-500">
                                      {r.lowBandPct}%
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <StruggleBar pct={r.markLostPct} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                        Ranked weakest-first by the share of available marks lost. Band ≤ 3 is shown
                        for reference only: a question&rsquo;s band is capped at its verb&rsquo;s
                        tier, so low-tier verbs sit at 100% however well they were answered.
                        Aggregated server-side and scoped to the classes you teach — individual
                        student work is never shown here.
                      </p>
                    </section>
                  )}
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
