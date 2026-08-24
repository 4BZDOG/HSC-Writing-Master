import React from 'react';

/**
 * The tiny uppercase, tracking-heavy "eyebrow" label the UI uses everywhere
 * (section headers, stat captions, chip text). It was written inline as
 * `text-[Npx] font-black uppercase tracking-[X]` at ~40 call sites with only
 * the size, tracking and colour varying — easy to get subtly inconsistent.
 *
 * Size and tracking are chosen from fixed maps of COMPLETE class strings, never
 * interpolated — Tailwind only sees whole literals, so its content scanner and
 * the `text-[Npx]` readability-floor override in index.css both still apply
 * (this component keeps the `text-[Npx]` class rather than `@apply`-ing it,
 * precisely so that floor keeps raising the rendered size as before).
 *
 * Colour and any layout classes are passed through `className`.
 */
type MicroLabelSize = 8 | 9 | 10 | 11;
type MicroLabelTracking = '0.1' | '0.12' | '0.15' | '0.2' | '0.25' | '0.3' | '0.4' | '0.5';

const SIZE_CLASS: Record<MicroLabelSize, string> = {
  8: 'text-[8px]',
  9: 'text-[9px]',
  10: 'text-[10px]',
  11: 'text-[11px]',
};

const TRACKING_CLASS: Record<MicroLabelTracking, string> = {
  '0.1': 'tracking-[0.1em]',
  '0.12': 'tracking-[0.12em]',
  '0.15': 'tracking-[0.15em]',
  '0.2': 'tracking-[0.2em]',
  '0.25': 'tracking-[0.25em]',
  '0.3': 'tracking-[0.3em]',
  '0.4': 'tracking-[0.4em]',
  '0.5': 'tracking-[0.5em]',
};

interface MicroLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: MicroLabelSize;
  tracking?: MicroLabelTracking;
  /** Colour and layout utilities appended after the base label classes. */
  className?: string;
  children: React.ReactNode;
}

const MicroLabel: React.FC<MicroLabelProps> = ({
  size = 10,
  tracking = '0.2',
  className = '',
  children,
  ...rest
}) => (
  <span
    className={`${SIZE_CLASS[size]} font-black uppercase ${TRACKING_CLASS[tracking]} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

export default MicroLabel;
