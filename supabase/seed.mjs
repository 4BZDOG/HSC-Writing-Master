// =============================================================================
// HSC AI Evaluator — Supabase seed script
// =============================================================================
// Imports the existing courseData/*.json files (your prototype/template
// content) into the Supabase schema as `approved` library content owned by an
// admin. Safe to re-run: it upserts on `legacy_id` so existing rows are reused
// rather than duplicated.
//
// Usage:
//   1. Apply supabase/schema.sql first (Supabase SQL editor or `supabase db push`).
//   2. npm i @supabase/supabase-js          # if not already installed
//   3. Set env vars (NEVER commit these — service role key bypasses RLS):
//        export SUPABASE_URL="https://<project>.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
//        export SEED_ADMIN_ID="<uuid of an existing admin profile>"  # optional
//   4. node supabase/seed.mjs
//
// The manifest at courseData/manifest.json decides which files load. Files of
// type "course" are imported as full courses; "topic" entries are skipped here
// (they attach to an existing course and are better handled in-app).
// =============================================================================

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The syllabus JSON lives under public/ so the Vite build ships it; this script
// reads it from there. (It pointed at a bare `courseData/` that no longer
// exists, which meant the seed could not run at all.)
const COURSE_DATA_DIR = resolve(__dirname, '..', 'public', 'courseData');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_ID } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.'
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const createdBy = SEED_ADMIN_ID || null; // owner of seeded content

// --- helpers ---------------------------------------------------------------

/** Insert a row and return its new id, reusing an existing row by legacy_id. */
async function upsert(table, matchCol, matchVal, row) {
  if (matchVal) {
    const { data: existing, error: selErr } = await db
      .from(table)
      .select('id')
      .eq(matchCol, matchVal)
      .maybeSingle();
    if (selErr) throw new Error(`${table} lookup failed: ${selErr.message}`);
    if (existing) {
      const { error: updErr } = await db.from(table).update(row).eq('id', existing.id);
      if (updErr) throw new Error(`${table} update failed: ${updErr.message}`);
      return existing.id;
    }
  }
  const { data, error } = await db.from(table).insert(row).select('id').single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return data.id;
}

const arr = (v) => (Array.isArray(v) ? v : []);

// The year of a topic or an outcome, written the one way the whole app writes
// it: only 'year11', never 'year12'. Absence IS Year 12 (schema.sql §22, §23),
// so an all-HSC course — which is every course in courseData today — inserts
// rows byte-identical to what it inserted before the columns existed, and seeds
// fine against a database that has not applied those sections yet.
const yearCol = (item) => (item?.year === 'year11' ? { year: 'year11' } : {});

// --- import one course tree -------------------------------------------------

async function importCourse(course, subject) {
  const courseId = await upsert('courses', 'legacy_id', course.id, {
    legacy_id: course.id,
    name: course.name,
    subject: course.subject || subject || null,
    status: 'approved',
    created_by: createdBy,
  });

  // Outcomes (clear + reinsert keeps them in sync without legacy ids)
  await db.from('course_outcomes').delete().eq('course_id', courseId);
  const outcomes = arr(course.outcomes).map((o, i) => ({
    course_id: courseId,
    code: o.code,
    description: o.description,
    position: i,
    ...yearCol(o),
  }));
  if (outcomes.length) {
    const { error } = await db.from('course_outcomes').insert(outcomes);
    if (error) throw new Error(`outcomes insert failed: ${error.message}`);
  }

  let nTopics = 0,
    nPrompts = 0,
    nAnswers = 0;

  for (const [ti, topic] of arr(course.topics).entries()) {
    const topicId = await upsert('topics', 'legacy_id', topic.id, {
      course_id: courseId,
      legacy_id: topic.id,
      name: topic.name,
      position: ti,
      band_descriptors: topic.performanceBandDescriptors ?? [],
      ...yearCol(topic),
      // Structure is now moderated (default 'private'); seeds are canonical.
      status: 'approved',
    });
    nTopics++;

    for (const [si, sub] of arr(topic.subTopics).entries()) {
      const subId = await upsert('sub_topics', 'legacy_id', sub.id, {
        topic_id: topicId,
        legacy_id: sub.id,
        name: sub.name,
        position: si,
        status: 'approved',
      });

      for (const [di, dp] of arr(sub.dotPoints).entries()) {
        const dpId = await upsert('dot_points', 'legacy_id', dp.id, {
          sub_topic_id: subId,
          legacy_id: dp.id,
          description: dp.description,
          position: di,
          status: 'approved',
        });

        for (const prompt of arr(dp.prompts)) {
          const promptId = await upsert('prompts', 'legacy_id', prompt.id, {
            dot_point_id: dpId,
            legacy_id: prompt.id,
            question: prompt.question,
            total_marks: prompt.totalMarks ?? 0,
            verb: prompt.verb ?? null,
            scenario: prompt.scenario ?? null,
            marking_criteria: prompt.markingCriteria ?? null,
            linked_outcomes: arr(prompt.linkedOutcomes),
            related_topics: arr(prompt.relatedTopics),
            prerequisite_knowledge: arr(prompt.prerequisiteKnowledge),
            marker_notes: arr(prompt.markerNotes),
            common_student_errors: arr(prompt.commonStudentErrors),
            keywords: arr(prompt.keywords),
            is_past_hsc: !!prompt.isPastHSC,
            hsc_year: prompt.hscYear ?? null,
            hsc_question_number: prompt.hscQuestionNumber ?? null,
            status: 'approved',
            created_by: createdBy,
          });
          nPrompts++;

          for (const sa of arr(prompt.sampleAnswers)) {
            await upsert('sample_answers', 'legacy_id', sa.id, {
              prompt_id: promptId,
              legacy_id: sa.id,
              band: sa.band ?? 0,
              mark: sa.mark ?? 0,
              answer: sa.answer ?? '',
              source: sa.source ?? 'AI',
              feedback: sa.feedback ?? null,
              quick_tip: sa.quickTip ?? null,
              status: 'approved',
              created_by: createdBy,
            });
            nAnswers++;
          }
        }
      }
    }
  }

  console.log(
    `  ✓ ${course.name}: ${nTopics} topics, ${nPrompts} prompts, ${nAnswers} sample answers`
  );
}

// --- main -------------------------------------------------------------------

async function main() {
  const manifestRaw = await readFile(join(COURSE_DATA_DIR, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const courseEntries = arr(manifest.entries).filter((e) => e.type === 'course');

  console.log(`Seeding ${courseEntries.length} course file(s) from courseData/…\n`);

  for (const entry of courseEntries) {
    const raw = await readFile(join(COURSE_DATA_DIR, entry.file), 'utf8');
    const parsed = JSON.parse(raw);
    // Course files are arrays of Course objects.
    const courses = Array.isArray(parsed) ? parsed : [parsed];
    for (const course of courses) {
      await importCourse(course, entry.subject);
    }
  }

  console.log('\nDone. Seeded content is owned by the admin and marked approved.');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
