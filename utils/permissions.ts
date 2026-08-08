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
 */

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
