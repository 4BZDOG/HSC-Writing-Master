import { Page } from '@playwright/test';

/**
 * A stubbed marking response, so a spec can reach the feedback modal without a
 * live model. The shape is the one `feedback-highlights.spec.ts` uses; the
 * command verb is read back from the marking request, so the fixture follows
 * the question the workspace opened first.
 *
 * Kept here rather than in that spec so a second spec can reach the same
 * surfaces. That spec still carries its own copy, which is a follow-up.
 */
export const stubMarking = (page: Page) =>
  page.route('**/api/gemini', (route) => {
    const body = route.request().postData() ?? '';
    const found = body.match(/Command Verb:\*\*\s*([A-Z][A-Z ]*?)\s*\(/);
    const v = (found?.[1] ?? 'IDENTIFY').trim().toLowerCase();
    const V = v.charAt(0).toUpperCase() + v.slice(1);
    const payload = {
      overallMark: 1,
      overallBand: 1,
      overallFeedback:
        `Your response names one purpose of data visualisation, but the marker expects two. ` +
        `The task is to name the purpose, so ${v} each purpose by name and stop there.`,
      quickTip: `Name a second purpose of data visualisation, such as highlighting significant results.`,
      strengths: [
        `You ${v} telling a story as a purpose, which earns the credit.`,
        `Your opening names data visualisation directly.`,
      ],
      improvements: [
        `${V} a second purpose, such as simplifying understanding, and name it directly.`,
        `Evaluate your word choice in the final sentence.`,
      ],
      criteria: [
        {
          criterion: `${V} the purpose`,
          mark: 1,
          maxMark: 1,
          feedback: 'Names one purpose of data visualisation, with the term used correctly.',
        },
        {
          criterion: 'Second purpose',
          mark: 0,
          maxMark: 1,
          feedback: 'No second purpose is named; simplifying understanding would have earned it.',
        },
      ],
      revisedAnswer: {
        text:
          `${V} two purposes of data visualisation: telling a story about the results, and ` +
          `simplifying understanding for the reader.`,
        mark: 2,
        band: 2,
        keyChanges: [],
      },
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: JSON.stringify(payload),
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { totalTokenCount: 120 },
      }),
    });
  });

/** The answer the stub marks. Long enough to carry the verb and two terms. */
export const MARKED_ANSWER =
  'Data visualisation is used for telling a story about the results. It can also help with ' +
  'simplifying understanding for the reader.';
