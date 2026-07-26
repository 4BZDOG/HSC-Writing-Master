# Bundle safety: the blank-page bug

## What happened

A deployed build rendered nothing at all. The only clue:

```
Uncaught ReferenceError: Cannot access 'Cs' before initialization
    at legalContent.ts
```

`Cs` was the minified `FREE_TIER_EVAL_LIMIT`. `data/legalContent.ts` interpolated
it into the Terms of Use **at module scope**:

```ts
// data/legalContent.ts — the broken version
import { FREE_TIER_EVAL_LIMIT } from '../services/entitlements';

const TERMS_OF_USE = {
  sections: [{ body: [`Free accounts get ${FREE_TIER_EVAL_LIMIT} marked evaluations per day…`] }],
};
```

`components/EvaluationDisplay.tsx` imports the marking disclaimer from that same
file, so Rollup pulled `legalContent` into the **`workspace`** chunk while
`entitlements` stayed in the **entry** chunk. Those two chunks import each other,
so `workspace` executed first and read a `const` the entry chunk had not
initialised. A temporal-dead-zone error thrown during module init means React
never mounts: white screen, whole app.

## Why nothing caught it

| Check | Why it passed |
|---|---|
| `npm run dev` | Vite serves modules unbundled — the chunk cycle does not exist |
| `npm run build` | It is a *runtime* ordering fault, not a compile error |
| Unit tests | Vitest resolves modules individually, like dev |
| Playwright e2e | Runs against the **dev server** |
| Type check / lint | Nothing type-incorrect about it |

Every gate was green while the deployed site was blank. That is the whole reason
this document and the two checks below exist.

## The rule

**Never read an imported value at module scope.** Anything that dereferences an
import — a template literal, an object or array literal, a top-level call —
must live inside a function, so it runs after every module has initialised.

```ts
// WRONG — evaluated the instant this module loads
const LABEL = `${FREE_TIER_EVAL_LIMIT} per day`;
const PRICES = { plus: `${PLAN_PRICING.yearly}/year` };

// RIGHT — evaluated when something asks
const label = () => `${FREE_TIER_EVAL_LIMIT} per day`;
const prices = () => ({ plus: `${PLAN_PRICING.yearly}/year` });
```

Two supporting habits:

- **Keep shared constants in import-free leaf modules.** `data/agreementVersion.ts`
  and `services/planLimits.ts` import nothing, so they cannot drag a cycle in
  behind them. `services/entitlements.ts` re-exports the limits, so call sites
  are unaffected.
- **Type-only imports are free.** `import type { X }` is erased, so it can never
  participate in this.

## The two checks

Both run in CI. Neither existed when the bug shipped.

### `npm run check:bundle` — the gate

`scripts/checkChunkInitOrder.mjs` parses the **real build output**, builds the
chunk import graph, finds cycles, and fails if any chunk reads an imported
binding at its top level from a chunk that imports it back.

Because it inspects the actual artefact, it cannot be fooled by how the bundler
happened to split things — which is the only thing that decides whether the bug
fires. It runs after `npm run build` in both `build.yml` and
`deploy-pages.yml`.

Verified against the broken commit: it reported all three constants
(`Cs`, `Ss`, `Ms`) and exited non-zero. On the fixed tree it reports
`✓ 16 chunks checked`.

### `npm run check:eager-reads` — the early warning

`scripts/findModuleInitReads.mjs` scans the TypeScript sources for module-scope
reads of imported values. It flags *latent* hazards — code that is fine only
because of where the bundler currently puts it. It found
`components/PlanComparison.tsx` building a price-line object at module scope,
one component import away from the identical crash.

Structurally-safe cases live in a `KNOWN_SAFE` list in the script, each with a
reason. Two are accepted today:

- `data/seedData.ts` — only reached through a dynamic `import()`, so it executes
  long after every eager chunk.
- `index.tsx` — the entry itself; nothing imports it, so it cannot sit on a cycle.

If you add an eager read, either move it inside a function or add it to
`KNOWN_SAFE` with the reason it cannot sit on a cycle. Do not add it just to
silence the check.

## If you see it again

1. `DEPLOY_BASE_PATH=/<repo>/ npm run build && npm run check:bundle` — this
   reproduces it locally in seconds. **Do not** try to reproduce in dev; it
   cannot happen there.
2. The reported binding name is minified. Find it with
   `grep -o "<name>" dist/assets/<chunk>.js` and read the surrounding context —
   the string it is interpolated into usually identifies it immediately.
3. Fix by deferring the read, not by rearranging `manualChunks`. Chunking is a
   performance decision; correctness should not depend on it.
