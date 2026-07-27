import { Prompt } from '../types';

/**
 * Provenance label for a question lifted from a past NESA HSC examination.
 *
 * The three fields behind it (`isPastHSC`, `hscYear`, `hscQuestionNumber`) are
 * set by the import flows, where a whole paper is tagged with its year at once,
 * so a question can legitimately be marked as past-HSC with no year and no
 * number attached. Every combination therefore has to produce something a
 * student can read — "Past HSC" on its own is still worth saying, because it
 * tells them this is the real thing rather than a generated practice question.
 *
 * Returns `null` when the question is not from a past paper, so callers can
 * render the chip conditionally on a single value.
 */
export interface PastHscLabel {
  /** Chip copy, e.g. "HSC 2023 · Q12". */
  text: string;
  /** Long form for the chip's tooltip. */
  title: string;
}

/** NESA numbering is inconsistent — "12", "Q12", "q12(b)" all appear. */
const normaliseQuestionNumber = (raw: string): string => {
  const trimmed = raw.trim().replace(/^q(uestion)?\s*/i, '');
  return trimmed ? `Q${trimmed}` : '';
};

export const getPastHscLabel = (prompt: Prompt): PastHscLabel | null => {
  if (!prompt.isPastHSC) return null;

  const year =
    typeof prompt.hscYear === 'number' && Number.isFinite(prompt.hscYear)
      ? String(prompt.hscYear)
      : '';
  const question = prompt.hscQuestionNumber
    ? normaliseQuestionNumber(prompt.hscQuestionNumber)
    : '';

  const text = [year ? `HSC ${year}` : 'Past HSC', question].filter(Boolean).join(' · ');
  const title = year
    ? `From the ${year} HSC examination${question ? `, question ${question.slice(1)}` : ''}`
    : `From a past HSC examination${question ? `, question ${question.slice(1)}` : ''}`;

  return { text, title };
};
