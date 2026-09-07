import { supabase } from './supabaseClient';

/**
 * Class record-keeping — the write half of schema §19.
 *
 * §19 gave the database everything a class needs: `classes`, `class_members`,
 * RLS on both, `can_view_class`, and the two functions below, each revoked from
 * `public` and granted deliberately. The client only ever called the READ side
 * (`list_my_classes`, and the three analytics RPCs that scope through class
 * membership), so no deployment could put a student in a class without someone
 * writing SQL by hand.
 *
 * That is not a cosmetic gap. `visible_student_ids` resolves a teacher's cohort
 * THROUGH class membership, so a teacher with no class sees an empty Class
 * Insights, an empty cohort heatmap and an empty Student Progress roster — a
 * dashboard of zeros that no amount of student work will ever fill. The demo
 * seeder already knew this and worked around it with a service-role key
 * (`supabase/demoSeed.mjs`, "a teacher with no class sees nothing"), which is
 * not a key any real deployment's admin has in a browser.
 *
 * The access split below is the schema's, not this file's:
 *   - `create_class` is ADMIN-only, because owning a class is what grants sight
 *     of student work — the same reasoning as `set_user_role`.
 *   - `enrol_in_class` is open to the class's own staff: once an admin has made
 *     you the owner, managing your roll is your job.
 */

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

/** A member's role within one class. Mirrors the check in `enrol_in_class`. */
export type ClassRole = 'student' | 'co_teacher';

/**
 * Admin-only: create a class in a school and hand it to a teacher.
 *
 * Upserts on (school, name) server-side, so re-running it re-points an existing
 * class at a new owner or year rather than failing — which is what an admin
 * fixing a typo in an owner's username actually wants.
 */
export const createClass = async (
  schoolName: string,
  name: string,
  ownerUsername: string,
  year: number | null
): Promise<void> => {
  const { error } = await requireClient().rpc('create_class', {
    p_school_name: schoolName,
    p_name: name,
    p_owner: ownerUsername,
    ...(year == null ? {} : { p_year: year }),
  });
  if (error) throw new Error(`Could not create the class: ${error.message}`);
};

/**
 * Class staff: add a student (or a co-teacher) to a class by username.
 *
 * Upserts on (class, user), so enrolling someone already in the class updates
 * their role — the only way to promote a student to co-teacher, and harmless
 * when it is a re-run.
 *
 * There is deliberately no removal here: the database has no function for it,
 * and adding one is a schema change that has to reach every deployment before
 * a button can rely on it. Recorded as a follow-up rather than faked.
 */
export const enrolInClass = async (
  classId: string,
  username: string,
  role: ClassRole = 'student'
): Promise<void> => {
  const { error } = await requireClient().rpc('enrol_in_class', {
    p_class_id: classId,
    p_username: username,
    p_role: role,
  });
  if (error) throw new Error(`Could not enrol ${username}: ${error.message}`);
};
