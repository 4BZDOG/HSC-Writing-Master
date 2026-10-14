import type { Page } from '@playwright/test';
import { getCommandTermInfo } from '../../../data/commandTerms';
import type { PromptVerb, StatePath } from '../../../types';

/**
 * One question per cognitive tier, from the bundled curriculum, as the path
 * that opens it.
 *
 * A card header is painted in the band of its question's command verb, and the
 * workspace opens on whichever question the picker reaches first. That is one
 * band, and it was not even the same one run to run. So the guard asks the
 * curriculum for a question at each tier and opens each in turn.
 *
 * The data is read the way the app reads it: the same manifest and course files
 * under `/courseData/`, and only the entries the app imports (`selected`). Ids are
 * not written here, so the curriculum can change without this file changing. A
 * tier with no question in the data comes back missing, and the caller says so.
 */

interface ManifestEntry {
  file: string;
  type: string;
  selected?: boolean;
}

interface CourseFile {
  id: string;
  topics: {
    id: string;
    year?: StatePath['syllabusYear'];
    subTopics: {
      id: string;
      dotPoints: { id: string; prompts: { id: string; verb?: PromptVerb }[] }[];
    }[];
  }[];
}

export const questionPathPerTier = async (page: Page): Promise<Map<number, StatePath>> => {
  const manifest = (await (await page.request.get('/courseData/manifest.json')).json()) as {
    entries: ManifestEntry[];
  };
  const found = new Map<number, StatePath>();

  for (const entry of manifest.entries) {
    if (entry.type !== 'course' || !entry.selected) continue;
    const raw = (await (await page.request.get(`/courseData/${entry.file}`)).json()) as
      | CourseFile
      | CourseFile[];
    const course = Array.isArray(raw) ? raw[0] : raw;

    for (const topic of course.topics) {
      for (const subTopic of topic.subTopics) {
        for (const dotPoint of subTopic.dotPoints) {
          for (const prompt of dotPoint.prompts) {
            const { tier } = getCommandTermInfo(prompt.verb);
            if (found.has(tier)) continue;
            found.set(tier, {
              courseId: course.id,
              syllabusYear: topic.year,
              topicId: topic.id,
              subTopicId: subTopic.id,
              dotPointId: dotPoint.id,
              promptId: prompt.id,
            });
          }
        }
      }
    }
  }
  return found;
};
