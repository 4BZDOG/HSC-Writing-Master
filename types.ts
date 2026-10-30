// types.ts

export type PromptVerb =
  | 'IDENTIFY'
  | 'STATE'
  | 'RECALL'
  | 'DEFINE'
  | 'EXTRACT'
  | 'RECOUNT'
  | 'OUTLINE'
  | 'DESCRIBE'
  | 'CLARIFY'
  | 'SUMMARISE'
  | 'CLASSIFY'
  | 'CALCULATE'
  | 'APPLY'
  | 'DEMONSTRATE'
  | 'CONSTRUCT'
  | 'COMPOSE'
  | 'COMPARE'
  | 'CONTRAST'
  | 'DISTINGUISH'
  | 'EXPLAIN'
  | 'INTERPRET'
  | 'DEDUCE'
  | 'EXTRAPOLATE'
  | 'PREDICT'
  | 'ANALYSE'
  | 'EXAMINE'
  | 'ACCOUNT'
  | 'DISCUSS'
  | 'PROPOSE'
  | 'INVESTIGATE'
  | 'SYNTHESISE'
  | 'ASSESS'
  | 'EVALUATE'
  | 'APPRECIATE'
  | 'JUSTIFY'
  | 'RECOMMEND'
  | 'CRITICALLY ANALYSE'
  | 'CRITICALLY EVALUATE'
  | 'DIFFERENTIATE';

/**
 * Which year of a two-year NSW course something belongs to.
 *
 * Every senior course runs across Year 11 (Preliminary) and Year 12 (HSC) with
 * entirely separate topics, sub-topics and syllabus points — they are two
 * syllabuses under one course name, not one syllabus a student progresses
 * through. Absent means Year 12: everything authored before this existed is
 * HSC content, and the app defaults there.
 */
export type SyllabusYear = 'year11' | 'year12';

export interface CourseOutcome {
  code: string;
  description: string;
  /**
   * Outcomes are stage-specific too (BI-11-01 is not BI-12-01). Optional and
   * defaulted the same way as a topic's: a course whose outcomes carry no year
   * shows all of them in both, which is what every existing course does.
   */
  year?: SyllabusYear;
}

/**
 * A user-raised "this content looks off" report on a question or sample
 * answer. Stays attached to the item (rides along on export/sync) until an
 * admin — or a future AI audit pass — resolves it.
 */
export interface ContentFlag {
  reason: string;
  flaggedAt: number;
  flaggedBy?: string;
  status: 'open' | 'resolved';
}

export interface SampleAnswer {
  id: string;
  band: number;
  answer: string;
  mark: number;
  source: 'AI' | 'USER' | 'HSC_EXEMPLAR';
  /**
   * True when an `AI` sample is a rewrite of a student's OWN response — the
   * improved answer from marking, rather than an exemplar written from scratch.
   * It reads differently and should be trusted differently (it inherits the
   * student's structure and voice), so the library labels it as its own thing.
   */
  derivedFromStudent?: boolean;
  /**
   * The prescribed text this answer writes on, for a question each student
   * answers on their own text ("Nineteen Eighty-Four"). It names the exemplar in
   * the picker, so a student finds the one on the text they studied.
   */
  prescribedText?: string;
  feedback?: string;
  quickTip?: string;
  contentFlag?: ContentFlag;
  /**
   * True when the server refused this exemplar's prose because the reader's
   * plan does not reach its band (supabase/schema.sql §25). `answer` is empty
   * on such a row — it was never sent — so the workspace shows the lock and
   * what is behind it rather than frosted glass over text anyone could read
   * out of the network tab.
   */
  withheld?: boolean;
}

export interface ScenarioImageRef {
  /** Equal to the owning Prompt's id — one image per scenario, so the prompt
   *  id doubles as the lookup key into the scenario-images IDB store and the
   *  Supabase Storage object path. */
  id: string;
  alt?: string;
  /** Epoch ms — lets a cached carousel image know it's stale. */
  updatedAt: number;
  /** Present only once synced to Supabase Storage (bucket `scenario-images`,
   *  object path `${promptId}/${id}`). Absent in pure-IDB/offline mode. */
  storagePath?: string;
  /** An image shipped with the app, as a path under `public/` relative to the
   *  app's base URL ("courseData/images/ec-2025-23.png"). Used for a shipped
   *  course's stimulus — a past paper's table, dashboard or slideshow — which
   *  has no IndexedDB row or Storage object to load from. */
  src?: string;
}

export interface Prompt {
  id: string;
  question: string;
  totalMarks: number;
  verb: PromptVerb;
  scenario?: string;
  scenarioImage?: ScenarioImageRef;
  linkedOutcomes?: string[];
  relatedTopics?: string[];
  prerequisiteKnowledge?: string[];
  markerNotes?: string[];
  commonStudentErrors?: string[];
  keywords?: string[];
  markingCriteria?: string;
  /*
   * THREE FIELDS WERE REMOVED HERE, and it is worth saying why so they are not
   * reintroduced by the next importer that meets them in an old file.
   *
   * `estimatedTime` and `targetPerformanceBands` were denormalised copies of
   * values the app already derives — `getRecommendedTime(totalMarks, verbInfo)`
   * and `bandsForQuestion(totalMarks, tier)`, both already in use. A stored
   * copy cannot track a question whose verb or marks later change, and it did
   * not: 188 stored bands named a band the question's own verb could never
   * reach, e.g. band 3 and 4 on an OUTLINE capped at 2.
   *
   * `highlightedQuestion` held a markdown-emphasised duplicate of `question`
   * from before `renderFormattedText` derived the emphasis itself. Zero of the
   * 419 shipped questions carried one.
   *
   * None of the three was ever rendered, sent to a model, or present in
   * `services/aiSchemas.ts`. Their database columns are left in place — all
   * three are nullable or defaulted, so nothing breaks by not writing them —
   * and Zod strips them from any old file on import.
   */
  sampleAnswers?: SampleAnswer[];
  isPastHSC?: boolean;
  hscYear?: number;
  hscQuestionNumber?: string;
  /**
   * The paper and section the question sits in, as the paper heads it: "Paper 2,
   * Section III — Module C: The Craft of Writing (20 marks). Allow about 40
   * minutes." Shown above the question rather than inside the scenario, which
   * holds only what the student reads to answer it.
   */
  hscSection?: string;
  /**
   * The prescribed text a past question is set on, when the paper sets one part
   * per text: "Prose Fiction — George Orwell, Nineteen Eighty-Four". Absent when
   * the question is answered on whichever text the student studied.
   */
  hscText?: string;
  /**
   * The highest band the question awards, when its course sets it rather than its
   * verb's tier. Derived from the course, never written by hand: a composition
   * (COMPOSE) in English Standard, Studies or EAL/D tops out at Band 5, and an
   * extended response (15+ marks) in English Advanced or Extension reaches Band 6
   * whatever its verb (see `courseBandCeiling`). Read through `getPromptTermInfo`.
   */
  bandCeiling?: number;
  userDraft?: string;
  /**
   * Seconds already spent writing this question's draft.
   *
   * Saved beside `userDraft` and by the same machinery, because it is the same
   * kind of thing: working state that belongs to one question. The app already
   * remembers a student's words across a reload; remembering how long they
   * have been at them is the same promise, and it matters more now that the
   * clock is the lead figure on the live stats strip — a reload used to hand
   * back the full budget as though no time had passed.
   */
  draftElapsedSeconds?: number;
  /**
   * AI quality pre-screen (0–100 + reviewer notes), set by the audit studio's
   * "Screen Quality" batch action. Advisory triage data: rides along when the
   * prompt syncs to the shared library so reviewers see it in the queue.
   */
  qualityScore?: number;
  qualityNotes?: string;
  contentFlag?: ContentFlag;
}

export interface DotPoint {
  id: string;
  description: string;
  prompts: Prompt[];
  /**
   * The focus areas (the "including …" list) a teacher has set by hand.
   *
   * Absent means "derive them from the description" — the usual case, handled
   * by `parseSubItemsFromDescription`. That parser is a heuristic over prose a
   * syllabus author never wrote for it, so it sometimes splits a clause in the
   * wrong place or misses a list entirely. Once this is set it WINS, including
   * when set to an empty array, which is how a teacher says "this dot point has
   * no focus areas" and silences a bad parse.
   */
  focusAreas?: string[];
}

export interface SubTopic {
  id: string;
  name: string;
  dotPoints: DotPoint[];
}

export interface PerformanceBandDescriptor {
  band: number;
  label: string;
  shortLabel: string;
  description: string;
}

export interface Topic {
  id: string;
  name: string;
  subTopics: SubTopic[];
  performanceBandDescriptors?: PerformanceBandDescriptor[];
  /** Year 11 or Year 12 content. Absent means Year 12 — see SyllabusYear. */
  year?: SyllabusYear;
}

export interface Course {
  id: string;
  name: string;
  subject?: string;
  /**
   * Admin publication gate. Absent (or 'published') means visible to everyone
   * — the same "absence means what it always meant" rule as every other
   * additive field (see Topic.year, DotPoint.focusAreas). 'draft' hides the
   * course from anyone who is not canCreateCurriculum (admin), so new/seeded
   * content can be built and reviewed before students or teachers see it
   * exists. Maps to the existing Supabase `courses.status` column in remote
   * mode ('approved' -> published, anything else -> draft) — see
   * services/curriculumService.ts.
   */
  status?: 'draft' | 'published';
  /**
   * Fingerprint of the content this copy was saved with, set only on a copy
   * taken from the shipped files. Absent on every other course. See
   * utils/shippedCourseStamp.ts for how it tells an unedited copy from an edited one.
   */
  shippedHash?: string;
  /**
   * Set on a backup of an earlier version of a shipped course: the id of the
   * course that replaced it. The syllabus navigator lists only the most recent
   * version of each course, so a superseded copy is hidden there for every role.
   * It stays in the library and Data Vault so its content can be recovered or
   * deleted. Backups made before this field existed are recognised by their
   * `-before-refresh` id (see utils/courseVisibility.ts).
   */
  supersededBy?: string;
  outcomes: CourseOutcome[];
  topics: Topic[];
}

export interface StatePath {
  courseId?: string;
  /**
   * Which year of the selected course is being navigated. Absent means Year 12,
   * so a path saved before this existed restores exactly where it was.
   */
  syllabusYear?: SyllabusYear;
  topicId?: string;
  subTopicId?: string;
  dotPointId?: string;
  promptId?: string;
  selectedSubItems?: string[];
}

/**
 * One level of the Course → Topic → Sub-Topic → Dot Point path, as the
 * breadcrumb renders it. Shared so the path is built once, in `App.tsx`, and
 * consumed by both the collapsed navigator bar and the workspace breadcrumb —
 * they used to construct it separately and drifted apart.
 */
export interface SyllabusCrumb {
  label: string;
  /**
   * A qualifier on the label that is not part of its name — the syllabus year
   * on the course crumb. Rendered as a chip, kept OUT of `label` so
   * `crumbs.map((c) => c.label)` still yields the plain names the PDF export
   * and the AI hierarchy context consume.
   */
  badge?: string;
  onClick?: () => void;
}

export interface EvaluationCriterion {
  criterion: string;
  mark: number;
  maxMark: number;
  feedback: string;
}

export interface EvaluationResult {
  overallMark: number;
  overallBand: number;
  overallFeedback: string;
  quickTip?: string; // New field for short, punchy feedback
  strengths: string[];
  improvements: string[];
  criteria: EvaluationCriterion[];
  revisedAnswer?:
    | string
    | {
        text: string;
        // Optional: the structured form the prompt asks for omits the mark, and the
        // marker's target is then derived from the mark ladder (see rewriteTarget).
        mark?: number;
        band?: number;
        keyChanges: string[];
      };
  userFeedback?: UserFeedback;
}

export interface UserFeedback {
  rating: 'positive' | 'negative';
  reason: string;
  timestamp: number;
}

export interface HierarchyContext {
  course: string;
  topic: string;
  subTopic: string;
  dotPoint: string;
}

/**
 * App roles. `teacher` curates content and moderates the review queue but has
 * no system-administration access (Database Manager, Data Vault, bulk AI
 * tools) — see utils/permissions.ts for the capability mapping.
 *
 * `parent` is a parent or guardian. They link to a child's account, see its
 * progress read-only and pay for its Band 6 Plus. They never curate, moderate
 * or generate content, and a plan is never held on their own account.
 */
export type UserRole = 'admin' | 'teacher' | 'user' | 'guest' | 'parent';

export interface UserStats {
  xp: number;
  level: number;
  questionsAnswered: number;
  totalWordsWritten: number;
  averageBand: number;
  /**
   * Mean share of the available marks earned, 0–1, over the answers marked
   * since it was first recorded (`markShareCount` of them).
   *
   * The fair average. A band is capped by the question's command verb, so
   * averaging bands across a mix of DESCRIBE and EVALUATE questions reports a
   * student earning every mark on offer as "Band 2.6 — room to grow". A share
   * of each question's own marks measures every answer against what it could
   * have earned. Optional: profiles from before it was kept have neither field.
   */
  markShareMean?: number;
  markShareCount?: number;
  lastActive: number;
  streakDays: number;
}

/**
 * The student's writing experience:
 * - `coach`: live feedback on — keyword/verb highlighting, live insights,
 *   syllabus-term tracking, logic connectors, band-progress, and exemplars.
 * - `exam`: HSC exam simulation — no assistance, no exemplars, marking guide
 *   hidden, a countdown timer running, and a calm exam-paper aesthetic.
 */
export type WritingMode = 'coach' | 'exam';

export interface UserPreferences {
  defaultFocusMode: boolean;
  autoSave: boolean;
  highContrast: boolean;
  showTips: boolean;
  theme: 'dark' | 'light';
}

/**
 * The user agreement the account has accepted. `version` is compared against
 * `AGREEMENT_VERSION` in data/legalContent.ts — bumping that re-prompts
 * everyone and shows them what changed.
 */
export interface UserAgreement {
  version: string;
  /** Epoch milliseconds. */
  acceptedAt: number;
  /**
   * Which charter they read. Students and staff agree to materially different
   * things — the staff charter covers student visibility and moderation — so a
   * promoted account has to read the other one, and a parent or guardian reads
   * their own charter. Absent on records written before this was tracked; those
   * are accepted as-is, except for a parent, who is asked again (see
   * `agreementPromptReason` in services/agreementService.ts).
   */
  audience?: 'student' | 'teacher' | 'parent';
}

export interface User {
  username: string;
  role: UserRole;
  displayName: string;
  preferences: UserPreferences;
  stats: UserStats;
  /** Absent until the user accepts; see services/agreementService.ts. */
  agreement?: UserAgreement;
  /** Version of the quick-start guide this user has already been shown. */
  quickStartSeenVersion?: string;
  /** Stripe-resolved plan override. Set by the webhook handler when a
   *  checkout completes or a subscription changes. Absent until Stripe is
   *  live — getUserPlan() falls back to role-based resolution. */
  stripePlan?: 'free' | 'plus' | 'school';
  /** ISO date the current billing period ends (renewal or expiry). */
  planPeriodEnd?: string;
  /**
   * Set when `planPeriodEnd` is the date the plan ENDS rather than renews.
   *
   * Only meaningful for a plan held through someone else's subscription — a
   * school seat licence — because a user with their own subscription row reads
   * `cancel_at_period_end` straight off it. Stripe keeps a cancelling
   * subscription at status 'active' to the very end of the period, so without
   * this a student at a lapsing school was told their plan "renews" on the day
   * it stops.
   */
  planCancelAtPeriodEnd?: boolean;
  /**
   * The school the user belongs to (profiles.school_id) and its name, read at
   * sign-in with the licence. Session state only: no column of its own. Absent
   * for anyone not attached to a school, which is what separates "ask your admin"
   * from "buy seats" for a teacher.
   */
  schoolId?: string;
  schoolName?: string;
}

export interface BackgroundTask {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  progress: number;
  message: string;
  error?: string;
  courseId?: string;
}

export interface LibraryItem {
  id: string;
  type: 'course' | 'topic' | 'subTopic';
  title: string;
  data: Course | Topic | SubTopic;
  timestamp: number;
}

export interface QualityCheckIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

export interface QualityCheckResult {
  status: 'PASS' | 'FAIL' | 'WARN';
  score: number;
  summary: string;
  issues: QualityCheckIssue[];
  refinedContent?: string;
}

export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalCourses: number;
    totalTopics: number;
    totalSubTopics: number;
    totalDotPoints: number;
    totalPrompts: number;
    promptsWithSampleAnswers: number;
    promptsWithKeywords: number;
    averagePromptsPerDotPoint: number;
  };
}

export interface CommandTermInfo {
  term: PromptVerb;
  definition: string;
  tip: string;
  tier: number;
  markRange: [number, number];
  charRange: [number, number];
  pageEstimate: string;
  timeRange: [number, number];
  syllabusTerms: [number, number];
  bandDiscrimination: string;
  genericMarkingGuide: string[];
  structuralKeywords: string[];
  exampleQuestion: string;
}
