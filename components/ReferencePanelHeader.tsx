import React from 'react';
import { PANEL_NAME } from './PanelDisclosure';

/**
 * The header grammar every panel under the writing area shares: a 40px icon tile
 * at the left, the panel's name in the heading voice with a `.t-label` caption
 * beneath it, and the trailing controls (a read tick, a chevron or a status) at the
 * right. Draft check, the writing timer and the three reference panels all draw
 * their headers through this, so the tile, the type and the offsets cannot drift.
 *
 * The tile is passed in, not drawn here, because its contents differ: a band's
 * solid tile for the heroes, a status ring for Draft check, a plain icon for the
 * timer. `REFERENCE_TILE` is the neutral frame for the tiles that carry no band.
 *
 * It renders two siblings, the title block and the trailing block, for the caller
 * to place inside its own disclosure button, so an accessible name stays the
 * caller's to set.
 */

/** The 40px tile every header carries. Shape and size only; the fill and ink are the caller's. */
export const REFERENCE_TILE =
  'w-10 h-10 rounded-tile flex items-center justify-center shrink-0 border transition-all duration-500';

/** The neutral fill of a tile that carries no band: a shut panel's tile, Draft
 *  check's ring and the timer's icon. */
export const REFERENCE_TILE_NEUTRAL =
  'border-slate-300 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-black/20';

export interface ReferencePanelHeaderProps {
  tile: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  /** Ink for the name. Defaults to the primary ink. */
  titleClassName?: string;
  /** Ink for the caption. Defaults to the secondary ink. */
  subtitleClassName?: string;
  /** Controls at the right edge: a read tick, a chevron, a status. */
  trailing?: React.ReactNode;
}

export const ReferencePanelHeader: React.FC<ReferencePanelHeaderProps> = ({
  tile,
  title,
  subtitle,
  titleClassName = 'text-slate-900 dark:text-white',
  subtitleClassName = 'text-slate-600 dark:text-slate-400',
  trailing,
}) => (
  <>
    <div className="flex items-center gap-4 min-w-0">
      {tile}
      <span className="text-left min-w-0">
        <span className={`${PANEL_NAME} ${titleClassName}`}>{title}</span>
        {subtitle && <span className={`t-label block ${subtitleClassName}`}>{subtitle}</span>}
      </span>
    </div>
    {trailing && <div className="flex items-center gap-2.5 shrink-0 ml-auto">{trailing}</div>}
  </>
);
