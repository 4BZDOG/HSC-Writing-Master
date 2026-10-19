import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { parseDotPointLines, normaliseDotPointLine } from '../../utils/dotPointLines';
import DotPointGeneratorModal from '../../components/DotPointGeneratorModal';
import { generateDotPointsForSubTopic } from '../../services/geminiService';

/**
 * A curator can type or paste the dot points a syllabus already gives them.
 * That path makes no AI call and is not plan-gated, so the modal opens on it.
 * The AI pass is still there behind its own tab, with its plan gate intact.
 */

const mocks = vi.hoisted(() => ({
  locked: false,
  requestUpgrade: vi.fn(),
}));

vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return {
    ...actual,
    isFeatureLocked: () => mocks.locked,
    requestUpgrade: (...args: unknown[]) => mocks.requestUpgrade(...args),
  };
});

// The real Gemini service must never be reached from a unit test.
vi.mock('../../services/geminiService', () => ({
  generateDotPointsForSubTopic: vi.fn(),
}));

const mockGenerate = vi.mocked(generateDotPointsForSubTopic);

describe('parseDotPointLines: splitting and cleaning', () => {
  it('makes one dot point per line', () => {
    const result = parseDotPointLines('Describe a cache\nExplain a bus\nIdentify a register');
    expect(result.dotPoints).toEqual(['Describe a cache', 'Explain a bus', 'Identify a register']);
    expect(result.skippedExisting).toBe(0);
    expect(result.skippedRepeated).toBe(0);
  });

  it('splits on CRLF line endings, as a paste from Windows carries them', () => {
    const result = parseDotPointLines('Describe a cache\r\nExplain a bus\r\n');
    expect(result.dotPoints).toEqual(['Describe a cache', 'Explain a bus']);
  });

  it('strips bullets from the start of a line', () => {
    const lines = [
      '• Describe a cache',
      '- Describe a cache',
      '* Describe a cache',
      '– Describe a cache',
    ];
    for (const line of lines) {
      expect(normaliseDotPointLine(line)).toBe('Describe a cache');
    }
  });

  it('strips numbering and lettering from the start of a line', () => {
    expect(normaliseDotPointLine('1. Describe a cache')).toBe('Describe a cache');
    expect(normaliseDotPointLine('12) Describe a cache')).toBe('Describe a cache');
    expect(normaliseDotPointLine('a) Describe a cache')).toBe('Describe a cache');
    expect(normaliseDotPointLine('(b) Describe a cache')).toBe('Describe a cache');
  });

  it('leaves numbers and abbreviations that begin the wording alone', () => {
    expect(normaliseDotPointLine('2.5 ways to measure speed')).toBe('2.5 ways to measure speed');
    expect(normaliseDotPointLine('e.g. a router')).toBe('e.g. a router');
  });

  it('drops a line that is only a marker', () => {
    expect(parseDotPointLines('1.\n•\n-\n\n').dotPoints).toEqual([]);
  });

  it('removes one trailing full stop, since NESA dot points carry none', () => {
    expect(normaliseDotPointLine('Describe a cache.')).toBe('Describe a cache');
    expect(normaliseDotPointLine('Describe a cache.  ')).toBe('Describe a cache');
  });

  it('drops empty and whitespace-only lines', () => {
    const result = parseDotPointLines('\n   \nDescribe a cache\n\t\n');
    expect(result.dotPoints).toEqual(['Describe a cache']);
  });

  it('trims surrounding whitespace and collapses doubled spacing from a PDF', () => {
    expect(normaliseDotPointLine('   Describe   a\tcache  ')).toBe('Describe a cache');
  });
});

describe('parseDotPointLines: duplicates', () => {
  it('drops a line that repeats an earlier line of the same paste, ignoring case', () => {
    const result = parseDotPointLines('Describe a cache\ndescribe A CACHE\nExplain a bus');
    expect(result.dotPoints).toEqual(['Describe a cache', 'Explain a bus']);
    expect(result.skippedRepeated).toBe(1);
    expect(result.skippedExisting).toBe(0);
  });

  it('drops a line that repeats a dot point already in the sub-topic', () => {
    const result = parseDotPointLines('Describe a cache\nExplain a bus', ['Explain a bus']);
    expect(result.dotPoints).toEqual(['Describe a cache']);
    expect(result.skippedExisting).toBe(1);
    expect(result.skippedRepeated).toBe(0);
  });

  it('matches an existing dot point case-insensitively', () => {
    const result = parseDotPointLines('EXPLAIN A BUS', ['explain a bus']);
    expect(result.dotPoints).toEqual([]);
    expect(result.skippedExisting).toBe(1);
  });

  it('matches an existing dot point whose stored wording ends in a full stop', () => {
    const result = parseDotPointLines('Explain a bus', ['Explain a bus.']);
    expect(result.skippedExisting).toBe(1);
  });

  it('keeps the first of two repeats, and counts a line that repeats both as already present', () => {
    const result = parseDotPointLines('Explain a bus\nExplain a bus', ['Explain a bus']);
    expect(result.dotPoints).toEqual([]);
    expect(result.skippedExisting).toBe(2);
    expect(result.skippedRepeated).toBe(0);
  });
});

describe('DotPointGeneratorModal: typing or pasting dot points', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onDotPointsGenerated: vi.fn(),
    courseName: 'Software Engineering',
    topicName: 'Data',
    subTopicName: 'Data structures',
  };

  const typeText = (value: string) =>
    fireEvent.change(screen.getByLabelText('Dot points'), { target: { value } });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locked = false;
  });

  afterEach(cleanup);

  it('opens on Type or paste, with no AI call made', () => {
    render(<DotPointGeneratorModal {...baseProps} />);

    expect(screen.getByRole('tab', { name: 'Type or paste' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Suggest with AI' }).getAttribute('aria-selected')).toBe(
      'false'
    );
    expect(
      screen.getByText('One dot point per line. Paste them straight from the syllabus.')
    ).toBeTruthy();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('shows the add button disabled until a line is typed', () => {
    render(<DotPointGeneratorModal {...baseProps} />);
    const add = screen.getByRole('button', { name: 'Add 0 dot points' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('previews the cleaned lines live, with the count', () => {
    render(<DotPointGeneratorModal {...baseProps} />);
    typeText('• Describe a cache.\n2. Explain a bus');

    expect(screen.getByText('2 dot points will be added')).toBeTruthy();
    const preview = screen.getByRole('list');
    const items = within(preview)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(['Describe a cache', 'Explain a bus']);
  });

  it('reports lines skipped because the sub-topic already holds them', () => {
    render(
      <DotPointGeneratorModal
        {...baseProps}
        existingDotPoints={['Explain a bus', 'Identify a register']}
      />
    );
    typeText('Explain a bus\nIdentify a register\nDescribe a cache');

    expect(screen.getByText('2 already in this sub-topic, skipped')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add 1 dot point' })).toBeTruthy();
  });

  it('adds the lines through the same handler as the AI mode, without an AI call', () => {
    const onDotPointsGenerated = vi.fn();
    const onClose = vi.fn();
    render(
      <DotPointGeneratorModal
        {...baseProps}
        onDotPointsGenerated={onDotPointsGenerated}
        onClose={onClose}
      />
    );
    typeText('• Describe a cache.\n2. Explain a bus');
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 dot points' }));

    expect(onDotPointsGenerated).toHaveBeenCalledTimes(1);
    expect(onDotPointsGenerated).toHaveBeenCalledWith(['Describe a cache', 'Explain a bus']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('adds typed dot points even when the plan locks the AI studio', () => {
    mocks.locked = true;
    const onDotPointsGenerated = vi.fn();
    render(<DotPointGeneratorModal {...baseProps} onDotPointsGenerated={onDotPointsGenerated} />);

    typeText('Describe a cache');
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 dot point' }));

    expect(onDotPointsGenerated).toHaveBeenCalledWith(['Describe a cache']);
    expect(mocks.requestUpgrade).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('asks before discarding typed text, and keeps it if the teacher keeps editing', async () => {
    const onClose = vi.fn();
    render(<DotPointGeneratorModal {...baseProps} onClose={onClose} />);
    typeText('Describe a cache');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/Discard the dot points you have typed/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText(/Discard the dot points you have typed/)).toBeNull();
    expect((screen.getByLabelText('Dot points') as HTMLTextAreaElement).value).toBe(
      'Describe a cache'
    );
  });

  it('closes without asking when nothing has been typed', () => {
    const onClose = vi.fn();
    render(<DotPointGeneratorModal {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('discards the typed text when the teacher confirms', () => {
    const onClose = vi.fn();
    render(<DotPointGeneratorModal {...baseProps} onClose={onClose} />);
    typeText('Describe a cache');

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DotPointGeneratorModal: Suggest with AI keeps its behaviour', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onDotPointsGenerated: vi.fn(),
    courseName: 'Software Engineering',
    topicName: 'Data',
    subTopicName: 'Data structures',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locked = false;
  });

  afterEach(cleanup);

  it('calls the AI service with the course, topic and sub-topic, and adds what it returns', async () => {
    mockGenerate.mockResolvedValueOnce(['Describe a stack', 'Explain a queue']);
    const onDotPointsGenerated = vi.fn();
    const onClose = vi.fn();
    render(
      <DotPointGeneratorModal
        {...baseProps}
        onDotPointsGenerated={onDotPointsGenerated}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Suggest with AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate dot points' }));

    await waitFor(() => expect(onDotPointsGenerated).toHaveBeenCalledTimes(1));
    expect(mockGenerate).toHaveBeenCalledWith('Software Engineering', 'Data', 'Data structures');
    expect(onDotPointsGenerated).toHaveBeenCalledWith(['Describe a stack', 'Explain a queue']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the upgrade prompt instead of calling the AI when the studio is locked', () => {
    mocks.locked = true;
    render(<DotPointGeneratorModal {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Suggest with AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate dot points' }));

    expect(mocks.requestUpgrade).toHaveBeenCalledWith('aiContentStudio');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does not ask about discarding typed text when switching to the AI tab', () => {
    render(<DotPointGeneratorModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText('Dot points'), {
      target: { value: 'Describe a cache' },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suggest with AI' }));
    expect(screen.queryByText(/Discard the dot points you have typed/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate dot points' })).toBeTruthy();
  });
});
