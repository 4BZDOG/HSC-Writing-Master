# Header and sign-in review — change log

A running record of the review of the page header and the signed-out screens
(sign-in, sign-up, password reset), and the follow-ups it produced. One section
per merged pull request, newest last. Each entry says what was wrong, what
changed, and how it was checked, so the next pass does not re-derive it.

## PR #273 — Stop trimming sign-in passwords, and let the sign-in page fit a short screen

**Sign-in**

- **Bug:** sign-in `.trim()`med the password while sign-up stored it as typed,
  so a password with a leading or trailing space could be created and never
  used. The password is now sent as typed; only the emptiness check trims.
- The page centred with `justify-center`, which pushed a column taller than the
  viewport off the top — at 1280×720 the band mark was cut off with no way to
  scroll to it. It now centres with `my-auto`.
- Empty fields are named under the field (`aria-invalid`, `aria-describedby`)
  instead of one "Required fields missing." line; "Invalid credentials. Access
  denied." became a plain sentence.
- The busy submit button and the phone-width SSO buttons had no accessible
  name; both have one.
- Demo-account chips fill the form and say the password is the username.
- Disclaimer 10px → 12px; muted text given light-theme partners; the local copy
  of `MeshOverlay` replaced with the shared one.

**Password reset** — now shares the sign-in brand block (`AuthBrand`) and
layout; it had a different mark and wordmark. Errors use `role="alert"`.

**Theme and header**

- The last theme is stored (`STORAGE_KEYS.THEME`) and applied by an inline
  script in `index.html` before first paint; the sign-in screen was always dark.
- The sign-in toast reads "Signed in as …", not "Auth session active: …".
- The avatar initial is upper-case and never blank; a failed theme save is no
  longer an unhandled rejection.

**Checked:** `npm run test:all` (2,597 unit tests), 26 Chromium e2e tests
(agreement gate, axe on sign-in, light theme, workspace chrome), production
build and `check:bundle`. Deployed to GitHub Pages by the merge.

## PR 2 — One field, one button, and errors that say what actually went wrong

**Bug — every sign-in failure blamed the password.** `supabaseLogin` turned
every Supabase error into "Invalid username or password", so a student who was
offline, rate-limited or had not yet followed their confirmation link was told
their password was wrong. `describeSignInError` in `services/authService.ts`
now words each of those with its own remedy; only a genuine rejection keeps the
credential wording, and `LoginPage` shows anything else as it arrives. The
offline check is deliberately narrower than `isTransientAuthError` (which also
counts a missing status), so a doubtful case still reads as a rejection.

**Shared pieces** — `components/AuthField.tsx` and `utils/authChrome.ts`
(`AUTH_PAGE`, `AUTH_COLUMN`, `AUTH_CARD`, `AUTH_PRIMARY_BUTTON`,
`AUTH_TEXT_LINK`). The primary button was copied five times across the two
pages and the reset page's field had drifted: no `aria-invalid`, no link from
the field to its error, no focus glow. Both pages now use the same field.

- The field's error state no longer stacks two backgrounds (`bg-black/50` and
  `bg-red-500/[0.02]` on one element); the light theme gets its own error and
  focus fills.
- Text links were `indigo-400` in both themes — about 3:1 on the white card.
  They take `indigo-700` in the light theme.
- The primary button animates only the properties that change, not
  `transition-all`.

**Screen readers** — every mode of the card has a heading (sign-in's is
visually hidden), and when the card's contents change — a mode switch, or a
form replaced by its "check your email" panel — focus moves to the new heading.
Before, pressing "Create one" swapped the form silently.

**Signed-out screens** — the corner API health dot renders only when signed in.
It reports on an AI connection nobody on the sign-in page can use, and at phone
width it covered the disclaimer and the demo chips.

**Checked:** `npm run test:all` (2,606 unit tests, including new
`authServiceSignInErrors.test.ts` and additions to the sign-in, sign-up and
reset UI tests), Chromium e2e for the agreement gate and accessibility specs,
and screenshots of both themes at 1280px and 375px.
