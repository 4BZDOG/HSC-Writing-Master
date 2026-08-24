import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TopicImportModal from '../../components/TopicImportModal';
import type { Topic } from '../../types';

/**
 * Coverage for the manual "Merge into" overrides — letting a teacher redirect
 * an import into an existing topic (and, within it, an existing sub-topic)
 * when the file's own names don't happen to match the destination. Without
 * this, the only way to merge was for the JSON's topic/sub-topic names to
 * match the destination exactly (previewTopicMergePlan's id-then-name rule).
 */

const existingTopics: Topic[] = [
  {
    id: 'topic-existing',
    name: 'Module A: Language, Identity and Culture',
    subTopics: [
      {
        id: 'st-existing',
        name: 'Language and Belonging',
        dotPoints: [{ id: 'dp-existing', description: 'existing dot point', prompts: [] }],
      },
    ],
  },
];

const importedTopic = {
  id: 'topic-imported',
  name: 'Module A', // deliberately doesn't match the existing topic's full name
  subTopics: [
    {
      id: 'st-imported',
      name: 'Belonging', // deliberately doesn't match the existing sub-topic's name
      dotPoints: [
        {
          id: 'dp-imported',
          description: 'a freshly imported dot point',
          prompts: [
            {
              id: 'pr-imported',
              question: 'Analyse how belonging is represented.',
              totalMarks: 6,
              verb: 'Analyse',
              linkedOutcomes: [],
              keywords: [],
              sampleAnswers: [],
            },
          ],
        },
      ],
    },
  ],
};

const makeJsonFile = (data: unknown, name = 'imported-topic.json') =>
  new File([JSON.stringify(data)], name, { type: 'application/json' });

const dropFile = async (container: HTMLElement, data: unknown) => {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [makeJsonFile(data)] } });
  await waitFor(() => {
    expect(screen.getByLabelText(/merge into/i)).toBeTruthy();
  });
};

describe('TopicImportModal — manual merge-target overrides', () => {
  afterEach(() => cleanup());

  it('creates a new topic by default when the file name does not match an existing topic', async () => {
    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        courseName="Fixture Course"
        existingTopics={existingTopics}
      />
    );

    await dropFile(container, importedTopic);

    expect(screen.getByText(/will create a new topic "module a"/i)).toBeTruthy();
  });

  it('redirects the merge into a manually selected existing topic', async () => {
    const onImport = vi.fn();
    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={onImport}
        courseName="Fixture Course"
        existingTopics={existingTopics}
      />
    );

    await dropFile(container, importedTopic);

    fireEvent.change(screen.getByLabelText(/^merge into$/i), {
      target: { value: 'topic-existing' },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/will merge into "module a: language, identity and culture"/i)
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /merge into/i }));

    expect(onImport).toHaveBeenCalledTimes(1);
    const finalTopic = onImport.mock.calls[0][0];
    expect(finalTopic.id).toBe('topic-existing');
    expect(finalTopic.name).toBe('Module A: Language, Identity and Culture');
    // The sub-topic wasn't redirected, so it still lands as a new sub-topic
    // under the (now-matched) existing topic.
    expect(finalTopic.subTopics[0].name).toBe('Belonging');
  });

  it('redirects a sub-topic merge into a manually selected existing sub-topic', async () => {
    const onImport = vi.fn();
    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={onImport}
        courseName="Fixture Course"
        existingTopics={existingTopics}
      />
    );

    await dropFile(container, importedTopic);

    fireEvent.change(screen.getByLabelText(/^merge into$/i), {
      target: { value: 'topic-existing' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/merge sub-topic "belonging" into/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/merge sub-topic "belonging" into/i), {
      target: { value: 'st-existing' },
    });

    fireEvent.click(screen.getByRole('button', { name: /merge into/i }));

    expect(onImport).toHaveBeenCalledTimes(1);
    const finalTopic = onImport.mock.calls[0][0];
    expect(finalTopic.subTopics[0].id).toBe('st-existing');
    expect(finalTopic.subTopics[0].name).toBe('Language and Belonging');
    // The dot point it carries is still the newly imported content.
    expect(finalTopic.subTopics[0].dotPoints).toHaveLength(1);
    expect(finalTopic.subTopics[0].dotPoints[0].description).toBe('a freshly imported dot point');
  });

  it('clears the sub-topic override when the topic target changes', async () => {
    const { container } = render(
      <TopicImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        courseName="Fixture Course"
        existingTopics={[
          ...existingTopics,
          { id: 'topic-other', name: 'Module B', subTopics: [] },
        ]}
      />
    );

    await dropFile(container, importedTopic);

    fireEvent.change(screen.getByLabelText(/^merge into$/i), {
      target: { value: 'topic-existing' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/merge sub-topic "belonging" into/i)).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText(/merge sub-topic "belonging" into/i), {
      target: { value: 'st-existing' },
    });

    // Switching the topic target away should drop the now-stale sub-topic
    // override (it referenced a sub-topic under the previous target).
    fireEvent.change(screen.getByLabelText(/^merge into$/i), {
      target: { value: 'topic-other' },
    });

    // "Module B" has no sub-topics, so the per-sub-topic selector no longer
    // renders — confirming there's nothing left pointing at "st-existing".
    await waitFor(() => {
      expect(screen.queryByLabelText(/merge sub-topic "belonging" into/i)).toBeFalsy();
    });
  });
});
