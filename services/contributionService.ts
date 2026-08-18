/**
 * Write path: let users contribute prompts and sample answers (AI- or
 * human-authored) into the shared Supabase library, and let reviewers moderate
 * them. This is the counterpart to curriculumService (the read path).
 *
 * The contribution lifecycle mirrors the schema's `content_status`:
 *   private  → the author's draft (default for anything a user writes)
 *   pending  → submitted to the shared library, in the review queue
 *   approved → published by a reviewer; now visible to everyone (read path)
 *
 * Security: a user may only ever write their OWN content as private/pending —
 * the `enforce_content_status_authority` trigger and the insert/update RLS
 * policies (see supabase/schema.sql §9) reject anything else server-side.
 * Publishing goes exclusively through the reviewer-gated RPCs below. This
 * client code is a convenience layer, NOT the security boundary.
 */
import { supabase, fetchAllRows } from './supabaseClient';
import {
  Prompt,
  SampleAnswer,
  Topic,
  SubTopic,
  DotPoint,
  SyllabusYear,
  ScenarioImageRef,
} from '../types';
import { syncScenarioImageUp } from './scenarioImageSyncService';

export type ContributionStatus = 'private' | 'pending';

/** AI pre-screen result attached to a contribution so reviewers can triage. */
export interface QualityScreen {
  score: number;
  notes: string;
}

// --- Row shapes written to Postgres (snake_case) -----------------------------

export interface PromptInsertRow {
  dot_point_id: string;
  legacy_id: string;
  question: string;
  highlighted_question: string | null;
  total_marks: number;
  verb: string | null;
  scenario: string | null;
  marking_criteria: string | null;
  linked_outcomes: string[];
  related_topics: string[];
  prerequisite_knowledge: string[];
  marker_notes: string[];
  common_student_errors: string[];
  keywords: string[];
  target_performance_bands: number[];
  estimated_time: string | null;
  is_past_hsc: boolean;
  hsc_year: number | null;
  hsc_question_number: string | null;
  scenario_image_path: string | null;
  scenario_image_alt: string | null;
  scenario_image_updated_at: string | null;
  status: ContributionStatus;
  quality_score: number | null;
  quality_notes: string | null;
  created_by: string;
}

export interface SampleAnswerInsertRow {
  prompt_id: string;
  legacy_id: string;
  band: number;
  mark: number;
  answer: string;
  source: SampleAnswer['source'];
  feedback: string | null;
  quick_tip: string | null;
  status: ContributionStatus;
  quality_score: number | null;
  quality_notes: string | null;
  created_by: string;
}

// --- Pure mappers (app shape -> DB row); unit-tested without any IO ----------

export const promptToRow = (
  prompt: Prompt,
  dotPointId: string,
  userId: string,
  status: ContributionStatus,
  quality?: QualityScreen
): PromptInsertRow => ({
  dot_point_id: dotPointId,
  // Preserve the app's id as legacy_id so the read path maps the row back to
  // the same in-app id (matching how seed.mjs round-trips content).
  legacy_id: prompt.id,
  question: prompt.question,
  highlighted_question: prompt.highlightedQuestion ?? null,
  total_marks: prompt.totalMarks ?? 0,
  verb: prompt.verb ?? null,
  scenario: prompt.scenario ?? null,
  marking_criteria: prompt.markingCriteria ?? null,
  linked_outcomes: prompt.linkedOutcomes ?? [],
  related_topics: prompt.relatedTopics ?? [],
  prerequisite_knowledge: prompt.prerequisiteKnowledge ?? [],
  marker_notes: prompt.markerNotes ?? [],
  common_student_errors: prompt.commonStudentErrors ?? [],
  keywords: prompt.keywords ?? [],
  target_performance_bands: prompt.targetPerformanceBands ?? [],
  estimated_time: prompt.estimatedTime ?? null,
  is_past_hsc: prompt.isPastHSC ?? false,
  hsc_year: prompt.hscYear ?? null,
  hsc_question_number: prompt.hscQuestionNumber ?? null,
  scenario_image_path: prompt.scenarioImage?.storagePath ?? null,
  scenario_image_alt: prompt.scenarioImage?.alt ?? null,
  scenario_image_updated_at: prompt.scenarioImage
    ? new Date(prompt.scenarioImage.updatedAt).toISOString()
    : null,
  status,
  quality_score: quality?.score ?? null,
  quality_notes: quality?.notes ?? null,
  created_by: userId,
});

export const sampleAnswerToRow = (
  answer: SampleAnswer,
  promptId: string,
  userId: string,
  status: ContributionStatus,
  quality?: QualityScreen
): SampleAnswerInsertRow => ({
  prompt_id: promptId,
  legacy_id: answer.id,
  band: answer.band,
  mark: answer.mark ?? 0,
  answer: answer.answer,
  source: answer.source ?? 'USER',
  feedback: answer.feedback ?? null,
  quick_tip: answer.quickTip ?? null,
  status,
  quality_score: quality?.score ?? null,
  quality_notes: quality?.notes ?? null,
  created_by: userId,
});

// --- Structural row shapes + pure mappers (topics/sub-topics/dot points) ------

export interface TopicInsertRow {
  course_id: string;
  legacy_id: string;
  name: string;
  position: number;
  band_descriptors: unknown[];
  status: ContributionStatus;
  created_by: string;
  /**
   * Year 11 only, and omitted entirely otherwise. Year 12 is spelled as absence
   * everywhere in this app, and omitting the key also keeps a Year 12
   * contribution byte-identical to what it was before the column existed — so
   * a database that has not applied schema §22 yet is unaffected by anything
   * except a Year 11 contribution, which is the one thing it cannot store.
   */
  year?: SyllabusYear;
}
export interface SubTopicInsertRow {
  topic_id: string;
  legacy_id: string;
  name: string;
  position: number;
  status: ContributionStatus;
  created_by: string;
}
export interface DotPointInsertRow {
  sub_topic_id: string;
  legacy_id: string;
  description: string;
  position: number;
  status: ContributionStatus;
  created_by: string;
}

export const topicToRow = (
  topic: Topic,
  courseId: string,
  userId: string,
  status: ContributionStatus
): TopicInsertRow => ({
  course_id: courseId,
  legacy_id: topic.id,
  name: topic.name,
  position: 0,
  band_descriptors: topic.performanceBandDescriptors ?? [],
  status,
  created_by: userId,
  ...(topic.year === 'year11' ? { year: 'year11' as const } : {}),
});

export const subTopicToRow = (
  sub: SubTopic,
  topicId: string,
  userId: string,
  status: ContributionStatus
): SubTopicInsertRow => ({
  topic_id: topicId,
  legacy_id: sub.id,
  name: sub.name,
  position: 0,
  status,
  created_by: userId,
});

export const dotPointToRow = (
  dp: DotPoint,
  subTopicId: string,
  userId: string,
  status: ContributionStatus
): DotPointInsertRow => ({
  sub_topic_id: subTopicId,
  legacy_id: dp.id,
  description: dp.description,
  position: 0,
  status,
  created_by: userId,
});

// --- Orchestration (resolves ids + writes via Supabase) ----------------------

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
};

const currentUserId = async (): Promise<string> => {
  const { data, error } = await requireClient().auth.getUser();
  if (error || !data.user) throw new Error('You must be signed in to contribute content.');
  return data.user.id;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST parses `.or()` filter values positionally, so a value containing
// `,` or parentheses would corrupt the filter. Double-quote it (escaping
// embedded quotes/backslashes) per PostgREST's quoting rules.
const quoteFilterValue = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Resolve a table row's uuid from an app-facing id, which may be either the
 * original `legacy_id` (seeded content, e.g. "prompt-ec-01") or the uuid
 * itself. We only compare against the `id` (uuid) column when the value is
 * actually a uuid — otherwise Postgres rejects the whole query with
 * "invalid input syntax for type uuid", which would break every lookup keyed
 * on a legacy/app id.
 */
const resolveRowId = async (
  table: 'courses' | 'topics' | 'sub_topics' | 'dot_points' | 'prompts',
  appId: string
): Promise<string | null> => {
  const quoted = quoteFilterValue(appId);
  const filter = UUID_RE.test(appId)
    ? `legacy_id.eq.${quoted},id.eq.${appId}`
    : `legacy_id.eq.${quoted}`;
  // A `legacy_id` is NOT unique, so this filter can match several rows and a bare
  // `.maybeSingle()` would fail the whole lookup with PGRST116.
  //
  // The only uniqueness on it is `uniq_prompts_legacy_owner`, a PARTIAL index on
  // (legacy_id, created_by) `where legacy_id is not null and created_by is not
  // null`. Seeded content has `created_by = null`, so the index does not cover it
  // at all; and a teacher contributing a variant of a seeded question writes a
  // second row with the same legacy_id under their own id. Verified against
  // Postgres: three rows can share one legacy_id.
  //
  // That mattered well beyond this function. `resolvePromptRowId` feeds
  // `persistResponse`, which swallows its errors by design — so the first time a
  // teacher contributed a variant of a question, responses to that question
  // silently stopped being saved for everyone.
  //
  // Ordered on `created_by` with nulls first, which is both deterministic and
  // the RIGHT preference: seeded canonical content has `created_by = null`, so a
  // shared question always wins over somebody's private variant of it. `id`
  // breaks any remaining tie so the result cannot vary between calls.
  //
  // Not `created_at`: only `courses` and `prompts` have that column — `topics`,
  // `sub_topics` and `dot_points` do not, so ordering by it would turn a
  // duplicate-row bug into a hard failure on every curriculum lookup.
  const { data, error } = await requireClient()
    .from(table)
    .select('id')
    .or(filter)
    .order('created_by', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not look up ${table}: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
};

/**
 * Resolve a prompt's DB uuid from an app-facing id (legacy id or uuid).
 * Shared with responseService so response rows FK to the right prompt.
 */
export const resolvePromptRowId = (appId: string): Promise<string | null> =>
  resolveRowId('prompts', appId);

/** A prompt row, with everything the duplicate-legacy_id tie-break needs. */
interface PromptIdRow {
  id: string;
  legacy_id: string | null;
  created_by: string | null;
}

/**
 * App id → row uuid, remembered for the session.
 *
 * A prompt's row does not move: the resolution is a property of the library,
 * not of the caller or the moment. Only POSITIVE answers are kept — an id that
 * resolves to nothing today may be a draft that gets contributed in a minute,
 * and caching that absence would leave the app insisting the row does not
 * exist for as long as the tab stays open.
 */
const promptRowIdCache = new Map<string, string>();

/**
 * Test-only reset. Nothing in the app needs it: a row id is a property of the
 * library rather than of the session, so it stays true across a sign-out.
 */
export const __clearPromptRowIdCache = (): void => promptRowIdCache.clear();

/**
 * Resolve MANY prompt ids at once — one round trip for a whole dot point,
 * where `resolvePromptRowId` would be one per question.
 *
 * Same tie-break as the single-id version, and for the same reason: a
 * `legacy_id` is not unique (a teacher's variant of a seeded question carries
 * the same one under their own `created_by`), so seeded canonical content wins
 * — `created_by` nulls first, then lowest `id`. Sorting is done here rather
 * than in PostgREST because the two `.in()` queries below are merged in
 * memory.
 *
 * Returns app id → row uuid, omitting anything with no row (a purely local
 * draft resolves to nothing, which callers read as "no data" rather than an
 * error).
 */
export const resolvePromptRowIds = async (appIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const ids: string[] = [];
  for (const appId of new Set(appIds.filter(Boolean))) {
    const known = promptRowIdCache.get(appId);
    if (known) out.set(appId, known);
    else ids.push(appId);
  }
  if (ids.length === 0) return out;

  const client = requireClient();
  const wanted = new Set(ids);
  const rows: PromptIdRow[] = [];

  const { data: byLegacy, error: legacyError } = await client
    .from('prompts')
    .select('id, legacy_id, created_by')
    .in('legacy_id', ids);
  if (legacyError) throw new Error(`Could not look up prompts: ${legacyError.message}`);
  rows.push(...((byLegacy ?? []) as PromptIdRow[]));

  // An app id may already BE the row uuid (content created against the backend
  // rather than imported), which the legacy_id query above would never match.
  const uuids = ids.filter((id) => UUID_RE.test(id));
  if (uuids.length > 0) {
    const { data: byId, error: idError } = await client
      .from('prompts')
      .select('id, legacy_id, created_by')
      .in('id', uuids);
    if (idError) throw new Error(`Could not look up prompts: ${idError.message}`);
    rows.push(...((byId ?? []) as PromptIdRow[]));
  }

  /** Negative when `a` should win: seeded content first, then lowest id. */
  const preferred = (a: PromptIdRow, b: PromptIdRow): number => {
    const seeded = Number(a.created_by !== null) - Number(b.created_by !== null);
    return seeded !== 0 ? seeded : a.id.localeCompare(b.id);
  };

  const best = new Map<string, PromptIdRow>();
  for (const row of rows) {
    // A row found by uuid answers to that uuid; one found by legacy_id answers
    // to the legacy id the caller asked with.
    const key = row.legacy_id && wanted.has(row.legacy_id) ? row.legacy_id : row.id;
    if (!wanted.has(key)) continue;
    const held = best.get(key);
    if (!held || preferred(row, held) < 0) best.set(key, row);
  }
  best.forEach((row, key) => {
    out.set(key, row.id);
    promptRowIdCache.set(key, row.id);
  });
  return out;
};

type OwnedInsertRow =
  | PromptInsertRow
  | SampleAnswerInsertRow
  | TopicInsertRow
  | SubTopicInsertRow
  | DotPointInsertRow;

/** Upsert a row owned by the current user, keyed on (legacy_id, created_by). */
const upsertOwned = async (
  table: 'prompts' | 'sample_answers' | 'topics' | 'sub_topics' | 'dot_points',
  row: OwnedInsertRow
): Promise<string> => {
  const client = requireClient();
  const { data: existing } = await client
    .from(table)
    .select('id')
    .eq('legacy_id', row.legacy_id)
    .eq('created_by', row.created_by)
    .maybeSingle();

  if (existing) {
    // The client has no generated Database type, so the row union doesn't match
    // its inferred per-table shape — cast at the boundary.
    const { error } = await client
      .from(table)
      .update(row as never)
      .eq('id', (existing as { id: string }).id);
    if (error) throw new Error(`Failed to save contribution: ${error.message}`);
    return (existing as { id: string }).id;
  }

  const { data, error } = await client
    .from(table)
    .insert(row as never)
    .select('id')
    .single();
  if (error) throw new Error(`Failed to save contribution: ${error.message}`);
  return (data as { id: string }).id;
};

/**
 * Save a prompt the user authored under the given dot point. Returns its
 * uuid, plus the prompt's `scenarioImage` ref — resolved to include a
 * `storagePath` if the image synced to Supabase Storage during this call, so
 * the caller can persist that back onto local state (avoiding a re-upload of
 * unchanged bytes next time this prompt is saved).
 */
export const savePromptContribution = async (
  dotPointAppId: string,
  prompt: Prompt,
  status: ContributionStatus = 'private',
  quality?: QualityScreen
): Promise<{ id: string; scenarioImage?: ScenarioImageRef }> => {
  const userId = await currentUserId();
  const dotPointId = await resolveRowId('dot_points', dotPointAppId);
  if (!dotPointId) throw new Error('Could not find the dot point to attach this prompt to.');
  const scenarioImage = await syncScenarioImageUp(prompt.id, prompt.scenarioImage);
  const id = await upsertOwned(
    'prompts',
    promptToRow({ ...prompt, scenarioImage }, dotPointId, userId, status, quality)
  );
  return { id, scenarioImage };
};

/** Save a sample answer the user authored under the given prompt. Returns its uuid. */
export const saveSampleAnswerContribution = async (
  promptAppId: string,
  answer: SampleAnswer,
  status: ContributionStatus = 'private',
  quality?: QualityScreen
): Promise<string> => {
  const userId = await currentUserId();
  const promptId = await resolveRowId('prompts', promptAppId);
  if (!promptId) throw new Error('Could not find the prompt to attach this answer to.');
  return upsertOwned(
    'sample_answers',
    sampleAnswerToRow(answer, promptId, userId, status, quality)
  );
};

/** Save a topic the user authored under the given course. Returns its uuid. */
export const saveTopicContribution = async (
  courseAppId: string,
  topic: Topic,
  status: ContributionStatus = 'pending'
): Promise<string> => {
  const userId = await currentUserId();
  const courseId = await resolveRowId('courses', courseAppId);
  if (!courseId) throw new Error('That topic’s course is not in the shared library yet.');
  return upsertOwned('topics', topicToRow(topic, courseId, userId, status));
};

/** Save a sub-topic the user authored under the given topic. Returns its uuid. */
export const saveSubTopicContribution = async (
  topicAppId: string,
  sub: SubTopic,
  status: ContributionStatus = 'pending'
): Promise<string> => {
  const userId = await currentUserId();
  const topicId = await resolveRowId('topics', topicAppId);
  if (!topicId) throw new Error('That sub-topic’s topic is not in the shared library yet.');
  return upsertOwned('sub_topics', subTopicToRow(sub, topicId, userId, status));
};

/** Save a dot point the user authored under the given sub-topic. Returns its uuid. */
export const saveDotPointContribution = async (
  subTopicAppId: string,
  dp: DotPoint,
  status: ContributionStatus = 'pending'
): Promise<string> => {
  const userId = await currentUserId();
  const subTopicId = await resolveRowId('sub_topics', subTopicAppId);
  if (!subTopicId) throw new Error('That dot point’s sub-topic is not in the shared library yet.');
  return upsertOwned('dot_points', dotPointToRow(dp, subTopicId, userId, status));
};

/** The tables a user can submit their own content to the review queue from. */
export type SubmittableTable =
  | 'prompts'
  | 'sample_answers'
  | 'topics'
  | 'sub_topics'
  | 'dot_points';

/** Move one of the user's own rows into the review queue (private -> pending). */
export const submitToLibrary = async (table: SubmittableTable, rowId: string): Promise<void> => {
  const { error } = await requireClient().from(table).update({ status: 'pending' }).eq('id', rowId);
  if (error) throw new Error(`Failed to submit for review: ${error.message}`);
};

// --- Reviewer moderation (server re-checks the caller in each RPC) -----------

const callModerationRpc = async (
  fn: 'approve_prompt' | 'reject_prompt' | 'approve_sample_answer' | 'reject_sample_answer',
  rowId: string
): Promise<void> => {
  const { error } = await requireClient().rpc(fn, { p_id: rowId });
  if (error) throw new Error(`${fn} failed: ${error.message}`);
};

export const approvePrompt = (id: string) => callModerationRpc('approve_prompt', id);
export const rejectPrompt = (id: string) => callModerationRpc('reject_prompt', id);
export const approveSampleAnswer = (id: string) => callModerationRpc('approve_sample_answer', id);
export const rejectSampleAnswer = (id: string) => callModerationRpc('reject_sample_answer', id);

/** Structural moderation kinds, matching set_structure_status's allowlist. */
export type StructureKind = 'topic' | 'sub_topic' | 'dot_point';

/**
 * Reviewer moderation for structure (topics/sub-topics/dot points), routed
 * through the single reviewer-gated `set_structure_status` RPC. The server
 * re-checks the caller and validates the kind, so this is a convenience wrapper.
 */
export const moderateStructure = async (
  kind: StructureKind,
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> => {
  const { error } = await requireClient().rpc('set_structure_status', {
    p_kind: kind,
    p_id: id,
    p_status: status,
  });
  if (error)
    throw new Error(
      `Failed to ${status === 'approved' ? 'approve' : 'reject'} ${kind}: ${error.message}`
    );
};

// --- Review queue (reviewer-facing) ------------------------------------------

export interface ModerationItem {
  kind: 'prompt' | 'sample_answer' | StructureKind;
  id: string;
  title: string;
  /** Untruncated source text, so reviewers can expand before deciding. */
  fullText: string;
  /** For sample answers: the parent question, so reviewers judge in context. */
  context: string | null;
  createdAt: string | null;
  qualityScore: number | null;
}

/** A pending structural node awaiting review (topic/sub-topic/dot point). */
export interface PendingStructureRow {
  id: string;
  kind: StructureKind;
  /** Topic/sub-topic name, or dot-point description. */
  label: string;
  created_at: string | null;
}

interface PendingPromptRow {
  id: string;
  question: string;
  created_at: string | null;
  quality_score: number | null;
}
interface PendingAnswerRow {
  id: string;
  answer: string;
  created_at: string | null;
  quality_score: number | null;
  /** PostgREST embed of the parent prompt (object for a to-one relation, but
   *  tolerate the array shape some client versions produce). */
  prompts?: { question: string } | { question: string }[] | null;
}

const truncate = (text: string, max = 140): string =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

/**
 * Pure assembler: flatten the two pending-row sets into a single review list,
 * lowest quality-score first (riskiest submissions surface first; unscored
 * items sort last). IO-free so it can be unit-tested directly.
 */
export const toQueueItems = (
  prompts: PendingPromptRow[],
  answers: PendingAnswerRow[],
  structure: PendingStructureRow[] = []
): ModerationItem[] => {
  const STRUCTURE_CONTEXT: Record<StructureKind, string> = {
    topic: 'Topic',
    sub_topic: 'Sub-topic',
    dot_point: 'Dot point',
  };
  const items: ModerationItem[] = [
    ...prompts.map((p) => ({
      kind: 'prompt' as const,
      id: p.id,
      title: truncate(p.question),
      fullText: p.question,
      context: null,
      createdAt: p.created_at,
      qualityScore: p.quality_score,
    })),
    ...answers.map((a) => ({
      kind: 'sample_answer' as const,
      id: a.id,
      title: truncate(a.answer),
      fullText: a.answer,
      context: (Array.isArray(a.prompts) ? a.prompts[0]?.question : a.prompts?.question) ?? null,
      createdAt: a.created_at,
      qualityScore: a.quality_score,
    })),
    ...structure.map((s) => ({
      kind: s.kind,
      id: s.id,
      title: truncate(s.label),
      fullText: s.label,
      // Structure has no AI pre-screen; label the kind so reviewers see it.
      context: STRUCTURE_CONTEXT[s.kind],
      createdAt: s.created_at,
      qualityScore: null,
    })),
  ];
  // Lowest quality first so reviewers see the riskiest submissions up top;
  // items with no score (structure, older/manual) sort after scored ones.
  return items.sort((a, b) => (a.qualityScore ?? 101) - (b.qualityScore ?? 101));
};

/**
 * Fetch everything awaiting review. RLS returns `pending` rows only to the
 * author and to reviewers, so for an admin/teacher this is the full queue.
 */
export const fetchModerationQueue = async (): Promise<ModerationItem[]> => {
  const client = requireClient();
  const label = 'Failed to load review queue';
  const pendingStructure = async (
    table: 'topics' | 'sub_topics' | 'dot_points',
    kind: StructureKind,
    labelCol: 'name' | 'description'
  ): Promise<PendingStructureRow[]> => {
    const rows = await fetchAllRows<
      { id: string; created_at: string | null } & Record<string, unknown>
    >(
      () => client.from(table).select(`id, ${labelCol}, created_at`).eq('status', 'pending'),
      label
    );
    return rows.map((r) => ({
      id: r.id,
      kind,
      label: String(r[labelCol] ?? ''),
      created_at: r.created_at,
    }));
  };

  const [prompts, answers, topics, subTopics, dotPoints] = await Promise.all([
    fetchAllRows<PendingPromptRow>(
      () =>
        client
          .from('prompts')
          .select('id, question, created_at, quality_score')
          .eq('status', 'pending'),
      label
    ),
    fetchAllRows<PendingAnswerRow>(
      () =>
        client
          .from('sample_answers')
          // Embed the parent question so reviewers see answers in context.
          .select('id, answer, created_at, quality_score, prompts(question)')
          .eq('status', 'pending'),
      label
    ),
    pendingStructure('topics', 'topic', 'name'),
    pendingStructure('sub_topics', 'sub_topic', 'name'),
    pendingStructure('dot_points', 'dot_point', 'description'),
  ]);

  return toQueueItems(prompts, answers, [...topics, ...subTopics, ...dotPoints]);
};
