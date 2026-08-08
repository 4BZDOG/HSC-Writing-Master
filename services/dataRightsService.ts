import type { User } from '../types';
import { authService } from './authService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { deleteUserProfile } from '../utils/storageUtils';
import { AGREEMENT_VERSION, LEGAL_CONFIG } from '../data/legalContent';

/**
 * Data rights — access, export and erasure.
 *
 * The Privacy Notice tells users they can see what we hold, take a copy, and
 * have it deleted. This is what makes that true. A promise in an agreement
 * that the product cannot honour is worse than no promise at all, and
 * "email us and we'll do it manually" is not an answer at the scale of a
 * cohort.
 *
 * Both operations are scoped strictly to the CALLER. Export reads only rows
 * the user's own session can read (RLS does the enforcing, not this file), and
 * deletion goes through a security-definer RPC that derives the target from
 * `auth.uid()` — there is deliberately no "delete user X" parameter anywhere
 * in this path.
 */

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportedResponse {
  promptId: string | null;
  answer: string | null;
  mark: number | null;
  band: number | null;
  /** The full marking result the AI returned, as stored. */
  evaluation: unknown;
  submittedAt: string | null;
}

export interface DataExport {
  exportedAt: string;
  exportedBy: string;
  product: string;
  /** What this file does and does not contain — the file has to explain itself. */
  notes: string[];
  account: {
    username: string;
    displayName: string;
    role: string;
    plan?: string;
  };
  agreement: User['agreement'];
  preferences: User['preferences'];
  progress: User['stats'];
  /** Empty in mock/guest mode, where nothing is stored server-side. */
  responses: ExportedResponse[];
}

/**
 * Everything we hold about the signed-in user, as one JSON document.
 *
 * Curriculum content is deliberately NOT included: courses, topics and
 * questions are the app's material, not the user's personal data, and bundling
 * megabytes of syllabus into a personal export buries the part that is
 * actually about them.
 */
export const buildDataExport = async (user: User): Promise<DataExport> => {
  const responses: ExportedResponse[] = [];
  let responsesAvailable = false;

  if (isSupabaseConfigured && supabase && user.role !== 'guest') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId) {
        // Scoped explicitly as well as by RLS: a teacher's session can read the
        // responses of students in the classes they teach (schema §19,
        // `can_view_student`), and a personal-data export must never quietly
        // widen into somebody else's work.
        const { data, error } = await supabase
          .from('responses')
          .select('prompt_id, draft, overall_mark, overall_band, evaluation, updated_at')
          .eq('user_id', userId);
        if (!error && data) {
          responsesAvailable = true;
          data.forEach((row) => {
            responses.push({
              promptId: (row.prompt_id as string) ?? null,
              answer: (row.draft as string) ?? null,
              mark: (row.overall_mark as number) ?? null,
              band: (row.overall_band as number) ?? null,
              // The marking itself is data about the user too — an export that
              // returns your words but not the feedback on them is half a copy.
              evaluation: row.evaluation ?? null,
              submittedAt: (row.updated_at as string) ?? null,
            });
          });
        }
      }
    } catch {
      /* Offline or unreachable — the export still carries everything held
         locally, and says so in `notes` rather than pretending to be
         complete. */
    }
  }

  const notes = [
    'This file contains the personal data held about your account.',
    'Curriculum content (courses, topics, questions, sample answers) is not included — it is the app’s material, not your personal data.',
    responsesAvailable
      ? 'Your saved responses are included below.'
      : user.role === 'guest'
        ? 'You are using a guest session, so nothing is stored on our servers — only what is in this browser.'
        : 'Saved responses could not be read (this deployment may store everything locally, or the server was unreachable). Anything still in your browser is not lost.',
    `Agreement version currently published: ${AGREEMENT_VERSION}.`,
  ];

  return {
    exportedAt: new Date().toISOString(),
    exportedBy: user.username,
    product: LEGAL_CONFIG.productName,
    notes,
    account: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      ...(user.stripePlan ? { plan: user.stripePlan } : {}),
    },
    agreement: user.agreement,
    preferences: user.preferences,
    progress: user.stats,
    responses,
  };
};

const slugify = (value: string): string =>
  value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'account';

/** Build the export and hand it to the browser as a download. */
export const downloadMyData = async (user: User): Promise<void> => {
  const payload = await buildDataExport(user);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-data-${slugify(user.username)}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------------------------------------------------------------------------
// Erasure
// ---------------------------------------------------------------------------

export interface DeletionResult {
  ok: boolean;
  /** Shown to the user verbatim — every failure here needs a next step. */
  message: string;
}

/**
 * Delete the signed-in user's account.
 *
 * Server-side this calls `delete_my_account()` (schema §16), which derives the
 * target from `auth.uid()` and removes the auth user; the profile, responses
 * and usage rows follow by cascade. Content the user contributed to the shared
 * library survives with its author unlinked — other schools are relying on it,
 * and it carries no personal data once `created_by` is nulled. The Privacy
 * Notice says exactly this.
 *
 * Local state is cleared either way, so a deleted account cannot be restored
 * from the browser cache on the next boot.
 */
export const deleteMyAccount = async (user: User): Promise<DeletionResult> => {
  if (user.role === 'guest') {
    await deleteUserProfile(user.username);
    return {
      ok: true,
      message: 'Guest session cleared. Nothing about a guest session is stored on our servers.',
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        // The most likely cause is a database that has not run schema §16.
        // Say so plainly rather than leaving the user thinking it worked.
        return {
          ok: false,
          message:
            'We could not delete your account automatically. Please contact ' +
            (LEGAL_CONFIG.contact || 'your school administrator') +
            ' and your data will be removed manually.',
        };
      }
    } catch {
      return {
        ok: false,
        message: 'Could not reach the server. Please check your connection and try again.',
      };
    }
  }

  await deleteUserProfile(user.username);
  authService.logout();
  return { ok: true, message: 'Your account and data have been deleted.' };
};
