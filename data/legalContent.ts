/**
 * User agreements — the charter, the Terms of Use and the Privacy Notice.
 *
 * This file is CONTENT, not logic. Everything the user reads lives here as
 * plain data so the agreements can be rewritten, extended or re-versioned
 * without touching a single component:
 *
 *   - Add a clause      → push a string into the relevant section's `body`.
 *   - Add a section     → push a `LegalSection` into the document's `sections`.
 *   - Add a document    → add it to `LEGAL_DOCUMENTS`; the reader picks it up.
 *   - Change the deal   → bump `AGREEMENT_VERSION` and add an
 *                         `AGREEMENT_CHANGELOG` entry. Every user is then
 *                         re-prompted and shown what changed.
 *
 * Whose agreement is it? The publisher's identity is deployment-specific, so
 * it comes from env (see `.env.example`) rather than being baked in. The
 * `{{entity}}`, `{{contact}}` and `{{jurisdiction}}` tokens below are
 * substituted at render time by `renderLegalText()`.
 *
 * ACCURACY RULE: every claim here must match what the product actually does.
 * The free-tier numbers are NOT duplicated as prose — they are interpolated
 * from `services/entitlements.ts`, which is the single source of truth for
 * gating, so the agreement can never drift from the code.
 */

import {
  FREE_TIER_EVAL_LIMIT,
  FREE_TIER_MAX_QUESTION_TIER,
  FREE_TIER_MAX_SAMPLE_BAND,
} from '../services/entitlements';

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Bump this whenever the substance of the agreement changes, and add a
 * matching `AGREEMENT_CHANGELOG` entry. Users who accepted an older version
 * are re-prompted on their next visit and shown the changelog for the new one.
 *
 * Format: `major.minor`. Cosmetic rewording does not need a bump; anything
 * that changes what a user is agreeing to does.
 */
export const AGREEMENT_VERSION = '1.0';

export interface AgreementChange {
  version: string;
  date: string;
  summary: string[];
}

/** Newest first. Shown in the "what changed" panel when re-accepting. */
export const AGREEMENT_CHANGELOG: AgreementChange[] = [
  {
    version: '1.0',
    date: '2026-07-26',
    summary: [
      'First published agreement covering AI marking, academic integrity and privacy.',
      'Sets out what teachers can see of student work, and what we do with responses.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Publisher identity — deployment-specific, so it comes from env
// ---------------------------------------------------------------------------

export const LEGAL_CONFIG = {
  entity: import.meta.env.VITE_LEGAL_ENTITY_NAME ?? 'the Band 6 HSC Writing Coach team',
  contact: import.meta.env.VITE_LEGAL_CONTACT_EMAIL ?? '',
  jurisdiction: import.meta.env.VITE_LEGAL_JURISDICTION ?? 'New South Wales, Australia',
  productName: 'Band 6 — HSC Writing Coach',
} as const;

/**
 * Substitute the deployment tokens into a line of agreement copy. When no
 * contact address is configured the sentence degrades to something that still
 * reads correctly rather than printing an empty mailto.
 */
export const renderLegalText = (text: string): string =>
  text
    .replace(/\{\{entity\}\}/g, LEGAL_CONFIG.entity)
    .replace(/\{\{product\}\}/g, LEGAL_CONFIG.productName)
    .replace(/\{\{jurisdiction\}\}/g, LEGAL_CONFIG.jurisdiction)
    .replace(
      /\{\{contact\}\}/g,
      LEGAL_CONFIG.contact || 'your school administrator or the person who gave you this app'
    );

/**
 * The one-line provenance notice, shown wherever a mark is presented — on the
 * evaluation result and on every page of an exported PDF report.
 *
 * The agreement makes this point once, at sign-up. This is the version that
 * travels with the mark itself, which is where it actually does its work: a
 * band and a mark out of 20 look exactly like a real result, and an exported
 * report can end up in a folder beside genuine assessment records.
 *
 * One constant, used everywhere, so the claim can never be softened in one
 * place and not another.
 */
export const AI_MARKING_DISCLAIMER =
  'Marked by AI against the syllabus — practice feedback, not an official NESA or school result.';

// ---------------------------------------------------------------------------
// The charter — the short, human version everyone reads before they accept
// ---------------------------------------------------------------------------

/** Audience for a charter. `user` and `guest` both read the student charter. */
export type CharterAudience = 'student' | 'teacher';

/** Icon keys resolved to lucide components in `components/agreementIcons.ts`. */
export type CharterIcon =
  | 'brain'
  | 'shield'
  | 'pencil'
  | 'eye'
  | 'lock'
  | 'scale'
  | 'users'
  | 'flag'
  | 'sparkles';

export interface CharterPromise {
  icon: CharterIcon;
  /** Short, declarative — this is the line that gets remembered. */
  title: string;
  body: string;
  /** Renders in the amber "read this twice" style rather than the calm one. */
  emphasis?: boolean;
}

export interface Charter {
  audience: CharterAudience;
  eyebrow: string;
  title: string;
  intro: string;
  promises: CharterPromise[];
  /** The line directly above the Accept button. */
  acceptLabel: string;
}

const STUDENT_CHARTER: Charter = {
  audience: 'student',
  eyebrow: 'Your agreement',
  title: 'How we work together',
  intro:
    'Six things worth knowing before you write your first answer. They take a minute to read and they save a lot of trouble later.',
  promises: [
    {
      icon: 'brain',
      title: 'The marker is an AI, not NESA and not your teacher',
      body: 'It marks against the syllabus like a senior HSC marker would, and it is genuinely good at it — but it can still get things wrong. Every mark it gives you is practice feedback. It is never your real grade, and it never counts towards your HSC.',
      emphasis: true,
    },
    {
      icon: 'pencil',
      title: 'Submit your own writing — not the AI’s',
      body: 'Practising here is not cheating. Copying a sample answer into work you hand in for marks is. Use the exemplars to see what a Band 6 looks like, then write your own.',
      emphasis: true,
    },
    {
      icon: 'eye',
      title: 'Your teacher can see how you are going',
      body: 'If your teacher or school set you up here, they can see the questions you have attempted, your marks and band trends, and where the class as a whole is struggling. Write as though a teacher will read it, because one can.',
    },
    {
      icon: 'lock',
      title: 'Keep personal details out of your answers',
      body: 'Your writing is sent to an AI provider to be marked. Answer the question — do not put your address, phone number, or anything about someone else in the box.',
    },
    {
      icon: 'flag',
      title: 'If a question or sample looks wrong, flag it',
      body: 'Some content is AI-generated. There is a flag button on every question and sample answer — one tap sends it to a reviewer. You are helping everyone in your cohort when you use it.',
    },
    {
      icon: 'shield',
      title: 'Be decent, and the account stays yours',
      body: 'One person per account, no sharing logins, nothing abusive or unlawful in the writing box, and no attempts to get around the usage limits. That is the whole list.',
    },
  ],
  acceptLabel: 'I have read this and I agree',
};

const TEACHER_CHARTER: Charter = {
  audience: 'teacher',
  eyebrow: 'Your agreement',
  title: 'What you are signing up to',
  intro:
    'You have curation and moderation powers here, and visibility over student work. Six things to know before you start.',
  promises: [
    {
      icon: 'brain',
      title: 'AI marking is a first opinion, never the final one',
      body: 'The evaluator applies NESA command-term logic and band descriptors, and it is consistent — but professional judgement stays with you. Do not transcribe an AI mark into a report or a formal assessment record without reading the response yourself.',
      emphasis: true,
    },
    {
      icon: 'users',
      title: 'Student visibility comes with a duty of care',
      body: 'Class Insights and Student Progress show you real students’ attempts, marks and band trends. Use them to teach, and handle what you see under your school’s and NESA’s privacy obligations — not as a general monitoring tool.',
      emphasis: true,
    },
    {
      icon: 'sparkles',
      title: 'You are responsible for the content you publish',
      body: 'AI-generated questions, rubrics and sample answers need a professional eye before students see them. Anything you submit to the shared library is reviewed, but you are the first line of quality control.',
    },
    {
      icon: 'scale',
      title: 'Copyright stays where it started',
      body: 'Do not paste in whole copyrighted texts, commercial workbooks or exam papers you are not licensed to share. Referencing NESA syllabus outcomes and past HSC questions for teaching is fine; republishing someone else’s resource as your own is not.',
    },
    {
      icon: 'eye',
      title: 'Set expectations with your class',
      body: 'Students should know their attempts are visible to you, and that practising here is not the same as submitting AI-written work for assessment. A two-minute conversation prevents an integrity problem.',
    },
    {
      icon: 'shield',
      title: 'Moderation is a real responsibility',
      body: 'Approving a contribution publishes it to every school using the shared library. Reject anything inaccurate, off-syllabus or inappropriate rather than letting it through to save time.',
    },
  ],
  acceptLabel: 'I have read this and I agree',
};

export const CHARTERS: Record<CharterAudience, Charter> = {
  student: STUDENT_CHARTER,
  teacher: TEACHER_CHARTER,
};

// ---------------------------------------------------------------------------
// The full documents — Terms of Use and Privacy Notice
// ---------------------------------------------------------------------------

export interface LegalSection {
  id: string;
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  id: 'terms' | 'privacy';
  title: string;
  subtitle: string;
  sections: LegalSection[];
}

const TERMS_OF_USE: LegalDocument = {
  id: 'terms',
  title: 'Terms of Use',
  subtitle: 'The rules for using {{product}}.',
  sections: [
    {
      id: 'who',
      heading: '1. Who this agreement is between',
      body: [
        'These terms are an agreement between you and {{entity}} ("we", "us"), the publisher of {{product}} ("the app"). By signing in or continuing as a guest you accept them.',
        'If you are under 18, you should read these terms with a parent, carer or teacher. Where a school has provided the app to you, your school’s own acceptable-use policy applies as well as these terms, and the stricter rule wins.',
        'We are not NESA, the NSW Department of Education, or your school, and we are not endorsed by them. References to the NSW HSC, NESA syllabuses, command terms and performance bands are made for the purpose of teaching and study.',
      ],
    },
    {
      id: 'what',
      heading: '2. What the app does',
      body: [
        'The app turns NESA syllabus content into exam-style practice questions with marking rubrics, and uses a large language model to mark responses the way a senior HSC marker would — awarding a mark and band, and explaining the reasoning criterion by criterion.',
        'It also provides sample answers at each band, live writing feedback while you type, a timed exam simulation mode, and — for teachers — tools to author content and to see how a class is progressing.',
      ],
    },
    {
      id: 'ai',
      heading: '3. AI marking: what it is and what it is not',
      body: [
        'Marks, bands, feedback, sample answers and generated questions are produced by an artificial intelligence system. They are practice material and formative feedback only.',
        'An AI mark is not an official assessment result. It does not come from NESA, it does not come from your school, and it has no bearing on your actual HSC result. Nobody should record it as a formal grade.',
        'AI output can be wrong. It can misread a question, miss a valid argument, invent a detail, or mark inconsistently between attempts. We work hard to reduce this — responses are marked against explicit syllabus criteria and band descriptors, and content can be flagged for human review — but we do not warrant that any mark, explanation or sample answer is accurate.',
        'Teachers: please treat the app as a source of evidence to inform your judgement, not as a substitute for it.',
      ],
    },
    {
      id: 'integrity',
      heading: '4. Academic integrity',
      body: [
        'Using the app to practise, to get feedback and to study exemplars is legitimate study. Submitting text the app produced — a sample answer, an upgraded version of your response, or generated content — as your own work for school assessment or the HSC is academic misconduct.',
        'NESA and your school have their own rules about AI use in assessment. Those rules govern. If they conflict with anything you can do in this app, follow them, not us.',
      ],
    },
    {
      id: 'account',
      heading: '5. Your account and acceptable use',
      body: [
        'You are responsible for what happens under your account. Accounts are for one person and must not be shared, sold or transferred.',
        'Guest sessions are a read-only trial. Nothing in a guest session is saved to our servers, and guest work is lost when the browser data is cleared.',
      ],
      bullets: [
        'Do not submit content that is unlawful, abusive, harassing, discriminatory, or that infringes someone else’s rights.',
        'Do not upload another person’s personal information, or material you do not have the right to share.',
        'Do not attempt to bypass usage limits, paywalls, quotas or access controls, or to extract the underlying prompts or model.',
        'Do not use automated tools to scrape, bulk-generate or resell content from the app.',
        'Do not attempt to identify individual students from aggregated class data.',
      ],
    },
    {
      id: 'plans',
      heading: '6. Free and paid plans',
      body: [
        `The free plan is genuinely usable, and deliberately limited. Free accounts get ${FREE_TIER_EVAL_LIMIT} marked evaluations per day, practice questions up to command-term tier ${FREE_TIER_MAX_QUESTION_TIER}, sample answers up to Band ${FREE_TIER_MAX_SAMPLE_BAND}, and a summary verdict rather than the full criterion-by-criterion breakdown.`,
        'Paid plans (Band 6 Plus for individuals, School for institutions) unlock the full toolkit and a larger daily AI allowance. Current inclusions and prices are shown in the app before you buy, and the amount actually charged is always the amount shown at checkout.',
        'Payments are processed by Stripe. We never see or store your card details. Subscriptions renew automatically until cancelled, and you can cancel at any time from your profile — access continues until the end of the period you have already paid for.',
        'Daily limits reset each day (UTC). Limits, inclusions and prices can change; we will not reduce what you have already paid for during a period you have paid for.',
        'School licences are bought per seat by a school or faculty. While the licence is active, members of that school hold the School plan. When it lapses, accounts return to the free plan and no content is deleted.',
      ],
    },
    {
      id: 'content',
      heading: '7. Content you create and content you contribute',
      body: [
        'Your written responses remain yours. We do not claim ownership of anything you write, and we do not sell it.',
        'You grant us the licence we need to run the service: to store your work, to send it to our AI providers to be marked, and to show it back to you (and, where your school has set this up, to your teacher).',
        'When you choose to submit a question or sample answer to the shared library, you are offering it for review and, if approved, for use by other schools using the app. Only submit material you have the right to share. You can ask for a contribution of yours to be withdrawn.',
        'Curriculum content in the app is either syllabus material used for teaching, or AI-generated, or contributed by teachers. We make no claim over NESA syllabus outcomes, which remain the property of NESA.',
      ],
    },
    {
      id: 'availability',
      heading: '8. Availability, limits and changes',
      body: [
        'The app depends on third-party AI providers. Those providers can be slow, rate-limited or unavailable, and when that happens marking may fail or be delayed. The app is designed to keep working offline for reading and writing, but marking requires a connection.',
        'We may change, suspend or discontinue features. Where a change materially reduces what a paying subscriber receives, we will tell you before it takes effect.',
      ],
    },
    {
      id: 'liability',
      heading: '9. Warranties and liability',
      body: [
        'The app is provided "as is". To the extent permitted by law we exclude implied warranties, including that the app will be uninterrupted, error-free, or that AI output will be accurate.',
        'Nothing in these terms excludes, restricts or modifies any consumer guarantee, right or remedy under the Australian Consumer Law that cannot lawfully be excluded. Where our liability can be limited, it is limited to resupplying the service or paying the cost of having it resupplied.',
        'We are not liable for academic outcomes. Study decisions you make on the basis of an AI mark are your own.',
      ],
    },
    {
      id: 'termination',
      heading: '10. Suspension and termination',
      body: [
        'You can stop using the app at any time, and you can ask us to delete your account.',
        'We may suspend or terminate an account that breaches these terms — in particular for abusive content, credential sharing, or deliberate attempts to bypass limits. Where it is reasonable to do so, we will warn you first.',
      ],
    },
    {
      id: 'law',
      heading: '11. Governing law and contact',
      body: [
        'These terms are governed by the laws of {{jurisdiction}}.',
        'For questions about these terms, or to raise a complaint, contact {{contact}}.',
      ],
    },
  ],
};

const PRIVACY_NOTICE: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Notice',
  subtitle: 'What we collect, why, and who can see it.',
  sections: [
    {
      id: 'principle',
      heading: '1. The short version',
      body: [
        'We collect what the app needs to mark your work, remember your progress, and stop one person using up everyone’s AI allowance. We do not sell personal information, and we do not use student writing for advertising.',
        'Most of your work lives in your own browser. Server storage only comes into it when your deployment uses an account backend — and even then, the amount we hold is small.',
      ],
    },
    {
      id: 'collect',
      heading: '2. What we collect',
      body: ['Depending on how you signed in, some or all of the following:'],
      bullets: [
        'Account details — your email address and display name, from the sign-in method you chose (email and password, or Google, Microsoft or GitHub sign-in), plus your role (student, teacher or administrator) and the school you belong to, if any.',
        'Your work — the responses you write, the questions you attempted, the marks and bands the AI awarded, and the feedback it gave.',
        'Progress data — questions answered, words written, average band, streak, and experience points.',
        'Preferences — theme, focus-mode default, auto-save and other settings.',
        'Usage counts — how many AI calls and marked evaluations you have made each day, so daily allowances can be enforced.',
        'Billing status — for paid plans, your plan, subscription status and renewal date. Card details are handled entirely by Stripe and never reach us.',
        'Content reports — anything you flag as inaccurate, and any content you contribute to the shared library.',
      ],
    },
    {
      id: 'ai',
      heading: '3. Your writing and the AI provider',
      body: [
        'To mark a response, the app sends the question, the marking criteria and the text you wrote to a large language model provider through our own server. The provider processes it and returns the marking.',
        'The request carries your work, not your identity: we do not send your name, email address or account identifier to the AI provider.',
        'Providers are used under their commercial API terms. Please still avoid putting personal details about yourself or anyone else into an answer — there is no reason a practice response needs them.',
      ],
    },
    {
      id: 'teachers',
      heading: '4. What teachers and schools can see',
      body: [
        'If you are part of a school or class in the app, teachers and administrators at your school can see the questions you have attempted, the marks and bands you received, your progress across command-term groups, and class-wide patterns.',
        'They cannot see your password, your billing details, or work you did under a different account.',
        'This visibility is the point of the tool — it is how a teacher spots that you are losing marks on "Evaluate" questions. It is not intended as general surveillance, and teachers agree to treat it accordingly.',
      ],
    },
    {
      id: 'storage',
      heading: '5. Where it is stored',
      body: [
        'Course content, your drafts and your recent work are stored locally in your browser (IndexedDB) so the app works offline and stays fast.',
        'Where an account backend is configured, your profile, progress, submitted responses, usage counts and billing status are stored in a hosted Postgres database with row-level security, so one account cannot read another’s data.',
        'Guest sessions are local only. Nothing from a guest session reaches our servers, and clearing your browser data erases it.',
      ],
    },
    {
      id: 'sharing',
      heading: '6. Who else sees it',
      body: ['We share data with a small number of processors, and nobody else:'],
      bullets: [
        'AI providers — to mark your work and generate content, as described above.',
        'Our hosting and database providers — to run the app and store your account.',
        'Stripe — to take payments, if you are on a paid plan.',
        'Error monitoring — technical diagnostics when something breaks, which may include the page you were on but not your written responses.',
        'Your school — where your account belongs to one, as described in section 4.',
      ],
    },
    {
      id: 'retention',
      heading: '7. How long we keep it',
      body: [
        'Account and progress data is kept while your account is active. You can delete your account yourself at any time from your profile, under "Your data" — this removes your profile, your responses, the marking on them, and your progress.',
        'Two things outlive a deletion. Content you chose to contribute to the shared library stays, because other schools are using it — but your name comes off it, so it no longer identifies you. And anonymous aggregate statistics (for example "how often Band 4 responses lose marks on Evaluate questions") are kept, and cannot be traced back to you.',
        'Local browser data is under your control — clearing site data removes it immediately.',
      ],
    },
    {
      id: 'rights',
      heading: '8. Your rights',
      body: [
        'You can access what we hold about you, correct it, export your data, or delete it. You do not need to ask us: "Your data" in your profile downloads a copy of everything we hold about your account, and deletes it on request. Students under 18 should talk to a parent, carer or teacher before deleting an account.',
        'We handle personal information in line with the Australian Privacy Principles. To make a request, or to complain about how we have handled your information, contact {{contact}}. If you are not satisfied with our response you can escalate to the Office of the Australian Information Commissioner.',
      ],
    },
    {
      id: 'security',
      heading: '9. Security',
      body: [
        'AI provider keys are held server-side and are never shipped to the browser. Access to your data is enforced at the database level rather than only in the interface. Payments are handled by Stripe, so card numbers never touch our systems.',
        'No system is perfectly secure. If a breach affects you, we will tell you and the relevant regulator as the law requires.',
      ],
    },
    {
      id: 'contact',
      heading: '10. Contact',
      body: ['Questions about this notice, or about your data, go to {{contact}}.'],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS_OF_USE, PRIVACY_NOTICE];

export type LegalDocumentId = LegalDocument['id'];

export const getLegalDocument = (id: LegalDocumentId): LegalDocument | undefined =>
  LEGAL_DOCUMENTS.find((doc) => doc.id === id);
