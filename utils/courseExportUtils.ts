/**
 * Elegant per-course export system with granular control
 * Allows extracting individual courses without affecting the monolithic structure
 */

import { Course, Topic, SubTopic, DotPoint, Prompt } from '../types';

export interface ExportOptions {
  includeSampleAnswers?: boolean;
  includeMetadata?: boolean;
  includeMarkingCriteria?: boolean;
  stripIds?: boolean; // For sharing/backup
  anonymizeSourceData?: boolean; // Remove 'isPastHSC', 'year', etc.
  compression?: 'none' | 'gzip'; // Future: compression support
}

export interface CourseExportPackage {
  metadata: {
    exportedAt: string;
    version: string;
    courseId: string;
    courseName: string;
    topicCount: number;
    questionCount: number;
    sampleAnswerCount: number;
    estimatedSizeKb: number;
  };
  course: Course;
  manifest?: {
    structure: ExportManifest;
    checksum: string;
  };
}

export interface ExportManifest {
  course: {
    id: string;
    name: string;
    itemCount: number;
  };
  topics: Array<{
    id: string;
    name: string;
    subTopicCount: number;
    questionCount: number;
  }>;
  statistics: {
    totalQuestions: number;
    totalSampleAnswers: number;
    questionsWithoutAnswers: number;
    byCognitiveLevel: Record<string, number>;
  };
}

/**
 * Extract a single course with optional filtering
 */
export const extractCourse = (
  courses: Course[],
  courseId: string,
  options: ExportOptions = {}
): Course | null => {
  const course = courses.find(c => c.id === courseId);
  if (!course) return null;

  return processCourse(course, options);
};

/**
 * Extract multiple courses
 */
export const extractCourses = (
  courses: Course[],
  courseIds: string[],
  options: ExportOptions = {}
): Course[] => {
  return courseIds
    .map(id => extractCourse(courses, id, options))
    .filter((c): c is Course => c !== null);
};

/**
 * Extract a single topic from a course
 */
export const extractTopic = (
  courses: Course[],
  courseId: string,
  topicId: string,
  options: ExportOptions = {}
): Topic | null => {
  const course = courses.find(c => c.id === courseId);
  if (!course) return null;

  const topic = course.topics.find(t => t.id === topicId);
  if (!topic) return null;

  return processTopic(topic, options);
};

/**
 * Create a minimal export package for sharing
 */
export const createShareablePackage = (
  course: Course,
  options: ExportOptions = {}
): CourseExportPackage => {
  const processedCourse = processCourse(course, {
    ...options,
    stripIds: true,
    anonymizeSourceData: true,
    includeMetadata: true,
  });

  const questionCount = countQuestions(processedCourse);
  const sampleAnswerCount = countSampleAnswers(processedCourse);
  const estimatedSize = Math.ceil(JSON.stringify(processedCourse).length / 1024);

  const manifest: ExportManifest = {
    course: {
      id: processedCourse.id,
      name: processedCourse.name,
      itemCount: processedCourse.topics.length,
    },
    topics: processedCourse.topics.map(t => ({
      id: t.id,
      name: t.name,
      subTopicCount: t.subTopics.length,
      questionCount: countQuestionsInTopic(t),
    })),
    statistics: generateStatistics(processedCourse),
  };

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      courseId: course.id,
      courseName: course.name,
      topicCount: processedCourse.topics.length,
      questionCount,
      sampleAnswerCount,
      estimatedSizeKb: estimatedSize,
    },
    course: processedCourse,
    manifest: {
      structure: manifest,
      checksum: generateChecksum(processedCourse),
    },
  };
};

/**
 * Export course as JSON file (Blob)
 */
export const createCourseExportBlob = (
  course: Course,
  filename?: string,
  options: ExportOptions = {}
): Blob => {
  const packageData = createShareablePackage(course, options);
  const json = JSON.stringify(packageData, null, 2);
  return new Blob([json], { type: 'application/json' });
};

/**
 * Generate download link for course export
 */
export const generateExportDownload = (
  course: Course,
  filename?: string,
  options: ExportOptions = {}
): { url: string; filename: string } => {
  const blob = createCourseExportBlob(course, filename, options);
  const url = URL.createObjectURL(blob);
  const finalFilename = filename || `${course.name.replace(/\s+/g, '_')}_${Date.now()}.json`;

  return { url, filename: finalFilename };
};

/**
 * Create a summary report without exporting full data
 */
export const generateCourseReport = (course: Course): {
  summary: string;
  statistics: ExportManifest['statistics'];
  warnings: string[];
} => {
  const stats = generateStatistics(course);
  const warnings: string[] = [];

  // Check for data quality issues
  if (stats.questionsWithoutAnswers > stats.totalQuestions * 0.1) {
    warnings.push(`Warning: ${stats.questionsWithoutAnswers} questions lack sample answers`);
  }

  const topicsWithoutQuestions = course.topics.filter(
    t => countQuestionsInTopic(t) === 0
  );
  if (topicsWithoutQuestions.length > 0) {
    warnings.push(`${topicsWithoutQuestions.length} topics have no questions`);
  }

  const summary = `
Course: ${course.name}
Topics: ${course.topics.length}
Questions: ${stats.totalQuestions}
Sample Answers: ${stats.totalSampleAnswers}
Data Quality: ${((stats.totalQuestions - stats.questionsWithoutAnswers) / stats.totalQuestions * 100).toFixed(1)}% covered
  `;

  return {
    summary: summary.trim(),
    statistics: stats,
    warnings,
  };
};

/**
 * Batch export multiple courses as individual files
 */
export const batchExportCourses = async (
  courses: Course[],
  courseIds: string[],
  options: ExportOptions = {}
): Promise<Array<{ courseId: string; url: string; filename: string; sizeKb: number }>> => {
  return courseIds.map(courseId => {
    const course = courses.find(c => c.id === courseId);
    if (!course) {
      console.warn(`Course ${courseId} not found`);
      return null;
    }

    const { url, filename } = generateExportDownload(course, undefined, options);
    const sizeKb = Math.ceil(JSON.stringify(course).length / 1024);

    return { courseId, url, filename, sizeKb };
  }).filter((item): item is any => item !== null);
};

/**
 * Validate exported data integrity
 */
export const validateExportedData = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.metadata) errors.push('Missing metadata');
  if (!data.course) errors.push('Missing course data');
  if (!data.course.id || !data.course.name) errors.push('Invalid course structure');
  if (!Array.isArray(data.course.topics)) errors.push('Topics must be an array');

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Convert exported package back to standard Course format
 */
export const importExportedPackage = (pkg: CourseExportPackage): Course => {
  // Regenerate IDs if they were stripped
  if (!pkg.course.topics[0]?.id) {
    return {
      ...pkg.course,
      id: pkg.course.id || `course-${Date.now()}`,
      topics: pkg.course.topics.map(t => ({
        ...t,
        id: t.id || `topic-${Date.now()}-${Math.random()}`,
      })),
    };
  }

  return pkg.course;
};

// ===== PRIVATE HELPER FUNCTIONS =====

/**
 * Process course with options
 */
const processCourse = (course: Course, options: ExportOptions): Course => {
  return {
    ...course,
    ...(options.stripIds && { id: 'stripped' }),
    topics: course.topics.map(t => processTopic(t, options)),
  };
};

/**
 * Process topic with options
 */
const processTopic = (topic: Topic, options: ExportOptions): Topic => {
  return {
    ...topic,
    ...(options.stripIds && { id: 'stripped' }),
    subTopics: topic.subTopics.map(st => processSubTopic(st, options)),
  };
};

/**
 * Process subtopic with options
 */
const processSubTopic = (subTopic: SubTopic, options: ExportOptions): SubTopic => {
  return {
    ...subTopic,
    ...(options.stripIds && { id: 'stripped' }),
    dotPoints: subTopic.dotPoints.map(dp => processDotPoint(dp, options)),
  };
};

/**
 * Process dot point with options
 */
const processDotPoint = (dotPoint: DotPoint, options: ExportOptions): DotPoint => {
  return {
    ...dotPoint,
    ...(options.stripIds && { id: 'stripped' }),
    prompts: dotPoint.prompts.map(p => processPrompt(p, options)),
  };
};

/**
 * Process prompt with options
 */
const processPrompt = (prompt: Prompt, options: ExportOptions): Prompt => {
  const processed: any = { ...prompt };

  if (options.stripIds) {
    processed.id = 'stripped';
  }

  if (!options.includeSampleAnswers) {
    processed.sampleAnswers = [];
  } else if (options.stripIds) {
    processed.sampleAnswers = prompt.sampleAnswers?.map(sa => ({
      ...sa,
      id: 'stripped',
    })) || [];
  }

  if (!options.includeMarkingCriteria) {
    processed.markingCriteria = '[Stripped for export]';
  }

  if (options.anonymizeSourceData) {
    processed.isPastHSC = undefined;
    processed.year = undefined;
  }

  return processed;
};

/**
 * Count total questions in a course
 */
const countQuestions = (course: Course): number => {
  return course.topics.reduce((acc, t) => acc + countQuestionsInTopic(t), 0);
};

/**
 * Count questions in a topic
 */
const countQuestionsInTopic = (topic: Topic): number => {
  return topic.subTopics.reduce(
    (acc, st) =>
      acc +
      st.dotPoints.reduce((acc2, dp) => acc2 + dp.prompts.length, 0),
    0
  );
};

/**
 * Count sample answers
 */
const countSampleAnswers = (course: Course): number => {
  let total = 0;
  course.topics.forEach(t => {
    t.subTopics.forEach(st => {
      st.dotPoints.forEach(dp => {
        dp.prompts.forEach(p => {
          total += p.sampleAnswers?.length || 0;
        });
      });
    });
  });
  return total;
};

/**
 * Generate statistics about course
 */
const generateStatistics = (course: Course): ExportManifest['statistics'] => {
  const stats: ExportManifest['statistics'] = {
    totalQuestions: 0,
    totalSampleAnswers: 0,
    questionsWithoutAnswers: 0,
    byCognitiveLevel: {},
  };

  course.topics.forEach(topic => {
    topic.subTopics.forEach(subTopic => {
      subTopic.dotPoints.forEach(dotPoint => {
        dotPoint.prompts.forEach(prompt => {
          stats.totalQuestions++;

          if (!prompt.sampleAnswers || prompt.sampleAnswers.length === 0) {
            stats.questionsWithoutAnswers++;
          } else {
            stats.totalSampleAnswers += prompt.sampleAnswers.length;
          }

          const verb = prompt.verb || 'unknown';
          stats.byCognitiveLevel[verb] = (stats.byCognitiveLevel[verb] || 0) + 1;
        });
      });
    });
  });

  return stats;
};

/**
 * Generate checksum for integrity verification
 */
const generateChecksum = (course: Course): string => {
  const data = JSON.stringify(course);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};
