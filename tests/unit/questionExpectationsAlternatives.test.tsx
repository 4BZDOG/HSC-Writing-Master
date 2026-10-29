import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionExpectations from '../../components/QuestionExpectations';
import type { PromptVerb } from '../../types';

describe('the full-mark expectation lists its alternatives', () => {
  it('sets "A OR B OR C" as three bullets with OR between, not one sentence', () => {
    render(<QuestionExpectations verb={'OUTLINE' as PromptVerb} marks={3} band={2} />);
    expect(screen.getByText('A full-mark answer has any one of:')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Three clear points.',
      'Two points + one relevant example.',
      'A simple cause-effect link.',
    ]);
    expect(screen.getAllByText('OR')).toHaveLength(2);
  });

  it('keeps a single expectation on one line', () => {
    render(<QuestionExpectations verb={'OUTLINE' as PromptVerb} marks={1} band={2} />);
    expect(screen.getByText('A full-mark answer:')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
