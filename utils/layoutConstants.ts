/**
 * Shared geometry for the two workspace cards ("Writing Prompt" and "Written
 * Response").  The cards are height-synced so they read as a matched pair, and
 * every constant below exists to keep that sync well-behaved:
 *
 *  - MIN_CARD_HEIGHT   floor, so a one-line question still gets a usable card.
 *  - MAX_CARD_HEIGHT   ceiling; past this a card scrolls internally rather
 *                      than pushing the page taller.
 *  - EDITOR_SYNC_CAP   how tall the EDITOR is allowed to push the SHARED
 *                      height.  Without it, every sentence a student types
 *                      inflates the prompt card too, leaving a short question
 *                      floating in a sea of empty space.  Past this cap the
 *                      editor scrolls internally and the prompt card stops
 *                      growing with it.
 */
export const MIN_CARD_HEIGHT = 360;
export const MAX_CARD_HEIGHT = 800;
export const EDITOR_SYNC_CAP = 620;

/**
 * Natural (content-driven) height of a card whose inner wrapper has been
 * stretched by the synced `minHeight`.
 *
 * Measuring the stretched wrapper directly is what turned the sync into a
 * one-way ratchet: the wrapper reports the inflated height, that height is fed
 * back as the new `minHeight`, and the pair can never shrink again.  Swapping
 * the scroll region's RENDERED height for its CONTENT height yields the height
 * the card would have if nothing were constraining it.
 */
export const naturalCardHeight = (
  wrapper: HTMLElement | null,
  scrollRegion: HTMLElement | null,
  scrollContent: HTMLElement | null
): number => {
  if (!wrapper) return 0;
  if (!scrollRegion || !scrollContent) return wrapper.offsetHeight;
  return wrapper.offsetHeight - scrollRegion.offsetHeight + scrollContent.offsetHeight;
};
