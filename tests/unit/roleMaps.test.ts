import { describe, it, expect } from 'vitest';
import type { User, UserRole } from '../../types';
import { CHARTERS } from '../../data/legalContent';
import { audienceForRole, charterForRole } from '../../services/agreementService';
import { describeAccess } from '../../services/entitlements';
import { QUICK_START_TRACKS, trackForRole } from '../../data/quickStartContent';
import { reportAudienceFor } from '../../utils/progressReportOptions';
import { ROLE_LABELS, canContributeToLibrary, roleLabel } from '../../utils/permissions';

/**
 * Every role-keyed list in the app must handle every role. A future role must
 * not fall through to the student default, so the lists are typed `Record<UserRole,
 * ...>` and this file pins the rest.
 *
 * `EVERY_ROLE` is typed `Record<UserRole, true>`: adding a role to `UserRole` is a
 * compile error here until the role is listed, which is the prompt to go and give
 * it an entry in each map below.
 */
const EVERY_ROLE: Record<UserRole, true> = {
  admin: true,
  teacher: true,
  user: true,
  guest: true,
  parent: true,
};
const ROLES = Object.keys(EVERY_ROLE) as UserRole[];

const userWithRole = (role: UserRole): User =>
  ({
    username: `${role}@example.com`,
    displayName: role,
    role,
    preferences: {},
    stats: {},
  }) as unknown as User;

describe('every role has an entry in each role-keyed list', () => {
  it('names every role', () => {
    ROLES.forEach((role) => {
      expect(ROLE_LABELS[role], `no label for "${role}"`).toBeTruthy();
      expect(roleLabel(role)).toBe(ROLE_LABELS[role]);
    });
  });

  it('gives every role a charter that exists', () => {
    ROLES.forEach((role) => {
      const charter = charterForRole(role);
      expect(charter, `no charter for "${role}"`).toBeDefined();
      expect(CHARTERS[audienceForRole(role)]).toBe(charter);
    });
  });

  it('gives every role a quick-start track that exists', () => {
    ROLES.forEach((role) => {
      const track = trackForRole(role);
      expect(track, `no quick start for "${role}"`).toBeDefined();
      expect(QUICK_START_TRACKS[track.audience]).toBe(track);
    });
  });

  it('gives every role an access audience for the plan prompts', () => {
    ROLES.forEach((role) => {
      expect(describeAccess('fullFeedback', userWithRole(role)).audience).toBeTruthy();
    });
  });

  it('settles each role on a report, or on none, deliberately', () => {
    // Written out in full so a new role is a decision, not a default.
    expect(ROLES.map((role) => [role, reportAudienceFor(role)])).toEqual([
      ['admin', 'school'],
      ['teacher', 'teacher'],
      ['user', 'student'],
      ['guest', null],
      ['parent', null],
    ]);
  });

  it('settles who may send a question to the shared library', () => {
    const contributors = ROLES.filter((role) => canContributeToLibrary(role));
    expect(contributors.sort()).toEqual(['admin', 'teacher', 'user']);
  });

  it('maps each role to the charter and quick start it should read', () => {
    expect(ROLES.map((role) => [role, audienceForRole(role)])).toEqual([
      ['admin', 'teacher'],
      ['teacher', 'teacher'],
      ['user', 'student'],
      ['guest', 'student'],
      ['parent', 'parent'],
    ]);
    expect(ROLES.map((role) => [role, trackForRole(role).audience])).toEqual([
      ['admin', 'teacher'],
      ['teacher', 'teacher'],
      ['user', 'student'],
      ['guest', 'guest'],
      ['parent', 'parent'],
    ]);
  });
});
