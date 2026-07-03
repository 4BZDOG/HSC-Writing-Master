import { describe, it, expect } from 'vitest';
import { canCurateContent, canModerate, isSystemAdmin } from '../../utils/permissions';
import type { UserRole } from '../../types';

/**
 * The capability matrix is the contract between the UI gates and the
 * server-side reality (supabase/schema.sql: is_reviewer() = admin+teacher,
 * is_admin() = admin). If a row here changes, the schema functions and the
 * gates that consume these helpers must be reviewed together.
 */
const MATRIX: Record<UserRole, { curate: boolean; moderate: boolean; sysAdmin: boolean }> = {
  admin: { curate: true, moderate: true, sysAdmin: true },
  teacher: { curate: true, moderate: true, sysAdmin: false },
  user: { curate: false, moderate: false, sysAdmin: false },
  guest: { curate: false, moderate: false, sysAdmin: false },
};

describe('role capability matrix', () => {
  (Object.keys(MATRIX) as UserRole[]).forEach((role) => {
    it(`${role}: curate=${MATRIX[role].curate} moderate=${MATRIX[role].moderate} sysAdmin=${MATRIX[role].sysAdmin}`, () => {
      expect(canCurateContent(role)).toBe(MATRIX[role].curate);
      expect(canModerate(role)).toBe(MATRIX[role].moderate);
      expect(isSystemAdmin(role)).toBe(MATRIX[role].sysAdmin);
    });
  });

  it('teachers are never system admins (the whole point of the split)', () => {
    expect(canCurateContent('teacher')).toBe(true);
    expect(canModerate('teacher')).toBe(true);
    expect(isSystemAdmin('teacher')).toBe(false);
  });
});
