import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React, { useRef, useState } from 'react';
import MathSymbolToolbar from '../../components/MathSymbolToolbar';

/**
 * A thin harness that owns the textarea + its ref, mirroring how the toolbar
 * is actually wired above each curator-facing textarea (PromptDisplay,
 * MarkingCriteriaAccordion, ManualPromptModal).
 */
const Harness: React.FC<{ initialValue?: string; onChangeSpy?: (v: string) => void }> = ({
  initialValue = '',
  onChangeSpy,
}) => {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleChange = (next: string) => {
    setValue(next);
    onChangeSpy?.(next);
  };
  return (
    <div>
      <MathSymbolToolbar textareaRef={textareaRef} value={value} onChange={handleChange} />
      <textarea ref={textareaRef} value={value} onChange={(e) => handleChange(e.target.value)} />
    </div>
  );
};

describe('MathSymbolToolbar', () => {
  it('renders the direct-insert symbol pills and wrap buttons', () => {
    render(<Harness />);
    // getByRole throws if no match is found, so a successful call is itself
    // the assertion that each button exists with the expected accessible name.
    expect(screen.getByRole('button', { name: 'Insert π' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap as superscript' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap as subscript' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap as fraction' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap as vector' })).toBeDefined();
  });

  it('splices a symbol at the cursor position and calls onChange', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="r=" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 2); // cursor at the end, after "r="

    fireEvent.click(screen.getByRole('button', { name: 'Insert π' }));

    expect(onChangeSpy).toHaveBeenCalledWith('r=π');
  });

  it('splices a symbol in the middle of existing text (replacing a selection)', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="a XX b" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 4); // select "XX"

    fireEvent.click(screen.getByRole('button', { name: 'Insert ×' }));

    expect(onChangeSpy).toHaveBeenCalledWith('a × b');
  });

  it('wraps a selection with \\frac{ }{ } via the fraction wrap button', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="PV=nR" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 2); // select "PV"

    fireEvent.click(screen.getByRole('button', { name: 'Wrap as fraction' }));

    expect(onChangeSpy).toHaveBeenCalledWith('\\frac{PV}{}=nR');
  });

  it('wraps a selection with ^{ } via the superscript wrap button', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="x2" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(1, 2); // select "2"

    fireEvent.click(screen.getByRole('button', { name: 'Wrap as superscript' }));

    expect(onChangeSpy).toHaveBeenCalledWith('x^{2}');
  });

  it('wraps a selection with \\vec{ } via the vector wrap button', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="F=ma" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 1); // select "F"

    fireEvent.click(screen.getByRole('button', { name: 'Wrap as vector' }));

    expect(onChangeSpy).toHaveBeenCalledWith('\\vec{F}=ma');
  });

  it('inserts an empty placeholder when wrapping with no selection', () => {
    const onChangeSpy = vi.fn();
    render(<Harness initialValue="" onChangeSpy={onChangeSpy} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    fireEvent.click(screen.getByRole('button', { name: 'Wrap as subscript' }));

    expect(onChangeSpy).toHaveBeenCalledWith('_{}');
  });
});
