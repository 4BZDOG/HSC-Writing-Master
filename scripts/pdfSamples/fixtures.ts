// scripts/pdfSamples/fixtures.ts
//
// Realistic marking-feedback payloads for the PDF sample generator. Content is
// drawn from the HSC Enterprise Computing syllabus data shipped with the app so
// the samples exercise the same prose shapes a real export sees: syllabus
// keywords, **bold** marker emphasis, multi-paragraph responses, and rewrites
// that differ from the original by a lot rather than a little.
//
// Three fixtures on purpose — the exporter's layout behaviour is different at
// each length, and a review that only looks at the middle case misses both the
// under-full page and the overflowing one.

import type { EvaluationExportData } from '../../pdf/buildBlocks';

/** The common case: a 6-mark EXPLAIN at Band 4, response + rewrite + notes. */
export const typicalBand4: EvaluationExportData = {
  question:
    'Explain how a well-designed data visualisation can be more effective at highlighting significant results than a raw table of data.',
  verb: 'EXPLAIN',
  totalMarks: 6,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data visualisation  ›  Using data to tell a story  ›  Explain the purposes of data visualisation',
  studentAnswer:
    'A data visualisation is better than a table because it is easier to look at. When you have thousands of numbers in a table it is really hard to see what is going on, but a graph shows you straight away. For example if sea levels are rising you can see the line going up on a line chart which is much clearer than reading the numbers.\n\nVisualisations also use colour which helps. If you make the important part red then people will look at that first. Tables are all the same colour so nothing stands out. This means the audience can understand the data quicker and the person presenting can tell a story with the data instead of just showing numbers.',
  overallMark: 4,
  overallBand: 4,
  targetBand: 6,
  overallFeedback:
    'A **sound** response that identifies the two central ideas — visual encoding draws attention, and a chart is processed faster than a table. Where it falls short of the higher bands is precision: the answer asserts that a graph is "easier to look at" without explaining *why* pre-attentive visual processing makes that true. The sea-level example is well chosen but under-developed; it names the visual (a rising line) without connecting it to the significance of the result. Use the syllabus terminology — **highlighting results**, **simplifying understanding**, **storytelling** — as the scaffolding of each paragraph rather than as words dropped in at the end.',
  quickTip:
    'Every EXPLAIN sentence should answer "why does that matter?" — if a sentence stops at *what* the visualisation does, add a clause saying what the audience can now do that they could not before.',
  strengths: [
    'Correctly identifies **visual contrast** (colour) as a mechanism for drawing attention to significant results.',
    'The rising sea-level line is a well-chosen, syllabus-relevant example rather than a generic one.',
    'Recognises that a table forces the reader to do the work of finding the pattern themselves.',
  ],
  improvements: [
    'Name the mechanism: the human visual system processes **position, length and colour** pre-attentively, which is why a trend is grasped in a glance and a column of numbers is not.',
    'Connect the example to significance — the line does not merely rise, it rises *sharply after 1990*, and that is the result the policymaker needs.',
    'Use **storytelling** explicitly: the designer chooses what to foreground, which a raw table cannot do.',
    'Avoid conversational register ("really hard", "look at that first") — HSC marking rewards precise, impersonal prose.',
  ],
  criteria: [
    {
      criterion: 'Explains visual encoding as a means of highlighting significant results',
      mark: 2,
      maxMark: 2,
      feedback:
        'Both colour and the rising line are correctly offered as devices that direct attention. Full marks.',
    },
    {
      criterion: 'Explains why visual processing outpaces reading a table',
      mark: 1,
      maxMark: 2,
      feedback:
        'The claim is made ("shows you straight away") but not explained. The marker needs the *reason* — pre-attentive processing of visual channels — not the observation.',
    },
    {
      criterion: 'Uses syllabus terminology accurately',
      mark: 1,
      maxMark: 2,
      feedback:
        'Only **storytelling** appears, and only in the final sentence. **Simplifying understanding** and **highlighting results** are absent as terms even though the ideas are present.',
    },
  ],
  revisedAnswer:
    "A well-designed **data visualisation** is more effective than a raw table because it encodes values in visual channels — position, length and colour — that the human visual system processes pre-attentively, before conscious reading begins. A policymaker scanning a line chart of sea levels perceives the trend in a fraction of a second; the same reader working through a table of ten thousand numbers must hold each value in working memory and construct the trend themselves. This is **simplifying understanding**: the chart has already done the reader's arithmetic.\n\nVisual encoding also allows the designer to control emphasis, which is the basis of **highlighting results**. Rendering the post-1990 segment of the sea-level line in red against a muted historical series makes the acceleration — not merely the rise — the first thing the audience sees. A table is uniform by construction, so every figure competes equally for attention and the significant result is buried among the insignificant ones.\n\nTogether these properties support **storytelling**: the designer sequences what the audience notices first, second and third, guiding them to a defensible conclusion. A table presents evidence; a visualisation presents an argument built from that evidence, which is why it is the more effective vehicle for communicating significant results.",
  exemplarBand: 6,
  exemplarMark: 6,
  wordCount: 138,
  keywordsUsed: 2,
  keywordsTotal: 4,
  markerNotes: true,
  keywords: [
    'data visualisation',
    'storytelling',
    'simplifying understanding',
    'highlighting results',
  ],
};

/** The short case: a 2-mark IDENTIFY, no rewrite. Exposes under-filled pages. */
export const shortBand2: EvaluationExportData = {
  question: 'Identify two main purposes of data visualisation.',
  verb: 'IDENTIFY',
  totalMarks: 2,
  syllabusPath: 'HSC Enterprise Computing  ›  Data visualisation  ›  Using data to tell a story',
  studentAnswer: 'To make data easier to understand and to make it look good in a presentation.',
  overallMark: 1,
  overallBand: 2,
  targetBand: 3,
  overallFeedback:
    'One correct purpose. **Simplifying understanding** is right and is expressed clearly. The second half — "make it look good" — is aesthetic, not a purpose of **data visualisation** in the syllabus sense, so it earns nothing.',
  quickTip:
    'For IDENTIFY, name the thing in syllabus language. No explanation is needed, but the words must be the right ones.',
  strengths: ['Correctly identifies **simplifying understanding** as a purpose.'],
  improvements: [
    'Replace "look good" with a syllabus purpose: **storytelling**, or **highlighting significant results**.',
  ],
  criteria: [
    {
      criterion: 'Identifies one correct purpose',
      mark: 1,
      maxMark: 1,
      feedback: 'Simplifying complex data — correct.',
    },
    {
      criterion: 'Identifies a second correct purpose',
      mark: 0,
      maxMark: 1,
      feedback: 'Aesthetic appeal is not a syllabus purpose.',
    },
  ],
  wordCount: 14,
  keywordsUsed: 0,
  keywordsTotal: 3,
  keywords: ['data visualisation', 'purpose', 'storytelling'],
};

const longAnswer = `Enterprise systems have changed the way businesses handle their data but there are big legal and ethical responsibilities that come with them. In this response I will evaluate how well current practices meet these responsibilities.

Firstly, the Privacy Act 1988 requires organisations to collect only the data they need and to tell people what it will be used for. Many enterprises do have privacy policies but studies show almost nobody reads them, which means consent is not really informed consent. This is a problem because the legal requirement is met on paper but the ethical purpose behind it is not met in practice.

Secondly there is the issue of data security. Enterprises store huge amounts of personal information and breaches happen regularly. The Notifiable Data Breaches scheme means companies have to tell people when their data is exposed, which is a good thing, but it is a reactive measure. It does not stop the breach happening in the first place. Better practice would be encryption at rest and minimising how much data is kept at all.

Thirdly, intelligent systems raise questions about bias. If an enterprise uses machine learning to screen job applications and the training data reflects past discrimination then the system will repeat that discrimination at scale. There is currently not much law covering this in Australia which is a gap.

Overall I think enterprises are meeting their legal responsibilities reasonably well because the penalties are clear, but their ethical responsibilities are only partly met because ethics is not enforced the same way. Regulation needs to catch up with intelligent systems especially.`;

/** The long case: an 8-mark EVALUATE essay. Exposes the multi-page flow. */
export const longBand5: EvaluationExportData = {
  question:
    'Evaluate the extent to which enterprises meet their legal and ethical responsibilities in the management of enterprise data.',
  verb: 'EVALUATE',
  totalMarks: 8,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data management  ›  Legal, social and ethical responsibilities  ›  Assess responsibilities associated with the use and management of enterprise data',
  studentAnswer: longAnswer,
  overallMark: 5,
  overallBand: 5,
  targetBand: 6,
  overallFeedback:
    'A **well-organised** response with genuine evaluative intent. Three responsibilities are raised, each with a supporting mechanism, and the conclusion makes a judgement rather than a summary. What holds it at Band 5 is the depth of the criteria: the judgement rests on an implicit standard ("reasonably well") that is never stated, so a marker cannot see against what the extent is being measured. Name the criteria for a successful data-management regime up front, then measure practice against them.',
  quickTip:
    'EVALUATE means judgement *against stated criteria*. Write the criteria in your opening sentence and the rest of the response becomes a scaffold to fill.',
  strengths: [
    'Three distinct responsibilities — **privacy**, **security**, algorithmic **bias** — each supported by a named instrument or mechanism.',
    'Correctly distinguishes a reactive control (the Notifiable Data Breaches scheme) from a preventative one.',
    'The conclusion reaches an actual judgement and separates legal compliance from ethical practice.',
  ],
  improvements: [
    'State the evaluative criteria explicitly before the body — e.g. informed consent, proportionality of collection, and remediability of harm.',
    'Support the informed-consent claim with a specific figure or study rather than "studies show".',
    'Develop the **bias** paragraph: name a mitigation (audit, representative training data) so the judgement has a counterfactual.',
    'Replace the first-person framing ("In this response I will…") with a thesis sentence.',
  ],
  criteria: [
    {
      criterion: 'Makes a judgement supported by explicit criteria',
      mark: 1,
      maxMark: 2,
      feedback: 'A judgement is made, but the criteria behind "reasonably well" stay implicit.',
    },
    {
      criterion: 'Demonstrates knowledge of legal responsibilities',
      mark: 2,
      maxMark: 2,
      feedback:
        'The Privacy Act and the Notifiable Data Breaches scheme are correctly and specifically applied.',
    },
    {
      criterion: 'Demonstrates knowledge of ethical responsibilities',
      mark: 1,
      maxMark: 2,
      feedback: 'Bias is raised but not developed into an ethical obligation with a remedy.',
    },
    {
      criterion: 'Sustains a coherent, well-structured argument',
      mark: 1,
      maxMark: 2,
      feedback: 'Signposting is clear but mechanical; the paragraphs list rather than build.',
    },
  ],
  revisedAnswer:
    'Enterprises largely satisfy their **legal** responsibilities in data management, but meet their **ethical** responsibilities only partially. Judged against three criteria — whether consent is genuinely informed, whether collection is proportionate to purpose, and whether harm can be remedied once it occurs — compliance is strongest where the law is enforceable and weakest where it is silent.\n\nOn informed consent, the Privacy Act 1988 obliges organisations to disclose the purpose of collection. The obligation is met formally: privacy policies exist. It is not met substantively, because a policy that a reader cannot reasonably be expected to finish does not produce informed consent, only its documentation. The legal criterion is satisfied while the ethical one is not.\n\nOn proportionality, practice is weaker still. The commercial value of retained data creates a standing incentive to collect beyond purpose, and no Australian instrument caps retention volume directly. Encryption at rest and deliberate data minimisation would meet the criterion; the Notifiable Data Breaches scheme does not, because it operates only after the harm has occurred and so speaks to remediation rather than prevention.\n\nOn remediability, **intelligent systems** expose the sharpest gap. A recruitment model trained on historically discriminatory decisions reproduces that discrimination at scale and, unlike a human decision, does so invisibly and without an audit trail. Because no Australian statute presently requires algorithmic auditing, an affected applicant has no mechanism through which harm can be identified, let alone remedied.\n\nThe extent of compliance therefore tracks the extent of enforcement. Where an obligation is legislated and penalised, enterprises meet it; where the responsibility is ethical only, performance depends on incentive, and the incentives currently point the other way. Closing that gap requires regulation of **intelligent systems** comparable in force to the Privacy Act.',
  exemplarBand: 6,
  exemplarMark: 6,
  wordCount: 322,
  keywordsUsed: 3,
  keywordsTotal: 6,
  markerNotes: true,
  keywords: ['enterprise data', 'privacy', 'security', 'intelligent systems', 'legal', 'ethical'],
};

/**
 * The edited case: a rewrite that changes the response IN PLACES rather than
 * reworking it wholesale, so "What changed" fills with sentence pairs.
 *
 * The other three fixtures all happen to get rewrites that share almost no
 * wording, which means none of them ever produced more than one pair — and a
 * diff list that never has more than one row cannot show a pair being split
 * across a column boundary, which is the defect that lived there.
 */
const editedAnswer = `Enterprise systems need good security because they hold a lot of personal data. The main control is passwords, which stop people getting in.

Encryption is also used. This scrambles the data so it cannot be read. Most enterprises encrypt data when it is being sent.

Access control is another control. It means only certain staff can see certain records. This limits the damage if an account is taken over.

Backups protect against data loss. If a system fails the enterprise can restore from a backup. Backups should be tested regularly.

Overall these controls work together to protect enterprise data.`;

const editedRevision = `Enterprise systems need good security because they hold a lot of personal data. The primary access control is multi-factor authentication, which requires something the user knows and something they hold, so a stolen password alone is not enough.

Encryption is also used. This renders data unreadable without the key. Most enterprises encrypt data both in transit and at rest, because data sitting in storage is the larger target.

Access control is another control. Role-based access means a staff member sees only the records their role requires. This limits the damage if an account is taken over.

Backups protect against data loss. If a system fails the enterprise can restore from a backup. Backups must be tested by restoring them, since an untested backup is an assumption rather than a control.

Together these controls form a layered security architecture, in which no single failure exposes the data.`;

export const editedBand4: EvaluationExportData = {
  question:
    'Describe the security controls an enterprise uses to protect the data it holds, and explain why each is necessary.',
  verb: 'DESCRIBE',
  totalMarks: 6,
  syllabusPath:
    'HSC Enterprise Computing  ›  Data management  ›  Securing enterprise data  ›  Describe the controls used to protect enterprise data',
  studentAnswer: editedAnswer,
  overallMark: 4,
  overallBand: 4,
  targetBand: 6,
  overallFeedback:
    'Four controls, correctly named and correctly grouped — the structure of this response is **sound**. What holds it at Band 4 is that each control is described but not justified: the question asks why each is necessary, and "stop people getting in" is a restatement rather than a reason. Name the threat each control answers and the response moves up a band without gaining a paragraph.',
  quickTip:
    'For each control, finish the sentence "…because without it, an attacker could ___". That clause is the explanation the question is asking for.',
  strengths: [
    'Four distinct controls, correctly named and not confused with one another.',
    'Correctly identifies that access control limits **damage** after a compromise rather than preventing one.',
    'The paragraph structure gives one control per paragraph, which a marker can follow.',
  ],
  improvements: [
    'Replace passwords with **multi-factor authentication** — passwords alone are the control the syllabus treats as insufficient.',
    'Say that encryption protects data **at rest** as well as in transit; storage is the larger target.',
    'Name the access model: **role-based access control**, not "certain staff".',
    'Close with the layered principle — that no single failure should expose the data.',
  ],
  criteria: [
    {
      criterion: 'Describes a range of security controls',
      mark: 2,
      maxMark: 2,
      feedback: 'Four controls, correctly named and distinguished. Full marks.',
    },
    {
      criterion: 'Explains why each control is necessary',
      mark: 1,
      maxMark: 2,
      feedback:
        'The reasons restate the control rather than naming the threat it answers. "Stops people getting in" is what a password is, not why one is needed.',
    },
    {
      criterion: 'Uses syllabus terminology accurately',
      mark: 1,
      maxMark: 2,
      feedback:
        '**Encryption** and **backups** are correct; **multi-factor authentication**, **role-based access control** and **security architecture** are all absent.',
    },
  ],
  revisedAnswer: editedRevision,
  exemplarBand: 6,
  exemplarMark: 6,
  wordCount: 132,
  keywordsUsed: 2,
  keywordsTotal: 5,
  markerNotes: true,
  keywords: [
    'encryption',
    'access control',
    'multi-factor authentication',
    'security architecture',
    'backups',
  ],
};

export const SAMPLES: { name: string; subtitle: string; data: EvaluationExportData }[] = [
  {
    name: 'A-typical-band4',
    subtitle: 'Data visualisation — Using data to tell a story',
    data: typicalBand4,
  },
  {
    name: 'B-short-band2',
    subtitle: 'Data visualisation — Using data to tell a story',
    data: shortBand2,
  },
  {
    name: 'C-long-band5',
    subtitle: 'Data management — Legal, social and ethical responsibilities',
    data: longBand5,
  },
  {
    name: 'D-edited-band4',
    subtitle: 'Data management — Securing enterprise data',
    data: editedBand4,
  },
];
