import { z } from 'zod';

/**
 * Zod schemas that validate the *shape* of AI responses after JSON parsing.
 *
 * `safeJsonParse` only guarantees the text was valid JSON — not that it has
 * the fields the app depends on. Without this, a malformed model response
 * (missing `overallMark`, wrong types, etc.) flows through as a corrupt
 * result. These schemas catch that and turn it into a clear, surfaced error.
 *
 * The schemas are intentionally forgiving about harmless quirks (numbers
 * arriving as strings, optional prose fields) but strict about the fields the
 * downstream code actually reads.
 */

// Accepts numbers or numeric strings, but rejects missing / non-numeric values.
const finiteNumber = z.coerce.number().refine((n) => Number.isFinite(n), {
  message: 'expected a finite number',
});

export const EvaluationResponseSchema = z
  .object({
    overallMark: finiteNumber,
    overallBand: finiteNumber,
    overallFeedback: z.string().default(''),
    quickTip: z.string().optional(),
    strengths: z.array(z.string()).default([]),
    improvements: z.array(z.string()).default([]),
    criteria: z
      .array(
        z
          .object({
            criterion: z.string().default(''),
            mark: finiteNumber,
            maxMark: finiteNumber,
            feedback: z.string().default(''),
          })
          .passthrough()
      )
      .default([]),
    // Optional: the model omits this when the answer already scores full marks.
    // Accepts the plain-string form or the structured object the UI also supports.
    revisedAnswer: z
      .union([
        z.string(),
        z
          .object({
            text: z.string(),
            mark: finiteNumber.optional(),
            band: finiteNumber.optional(),
            keyChanges: z.array(z.string()).default([]),
          })
          .passthrough(),
      ])
      .optional(),
  })
  .passthrough();

export const GeneratedPromptResponseSchema = z
  .object({
    question: z.string().min(1),
    verb: z.string().min(1),
    scenario: z.string().default(''),
    // The request constrains this to a STRING; downstream (dataManager
    // PromptSchema) normalises it further.
    markingCriteria: z.string().default(''),
    keywords: z.array(z.string()).default([]),
    linkedOutcomes: z.array(z.string()).default([]),
  })
  .passthrough();

export const SampleAnswerResponseSchema = z
  .object({
    answer: z.string().min(1),
    feedback: z.string().default(''),
  })
  .passthrough();

/**
 * Validates `data` against `schema`, returning the typed/coerced result.
 * On failure it logs the full issue list and throws a clear, user-facing
 * error naming the offending field — callers let this propagate so the UI
 * shows a "try again" message instead of rendering a corrupt result.
 */
export function validateAiResponse<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path?.join('.') || '(root)';
    console.error(`[AI Validation] Invalid ${context} response:`, result.error.issues);
    throw new Error(
      `The AI returned an unexpected ${context} response (problem at "${path}": ${
        firstIssue?.message ?? 'invalid'
      }). Please try again.`
    );
  }
  return result.data;
}
