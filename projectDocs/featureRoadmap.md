# HSC AI Evaluator — Feature Roadmap

_Last updated: 2026-07-05 · reflects v2.3.2._

## 1. Current Capabilities (v2.3.0)

### 🧭 Intelligent Syllabus Navigator
- **Hierarchical Browsing**: Course > Topic > Sub-Topic > Dot Point > Question.
- **Discovery Engine**: Automatically detects local course manifests and suggests relevant modules.
- **Visual Health Rings**: Real-time coverage analytics for syllabus dot points.

### 🧠 AI-Powered Evaluation Engine
- **Reasoning-tier marking**: strict NESA-verb adherence, no "participation marks" for off-verb responses.
- **Dynamic Rubric Synthesis**: generates descending 1–N mark rubrics on demand for any question.
- **The Improvement Loop**: guided "N+1" band upgrades with side-by-side comparison.
- **Selectable AI engines**: every AI action can target a chosen engine — Gemini Flash/Pro, Claude Sonnet/Haiku, and open-source models via OpenRouter (GLM, DeepSeek, Qwen, Llama) — through the runtime registry (`services/aiModels.ts` + `services/aiConfig.ts`); batch runs can override the engine non-persistently, and admins can paste keys at runtime for local testing.
- **Secure AI proxy**: all provider calls go through the server-side `/api/gemini` proxy so keys never reach the browser; the proxy authenticates the caller and enforces daily quotas.

### ✍️ Writing Workspace
- **Chromatic Editor**: visual theme shifts based on response quality.
- **Live Metrics**: word count, keywords, and structural signposts.
- **Reference Pane**: Band Descriptors and tailored Marking Criteria.

### 👥 Roles, Moderation & Shared Library
- **Role split**: `admin` / `teacher` / `user` / `guest`. Teachers curate content + run the Review Queue but do **not** get the system-administration tools. Capabilities live in `utils/permissions.ts` (`canCurateContent` / `canModerate` / `isSystemAdmin`), mirroring the schema's `is_reviewer()` / `is_admin()`.
- **Contribution loop**: users/AI draft content as `private`, submit to `pending`, and reviewers approve to `approved` via reviewer-gated RPCs. Enforced in the database, not just the UI (`enforce_content_status_authority`).
- **Review Queue**: lowest-quality-first triage with an AI pre-screen score, parent-question context, and bulk "Approve All (visible)".

### 🛠️ Admin & Data Tools
- **Content Audit Studio**: batch-generate/repair questions, rubrics, samples, and outcome links across a whole selection with a selectable AI engine, "Fix All Gaps", inline data-quality badges, and "Sync to Library" (repairs flow through the review queue).
- **Data Vault**: backups (Time Machine) + full JSON Import/Export with conflict resolution.
- **Database Manager**: internal storage health, force-sync, restore, data browser.
- **AI Usage Dashboard**: monitor spend (calls today, active users, 7-day trend, per-user meters), an **estimated daily cost** bounded by the active basic/reasoning engines' per-call prices, one-click **CSV export** of the usage report, and inline adjustment of per-user + per-group daily quotas (Supabase mode).
- **Circuit Breaker**: API Guard monitoring error rates (429s) to prevent lockout.

### 🏭 Production Hardening
- Server-enforced **AI usage quotas** (per user + per group, fail-open); compiled Tailwind + self-hosted fonts (**zero external requests**, renders offline); demo-auth opt-in for production builds.

---

## 2. Roadmap Forward

> Rationale: finish the loops we most recently opened (moderation + quotas) and
> close the one genuine security gap before taking on the privacy work that
> gates real student use.

### Near-term — finish the loops we started
- **Server-side quality screening**: move the contribution pre-screen from the author's browser to an edge function so the score can't be forged (currently advisory only — see `supabase/README.md`). Hardens the moderation flow.
- **Dashboard depth**: ✅ _shipped in v2.3.2_ — the dashboard now shows an estimated daily cost (calls × per-call price, bounded by the active engines) and exports the full usage report to CSV. **Remaining**: a true per-model breakdown, which needs the proxy/quota counter to record which engine served each call (today `ai_usage` counts calls only) — a small `ai_model_usage` reporting table incremented alongside `consume_ai_quota` is the natural next step.
- **e2e coverage for quotas**: add the 429-enforcement + dashboard-override path to the stubbed Playwright suite. It gates spend, so it's the highest-value flow to protect.

### Mid-term — close the "next phase" gaps
- **Structural write path + moderation** for courses/topics/dot points (today only leaf prompts/samples sync back; structure is local-only).
- **Persist responses**: write student drafts + AI feedback to the `responses` table (schema exists, unused) — the prerequisite for any longitudinal feature.
- **Quota-exhaustion notification**: warn the user at 80% / 100% instead of a silent wall (in-app, optionally email).

### Longer-term — deployment gate & payoff
- **Privacy & data residency** (hard gate before real students): Australian region, pseudonymisation of student work, DoE third-party-tool policy sign-off.
- **Longitudinal analytics**: Student Progress Radar across cognitive tiers; Weakness Heatmap of difficult verbs/modules (unlocked by persisted responses).
- **Teacher-facing class analytics**: who's struggling, common weak bands — the feature that makes this a teaching tool, not just a marking toy.

### Exploratory
- **Multimodal OCR**: photograph handwritten papers for transcription + marking.
- **Socratic Mode**: guiding questions instead of direct answers.
- **Subject expansion**: domain-specific reasoning modules (English PEEL, History historiography, Maths working).
