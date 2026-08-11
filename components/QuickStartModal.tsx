import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Rocket, Crown, Lightbulb, Clock, Lock, Scale, ArrowRight } from 'lucide-react';
import type { User } from '../types';
import { QUICK_START_ICONS } from './agreementIcons';
import { trackForRole, POWER_TIPS } from '../data/quickStartContent';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import PlanComparison from './PlanComparison';
import { PLAN_LABELS, getUserPlan } from '../services/entitlements';

/**
 * The quick-start guide. Opens by itself on a genuinely new account (see
 * `needsQuickStart`), and is re-openable from the header and the profile —
 * the first-run tour you can actually get back to.
 *
 * Three tabs, because they answer three different questions: how do I use
 * this, what does it cost, and what am I missing. Content for all three comes
 * from `data/quickStartContent.ts` and the live entitlement rules, so a new
 * step or a changed plan needs no work here.
 */

type QuickStartTab = 'guide' | 'plans' | 'tips';

interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  /** Opens the Terms & Privacy reader — offered as a footer link. */
  onOpenLegal: () => void;
  /** Which tab opens first. The profile's "Compare plans" opens on `plans`;
   *  AppModals keys this component on the value so a re-open honours it. */
  initialTab?: QuickStartTab;
}

const QuickStartModal: React.FC<QuickStartModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenLegal,
  initialTab = 'guide',
}) => {
  const [tab, setTab] = useState<QuickStartTab>(initialTab);
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const track = trackForRole(user.role);
  const plan = getUserPlan(user);

  const TABS: { id: QuickStartTab; label: string; icon: typeof Rocket }[] = [
    { id: 'guide', label: 'Getting started', icon: Rocket },
    { id: 'plans', label: 'Free vs Plus', icon: Crown },
    { id: 'tips', label: 'Good to know', icon: Lightbulb },
  ];

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[940] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickstart-title"
    >
      <div className="clip-stable w-full max-w-3xl rounded-[32px] bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-200 shadow-[0_32px_96px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-fade-in-up flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="relative px-6 sm:px-8 py-6 bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 text-white overflow-hidden shrink-0">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-xl bg-black/10 hover:bg-black/20 text-white transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative z-10 pr-10">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/75 flex items-center gap-2">
              {track.eyebrow}
              <span className="inline-flex items-center gap-1 text-white/60">
                <Clock className="w-3 h-3" /> {track.timeToRead}
              </span>
            </span>
            <h2
              id="quickstart-title"
              className="text-2xl sm:text-3xl font-black tracking-tighter leading-tight mt-1"
            >
              {track.title}
            </h2>
            <p className="text-sm text-white/85 leading-relaxed mt-2 max-w-xl font-medium">
              {track.intro}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 light:border-slate-200 px-2 sm:px-6 shrink-0 overflow-x-auto custom-scrollbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`px-4 sm:px-5 py-4 text-[11px] font-black uppercase tracking-[0.1em] border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                tab === id
                  ? 'border-indigo-500 text-[rgb(var(--color-text-primary))] light:text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-300 light:hover:text-slate-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${tab === id ? 'text-indigo-400' : ''}`} /> {label}
            </button>
          ))}
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
          {tab === 'guide' && (
            <>
              <ol className="space-y-4">
                {track.steps.map((step, index) => {
                  const Icon = QUICK_START_ICONS[step.icon];
                  return (
                    <li
                      key={step.title}
                      className="flex gap-4 p-5 rounded-2xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200"
                    >
                      <div className="shrink-0 flex flex-col items-center gap-2">
                        <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 light:text-indigo-600">
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="text-[10px] font-black text-slate-600 light:text-slate-500 tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 leading-snug">
                          {step.title}
                        </h3>
                        <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 mt-1.5">
                          {step.body}
                        </p>
                        {step.detail && (
                          <ul className="mt-2.5 space-y-1.5">
                            {step.detail.map((line) => (
                              <li
                                key={line}
                                className="text-[11px] leading-relaxed text-[rgb(var(--color-text-muted))] light:text-slate-500 flex gap-2.5"
                              >
                                <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-indigo-400/60" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {/* Never let the guide promise something this account
                            cannot do — the note only appears when the feature
                            is genuinely beyond their plan. */}
                        {step.planNote && plan === 'free' && (
                          <p className="mt-3 inline-flex items-start gap-2 text-[10px] font-bold text-amber-500 leading-relaxed">
                            <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                            {step.planNote}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-5 p-5 rounded-2xl bg-indigo-500/[0.07] light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-200">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 light:text-indigo-600 block mb-2">
                  The one thing to remember
                </span>
                <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                  {track.closer}
                </p>
              </div>
            </>
          )}

          {tab === 'plans' && (
            <>
              <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 mb-5">
                You are on <span className="font-black">{PLAN_LABELS[plan]}</span>. Here is exactly
                what that includes — and what the other plans add. Everything below is read straight
                from the app’s own access rules, so it is always current.
              </p>
              <PlanComparison user={user} />
            </>
          )}

          {tab === 'tips' && (
            <>
              <ul className="space-y-3">
                {POWER_TIPS.map((tip) => (
                  <li
                    key={tip.label}
                    className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200"
                  >
                    <span className="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-wider text-indigo-400 light:text-indigo-600">
                      {tip.label}
                    </span>
                    <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 pt-0.5">
                      {tip.body}
                    </p>
                  </li>
                ))}
              </ul>

              <button
                onClick={onOpenLegal}
                className="mt-5 w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200 hover:bg-white/[0.06] light:hover:bg-slate-100 transition-colors text-left"
              >
                <Scale className="w-4 h-4 text-indigo-400 light:text-indigo-600 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 uppercase tracking-wide">
                    Your agreement, terms and privacy
                  </span>
                  <span className="block text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-0.5 font-medium">
                    What the AI marker is, what your teacher can see, and what we do with your work.
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-white/5 light:border-slate-200 shrink-0 flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-widest">
            Re-open any time from your profile
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            {tab === 'guide' ? 'Start writing' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickStartModal;
