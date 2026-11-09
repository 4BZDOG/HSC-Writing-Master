import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PastHscExamLine from '../../components/PastHscExamLine';

describe('PastHscExamLine', () => {
  it('states the paper and section, the part, and the text a part is set on', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '2(b)',
          totalMarks: 20,
          hscSection:
            'Paper 2, Section II — Module B: Close Study of Literature (20 marks). Allow about 40 minutes.',
          hscText: 'Prose Fiction — Mark Haddon, The Curious Incident of the Dog in the Night-time',
        }}
      />
    );
    expect(
      screen.getByText('Paper 2, Section II — Module B: Close Study of Literature (20 marks).')
    ).toBeTruthy();
    expect(screen.getByText('Question 2(b) · 20 marks · allow about 40 minutes')).toBeTruthy();
    expect(screen.getByText(/Mark Haddon/)).toBeTruthy();
    expect(screen.queryByText(/text you studied/)).toBeNull();
  });

  it('gives a 3-mark Physics part its share of the section time, and drops the section allowance', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '29(b)',
          totalMarks: 3,
          hscSection:
            'Section II (80 marks). Attempt Questions 21–36. Allow about 2 hours and 25 minutes for this section.',
        }}
      />
    );
    expect(screen.getByText('Section II (80 marks). Attempt Questions 21–36.')).toBeTruthy();
    expect(screen.getByTestId('past-hsc-exam-time').textContent).toBe(
      'Question 29(b) · 3 marks · allow about 5 minutes'
    );
    expect(screen.queryByText(/2 hours/)).toBeNull();
  });

  it('uses the singular for one mark', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '21',
          totalMarks: 1,
          hscSection: 'Section II (80 marks). Allow about 2 hours and 25 minutes for this section.',
        }}
      />
    );
    expect(screen.getByTestId('past-hsc-exam-time').textContent).toBe(
      'Question 21 · 1 mark · allow about 2 minutes'
    );
  });

  it('gives the pace, not a printed allowance, when the heading has none', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '4',
          totalMarks: 10,
          hscSection: 'Section IV — Peace',
        }}
      />
    );
    expect(screen.getByTestId('past-hsc-exam-time').textContent).toBe(
      'Question 4 · 10 marks · about 20 minutes'
    );
  });

  it('tells the student to answer a combined question on their own text', () => {
    render(
      <PastHscExamLine
        prompt={{
          isPastHSC: true,
          hscQuestionNumber: '6(a)–(n)',
          totalMarks: 0,
          hscSection: 'Paper 1, Section II',
        }}
      />
    );
    expect(screen.getByText(/Answer it on the text you studied/)).toBeTruthy();
  });

  it('draws nothing for a practice question or a past question with no front matter', () => {
    const { container } = render(
      <>
        <PastHscExamLine prompt={{ hscSection: 'Paper 1, Section II', totalMarks: 0 }} />
        <PastHscExamLine prompt={{ isPastHSC: true, hscQuestionNumber: '21(a)', totalMarks: 0 }} />
      </>
    );
    expect(container.innerHTML).toBe('');
  });
});
