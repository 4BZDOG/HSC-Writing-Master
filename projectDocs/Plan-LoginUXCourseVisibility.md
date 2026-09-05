# Plan: Login UX Polish & Admin Course Visibility Toggle

## Part 1 — Login page: bugs and polish

The login flow (`components/LoginPage.tsx`, `services/authService.ts`,
`services/signupPolicy.ts`, `services/agreementService.ts`) is already a
mature, carefully-commented implementation: validation exists for every mode
(signin/signup/reset), loading states are guarded against double-submit,
autocomplete attributes are correct, British/Australian English is used
throughout (verified — no American spellings in any user-facing copy), and
the demo-account badges are informational-only by design (confirmed via
`git log --follow -p`, never interactive in this file's history — not a
regression). Two concrete, narrow issues survive that review:

### 1.1 Submit button doesn't account for an in-flight OAuth redirect (bug)

**File:** `components/LoginPage.tsx`, line 590 (the primary submit button).

Every other actionable control on the page disables on
`isLoading || oauthLoading !== null` — the OAuth buttons (line 668) and the
"Continue as Guest" button (line 687) both do. The primary "Sign In" submit
button only checks `disabled={isLoading}`. `handleOAuthLogin` never sets
`isLoading`, only `oauthLoading`. So while `supabase.auth.signInWithOAuth` is
resolving (before the browser actually navigates away), the sign-in button
stays enabled and Enter/click will fire `handleSubmit` → `authService.login`
concurrently with the pending OAuth redirect — a genuine race between two
competing sign-in flows, and an inconsistency with the rest of the page's own
pattern.

**Fix:**

```tsx
disabled={isLoading || oauthLoading !== null}
```

on the submit button at line 590 (and drop the now-redundant `isLoading`
check nowhere else needs changing — the OAuth/guest buttons are already
correct).

### 1.2 Error text isn't announced to screen readers (accessibility gap vs. established convention)

**Files:** `components/LoginPage.tsx` — the `FieldError` component (lines
51–56) and the inline submit-error block (lines 582–586).

`role="alert"` (with `aria-live` where relevant) is the established pattern
in this codebase for exactly this kind of transient error text —
`components/Toast.tsx`, `components/BillingAlertBanner.tsx`,
`components/ApiStatusIndicator.tsx`, and `components/UrlFetchField.tsx` all
use it. `LoginPage.tsx` has no equivalent anywhere, so a screen-reader user
who mistypes a password, or hits a signup validation error, gets no
announcement — they only find out by reading the page again.

**Fix:** add `role="alert"` to both:

```tsx
// FieldError, line 53
<p role="alert" className="flex items-center gap-1.5 text-red-400 ...">

// inline submit error, line 583
<div role="alert" className="flex items-start gap-2 text-red-400 ...">
```

This is a targeted, one-line-per-site fix using the codebase's own existing
pattern — not a new convention.

### Everything else checked and found solid (no action needed)

- Empty-field submission is blocked in all three modes (signin/signup/reset)
  with clear per-field or banner messaging.
- Enter key submits correctly in both fields (native form behaviour, no
  `preventDefault` interference).
- Loading state (`Loader2` spinner + `disabled`) correctly prevents
  double-submit on the primary button today.
- Demo-account hints are intentionally non-interactive; not a bug.
- Card visual design (`clip-stable`, `bg-[rgb(var(--color-bg-surface))]`,
  `rounded-2xl`-family radii) matches the same solid-surface modal pattern
  used across `CourseCreatorModal.tsx`, `ConfirmationModal.tsx`,
  `admin/*Modal.tsx`, etc. — not a deviation from the design system.
- No American-English spellings found in any LoginPage/authService
  user-facing string (verified by grep across common offenders).

### Tests to run/add

- `npm run type-check`
- `npm test -- tests/unit/loginPageSignUp.test.tsx tests/unit/loginOAuthProviders.test.ts tests/unit/passwordResetUi.test.tsx tests/unit/authService.test.ts`
- Add one unit assertion (in `loginOAuthProviders.test.ts` or a new
  `loginSubmitGuard.test.tsx`) that the submit button is `disabled` while
  `oauthLoading` is set — render, click an OAuth button (mock
  `authService.loginWithOAuth` as a never-resolving promise), assert the
  "Sign In" button has `disabled`.
- Manual/e2e: fire a validation error and confirm it's exposed via
  `getByRole('alert')` in Testing Library rather than plain text query.

---

## Part 2 — Admin course visibility toggle (draft/hidden courses)

### Key discovery

`supabase/schema.sql` **already has** a `courses.status content_status`
column (line 75) with RLS (`courses_read`, line 529–531:
`status = 'approved' or created_by = auth.uid() or public.is_reviewer()`)
and an authority trigger (`enforce_content_status_authority`, line 373) that
lets any reviewer (admin/teacher) freely set `status = 'approved'` via a
plain `UPDATE` — no new migration, RLS policy, or RPC is needed on the
backend. The gap is entirely client-side: `Course` in `types.ts` has no
status field, `curriculumService.ts` never selects/maps the `status` column,
and there is no admin UI to change it. Also confirmed:
`hooks/useSyllabusData.ts`'s `handleCreateCourse` (line 440) is 100% local —
courses made via "Add Course" are never written to Supabase today. That's a
pre-existing gap, out of scope here, but the plan must not silently assume a
remote course-creation path exists.

### 2.1 Data model — `types.ts`

Add, immediately after `Course.subject` (types.ts line ~182):

```ts
/**
 * Admin publication gate. Absent (or 'published') means visible to everyone
 * — the same "absence means what it always meant" rule as every other
 * additive field (see Topic.year, DotPoint.focusAreas). 'draft' hides the
 * course from anyone who is not canCreateCurriculum (admin), so new/seeded
 * content can be built and reviewed before students or teachers see it
 * exists. Maps to the existing Supabase `courses.status` column in remote
 * mode ('approved' -> published, anything else -> draft) — see
 * services/curriculumService.ts.
 */
status?: 'draft' | 'published';
```

### 2.2 Zod schema + DATA_VERSION — `utils/dataManagerUtils.ts`, `utils/storageUtils.ts`

`CourseSchema` (dataManagerUtils.ts line 610) is `.passthrough()`, so the
field already survives parsing untouched — but add it explicitly for
validation/documentation parity with the rest of the file:

```ts
export const CourseSchema = z
  .object({
    id: z.string().default(() => generateId('course')),
    name: z.string().catch('Untitled Course').default('Untitled Course'),
    outcomes: z.array(CourseOutcomeSchema).default([]),
    topics: z.array(TopicSchema).default([]),
    status: z.enum(['draft', 'published']).optional(),
  })
  .passthrough();
```

Bump `DATA_VERSION` in `utils/storageUtils.ts` (currently `'2.7.0'` →
`'2.8.0'`) per house convention. No `runMigrations()` case is functionally
required — old data has no `status`, which already reads as "published" —
but bump for traceability as the skill file directs.

### 2.3 Permission gate — reuse `canCreateCurriculum`

Do **not** use `isSystemAdmin` (that's for system-administration _tools_,
unrelated) or `canCurateContent` (admin+teacher — too broad; the task
explicitly wants this hidden from teachers too). `utils/permissions.ts`'s
`canCreateCurriculum` (admin-only) is the exact existing gate for "creating
the top two levels of the syllabus tree" and its own comment block already
states the rationale ("a course... is the app's shared skeleton") that
applies identically to hiding/publishing one. Reuse it as-is, no new helper
needed in `permissions.ts`.

### 2.4 Filtering helper — new `utils/courseVisibility.ts`

```ts
import { Course, UserRole } from '../types';
import { canCreateCurriculum } from './permissions';

export const isCourseVisible = (course: Course, role: UserRole): boolean =>
  course.status !== 'draft' || canCreateCurriculum(role);

export const visibleCourses = (courses: Course[], role: UserRole): Course[] =>
  courses.filter((c) => isCourseVisible(c, role));
```

Small and independently unit-testable (matches the "pure utility" pattern
this codebase already uses, e.g. `signupPolicy.ts`).

### 2.5 Wire filtering into `App.tsx`

`courses` (raw) is currently passed unfiltered to `PromptSelector` (line 844) and `Workspace` (line 952) — the two user-facing navigator surfaces.
Add:

```ts
const navigatorCourses = useMemo(() => visibleCourses(courses, user.role), [courses, user.role]);
```

and pass `courses={navigatorCourses}` at both of those call sites. **Do
not** change `AppModals` (line 1040) or `ContentAuditModal` (line 1070) —
those are admin-gated tools (`isSystemAdmin`/`canModerate` already wrap
them) that legitimately need the full list to manage draft content. Filter
at the source (App.tsx) rather than only inside `PromptSelector`'s
`courseOptions` — filtering only the dropdown would still let a stale
`statePath.courseId` (e.g. restored from a saved path) resolve a draft
course's topics/prompts inside `Workspace` even though it's absent from the
picker.

**Task:** audit `AppModals.tsx`'s modal list for any student/teacher-facing
modal (not admin/curation-gated) that reads `courses` directly and could
leak a draft course's name/content — note as a follow-up if found, this
plan doesn't attempt a full trace of every modal.

### 2.6 Admin toggle handler — `hooks/useSyllabusData.ts`

Add near `handleUpdateOutcomes` (line 675):

```ts
const handleSetCourseStatus = useCallback(
  (courseId: string, status: 'draft' | 'published') => {
    updateCourses((draft) => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        if (status === 'published') delete course.status;
        else course.status = status;
      });
    });
    showToast(
      status === 'published'
        ? 'Course published — visible to everyone.'
        : 'Course hidden — only admins can see it while you work on it.',
      'success'
    );
    if (isCurriculumRemote()) {
      updateRemoteCourseStatus(courseId, status).catch(() =>
        showToast('Could not sync visibility to the shared library.', 'error')
      );
    }
  },
  [updateCourses, showToast]
);
```

Deleting the field (rather than storing `'published'`) keeps the same
absence-means-default idiom as `DotPoint.focusAreas` elsewhere in this same
file. Export `handleSetCourseStatus` from the hook's return object and thread
it through `App.tsx` into `PromptSelector` as a new `onToggleCourseStatus`
prop, gated the same way `onAddCourse` is (`canCreateTree`).

### 2.7 Remote write path — `services/contributionService.ts`

Add (near `resolvePromptRowId`, line 301):

```ts
export const resolveCourseRowId = (appId: string): Promise<string | null> =>
  resolveRowId('courses', appId);

/** Admin-only visibility flip. Relies on the existing courses_modify RLS
 *  policy (created_by = auth.uid() or is_reviewer()) and the
 *  enforce_content_status_authority trigger, which already permits any
 *  reviewer to set status='approved' directly — no RPC required. */
export const updateCourseStatus = async (
  courseAppId: string,
  status: 'draft' | 'published'
): Promise<void> => {
  const rowId = await resolveCourseRowId(courseAppId);
  if (!rowId) throw new Error('That course is not in the shared library yet.');
  const { error } = await requireClient()
    .from('courses')
    .update({ status: status === 'published' ? 'approved' : 'private' })
    .eq('id', rowId);
  if (error) throw new Error(`Could not update course visibility: ${error.message}`);
};
```

Call this as `updateRemoteCourseStatus` from `useSyllabusData.ts` (import
and re-export/alias, or import directly).

### 2.8 Read path — `services/curriculumService.ts`

- `CourseRow` interface (line 28): add `status: string;`.
- `visible()` calls for `'courses'` (line 298): add `status` to the selected
  columns: `'id, legacy_id, name, subject, status'`.
- `assembleCourses` course-building map (line 239–245): add
  `...(row.status && row.status !== 'approved' ? { status: 'draft' as const } : {})`.

Note: `fetchRemoteCourses`'s existing `visible()` filter
(`status.eq.approved,created_by.eq.<uid>`) already means a non-owner never
receives another user's draft row over the wire at all — the client-side
filter in 2.4/2.5 is the primary mechanism for local/offline mode and a
second line of defence for Supabase mode, not a workaround for a leaky
query.

### 2.9 Admin UI — `components/PromptSelector.tsx`

- **Draft badge** in `courseOptions`'s `renderLabel` (line 398–417), next to
  the existing `canCurate && <CoverageChip .../>` pattern (line 412), gated
  on `canCreateTree` (admin-only) instead of `canCurate`:
  ```tsx
  {
    canCreateTree && c.status === 'draft' && (
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 flex-shrink-0">
        Draft
      </span>
    );
  }
  ```
- **Toggle control**: a new `ActionButton` beside the existing "Add Course"
  button (line 940–942), shown when `canCreateTree && selectedCourse`:
  ```tsx
  {
    canCreateTree && selectedCourse && (
      <ActionButton
        onClick={() =>
          onToggleCourseStatus(
            selectedCourse.id,
            selectedCourse.status === 'draft' ? 'published' : 'draft'
          )
        }
        icon={selectedCourse.status === 'draft' ? Eye : EyeOff}
        title={
          selectedCourse.status === 'draft'
            ? 'Publish — make visible to everyone'
            : 'Hide — draft, visible to admins only'
        }
        label={selectedCourse.status === 'draft' ? 'Publish' : 'Hide'}
        variant={selectedCourse.status === 'draft' ? 'special' : 'default'}
      />
    );
  }
  ```
  (`Eye`/`EyeOff` from `lucide-react`, already the icon set used throughout
  this file.) Add `onToggleCourseStatus: (courseId: string, status: 'draft' | 'published') => void;`
  to `PromptSelectorProps`.

### Tasks (implementation order)

1. `types.ts` — add `Course.status`.
2. `utils/dataManagerUtils.ts` — extend `CourseSchema`; `utils/storageUtils.ts` — bump `DATA_VERSION`.
3. `utils/courseVisibility.ts` — new pure helpers + unit tests.
4. `services/contributionService.ts` — `resolveCourseRowId` + `updateCourseStatus`.
5. `services/curriculumService.ts` — select/map `status` in `fetchRemoteCourses`/`assembleCourses`.
6. `hooks/useSyllabusData.ts` — `handleSetCourseStatus`, wired to `updateCourseStatus` when `isCurriculumRemote()`.
7. `App.tsx` — `navigatorCourses` memo; use it for `PromptSelector`/`Workspace`; pass `onToggleCourseStatus`.
8. `components/PromptSelector.tsx` — draft badge + toggle `ActionButton`.

### Tests to run/add

- `npm run type-check`
- New `tests/unit/courseVisibility.test.ts` — `isCourseVisible`/`visibleCourses` for admin/teacher/user/guest × draft/published/absent.
- New/updated unit test on `assembleCourses` (likely alongside existing curriculumService tests) confirming `status: 'approved'` → no client field, anything else → `status: 'draft'`.
- Unit test on `handleSetCourseStatus` in a `useSyllabusData` test: toggling clears/sets the field and calls `updateRemoteCourseStatus` only when `isCurriculumRemote()`.
- E2e (optional but recommended): admin creates/edits a course, marks it draft, confirms it disappears from a `user`-role session's course picker, then republishes and confirms it reappears.
- `npm run test:all` before pushing.
