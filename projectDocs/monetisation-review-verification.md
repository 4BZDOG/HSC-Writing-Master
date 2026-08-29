# Monetisation Review — Independent Verification

Verification pass over branch `claude/monetisation-integrations-review-ibxql5`
(commits `d1427d1` → `0590027`), checked against Stripe/MDN documentation and
the codebase. No code was changed; this document is the only new file.

## 1. Verdict

The change set is **sound to merge**. Every code and test claim was confirmed
against the source, all seven target test files are green (55/55), and the two
behaviour-changing paths (CORS preflight and `automatic_tax`) are both opt-in
and byte-identical to the prior behaviour when their env vars are unset, so no
existing deployment is affected. The duplicate-subscription guard is correctly
placed on the real-Stripe path (after the misconfigured/test-mode early returns),
filters only `active`/`trialing`/`past_due`, and therefore does not block a
legitimate re-subscribe after cancellation. **No blockers.** One documentation
claim (Stripe *throws* specifically when `automatic_tax` is enabled with no
account origin address) could not be confirmed to the letter from official docs
— but the code's opt-in design is safe regardless of the exact failure mode, so
this is a documentation-precision note, not a merge risk. One test
(`duplicateSubscriptionGuard` "ignores a cancelled subscription") asserts less
than its name implies — flagged below, non-blocking.

## 2. Verification table

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | `automatic_tax` must be set on the Checkout Session for Stripe to compute/add tax; dashboard Stripe Tax config alone does not make Checkout apply tax | **CONFIRMED** | Stripe docs: "To enable automatic tax calculation, pass `automatic_tax[enabled]=true` when creating a Checkout Session." (docs.stripe.com/tax/checkout). Dashboard setup is a separate prerequisite; it does not switch on per-session computation. |
| 2 | Stripe rejects/throws when `automatic_tax` is enabled without an origin address configured | **COULD NOT CONFIRM (precise behaviour)** | Docs confirm an origin address is a prerequisite for tax calc and that "By default, Stripe sets your origin address to your Stripe business address" (docs.stripe.com/tax/customer-locations, /tax/set-up). Searches surfaced an error of the form "You cannot create a Checkout Session with automatic tax" tied to missing origin/customer address, but no stable official page states verbatim that session creation *throws* solely on a missing account origin address. The opt-in guard is a safe response to this risk either way. |
| 3 | `tax_id_collection` alone does not compute tax (only collects the ABN/Tax ID) | **CONFIRMED** | Stripe docs treat them as separate features: `tax_id_collection` "includes provided tax IDs on the resulting Session object"; computing tax requires `automatic_tax[enabled]=true` (docs.stripe.com/tax/checkout/tax-ids, /tax/checkout). |
| 4 | A cross-origin POST with Authorization + `Content-Type: application/json` triggers a CORS preflight (OPTIONS) that must be answered with `Access-Control-Allow-*`; endpoints previously 405'd it | **CONFIRMED** | MDN/CORS: `application/json` is not a CORS-safelisted content type and the `Authorization` header is not safelisted, so the request is preflighted; the server must answer with `Access-Control-Allow-Headers` (Authorization must be listed explicitly). Pre-change bug is real: `git show main:api/create-checkout.ts` has no OPTIONS branch — `if (req.method !== 'POST')` → `405` (line 52-53), so the preflight was rejected. |
| 5 | Pinned Stripe `apiVersion '2026-06-24.dahlia'` matches the installed SDK | **CONFIRMED** | `api/_lib/stripe.ts:24` pins `'2026-06-24.dahlia'`. Installed `node_modules/stripe/package.json` = `22.3.1`; `node_modules/stripe/cjs/apiVersion.js` → `exports.ApiVersion = '2026-06-24.dahlia'`. `package-lock.json` pins stripe `22.3.1`. Exact match. |
| 6 | Australian GST context; Stripe Tax supports AU | **CONFIRMED (light)** | GST (10%) is Australia's consumption tax and the relevant tax on AUD B2C/B2B sales; Stripe Tax supports Australian registrations. Consistent with Stripe Tax's supported-countries coverage. Not over-verified per instruction. |
| 7 | Duplicate-guard queries `subscriptions(user_id, status)`; early-returns 409 for active/trialing/past_due; sits on real-Stripe path | **CONFIRMED** | Guard at `api/create-checkout.ts:185-199`: `.from('subscriptions').select('id, status').eq('user_id', auth.userId).in('status', ['active','trialing','past_due']).limit(1).maybeSingle()` → 409. Columns exist: webhook writes them at `api/stripe-webhook.ts:451` (`user_id`) and `:453` (`status`). Placement is after the `isStripeMisconfigured()` 503 (`:107`) and the `!isStripeConfigured()` test-mode 200 (`:113`), inside the real-Stripe `try`/`if (supabase)` block — test-mode fallback intact. |
| 8 | CORS additions reuse `api/_lib/cors.ts` unchanged and match `api/gemini.ts` exactly | **CONFIRMED** | `git diff main...HEAD` shows no change to `api/_lib/cors.ts`. The preamble in `create-checkout.ts`/`customer-portal.ts` is character-for-character the same as `gemini.ts:64-80` (allowed → 204 + end; disallowed → 403; no headers when `corsHeadersFor` returns null). `corsHeadersFor` returns null when origin absent or `ALLOWED_ORIGIN` unset → same-origin unchanged; `*` rejected in `parseAllowedOrigins`. |
| 9 | `automatic_tax` present only when `STRIPE_AUTOMATIC_TAX==='true'`; `tax_id_collection` stays enabled | **CONFIRMED** | `api/create-checkout.ts:245`: `...(automaticTaxEnabled ? { automatic_tax: { enabled: true } } : {})` where `automaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX === 'true'` (`:245`/`:244`). `tax_id_collection: { enabled: true }` is unconditional (`:268`). Tests `checkoutAutomaticTax.test.ts` assert presence on `'true'`, absence (`'automatic_tax' in args === false`) when unset and when `'false'`, and `tax_id_collection` enabled regardless. |
| 10 | Plan-policy/seat invariants stay pinned; new default-in-bounds assertion correct | **CONFIRMED** | `planPolicy.test.ts` + `entitlementConstants.test.ts` pass. New assertions (`entitlementConstants.test.ts:56-60`) check client `SCHOOL_SEAT_LIMITS.default` (=30, `services/entitlements.ts:469`) is ≥ min (5) and ≤ max (1000); server copy `{min:5,max:1000}` still equals client min/max. Assertion is meaningful (real value in range). |
| 11 | British/Australian spelling in new/changed text | **CONFIRMED** | Scan of added lines found only "cancelled" (British, in prose) and `canceled` in backticks — the latter is the literal Stripe subscription `status` value, correctly spelled. No `color`/`behavior`/`license`/`analyze` etc. introduced. |
| 12 | Relevant unit tests green | **CONFIRMED** | See §4 — 7 files, 55 tests, all passing. |

## 3. Anything unconfirmed or needing a human

- **Claim 2 (origin-address throw) — needs a human/operator confirmation.** Official
  docs confirm origin address is a prerequisite but do not state verbatim that
  session creation *throws* on a missing account origin address (Stripe usually
  defaults the origin to the business address). The opt-in flag is safe either
  way; before flipping `STRIPE_AUTOMATIC_TAX=true` the operator should do a live
  test checkout in Stripe test mode to confirm behaviour on their account, as the
  docs instruct. This is the correct operational posture the change already takes.
- **`automatic_tax` + address collection (operational, not a code defect).** The
  session uses `billing_address_collection: 'auto'`. Stripe recommends
  `billing_address_collection: 'required'` alongside `automatic_tax[enabled]=true`
  so a billing address is always available for tax location. `'auto'` still
  collects an address when needed for tax, so this is not a bug, but the operator
  should verify tax is computed on their first live session. Worth a human eye,
  not a blocker.
- **`duplicateSubscriptionGuard.test.ts` "ignores a cancelled subscription" is
  partly trivial.** It sets `existingSubscription = null` and asserts a session is
  created — identical to the happy-path case. The Supabase mock's `.in()` is a
  no-op, so the test does not actually exercise the `active/trialing/past_due`
  filter excluding a `canceled` row; the comment concedes "the `.in()` filter
  would exclude it server-side." The exclusion is correct in production code (a
  `canceled` status is genuinely outside the `.in()` set, and the webhook writes
  `status: 'canceled'` at `api/stripe-webhook.ts:547`), but it is asserted by
  construction, not by the test. Non-blocking; a stronger test would make the mock
  honour `.in()` and feed it a `canceled` row.

## 4. Test results

Command:
```
npx vitest run tests/unit/billingCors.test.ts tests/unit/duplicateSubscriptionGuard.test.ts \
  tests/unit/checkoutAutomaticTax.test.ts tests/unit/schoolLicence.test.ts \
  tests/unit/entitlementConstants.test.ts tests/unit/stripeReturnBase.test.ts \
  tests/unit/planPolicy.test.ts
```
Result:
```
 Test Files  7 passed (7)
      Tests  55 passed (55)
   Duration  2.13s
```
(`npm ci` was not required — no missing-`node`-types errors.)

### Active-problem checks requested

- **`.in(['active','trialing','past_due'])` blocking a legit re-subscribe?** No.
  `canceled`, `incomplete`, `incomplete_expired` are outside the set, so a
  cancelled user can re-subscribe (`api/create-checkout.ts:190`).
- **CORS OPTIONS branch short-circuiting a same-origin POST?** No — the branch is
  gated on `req.method === 'OPTIONS'` only; a same-origin POST is method POST and
  falls through. With no `ALLOWED_ORIGIN`/no Origin header, `corsHeadersFor`
  returns null and no CORS headers are emitted.
- **`automatic_tax` throwing for existing correctly-configured deployments?** No —
  the key is absent unless `STRIPE_AUTOMATIC_TAX === 'true'`, so unchanged
  deployments send byte-identical session params.
- **Trivially-passing tests?** One, noted in §3 (cancelled-subscription case).
```

## 5. Post-verification refinements

Both non-blocking items from §3 were addressed after this verification pass, in
the same branch:

- **`billing_address_collection` with automatic tax.** `api/create-checkout.ts`
  now sets `billing_address_collection: automaticTaxEnabled ? 'required' : 'auto'`,
  adopting Stripe's recommended pairing so a tax location is always captured when
  tax is on, while a plain card purchase off the tax path is not made to enter an
  address it doesn't need. A test case in `checkoutAutomaticTax.test.ts` pins both
  branches. The operator's live test-mode check before flipping the flag remains
  the correct posture and is unchanged.
- **Strengthened the cancelled-subscription test.** The Supabase mock in
  `duplicateSubscriptionGuard.test.ts` now honours the `.in()` status filter, and
  the "ignores a cancelled subscription" case feeds it a real `status: 'canceled'`
  row — so it exercises the exclusion rather than asserting it by construction.

Claim 2 (whether Stripe throws verbatim on a missing origin address) is unchanged:
still a documentation-precision note, safe by design, to be confirmed by the
operator's live test checkout.
