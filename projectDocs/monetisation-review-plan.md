# Monetisation surface — review & polish plan

Review date: 2026-08-29. Scope: Stripe integration, entitlements/quota, the
paywall UI and the setup/user docs. Review-and-polish pass only — no
rearchitecture.

## 1. Summary

The monetisation surface is in good health and unusually well-reasoned: the
three-gate model (role / plan / quota) is clearly separated, the two plan-policy
copies (client `services/planPolicy.ts` and server `api/_lib/planPolicy.ts`) are
pinned together by tests, server-side redaction and the evaluation meter are the
real enforcement points rather than the UI, and the webhook handles idempotency,
event-ordering, the past-due grace period and the Basil-vs-older Stripe API field
moves carefully. British/Australian spelling is consistent throughout ("Analyse",
"Licence", "cancelled", "Colour"), and the naming/monetisation docs are candid
about the display-price-vs-charged-price split. The gaps that remain are narrow:
the two billing endpoints emit no CORS headers even though the code base
explicitly supports a split-hosted API (`VITE_API_BASE_URL`), Australian GST is
never actually computed at checkout despite the "enable Stripe Tax" instruction,
there is no guard against a user opening a second concurrent subscription, and a
few setup-doc details have drifted from the code. None of these affects the
default same-origin, single-subscription happy path, which works correctly.

## 2. Findings & Recommendations

### 1. Billing endpoints send no CORS headers — checkout & portal break on split hosting

- **Priority:** P0 (scope-limited: only bites split-host deployments, but there it silently blocks all payment)
- **Location:** `api/create-checkout.ts:51-207` (whole handler, no CORS/OPTIONS), `api/customer-portal.ts:38-117` (same), contrast `api/gemini.ts:64-80` which does apply `corsHeadersFor` + OPTIONS; helper exists at `api/_lib/cors.ts:25-40`.
- **Problem:** The client calls billing through `${apiBase}${path}` where `apiBase = import.meta.env.VITE_API_BASE_URL` (`services/entitlements.ts:503, 528`), and `resolveReturnBase` (`api/_lib/stripe.ts:97-141`) is written specifically to support a static frontend on a different origin (GitHub Pages sub-path). But a cross-origin `POST` carrying `Authorization` + `Content-Type` triggers a preflight `OPTIONS`, and neither billing endpoint handles `OPTIONS` (both 405 on non-POST) nor emits `Access-Control-Allow-Origin`. So on any deployment where the frontend and the API are on different origins, the browser blocks the checkout and portal calls before they run — the AI proxy works cross-origin, billing does not, and the operator sees no server-side error.
- **Recommendation:** Mirror `api/gemini.ts`'s pattern in both endpoints: at the top of each handler call `corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN)`, attach the returned headers when present, and answer `OPTIONS` with 204 (allowed origin) or 403. Reuse the existing helper unchanged.
- **Effort:** M
- **Risk of change:** Low (additive; no CORS configured → no headers → same-origin behaviour is byte-identical to today).

### 2. Australian GST is never collected at checkout

- **Priority:** P1
- **Location:** `api/create-checkout.ts:175-195` (session params: `tax_id_collection: { enabled: true }` present, `automatic_tax` absent); doc claim `docs/stripesetup.md:288` ("Enable Stripe Tax (optional): In Stripe Dashboard → Tax…").
- **Problem:** The checkout session enables `tax_id_collection` (collects the customer's ABN) but never sets `automatic_tax: { enabled: true }`. Stripe only _computes and adds_ tax when `automatic_tax` is enabled on the session — dashboard configuration alone does nothing for Checkout. So an operator who follows the "enable Stripe Tax" step still charges GST-exclusive prices, collects an ABN it does not act on, and under-collects GST on every AUD sale. This is a correctness/compliance gap, not just docs.
- **Recommendation:** Add `automatic_tax: { enabled: true }` to the session params, gated behind an opt-in env flag (e.g. `STRIPE_AUTOMATIC_TAX === 'true'`) so deployments that have not configured an origin address in Stripe are unaffected, and correct `docs/stripesetup.md` step 6 to say the flag (and a Stripe origin address) are required, not just dashboard config. Note the price-display strings (`PLAN_PRICING` in `services/entitlements.ts:477-483`) are tax-inclusive/exclusive presentation the operator must reconcile.
- **Effort:** S
- **Risk of change:** Low behind the flag; Med if enabled unconditionally (changes the amount charged).

### 3. No guard against a second concurrent subscription

- **Priority:** P1
- **Location:** `api/create-checkout.ts:118-197` (creates a new Checkout Session with no check for an existing active subscription); `components/UpgradeModal.tsx:206-225` and `:486-509` (both CTAs always call `createCheckoutUrl`).
- **Problem:** `create-checkout` reuses the Stripe _customer_ but never checks whether that customer already holds an active/ trialing subscription. The billing portal is the intended path for plan changes, but the upgrade modal's "Upgrade now" and "Buy N seats" buttons unconditionally start a fresh checkout. A user who is `cancel_at_period_end` (still holds the plan, so some gates may still prompt), or a teacher topping up seats, or anyone who reaches the modal while subscribed, can create a _second_ subscription and be double-billed. `resolve_stripe_plan` then just picks the newest — the money is charged twice regardless.
- **Recommendation:** In `create-checkout`, before creating the session, look up the caller's newest subscription (the code already reads the profile) and if one is `active`/`trialing`/`past_due`, return a 409 with a message directing them to "Manage subscription" (the portal). Keep it minimal — a single query and an early return. Optionally, in the modal, when `fetchBillingLookup()` reports a `found` active subscription, swap the CTA to open the portal instead.
- **Effort:** M
- **Risk of change:** Low (early-return guard; the happy path for free users is unchanged).

### 4. Setup doc says "select these four" events but lists six

- **Priority:** P1 (setup step that misleads at exactly the point misconfiguration is silent)
- **Location:** `docs/stripesetup.md:113-121`.
- **Problem:** Step 4a reads "Under **Events to send**, select these four:" and then lists six events (`checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`, `invoice.payment_action_required`). An operator counting "four" may deselect the last two, silently losing the past-due banner and the 3-D-Secure prompt — both of which the webhook (`api/stripe-webhook.ts:182-185`) exists to handle.
- **Recommendation:** Change "these four" to "these six" (or "all of the following"). Trivial text fix.
- **Effort:** S
- **Risk of change:** Low.

### 5. Webhook docstring omits a handled event

- **Priority:** P2
- **Location:** `api/stripe-webhook.ts:7-11` (header lists handled events but omits `invoice.payment_action_required`, which the switch at `:182-185` handles).
- **Problem:** The file header enumerates handled events but is missing `invoice.payment_action_required`, so a future reader auditing coverage from the docstring alone would think the SCA case is unhandled (it is handled). Minor drift.
- **Recommendation:** Add `invoice.payment_action_required` to the header comment's handled-events list next to `invoice.payment_failed`.
- **Effort:** S
- **Risk of change:** Low.

### 6. `SCHOOL_SEAT_LIMITS` defined in two shapes across three places

- **Priority:** P2
- **Location:** `services/entitlements.ts:469` (`{ min: 5, max: 1000, default: 30 }`), `api/_lib/entitlements.ts:23` (`{ min: 5, max: 1000 }`), pinned partly by `tests/unit/entitlementConstants.test.ts`.
- **Problem:** The client copy carries a `default: 30` the server copy lacks; the two cannot share a module (server is plain Node, client reads `import.meta.env`), so this is a deliberate duplication — but the `default` seat count lives only client-side and is not pinned, so a future change to the seat picker's default has nowhere the test would catch a mismatch. Low risk today because min/max (the security-relevant bounds) _are_ pinned.
- **Recommendation:** Leave the split as-is (it is justified), but extend `entitlementConstants.test.ts` to assert the shared `min`/`max` stay equal AND that the client `default` sits within `[min, max]`, so a bad default can't ship. Optionally add a one-line comment in the server copy noting `default` is intentionally client-only.
- **Effort:** S
- **Risk of change:** Low.

### 7. Confirm the pinned Stripe API version string is real

- **Priority:** P2
- **Location:** `api/_lib/stripe.ts:24` (`apiVersion: '2026-06-24.dahlia'`).
- **Problem:** The SDK is pinned to `2026-06-24.dahlia`. The webhook already defends against a mismatch between this and the account's configured webhook API version by reading both top-level and per-item period fields (`api/stripe-webhook.ts:362-365, 607-618`), so a wrong string would not corrupt data — but an invalid `apiVersion` can make the installed `stripe` SDK throw at client construction. Worth a one-time verification against the installed SDK's supported versions.
- **Recommendation:** Verify the string against the pinned `stripe` package version in `package.json`; if the SDK predates that API version, drop back to the SDK's latest supported version. No code change if it is valid.
- **Effort:** S
- **Risk of change:** Low.

### 8. Idempotency rollback can drop a concurrently-duplicated event (recovered by Stripe retry)

- **Priority:** P2 (note only — self-healing)
- **Location:** `api/stripe-webhook.ts:157-202` (claim-before-handle, delete-claim-on-throw).
- **Problem:** The event id is claimed before handling and the claim is deleted if handling throws (`:198-200`). In the rare case where the same event is delivered twice concurrently: delivery A claims and starts, delivery B sees `23505` and is acknowledged as a duplicate _without applying_, then A throws and deletes the claim — leaving the event applied by neither. Stripe re-delivers A's event (A returned 500), so it is reprocessed and the state converges; the window is transient and self-healing.
- **Recommendation:** No change needed; documented here so a future reader does not "fix" it into something worse. If ever tightened, mark the ledger row `status='processing'`/`'done'` rather than delete-on-failure, so a duplicate waits rather than being waved through.
- **Effort:** —
- **Risk of change:** — (leave as is)

## 3. Explicitly out of scope

These are larger than a polish pass and should NOT be attempted here:

- **Reconciling display price with charged price automatically.** The split
  (`PLAN_PRICING` strings vs the Stripe Price object) is deliberate and
  documented with a runbook (`docs/naming-and-monetisation.md:126-146`). A
  build-time check that fetches the Stripe Price and diffs the display string is
  a nice future safeguard but is new infrastructure, not polish.
- **Proration / in-app plan switching.** Monthly↔yearly and Plus↔School changes
  go through the Stripe billing portal by design. Building in-app proration or an
  upgrade/downgrade flow is a feature, not a fix (finding #3 only adds a guard to
  prevent accidental double-subscription, it does not add switching).
- **A referral / promotion system.** `allow_promotion_codes` is already enabled;
  a real referral engine is roadmap, per `docs/naming-and-monetisation.md:164`.
- **Onshore/self-hosted AI marking engine** for schools that cannot approve
  offshore processing (`docs/privacy-for-schools.md:104-107`) — a new provider
  adapter, not a monetisation-polish item.
- **Class-scoped analytics (demo-accounts-plan Phase 1).** A privacy fix worth
  doing but a schema + RPC change, tracked separately.

## 4. Suggested implementation order

Each step is a coherent, independently-testable unit for a fresh session. Steps 1
and 2 both touch `api/create-checkout.ts`, so do them in the order below (or
together) to avoid a merge conflict; step 3 is fully independent.

**Step 1 — Cross-origin billing + duplicate-subscription guard** (findings #1, #3)

- Files: `api/create-checkout.ts`, `api/customer-portal.ts` (add CORS + OPTIONS, reuse `api/_lib/cors.ts` unchanged); add the active-subscription early-return to `create-checkout`; optional CTA swap in `components/UpgradeModal.tsx`.
- Tests: extend/mirror the split-host and checkout tests (`tests/unit/stripeReturnBase.test.ts`, `stripeMisconfigured.test.ts`, `schoolLicence.test.ts`) with an OPTIONS/CORS case and a "already subscribed → 409" case. Mock Supabase and Stripe as the existing tests do; never hit real Stripe.
- Independently testable: yes — pure request/response behaviour of the two endpoints.

**Step 2 — AUD tax handling** (finding #2)

- Files: `api/create-checkout.ts` (add flag-gated `automatic_tax`), `docs/stripesetup.md` (correct the "enable Stripe Tax" step to require the flag + a Stripe origin address).
- Tests: add a unit case asserting `automatic_tax` is present only when the env flag is set (extend the checkout test).
- Independently testable: yes — assert on the session params passed to the mocked `stripe.checkout.sessions.create`.

**Step 3 — Documentation & drift corrections** (findings #4, #5, #6, #7)

- Files: `docs/stripesetup.md` (four→six events), `api/stripe-webhook.ts` (header docstring only), `api/_lib/entitlements.ts` (one-line comment), `tests/unit/entitlementConstants.test.ts` (assert seat-limit `default` within `[min,max]`), verify `api/_lib/stripe.ts:24` API-version string against the installed SDK.
- Independently testable: yes — doc/comment edits plus one strengthened unit test; no runtime behaviour change.

Finding #8 needs no implementation (note only).
