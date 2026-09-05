import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserPreferences } from '../types';
import { authService } from '../services/authService';
import {
  X,
  User as UserIcon,
  Settings,
  Award,
  TrendingUp,
  LogOut,
  Shield,
  Save,
  Edit2,
  Check,
  Flame,
  Sun,
  Moon,
  Zap,
  Cpu,
  MousePointer2,
  Lock,
  Crown,
  ExternalLink,
  BookOpen,
  Target,
  Star,
  Sparkles,
  PenTool,
  Clock,
  BarChart3,
  Compass,
  Scale,
  Database,
  Download,
  Trash2,
} from 'lucide-react';
import { downloadMyData, deleteMyAccount } from '../services/dataRightsService';
import { getBandConfig } from '../utils/renderUtils';
import { canUseAiGeneration } from '../utils/permissions';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  getUserPlan,
  PLAN_LABELS,
  createPortalUrl,
  fetchBillingLookup,
  monetisationEnabled,
  planUnlocks,
  requestUpgrade,
  type BillingLookup,
  type BillingState,
  type Plan,
} from '../services/entitlements';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (user: User) => void;
  onLogout: () => void;
  /** Re-open the quick-start guide. */
  onOpenQuickStart?: () => void;
  /** Open the guide straight on its plan-comparison tab. */
  onComparePlans?: () => void;
  /** Open the Terms of Use / Privacy Notice reader. */
  onOpenLegal?: () => void;
}

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const PlanCard: React.FC<{ user: User }> = ({ user }) => {
  const plan: Plan = getUserPlan(user);
  const isPaid = plan !== 'free';
  /** Whether this deployment charges for anything at all (pilots do not). */
  const selling = monetisationEnabled();
  // Read from the live policy: a deployment can move the Studio to Plus with
  // PLAN_FEATURE_OVERRIDES, and this card must not keep saying otherwise.
  const studioIncluded = planUnlocks(plan, 'aiContentStudio');
  // Plan is only half the studio's gate; the role is the other half. A student
  // never authors, whatever they pay, so the studio is not part of what their
  // plan means to them.
  const canAuthor = canUseAiGeneration(user.role);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  // The profile's cached plan can't tell "renews" from "ends" — that lives on
  // the subscription row. Without it a user who has already cancelled is told
  // their plan renews on the exact date it stops.
  // 'pending' until the lookup returns, so the portal button neither flickers
  // in nor is wrongly withheld before we know who is paying.
  const [lookup, setLookup] = useState<BillingLookup | { status: 'pending' }>({
    status: 'pending',
  });

  useEffect(() => {
    if (!isPaid) return;
    let cancelled = false;
    fetchBillingLookup().then((result) => {
      if (!cancelled) setLookup(result);
    });
    return () => {
      cancelled = true;
    };
  }, [isPaid]);

  const billing: BillingState | null = lookup.status === 'found' ? lookup.state : null;
  const periodEnd = billing?.currentPeriodEnd ?? user.planPeriodEnd ?? null;
  const endsAtPeriodEnd = billing?.cancelAtPeriodEnd === true;

  /**
   * Does this user hold the plan through a subscription of their OWN?
   *
   * Holding a paid plan is not the same as being the payer. Teachers get Plus
   * as a staff perk, admins hold School by role, and every member of a
   * licensed school holds School because someone else bought seats. None of
   * them has a `stripe_customer_id`, so /api/customer-portal answers 404 "No
   * billing account found. Please subscribe first." — which reads as a broken
   * button, and tells a teacher to buy something they already have.
   *
   * Their own subscription row is the only honest signal — but only when the
   * lookup could actually answer. A failed query must fall back to OFFERING
   * the portal (the behaviour before this existed): showing a real subscriber
   * a button that might 404 is a far smaller wrong than telling them they have
   * no subscription and hiding their only route to Stripe.
   */
  const showPortal = isPaid && lookup.status !== 'none';
  const perkPlan = isPaid && lookup.status === 'none';

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    const { url, error } = await createPortalUrl();
    setPortalLoading(false);
    if (url) {
      window.location.href = url;
    } else {
      setPortalError(error ?? 'Could not open the billing portal. Please try again shortly.');
    }
  };

  return (
    <div
      className={`p-6 rounded-panel border flex items-start gap-5 ${
        isPaid
          ? 'bg-amber-400/5 border-amber-400/20'
          : 'bg-white/[0.03] light:bg-slate-100 border-white/5 light:border-slate-200'
      }`}
    >
      <div
        className={`p-3.5 rounded-2xl ${isPaid ? 'bg-amber-400/15 text-amber-400' : 'bg-white/5 light:bg-slate-200 text-slate-400'}`}
      >
        <Crown className="w-7 h-7" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-black text-[rgb(var(--color-text-primary))] light:text-slate-900">
            {PLAN_LABELS[plan]}
          </h4>
          {isPaid && (
            <span className="t-label px-2 py-0.5 rounded-lg bg-amber-400/20 text-amber-500">
              {perkPlan ? 'Included' : 'Active'}
            </span>
          )}
        </div>
        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 leading-relaxed mb-3">
          {/* Plan-accurate, not aspirational — read from the live policy rather
              than asserted, so a deployment that moves the studio between plans
              cannot leave this card claiming otherwise.

              The studio sentence is shown only to an account that can actually
              USE it. The plan unlocks the studio, but `canUseAiGeneration`
              keeps authoring to staff, so telling a student on Plus that "the
              AI Content Studio is included" describes a set of buttons they
              will never be shown. */}
          {!selling
            ? // Every gate is open on this deployment, so telling a free-plan
              // user their features are "limited" and inviting them to upgrade
              // would describe an app they are not using.
              'Every feature is available on this deployment — nothing is held back and there is nothing to buy.'
            : isPaid
              ? `Unlimited marking, full criterion feedback and every ${PLAN_LABELS.plus} tool.` +
                (canAuthor
                  ? studioIncluded
                    ? ' The AI Content Studio is included.'
                    : ` The AI Content Studio is part of the ${PLAN_LABELS.school} plan.`
                  : '')
              : 'Limited daily evaluations and basic features. Upgrade to unlock everything.'}
          {isPaid && user.stripePlan && periodEnd && (
            <span
              className={`block mt-1 text-[10px] font-bold ${
                endsAtPeriodEnd ? 'text-slate-400' : 'text-amber-500/80'
              }`}
            >
              {endsAtPeriodEnd ? 'Access ends' : 'Renews'}{' '}
              {new Date(periodEnd).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {endsAtPeriodEnd && ' — cancelled, no further charges'}
            </span>
          )}
        </p>
        {showPortal && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="t-label px-4 py-2 rounded-xl bg-white/5 light:bg-slate-200 text-[rgb(var(--color-text-secondary))] light:text-slate-600 border border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-300 transition-all flex items-center gap-2"
          >
            <ExternalLink className="w-3 h-3" />
            {portalLoading ? 'Opening...' : 'Manage Subscription'}
          </button>
        )}
        {perkPlan && (
          <p className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 leading-relaxed">
            {plan === 'school'
              ? 'Held through your school’s licence — there is nothing to pay and no subscription of your own to manage. Your school administrator handles the billing.'
              : 'Included with your account — there is nothing to pay and no subscription of your own to manage.'}
          </p>
        )}
        {isPaid && portalError && (
          <p className="mt-2 text-[10px] font-bold text-red-400 light:text-red-600">
            {portalError}
          </p>
        )}
        {!isPaid && selling && (
          <button
            onClick={() => requestUpgrade('fullFeedback')}
            className="t-label px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg hover:scale-105 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Crown className="w-3 h-3" />
            Upgrade to Plus
          </button>
        )}
      </div>
    </div>
  );
};

const MiniProgressRing: React.FC<{ percent: number; size?: number; color: string }> = ({
  percent,
  size = 48,
  color,
}) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, percent)) / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        className="stroke-white/10 light:stroke-slate-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={color}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
    </svg>
  );
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onLogout,
  onOpenQuickStart,
  onComparePlans,
  onOpenLegal,
}) => {
  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'settings'>('overview');
  const [tempPrefs, setTempPrefs] = useState<UserPreferences>({ ...user.preferences });
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);

  // Showing the version and date they accepted turns a dead legal link into a
  // record the user can actually check.
  const agreementSummary = user.agreement
    ? `Accepted v${user.agreement.version} on ${new Date(
        user.agreement.acceptedAt
      ).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.`
    : 'What the AI marker is, and what we do with your work.';

  // --- Data rights (Privacy Notice §8) ------------------------------------
  // Export is one click. Deletion is deliberately two steps and requires the
  // word typed out: it is irreversible, and a mis-tap on a phone must not be
  // able to destroy a year of a student's work.
  const [isExportingData, setIsExportingData] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [dataRightsMessage, setDataRightsMessage] = useState<string | null>(null);

  const handleExportData = async () => {
    setIsExportingData(true);
    setDataRightsMessage(null);
    try {
      await downloadMyData(user);
      setDataRightsMessage('Your data has been downloaded.');
    } catch {
      setDataRightsMessage('Could not build the export. Please try again shortly.');
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    const result = await deleteMyAccount(user);
    setIsDeleting(false);
    if (result.ok) {
      onClose();
      onLogout();
    } else {
      setDataRightsMessage(result.message);
      setIsConfirmingDelete(false);
      setDeleteConfirmText('');
    }
  };

  const xpForNextLevel = user.stats.level * 1000;
  const progressPercent = Math.min(100, (user.stats.xp / xpForNextLevel) * 100);
  const levelTier = Math.min(6, Math.ceil(user.stats.level / 5));
  const bandConfig = getBandConfig(levelTier);

  const achievements = useMemo(() => {
    return [
      {
        id: 'first-steps',
        title: 'First Steps',
        description: 'Complete your first evaluation.',
        icon: '🚀',
        unlocked: user.stats.questionsAnswered >= 1,
        progress: Math.min(1, user.stats.questionsAnswered),
        total: 1,
        accent: 'stroke-blue-500',
      },
      {
        id: 'dedicated',
        title: 'Scholar',
        description: 'Complete 10 evaluations.',
        icon: '🎓',
        unlocked: user.stats.questionsAnswered >= 10,
        progress: Math.min(10, user.stats.questionsAnswered),
        total: 10,
        accent: 'stroke-purple-500',
      },
      {
        id: 'centurion',
        title: 'Centurion',
        description: 'Complete 100 evaluations.',
        icon: '💯',
        unlocked: user.stats.questionsAnswered >= 100,
        progress: Math.min(100, user.stats.questionsAnswered),
        total: 100,
        accent: 'stroke-amber-500',
      },
      {
        id: 'wordsmith',
        title: 'Eloquent',
        description: 'Write 1,000 words total.',
        icon: '✒️',
        unlocked: user.stats.totalWordsWritten >= 1000,
        progress: Math.min(1000, user.stats.totalWordsWritten),
        total: 1000,
        accent: 'stroke-emerald-500',
      },
      {
        id: 'novelist',
        title: 'Novelist',
        description: 'Write 10,000 words total.',
        icon: '📖',
        unlocked: user.stats.totalWordsWritten >= 10000,
        progress: Math.min(10000, user.stats.totalWordsWritten),
        total: 10000,
        accent: 'stroke-sky-500',
      },
      {
        id: 'streaker',
        title: 'Persistent',
        description: 'Reach a 3-day streak.',
        icon: '🔥',
        unlocked: user.stats.streakDays >= 3,
        progress: Math.min(3, user.stats.streakDays),
        total: 3,
        accent: 'stroke-orange-500',
      },
      {
        id: 'marathon',
        title: 'Marathon',
        description: 'Reach a 7-day streak.',
        icon: '⚡',
        unlocked: user.stats.streakDays >= 7,
        progress: Math.min(7, user.stats.streakDays),
        total: 7,
        accent: 'stroke-indigo-500',
      },
      {
        id: 'high-achiever',
        title: 'High Achiever',
        description: 'Reach Band 5 average.',
        icon: '🏆',
        unlocked: user.stats.averageBand >= 5,
        progress: Math.min(5, user.stats.averageBand),
        total: 5,
        accent: 'stroke-blue-400',
      },
    ];
  }, [user.stats]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const performanceSummary = useMemo(() => {
    const { questionsAnswered, averageBand, totalWordsWritten, streakDays } = user.stats;
    if (questionsAnswered === 0)
      return { text: 'Complete your first evaluation to start tracking progress.', positive: true };
    const parts: string[] = [];
    if (averageBand >= 5) parts.push(`averaging Band ${averageBand.toFixed(1)}`);
    else if (averageBand >= 4)
      parts.push(`averaging Band ${averageBand.toFixed(1)} — keep pushing`);
    else parts.push(`averaging Band ${averageBand.toFixed(1)} — room to grow`);
    if (streakDays >= 3) parts.push(`${streakDays}-day active streak`);
    if (totalWordsWritten >= 5000)
      parts.push(`${(totalWordsWritten / 1000).toFixed(1)}k words written`);
    return {
      text: `You've completed ${questionsAnswered} evaluation${questionsAnswered === 1 ? '' : 's'}, ${parts.join(', ')}.${streakDays >= 3 ? ' Keep the momentum going!' : ' Try to write every day to build your streak.'}`,
      positive: averageBand >= 4,
    };
  }, [user.stats]);

  useEffect(() => {
    if (isOpen) {
      setTempPrefs({ ...user.preferences });
      setDisplayName(user.displayName);
      setIsEditingName(false);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    const updatedUser = { ...user, displayName, preferences: tempPrefs };
    onUpdateUser(updatedUser);
    setIsEditingName(false);
    authService.updateUser(updatedUser);
  };

  const togglePref = (key: keyof UserPreferences) => {
    setTempPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Your profile"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-profile p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))]/90 light:bg-white/95 backdrop-blur-sm rounded-surface shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] w-full max-w-4xl border border-white/10 light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <MeshOverlay opacity="opacity-[0.03]" />

        {/* Profile Identity Header */}
        <div className="flex-shrink-0 px-5 sm:px-12 py-6 sm:py-8 flex flex-col md:flex-row items-center gap-5 md:gap-10 border-b border-white/5 light:border-slate-200 relative overflow-hidden">
          <div className="relative group shrink-0">
            <div
              className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700`}
            />
            <div
              className={`relative w-20 h-20 sm:w-28 sm:h-28 rounded-tile bg-gradient-to-br ${bandConfig.gradient} flex items-center justify-center shadow-lg border-4 border-white/10 transform group-hover:scale-105 transition-transform duration-500`}
            >
              <span className="text-4xl sm:text-5xl font-black text-white">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-black light:bg-white border border-white/10 light:border-slate-200 flex items-center justify-center shadow-lg">
              <span className={`text-xs font-black ${bandConfig.text}`}>{user.stats.level}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4 mb-3">
              {isEditingName ? (
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="bg-white/5 light:bg-slate-100 border-b-2 border-indigo-500 text-2xl sm:text-3xl font-black text-white light:text-slate-900 focus:outline-none px-2 min-w-0 w-full"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveSettings}
                    aria-label="Save"
                    className="p-2 bg-indigo-500 text-white rounded-xl shrink-0"
                  >
                    <Save className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <h2
                  onClick={() => setIsEditingName(true)}
                  className="text-2xl sm:text-4xl font-black text-white light:text-slate-900 tracking-tight cursor-pointer hover:text-indigo-400 transition-colors break-words max-w-full"
                >
                  {user.displayName}
                </h2>
              )}
              <span className="t-label px-3 py-1 rounded-full bg-white/5 light:bg-indigo-50 border border-white/10 light:border-indigo-200 text-indigo-400">
                {user.role}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6 text-slate-400 light:text-slate-600 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" /> Level {user.stats.level}
              </span>
              <span className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" /> {user.stats.streakDays} Day Active
                Streak
              </span>
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" /> {unlockedCount}/{achievements.length}{' '}
                Unlocked
              </span>
            </div>

            <div className="lg:hidden mt-4 flex items-center gap-3 justify-center md:justify-start">
              <div className="w-40 h-1.5 bg-white/5 light:bg-slate-200 rounded-full overflow-hidden border border-white/5 light:border-slate-300">
                <div
                  className={`h-full bg-gradient-to-r ${bandConfig.gradient}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-indigo-400">
                {Math.round(progressPercent)}% to next level
              </span>
            </div>
          </div>

          <div className="flex-shrink-0 flex-col items-end gap-2 hidden lg:flex">
            <div className="flex items-center gap-2">
              <span className="t-label text-slate-500">Level Progress</span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div className="w-48 h-1.5 bg-white/5 light:bg-slate-200 rounded-full overflow-hidden border border-white/5 light:border-slate-300">
              <div
                className={`h-full bg-gradient-to-r ${bandConfig.gradient}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex-shrink-0 flex border-b border-white/5 light:border-slate-100 px-4 sm:px-10 bg-black/10 light:bg-slate-50/50 overflow-x-auto scrollbar-hide">
          {[
            { id: 'overview', icon: Zap, label: 'Stats' },
            {
              id: 'achievements',
              icon: Award,
              label: `Achievements (${unlockedCount}/${achievements.length})`,
            },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`t-label px-4 sm:px-6 py-4 sm:py-5 border-b-2 transition-all flex items-center gap-2 sm:gap-3 whitespace-nowrap ${activeTab === tab.id ? `border-indigo-500 text-white light:text-slate-900` : 'border-transparent text-slate-500 hover:text-slate-300 light:hover:text-slate-700'}`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-400' : ''}`} />{' '}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-12 custom-scrollbar">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in">
              {/* Main Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Completed',
                    val: user.stats.questionsAnswered,
                    icon: Check,
                    color: 'text-emerald-400',
                    ringColor: 'stroke-emerald-500',
                    ringPercent: Math.min(100, user.stats.questionsAnswered),
                  },
                  {
                    label: 'Avg Band',
                    val: user.stats.averageBand.toFixed(1),
                    icon: Target,
                    color: 'text-indigo-400',
                    ringColor: 'stroke-indigo-500',
                    ringPercent: (user.stats.averageBand / 6) * 100,
                  },
                  {
                    label: 'Words',
                    val:
                      user.stats.totalWordsWritten >= 1000
                        ? `${(user.stats.totalWordsWritten / 1000).toFixed(1)}k`
                        : user.stats.totalWordsWritten,
                    icon: PenTool,
                    color: 'text-sky-400',
                    ringColor: 'stroke-sky-500',
                    ringPercent: Math.min(100, (user.stats.totalWordsWritten / 10000) * 100),
                  },
                  {
                    label: 'Streak',
                    val: `${user.stats.streakDays}d`,
                    icon: Flame,
                    color: 'text-orange-400',
                    ringColor: 'stroke-orange-500',
                    ringPercent: Math.min(100, (user.stats.streakDays / 7) * 100),
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-5 rounded-panel bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200 flex flex-col items-center text-center group hover:bg-white/[0.06] light:hover:bg-slate-100 transition-all duration-300 hover:border-white/10 light:hover:border-slate-300"
                  >
                    <div className="relative mb-3">
                      <MiniProgressRing percent={stat.ringPercent} color={stat.ringColor} />
                      <div
                        className={`absolute inset-0 flex items-center justify-center ${stat.color}`}
                      >
                        <stat.icon className="w-5 h-5" />
                      </div>
                    </div>
                    <span className="text-2xl font-black text-white light:text-slate-900 tracking-tighter tabular-nums">
                      {stat.val}
                    </span>
                    <span className="t-label text-slate-500 mt-1">{stat.label}</span>
                  </div>
                ))}
              </div>

              {/* XP & Level Card */}
              <div className="p-6 rounded-panel bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${bandConfig.iconBg}`}>
                      <Sparkles className={`w-5 h-5 ${bandConfig.text}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white light:text-slate-900">
                        Level {user.stats.level}
                      </h4>
                      <p className="t-label text-slate-500">
                        {user.stats.xp} / {xpForNextLevel} XP
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                <div className="w-full h-3 bg-white/5 light:bg-slate-200 rounded-full overflow-hidden border border-white/5 light:border-slate-300">
                  <div
                    className={`h-full bg-gradient-to-r ${bandConfig.gradient} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <PlanCard user={user} />

              {/* Performance Summary */}
              <div
                className={`p-6 rounded-panel border flex items-start gap-5 ${performanceSummary.positive ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-indigo-500/5 border-indigo-500/20'}`}
              >
                <div
                  className={`p-3.5 rounded-2xl ${performanceSummary.positive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}
                >
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white light:text-slate-900 mb-2">
                    Performance Summary
                  </h4>
                  <p className="text-sm text-slate-400 light:text-slate-600 leading-relaxed">
                    {performanceSummary.text}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className="space-y-6 animate-fade-in">
              {/* Progress overview */}
              <div className="flex items-center gap-4 p-5 rounded-panel bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200">
                <div className="relative">
                  <MiniProgressRing
                    percent={(unlockedCount / achievements.length) * 100}
                    size={56}
                    color="stroke-amber-500"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white light:text-slate-900">
                    {unlockedCount} of {achievements.length} Unlocked
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {unlockedCount === achievements.length
                      ? 'All achievements unlocked!'
                      : `${achievements.length - unlockedCount} remaining — keep going!`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievements.map((ach) => {
                  const pct = (ach.progress / ach.total) * 100;
                  return (
                    <div
                      key={ach.id}
                      className={`flex items-center gap-5 p-5 rounded-panel border transition-all duration-500 ${ach.unlocked ? 'bg-white/[0.03] light:bg-slate-50 border-white/10 light:border-slate-200' : 'bg-black/20 light:bg-slate-100 border-transparent'}`}
                    >
                      <div className="relative shrink-0">
                        <MiniProgressRing percent={pct} color={ach.accent} />
                        <div className="absolute inset-0 flex items-center justify-center text-2xl">
                          {ach.unlocked ? ach.icon : <Lock className="w-5 h-5 text-slate-600" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4
                            className={`font-bold text-sm ${ach.unlocked ? 'text-white light:text-slate-900' : 'text-slate-500'}`}
                          >
                            {ach.title}
                          </h4>
                          {ach.unlocked && (
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{ach.description}</p>
                        {!ach.unlocked && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/5 light:bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-500 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono font-bold text-slate-600 tabular-nums">
                              {ach.progress}/{ach.total}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white/[0.02] light:bg-slate-100 rounded-panel border border-white/5 light:border-slate-200 overflow-hidden">
                {[
                  {
                    id: 'theme',
                    icon: Sun,
                    label: 'Light Theme',
                    desc: 'Switch to light mode.',
                    isTheme: true,
                  },
                  {
                    id: 'defaultFocusMode',
                    icon: MousePointer2,
                    label: 'Default Focus Mode',
                    desc: 'Automatically hide menus on entry.',
                  },
                  {
                    id: 'autoSave',
                    icon: Save,
                    label: 'Auto-Save',
                    desc: 'Automatically save your drafts.',
                  },
                  {
                    id: 'highContrast',
                    icon: Zap,
                    label: 'High Contrast',
                    desc: 'Increase text legibility.',
                  },
                ].map((pref, i) => (
                  <div
                    key={pref.id}
                    className={`flex items-center justify-between px-6 sm:px-10 py-6 hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors ${i !== 3 ? 'border-b border-white/5 light:border-slate-100' : ''}`}
                  >
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 light:bg-slate-100 flex items-center justify-center text-slate-500">
                        <pref.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white light:text-slate-900">
                          {pref.label}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium mt-1">{pref.desc}</p>
                      </div>
                    </div>

                    {pref.isTheme ? (
                      <button
                        onClick={() =>
                          setTempPrefs((p) => ({
                            ...p,
                            theme: p.theme === 'light' ? 'dark' : 'light',
                          }))
                        }
                        className={`w-14 h-8 rounded-full relative transition-colors duration-500 ${tempPrefs.theme === 'light' ? 'bg-indigo-500' : 'bg-slate-800 light:bg-slate-300'}`}
                      >
                        <div
                          className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all duration-500 flex items-center justify-center ${tempPrefs.theme === 'light' ? 'left-7' : 'left-1'}`}
                        >
                          {tempPrefs.theme === 'light' ? (
                            <Sun className="w-3 h-3 text-indigo-500" />
                          ) : (
                            <Moon className="w-3 h-3 text-slate-800" />
                          )}
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={() => togglePref(pref.id as any)}
                        className={`w-14 h-8 rounded-full relative transition-colors duration-500 ${tempPrefs[pref.id as keyof UserPreferences] ? 'bg-emerald-500' : 'bg-slate-800 light:bg-slate-300'}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-all duration-500 ${tempPrefs[pref.id as keyof UserPreferences] ? 'translate-x-6' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Help & agreements. Kept here rather than behind a separate
                  tab so there is exactly one place a user looks when they want
                  to re-read what they agreed to or how something works. */}
              {(onOpenQuickStart || onComparePlans || onOpenLegal) && (
                <div className="bg-white/[0.02] light:bg-slate-100 rounded-panel border border-white/5 light:border-slate-200 overflow-hidden">
                  {[
                    onOpenQuickStart && {
                      id: 'quickStart',
                      icon: Compass,
                      label: 'Quick Start Guide',
                      desc: 'How the app works, in a couple of minutes.',
                      action: onOpenQuickStart,
                    },
                    onComparePlans && {
                      id: 'plans',
                      icon: Crown,
                      label: 'Compare Plans',
                      desc: `You are on ${PLAN_LABELS[getUserPlan(user)]} — see exactly what that includes.`,
                      action: onComparePlans,
                    },
                    onOpenLegal && {
                      id: 'legal',
                      icon: Scale,
                      label: 'Terms & Privacy',
                      desc: agreementSummary,
                      action: onOpenLegal,
                    },
                  ]
                    .filter(Boolean)
                    .map((item, i, all) => {
                      const entry = item as {
                        id: string;
                        icon: typeof Compass;
                        label: string;
                        desc: string;
                        action: () => void;
                      };
                      return (
                        <button
                          key={entry.id}
                          onClick={entry.action}
                          className={`w-full flex items-center justify-between px-6 sm:px-10 py-6 text-left hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors ${i !== all.length - 1 ? 'border-b border-white/5 light:border-slate-100' : ''}`}
                        >
                          <div className="flex items-center gap-4 sm:gap-6">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 light:bg-slate-100 flex items-center justify-center text-slate-500">
                              <entry.icon className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white light:text-slate-900">
                                {entry.label}
                              </h4>
                              <p className="text-xs text-slate-500 font-medium mt-1">
                                {entry.desc}
                              </p>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
                        </button>
                      );
                    })}
                </div>
              )}

              {/* Your data — the Privacy Notice promises access, export and
                  erasure, so the product has to actually provide them. */}
              <div className="bg-white/[0.02] light:bg-slate-100 rounded-panel border border-white/5 light:border-slate-200 overflow-hidden">
                <div className="px-6 sm:px-10 pt-6 pb-2">
                  <h4 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-3">
                    <Database className="w-4 h-4 text-slate-500" /> Your Data
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
                    Take a copy of everything we hold about your account, or delete it. Curriculum
                    content is not personal data and is not included in the export.
                  </p>
                </div>

                <div className="px-6 sm:px-10 py-5 flex flex-wrap gap-3">
                  <button
                    onClick={handleExportData}
                    disabled={isExportingData}
                    className="t-label px-5 py-3 rounded-2xl bg-white/5 light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-700 border border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-100 transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExportingData ? 'Preparing…' : 'Download my data'}
                  </button>
                  {!isConfirmingDelete && (
                    <button
                      onClick={() => {
                        setIsConfirmingDelete(true);
                        setDataRightsMessage(null);
                      }}
                      className="t-label px-5 py-3 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete my account
                    </button>
                  )}
                </div>

                {isConfirmingDelete && (
                  <div className="px-6 sm:px-10 pb-6 animate-fade-in">
                    <div className="p-5 rounded-panel bg-red-500/[0.07] border border-red-500/30">
                      <p className="text-xs font-bold text-red-400 light:text-red-600 leading-relaxed">
                        This deletes your profile, your responses and all your progress. It cannot
                        be undone.
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-2">
                        Anything you contributed to the shared library stays, with your name
                        removed. Consider downloading your data first.
                      </p>
                      <label
                        htmlFor="delete-confirm"
                        className="t-label block text-slate-500 mt-4 mb-2"
                      >
                        Type DELETE to confirm
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <input
                          id="delete-confirm"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          autoComplete="off"
                          className="flex-1 min-w-[140px] px-4 py-3 rounded-2xl bg-black/40 light:bg-white border border-white/10 light:border-slate-300 text-white light:text-slate-900 text-sm font-bold outline-none focus:border-red-500/60 transition-colors"
                          placeholder="DELETE"
                        />
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                          className="t-label px-5 py-3 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? 'Deleting…' : 'Delete permanently'}
                        </button>
                        <button
                          onClick={() => {
                            setIsConfirmingDelete(false);
                            setDeleteConfirmText('');
                          }}
                          className="t-label px-5 py-3 rounded-2xl bg-white/5 light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-600 border border-white/10 light:border-slate-300 hover:bg-white/10 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {dataRightsMessage && (
                  <p
                    role="status"
                    className="px-6 sm:px-10 pb-6 -mt-2 text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed"
                  >
                    {dataRightsMessage}
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveSettings}
                  className="px-10 py-4 rounded-panel font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg active:scale-[0.98] transition-all flex items-center gap-3"
                >
                  <Save className="w-4 h-4" /> Save Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modular Footer */}
        <div className="flex-shrink-0 px-6 sm:px-12 py-5 sm:py-6 border-t border-white/5 light:border-slate-100 bg-black/20 light:bg-slate-50 flex justify-between items-center z-10">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="t-label text-red-500 hover:text-red-400 transition-colors flex items-center gap-2 group"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Log Out
          </button>
          <button
            onClick={onClose}
            className="t-label px-8 py-3 rounded-2xl text-white bg-white/10 light:bg-slate-200 light:text-slate-700 border border-white/10 light:border-slate-300 hover:bg-white/20 light:hover:bg-slate-300 active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UserProfileModal;
