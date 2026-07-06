# HSC AI Evaluator - Change Log

## [2.3.18] - 2026-07-06

### 🎯 Band-colour consistency — robust, app-wide

- **One helper, one colour per verb, everywhere.** The tier-vs-band colour clash could recur anywhere that fed a raw cognitive tier into `getBandConfig` (which maps its argument as a *band*). Added a single self-documenting helper — **`getTierBandConfig(tier)`** (colour of a tier's target band) in `renderUtils` — and routed every remaining tier-coloured surface through it, so a verb like DESCRIBE is its Band-3 yellow everywhere: the verb-hierarchy ribbon, the question picker (`PromptSelector` + `Combobox`), the command-term guide, the live-metrics logic-connector pills, the **prompt-generator** and **manual-prompt** authoring modals, and the teacher **Class Insights** / **Student Progress** analytics. Also fixed a latent trap: `AnswerMetricsDisplay`'s colour prop was named `tier` but only ever received a *band* — renamed to `band` and documented. Locked in with `getTierBandConfig` tests (colours as the target band, never the tier index).

### 🧭 Syllabus navigator → breadcrumb

- **The picker folds away once you've chosen, so the screen belongs to the writing.** After a student selects a course → … → question, the tall syllabus navigator (and the command-verb reference ribbon) now collapse into a single elegant **breadcrumb bar** (`SyllabusNavBar`): the path, the selected question with its verb badge, marks and target band, and a **Change** button — all tinted in the question's band colour. It stays fully live: click any level to jump back and re-choose (which re-opens the navigator ready at that level), or **Change** to re-open with the selection intact; a **Collapse to breadcrumb** control folds it back. The navigator auto-collapses the moment a question is picked and re-opens whenever the selection is cleared, and the workspace's own breadcrumb is suppressed while the bar is showing so there's no duplication. Focus Mode is unaffected.

---

## [2.3.17] - 2026-07-06

### 🎯 Band-colour consistency (follow-up)

- **A verb is now one colour everywhere.** After 2.3.16 keyed the prompt/writing-area/metrics to a question's *target band*, the surfaces still coloured by raw *cognitive tier* stood out — e.g. DESCRIBE showed **orange** (Tier 2) in the Command Verb Hierarchy ribbon and the question picker, but **yellow** (Band 3) in the prompt and response. Added `getTierTargetBand(tier)` (a tier's band ceiling, mark-independent) and switched every remaining tier-coloured, student-facing surface to the target-band colour: the **verb-hierarchy ribbon** (header, tier cards, cognitive-step dots), the **question picker** (`PromptSelector` option chips + `Combobox` rows), the **command-term guide** popup, and the **logic-connector** pills in the live metrics. DESCRIBE is now Band 3 yellow top to bottom. Admin/authoring tier-pickers (prompt generator, manual prompt) keep tier colours — there the tier itself is what you're choosing. Covered by `getTierTargetBand` tests (tier→band mapping, agreement with `getTargetBand` at full marks).

---

## [2.3.16] - 2026-07-06

### 🎯 Band-coherent live feedback

- **One predefined colour per band, everywhere — and the student writes toward it.** Every question now has a single "target band" (`getTargetBand` in `commandTerms.ts` — the ceiling a full-mark response reaches, set by the verb's cognitive tier), and one canonical colour palette (`BAND_HEX` / `BAND_HEX_DARK` / `getBandHex` in `renderUtils.ts`, the exact hex equivalents of `getBandConfig`'s Tailwind classes). Previously the editor painted its progress with a *different* hex set (amber/emerald/sky/indigo) than the band colours used elsewhere (yellow/green/blue/purple), and the prompt was coloured by cognitive tier while the metrics were coloured by band — so one question showed up to three different colours. Now the **prompt header, writing area, metrics target and keyword pills all render in the question's target-band colour**. A Band 3 question is yellow top to bottom; a Band 5 question is blue; and so on.
- **The writing area "fills in" the band colour as you write.** Instead of cycling through unrelated hues (red → orange → …) as progress rose — which flashed "Band 1" at a student on an easy question — the editor header is now always painted in the target band's colour, with a dark veil that lifts as the response develops. A blank page is a dim version of the band colour; a complete answer is the full vivid band colour with a matching glow. The header/footer now read "Band X · <descriptor>" and "…% → Band X", so the destination is explicit.
- **Prompt design reflects the band.** The prompt header is now coloured by target band (not raw tier) and carries an explicit **"Band X" target badge** next to the marks/time, so the difficulty a student is working toward is stated up front and matches the writing surface.

### 🔑 Better syllabus keywords

- **Higher-signal keyword lists (AI).** The enrichment and "regenerate/suggest keywords" prompts were rewritten to ask, as an HSC marker, for the *specific syllabus terminology a Band-X response must use* — concise technical noun-phrases (1–3 words), subject-specific concepts/processes/structures/named examples only, band- and mark-aware, excluding the command verb and generic filler. All AI keyword output now passes a shared `sanitiseKeywords` guard (trims list markers, drops the verb and generic stop-words like "process"/"factor"/"important", removes case-insensitive duplicates, rejects over-long phrases, caps at 12).
- **Clearer keyword display.** The reference-panel and live-metrics term lists now show a **"used / total" count badge** and colour used terms in the target-band colour (was a generic emerald), with a "Weave these in for a Band X response" framing — so it's obvious which high-value terms are still missing.

Covered by `tests/unit/bandColors.test.ts` (palette is distinct + clamped, `getTargetBand` tier→band mapping, `sanitiseKeywords`). Full suite 389 passing; verified end-to-end in-app (dim→vivid convergence on the shared band colour, unified prompt/editor/metrics/keywords).

---

## [2.3.15] - 2026-07-06

### ✍️ Student Writing Area

- **Two writing modes — Coach & Exam** (`WritingMode` in `types.ts`, session-level state in `App.tsx`, threaded through Workspace → RightPanel → Editor / metrics). A segmented **Coach / Exam** toggle sits in the editor header. **Coach Mode** (default) is the full assisted experience: live keyword/verb highlighting, live insights, syllabus-term tracker, logic connectors, band-progress "phase", and worked exemplars. **Exam Mode** simulates HSC exam conditions — highlighting off, insights/term-tracker/connectors hidden, marking guide + grade standards + reference materials hidden, exemplars hidden, and the recommended-time **countdown auto-starts**. The editor wears a calm neutral "exam booklet" header (red EXAM badge, "no assistance"), the metrics strip down to Mode + Words + Timer, the Evaluate button goes neutral (its colour no longer hints at the predicted band), and bold/italic formatting is dropped. Covered by `tests/unit/writingModes.test.tsx` (Coach highlights / Exam doesn't / toggle present).

### 🐛 Fixes

- **The "Indexing context…" freeze** — auto-enrichment (fetching a prompt's missing scenario / keywords / outcomes on selection) was surfaced through the **blocking full-screen loading modal**, so whenever the AI was slow or unreachable the whole workspace locked up behind it. Enrichment is a background task and no longer blocks: it was removed from the global overlay and now shows as a subtle, non-blocking **"Enhancing"** chip in the prompt header, so a student can start writing immediately.

- **Focus Mode ambience now actually renders** — the 2.3.14 backdrop was painted on the page background, but the always-on `AnimatedBackground` draws an opaque base over it, so it never showed. Moved the effect into `AnimatedBackground` as a `.focus-ambient` layer (above the base, below all content) that fades in via the `body.focus-mode` class — a soft accent glow plus an edge vignette that draws the eye to the centred writing surface, in both themes.

---

## [2.3.14] - 2026-07-06

### ✍️ Student Writing Area

- **Fixed the flickering keyword / verb highlighting (root cause)** — the live overlay that paints keyword and command-verb highlights over the writing area, and the prompt panel that bolds the same terms, both decided which text fragments were matches by calling `regex.test(fragment)` on a **shared global (`/gi`) regex**. `RegExp.test()` on a `/g` regex is stateful — its `lastIndex` carries between calls — so every *other* occurrence of a repeated term silently failed to highlight (e.g. three "cell"s, only the 1st and 3rd lit up). Replaced the stateful re-test with a stateless index-parity check on the `String.split` output (the single capturing group already places matches at the odd indices), so **every** occurrence now highlights in both the editor overlay (`renderEditorHighlights`) and the prompt renderer (`renderFormattedText`). Locked in with a new `renderUtils` test file (repeated keywords, repeated verbs, mixed, case/plural variants, and content-preservation — 6 cases). **Responsiveness**: the overlay's span tree is now memoised so it only rebuilds when the text / keywords / verb actually change (long answers no longer rebuild the whole tree on every keystroke), and the overlay is marked `aria-hidden` so screen readers read the real textarea once instead of the duplicated visual layer.

- **Focus Mode visual pass** — Focus Mode now reads as a distinct, immersive space: a soft, theme-aware ambient gradient is painted on the page background (`body.focus-mode`, on the backmost layer so it can never tint content), and a floating, glassmorphic **"Focus Mode · ESC"** pill (top-centre) makes the exit obvious and discoverable (complementing the header toggle and the Esc shortcut added in 2.3.13). Extra top padding keeps the pill clear of the prompt. Full suite 378 passing; verified end-to-end in the running app (highlighting, live insights, focus entry/exit).

---

## [2.3.13] - 2026-07-06

### ✍️ Student Writing Area

- **Writing area & Focus Mode polish** — a pass over the student writing surface for correctness and premium feel. **Focus Mode** now exits on **Esc** (the universal "exit fullscreen" gesture), working even while the caret is in the textarea; both the toggle and the Evaluate button expose their keyboard shortcuts via tooltips (⌘/Ctrl+Shift+F, Esc, ⌘/Ctrl+Enter). **Correctness**: the editor header no longer reports impossible values like "106% Complete" — the progress label and bar are clamped to 100% (the un-clamped score still drives the exemplar colour glow); the floating **Evaluate** button no longer covers a student's last lines — the editor body reserves bottom space for it; and the **Bold/Italic/List** toolbar buttons now restore focus and place the caret sensibly (inside the markers / after the bullet) instead of losing the cursor. **Metrics dashboard**: the timer shows red at `00:00` (was reverting to blue), Reset also stops a running timer, Play is disabled once time is up, and the char/word counts read singular at 1 ("1 Word"). **Accessibility**: the previously icon-only timer play/pause, reset, and metrics collapse controls gained `aria-label`/`title` (+ `aria-expanded`), and the zoom buttons disable at their 12–32px limits. Full suite 372 passing.

---

## [2.3.12] - 2026-07-05

### 🔐 Moderation

- **Structural write-path (UI)**: wires up the contribute→moderate flow whose backend landed in v2.3.11, so it's now usable end-to-end. **Authoring** — in Supabase mode, creating a topic / sub-topic / dot point also pushes it to the shared library as `pending` (best-effort; silently skipped for guests or when the parent isn't in the library yet), via new `saveTopicContribution` / `saveSubTopicContribution` / `saveDotPointContribution` service functions with pure, unit-tested row mappers. **Moderation** — the Review Queue now lists pending structure alongside questions and sample answers: a new **Structure** filter, kind badges/icons, and approve/reject routed through the reviewer-gated `set_structure_status` RPC (`fetchModerationQueue` fetches pending topics/sub-topics/dot points; `toQueueItems` folds them in, unscored, sorted after AI-scored items). Full suite 372 passing.

---

## [2.3.11] - 2026-07-05

### 🔐 Moderation

- **Structural write-path + moderation (backend)**: the syllabus **structure** (topics / sub-topics / dot points) now enters the same contribute→moderate model as prompts, so user-authored structure can be pushed to the shared library and approved by a reviewer instead of living only in local storage. Schema: `status` + `created_by` (+ `updated_at`) added to the three structural tables (idempotent; existing seeded structure backfilled to `approved`, `seed.mjs` now seeds `approved`); the `enforce_content_status_authority` trigger and status-gated RLS (visible-if-approved-or-own-or-reviewer; own-insert/edit) extended to them; and a single reviewer-gated `set_structure_status(kind, id, status)` RPC (kind-allowlisted, moderation-states only) for approve/reject. Fixed a **latent bug** surfaced by this work: `topics` was in the `updated_at` trigger list without an `updated_at` column, so any topic UPDATE errored — the column is now present on all three tables and the trigger coverage made consistent. Service: `submitToLibrary` generalised to the structural tables and a `moderateStructure` wrapper added (`services/contributionService.ts`). Verified end-to-end on Postgres — the RLS negative suite grew to **14 checks** (all pass), covering no-read-regression for approved structure, blocked self-publish, reviewer-gated moderation, and kind validation. **Next**: the UI wiring (a "submit to library" action in the structure creators and structural items in the Review Queue) — the enforcement + service API are done.

---

## [2.3.10] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress — band trend over time**: the Student Progress modal now shows a **band-over-time sparkline** for a student, so a teacher sees improvement (or slippage), not just a current snapshot. Backed by a new **append-only `response_events`** history table (schema §4-adjacent) — `responses` still keeps only the latest attempt per prompt, while every evaluation now also appends a tiny event (mark/band/word count, no draft text). The client writes it **best-effort** alongside the responses upsert (a lost event only shortens the trend, never the mark); the table is append-only by RLS (own-insert; own-or-reviewer read; **no update/delete**). `get_student_progress` returns the recent band trend (last 100 scored events in the window, oldest→newest), and the modal renders it as an accessible SVG sparkline (raw band sequence in the `aria-label`, band-3 struggling threshold marked) with a first→last delta. Geometry is a pure, unit-tested helper (`utils/classAnalytics.ts` → `sparklinePoints`). Validated against Postgres: schema applies clean, the RLS negative suite still passes 11/11, cross-user event inserts are blocked, and the trend returns the correct ascending sequence. The trend is empty until history accrues (it only records going forward).

---

## [2.3.9] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress — roster picker**: the Student Progress modal now opens to a **clickable roster** of the students who've submitted marked responses in the window (username, response count, average band, and a compact "last active" label), so a teacher can pick from a list instead of remembering exact usernames — the direct username lookup stays as a fallback, and a "Back to students" link returns to the list. Reads a new reviewer-gated **`get_response_students(p_days)`** RPC (attempts desc; exposes only usernames + aggregates, the same identities reviewers already see in the Review Queue / Usage Dashboard). The roster refreshes with the 30d/90d/1y window and loads non-blocking (a slow/empty roster never holds up a direct lookup). "Last active" formatting is a pure, unit-tested helper (`utils/classAnalytics.ts` → `formatLastActive`). Validated against Postgres (correct ordering + aggregates; non-reviewer blocked).

---

## [2.3.8] - 2026-07-05

### 📈 Teacher Tools

- **Student Progress** (roadmap → Student Progress across cognitive tiers): a new reviewer-gated modal (header line-chart icon, `components/admin/StudentProgressModal.tsx`) that profiles one student across the six cognitive tiers. A teacher enters a username and window (30d/90d/1y); the new reviewer-gated **`get_student_progress(p_username, p_days)`** RPC returns that student's per-verb aggregates (server-side — only counts/averages, never raw work; addressed by username, errors on unknown user), which are folded into the tier ladder client-side. Shows headline tiles (attempts, average band), a **per-tier profile** (Recall → Evaluate, each an accessible band bar filled to band ÷ 6 with the band + attempt count as text, blank where un-attempted), and a per-verb detail table. The folding is a pure, unit-tested function (`utils/classAnalytics.ts` → `foldVerbsIntoTiers`, attempt-weighted band per tier). Gated to reviewers (admin + teacher) + Supabase mode. Validated against Postgres: correct per-student isolation, unknown-user error, non-reviewer block.

---

## [2.3.7] - 2026-07-05

### 📊 Teacher Tools

- **Class Insights — topic breakdown**: the cohort weakness view now toggles between **By verb** and **By topic**, so a teacher can see not just which command verbs but which modules a class is struggling with (e.g. "Data Structures" drawing band ≤ 3). `get_class_analytics` gained a `byTopic` aggregation (responses → prompts → dot points → sub-topics → topics, joined and grouped server-side) alongside `byVerb`; both dimensions share a `label` shape so the client ranks them through one path. The ranking util generalised from `rankVerbWeakness` to `rankByWeakness` (tier enrichment now opt-in — verbs carry a cognitive tier, topics don't). Validated against Postgres (correct per-topic aggregation via the four-table join). Verb/topic tests updated; suite green.

---

## [2.3.6] - 2026-07-05

### 📊 Teacher Tools

- **Class Insights** (roadmap → Teacher-facing class analytics / Weakness Heatmap): a new reviewer-gated panel (header bar-chart icon, `components/admin/ClassInsightsModal.tsx`) that turns the persisted `responses` (v2.3.5) into a read on where a cohort is struggling. Cohort headline tiles (marked attempts, active students, average band) plus a **per-command-verb table ranked weakest-first** — attempts, distinct students, average band, and a colour-coded "struggling (band ≤ 3)" rate bar, each verb tagged with its cognitive tier. A 30d / 90d / 1y window selector. Reads a new **reviewer-gated `get_class_analytics(p_days)`** RPC (clamped 1–365 days) that aggregates responses joined to prompts **server-side**, so no raw student work is transferred — only counts and averages. The ranking is a pure, unit-tested module (`utils/classAnalytics.ts` → `rankVerbWeakness`). Gated to reviewers (admin + teacher) and Supabase mode; local mode shows a "requires Supabase" explainer. Validated end-to-end against Postgres (correct verb aggregation + averages; non-reviewers blocked).

---

## [2.3.5] - 2026-07-05

### 📊 Data

- **Persist responses** (roadmap → Mid-term): student attempts and their AI feedback are now written to the previously-unused `responses` table — the substrate every longitudinal feature needs (progress-over-time, weakness heatmaps), which is why it lands first. On each completed evaluation the app upserts one row per `(student, prompt)` (new `uq_responses_user_prompt` index) with the draft, word count, overall mark/band and the full evaluation JSON; a thumbs-up/down on the AI feedback is mirrored onto the same row. All writes go through a new **best-effort** `services/responseService.ts` that no-ops in local mode (no server identity to attribute to), for guests, and for prompts with no shared-library row — and swallows its own failures so persistence never blocks or disrupts marking. Writes are confined to the caller's own rows by the existing `responses_write` RLS policy; reviewers may read all for analytics (both verified against Postgres). The row mapping is a pure, unit-tested function.

---

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
