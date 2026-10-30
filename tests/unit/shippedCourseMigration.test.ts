import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { heldBackOffer, replaceWithShipped, syncShippedCourses } from '../../hooks/useSyllabusData';
import { runMigrations, DATA_VERSION, RETIRED_SEED_COURSE_IDS } from '../../utils/storageUtils';
import {
  carryPersonalFields,
  hashCourse,
  isUnedited,
  stampShipped,
} from '../../utils/shippedCourseStamp';
import { analyzeAndSanitizeImportData } from '../../utils/dataManagerUtils';
import type { Course } from '../../types';

/**
 * A returning browser keeps the library it saved. Before 2.11.0 that library
 * still held the retired Biology and template courses, and it never re-ran
 * discovery, so the new shipped courses would never have reached it. These
 * tests run the migration and the sync against the shipped files themselves.
 */

const SHIPPED = join(process.cwd(), 'public/courseData');
const NEW_COURSE_IDS = [
  'course-hsc-modern-history',
  'course-hsc-legal-studies',
  'course-hsc-business-studies',
  'course-hsc-economics',
  'course-hsc-english-advanced',
];
const SOFTWARE_ENGINEERING = 'course-a48c3436-2379-4b87-b51e-0f4b029d6c98';
const ENTERPRISE_COMPUTING = 'course-ec-01';
const BIOLOGY = 'course-3cb7f305-5233-428e-8255-566fa5c10560';
const TEMPLATE = 'course-template-01';
const MODERN_HISTORY = 'course-hsc-modern-history';

const course = (id: string, name: string): Course =>
  ({ id, name, outcomes: [], topics: [] }) as Course;

/**
 * The course a shipped file contains, sanitised the way the sync and discovery
 * sanitise it before storing it. Fingerprints are taken of this form.
 */
const shippedCourse = (file: string): Course => {
  const analysis = analyzeAndSanitizeImportData(
    JSON.parse(readFileSync(join(SHIPPED, file), 'utf8'))
  );
  return (analysis.data as Course[])[0];
};

/**
 * The first question of a course, by where it sits, so a test can write on it. A
 * shipped course can open on topics that carry structure only, with no questions yet,
 * so it is the first dot point that has one.
 */
const firstQuestionDotPoint = (c: Course) =>
  c.topics
    .flatMap((t) => t.subTopics.flatMap((st) => st.dotPoints))
    .find((dp) => dp.prompts.length > 0)!;
const firstPrompt = (c: Course) => firstQuestionDotPoint(c).prompts[0];

/** A copy of `c` with a student's draft written on its first question. */
const withDraft = (c: Course, draft = 'My first paragraph.', seconds = 240): Course => {
  const target = firstPrompt(c).id;
  const topics = c.topics.map((topic) => ({
    ...topic,
    subTopics: topic.subTopics.map((st) => ({
      ...st,
      dotPoints: st.dotPoints.map((dp) => ({
        ...dp,
        prompts: dp.prompts.map((p) =>
          p.id === target ? { ...p, userDraft: draft, draftElapsedSeconds: seconds } : p
        ),
      })),
    })),
  }));
  return { ...c, topics };
};

/** Every shipped file, served by name, as the browser would fetch them. */
const serveShipped = (omit: string[] = []) => {
  const files = Object.fromEntries(
    readdirSync(SHIPPED)
      .filter((f) => f.endsWith('.json') && !omit.includes(f))
      .map((f) => [f, readFileSync(join(SHIPPED, f), 'utf8')])
  );
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const name = String(url).split('/').pop() ?? '';
    const body = files[name];
    return body === undefined
      ? new Response('', { status: 404 })
      : new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the 2.11.0 library migration', () => {
  it('retires the Biology and template ids, and only those', () => {
    expect(RETIRED_SEED_COURSE_IDS).toEqual(
      expect.arrayContaining([
        BIOLOGY,
        TEMPLATE,
        'course-bio-advanced',
        'course-chemistry-advanced',
      ])
    );
    expect(RETIRED_SEED_COURSE_IDS).not.toContain(SOFTWARE_ENGINEERING);
    expect(RETIRED_SEED_COURSE_IDS).not.toContain(ENTERPRISE_COMPUTING);
  });

  it('removes retired courses from a library saved before 2.11.0', () => {
    const saved = [
      course(SOFTWARE_ENGINEERING, 'HSC Software Engineering'),
      course(BIOLOGY, 'HSC Biology'),
      course(TEMPLATE, 'Template'),
      course('course-a-teachers-own', "A teacher's own course"),
    ];
    const migrated = runMigrations(saved, '2.10.0');
    expect(migrated.map((c) => c.id)).toEqual([SOFTWARE_ENGINEERING, 'course-a-teachers-own']);
  });

  it('leaves the library alone when it is already at the current version', () => {
    const saved = [course(BIOLOGY, 'HSC Biology')];
    expect(runMigrations(saved, DATA_VERSION).map((c) => c.id)).toEqual([BIOLOGY]);
  });

  it('adds the five shipped courses, drops Biology, and backs up a legacy copy it replaces', async () => {
    serveShipped();
    const saved = [
      course(SOFTWARE_ENGINEERING, 'HSC Software Engineering (edited)'),
      course(ENTERPRISE_COMPUTING, 'HSC Enterprise Computing (edited)'),
      course(BIOLOGY, 'HSC Biology'),
      course(TEMPLATE, 'Template'),
    ];

    const migrated = runMigrations(saved, '2.10.0');
    const result = await syncShippedCourses(migrated);

    expect(result.complete).toBe(true);
    const ids = result.courses.map((c) => c.id);
    for (const id of NEW_COURSE_IDS) expect(ids).toContain(id);
    expect(ids).not.toContain(BIOLOGY);
    expect(ids).not.toContain(TEMPLATE);
    expect(ids.filter((id) => id === SOFTWARE_ENGINEERING)).toHaveLength(1);
    expect(result.courses.find((c) => c.id === SOFTWARE_ENGINEERING)?.name).toBe(
      shippedCourse('HSCSoftwareEngineering09122025.json').name
    );
    const backup = result.courses.find((c) => c.id === `${SOFTWARE_ENGINEERING}-before-refresh`);
    expect(backup?.name).toBe('HSC Software Engineering (edited) (before refresh)');
    expect(backup?.supersededBy).toBe(SOFTWARE_ENGINEERING);
  });

  it('reports incomplete and changes nothing when the manifest cannot be read', async () => {
    serveShipped(['manifest.json']);
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];

    const result = await syncShippedCourses(saved);

    expect(result.complete).toBe(false);
    expect(result.courses).toBe(saved);
  });

  it('reports incomplete when a shipped course file is missing, so the next load retries', async () => {
    serveShipped(['HSCModernHistory.json']);
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];

    const result = await syncShippedCourses(saved);

    expect(result.complete).toBe(false);
  });

  it('adds Geography, English Standard and Ancient History to a library that lacks them', async () => {
    serveShipped();
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];

    const result = await syncShippedCourses(saved);

    expect(result.complete).toBe(true);
    const ids = result.courses.map((c) => c.id);
    expect(ids).toContain('course-hsc-geography');
    expect(ids).toContain('course-hsc-english-standard');
    expect(ids).toContain('course-hsc-ancient-history');
  });
});

describe('courses the browser was already offered', () => {
  it('does not add back a course the user unticked or deleted, and adds one that is new', async () => {
    serveShipped();
    const saved = [course(SOFTWARE_ENGINEERING, 'HSC Software Engineering')];
    // Offered before (the first-run picker listed them) but not kept.
    const offered = new Set(['course-hsc-geography', 'course-hsc-english-standard']);

    const result = await syncShippedCourses(saved, offered);

    const ids = result.courses.map((c) => c.id);
    expect(ids).not.toContain('course-hsc-geography');
    expect(ids).not.toContain('course-hsc-english-standard');
    // Never offered, so it is new to this browser and arrives.
    expect(ids).toContain('course-hsc-ancient-history');
    // Every shipped id comes back to be recorded, so the next bump knows them all.
    expect(result.shippedIds).toEqual(
      expect.arrayContaining(['course-hsc-geography', 'course-hsc-ancient-history'])
    );
  });

  it('still refreshes a kept course that was offered', async () => {
    serveShipped();
    const shipped = shippedCourse('HSCEconomics.json');
    const saved = [{ ...shipped, name: 'Old name', shippedHash: undefined }];
    const result = await syncShippedCourses(saved, new Set([shipped.id]));
    expect(result.courses.find((c) => c.id === shipped.id)?.name).toBe(shipped.name);
  });
});

describe('the shipped-course fingerprint', () => {
  it('ignores its own stamp, and changes when the content changes', () => {
    const modernHistory = shippedCourse('HSCModernHistory.json');
    expect(hashCourse({ ...modernHistory, shippedHash: 'anything' })).toBe(
      hashCourse(modernHistory)
    );
    expect(hashCourse({ ...modernHistory, name: `${modernHistory.name}!` })).not.toBe(
      hashCourse(modernHistory)
    );
  });

  it('hashes a course with no student state exactly as it always did, so stored stamps stay valid', () => {
    // Pinned from the algorithm before drafts were left out of it.
    expect(hashCourse(course('a', 'b'))).toBe('a1e79bb9');
  });

  it('does not count a student’s draft or writing time as an edit', () => {
    const modernHistory = shippedCourse('HSCModernHistory.json');
    expect(hashCourse(withDraft(modernHistory))).toBe(hashCourse(modernHistory));
    expect(hashCourse(withDraft(modernHistory, 'A different draft.', 9))).toBe(
      hashCourse(modernHistory)
    );
  });

  it('still counts a change to the course itself, drafts or not', () => {
    const modernHistory = shippedCourse('HSCModernHistory.json');
    expect(hashCourse(withDraft({ ...modernHistory, name: 'Edited' }))).not.toBe(
      hashCourse(modernHistory)
    );
  });

  it('treats a stamped copy as unedited only until its content changes', () => {
    const stamped = stampShipped(shippedCourse('HSCModernHistory.json'));
    expect(isUnedited(stamped)).toBe(true);
    expect(isUnedited({ ...stamped, name: 'Edited' })).toBe(false);
    expect(isUnedited(shippedCourse('HSCModernHistory.json'))).toBe(false);
  });

  it('keeps a stamped copy unedited when a student has written in it', () => {
    const stamped = stampShipped(shippedCourse('HSCModernHistory.json'));
    expect(isUnedited(withDraft(stamped))).toBe(true);
    expect(isUnedited(withDraft({ ...stamped, name: 'Edited' }))).toBe(false);
  });
});

describe('carrying a student’s words onto a newer course', () => {
  it('puts each draft on the question with the same id, and changes neither input', () => {
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const from = withDraft(modernHistory);
    const to = shippedCourse('HSCModernHistory.json');

    const { course: carried, orphaned } = carryPersonalFields(from, to);

    expect(orphaned).toBe(false);
    expect(firstPrompt(carried).userDraft).toBe('My first paragraph.');
    expect(firstPrompt(carried).draftElapsedSeconds).toBe(240);
    expect(firstPrompt(to).userDraft).toBeUndefined();
    expect(firstPrompt(from).userDraft).toBe('My first paragraph.');
  });

  it('says so when a draft has no question to go to', () => {
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const from = withDraft(modernHistory);
    const to = withDraft(modernHistory); // same ids…
    firstQuestionDotPoint(to).prompts = []; // …but that question is gone

    expect(carryPersonalFields(from, to).orphaned).toBe(true);
  });

  it('returns the newer course untouched when there is nothing to carry', () => {
    const to = shippedCourse('HSCModernHistory.json');
    const { course: carried, orphaned } = carryPersonalFields(
      shippedCourse('HSCModernHistory.json'),
      to
    );
    expect(carried).toBe(to);
    expect(orphaned).toBe(false);
  });
});

describe('refreshing copies already in the library', () => {
  it('replaces an unedited copy with the newer shipped version', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const saved = [stampShipped({ ...modernHistory, name: 'HSC Modern History (older)' })];

    const result = await syncShippedCourses(saved);

    const refreshed = result.courses.find((c) => c.id === MODERN_HISTORY);
    expect(refreshed?.name).toBe(modernHistory.name);
    expect(refreshed?.shippedHash).toBe(hashCourse(modernHistory));
    expect(result.courses.map((c) => c.id)).not.toContain(`${MODERN_HISTORY}-before-refresh`);
  });

  it('keeps a stamped copy the user has edited', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const saved = [{ ...stampShipped(modernHistory), name: 'My Modern History' }];

    const result = await syncShippedCourses(saved);

    expect(result.courses.find((c) => c.id === MODERN_HISTORY)?.name).toBe('My Modern History');
  });

  it('stamps a legacy copy that already matches the shipped content, without a backup', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const saved = [modernHistory];

    const result = await syncShippedCourses(saved);

    expect(result.courses.find((c) => c.id === MODERN_HISTORY)?.shippedHash).toBe(
      hashCourse(modernHistory)
    );
    expect(result.courses.map((c) => c.id)).not.toContain(`${MODERN_HISTORY}-before-refresh`);
  });

  it('keeps a backup of a legacy copy that differs from the shipped content', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const saved = [{ ...modernHistory, name: 'Mine' }];

    const result = await syncShippedCourses(saved);

    expect(result.courses.find((c) => c.id === MODERN_HISTORY)?.name).toBe(modernHistory.name);
    const backup = result.courses.find((c) => c.id === `${MODERN_HISTORY}-before-refresh`);
    expect(backup?.name).toBe('Mine (before refresh)');
    expect(backup?.shippedHash).toBeUndefined();
  });

  it('refreshes a copy a student has written in, and carries their draft across', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    // An older shipped version, stamped, with a draft on one of its questions. Before drafts
    // were left out of the fingerprint this copy counted as edited and was kept forever.
    const saved = [
      withDraft(stampShipped({ ...modernHistory, name: 'HSC Modern History (older)' })),
    ];

    const result = await syncShippedCourses(saved);

    const refreshed = result.courses.find((c) => c.id === MODERN_HISTORY)!;
    expect(refreshed.name).toBe(modernHistory.name);
    expect(refreshed.shippedHash).toBe(hashCourse(modernHistory));
    expect(firstPrompt(refreshed).userDraft).toBe('My first paragraph.');
    expect(firstPrompt(refreshed).draftElapsedSeconds).toBe(240);
    expect(isUnedited(refreshed)).toBe(true);
    expect(result.courses.map((c) => c.id)).not.toContain(`${MODERN_HISTORY}-before-refresh`);
  });

  it('leaves an up-to-date copy with a draft exactly as it is', async () => {
    serveShipped();
    const saved = [withDraft(stampShipped(shippedCourse('HSCModernHistory.json')))];

    const result = await syncShippedCourses(saved);

    expect(result.courses.find((c) => c.id === MODERN_HISTORY)).toBe(saved[0]);
  });

  it('keeps a backup beside the refreshed course when a draft has no question left', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    // An OLDER shipped version that still had a question a later rebuild merged away: it is
    // part of what was shipped, so it is in the stamp. The student then wrote on it.
    const addGone = (c: Course, draft?: string): Course => ({
      ...c,
      name: 'HSC Modern History (older)',
      topics: c.topics.map((topic, ti) => ({
        ...topic,
        subTopics: topic.subTopics.map((st, si) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp, di) =>
            ti === 0 && si === 0 && di === 0
              ? {
                  ...dp,
                  prompts: [
                    ...dp.prompts,
                    { ...dp.prompts[0], id: 'prompt-removed-in-a-rebuild', userDraft: draft },
                  ],
                }
              : dp
          ),
        })),
      })),
    });
    const stampedOlder = stampShipped(addGone(modernHistory));
    // The same course as stamped, with the student's words written on the extra question.
    const withWords: Course = {
      ...stampedOlder,
      topics: stampedOlder.topics.map((topic) => ({
        ...topic,
        subTopics: topic.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: dp.prompts.map((p) =>
              p.id === 'prompt-removed-in-a-rebuild'
                ? { ...p, userDraft: 'Words on a question that was merged away.' }
                : p
            ),
          })),
        })),
      })),
    };
    expect(isUnedited(withWords)).toBe(true);

    const result = await syncShippedCourses([withWords]);

    expect(result.courses.find((c) => c.id === MODERN_HISTORY)?.name).toBe(modernHistory.name);
    const backup = result.courses.find((c) => c.id === `${MODERN_HISTORY}-before-refresh`);
    expect(backup?.name).toBe('HSC Modern History (older) (before refresh)');
    expect(JSON.stringify(backup)).toContain('Words on a question that was merged away.');
  });

  it('still keeps a copy edited beyond its drafts, with its drafts', async () => {
    serveShipped();
    const saved = [
      withDraft({ ...stampShipped(shippedCourse('HSCModernHistory.json')), name: 'Mine' }),
    ];

    const result = await syncShippedCourses(saved);

    const kept = result.courses.find((c) => c.id === MODERN_HISTORY)!;
    expect(kept.name).toBe('Mine');
    expect(firstPrompt(kept).userDraft).toBe('My first paragraph.');
  });

  it('carries a draft across when it replaces a legacy copy, and still keeps the backup', async () => {
    serveShipped();
    const modernHistory = shippedCourse('HSCModernHistory.json');
    const saved = [withDraft({ ...modernHistory, name: 'Mine' })];

    const result = await syncShippedCourses(saved);

    expect(firstPrompt(result.courses.find((c) => c.id === MODERN_HISTORY)!).userDraft).toBe(
      'My first paragraph.'
    );
    expect(result.courses.map((c) => c.id)).toContain(`${MODERN_HISTORY}-before-refresh`);
  });
});

describe('an edited copy with a newer version waiting', () => {
  const BUSINESS = 'course-hsc-business-studies';

  /** Business Studies as it shipped before its past HSC papers, stamped then edited. */
  const editedBeforePastPapers = (): Course => {
    const current = shippedCourse('HSCBusinessStudies.json');
    const older: Course = {
      ...current,
      topics: current.topics.map((t) => ({
        ...t,
        subTopics: t.subTopics.map((st) => ({
          ...st,
          dotPoints: st.dotPoints.map((dp) => ({
            ...dp,
            prompts: dp.prompts.filter((p) => !p.isPastHSC),
          })),
        })),
      })),
    };
    return { ...stampShipped(older), name: 'My Business Studies' };
  };

  it('keeps the copy and reports it, with the questions it is missing', async () => {
    serveShipped();
    const result = await syncShippedCourses([editedBeforePastPapers()]);

    expect(result.courses.find((c) => c.id === BUSINESS)?.name).toBe('My Business Studies');
    expect(result.heldBack).toEqual([
      { id: BUSINESS, name: 'My Business Studies', newQuestions: 93 },
    ]);
  });

  it('reports nothing when the shipped version has not changed since the copy was taken', async () => {
    serveShipped();
    const saved = [{ ...stampShipped(shippedCourse('HSCBusinessStudies.json')), name: 'Mine' }];

    const result = await syncShippedCourses(saved);

    expect(result.heldBack).toEqual([]);
  });

  it('replaces the copy on request, keeps it as a backup and carries drafts across', () => {
    const shipped = shippedCourse('HSCBusinessStudies.json');
    const copy = withDraft(editedBeforePastPapers());
    const earlier = { ...copy, id: `${BUSINESS}-before-refresh`, supersededBy: BUSINESS };

    const next = replaceWithShipped([copy, earlier], new Map([[BUSINESS, shipped]]), [BUSINESS]);

    const updated = next.find((c) => c.id === BUSINESS)!;
    expect(updated.name).toBe(shipped.name);
    expect(isUnedited(updated)).toBe(true);
    expect(firstPrompt(updated).userDraft).toBe('My first paragraph.');
    // The earlier backup stays; the new one gets its own id.
    expect(next.map((c) => c.id)).toEqual([
      BUSINESS,
      `${BUSINESS}-before-refresh`,
      `${BUSINESS}-before-refresh-2`,
    ]);
    expect(next[2].name).toBe('My Business Studies (before refresh)');
  });

  it('leaves courses that were not asked for alone', () => {
    const copy = editedBeforePastPapers();
    const shipped = new Map([[BUSINESS, shippedCourse('HSCBusinessStudies.json')]]);
    expect(replaceWithShipped([copy], shipped, [])).toEqual([copy]);
  });

  it('words the offer for one course and for several', () => {
    expect(heldBackOffer([{ id: 'a', name: 'HSC Business Studies', newQuestions: 90 }])).toEqual({
      message:
        'A newer version of HSC Business Studies is available, with 90 questions your copy does not have. Your copy has changes, so it was kept. Updating keeps your copy as a backup.',
      label: 'Update it',
    });
    const many = heldBackOffer([
      { id: 'a', name: 'HSC Business Studies', newQuestions: 90 },
      { id: 'b', name: 'HSC Geography', newQuestions: 0 },
      { id: 'c', name: 'HSC Economics', newQuestions: 1 },
    ]);
    expect(many.message).toMatch(
      /^Newer versions of HSC Business Studies, HSC Geography and HSC Economics are available, with 91 questions your copies do not have\./
    );
    expect(many.label).toBe('Update them');
  });
});
