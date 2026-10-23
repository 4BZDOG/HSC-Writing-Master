import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserPreferences } from '../types';
import { authService } from '../services/authService';
import {
  X,
  Settings,
  Award,
  LogOut,
  Save,
  Pencil,
  Sun,
  Moon,
  Zap,
  MousePointer2,
  Lock,
  Crown,
  ExternalLink,
  Star,
  Compass,
  Scale,
  Database,
  Download,
  FileDown,
  Trash2,
} from 'lucide-react';
import { downloadMyData, deleteMyAccount } from '../services/dataRightsService';
import { getBandConfig } from '../utils/renderUtils';
import { canUseAiGeneration, roleLabel } from '../utils/permissions';
import { averageMarkPercent, levelProgress } from '../utils/progression';
import { withStatDefaults } from '../utils/profileHistory';
import { reportAudienceFor } from '../utils/progressReportOptions';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useOwnAttemptHistory } from '../hooks/useOwnAttemptHistory';
import {
  describeAccess,
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
import { billingErrorMessage } from '../utils/billingMessages';
import {
  BAND_FILL,
  BandProgressChart,
  PROFILE_CARD,
  PROFILE_SECTION_TITLE,
  ProfileHistoryNote,
  ProfileScoreboard,
  RecentAttemptsList,
  TierStrengthChart,
  bandVars,
  type ScoreCell,
} from './ProfileCharts';
import { HERO_HEAD_WASH } from '../utils/ladderChrome';
import StudentGuardianSection, { showGuardianSection } from './guardian/StudentGuardianSection';

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
  /**
   * Open the progress report's options and download. Hands off, so the profile
   * closes behind it. Offered only to a role with a report (never a guest).
   */
  onOpenProgressReport?: () => void;
}

/**
 * `onDismiss` closes the profile when a control here hands off to the upgrade
 * prompt. The prompt sits at `z-upgrade` (900) and the profile at `z-profile`
 * (2000), so without it the prompt opens underneath and the button reads as
 * broken — the same inversion that made the profile's three help rows dead.
 */
const PlanCard: React.FC<{ user: User; onDismiss: () => void }> = ({ user, onDismiss }) => {
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
  // The one upgrade this card may offer, read from the same answer as every lock.
  const upgradeCta = describeAccess('fullFeedback', user);
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

  // A parent holds no plan of their own. Plus is bought for a child from the
  // guardian dashboard, so there is nothing here to describe or to offer.
  if (user.role === 'parent') {
    return (
      <section
        aria-labelledby="profile-plan-heading"
        className={`${PROFILE_CARD} flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5`}
      >
        <div className="shrink-0 w-11 h-11 rounded-tile flex items-center justify-center bg-surface-inset dark:bg-white/5 text-slate-600 dark:text-slate-400">
          <Crown className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 id="profile-plan-heading" className={PROFILE_SECTION_TITLE}>
            Plan
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Your account does not hold a plan. Buy {PLAN_LABELS.plus} for a child from your
            dashboard, and it appears on their account.
          </p>
        </div>
      </section>
    );
  }

  const billing: BillingState | null = lookup.status === 'found' ? lookup.state : null;
  // Paid for by a parent or guardian: the plan is this student's, but the billing
  // is the payer's, so the student is told that rather than offered the portal.
  const paidByGuardian = billing?.paidByGuardian === true;
  const periodEnd = billing?.currentPeriodEnd ?? user.planPeriodEnd ?? null;
  /**
   * Is `periodEnd` a renewal date or a stop date?
   *
   * Their own subscription row answers it when they have one. When they do not
   * — a school seat licence held through someone else's purchase — the answer
   * comes off the school, carried onto the profile at sign-in. Without that
   * second branch a student at a lapsing school was told their plan "renews"
   * on the exact day their whole school drops back to the free tier.
   */
  const endsAtPeriodEnd = billing
    ? billing.cancelAtPeriodEnd === true
    : user.planCancelAtPeriodEnd === true;

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
  // Neither branch while the lookup is pending. The button used to show for the
  // pending state and then vanish for a perk holder, so a teacher saw
  // "Manage Subscription" flash up and go, which is the flicker the pending
  // state exists to prevent.
  const showPortal =
    isPaid && !paidByGuardian && (lookup.status === 'found' || lookup.status === 'unknown');
  const perkPlan = isPaid && lookup.status === 'none';
  /**
   * The word beside the plan name. "Active" was printed for a subscription the
   * customer had already cancelled and for one whose last payment had failed,
   * so the chip contradicted the line under it.
   */
  const planChip = perkPlan
    ? 'Included'
    : billing?.status === 'past_due'
      ? 'Payment due'
      : endsAtPeriodEnd
        ? 'Cancelled'
        : 'Active';
  /**
   * What a holder without a subscription of their own is told. An admin holds
   * School by role, not through anyone's licence, so "your school's licence"
   * would describe a licence they have never had.
   */
  const perkText =
    plan === 'school' && user.role !== 'admin'
      ? 'Held through your school’s licence — there is nothing to pay and no subscription of your own to manage. Your school administrator handles the billing.'
      : plan === 'school'
        ? 'Included with your admin account — there is nothing to pay and no subscription to manage.'
        : 'Included with your account — there is nothing to pay and no subscription of your own to manage.';

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    const { url, error, status } = await createPortalUrl();
    setPortalLoading(false);
    if (url) {
      window.location.href = url;
    } else {
      setPortalError(billingErrorMessage('portal', { error, status }));
    }
  };

  return (
    <section
      aria-labelledby="profile-plan-heading"
      className={`${PROFILE_CARD} flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5`}
    >
      <div
        className={`shrink-0 w-11 h-11 rounded-tile flex items-center justify-center ${
          isPaid
            ? 'bg-amber-100 dark:bg-amber-400/15 text-amber-700 dark:text-amber-400'
            : 'bg-surface-inset dark:bg-white/5 text-slate-600 dark:text-slate-400'
        }`}
      >
        <Crown className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="profile-plan-heading" className={PROFILE_SECTION_TITLE}>
            Plan
          </h3>
          {isPaid && (
            <span className="t-label px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-100 dark:bg-amber-400/15 text-amber-800 dark:text-amber-400">
              {planChip}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
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
              ? `Full marking, criterion-by-criterion feedback and every ${PLAN_LABELS.plus} tool.` +
                (canAuthor
                  ? studioIncluded
                    ? ' The AI Content Studio is included.'
                    : ` The AI Content Studio is part of the ${PLAN_LABELS.school} plan.`
                  : '')
              : 'Limited daily evaluations and basic features, with the rest held back until you have a plan.'}
          {isPaid && user.stripePlan && periodEnd && (
            <span
              className={`block mt-1.5 t-label ${
                endsAtPeriodEnd ? 'text-secondary' : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {endsAtPeriodEnd ? 'Access ends' : 'Renews'}{' '}
              {new Date(periodEnd).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {/* "No further charges" is a reassurance for someone who was
                  being charged. Someone holding the plan through their
                  school's licence never was, and the thing they actually need
                  to know is whose decision it was. */}
              {endsAtPeriodEnd &&
                (perkPlan
                  ? ' — your school’s licence ends then'
                  : ' — cancelled, no further charges')}
            </span>
          )}
        </p>
        {showPortal && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="mt-4 t-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-surface-elevated dark:bg-white/5 text-secondary border border-slate-400 dark:border-white/10 shadow-sm can-hover:hover:bg-surface-inset dark:can-hover:hover:bg-white/10 transition-colors flex items-center gap-2 disabled:cursor-wait disabled:text-muted"
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            {portalLoading ? 'Opening…' : 'Manage subscription'}
          </button>
        )}
        {isPaid && paidByGuardian && (
          <p className="mt-4 t-label text-secondary leading-relaxed">
            Paid for by your parent or guardian. They manage the billing for this plan.
          </p>
        )}
        {perkPlan && <p className="mt-3 t-label text-muted leading-relaxed">{perkText}</p>}
        {showPortal && billing?.status === 'past_due' && (
          <p className="mt-2 t-label text-amber-800 dark:text-amber-400 leading-relaxed">
            Your last payment did not go through. Update your payment method to keep your access.
          </p>
        )}
        {isPaid && portalError && (
          <p role="alert" className="mt-2 t-label text-red-700 dark:text-red-400">
            {portalError}
          </p>
        )}
        {/* White on amber-700 is 5.0:1, where white on the old amber-to-orange
            gradient was 2.8:1 at its orange end. The dark theme takes dark ink
            instead, which is 5.0:1 on amber-600. */}
        {!isPaid && selling && upgradeCta.cta === 'upgrade' && (
          <button
            onClick={() => {
              requestUpgrade('fullFeedback');
              onDismiss();
            }}
            className="mt-4 t-label min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-amber-700 text-white shadow-sm dark:bg-amber-600 dark:text-slate-950 can-hover:hover:bg-amber-800 dark:can-hover:hover:bg-amber-500 active:scale-[0.98] transition-colors flex items-center gap-2"
          >
            <Crown className="w-3 h-3" aria-hidden="true" />
            {upgradeCta.ctaLabel}
          </button>
        )}
      </div>
    </section>
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
  onOpenProgressReport,
}) => {
  useEscapeKey(isOpen, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  // The trap focuses the first control in the dialog, which is the name button,
  // so the name wore a focus ring on every open and read as a selection the user
  // never made. Hooks run in declaration order, so the trap's effect has already
  // placed focus by the time this one runs. Moving it onto the dialog surface,
  // which has no ring, leaves no control looking selected. Tab still walks into
  // the controls, and the trap still holds focus inside the dialog.
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus({ preventScroll: true });
  }, [isOpen, dialogRef]);
  useScrollLock(isOpen);
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'settings'>('overview');
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  // Every figure below reads through here, so a field a saved profile predates
  // renders as zero rather than as NaN.
  const stats = useMemo(() => withStatDefaults(user.stats), [user.stats]);
  // The per-answer history behind the charts. Read while the profile is open.
  const history = useOwnAttemptHistory(isOpen);

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

  /**
   * Progress through the CURRENT level, from the app's one progression curve
   * (utils/progression.ts).
   *
   * This used to be `xp / (level * 1000)` — a second, disagreeing curve. The
   * demo seed derived a level at 100 XP each, so a seeded student on 465 XP
   * was labelled Level 5 by one rule and shown "9% to next level" by another,
   * when the rule that produced the 5 puts them 65% of the way to 6.
   */
  const progress = levelProgress(stats.xp);
  const levelTier = Math.min(6, Math.ceil(stats.level / 5));
  const bandConfig = getBandConfig(levelTier);

  const achievements = useMemo(() => {
    return [
      {
        id: 'first-steps',
        title: 'First Steps',
        description: 'Complete your first evaluation.',
        icon: '🚀',
        unlocked: stats.questionsAnswered >= 1,
        progress: Math.min(1, stats.questionsAnswered),
        total: 1,
      },
      {
        id: 'dedicated',
        title: 'Scholar',
        description: 'Complete 10 evaluations.',
        icon: '🎓',
        unlocked: stats.questionsAnswered >= 10,
        progress: Math.min(10, stats.questionsAnswered),
        total: 10,
      },
      {
        id: 'centurion',
        title: 'Centurion',
        description: 'Complete 100 evaluations.',
        icon: '💯',
        unlocked: stats.questionsAnswered >= 100,
        progress: Math.min(100, stats.questionsAnswered),
        total: 100,
      },
      {
        id: 'wordsmith',
        title: 'Eloquent',
        description: 'Write 1,000 words total.',
        icon: '✒️',
        unlocked: stats.totalWordsWritten >= 1000,
        progress: Math.min(1000, stats.totalWordsWritten),
        total: 1000,
      },
      {
        id: 'novelist',
        title: 'Novelist',
        description: 'Write 10,000 words total.',
        icon: '📖',
        unlocked: stats.totalWordsWritten >= 10000,
        progress: Math.min(10000, stats.totalWordsWritten),
        total: 10000,
      },
      {
        id: 'streaker',
        title: 'Persistent',
        description: 'Reach a 3-day streak.',
        icon: '🔥',
        unlocked: stats.streakDays >= 3,
        progress: Math.min(3, stats.streakDays),
        total: 3,
      },
      {
        id: 'marathon',
        title: 'Marathon',
        description: 'Reach a 7-day streak.',
        icon: '⚡',
        unlocked: stats.streakDays >= 7,
        progress: Math.min(7, stats.streakDays),
        total: 7,
      },
      {
        id: 'high-achiever',
        title: 'High Achiever',
        description: 'Reach Band 5 average.',
        icon: '🏆',
        unlocked: stats.averageBand >= 5,
        progress: Math.min(5, stats.averageBand),
        total: 5,
      },
    ];
  }, [stats]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  /**
   * The unfinished achievement closest to done — the one thing the header's
   * "4/8" cannot tell anyone. Ordered by proportion complete so a student two
   * answers off Scholar is pointed at Scholar rather than at Novelist.
   */
  const nextAchievement = useMemo(
    () =>
      achievements
        .filter((a) => !a.unlocked)
        .sort((a, b) => b.progress / b.total - a.progress / a.total)[0],
    [achievements]
  );

  const performanceSummary = useMemo(() => {
    const { questionsAnswered, averageBand, totalWordsWritten, streakDays } = stats;
    if (questionsAnswered === 0)
      return { text: 'Complete your first evaluation to start tracking progress.', positive: true };
    const parts: string[] = [];
    // The share of the marks on offer where it is known. An average BAND told a
    // student earning every mark on DESCRIBE questions — which top out at Band
    // 2 — that they were "averaging Band 2.0 — room to grow".
    const markPercent = averageMarkPercent(stats);
    if (markPercent !== null) {
      parts.push(
        `earning ${markPercent}% of the marks on offer${markPercent >= 80 ? '' : markPercent >= 60 ? ' — keep pushing' : ' — room to grow'}`
      );
    } else if (averageBand >= 5) parts.push(`averaging Band ${averageBand.toFixed(1)}`);
    else if (averageBand >= 4)
      parts.push(`averaging Band ${averageBand.toFixed(1)} — keep pushing`);
    else parts.push(`averaging Band ${averageBand.toFixed(1)} — room to grow`);
    if (streakDays >= 3) parts.push(`${streakDays}-day active streak`);
    if (totalWordsWritten >= 5000)
      parts.push(`${(totalWordsWritten / 1000).toFixed(1)}k words written`);
    return {
      text: `You've completed ${questionsAnswered} evaluation${questionsAnswered === 1 ? '' : 's'}, ${parts.join(', ')}.${streakDays >= 3 ? ' Keep the momentum going!' : ' Try to write every day to build your streak.'}`,
      positive: markPercent !== null ? markPercent >= 60 : averageBand >= 4,
    };
  }, [stats]);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName);
      setIsEditingName(false);
    }
  }, [isOpen, user]);

  /**
   * Disarm account deletion whenever the modal opens.
   *
   * It used to survive the exit everyone actually takes. `isConfirmingDelete`
   * and `deleteConfirmText` were reset by the Cancel button and by nothing
   * else — so a student who opened the confirmation, typed DELETE, thought
   * better of it and pressed Close (or Escape) came back to a profile with the
   * red panel already open, the word already typed and "Delete permanently"
   * already enabled. One tap from irreversible, in a state they believed they
   * had backed out of. The comment on these fields says a mis-tap must not be
   * able to destroy a year of a student's work; this is what makes that true
   * for the exit they take.
   *
   * Keyed on `isOpen` ALONE, unlike the draft resync above. Saving settings
   * replaces the `user` object, and the Save button sits directly below the
   * delete panel — so sharing that effect's dependencies would have closed an
   * open confirmation out from under the user's cursor.
   */
  useEffect(() => {
    if (isOpen) {
      setIsConfirmingDelete(false);
      setDeleteConfirmText('');
      setDataRightsMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * Commit the NAME on its own.
   *
   * The tick beside the name used to call `handleSaveSettings`, which writes
   * `preferences: tempPrefs` as well — so renaming yourself also committed
   * every settings toggle you had flicked and not decided on, and "Save
   * Settings" at the bottom likewise committed a half-typed name. One action
   * wearing two labels. They are separate edits and they save separately now.
   */
  const handleSaveName = () => {
    const trimmed = displayName.trim();
    // An empty name would leave the header blank and the avatar initial gone.
    if (!trimmed) {
      setDisplayName(user.displayName);
      setIsEditingName(false);
      return;
    }
    const updatedUser = { ...user, displayName: trimmed };
    setDisplayName(trimmed);
    onUpdateUser(updatedUser);
    authService.updateUser(updatedUser);
    setIsEditingName(false);
  };

  /** Abandon the rename and put the real name back. */
  const cancelNameEdit = () => {
    setDisplayName(user.displayName);
    setIsEditingName(false);
  };

  /**
   * Write a preference change straight through, the way the header's own theme
   * button already does.
   *
   * These four toggles used to edit a `tempPrefs` draft that only reached the
   * account when "Save Settings" was pressed, which was wrong twice over.
   *
   * It lost work: Close, Escape and a backdrop click all discarded the draft
   * with no warning, and the re-open effect then overwrote it, so a student who
   * flicked a switch and shut the panel had simply not changed anything and was
   * never told.
   *
   * And it defeated two of the four. Theme and High Contrast exist to change
   * how the app looks; a preview you cannot see until you commit it is not a
   * preview. The header's theme control has always applied instantly, so the
   * same switch behaved one way in the header and another here.
   */
  const commitPrefs = (patch: Partial<UserPreferences>) => {
    const updatedUser = { ...user, preferences: { ...user.preferences, ...patch } };
    onUpdateUser(updatedUser);
    authService.updateUser(updatedUser);
  };

  const markPercent = averageMarkPercent(stats);
  const wordsLabel =
    stats.totalWordsWritten >= 1000
      ? `${(stats.totalWordsWritten / 1000).toFixed(1)}k`
      : String(stats.totalWordsWritten);
  /**
   * The headline figures. Each is stated once, here, and nowhere else on the
   * profile — the level sits on the badge, the progression in the meter above
   * it, and the achievement count on its own tab.
   */
  const scoreCells: ScoreCell[] = [
    {
      label: 'Answers marked',
      value: String(stats.questionsAnswered),
      title: 'Answers the AI marker has marked for you',
    },
    markPercent !== null
      ? {
          label: 'Avg mark',
          value: `${markPercent}%`,
          title:
            'Share of the marks on offer, averaged over every marked answer. Not capped by command verb.',
        }
      : {
          label: 'Avg Band',
          value: stats.averageBand.toFixed(1),
          title:
            'Average band over every marked answer. A command verb caps the band a question can reach.',
        },
    {
      label: 'Words',
      value: wordsLabel,
      title: `${stats.totalWordsWritten.toLocaleString('en-AU')} words written`,
    },
    {
      label: 'Day streak',
      value: String(stats.streakDays),
      title: stats.streakDays === 1 ? '1 day in a row' : `${stats.streakDays} days in a row`,
    },
  ];

  const plan = getUserPlan(user);
  const isPaid = plan !== 'free';

  // Paper with an edge, like every card on the profile's desk. The rows inside
  // are separated by hairlines, which need the edge to read as dividers at all.
  const settingsCard =
    'rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none overflow-hidden';
  // The 44px touch target for a control whose visible ink is smaller. From `sm`
  // the control returns to its own size.
  const touchable = 'min-h-11 sm:min-h-0';
  // The head takes the level's tier hue, the same one the avatar, the level badge and
  // the XP meter already say, so the head and the figures beneath it agree.
  const headBand = bandVars(levelTier);

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Your profile"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-profile p-3 sm:p-4 focus:outline-none"
      onClick={onClose}
      onKeyDown={(e) => {
        // Shift+Tab from the dialog surface itself would carry focus out of the
        // dialog to the page behind it, and the trap only corrects that once
        // focus is on a control. So the surface hands it to the last control.
        if (e.key !== 'Tab' || !e.shiftKey || e.target !== e.currentTarget) return;
        const controls = e.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])'
        );
        const last = controls[controls.length - 1];
        if (last) {
          e.preventDefault();
          last.focus();
        }
      }}
    >
      <div
        className="bg-[rgb(var(--color-bg-base))] dark:bg-[rgb(var(--color-bg-surface))]/90 backdrop-blur-sm rounded-surface shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] w-full max-w-4xl border border-slate-300 dark:border-white/10 animate-fade-in-up overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Identity. The name, role and plan say who this is; the XP meter says
            how far through the level they are; the scoreboard carries the four
            figures that move. Everything below is detail for one of those.

            The head is paper washed with the level's band, so it is the one
            coloured surface in the dialog, and the desk beneath it carries the
            cards. */}
        <header
          style={headBand}
          className={`flex-shrink-0 bg-surface ${HERO_HEAD_WASH} px-5 sm:px-10 pt-5 sm:pt-7 pb-5 sm:pb-6 border-b border-slate-300 dark:border-white/10 space-y-5`}
        >
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <div className="relative shrink-0">
              {/* `band-solid` is the one solid band fill, with near-black ink, which
                  holds AA on all six hues where white does not (yellow is 1.9:1). */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-tile band-solid band-glow flex items-center justify-center">
                <span aria-hidden="true" className="text-3xl sm:text-4xl font-black">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              {/* The level lives HERE and nowhere else in this header. */}
              <div
                className="absolute -bottom-2 -right-2 px-2 h-7 min-w-7 rounded-xl bg-surface border border-slate-300 dark:border-white/10 flex items-center justify-center shadow-lg"
                title={`Level ${stats.level}`}
              >
                <span className={`text-xs font-bold tabular-nums ${bandConfig.text}`}>
                  <span className="sr-only">Level </span>
                  {stats.level}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter commits and Escape abandons, which is what every
                      // inline editor does and this one did neither: the only
                      // way out was the tick, and Escape fell through to the
                      // dialog's own handler and shut the whole modal — taking
                      // the half-typed name with it.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveName();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelNameEdit();
                      }
                    }}
                    aria-label="Your display name"
                    maxLength={60}
                    className="flex-1 bg-surface-inset dark:bg-white/5 border-b-2 border-[rgb(var(--color-accent))] text-xl sm:text-2xl font-black text-primary focus:outline-none px-2 py-1 min-w-0 rounded-t-lg"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    aria-label="Save your name"
                    className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 bg-[rgb(var(--color-accent))] text-white dark:text-slate-950 rounded-xl shrink-0 can-hover:hover:bg-[rgb(var(--color-accent-dark))] transition-colors"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={cancelNameEdit}
                    aria-label="Cancel renaming"
                    className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 bg-surface-inset dark:bg-white/5 text-secondary rounded-xl shrink-0 can-hover:hover:bg-surface-light dark:can-hover:hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <h2 className="min-w-0 max-w-full">
                  {/* A real button, not an h2 with an onClick. The name was
                      editable only by mouse — no tab stop, no role, no
                      keyboard route — so a keyboard or screen-reader user
                      could not rename themselves at all, and nobody else could
                      tell it was editable either. */}
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="group/name flex items-center gap-2 min-w-0 max-w-full min-h-11 sm:min-h-0 rounded-lg px-1 -mx-1 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]"
                  >
                    <span className="text-xl sm:text-2xl font-black text-primary tracking-tight break-words text-left group-hover/name:text-[rgb(var(--color-accent))] transition-colors">
                      {user.displayName}
                    </span>
                    <Pencil
                      className="w-3.5 h-3.5 shrink-0 text-muted group-hover/name:text-[rgb(var(--color-accent))] transition-colors"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Rename yourself</span>
                  </button>
                </h2>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="t-label px-2.5 py-1 rounded-full border border-slate-300 dark:border-white/10 text-secondary">
                  {roleLabel(user.role)}
                </span>
                <span
                  className={`t-label inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                    isPaid
                      ? 'border-amber-500/40 bg-amber-100 dark:bg-amber-400/15 text-amber-800 dark:text-amber-400'
                      : 'border-slate-300 dark:border-white/10 text-secondary'
                  }`}
                >
                  {isPaid && <Crown className="w-3 h-3" aria-hidden="true" />}
                  {PLAN_LABELS[plan]}
                </span>
              </div>
            </div>
          </div>

          {/* One progression meter, naming what it counts. */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex-1 h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-white/10"
              role="img"
              aria-label={`${progress.into} of ${progress.needed} XP through Level ${stats.level}`}
            >
              <div
                className={`h-full rounded-full ${BAND_FILL}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="t-label tabular-nums whitespace-nowrap text-secondary">
              {progress.into}/{progress.needed} XP to Level {progress.nextLevel}
            </span>
          </div>

          <ProfileScoreboard cells={scoreCells} />
        </header>

        {/* Tab Navigation */}
        {/* The selected tab is the one with the accent rule, drawn 3px deep and in
            ink, so it is read from across the bar without the colour alone. */}
        <div className="flex-shrink-0 flex bg-surface-elevated dark:bg-surface border-b border-slate-300 dark:border-white/10 px-2 sm:px-10 overflow-x-auto scrollbar-hide">
          {[
            { id: 'overview', icon: Zap, label: 'Stats' },
            {
              id: 'achievements',
              icon: Award,
              label: `Achievements (${unlockedCount}/${achievements.length})`,
            },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                aria-current={active ? 'true' : undefined}
                className={`t-label flex-auto justify-center min-h-11 px-2 sm:px-6 py-3.5 border-b-[3px] -mb-px transition-colors flex items-center gap-2 whitespace-nowrap touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--color-accent))] ${
                  active
                    ? 'border-[rgb(var(--color-accent))] text-primary'
                    : 'border-transparent text-muted can-hover:hover:text-primary can-hover:hover:border-slate-300 dark:can-hover:hover:border-white/20'
                }`}
              >
                {/* The icon is dropped below `sm`: three tabs with their icons
                    need about 313px, which is wider than a 360px phone's row, and
                    the names alone fit with room to spare. */}
                <tab.icon
                  className={`hidden sm:block w-4 h-4 ${active ? 'text-[rgb(var(--color-accent))]' : ''}`}
                  aria-hidden="true"
                />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        {/* The body is the desk the cards lie on. In the dark theme it is the
            dialog's own surface, as it always was. */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-10 custom-scrollbar bg-[rgb(var(--color-bg-base))] dark:bg-transparent">
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-sm leading-relaxed text-secondary">{performanceSummary.text}</p>

              {onOpenProgressReport && reportAudienceFor(user.role) !== null && (
                <button
                  type="button"
                  onClick={onOpenProgressReport}
                  className={`w-full flex items-center justify-between gap-4 p-4 sm:p-5 rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none text-left touch-manipulation can-hover:hover:shadow-lg transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))] ${touchable}`}
                >
                  <span className="flex items-center gap-4 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-11 h-11 shrink-0 rounded-tile bg-accent/15 text-accent flex items-center justify-center"
                    >
                      <FileDown className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-primary">
                        Download progress report
                      </span>
                      <span className="block text-xs leading-relaxed text-secondary mt-0.5">
                        Choose what to include, then save a PDF.
                      </span>
                    </span>
                  </span>
                  <Download className="w-4 h-4 shrink-0 text-secondary" aria-hidden="true" />
                </button>
              )}

              {/* With no history to read there is nothing for the three cards to show,
                  so the profile says so once, and draws no cards. */}
              {history.status === 'ready' ? (
                <>
                  <section aria-labelledby="profile-band-heading" className={PROFILE_CARD}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5">
                      <h3 id="profile-band-heading" className={PROFILE_SECTION_TITLE}>
                        Band progress
                      </h3>
                      <p className="t-label text-muted">One point per marked answer</p>
                    </div>
                    <BandProgressChart
                      history={history}
                      averageBand={stats.questionsAnswered > 0 ? stats.averageBand : null}
                      questionsAnswered={stats.questionsAnswered}
                    />
                  </section>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <section aria-labelledby="profile-tier-heading" className={PROFILE_CARD}>
                      <h3 id="profile-tier-heading" className={`${PROFILE_SECTION_TITLE} mb-5`}>
                        Strength by tier
                      </h3>
                      <TierStrengthChart
                        history={history}
                        questionsAnswered={stats.questionsAnswered}
                      />
                    </section>

                    <section aria-labelledby="profile-recent-heading" className={PROFILE_CARD}>
                      <h3 id="profile-recent-heading" className={`${PROFILE_SECTION_TITLE} mb-5`}>
                        Recent attempts
                      </h3>
                      <RecentAttemptsList
                        history={history}
                        questionsAnswered={stats.questionsAnswered}
                      />
                    </section>
                  </div>
                </>
              ) : (
                <ProfileHistoryNote history={history} />
              )}

              <PlanCard user={user} onDismiss={onClose} />
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className="space-y-5 animate-fade-in">
              {/* The count is in the tab label. What is left here is the
                  sentence the count could not say: what to do next. */}
              {nextAchievement && (
                <div className="flex items-start gap-4 p-4 sm:p-5 rounded-panel border border-amber-400 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/5 shadow-sm dark:shadow-none">
                  <Star
                    className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-relaxed text-secondary">
                    Closest to unlocking:{' '}
                    <span className="font-bold text-primary">{nextAchievement.title}</span> —{' '}
                    {nextAchievement.description.replace(/\.$/, '')}. You&apos;re at{' '}
                    <span className="font-bold tabular-nums">
                      {nextAchievement.progress} of {nextAchievement.total}
                    </span>
                    .
                  </p>
                </div>
              )}

              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievements.map((ach) => {
                  const pct = (ach.progress / ach.total) * 100;
                  return (
                    <li
                      key={ach.id}
                      className={`${PROFILE_CARD} p-4 sm:p-5 flex items-start gap-4`}
                    >
                      <div className="shrink-0 w-11 h-11 rounded-tile flex items-center justify-center text-2xl bg-surface-inset dark:bg-white/5">
                        {ach.unlocked ? (
                          <span aria-hidden="true">{ach.icon}</span>
                        ) : (
                          <Lock className="w-4 h-4 text-muted" aria-hidden="true" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="text-sm font-bold text-primary">{ach.title}</h4>
                          <span
                            className={`t-label tabular-nums whitespace-nowrap ${
                              ach.unlocked ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'
                            }`}
                          >
                            {ach.unlocked ? 'Unlocked' : `${ach.progress}/${ach.total}`}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                          {ach.description}
                        </p>
                        <div
                          className="mt-3 h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-white/10"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ${
                              ach.unlocked
                                ? 'bg-emerald-600 dark:bg-emerald-400'
                                : 'bg-[rgb(var(--color-accent))]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8 animate-fade-in">
              <section aria-labelledby="profile-prefs-heading" className="space-y-3">
                <h3 id="profile-prefs-heading" className={PROFILE_SECTION_TITLE}>
                  Preferences
                </h3>
                <div className={settingsCard}>
                  {[
                    {
                      id: 'theme',
                      icon: Sun,
                      label: 'Light Theme',
                      desc: 'Switch to light mode.',
                    },
                    // Auto-Save is gone from this list. Drafts save as you type
                    // whatever it said — nothing read the setting — so a switch
                    // that appeared to stop saving was a promise the app did not
                    // keep, about the one thing a student cannot afford to lose.
                    {
                      id: 'defaultFocusMode',
                      icon: MousePointer2,
                      label: 'Open questions in Focus Mode',
                      desc: 'The navigator and panels step aside whenever you open a question.',
                    },
                    {
                      id: 'highContrast',
                      icon: Zap,
                      label: 'High Contrast',
                      desc: 'Stronger text and edges across the app.',
                    },
                  ].map((pref, index, all) => {
                    const on =
                      pref.id === 'theme'
                        ? user.preferences.theme === 'light'
                        : !!user.preferences[pref.id as keyof UserPreferences];
                    return (
                      <div
                        key={pref.id}
                        className={`flex items-center justify-between gap-4 px-5 sm:px-8 py-4 sm:py-5 can-hover:hover:bg-slate-50 dark:can-hover:hover:bg-white/[0.02] transition-colors ${
                          index < all.length - 1
                            ? 'border-b border-slate-200 dark:border-white/5'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 shrink-0 rounded-2xl bg-surface-inset dark:bg-white/5 flex items-center justify-center text-secondary">
                            <pref.icon className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <h4
                              id={`pref-${pref.id}-label`}
                              className="text-sm font-bold text-primary"
                            >
                              {pref.label}
                            </h4>
                            <p className="text-xs leading-relaxed text-secondary mt-0.5">
                              {pref.desc}
                            </p>
                          </div>
                        </div>

                        {/* A real switch: `role="switch"` with `aria-checked` and
                            a name. These were bare buttons with no accessible
                            name and no state, so a screen reader announced four
                            identical unlabelled buttons and never said whether
                            any of them was on.

                            The hit area is 44px tall and 56px wide; the drawn
                            track is the 32px inside it. The track is a child, so
                            the target is the control and not the visible ink. */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-labelledby={`pref-${pref.id}-label`}
                          onClick={() =>
                            pref.id === 'theme'
                              ? commitPrefs({ theme: on ? 'dark' : 'light' })
                              : commitPrefs({ [pref.id]: !on } as Partial<UserPreferences>)
                          }
                          className="relative w-14 h-11 shrink-0 rounded-full touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-bg-surface))]"
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
                              on
                                ? pref.id === 'theme'
                                  ? 'bg-[rgb(var(--color-accent))]'
                                  : 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-slate-500 dark:bg-slate-600'
                            }`}
                          />
                          <span
                            aria-hidden="true"
                            className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white transition-[left] duration-500 motion-reduce:transition-none flex items-center justify-center ${on ? 'left-7' : 'left-1'}`}
                          >
                            {pref.id === 'theme' &&
                              (on ? (
                                <Sun className="w-3 h-3 text-amber-600" aria-hidden="true" />
                              ) : (
                                <Moon className="w-3 h-3 text-slate-700" aria-hidden="true" />
                              ))}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Help & agreements. Kept here rather than behind a separate
                  tab so there is exactly one place a user looks when they want
                  to re-read what they agreed to or how something works. */}
              {(onOpenQuickStart || onComparePlans || onOpenLegal) && (
                <section aria-labelledby="profile-help-heading" className="space-y-3">
                  <h3 id="profile-help-heading" className={PROFILE_SECTION_TITLE}>
                    Help and agreements
                  </h3>
                  <div className={settingsCard}>
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
                        desc: `You are on ${PLAN_LABELS[plan]} — see exactly what that includes.`,
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
                      .map((item, index, all) => {
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
                            className={`w-full flex items-center justify-between gap-4 px-5 sm:px-8 py-4 sm:py-5 text-left touch-manipulation can-hover:hover:bg-slate-50 dark:can-hover:hover:bg-white/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--color-accent))] ${
                              index !== all.length - 1
                                ? 'border-b border-slate-200 dark:border-white/5'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="w-10 h-10 shrink-0 rounded-2xl bg-surface-inset dark:bg-white/5 flex items-center justify-center text-secondary">
                                <entry.icon className="w-5 h-5" aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-primary">{entry.label}</h4>
                                <p className="text-xs leading-relaxed text-secondary mt-0.5">
                                  {entry.desc}
                                </p>
                              </div>
                            </div>
                            <ExternalLink
                              className="w-4 h-4 text-muted shrink-0"
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                  </div>
                </section>
              )}

              {/* A parent or guardian linked to this account. Online accounts only. */}
              {showGuardianSection(user) && <StudentGuardianSection />}

              {/* Your data — the Privacy Notice promises access, export and
                  erasure, so the product has to actually provide them. */}
              <section aria-labelledby="profile-data-heading" className="space-y-3">
                <h3 id="profile-data-heading" className={PROFILE_SECTION_TITLE}>
                  Your data
                </h3>
                <div className={settingsCard}>
                  <div className="px-5 sm:px-8 pt-5 pb-1">
                    <p className="flex items-start gap-3 text-xs leading-relaxed text-secondary">
                      <Database className="w-4 h-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                      <span>
                        Take a copy of everything we hold about your account, or delete it.
                        Curriculum content is not personal data and is not included in the export.
                      </span>
                    </p>
                  </div>

                  <div className="px-5 sm:px-8 py-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleExportData}
                      disabled={isExportingData}
                      className={`t-label px-4 py-2.5 rounded-xl bg-surface-elevated dark:bg-white/5 text-secondary border border-slate-400 dark:border-white/10 shadow-sm can-hover:hover:bg-surface-inset dark:can-hover:hover:bg-white/10 transition-colors flex items-center gap-2 disabled:cursor-wait disabled:text-muted ${touchable}`}
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      {isExportingData ? 'Preparing…' : 'Download my data'}
                    </button>
                    {!isConfirmingDelete && (
                      <button
                        onClick={() => {
                          setIsConfirmingDelete(true);
                          setDataRightsMessage(null);
                        }}
                        className={`t-label px-4 py-2.5 rounded-xl text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 can-hover:hover:bg-red-100 dark:can-hover:hover:bg-red-500/20 transition-colors flex items-center gap-2 ${touchable}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete my account
                      </button>
                    )}
                  </div>

                  {isConfirmingDelete && (
                    <div className="px-5 sm:px-8 pb-6">
                      <div className="p-5 rounded-panel bg-red-50 dark:bg-red-500/[0.07] border border-red-300 dark:border-red-500/30">
                        <p className="text-xs leading-relaxed text-red-800 dark:text-red-400">
                          This deletes your profile, your responses and all your progress. It cannot
                          be undone.
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-secondary">
                          Anything you contributed to the shared library stays, with your name
                          removed. Consider downloading your data first.
                        </p>
                        <label
                          htmlFor="delete-confirm"
                          className="t-label block text-secondary mt-4 mb-2"
                        >
                          Type DELETE to confirm
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {/* 16px on a phone: a smaller field makes iOS zoom on focus. */}
                          <input
                            id="delete-confirm"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            autoComplete="off"
                            className="flex-1 min-w-[140px] min-h-11 sm:min-h-0 px-4 py-2.5 rounded-xl bg-surface dark:bg-black/40 border border-slate-400 dark:border-white/10 text-primary text-base sm:text-sm font-bold outline-none focus:border-red-600 dark:focus:border-red-500/60 transition-colors"
                            placeholder="DELETE"
                          />
                          <button
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                            className={`t-label px-4 py-2.5 rounded-xl bg-red-700 text-white can-hover:hover:bg-red-600 dark:bg-red-600 dark:can-hover:hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-secondary dark:disabled:bg-white/10 ${touchable}`}
                          >
                            {isDeleting ? 'Deleting…' : 'Delete permanently'}
                          </button>
                          <button
                            onClick={() => {
                              setIsConfirmingDelete(false);
                              setDeleteConfirmText('');
                            }}
                            className={`t-label px-4 py-2.5 rounded-xl bg-surface-elevated dark:bg-white/5 text-secondary border border-slate-400 dark:border-white/10 shadow-sm can-hover:hover:bg-surface-inset dark:can-hover:hover:bg-white/10 transition-colors ${touchable}`}
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
                      className="px-5 sm:px-8 pb-5 -mt-1 text-xs leading-relaxed text-secondary"
                    >
                      {dataRightsMessage}
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer: the two exits. Log out is the one that ends the session, so it
            is the one set apart. */}
        <div className="flex-shrink-0 px-5 sm:px-10 py-4 sm:py-5 border-t border-slate-300 dark:border-white/10 bg-surface-elevated dark:bg-black/20 flex justify-between items-center gap-3">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className={`t-label text-red-700 dark:text-red-400 can-hover:hover:text-red-800 dark:can-hover:hover:text-red-300 transition-colors flex items-center gap-2 group touch-manipulation ${touchable}`}
          >
            <LogOut
              className="w-4 h-4 group-hover:-translate-x-1 transition-transform"
              aria-hidden="true"
            />{' '}
            Log Out
          </button>
          <button
            onClick={onClose}
            className={`t-label px-6 sm:px-8 py-2.5 rounded-xl text-primary bg-surface dark:bg-white/10 border border-slate-400 dark:border-white/10 shadow-sm can-hover:hover:bg-surface-inset dark:can-hover:hover:bg-white/20 active:scale-[0.98] transition-[background-color,transform] ${touchable}`}
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
