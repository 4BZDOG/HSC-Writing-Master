# HSC AI Evaluator — Review & Roadmap

**Last updated**: June 2026 | **App version**: 2.2.2

This document consolidates a full project review with a prioritized, stabilization-first roadmap. It complements the two existing trackers:

- [`ProjectHealth.md`](../ProjectHealth.md) — the live bug/debt tracker (issue-by-issue status).
- [`featureRoadmap.md`](./featureRoadmap.md) — the forward-looking feature vision (analytics, multimodal, collaboration, subject expansion).

---

## 1. Review summary

The HSC AI Evaluator is a **mature, offline-first React 19 + TypeScript + Vite SPA** that turns NESA syllabus content into exam-ready assessment tasks and marks student writing with Google Gemini 3. It is well-architected: a clear hooks/services/utils split, IndexedDB persistence with backups, a Gemini circuit breaker, code-split bundles, GitHub Actions CI deploying to Netlify, and strong documentation.

**Health snapshot (post June-2026 hardening):**

| Area            | State                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Architecture    | ✅ Strong — clean separation, reusable utilities (`dataCloneUtils`, `errorHandler`, Zod schemas) |
| Type safety     | ✅ Improved — `any` removed from the critical handler boundaries (QUAL-01)                       |
| Crash safety    | ✅ Improved — residual null-deref crash fixed; stale-state cache writes guarded                  |
| Data integrity  | ✅ Improved — imports validated against Zod, batch imports all-or-nothing                        |
| Error UX        | ✅ Improved — CORS/timeout/safety-block paths now have specific, recoverable messaging           |
| Unit tests      | ✅ 66 passing; new `stateUtils` coverage                                                         |
| **E2E tests**   | ⚠️ **Still smoke/placeholder — top remaining gap (IDEA-06)**                                     |
| Auth            | ⚠️ Demo-only mock auth, now gated by env flag; needs a real provider before real users (IDEA-02) |
| AI key exposure | ⚠️ Key still ships client-side; backend proxy recommended (IDEA-01)                              |

---

## 2. Completed — Stabilization pass (v2.2.2, June 2026)

All previously-open ProjectHealth items except IDEA-06 and the architectural IDEAs were closed:

- **Crash/correctness**: residual BUG-01 guard, `findAndUpdateItem` success-boolean + guarded cache writes (QUAL-04), explicit handler types (QUAL-01), null-safety consistency (QUAL-02), surfaced silent save failures (QUAL-03).
- **Performance**: optimized delete clone (PERF-01), IDB connection close on HMR (PERF-03).
- **Data integrity**: Zod-validated, all-or-nothing imports (UX-01, UX-02).
- **Error UX**: CORS/timeout categories (UX-05), `SafetyBlockError` recovery (UX-03), non-blocking enrichment badge (UX-04).
- **Hygiene**: deleted dead `components/App.tsx`, re-enabled `react-hooks/exhaustive-deps` as a warning, gated demo credentials behind `VITE_ENABLE_MOCK_AUTH` (SEC-02), aligned doc versions.

See `changeLog.md` [2.2.2] for the full list.

---

## 3. Roadmap — sequenced, stabilization first

### Phase A — Finish stabilization (next)

1. **Real E2E coverage (IDEA-06)** — replace the placeholder Playwright specs with workflow tests: guest login → navigator → create course/topic/subtopic/prompt → evaluate; import/export round-trip; error states (API down, quota, safety block). _Must be authored and run in an environment with Playwright browsers + dev server so CI stays green._
2. **Raise the `exhaustive-deps` warnings to fixes** — work through the ~10 surfaced warnings (notably `useGemini` enrichment effect and `useNavigation`), then consider promoting the rule to `error`.
3. **Tighten remaining `any` / lint rules** — once the codebase is clean, flip `@typescript-eslint/no-explicit-any` and `no-unused-vars` to `warn`.

### Phase B — Production-readiness for real users

4. **Backend AI proxy (IDEA-01)** — route Gemini calls through an Edge function (Netlify/Vercel/Cloudflare) so the API key never ships to the client; add per-user rate limiting + usage logging.
5. **Real auth provider (IDEA-02)** — replace mock auth with Supabase/Firebase/Clerk; enables per-user data, roles, and audit.
6. **Multi-device sync (IDEA-04)** — optional cloud sync layer so history follows a student across devices (depends on #5).

### Phase C — Feature growth (per `featureRoadmap.md`)

Only after Phases A–B: longitudinal analytics (progress radar, weakness heatmap), multimodal OCR of handwritten papers, Socratic mode, collaborative/global library, and subject-specific rubric modules (English PEEL, History historiography, Maths working).

### Ongoing

- **Component primitive library (IDEA-05)** — extract repeated glass-card/tier-badge/confirmation patterns into `components/ui/`.
- **Dependency hygiene** — quarterly updates; make `npm audit` blocking at moderate+ once clean.

---

## 4. Verification baseline

The current state passes:

```bash
npm run type-check     # clean
npm run test -- --run  # 66 unit tests pass
npm run lint           # 0 errors (10 exhaustive-deps warnings, intentional)
npm run build          # succeeds, code-split bundles
```

E2E (`npm run test:e2e`) requires Playwright browsers + a running dev server and is the focus of Phase A #1.
