/**
 * A past HSC question's scenario, in the parts the paper prints it in.
 *
 * Once the front matter moved out (see `hscSection`), what is left of a past
 * paper's scenario has a fixed shape: an extract or stimulus, perhaps a line of
 * instruction ("Refer to the piece you crafted for part (a).", "You are not
 * required to write out the opening words…"), perhaps a note on the model piece
 * the sample answers respond to, and NESA's "Your answer will be assessed on how
 * well you: …" with its criteria joined by semicolons. Drawn as one italic quote,
 * that read as a single block of context; split, each part can look like what it
 * is. Anything else (a Business Studies case, a Geography source) is `context`
 * and keeps the quote it always had. Context can be followed, after a blank
 * line, by a stimulus ("…its sales database.\n\nStimulus: | CustID | …"): that
 * is how a past paper's table is held as text beside its screenshot
 * (`Prompt.scenarioImage`), so the marker still reads what the student sees.
 */
export interface PastHscScenarioParts {
  /** The extract or stimulus. An extract's `lines` keep the paper's line breaks. */
  stimulus?: { label: 'Extract' | 'Stimulus'; lines: string[] };
  /** A case, source or anything else the student reads to answer. */
  context?: string;
  /** Lines of instruction, as printed. */
  instructions: string[];
  /** The note on the model part (a) piece the sample answers respond to. */
  sampleNote?: string;
  /** NESA's criteria, one per item, without the lead-in. */
  assessedOn: string[];
}

const ASSESSED_ON = /\s*Your answer will be assessed on how well you:\s*([\s\S]*)$/;
const INSTRUCTION = /^(?:You are not required[^.]*\.|Refer to [^.]*\.|Answer parts? [^.]*\.)\s*/;
const SAMPLE_NOTE = /^The sample answers below [\s\S]*$/;
const STIMULUS = /^(Stimulus|Extract):\s*/;
/** A stimulus after a paragraph of context: "A company… \n\nStimulus: …". */
const LATER_STIMULUS = /\n\n(Stimulus|Extract):\s*/;

export const splitPastHscScenario = (scenario: string | undefined): PastHscScenarioParts => {
  const parts: PastHscScenarioParts = { instructions: [], assessedOn: [] };
  let rest = (scenario ?? '').trim();

  const assessed = rest.match(ASSESSED_ON);
  if (assessed) {
    parts.assessedOn = assessed[1]
      .split(';')
      .map((item) => item.trim().replace(/\.$/, ''))
      .filter(Boolean);
    rest = rest.slice(0, assessed.index).trim();
  }

  for (let m = rest.match(INSTRUCTION); m; m = rest.match(INSTRUCTION)) {
    parts.instructions.push(m[0].trim());
    rest = rest.slice(m[0].length).trim();
  }

  const note = rest.match(SAMPLE_NOTE);
  if (note) {
    parts.sampleNote = note[0].trim();
    rest = '';
  }

  const later = rest.match(LATER_STIMULUS);
  if (later && later.index !== undefined) {
    parts.context = rest.slice(0, later.index).trim();
    rest = rest.slice(later.index).trim();
  }

  const stimulus = rest.match(STIMULUS);
  if (stimulus) {
    const label = stimulus[1] as 'Extract' | 'Stimulus';
    const body = rest.slice(stimulus[0].length).trim();
    // The seed writes a verse or script line break as " / ".
    parts.stimulus = { label, lines: label === 'Extract' ? body.split(' / ') : [body] };
  } else if (rest && !parts.context) {
    parts.context = rest;
  }
  return parts;
};
