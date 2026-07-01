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
import { supabase } from './supabaseClient';
import { Prompt, SampleAnswer } from '../types';

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

/**
 * Resolve a table row's uuid from an app-facing id, which may be either the
 * original `legacy_id` (seeded content) or the uuid itself (DB-native rows).
 */
const resolveRowId = async (
  table: 'dot_points' | 'prompts',
  appId: string
): Promise<string | null> => {
  const { data } = await requireClient()
    .from(table)
    .select('id')
    .or(`legacy_id.eq.${appId},id.eq.${appId}`)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
};

/** Upsert a row owned by the current user, keyed on (legacy_id, created_by). */
const upsertOwned = async (
  table: 'prompts' | 'sample_answers',
  row: PromptInsertRow | SampleAnswerInsertRow
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

/** Save a prompt the user authored under the given dot point. Returns its uuid. */
export const savePromptContribution = async (
  dotPointAppId: string,
  prompt: Prompt,
  status: ContributionStatus = 'private',
  quality?: QualityScreen
): Promise<string> => {
  const userId = await currentUserId();
  const dotPointId = await resolveRowId('dot_points', dotPointAppId);
  if (!dotPointId) throw new Error('Could not find the dot point to attach this prompt to.');
  return upsertOwned('prompts', promptToRow(prompt, dotPointId, userId, status, quality));
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

/** Move one of the user's own rows into the review queue (private -> pending). */
export const submitToLibrary = async (
  table: 'prompts' | 'sample_answers',
  rowId: string
): Promise<void> => {
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

// --- Review queue (reviewer-facing) ------------------------------------------

export interface ModerationItem {
  kind: 'prompt' | 'sample_answer';
  id: string;
  title: string;
  createdAt: string | null;
  qualityScore: number | null;
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
}

const truncate = (text: string, max = 140): string =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

/**
 * Pure assembler: flatten the two pending-row sets into a single, newest-first
 * review list. IO-free so it can be unit-tested directly.
 */
export const toQueueItems = (
  prompts: PendingPromptRow[],
  answers: PendingAnswerRow[]
): ModerationItem[] => {
  const items: ModerationItem[] = [
    ...prompts.map((p) => ({
      kind: 'prompt' as const,
      id: p.id,
      title: truncate(p.question),
      createdAt: p.created_at,
      qualityScore: p.quality_score,
    })),
    ...answers.map((a) => ({
      kind: 'sample_answer' as const,
      id: a.id,
      title: truncate(a.answer),
      createdAt: a.created_at,
      qualityScore: a.quality_score,
    })),
  ];
  // Lowest quality first so reviewers see the riskiest submissions up top;
  // items with no score (older/manual) sort after scored ones.
  return items.sort((a, b) => (a.qualityScore ?? 101) - (b.qualityScore ?? 101));
};

/**
 * Fetch everything awaiting review. RLS returns `pending` rows only to the
 * author and to reviewers, so for an admin/teacher this is the full queue.
 */
export const fetchModerationQueue = async (): Promise<ModerationItem[]> => {
  const client = requireClient();
  const [prompts, answers] = await Promise.all([
    client
      .from('prompts')
      .select('id, question, created_at, quality_score')
      .eq('status', 'pending'),
    client
      .from('sample_answers')
      .select('id, answer, created_at, quality_score')
      .eq('status', 'pending'),
  ]);
  if (prompts.error) throw new Error(`Failed to load review queue: ${prompts.error.message}`);
  if (answers.error) throw new Error(`Failed to load review queue: ${answers.error.message}`);

  return toQueueItems(
    (prompts.data ?? []) as PendingPromptRow[],
    (answers.data ?? []) as PendingAnswerRow[]
  );
};
