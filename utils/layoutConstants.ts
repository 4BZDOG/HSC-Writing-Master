/**
 * Shared geometry for the two workspace cards ("Writing Prompt" and "Written
 * Response").
 *
 * The relationship between them is deliberately one-way: **the question prompt
 * dictates the height, and the writing area matches it.** A student must be
 * able to read the whole question at a glance — it never scrolls, however long
 * the scenario runs. The response is the part that grows without bound, so
 * that is the card that scrolls internally.
 *
 *  - MIN_CARD_HEIGHT   floor, so a one-line question still leaves a usable
 *                      writing area underneath it. It has to clear the
 *                      writing area's own chrome — header, strategy tip and
 *                      metrics footer run to ~375px — plus the 96px reserved
 *                      under the floating Evaluate button. Below this the
 *                      writing surface is shorter than its own padding and an
 *                      EMPTY editor renders a scrollbar with nothing to
 *                      scroll to.
 *  - FALLBACK_CARD_HEIGHT  the writing area's ceiling before the prompt has
 *                      been measured, so a long saved draft cannot stretch the
 *                      page during the first paint.
 */
export const MIN_CARD_HEIGHT = 620;
export const FALLBACK_CARD_HEIGHT = 800;

/**
 * Natural (content-driven) height of the prompt card — the single value the
 * writing area is sized from.
 *
 * It must not depend on anything derived from itself. The card carries a
 * `minHeight` floor, and that floor stretches the body inside it, so measuring
 * the rendered card made the sync a one-way ratchet: it reports its inflated
 * height, that becomes the next floor, and it can never shrink again.
 * Substituting the body's CONTENT height for its RENDERED height leaves the
 * height the card would have with nothing constraining it.
 *
 * `card` is the outer element, so its borders are counted — the writing area
 * pins itself to this number exactly, and measuring inside the border left it
 * 4px short. The header and footer carry synced minimums too, but those are
 * symmetric (both cards are meant to have chrome of the same height) and that
 * inflation is real height this card occupies, so it stays in the total.
 */
export const naturalCardHeight = (
  card: HTMLElement | null,
  body: HTMLElement | null,
  bodyContent: HTMLElement | null
): number => {
  if (!card) return 0;
  if (!body || !bodyContent) return card.offsetHeight;
  return card.offsetHeight - body.offsetHeight + bodyContent.offsetHeight;
};
