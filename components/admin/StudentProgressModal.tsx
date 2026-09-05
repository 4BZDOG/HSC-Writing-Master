import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ToastType } from '../../hooks/useToast';
import { createPortal } from 'react-dom';
import { X, LineChart, Search, Users, Layers, Gauge } from 'lucide-react';
import {
  fetchStudentProgress,
  fetchResponseStudents,
  type StudentProgress,
  type RosterStudent,
  type TrendPoint,
} from '../../services/responseService';
import { isCurriculumRemote } from '../../services/curriculumService';
import { commandTerms, tierShortLabel } from '../../data/commandTerms';
import { getTierBandConfig } from '../../utils/renderUtils';
import {
  foldVerbsIntoTiers,
  rankByWeakness,
  formatBand,
  formatMarkFrac,
  formatLastActive,
  sparklinePoints,
  type TierProfile,
} from '../../utils/classAnalytics';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { PromptVerb } from '../../types';
import LoadingIndicator from '../LoadingIndicator';

interface StudentProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: ToastType) => void;
}

const WINDOWS = [30, 90, 365] as const;

const tierOf = (verb: string): number | null => commandTerms.get(verb as PromptVerb)?.tier ?? null;

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({
  icon,
  label,
  value,
  sub,
}) => (
  <div className="flex-1 min-w-[130px] p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
    <div className="t-label flex items-center gap-2 text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-1.5">
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

/**
 * A single cognitive-tier row: a bar filled to the share of available MARKS
 * earned at this tier, with the mark share, band and attempt count alongside as
 * text so nothing is colour-alone.
 *
 * The bar used to be filled to `avgBand / 6`, which was not a measure of the
 * student at all: the Verb Gate caps a tier's band at the tier number, so tier 1
 * could never exceed 1/6 of the bar and tier 6 could reach all of it. Every
 * student — including one scoring full marks everywhere — drew the same rising
 * staircase, which reads as "weak on recall, strong on evaluation" for everyone.
 * Marks are comparable across tiers; bands are not.
 */
const TierRow: React.FC<{ profile: TierProfile }> = ({ profile }) => {
  const cfg = getTierBandConfig(profile.tier);
  const pct = profile.markFrac != null ? Math.min(100, Math.max(0, profile.markFrac * 100)) : 0;
  const attempted = profile.attempts > 0;
  const measured = attempted && profile.markFrac != null;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[11px] font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700">
        <span className="text-[rgb(var(--color-text-dim))] light:text-slate-500">
          B{profile.tier}
        </span>{' '}
        {tierShortLabel(profile.tier)}
      </span>
      <div className="flex-1 h-3 rounded-full bg-black/30 light:bg-slate-100 overflow-hidden border border-white/5 light:border-slate-200">
        {measured && (
          <div
            className={`h-full rounded-full bg-gradient-to-r ${cfg.gradient} transition-all`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-12 text-right font-mono text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-800 tabular-nums">
        {formatMarkFrac(profile.markFrac)}
      </span>
      <span className="w-12 text-right font-mono text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 tabular-nums">
        {attempted ? `B${formatBand(profile.avgBand)}` : '—'}
      </span>
      <span className="w-16 text-right text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 tabular-nums">
        {profile.attempts} {profile.attempts === 1 ? 'try' : 'tries'}
      </span>
    </div>
  );
};

const TREND_W = 320;
const TREND_H = 60;

/** Band-over-time sparkline from the per-attempt history (oldest→newest). The
 *  raw band sequence is exposed via aria-label, so it isn't colour/shape-alone. */
const BandTrend: React.FC<{ points: TrendPoint[] }> = ({ points }) => {
  const bands = points.map((p) => p.band).filter((b): b is number => b != null);
  if (bands.length < 2) return null;

  const line = sparklinePoints(bands, { width: TREND_W, height: TREND_H, min: 1, max: 6 });
  const coords = line.split(' ').map((s) => s.split(',').map(Number) as [number, number]);
  const first = bands[0];
  const last = bands[bands.length - 1];
  const delta = last - first;
  const tone =
    delta > 0
      ? 'text-emerald-500'
      : delta < 0
        ? 'text-red-500'
        : 'text-[rgb(var(--color-text-muted))]';
  const y3 = TREND_H - ((3 - 1) / 5) * TREND_H; // band-3 (struggling) reference line

  return (
    <div>
      <svg
        viewBox={`0 0 ${TREND_W} ${TREND_H}`}
        width="100%"
        role="img"
        aria-label={`Band trend across ${bands.length} attempts, oldest to newest: ${bands.join(', ')}`}
        className="rounded-lg bg-black/20 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-200"
      >
        <line
          x1={0}
          y1={y3}
          x2={TREND_W}
          y2={y3}
          strokeDasharray="4 4"
          className="stroke-[rgb(var(--color-border-secondary))]"
        />
        <polyline
          points={line}
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-[rgb(var(--color-accent))]"
        />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} className="fill-[rgb(var(--color-accent))]" />
        ))}
      </svg>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
        <span>
          Band {formatBand(first)} → {formatBand(last)}
        </span>
        <span className={`font-bold ${tone}`}>
          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '● no change'}
        </span>
        <span>· {bands.length} attempts</span>
      </div>
    </div>
  );
};

/**
 * Per-student progress across the six cognitive tiers (teacher/admin view). A
 * teacher enters a username; the reviewer-gated get_student_progress RPC returns
 * that student's per-verb aggregates (server-side, no raw work), which are
 * folded into the tier ladder here. Gated to reviewers + Supabase mode.
 */
const StudentProgressModal: React.FC<StudentProgressModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const remote = isCurriculumRemote();
  const [username, setUsername] = useState('');
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<StudentProgress | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  // Monotonic id of the newest in-flight lookup; see `load` below.
  const lookupSeq = useRef(0);

  useEscapeKey(isOpen && !isLoading, onClose);
  useScrollLock(isOpen);

  const load = useCallback(
    async (name: string, window: number) => {
      const trimmed = name.trim();
      if (!trimmed) {
        showToast('Enter a student username.', 'info');
        return;
      }
      setUsername(trimmed);

      // Roster entries and the window buttons are one click each, so two
      // lookups are easily in flight at once. Without a sequence guard the last
      // RESPONSE wins rather than the last request: click Aisha, then Jayden,
      // and if Aisha's call is the slower one you end up reading Aisha's
      // progress when you asked for Jayden's. (The panel labels itself from
      // `data.username`, so nothing is shown under the wrong name — but it is
      // still not the student the teacher asked for.)
      const seq = ++lookupSeq.current;
      const current = () => seq === lookupSeq.current;

      setIsLoading(true);
      try {
        const progress = await fetchStudentProgress(trimmed, window);
        if (!current()) return;
        setData(progress);
      } catch (e) {
        // A lookup the user has already moved past has no error worth raising:
        // the one they are waiting on is still running.
        if (!current()) return;
        setData(null);
        showToast(e instanceof Error ? e.message : 'Failed to load student progress.', 'error');
      } finally {
        if (current()) setIsLoading(false);
      }
    },
    [showToast]
  );

  // The roster (who to pick from) refreshes with the window; it's a separate,
  // non-blocking fetch so a slow/empty roster never holds up a direct lookup.
  const loadRoster = useCallback(
    async (window: number) => {
      if (!remote) return;
      setIsRosterLoading(true);
      try {
        setRoster(await fetchResponseStudents(window));
      } catch {
        setRoster([]);
      } finally {
        setIsRosterLoading(false);
      }
    },
    [remote]
  );

  useEffect(() => {
    if (isOpen) loadRoster(days);
  }, [isOpen, days, loadRoster]);

  const tiers = useMemo(() => foldVerbsIntoTiers(data?.byVerb ?? [], tierOf), [data]);
  const verbRows = useMemo(() => rankByWeakness(data?.byVerb ?? [], tierOf), [data]);
  const trendBands = useMemo(
    () => (data?.trend ?? []).filter((p) => p.band != null).length,
    [data]
  );
  const totals = data?.totals;
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Student progress"
      className="fixed inset-0 z-modal-elevated bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-lg w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg flex items-center justify-center">
              <LineChart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                Student Progress
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                One student across the six verb groups
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar space-y-6">
          {!remote ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-[rgb(var(--color-text-muted))] light:text-slate-300 mx-auto mb-3" />
              <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                Student progress requires Supabase.
              </p>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 max-w-sm mx-auto mt-1">
                Responses are only persisted centrally in Supabase mode, so there is nothing to
                profile in local mode.
              </p>
            </div>
          ) : (
            <>
              {/* Lookup controls */}
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="t-label text-[rgb(var(--color-text-dim))] light:text-slate-500">
                    Student username
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') load(username, days);
                    }}
                    placeholder="e.g. jsmith"
                    aria-label="Student username"
                    className="w-52 text-sm rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-3 py-2 outline-none focus:border-[rgb(var(--color-accent))]/60"
                  />
                </label>
                <div className="flex items-center gap-2">
                  {WINDOWS.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        setDays(w);
                        if (data) load(username, w);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        days === w
                          ? 'bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border-[rgb(var(--color-accent))]/30'
                          : 'bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))]'
                      }`}
                    >
                      {w === 365 ? '1y' : `${w}d`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => load(username, days)}
                  disabled={isLoading}
                  className="t-label px-4 py-2 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" /> Look up
                </button>
              </div>

              {isLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <LoadingIndicator messages={['Loading progress…']} duration={2} />
                </div>
              ) : !data ? (
                <section>
                  <h3 className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Students · pick one
                  </h3>
                  {isRosterLoading ? (
                    <div className="h-24 flex items-center justify-center">
                      <LoadingIndicator messages={['Loading roster…']} duration={1} />
                    </div>
                  ) : roster.length === 0 ? (
                    <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic py-6 text-center">
                      No students have submitted marked responses in this window. You can still look
                      up a username directly above.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden overflow-x-auto divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                      {roster.map((s) => (
                        <button
                          key={s.username}
                          onClick={() => load(s.username, days)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50 transition-colors"
                        >
                          <span className="flex-1 font-mono text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800">
                            {s.username}
                          </span>
                          <span className="text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 tabular-nums">
                            {s.attempts} {s.attempts === 1 ? 'response' : 'responses'}
                          </span>
                          <span className="w-16 text-right font-mono text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 tabular-nums">
                            B{formatBand(s.avg_band)}
                          </span>
                          <span className="w-16 text-right text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                            {formatLastActive(s.last_active)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ) : totals && totals.total_attempts === 0 ? (
                <div>
                  <button
                    onClick={() => setData(null)}
                    className="mb-3 text-xs font-bold text-[rgb(var(--color-accent))] hover:underline"
                  >
                    ← Back to students
                  </button>
                  <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic py-8 text-center">
                    No marked responses for <span className="font-mono">{data.username}</span> in
                    this window.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setData(null)}
                    className="-mt-1 text-xs font-bold text-[rgb(var(--color-accent))] hover:underline"
                  >
                    ← Back to students
                  </button>
                  {/* Headline */}
                  <div className="flex flex-wrap gap-3">
                    <StatTile
                      icon={<Users className="w-3.5 h-3.5" />}
                      label="Student"
                      value={data.username}
                    />
                    <StatTile
                      icon={<Layers className="w-3.5 h-3.5" />}
                      label="Attempts"
                      value={String(totals?.total_attempts ?? 0)}
                      sub={`last ${days === 365 ? 'year' : `${days} days`}`}
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

                  {/* Cognitive tier profile */}
                  <section>
                    <h3 className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3">
                      Command verb profile
                    </h3>
                    <div className="space-y-2.5">
                      {tiers.map((t) => (
                        <TierRow key={t.tier} profile={t} />
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                      Share of available marks earned per verb group, then the average band and
                      attempt count. The bar tracks marks, not band: a group&rsquo;s band is capped
                      at its tier, so a band bar would rise left-to-right for every student. A blank
                      group hasn&rsquo;t been attempted in this window.
                    </p>
                  </section>

                  {/* Band trend over time (from the per-attempt history) */}
                  {trendBands >= 2 && (
                    <section>
                      <h3 className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3">
                        Band trend
                      </h3>
                      <BandTrend points={data.trend} />
                      <p className="mt-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                        Each point is a marked attempt in this window, oldest to newest; the dashed
                        line is band 3 (the struggling threshold).
                      </p>
                    </section>
                  )}

                  {/* Per-verb detail */}
                  {verbRows.length > 0 && (
                    <section>
                      <h3 className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3">
                        By command verb
                      </h3>
                      <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[360px]">
                          <thead className="t-label bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600">
                            <tr>
                              <th className="px-4 py-2.5">Verb</th>
                              <th className="px-4 py-2.5 text-right">Attempts</th>
                              <th className="px-4 py-2.5 text-right">Avg Band</th>
                              <th className="px-4 py-2.5 text-right">Marks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                            {verbRows.map((r) => (
                              <tr
                                key={r.label}
                                className="hover:bg-[rgb(var(--color-bg-surface-light))]/10 light:hover:bg-slate-50"
                              >
                                <td className="px-4 py-2.5 text-[rgb(var(--color-text-primary))] light:text-slate-800 font-semibold">
                                  {r.label}
                                  {r.tier != null && (
                                    <span className="ml-2 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-500">
                                      B{r.tier}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                  {r.attempts}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-secondary))] light:text-slate-700">
                                  {formatBand(r.avg_band)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold">
                                  {formatMarkFrac(r.avg_mark_frac)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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

export default StudentProgressModal;
