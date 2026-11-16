import React, { useEffect, useRef, useState } from 'react';
import {
  SUBJECT_AREAS,
  SUBJECT_AREA_FULL_NAME,
  SUBJECT_AREA_ICON,
  SUBJECT_AREA_ICON_TINT,
  SUBJECT_AREA_TILE,
  type SubjectArea,
} from '../utils/subjectAreas';
import { FACULTY_FILTER_ALL, type FacultyFilter } from '../utils/courseGrouping';

interface FacultyFilterBarProps {
  /** The faculties that have courses, in canonical order, each with its count. */
  faculties: { area: SubjectArea; count: number }[];
  /** Every course, for the "All" chip. */
  total: number;
  value: FacultyFilter;
  onChange: (filter: FacultyFilter) => void;
  /** The chosen course, when the current faculty filter is hiding it. */
  hiddenCourseName?: string;
  /** Show every faculty again, from the hint line. */
  onShowAll?: () => void;
}

/**
 * The faculty chips at the top of the course list: "All", then one chip per
 * faculty that has courses. A toggle group, so each chip reports its state with
 * `aria-pressed`, and only one is in the Tab order at a time (arrow keys move
 * between them), so a long row costs one Tab stop rather than eight.
 */
const FacultyFilterBar: React.FC<FacultyFilterBarProps> = ({
  faculties,
  total,
  value,
  onChange,
  hiddenCourseName,
  onShowAll,
}) => {
  // Chip 0 is "All"; chip n is faculties[n - 1].
  const chips: FacultyFilter[] = [FACULTY_FILTER_ALL, ...faculties.map((f) => f.area)];
  const activeIndex = Math.max(0, chips.indexOf(value));
  const [stop, setStop] = useState(activeIndex);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // The chip that is chosen is the one Tab lands on, whatever happened before.
  useEffect(() => {
    setStop(activeIndex);
  }, [activeIndex]);

  const focusChip = (index: number) => {
    setStop(index);
    refs.current[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = chips.length - 1;
    const current = refs.current.findIndex((el) => el === document.activeElement);
    if (current < 0) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
    else if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    focusChip(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Show faculty"
        onKeyDown={handleKeyDown}
        // Under `sm` the row scrolls sideways rather than wrapping, so a phone
        // shows one line of chips; the fade says there is more to the right.
        className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-0.5 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:[mask-image:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((chip, index) => {
          const active = index === activeIndex;
          const isAll = chip === FACULTY_FILTER_ALL;
          const area = isAll ? null : chip;
          const count = isAll ? total : (faculties.find((f) => f.area === chip)?.count ?? 0);
          const Icon = area ? SUBJECT_AREA_ICON[area] : null;
          const name = isAll ? 'All' : chip;
          const fullName = isAll ? 'All faculties' : SUBJECT_AREA_FULL_NAME[chip as SubjectArea];
          const tone = isAll
            ? active
              ? 'bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-primary))] border-white/25 light:border-slate-500 shadow-sm'
              : ''
            : active
              ? `${SUBJECT_AREA_TILE[chip as SubjectArea]} shadow-sm`
              : '';
          return (
            <button
              key={chip}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              tabIndex={index === stop ? 0 : -1}
              aria-pressed={active}
              title={fullName}
              onFocus={() => setStop(index)}
              onClick={() => onChange(chip)}
              className={`t-label shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all active:scale-[0.98] ${
                active
                  ? tone
                  : 'bg-[rgb(var(--color-bg-surface))] light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-700 border-white/10 light:border-slate-300 hover:border-white/25 light:hover:border-slate-400'
              }`}
            >
              {Icon && (
                <Icon
                  aria-hidden="true"
                  className={`w-3 h-3 shrink-0 ${active ? '' : SUBJECT_AREA_ICON_TINT[chip as SubjectArea]}`}
                />
              )}
              <span>{name}</span>
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      {hiddenCourseName && onShowAll && (
        <p className="t-label flex flex-wrap items-center gap-x-2 gap-y-1 text-[rgb(var(--color-text-muted))] light:text-slate-600">
          <span className="min-w-0 break-words">
            “{hiddenCourseName}” is hidden by this filter.
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="font-bold text-indigo-400 light:text-indigo-600 hover:underline"
          >
            Show all faculties
          </button>
        </p>
      )}
    </div>
  );
};

/**
 * A group heading for the course list: the faculty's icon and short name, quiet
 * like every other `t-label`, with the full name as the tooltip. Screen readers
 * get the full name as the group's name.
 */
export const facultyGroupHeading = (
  group: string
): { visual: React.ReactNode; accessibleName: string } => {
  if (!(SUBJECT_AREAS as string[]).includes(group)) {
    return { visual: group, accessibleName: group };
  }
  const area = group as SubjectArea;
  const Icon = SUBJECT_AREA_ICON[area];
  const fullName = SUBJECT_AREA_FULL_NAME[area];
  return {
    visual: (
      <span className="inline-flex items-center gap-1.5" title={fullName}>
        <Icon aria-hidden="true" className={`w-3 h-3 shrink-0 ${SUBJECT_AREA_ICON_TINT[area]}`} />
        {area}
      </span>
    ),
    accessibleName: fullName,
  };
};

export default FacultyFilterBar;
