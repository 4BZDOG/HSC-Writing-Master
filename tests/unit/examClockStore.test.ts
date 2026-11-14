import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getExamClock,
  publishExamClock,
  subscribeExamClock,
  type ExamClockReading,
} from '../../utils/examClockStore';

const reading = (over: Partial<ExamClockReading> = {}): ExamClockReading => ({
  text: '05:07',
  caption: 'left of 6 min',
  over: false,
  ...over,
});

afterEach(() => publishExamClock(null));

describe('examClockStore', () => {
  it('starts with no clock on screen', () => {
    expect(getExamClock()).toBeNull();
  });

  it('returns what was last published', () => {
    publishExamClock(reading());
    expect(getExamClock()).toEqual(reading());
  });

  it('tells subscribers when the reading changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExamClock(listener);

    publishExamClock(reading());
    publishExamClock(reading({ text: '05:06' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('does not notify when an equal reading is published again', () => {
    publishExamClock(reading());
    const listener = vi.fn();
    const unsubscribe = subscribeExamClock(listener);

    publishExamClock(reading());
    publishExamClock(null);
    publishExamClock(null);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops notifying once unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExamClock(listener);
    unsubscribe();

    publishExamClock(reading());

    expect(listener).not.toHaveBeenCalled();
  });

  it('clears back to null', () => {
    publishExamClock(reading({ over: true, text: '+00:42', caption: 'over 6 min' }));
    publishExamClock(null);
    expect(getExamClock()).toBeNull();
  });
});
