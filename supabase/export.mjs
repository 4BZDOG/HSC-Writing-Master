// =============================================================================
// HSC AI Evaluator — Supabase export script (the inverse of seed.mjs)
// =============================================================================
// Pulls the APPROVED library out of Supabase and writes it back to
// courseData/*.json in the app's native `Course[]` shape, so proven community
// (user/AI) contributions can be promoted into the canonical, version-controlled
// seed set. Round-trips cleanly with seed.mjs: fields map back to the same
// legacy ids, so re-seeding the exported files is a no-op upsert.
//
// Only `approved` content is exported (the whole point is a curated bank);
// private/pending/rejected drafts are skipped.
//
// Usage:
//   export SUPABASE_URL="https://<project>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS
//   export EXPORT_DIR="courseData/exported"                 # optional; default shown
//   node supabase/export.mjs
//
// ⚠️ The service role key bypasses RLS — server-side only, never commit it.
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPORT_DIR } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const outDir = resolve(REPO_ROOT, EXPORT_DIR || 'courseData/exported');

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// App-facing id prefers the original JSON id (legacy_id) so exports round-trip.
const appId = (row) => row.legacy_id || row.id;
const arr = (v) => (Array.isArray(v) ? v : []);

// Turn "HSC Software Engineering" / a legacy id into a safe file name.
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'course';

// Page past PostgREST's response cap (Supabase "Max rows", 1000 by default) —
// without this a grown library would be silently truncated. Ordered by id so
// pages are stable.
const PAGE_SIZE = 1000;
const fetchAll = async (table, columns, filterApproved) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from(table).select(columns);
    if (filterApproved) query = query.eq('status', 'approved');
    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
};

// Topics and outcomes carry a `year` (schema.sql §22, §23). A database that has
// not applied those sections refuses the whole request for naming a column it
// does not have, which would fail an export over one optional field — so ask
// with it, then ask again without it, exactly as the app does.
const fetchAllWithYear = async (table, columns, filterApproved) =>
  fetchAll(table, `${columns}, year`, filterApproved).catch(() =>
    fetchAll(table, columns, filterApproved)
  );

// Only 'year11' is ever written; absence means Year 12. Keeping that rule here
// is what makes an export of HSC-only content identical to what it was before
// the split, so re-seeding it stays a no-op upsert.
const yearField = (row) => (row?.year === 'year11' ? { year: 'year11' } : {});

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const bucket = map.get(row[key]);
    if (bucket) bucket.push(row);
    else map.set(row[key], [row]);
  }
  return map;
};

const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

// --- Row -> app-shape mappers (inverse of seed.mjs) -------------------------

const toSampleAnswer = (row) => ({
  id: appId(row),
  band: row.band,
  mark: row.mark,
  answer: row.answer,
  source: row.source ?? 'AI',
  ...(row.feedback ? { feedback: row.feedback } : {}),
  ...(row.quick_tip ? { quickTip: row.quick_tip } : {}),
});

const toPrompt = (row, answers) => ({
  id: appId(row),
  question: row.question,
  highlightedQuestion: row.highlighted_question ?? undefined,
  totalMarks: row.total_marks ?? 0,
  verb: row.verb ?? undefined,
  scenario: row.scenario ?? undefined,
  markingCriteria: row.marking_criteria ?? undefined,
  linkedOutcomes: arr(row.linked_outcomes),
  relatedTopics: arr(row.related_topics),
  prerequisiteKnowledge: arr(row.prerequisite_knowledge),
  markerNotes: arr(row.marker_notes),
  commonStudentErrors: arr(row.common_student_errors),
  keywords: arr(row.keywords),
  targetPerformanceBands: arr(row.target_performance_bands),
  estimatedTime: row.estimated_time ?? undefined,
  isPastHSC: row.is_past_hsc ?? false,
  hscYear: row.hsc_year ?? undefined,
  hscQuestionNumber: row.hsc_question_number ?? undefined,
  sampleAnswers: answers
    .slice()
    .sort((a, b) => a.band - b.band)
    .map(toSampleAnswer),
});

async function main() {
  console.log('Exporting approved library from Supabase…\n');

  const [courses, outcomes, topics, subTopics, dotPoints, prompts, sampleAnswers] =
    await Promise.all([
      fetchAll('courses', 'id, legacy_id, name, subject', true),
      fetchAllWithYear('course_outcomes', 'course_id, code, description, position', false),
      fetchAllWithYear(
        'topics',
        'id, course_id, legacy_id, name, position, band_descriptors',
        false
      ),
      fetchAll('sub_topics', 'id, topic_id, legacy_id, name, position', false),
      fetchAll('dot_points', 'id, sub_topic_id, legacy_id, description, position', false),
      fetchAll('prompts', '*', true),
      fetchAll('sample_answers', '*', true),
    ]);

  const answersByPrompt = groupBy(sampleAnswers, 'prompt_id');
  const promptsByDot = groupBy(prompts, 'dot_point_id');
  const dotsBySub = groupBy(dotPoints, 'sub_topic_id');
  const subsByTopic = groupBy(subTopics, 'topic_id');
  const topicsByCourse = groupBy(topics, 'course_id');
  const outcomesByCourse = groupBy(outcomes, 'course_id');

  await mkdir(outDir, { recursive: true });

  const manifestEntries = [];
  let totalPrompts = 0;
  let totalAnswers = 0;

  for (const course of courses) {
    const courseObj = {
      id: appId(course),
      name: course.name,
      ...(course.subject ? { subject: course.subject } : {}),
      outcomes: (outcomesByCourse.get(course.id) ?? [])
        .slice()
        .sort(byPosition)
        .map((o) => ({ code: o.code, description: o.description, ...yearField(o) })),
      topics: (topicsByCourse.get(course.id) ?? [])
        .slice()
        .sort(byPosition)
        .map((topic) => ({
          id: appId(topic),
          name: topic.name,
          ...yearField(topic),
          performanceBandDescriptors: arr(topic.band_descriptors),
          subTopics: (subsByTopic.get(topic.id) ?? [])
            .slice()
            .sort(byPosition)
            .map((sub) => ({
              id: appId(sub),
              name: sub.name,
              dotPoints: (dotsBySub.get(sub.id) ?? [])
                .slice()
                .sort(byPosition)
                .map((dp) => {
                  const dpPrompts = (promptsByDot.get(dp.id) ?? [])
                    .slice()
                    .sort((a, b) => appId(a).localeCompare(appId(b)))
                    .map((p) => {
                      totalPrompts++;
                      const answers = answersByPrompt.get(p.id) ?? [];
                      totalAnswers += answers.length;
                      return toPrompt(p, answers);
                    });
                  return { id: appId(dp), description: dp.description, prompts: dpPrompts };
                }),
            })),
        })),
    };

    const fileName = `${slugify(course.legacy_id || course.name)}.json`;
    await writeFile(join(outDir, fileName), `${JSON.stringify([courseObj], null, 2)}\n`, 'utf8');
    manifestEntries.push({ file: fileName, type: 'course', subject: course.subject || undefined });
    console.log(`  ✓ ${course.name} → exported/${fileName}`);
  }

  // A manifest fragment the user can merge into courseData/manifest.json.
  await writeFile(
    join(outDir, 'manifest.fragment.json'),
    `${JSON.stringify({ entries: manifestEntries }, null, 2)}\n`,
    'utf8'
  );

  console.log(
    `\nDone. ${courses.length} course(s), ${totalPrompts} prompts, ${totalAnswers} sample answers → ${outDir}`
  );
  console.log(
    'Review the files, then move the ones you want into courseData/ and add them to manifest.json (see manifest.fragment.json).'
  );
}

main().catch((err) => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
