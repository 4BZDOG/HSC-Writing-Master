import { Course } from '../types';

// The built-in Biology and Chemistry samples are retired. The shipped
// curriculum lives in public/courseData/ and is offered through the manifest,
// so a first-time user starts with an empty library and chooses what to import.
// Kept as an empty list so the first-run and factory-reset paths keep their shape.
export const preseededCourses: Course[] = [];

export const initializeWithQualityData = (): Course[] => {
  // Check for user data first
  const userDataRaw =
    typeof window !== 'undefined' ? window.localStorage.getItem('hsc-ai-evaluator-courses') : null;

  if (userDataRaw) {
    try {
      const parsed = JSON.parse(userDataRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse user data:', e);
    }
  }

  // Return pre-seeded data for first-time users
  return preseededCourses;
};
