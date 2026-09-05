import React from 'react';

/**
 * A small label — a section caption, a stat's name, the text in a chip.
 *
 * It used to take `size` and `tracking` props chosen from maps of complete
 * class strings, which made the label's look a per-call-site decision: eight
 * tracking steps and four sizes, "easy to get subtly inconsistent" as the old
 * note here admitted. That variation is what `.t-label` exists to remove, so
 * the props went with it. See docs/design-direction.md, principle 3.
 *
 * Colour and layout utilities still pass through `className`.
 */
interface MicroLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
  children: React.ReactNode;
}

const MicroLabel: React.FC<MicroLabelProps> = ({ className = '', children, ...rest }) => (
  <span className={`t-label ${className}`.trim()} {...rest}>
    {children}
  </span>
);

export default MicroLabel;
