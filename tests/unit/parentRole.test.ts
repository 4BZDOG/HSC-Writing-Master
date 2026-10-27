import { describe, it, expect } from 'vitest';
import type { User, UserRole } from '../../types';
import { mapSupabaseRole } from '../../services/authService';
import { describeAccess, getUserPlan } from '../../services/entitlements';
import { audienceForRole, charterForRole } from '../../services/agreementService';
import { trackForRole } from '../../data/quickStartContent';
import { reportAudienceFor } from '../../utils/progressReportOptions';
import {
  ROLE_LABELS,
  canCurateContent,
  canModerate,
  canUseAiGeneration,
  isSystemAdmin,
  roleLabel,
} from '../../utils/permissions';

/**
 * A parent or guardian is a role of their own. They read the child's progress,
 * pay for the child's Plus, and do nothing else the app's staff and students
 * do. These tests hold the client side of that: the mapping from the database,
 * the labels, the capability helpers, and the sentence a parent is shown in
 * place of an upgrade they must never be offered for themselves.
 */

const parentUser = {
  username: 'pat@example.com',
  displayName: 'Pat Nguyen',
  role: 'parent' as UserRole,
  preferences: {},
  stats: {},
} as unknown as User;

const studentUser = { ...parentUser, username: 'sam@example.com', role: 'user' } as unknown as User;

describe('the parent role', () => {
  it('maps the database role to the app role', () => {
    expect(mapSupabaseRole('parent')).toBe('parent');
  });

  it('still maps the other database roles as before', () => {
    expect(mapSupabaseRole('student')).toBe('user');
    expect(mapSupabaseRole('teacher')).toBe('teacher');
    expect(mapSupabaseRole('admin')).toBe('admin');
    expect(mapSupabaseRole(undefined)).toBe('user');
  });

  it('is named Parent/guardian for the person who holds it', () => {
    expect(ROLE_LABELS.parent).toBe('Parent/guardian');
    expect(roleLabel('parent')).toBe('Parent/guardian');
  });

  it('curates, moderates, generates and administers nothing', () => {
    expect(canCurateContent('parent')).toBe(false);
    expect(canModerate('parent')).toBe(false);
    expect(canUseAiGeneration('parent')).toBe(false);
    expect(isSystemAdmin('parent')).toBe(false);
  });

  it('holds no plan of its own', () => {
    expect(getUserPlan(parentUser)).toBe('free');
  });

  it('reads its own charter and its own quick start, never the student ones', () => {
    expect(audienceForRole('parent')).toBe('parent');
    expect(charterForRole('parent').audience).toBe('parent');
    expect(trackForRole('parent').audience).toBe('parent');
    expect(trackForRole('user').audience).toBe('student');
  });

  it('has no printable progress report, because it reads a child through the dashboard', () => {
    expect(reportAudienceFor('parent')).toBeNull();
  });
});

describe('what a parent is offered for their own account', () => {
  it('never offers an upgrade button for a Plus feature', () => {
    const access = describeAccess('fullFeedback', parentUser);

    expect(access.state).toBe('locked');
    expect(access.cause).toBe('role');
    expect(access.cta).toBe('none');
    expect(access.ctaLabel).toBe('');
  });

  it('points the parent to the child, not to a purchase for themselves', () => {
    const access = describeAccess('fullFeedback', parentUser);

    expect(access.explanation).toMatch(
      /Buy it for your child from your parent or guardian dashboard/
    );
    expect(access.explanation).not.toMatch(/Upgrade/);
  });

  it('is never offered a School licence', () => {
    const access = describeAccess('aiContentStudio', parentUser);

    expect(access.cta).toBe('none');
    expect(access.explanation).toMatch(/for teacher and admin accounts/);
  });

  it('keeps the upgrade a student is offered', () => {
    const access = describeAccess('fullFeedback', studentUser);

    expect(access.cta).toBe('upgrade');
    expect(access.ctaLabel).toMatch(/^Upgrade to /);
  });
});
