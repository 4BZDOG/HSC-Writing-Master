# HSC AI Evaluator - Change Log

## [2.3.4] - 2026-07-05

### 🔔 Quota UX

- **Quota-exhaustion notification** (roadmap → Mid-term): users are now nudged as their daily AI allowance runs low instead of hitting a silent 429 wall. The proxy echoes the caller's post-call usage on every authenticated response (an additive `__quota` field, mirroring the `__keyOverride` convention and ignored by provider-response consumers) and on the 429 body, so the client learns its budget without an extra round trip. `aiCore` feeds each snapshot to a new `services/quotaNotifier.ts`, which raises an **in-app toast at 80% (info) and 100% (error)** — deduped **once per threshold per UTC day** via `localStorage` so it nudges rather than nags, and resetting when the day rolls (matching the server's midnight-UTC reset). The threshold logic is a pure, unit-tested module (`utils/quotaWarnings.ts`: crossing the highest fresh threshold, so a jump straight past 100% still surfaces the "reached" warning). No effect in local mode (no identities to meter).

### 🎨 UX Fixes

- **Command Verb Hierarchy ribbon**: fixed the square-corner flash on animation — the scaling tier cards and the fade-in active-verb hero card now carry `clip-stable` (the compositing hint the rest of the app already uses), so their `rounded-[32px]` mask applies from the first frame. Also fixed a dead easing class (`cubic-bezier(...)` was being emitted as invalid utility tokens); the tier-card focus transition now uses the intended spring curve via `ease-[cubic-bezier(0.34,1.56,0.64,1)]`.
- **Review Queue modal**: added the missing `clip-stable` to its panel — it was the one admin modal whose rounded border flashed square during the open animation (the other admin modals already had it).

---

## [2.3.3] - 2026-07-05

### 🛠️ Admin Tooling

- **AI Usage Dashboard — per-engine breakdown**: completes the roadmap's _Dashboard depth_ item. The proxy now attributes each call to the engine that served it, so the dashboard shows a **Spend by engine — last 7 days** table (calls + estimated cost per model, dearest-first, with a total) and the **Est. Cost Today** tile switches from a bounded range to an **exact** figure once attributed data exists (it still falls back to the range on an un-migrated database or before any calls). A new **reporting-only** `ai_model_usage` table (schema §11) is incremented by a `record_ai_model_usage()` RPC the proxy calls **best-effort** after a quota unit is spent — deliberately kept separate from `consume_ai_quota()` so it can never block a request or affect a budget (a blank/oversized model tag is ignored; a missing RPC or transient failure is swallowed). Reads through the new reviewer-gated `get_ai_model_usage_report(p_days)` (clamped 1–31 days). Pricing/aggregation stay in the pure, unit-tested `utils/usageReport.ts` (`aggregateModelCosts`), and the proxy path is covered in `tests/unit/proxyQuota.test.ts` (records on allow/fail-open, never on 429/401, skips when no model tag). Rows for models absent from the registry still show, labelled by their raw provider string at zero cost.

---

## [2.3.2] - 2026-07-05

### 🛠️ Admin Tooling

- **AI Usage Dashboard — spend depth**: the dashboard now turns raw call counts into money and a portable report (roadmap → Near-term → _Dashboard depth_). A new **Est. Cost Today** headline tile estimates the day's spend as `calls × per-call price`; because the quota counter records calls (not which model served each), the figure is honestly presented as a **range bounded by the active basic and reasoning engines**, labelled with those engines. A header **CSV export** button downloads the full reviewer-gated usage report (`hsc_ai_usage_<utc-day>.csv`, columns Day/Username/Role/Calls/Limit/Override, newest day first). Per-call prices live in the engine registry (`services/aiModels.ts` → `estCostPerCall`, a blended estimate for a marking-sized exchange at Jan-2026 list prices) so a new model carries its own price. The cost/CSV logic is a pure, unit-tested module (`utils/usageReport.ts`: `usageReportToCsv`, `estimateCostRange`, `formatUsd`/`formatCostRange`). A true **per-model breakdown** remains — it needs the proxy to attribute each call to its engine (a follow-up `ai_model_usage` table); noted in the roadmap.

---

## [2.3.1] - 2026-07-04

### 🤖 Models

- **Open-source models via OpenRouter**: a new provider adapter (`api/_lib/openrouter.ts`) fronts OpenRouter's OpenAI-compatible endpoint, so one `OPENROUTER_API_KEY` unlocks the whole open-model catalogue. Four are seeded in the engine registry — **GLM 4.6**, **DeepSeek V3**, **Qwen 2.5 72B** and **Llama 3.3 70B** — and appear in the admin AI Engine selector alongside Gemini and Claude; adding more is a one-line `services/aiModels.ts` edit (any OpenRouter slug). The adapter mirrors the Anthropic one: it translates the app's Gemini-shaped requests into the OpenAI chat format (JSON mode enforced by a system message for broad model compatibility) and maps the response back into the `{ text, candidates, usageMetadata }` envelope, so nothing else in the app changes. The key threads through the same server env + runtime-key-modal paths as the other providers, and the Runtime AI Keys modal now has an OpenRouter field with a link to `openrouter.ai/keys`.

### 🛠️ Admin Tooling

- **Runtime AI Keys (local testing)**: a new admin-only header modal (`components/admin/RuntimeKeyModal.tsx`, key icon) lets you paste a Gemini and/or Anthropic key at runtime to exercise the models without editing `.env.local` and restarting. The key is held in `sessionStorage` (per-tab, cleared on close) and threaded to the proxy as a **per-request override** (`__keyOverride`, merged over the server env key in `runAiProxy` and stripped before it reaches any provider SDK). It never replaces the server key for other users and does **not** lift the proxy's auth or daily-quota gates — supplying a key you already hold can't expose the server key. The field masks the current key, previews reveal on demand, and a warning frames it as a testing affordance (prefer `.env.local` for anything long-lived). Model selection stays where it was — the **AI Engine** selector in the API telemetry widget.

---

## [2.3.0] - 2026-07-04

### 🔐 Roles & Access

- **Teacher Role Split**: Teachers no longer inherit full admin. A distinct `teacher` app role (mapped from the Supabase `teacher` role) keeps content curation and the Review Queue but loses the Database Manager, Data Vault, Content Audit Studio, API monitor and dev tools. Capability helpers live in `utils/permissions.ts` (`canCurateContent` / `canModerate` / `isSystemAdmin`), mirroring the schema's `is_reviewer()` / `is_admin()` split. Added a `teacher`/`teacher` demo account.

### 🛠️ Admin Tooling

- **Content Audit Studio — Batch Engine**: every bulk run can now target an explicitly chosen AI engine (App Default, Gemini Flash/Pro, Claude Sonnet/Haiku) via a non-persistent override in `aiConfig`; the active engine shows as a chip in the processing log.
- **Fix All Gaps**: one batch that fills every gap in the selection — questions for empty dot points, missing/non-standard rubrics, unlinked outcomes, missing samples — composed from the same per-node task builders as the single actions.
- **Honest Buttons + Inline Flags**: batch buttons show the exact target count for the current selection and disable at zero; tree rows carry colour-coded data-quality badges (No Questions / No Rubric / Rubric ⚠ / No Samples / No Outcomes) so problems are visible while browsing.
- **Batch Reliability**: `runBatchOperations` emits progress immediately (the footer used to look idle — with clickable buttons — until the first task settled); Stop now drains the in-flight task before the UI reports stopped; progress accounts for failed tasks; end-of-run summary toast.
- **Sync to Shared Library**: in Supabase mode the studio tracks every prompt its batch runs repair and offers a "Sync to Library (N)" push — each touched prompt (plus its sample answers) goes through the sanctioned `contributionService` write path as `pending`, so studio repairs flow through the same review queue as user submissions instead of staying trapped in local IndexedDB. Failed pushes stay queued for retry.
- **AI Usage Dashboard**: a dedicated admin surface (header gauge icon, `components/admin/UsageDashboard.tsx`) for monitoring and adjusting AI spend. Headline tiles (calls today across all users, active users, the admin's own remaining budget), a zero-filled 7-day call trend, and a per-user "today" table where every user's usage shows as a bounded `used/limit` meter with **inline** per-user override editing (set or clear a personal daily limit without leaving the row). A fallback editor adjusts any user who hasn't called the AI today, and the group (role) daily limits are editable in the same view. Reads through a new reviewer-gated `get_ai_usage_report(p_days)` RPC (schema §11, clamped 1–31 days) and writes through the existing admin-gated quota RPCs. Gated to system admins and to Supabase mode — local mode shows a "requires Supabase" explainer since there are no user identities to meter.

### 🐛 Fixes

- **Database Manager**: uploaded backups get their own key instead of being silently swallowed by (or overwriting) the daily auto-backup; Force Sync/Restore report real write status instead of always claiming success; restores run through the full migrate/validate/recalculate import pipeline; imported snapshots show an "Imported" badge and time, sorted newest-first.
- **Generator Modals**: target bands are capped by the verb tier everywhere (generator, editor, defaults); the sample-answer generator resets its mark when reopened for a different prompt; unusual marks/verb pairings get a non-blocking advisory; Manual Entry previews the actual verb tier the AI will target.
- **Audit Studio**: generating a question for a dot point without a `prompts` array no longer crashes; "Select All Filtered" respects the search query instead of selecting across the whole library.

### 🎨 UX

- All admin `window.confirm()` prompts replaced with the app's styled `ConfirmationModal` (which now closes on Escape and nests safely inside other overlays); Escape closes the admin modals when idle (never mid-operation); Review Queue gained a pending count, kind filters and full-text expansion before deciding; the Data Browser can switch object stores in place; the audit tree gained Expand/Collapse All and Clear Selection.

### 🔎 Quality Screening & Review Flow

- **Screen Quality (audit studio)**: new batch action that AI-scores every selected question (0–100, via the same `screenContentQuality` pre-screen used for user contributions) and stores the score + notes on the prompt. Scored content shows a colour-coded inline `AI n` badge (notes on hover), a **Low Quality** filter chip (< 50) joins the gap filters, and stored scores ride along when repairs sync to the shared library so the review queue can triage them.
- **Review Queue context**: sample answers now show their parent question ("For: …", fetched via a PostgREST embed) so reviewers judge answers in context rather than blind.
- **Approve All (visible)**: bulk-approve everything currently listed — respecting the kind filter — behind a confirmation dialog; failures stay in the queue. Built for clearing a checked batch of audit-studio repairs.
- **Self-hosted fonts**: Inter/JetBrains Mono/Newsreader now bundle via `@fontsource` instead of a runtime fonts.googleapis.com request — the app makes zero external requests, so typography renders on restrictive school networks and offline.

### 🏭 Production Hardening

- **AI Usage Quotas (per user + per group)**: the AI proxy now enforces server-side daily budgets (schema §11). Each proxied call atomically spends one unit of the caller's allowance — per-user override (`set_user_ai_quota`) beats the role/group default (`ai_quota_limits`: admin 1000 / teacher 400 / student 60) — and an exhausted budget returns 429 *before* the paid provider is contacted. The client fast-fails hard-limit 429s (no wasted retries) and surfaces the reset time; admins manage limits and see their own usage in the API telemetry widget's new **Daily AI Quotas** panel. Fails open (with a logged warning) if the schema migration hasn't been applied, so a code-first deploy can't brick AI features; the auth gate still blocks anonymous spending.

- **Compiled Tailwind**: styling is now built into the bundle (`tailwind.config.js` + `index.css`, ported verbatim from the former inline CDN config and `<style>` block). The `cdn.tailwindcss.com` runtime script — explicitly not for production use — and the dead CDN import map are gone: the app renders fully styled offline/behind restrictive networks, `index.html` dropped from 13.5 kB to 1.8 kB, and the only remaining external request is the gracefully-degrading Google Fonts import.
- **Demo Auth Opt-In**: production builds refuse the local demo accounts (admin/teacher/user) with an actionable error unless `VITE_ENABLE_DEMO_AUTH=true` is set — a deploy that forgot its Supabase env vars no longer silently ships a working `admin`/`admin` login. Dev builds are unaffected; guest access (read-only, local-only) is never gated; the login page only advertises demo accounts when they actually work.

---

## [2.2.3] - 2026-06-30

### 🐛 Fixes

- **Ribbon Corner Flash**: Eliminated the square-corner artifact that flashed before the rounded corners settled when the writing progression ribbon (Editor header) animated. Added a `.clip-stable` utility that promotes rounded `overflow-hidden` surfaces to their own compositing layer up front, so the radius clip applies from the first frame. The Editor/Prompt headers and footers now also carry explicit matching corner radii as a fallback.
- **Cut-off Borders**: Removed the redundant `rounded-3xl overflow-hidden` wrapper around the Syllabus Reference panel that was clipping the inner accordion cards' rounded borders at the corners.
- **Project-wide Clip Stabilisation**: Extended `.clip-stable` to the remaining animated rounded `overflow-hidden` surfaces so they no longer flash square corners on entrance/transition — the Writing Metrics dashboard, Sample Answers and Marking Guide accordions, the gradient-header modals (Evaluation Result, Improvement Review, Outcome Detail, Command Term Guide, Sample Answer Generator), the Command Verb Hierarchy card, the Login card, and the idle/empty-state card.
- **Full Modal Uniformity**: Completed the pass across every remaining `animate-fade-in-up` modal panel (creators, importers, generators, the Data Manager, User Profile, Database Dashboard, confirmation/rename dialogs) and the Data Manager course-reorder cards, so all dialogs share the same flash-free rounded-corner entrance. Verified safe — each modal's only `position: fixed` element is its backdrop overlay, and embedded dropdowns are absolutely positioned, so promoting the panel to its own layer affects no fixed descendants.

- **Scrollbar Styling**: Fixed the `.custom-scrollbar` rule — the track was declared twice (the second actually styling the thumb) and there was no default thumb rule, so dark-theme panels fell back to the chunky native scrollbar. Slim themed thumbs now render in both themes, with hover states and Firefox (`scrollbar-width`/`scrollbar-color`) support. Also defined the missing `.scrollbar-hide` utility that the main workspace column, breadcrumb rail and verb-hierarchy carousel relied on (it isn't part of the Tailwind CDN build, so native scrollbars had been leaking through).

### ♿ Accessibility

- **Keyboard Focus Rings**: Replaced the blanket `outline: none !important` (which silently failed WCAG 2.4.7 — keyboard users had no visible focus anywhere) with a `:focus-visible` accent ring. Pointer interaction stays ring-free, so the mouse-driven look is unchanged.
- **Icon Button Labels**: Added `aria-label`s to icon-only modal close buttons that lacked them (and the Manifest search-clear button), so screen readers announce a purpose instead of an unlabelled button.
- **More Icon Labels**: Extended the audit to the remaining icon-only controls — the focus-mode toggle (now also `aria-pressed`), Sample Answers prev/next, Marking Guide save/cancel, the keyword add button, the prompt enrich-error dismiss, profile save, and the database back button.

### 🎨 Design

- **Border Consistency**: Normalised faint `border-white/5` outlines and dividers up to `border-white/10` across the main user-facing flow — the Prompt card footer and outcome chips, the Evaluation Result modal header, the Sample Answers dividers, the Breadcrumb bar, and the idle-state card. The dense admin/data-manager tools were intentionally left on their own consistent `/5` scale.
- **Glow Rendering Fix**: The band `glow` tokens are colour-only Tailwind shadow classes (`shadow-{color}/25`), which set the shadow colour but render nothing without a paired shadow-size utility. The Editor card, Prompt card and Command Term Guide modal were setting a glow with no size, so the signature chromatic glow never appeared; added `shadow-2xl` so it renders. Also gave the Evaluate button a resting `shadow-xl` so its band-coloured haptic glow shows before hover, not only on it.
- **Dead Opacity Modifiers**: Removed ~38 `border-opacity-*`/`bg-opacity-*` (and `hover:`/`light:` variants) utility classes across 12 components. Every band colour token (`getBandConfig`, `getStatusColor`) uses Tailwind's modern slash-alpha syntax (e.g. `border-purple-500/50`), which bakes the alpha in directly — the separate legacy opacity-modifier utilities only affect non-slash colours, so every one of these was a confirmed no-op (decorative dead code implying a hover/selection effect that never fired). Pure cleanup, zero visual change.
- **Broken Hover Interpolation**: Fixed `hover:${tierConfig.bg}` in the Command Verb Hierarchy tier-filter pills — interpolating a multi-class token string directly after a `hover:` prefix only scopes the _first_ class to hover; the trailing `light:`/`print:` classes lost their `hover:` condition and were rendering unconditionally, tinting the pill's background at all times in light mode instead of only on hover.

### 🛠️ Stacking / Layering

- **Invisible Confirmation Dialog**: `DataManagerModal` (`z-[500]`) opens the shared `ConfirmationModal` for its "Clear All Data" / "Reset to Default" prompts from buttons inside itself, but `ConfirmationModal` (and `RenameModal`, the other globally-triggered dialog) was only `z-50` — well below Data Manager's own overlay. The confirmation for a destructive, irreversible action was rendering completely invisible and unclickable behind the still-open Data Manager. Raised both to `z-[2200]`, above every other overlay in the app, since they can be invoked from inside any other modal.

### ⏱️ Timer / Calculation Fixes

- **Writing Timer Churn + Stuck Icon**: The writing-time countdown effect listed `remainingTime` in its own dependency array, tearing down and recreating the `setInterval` on every single tick instead of running one persistent interval. It also never reset `isTimerActive` when the countdown reached 0:00, so the Pause icon kept showing after the timer had stopped — a paused-looking control that was actually already finished. Rewritten to a single stable interval that stops itself and flips back to Play at zero.
- **NaN% Guard**: The writing-progress percentage (in both the editor ribbon and the metrics dashboard) divided word count by a target word count derived from `prompt.totalMarks`. A malformed/zero-mark prompt would make that target 0, turning the ratio into `NaN`/`Infinity` and rendering "NaN%". Both call sites now floor the target at 1.

---

## [2.2.1] - 2025-05-23

### 🚀 Features

- **Gemini 3 Pro Integration**: Upgraded evaluation and generation to `gemini-3-pro-preview`.
- **Thinking Config**: Enabled reasoning budgets (up to 8k tokens) for complex marking tasks.
- **Vault Maintenance**: Integrated "Data Vault" into the primary selector for rapid data access.
- **Syllabus Audit v2**: Enhanced validation logic for "Complete" vs "Incomplete" curriculum points.

### 🎨 Design

- **Mesh Overlays**: Added cubic SVG textures to all major header surfaces.
- **Chromatic Progression**: The Editor's theme now dynamically shifts through a quality-based color scale.
- **Luminous Progress**: Refactored the Analysis Progress Bar with segmented high-density tracking and live micro-logs.

### 🔧 Maintenance

- **Documentation Audit**: Synchronized all `projectDocs` to reflect the final architectural state.
- **TypeScript Fixes**: Resolved inheritance issues in `ErrorBoundary` and type assertions in the Library system.
- **Data Integrity**: Implemented a "Repair Verbs" migration to fix mismatched verbs in imported datasets.

---

## [2.2.0] - 2025-05-22

### 🚀 Features

- **Strict Band Logic**: Implemented deterministic math for Band calculation based on Cognitive Tiers.
- **Time Machine**: Added Snapshot preview and restore capabilities to the Database Dashboard.
- **XP System**: Simulated Leveling/XP system for user engagement.

## [2.1.0] - 2025-05-18

### 🚀 Features

- **Admin Audit Studio**: First iteration of the bulk-processing dashboard.
- **Quality Check API**: Added dedicated endpoint for reviewing question/code quality.

## [2.0.0] - 2025-05-15

### 🛠️ Architecture

- **IndexedDB Migration**: Full data persistence layer using `idb`.
- **API Guard**: Circuit breaker implementation to handle rate limits and errors.
