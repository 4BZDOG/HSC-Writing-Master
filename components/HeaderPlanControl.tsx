import React, { useSyncExternalStore } from 'react';
import { Crown } from 'lucide-react';
import {
  describeAccess,
  freeEvalsRemaining,
  monetisationEnabled,
  PLAN_SHORT_LABELS,
  requestUpgrade,
  STRIPE_PRICE_IDS,
  subscribeEvalCount,
} from '../services/entitlements';
import { HEADER_PLAN } from '../utils/headerChrome';
import type { User } from '../types';

/**
 * The header's route to Plus.
 *
 * A free student had no way to Plus from the screen they spend their time on. The
 * routes were a locked control, the marking counter once it reached zero, and the
 * profile's plan card, so a student who wanted Plus before meeting a lock had to go
 * looking. This puts one control on the rail, for exactly the people the upgrade
 * prompt sells to: describeAccess's `upgrade` answer, which is a free student or a
 * guest. A teacher (who holds Plus), an admin, a parent (who buys for a child from
 * their dashboard) and anyone already on a paid plan get nothing, and so does a
 * deployment that sells nothing or has no Plus price to sell.
 *
 * Once today's free markings are spent the prompt opens on that, as the counter at
 * zero does, because that is the question the student is asking at that moment.
 */
const HeaderPlanControl: React.FC<{ user: User }> = ({ user }) => {
  // Read before the early returns, so the hook order never changes.
  const remaining = useSyncExternalStore(
    subscribeEvalCount,
    () => freeEvalsRemaining(user),
    () => freeEvalsRemaining(user)
  );

  if (!monetisationEnabled()) return null;
  if (!STRIPE_PRICE_IDS.plus_monthly && !STRIPE_PRICE_IDS.plus_yearly) return null;
  const access = describeAccess('fullFeedback', user);
  if (access.cta !== 'upgrade') return null;

  const atLimit = remaining === 0;
  const label = `Get ${PLAN_SHORT_LABELS.plus}`;
  // The full sentence is the name, so a screen reader hears the same thing at every
  // width, including the phone, where only the crown shows.
  const name = atLimit
    ? `No free markings left today. ${access.ctaLabel}`
    : `${access.ctaLabel}: see what it includes`;

  return (
    <button
      type="button"
      data-testid="header-plan"
      onClick={() => requestUpgrade('fullFeedback', atLimit ? 'dailyLimit' : 'overview')}
      title={name}
      aria-label={name}
      className={HEADER_PLAN}
    >
      <Crown className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export default HeaderPlanControl;
