# Switching AI Engines

The app can run its AI calls on different providers/models, switchable at runtime
without a redeploy. It ships configured for Gemini and runs entirely on Gemini
until an admin chooses otherwise.

## How it works

Every AI call has a logical **role**:

- `reasoning` — high-stakes calls (marking, rubric/sample/exemplar generation)
- `basic` — fast/cheap calls (generation, parsing, keyword/outcome suggestions)

The active model per role is resolved at request-build time and the request is
tagged with `{ provider, model }`. A single proxy (`/api/gemini`, kept that name
for compatibility but provider-agnostic) routes by `provider`.

```
geminiService → aiTarget(role) → resolveTarget(role)   (services/aiConfig.ts)
              → request { provider, model, contents, config }
              → /api/gemini  →  runAiProxy (api/_lib/providers.ts)
                                  ├─ gemini    → runGeminiProxy   (@google/genai)
                                  └─ anthropic → runAnthropicProxy (Messages API)
```

| Piece | File |
| --- | --- |
| Registry of selectable engines | `services/aiModels.ts` |
| Runtime selection + persistence | `services/aiConfig.ts` |
| Per-request provider/model stamping | `services/geminiService.ts` (`aiTarget`) |
| Proxy router (strips `provider`, picks key) | `api/_lib/providers.ts` |
| Gemini adapter | `api/_lib/generate.ts` |
| Anthropic (Claude) adapter + translation | `api/_lib/anthropic.ts` |
| Admin selector UI | `components/ApiMonitorDisplay.tsx` |

## Choosing the engine

Admins get an **AI Engine** selector in the floating API panel (bottom-right):
two dropdowns — one for `Marking & reasoning`, one for `Generation & parsing` —
listing the models offered for that role. The choice persists to local storage
and applies to subsequent requests. The default (Gemini Flash/Pro) is restored
automatically if a stored choice ever becomes invalid.

## Keys

Provider keys stay **server-side** (read by the proxy, never bundled):

- `GEMINI_API_KEY` — required (default engine).
- `ANTHROPIC_API_KEY` — optional; only needed if a Claude model is selected.
  Without it, selecting Claude returns a clear "missing key" error and you can
  switch back to Gemini.

## Adding a model or provider

1. Add an entry to `AI_MODELS` in `services/aiModels.ts` (id, provider, model
   string, label, roles, `keyEnv`).
2. If it is a **new provider**, add an adapter (a `runXProxy` that translates the
   Gemini-shaped request and maps the response into the `{ text, candidates,
   usageMetadata }` envelope — see `api/_lib/anthropic.ts`) and a branch in
   `runAiProxy`, plus the key in the two proxy entry points (`api/gemini.ts`,
   `vite.config.ts`).

That's it — the selector and routing pick it up automatically.

## Notes / limitations

- The marking path relies on strict JSON field names. The Anthropic adapter
  serialises the Gemini `responseSchema` into the system prompt so Claude
  reproduces the exact shape the Zod validators expect; responses are still
  validated, so a malformed response surfaces a clear "try again" error rather
  than corrupt output.
- Web-search-backed calls (syllabus fetch) only work on Gemini; on other
  providers the model answers from its own knowledge.
