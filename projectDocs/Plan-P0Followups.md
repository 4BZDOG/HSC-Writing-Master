# Plan — P0 Follow-ups (post PR #160)

Status: draft. Three small, independent changes. Item 1 is a DRAFT for human
security review — do not apply/merge it without that review. Items 2 and 3
are trivial and safe to apply directly.

---

## 1. DRAFT Storage RLS policies for the `scenario-images` bucket

**This section is explicitly NOT ready to ship.** It is scaffolding for a
human security reviewer to read, correct, and approve — the existing
`-- TODO(security-review):` comment in `supabase/schema.sql` (around line 435) was left unauthored on purpose for exactly this reason. Do not apply
this SQL to a live database and do not merge it without sign-off from
someone doing a deliberate security pass.

### Access model this mirrors

Read from `supabase/schema.sql`:

- `prompts_read`/`prompts_insert`/`prompts_update`/`prompts_delete` (lines
  582-593): status-gated read (`approved` OR own OR reviewer), owner-only
  insert, owner-or-reviewer update, owner-or-admin delete.
- Role helpers (lines 279-292): `public.is_admin()` = role is `admin`;
  `public.is_reviewer()` = role is `admin` or `teacher`. These are the
  server-side mirror of `utils/permissions.ts`'s `isSystemAdmin`/
  `canCurateContent`/`canModerate` — a teacher curating content maps to
  `is_reviewer()`, not `is_admin()`.
- `public.prompts.id` is `uuid` (line 118).

### Why this needs a distinct pattern from the table policies

`storage.objects` has no `content_status` column and no FK to `prompts` —
the only signal available per row is `bucket_id` and `name` (the object's
path within the bucket). The app's storage convention
(`utils/scenarioImageStorage.ts` / `types.ts`'s `ScenarioImageRef`, per
`Plan-AIModelsImagesNavigator.md` section 2) is `${promptId}/${imageId}`,
so every predicate below recovers `promptId` from the path via Supabase's
built-in `storage.foldername(name)` helper (splits on `/`, returns
everything before the filename as `text[]`) and joins back to
`public.prompts` with a subquery. No precedent for a `storage.objects`
policy exists elsewhere in `schema.sql` — this is new ground, which is
exactly why it wants a second pair of eyes.

### Draft SQL (transcribe verbatim into `schema.sql` in place of the TODO comment, pending review)

```sql
-- ============================================================================
-- DRAFT — NOT REVIEWED. Storage RLS policies for the `scenario-images`
-- bucket on storage.objects. Mirrors the prompts_* policy shape above,
-- translated onto storage.objects via the object path convention
-- `${promptId}/${imageId}` (see types.ts ScenarioImageRef and
-- utils/scenarioImageStorage.ts). storage.foldername(name) is Supabase's
-- built-in helper that splits an object path on '/' and returns everything
-- before the filename as text[] — for this bucket's flat two-segment
-- layout, element [1] is always the promptId.
--
-- A HUMAN SECURITY REVIEWER MUST READ AND APPROVE THIS BLOCK BEFORE IT IS
-- APPLIED TO ANY DATABASE. Treat it as a starting draft, not a finished
-- policy — in particular, double-check: (a) whether `is_reviewer()` is the
-- right bar for write access to another teacher's scenario image, vs. a
-- stricter owner-only rule; (b) whether the subquery's cost is acceptable
-- at the expected object count; (c) whether bucket `public` should stay
-- `false` given these policies now gate all access explicitly.
-- ============================================================================

drop policy if exists scenario_images_read on storage.objects;
create policy scenario_images_read on storage.objects for select
  using (
    bucket_id = 'scenario-images'
    and exists (
      select 1 from public.prompts p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (p.status = 'approved' or p.created_by = auth.uid() or public.is_reviewer())
    )
  );

drop policy if exists scenario_images_insert on storage.objects;
create policy scenario_images_insert on storage.objects for insert
  with check (
    bucket_id = 'scenario-images'
    and auth.uid() is not null
    and exists (
      select 1 from public.prompts p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (p.created_by = auth.uid() or public.is_reviewer())
    )
  );

drop policy if exists scenario_images_update on storage.objects;
create policy scenario_images_update on storage.objects for update
  using (
    bucket_id = 'scenario-images'
    and exists (
      select 1 from public.prompts p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (p.created_by = auth.uid() or public.is_reviewer())
    )
  )
  with check (
    bucket_id = 'scenario-images'
    and exists (
      select 1 from public.prompts p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (p.created_by = auth.uid() or public.is_reviewer())
    )
  );

drop policy if exists scenario_images_delete on storage.objects;
create policy scenario_images_delete on storage.objects for delete
  using (
    bucket_id = 'scenario-images'
    and exists (
      select 1 from public.prompts p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (p.created_by = auth.uid() or public.is_admin())
    )
  );
```

### Rationale per permission, matched to the requirement

- **Read**: same three-way gate as `prompts_read` — a student only sees the
  image once its owning prompt is `approved`; the author and any
  reviewer/admin can see it earlier (e.g. while curating). Matches "student:
  read-only, only for approved/published content."
- **Insert/Update**: uses the `prompts_update` bar (`created_by = auth.uid()
or is_reviewer()`), not the stricter `prompts_insert` bar — because
  uploading a scenario image is editing an _existing_ prompt (per
  `Plan-AIModelsImagesNavigator.md`, wired into `PromptDisplay.tsx`'s
  `canCurate` block on an already-created prompt), not creating a new one.
  This lets any reviewer/admin fix or replace another teacher's image, same
  as they could edit the prompt's text today.
- **Delete**: uses the stricter `prompts_delete` bar (owner or `is_admin()`,
  not `is_reviewer()`) — deleting is destructive and irreversible for a
  Storage object in a way an update is not, matching the app's existing
  asymmetry between who can edit vs. who can delete a prompt.
- **No `public.is_admin()`-only path is used for read/write** — `is_reviewer()`
  (admin+teacher) is deliberately used there because that is what
  `prompts_update`/`canModerate` already grant a teacher; a narrower bar
  would be inconsistent with the row-level table policy it mirrors.

### Open questions a reviewer should resolve (do not silently assume)

1. Whether `is_reviewer()` (any teacher, not just the prompt's own author)
   should really be allowed to overwrite another teacher's scenario image —
   this mirrors `prompts_update` exactly, but a reviewer may want a
   narrower rule specifically for binary asset writes.
2. Whether the `exists (select ...)` subquery cost is acceptable — this
   runs once per storage request; if the `scenario-images` bucket grows
   large, consider whether an index on `prompts.id` (already the primary
   key, so already indexed) is sufficient, or whether a cached/duplicated
   `created_by`/`status` column directly in an object's metadata (Supabase
   Storage supports a `metadata` jsonb column) would be cheaper.
3. Whether malformed object names (anything not matching
   `${promptId}/${imageId}`, e.g. uploaded outside the app's own code path)
   should fail closed (they do, by construction — `exists` returns false)
   or need an explicit test.

### Task list

1. Human security reviewer reads this section end-to-end.
2. Once approved (with or without edits), replace the
   `-- TODO(security-review):` comment block in `supabase/schema.sql`
   (currently lines 435-442) with the reviewed SQL.
3. Apply to a non-production Supabase project first; manually verify: a
   signed-in student cannot read/write an image for a non-approved prompt;
   a teacher can upload/replace an image on their own prompt; a teacher
   cannot delete another teacher's image (only admin can); an
   unauthenticated request is rejected outright (`auth.uid()` is null).
4. Only then apply to production.

---

## 2. Add `check:eager-reads` to `test:all`

Trivial, one-line change. In `package.json`, the `scripts` block currently
has (line 22):

```json
"test:all": "npm run lint && npm run test -- --run && npm run type-check && npm run type-check:tests",
```

Change to:

```json
"test:all": "npm run lint && npm run test -- --run && npm run type-check && npm run type-check:tests && npm run check:eager-reads",
```

`check:eager-reads` (line 30, `node scripts/findModuleInitReads.mjs`)
already exists and currently passes cleanly (verified: "No unexplained
eager reads of imported values."). Appending it last keeps the existing
fail-fast ordering (cheap lint first, most expensive/slow checks last) and
matches what CI's "Lint & Format Check" job already gates on, so a local
`npm run test:all` before pushing now genuinely predicts CI instead of
missing this class of bug (as it did for PR #160).

### Task list

1. Edit `package.json` line 22 as above.
2. Run `npm run test:all` once to confirm the full chain still passes.

### Tests to run

- `npm run test:all` (the edited script itself is the test).

---

## 3. Fix stale `claude-sonnet` cost estimate in `services/aiModels.ts`

Confirmed via direct fetch of
`platform.claude.com/docs/en/about-claude/models/overview` (primary
source, legacy models table): `claude-sonnet-4-6` is priced at **$3 / M
input tokens, $15 / M output tokens** — matching what both the original
plan and the verification pass flagged as the correct number (the file
currently has a stale `0.009`, apparently priced against an older/different
rate).

Applying the file's own blend methodology (`AIModelOption.estCostPerCall`
doc comment: "~2k input + ~1k output tokens"):

```
(2000 / 1_000_000) * 3  = 0.006
(1000 / 1_000_000) * 15 = 0.015
total                    = 0.021
```

In `services/aiModels.ts`, the `claude-sonnet` entry (around line 90):

```ts
// before
estCostPerCall: 0.009,

// after
estCostPerCall: 0.021, // $3/M in + $15/M out, blended 2k-in/1k-out (was
                        // stale at 0.009 — flagged in
                        // Plan-AIModelsImagesNavigator.md and verified
                        // against platform.claude.com/docs pricing table)
```

No other fields on this entry change — `model: 'claude-sonnet-4-6'` stays
as-is (still a valid, listed legacy model, no forced migration).

### Task list

1. Edit `services/aiModels.ts`: change `estCostPerCall` on the `claude-sonnet`
   entry from `0.009` to `0.021`, with the comment above.
2. Run `npm test -- tests/unit/aiModelRegistry.test.ts` (or equivalent) to
   confirm the change doesn't violate any registry invariant test.
3. `npm run type-check`.

### Tests to run

- Any existing `tests/unit/aiModelRegistry.test.ts` / `aiConfig.test.ts`.
- `npm run test:all`.

---

## Summary of files touched

- **Item 1 (DRAFT, needs sign-off):** `supabase/schema.sql` only.
- **Item 2:** `package.json` only.
- **Item 3:** `services/aiModels.ts` only.

All three are independent — any can be applied without the others.
