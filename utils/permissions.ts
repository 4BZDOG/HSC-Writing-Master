import { UserRole } from '../types';

/**
 * Capability helpers — the single place that maps a role onto what the UI
 * lets it do. Keep these aligned with the server-side reality in
 * supabase/schema.sql: `is_reviewer()` is admin+teacher, `is_admin()` is
 * admin only. The UI gates are convenience, not the security boundary — RLS
 * and the moderation RPCs re-check the caller server-side.
 *
 * Role intent:
 *   admin   — full system access, including destructive/local-storage tools
 *             and bulk AI operations.
 *   teacher — curates content (create/edit questions, samples, rubrics) and
 *             moderates the shared-library review queue. No access to the
 *             Database Manager, Data Vault, Content Audit Studio, or API
 *             monitor.
 *   user    — answers questions; can contribute drafts to the shared library.
 *   guest   — read-only trial; nothing is persisted server-side.
 *   parent  — links to a child's account and pays for the child's Plus. Reads
 *             the child's progress only. Holds no curation, moderation,
 *             generation or system-admin capability (every helper below is
 *             false for this role, and that is pinned by tests).
 */

/**
 * How a role should be NAMED to the person who holds it.
 *
 * `UserRole` is a database value, and the profile was printing it raw: an
 * account chip that read "user", which is what the schema calls a student and
 * not what anyone calls themselves. The identifiers stay as they are — the
 * schema, the RLS policies and the quota tables all key on them — and this is
 * the one place that turns them into English.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  user: 'Student',
  guest: 'Guest',
  parent: 'Parent/guardian',
};

/**
 * The role as the account holder should read it.
 *
 * `ROLE_LABELS` is exhaustive on `UserRole`, so the typed call sites cannot fall
 * through. The `?? 'Student'` is for the user object itself, which is read back
 * from local storage and may carry a role string this build does not know (say,
 * one written by a newer deployment). Naming such an account a student is the
 * least surprising thing to print, and it is the only place a fallback is kept.
 */
export const roleLabel = (role: UserRole): string => ROLE_LABELS[role] ?? 'Student';

/**
 * Who may send a question to the shared library for reviewer approval. A guest
 * has no account to credit it to. A parent or guardian browses questions to see
 * what their child practises, not to author them, so the button would only add
 * noise to the review queue. Exhaustive on `UserRole`, so a new role must decide.
 */
const CONTRIBUTES_TO_LIBRARY: Record<UserRole, boolean> = {
  admin: true,
  teacher: true,
  user: true,
  guest: false,
  parent: false,
};

export const canContributeToLibrary = (role: UserRole): boolean =>
  CONTRIBUTES_TO_LIBRARY[role] ?? false;

/** Create and edit curriculum content: questions, samples, rubrics, keywords. */
export const canCurateContent = (role: UserRole): boolean => role === 'admin' || role === 'teacher';

/**
 * Create the top TWO levels of the syllabus tree — a whole COURSE, or a TOPIC
 * within one. Admin only, and deliberately narrower than `canCurateContent`.
 *
 * A course and its topics are the app's shared skeleton: every teacher in a
 * school navigates the same tree, so a duplicate "Enterprise Computing" or a
 * topic split two ways is a mess everyone else has to live with, and no
 * individual teacher can tidy. Everything BELOW a topic — sub-topics, dot
 * points, questions, rubrics, sample answers — stays with `canCurateContent`,
 * because that is where a teacher's own work belongs and a mistake is local.
 *
 * Teachers are not left without a route: a course that does not exist yet can
 * be REQUESTED (services/courseDemandService.ts), which puts it in front of an
 * admin with the demand behind it rather than in the tree unannounced.
 */
export const canCreateCurriculum = (role: UserRole): boolean => role === 'admin';

/**
 * Use AI to GENERATE new curriculum content: questions, marking guides,
 * sample answers, dot points, syllabus imports. Distinct from
 * `canCurateContent` (manual editing) so the two sets can diverge as roles
 * are refined — e.g. a future "content author" who edits by hand but has no
 * AI budget. Students never generate content; they spend their allowance on
 * having their own answers marked. Today both sets are admin+teacher.
 */
export const canUseAiGeneration = (role: UserRole): boolean =>
  role === 'admin' || role === 'teacher';

/** Approve/reject shared-library contributions (mirrors SQL `is_reviewer()`). */
export const canModerate = (role: UserRole): boolean => role === 'admin' || role === 'teacher';

/**
 * System administration: Database Manager, Data Vault (import/export),
 * Content Audit Studio (bulk AI generation), API monitor, dev tools.
 */
export const isSystemAdmin = (role: UserRole): boolean => role === 'admin';
