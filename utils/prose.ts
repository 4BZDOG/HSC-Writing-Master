/**
 * How a block of text is allowed to break, decided once.
 *
 * Reported from use, of the verb briefs: "improve the way the text wraps in
 * these areas on wider screens". Measured at 1920 across the surfaces that
 * carry the app's short prose, and the report was right everywhere it was
 * looked at — a verb's definition dropping its last word onto a line of its
 * own, tier subtitles running out at 30% of the line, the caption under the
 * ribbon's stat tray setting 184px and then a second line FOUR PIXELS wide,
 * and the verb guide's "what separates a strong answer" breaking `line-up` at
 * its own hyphen to leave `up.` alone.
 *
 * None of that shows at the width each surface is designed at. It is what a
 * rag does when a container is free to grow: the line breaks stay legal and
 * the last one runs out of words. The browser can do better if it is asked,
 * and the two ways of asking are not interchangeable.
 *
 * ## Which to use
 *
 * The question is what the block IS, not how long it happens to be.
 *
 * `PROSE_BLOCK` — a short declarative block read as one unit, usually sitting
 * under a heading and often the one tinted thing on its surface: a command
 * verb's definition, an outcome statement, a tier's subtitle, a quoted example
 * question. `text-balance` evens EVERY line rather than only rescuing the
 * last, which is what a two-line definition under a heading wants. It is
 * capped at a handful of lines by every engine that implements it, which is
 * the same reason it suits these and not paragraphs.
 *
 * `PROSE_FLOW` — running text the reader moves through: a section's body, a
 * marking-guide row, a strategy's method and its checks. `text-pretty` leaves
 * the line breaking alone and only declines to strand the last line.
 *
 * ## Where they do not go
 *
 * Never `PROSE_BLOCK` on a clamped line. Balance chooses the line COUNT and a
 * clamp then cuts it, so the two argue and the clamp wins — on the verb
 * ribbon's tier names that would mean an ellipsis, which is the thing those
 * names have already been rescued from three times.
 *
 * Both degrade to ordinary wrapping where they are not supported, so this is a
 * refinement and never a dependency: nothing here changes what the text says,
 * only where it is allowed to break.
 */
export const PROSE_BLOCK = 'text-balance';

/** Running text: see `PROSE_BLOCK` above for which of the two a block takes. */
export const PROSE_FLOW = 'text-pretty';
