import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PastHscExamLine from '../../components/PastHscExamLine';

describe('PastHscExamLine', () => {
  it('states the paper and section, and the text a part is set on', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '2(b)',
          hscSection:
            'Paper 2, Section II — Module B: Close Study of Literature (20 marks). Allow about 40 minutes.',
          hscText: 'Prose Fiction — Mark Haddon, The Curious Incident of the Dog in the Night-time',
        }}
      />
    );
    expect(screen.getByText(/Paper 2, Section II — Module B/)).toBeTruthy();
    expect(screen.getByText(/Mark Haddon/)).toBeTruthy();
    expect(screen.queryByText(/text you studied/)).toBeNull();
  });

  it('tells the student to answer a combined question on their own text', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '6(a)–(n)',
          hscSection: 'Paper 1, Section II',
        }}
      />
    );
    expect(screen.getByText(/Answer it on the text you studied/)).toBeTruthy();
  });

  it('draws nothing for a practice question or a past question with no front matter', () => {
    const { container } = render(
      <>
        <PastHscExamLine prompt={{ hscSection: 'Paper 1, Section II' }} />
        <PastHscExamLine prompt={{ isPastHSC: true, hscQuestionNumber: '21(a)' }} />
      </>
    );
    expect(container.innerHTML).toBe('');
  });
});
