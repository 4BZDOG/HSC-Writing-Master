import { Brain, Link2, NotebookPen, Scale, Search, Trophy, type LucideIcon } from 'lucide-react';

/**
 * The line icon each cognitive tier wears: in the command verb ribbon's card
 * headers, and on the verb definition row above the writing area, so a verb is
 * recognisably the same thing in both places.
 *
 * A function rather than a lookup table at module scope: a table would read the
 * imported icon components while this module initialises, which is the
 * `Cannot access 'X' before initialization` shape `npm run check:eager-reads`
 * exists to catch. It keys on the tier number, which is the ladder's own order.
 */
export const tierIcon = (tier: number): LucideIcon => {
  switch (tier) {
    case 1:
      return Brain;
    case 2:
      return NotebookPen;
    case 3:
      return Link2;
    case 4:
      return Search;
    case 5:
      return Scale;
    default:
      return Trophy;
  }
};
