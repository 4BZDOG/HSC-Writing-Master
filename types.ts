
// types.ts

// Declare global variable for html2pdf loaded via CDN
declare global {
  var html2pdf: any;
}

export interface HierarchyContext {
    course: string;
    topic: string;
    subTopic: string;
    dotPoint: string;
}

export interface Course {
  id: string;
  name: string;
  outcomes: CourseOutcome[];
  topics: Topic[];
}

export interface CourseOutcome {
  code: string;
  description: string;
}

export interface Topic {
  id: string;
  name: string;
  subTopics: SubTopic[];
  performanceBandDescriptors?: PerformanceBandDescriptor[];
}

export interface SubTopic {
  id: string;
  name: string;
  dotPoints: DotPoint[];
}

export interface DotPoint {
  id: string;
  description: string;
  prompts: Prompt[];
}

export type SampleAnswerSource = 'AI' | 'USER' | 'HSC_EXEMPLAR';

export interface Prompt {
  id: string;
  question: string;
  totalMarks: number;
  verb?: PromptVerb;
  highlightedQuestion?: string;
  scenario?: string;
  linkedOutcomes?: string[];
  estimatedTime?: string;
  relatedTopics?: string[];
  prerequisiteKnowledge?: string[];
  markerNotes?: string[];
  commonStudentErrors?: string[];
  keywords?: string[];
  markingCriteria?: string;
  sampleAnswers?: SampleAnswer[];
  targetPerformanceBands?: number[];
  
  // Past HSC Metadata
  isPastHSC?: boolean;
  hscYear?: number;
  hscQuestionNumber?: string;

  // Editor Draft State
  userDraft?: string;
}

export interface SampleAnswer {
  id: string; // Unique identifier for each answer
  band: number;
  answer: string;
  mark: number;
  source?: SampleAnswerSource;
  feedback?: string; // Optional specific feedback for stored user responses
}

export interface StatePath {
  courseId?: string;
  topicId?: string;
  subTopicId?: string;
  dotPointId?: string;
  promptId?: string;
}

export type PromptVerb = 
  // Level 1: Retrieving & Recalling
  | 'IDENTIFY' | 'RECALL' | 'DEFINE' | 'EXTRACT' | 'RECOUNT' | 'STATE'
  // Level 2: Comprehending & Describing
  | 'OUTLINE' | 'DESCRIBE' | 'CLARIFY' | 'SUMMARISE' | 'CLASSIFY'
  // Level 3: Applying & Demonstrating
  | 'CALCULATE' | 'APPLY' | 'DEMONSTRATE' | 'CONSTRUCT'
  // Level 4: Analysing & Connecting
  | 'COMPARE' | 'CONTRAST' | 'DISTINGUISH' | 'EXPLAIN' | 'INTERPRET' 
  | 'DEDUCE' | 'EXTRAPOLATE' | 'PREDICT' | 'ANALYSE' | 'EXAMINE' | 'ACCOUNT'
  // Level 5: Synthesising & Arguing
  | 'DISCUSS' | 'PROPOSE' | 'INVESTIGATE' | 'SYNTHESISE'
  // Level 6: Evaluating & Judging
  | 'ASSESS' | 'EVALUATE' | 'APPRECIATE' | 'JUSTIFY' | 'RECOMMEND' 
  | 'CRITICALLY ANALYSE' | 'CRITICALLY EVALUATE'
  // Legacy/Aliases
  | 'DIFFERENTIATE';

export interface CommandTermInfo {
  term: PromptVerb;
  definition: string;
  tier: number;
  markRange: [number, number];
  targetBands: string;
  bandDiscrimination: string;
  genericMarkingGuide: string[];
  tailwind: {
    color: string;
    bg: string;
  };
  writingStrategies?: string;
  structuralKeywords?: string[];
  exampleQuestion?: string; 
}

export interface PerformanceBandDescriptor {
  band: number;
  label: string;
  shortLabel: string;
  description: string;
}

export interface UserFeedback {
  rating: 'positive' | 'negative';
  reason?: string;
  timestamp: number;
}

export interface EvaluationResult {
  overallMark: number;
  overallBand: number;
  overallFeedback: string;
  criteria: EvaluationCriterion[];
  // Updated revisedAnswer to support structured data or legacy string
  revisedAnswer?: string | {
      text: string;
      mark: number;
      band: number;
      keyChanges: string[];
  };
  strengths: string[];
  improvements: string[];
  exemplar?: string;
  userFeedback?: UserFeedback;
}

export interface EvaluationCriterion {
  criterion: string;
  mark: number;
  maxMark: number;
  feedback: string;
}

export interface BackgroundTask {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  progress: number;
  message: string;
  courseId?: string;
  error?: string;
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

// --- Quality Check Types ---
export interface QualityCheckResult {
  status: 'PASS' | 'FAIL' | 'WARN';
  score: number; // 0-100
  summary: string;
  issues: {
    severity: 'critical' | 'warning' | 'info';
    message: string;
    suggestion: string;
  }[];
  refinedContent?: string; // An auto-fixed version of the content
}


// --- Library Types ---
export interface LibraryItem {
  id: string;
  type: 'course' | 'topic' | 'subTopic';
  title: string;
  data: any; // Course | Topic | SubTopic
  addedAt: number;
  description?: string;
}

// --- Auth & Profile Types ---
export type UserRole = 'admin' | 'user' | 'guest';

export interface UserPreferences {
  defaultFocusMode: boolean;
  autoSave: boolean;
  highContrast: boolean;
  showTips: boolean;
  theme: 'dark' | 'light'; // Added theme preference
}

export interface UserStats {
  xp: number;
  level: number;
  questionsAnswered: number;
  totalWordsWritten: number;
  averageBand: number;
  lastActive: number;
  streakDays: number;
}

export interface User {
  username: string;
  role: UserRole;
  displayName: string;
  preferences: UserPreferences;
  stats: UserStats;
}
