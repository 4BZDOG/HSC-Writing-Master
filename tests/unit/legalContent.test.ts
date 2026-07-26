import { describe, it, expect } from 'vitest';
import {
  AGREEMENT_VERSION,
  AGREEMENT_CHANGELOG,
  CHARTERS,
  LEGAL_DOCUMENTS,
  renderLegalText,
  getLegalDocument,
  type CharterIcon,
} from '../../data/legalContent';
import {
  QUICK_START_TRACKS,
  QUICK_START_VERSION,
  trackForRole,
  POWER_TIPS,
  type QuickStartIcon,
} from '../../data/quickStartContent';
import { CHARTER_ICONS, QUICK_START_ICONS } from '../../components/agreementIcons';
import {
  FREE_TIER_EVAL_LIMIT,
  FREE_TIER_MAX_QUESTION_TIER,
  FREE_TIER_MAX_SAMPLE_BAND,
} from '../../services/entitlements';
import type { UserRole } from '../../types';

/**
 * The agreements and the quick-start guide are content, and content rots
 * quietly: a token nobody substituted, an icon key with no icon, a version
 * bump with no changelog entry, a free-tier number that was true last quarter.
 * None of that throws at runtime — it just ships something wrong to a student.
 * These tests are the tripwire.
 */

describe('agreement versioning', () => {
  it('the current version has a changelog entry', () => {
    const entry = AGREEMENT_CHANGELOG.find((c) => c.version === AGREEMENT_VERSION);
    expect(
      entry,
      `AGREEMENT_VERSION is "${AGREEMENT_VERSION}" but AGREEMENT_CHANGELOG has no entry for it — ` +
        'a re-prompted user would be told nothing about what changed.'
    ).toBeDefined();
    expect(entry!.summary.length).toBeGreaterThan(0);
  });

  it('lists the changelog newest first, with unique versions', () => {
    const versions = AGREEMENT_CHANGELOG.map((c) => c.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[0]).toBe(AGREEMENT_VERSION);
  });

  it('has a quick-start version', () => {
    expect(QUICK_START_VERSION).toMatch(/\d/);
  });
});

describe('charters', () => {
  it('covers both audiences with usable content', () => {
    (['student', 'teacher'] as const).forEach((audience) => {
      const charter = CHARTERS[audience];
      expect(charter.audience).toBe(audience);
      expect(charter.promises.length).toBeGreaterThanOrEqual(4);
      expect(charter.acceptLabel.length).toBeGreaterThan(0);
      charter.promises.forEach((promise) => {
        expect(promise.title.length).toBeGreaterThan(0);
        expect(promise.body.length).toBeGreaterThan(0);
      });
    });
  });

  it('leads with the two things a user must not misunderstand', () => {
    // The AI-is-not-your-grade point and the integrity point are the only two
    // that carry real consequences if missed, so both are emphasised.
    expect(CHARTERS.student.promises.filter((p) => p.emphasis).length).toBeGreaterThanOrEqual(2);
    expect(CHARTERS.teacher.promises.filter((p) => p.emphasis).length).toBeGreaterThanOrEqual(2);
  });

  it('resolves every icon key to an icon', () => {
    Object.values(CHARTERS).forEach((charter) => {
      charter.promises.forEach((promise) => {
        expect(CHARTER_ICONS[promise.icon as CharterIcon], `no icon for "${promise.icon}"`).toBeDefined();
      });
    });
  });
});

describe('legal documents', () => {
  it('publishes both the terms and the privacy notice', () => {
    expect(getLegalDocument('terms')).toBeDefined();
    expect(getLegalDocument('privacy')).toBeDefined();
  });

  it('has unique section ids within each document, so the jump links work', () => {
    LEGAL_DOCUMENTS.forEach((doc) => {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size, `duplicate section id in ${doc.id}`).toBe(ids.length);
    });
  });

  it('leaves no unsubstituted template tokens after rendering', () => {
    const rendered = LEGAL_DOCUMENTS.flatMap((doc) => [
      renderLegalText(doc.subtitle),
      ...doc.sections.flatMap((s) => [...s.body, ...(s.bullets ?? [])].map(renderLegalText)),
    ]);
    rendered.forEach((text) => {
      expect(text, `unsubstituted token in: ${text.slice(0, 80)}…`).not.toMatch(/\{\{\w+\}\}/);
    });
  });

  it('states the free-tier limits the code actually enforces', () => {
    const plans = getLegalDocument('terms')!.sections.find((s) => s.id === 'plans')!;
    const text = plans.body.join(' ');
    expect(text).toContain(`${FREE_TIER_EVAL_LIMIT} marked evaluations`);
    expect(text).toContain(`tier ${FREE_TIER_MAX_QUESTION_TIER}`);
    expect(text).toContain(`Band ${FREE_TIER_MAX_SAMPLE_BAND}`);
  });

  it('says plainly that AI marks are not official results', () => {
    const ai = getLegalDocument('terms')!.sections.find((s) => s.id === 'ai')!;
    expect(ai.body.join(' ')).toMatch(/not an official assessment result/i);
  });

  it('discloses teacher visibility of student work in the privacy notice', () => {
    const teachers = getLegalDocument('privacy')!.sections.find((s) => s.id === 'teachers');
    expect(teachers, 'privacy notice must disclose what teachers can see').toBeDefined();
    expect(teachers!.body.join(' ')).toMatch(/teachers/i);
  });
});

describe('quick start', () => {
  const ROLES: UserRole[] = ['admin', 'teacher', 'user', 'guest'];

  it('gives every role a track', () => {
    ROLES.forEach((role) => {
      const track = trackForRole(role);
      expect(track.steps.length).toBeGreaterThan(0);
      expect(track.closer.length).toBeGreaterThan(0);
    });
  });

  it('sends staff to the teacher track and everyone else to their own', () => {
    expect(trackForRole('admin').audience).toBe('teacher');
    expect(trackForRole('teacher').audience).toBe('teacher');
    expect(trackForRole('user').audience).toBe('student');
    expect(trackForRole('guest').audience).toBe('guest');
  });

  it('resolves every icon key to an icon', () => {
    Object.values(QUICK_START_TRACKS).forEach((track) => {
      track.steps.forEach((step) => {
        expect(
          QUICK_START_ICONS[step.icon as QuickStartIcon],
          `no icon for "${step.icon}"`
        ).toBeDefined();
      });
    });
  });

  it('tells guests their work is not saved', () => {
    const guestText = QUICK_START_TRACKS.guest.steps.map((s) => s.body).join(' ');
    expect(guestText).toMatch(/not saved|nothing is saved/i);
  });

  it('has power tips with both a label and a body', () => {
    expect(POWER_TIPS.length).toBeGreaterThan(0);
    POWER_TIPS.forEach((tip) => {
      expect(tip.label.length).toBeGreaterThan(0);
      expect(tip.body.length).toBeGreaterThan(0);
    });
  });
});
