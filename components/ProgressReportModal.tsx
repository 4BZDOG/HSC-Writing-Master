import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileDown, Loader2, RefreshCw, X } from 'lucide-react';
import type { Course, User } from '../types';
import type { ProgressReport, ReportAudience, ReportSections } from '../pdf/reportModel';
import { exportProgressReportPdf, progressReportFilename } from '../pdf/exportProgressReport';
import type { PageSizeName } from '../pdf/types';
import {
  buildSchoolReport,
  buildStudentReport,
  buildTeacherReport,
  type ReportOptions,
} from '../utils/progressReport';
import { readPdfPreferences, writePdfPreferences } from '../utils/pdfExportPreferences';
import {
  DEFAULT_PERIOD,
  EMPTY_ALL_TIME_MESSAGE,
  EMPTY_SCOPE_MESSAGE,
  defaultSectionsFor,
  periodChoicesFor,
  reportAudienceFor,
  reportIsEmpty,
  reportSubjectFor,
  rosterDays,
  schoolNameFrom,
  sectionChoicesFor,
  summaryLine,
  REPORT_TITLES,
  type ChoiceOption,
  type ReportPeriod,
} from '../utils/progressReportOptions';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { isCurriculumRemote } from '../services/curriculumService';
import type { TeachingClass } from '../services/responseService';
import type { ToastType } from '../hooks/useToast';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  useCourseRowIds,
  useOwnReportHistory,
  useRosterReport,
  useTeachingClasses,
  type CourseRowState,
  type OwnHistoryState,
  type RosterScope,
  type RosterState,
} from '../hooks/useProgressReportData';
import { PlusLockChip } from './UpgradeModal';

/**
 * The progress report's options and download, opened from the profile's Stats tab.
 *
 * One dialog for three reports: a student's own (Progress report), a teacher's
 * classes (Class report) and an administrator's school (School report). The
 * options narrow the report, the report is built from the data on screen, and the
 * download is the same PDF exporter the marking feedback uses.
 *
 * It is mounted only while open, so every open starts from the defaults and reads
 * the data again, and the focus, scroll lock and Escape behave as they do on the
 * other dialogs.
 */

export interface ProgressReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  /** The courses the user can see, from the loaded syllabus. */
  courses: Course[];
  showToast?: (message: string, type?: ToastType) => void;
}

/*
 * The dialog is drawn in the profile's shell language: a desk body, paper head and
 * foot, and each group of choices is a card lying on the desk. Inputs are 16px and
 * 44px tall on a phone, because a smaller field makes iOS zoom on focus and a
 * shorter one is hard to hit.
 */
const SELECT_CLASS =
  'w-full min-w-0 min-h-11 sm:min-h-0 px-3 py-2.5 rounded-xl bg-surface-inset border border-slate-500 dark:border-primary text-base sm:text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none';

/** A group of choices: paper with a real edge, on the desk. The same card as the profile's. */
const CARD =
  'rounded-panel border border-slate-300 bg-surface shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none p-4 sm:p-5';

/** A 44px touch target on a phone that returns to its own size from `sm`. */
const TOUCH = 'min-h-11 sm:min-h-0';

/** A checkbox row in the style of the export options. The native input keeps the tab stop. */
const ReportCheck: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, hint, checked, disabled = false, onChange }) => (
  <label
    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors motion-reduce:transition-none ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer can-hover:hover:bg-surface-inset'
    }`}
  >
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    {/* The box's edge is slate-500 in the light theme: a box is a control, so its
        edge needs 3:1 against the card it sits on, and slate-400 is 2.5:1. */}
    <span
      aria-hidden="true"
      className={`mt-0.5 w-4 h-4 shrink-0 rounded-lg border flex items-center justify-center transition-colors motion-reduce:transition-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
        checked
          ? 'bg-accent border-accent text-white'
          : 'bg-surface-inset border-slate-500 dark:border-primary'
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-primary">{label}</span>
      <span className="block text-xs leading-snug text-muted mt-0.5">{hint}</span>
    </span>
  </label>
);

/**
 * A small set of choices shown as a segmented control, with each choice's pressed state announced.
 *
 * `locked` shows the current choice but ignores presses. The buttons stay in the tab
 * order, with `aria-disabled` rather than `disabled`, so a keyboard or screen reader
 * user can still reach the reason that `describedBy` names.
 */
function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  locked = false,
  describedBy,
}: {
  legend: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (next: T) => void;
  locked?: boolean;
  describedBy?: string;
}) {
  // A grid, not a wrapping row: four periods sit as two pairs on a phone rather than
  // leaving "All time" alone on a second line.
  const columns =
    options.length === 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : options.length === 3
        ? 'grid-cols-3'
        : 'grid-cols-2';
  return (
    <fieldset className="min-w-0 border-0 p-0 m-0">
      <legend className="t-label text-muted mb-2 p-0">{legend}</legend>
      <div
        className={`grid gap-1 p-1 rounded-xl bg-surface-inset border border-slate-300 dark:border-white/10 ${columns}`}
      >
        {options.map((option) => {
          const active = option.value === value;
          // The selected choice is the paper raised off the well, which is how a
          // segmented control shows what is chosen in every system a reader knows.
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              aria-disabled={locked || undefined}
              aria-describedby={describedBy}
              onClick={() => {
                if (!locked) onChange(option.value);
              }}
              className={`${TOUCH} px-3 py-1.5 rounded-lg text-xs font-bold transition-[background-color,color,box-shadow] ${FOCUS_RING} ${
                active
                  ? 'bg-surface text-primary shadow-sm dark:bg-[rgb(var(--color-bg-surface-elevated))]'
                  : 'text-muted can-hover:hover:text-primary'
              } ${locked ? 'cursor-not-allowed text-muted' : ''}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const classLabel = (c: TeachingClass): string => (c.year ? `${c.name} · Year ${c.year}` : c.name);

const courseRowIdOf = (state: CourseRowState | undefined): string | null =>
  state?.status === 'ready' ? state.rowId : null;

/**
 * What the dialog is showing. Only `ready` has a report to print; every other kind
 * says why there is none, and that reason is the text the user reads.
 */
type View =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** A class or school report on a database without the progress report function. */
  | { kind: 'unavailable' }
  /** A class or school report with no shared database to read from. */
  | { kind: 'local' }
  /** The course the user picked is not in the shared library, so it cannot filter a school report. */
  | { kind: 'blocked' }
  | { kind: 'empty' }
  | { kind: 'ready'; report: ProgressReport };

interface ReportDialogProps extends Omit<ProgressReportModalProps, 'isOpen'> {
  audience: ReportAudience;
}

const ReportDialog: React.FC<ReportDialogProps> = ({
  audience,
  onClose,
  user,
  courses,
  showToast,
}) => {
  const isStudent = audience === 'student';
  const isRoster = !isStudent;
  const titleId = useId();
  const statusId = useId();
  const classSelectId = useId();
  const courseSelectId = useId();
  const scopeReasonId = useId();

  // The dialog is mounted only while open, so these hold for this open alone.
  useEscapeKey(true, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  useScrollLock(true);
  // The trap focuses the first control, which would show a ring on open. Moving focus
  // to the surface (as the profile does) announces the title and leaves no control
  // looking selected. Tab still walks into the controls.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [dialogRef]);

  const [remote] = useState(() => isCurriculumRemote());
  const locked = isFeatureLocked('pdfExport');

  const [period, setPeriod] = useState<ReportPeriod>(DEFAULT_PERIOD);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [includeNames, setIncludeNames] = useState(true);
  const [sections, setSections] = useState<ReportSections>(() => defaultSectionsFor(audience));
  const [pageSize, setPageSize] = useState<PageSizeName>(() => readPdfPreferences().pageSize);
  const [attempt, setAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportLabel, setExportLabel] = useState('');

  // --- Classes and courses ------------------------------------------------------

  const classes = useTeachingClasses(isRoster && remote);
  const classList = useMemo(() => classes ?? [], [classes]);
  // No picker at all when the caller has no classes to choose from.
  const showClassPicker = isRoster && classList.length > 0;
  const selectedClass = showClassPicker ? (classList.find((c) => c.id === classId) ?? null) : null;

  const schoolName = schoolNameFrom(classList);
  const subject = useMemo(
    () => reportSubjectFor(audience, user.role, user.displayName, user.username, schoolName),
    [audience, user.role, user.displayName, user.username, schoolName]
  );

  const courseOptions = useMemo(() => courses.map((c) => ({ id: c.id, name: c.name })), [courses]);
  const courseIds = useMemo(() => courseOptions.map((c) => c.id), [courseOptions]);
  // A school report filters by the database's course id, so every course is checked up front.
  const courseRows = useCourseRowIds(courseIds, isRoster && remote);
  const selectedCourse = courseOptions.find((c) => c.id === courseId) ?? null;

  /**
   * Whether a school or class report can be filtered to the chosen course.
   *
   * `none`: no course chosen. `ready`: the uuid is known, or the student's own history
   * is filtered in the browser. `pending`: still being checked, so nothing is read yet.
   * `blocked`: the course is not in the shared library, so it cannot be sent as a filter.
   */
  const selectedRow = selectedCourse ? courseRows[selectedCourse.id] : undefined;
  const courseGate: 'none' | 'pending' | 'ready' | 'blocked' =
    selectedCourse === null
      ? 'none'
      : isStudent
        ? 'ready'
        : selectedRow?.status === 'ready'
          ? 'ready'
          : selectedRow === undefined || selectedRow.status === 'pending'
            ? 'pending'
            : 'blocked';

  // --- Data ---------------------------------------------------------------------

  const ownHistory: OwnHistoryState = useOwnReportHistory(isStudent, attempt);

  /**
   * A student whose report can only use their saved totals: there is no answer history
   * to read, either because there is no signed-in account (`null`), or because the
   * history is empty. The totals carry no course and no dates, so the period and the
   * course cannot apply. The report is built as all time and unfiltered, and the
   * controls say why they are off, so the builder never prints a note about filters
   * that were not applied.
   */
  const totalsOnly =
    isStudent &&
    ownHistory.status === 'ready' &&
    (ownHistory.history === null || ownHistory.history.length === 0);
  const withoutAccount = isStudent && ownHistory.status === 'ready' && ownHistory.history === null;
  const scopeReason = totalsOnly
    ? withoutAccount
      ? 'Period and course need your answer history, which is kept for signed-in accounts.'
      : 'Period and course apply once you have marked answers in your history.'
    : null;
  const effectivePeriod: ReportPeriod = totalsOnly ? 'all' : period;
  const effectiveCourse = totalsOnly ? null : selectedCourse;

  const rosterScope: RosterScope | null =
    isRoster && remote && (courseGate === 'none' || courseGate === 'ready')
      ? {
          days: rosterDays(period),
          classId: selectedClass?.id ?? null,
          courseRowId: courseRowIdOf(selectedRow),
        }
      : null;
  const rosterState: RosterState = useRosterReport(rosterScope, attempt);

  const readAt = isStudent
    ? ownHistory.status === 'ready'
      ? ownHistory.readAt
      : null
    : rosterState.status === 'ready'
      ? rosterState.readAt
      : null;

  const report = useMemo<ProgressReport | null>(() => {
    if (readAt === null) return null;
    const options: ReportOptions = {
      audience,
      windowDays: effectivePeriod,
      courseFilter: effectiveCourse ? { id: effectiveCourse.id, name: effectiveCourse.name } : null,
      className: selectedClass?.name ?? null,
      includeStudentNames: includeNames,
      sections,
      subject,
      generatedAt: readAt,
    };
    if (isStudent) {
      return buildStudentReport({
        stats: user.stats,
        history: ownHistory.status === 'ready' ? ownHistory.history : null,
        options,
      });
    }
    if (rosterState.status !== 'ready') return null;
    const input = { payload: rosterState.payload, options };
    return audience === 'school' ? buildSchoolReport(input) : buildTeacherReport(input);
  }, [
    readAt,
    audience,
    effectivePeriod,
    effectiveCourse,
    selectedClass,
    includeNames,
    sections,
    subject,
    isStudent,
    user.stats,
    ownHistory,
    rosterState,
  ]);

  // What the dialog shows, decided in the order a reader would want the reasons.
  const view: View = ((): View => {
    if (isStudent) {
      if (ownHistory.status === 'loading') return { kind: 'loading' };
      if (ownHistory.status === 'error') return { kind: 'error' };
    } else {
      if (!remote) return { kind: 'local' };
      if (courseGate === 'blocked') return { kind: 'blocked' };
      if (courseGate === 'pending') return { kind: 'loading' };
      if (rosterState.status === 'error') return { kind: 'error' };
      if (rosterState.status === 'unavailable') return { kind: 'unavailable' };
      if (rosterState.status === 'loading') return { kind: 'loading' };
    }
    if (report === null) return { kind: 'loading' };
    if (reportIsEmpty(report)) return { kind: 'empty' };
    return { kind: 'ready', report };
  })();

  const unavailable = view.kind === 'unavailable';
  const allTimeEmpty = isStudent && effectivePeriod === 'all' && effectiveCourse === null;

  // --- Actions ------------------------------------------------------------------

  const setSection = (key: keyof ReportSections, on: boolean) =>
    setSections((prev) => ({ ...prev, [key]: on }));

  const choosePageSize = (size: PageSizeName) => {
    setPageSize(size);
    // Only the paper size changes here. Copies and the other export choices keep what they were.
    writePdfPreferences({ ...readPdfPreferences(), pageSize: size });
  };

  const handleDownload = async () => {
    if (exporting) return;
    // A locked plan is offered the upgrade rather than the file. The button is only
    // enabled when there is a report to print, so this never offers an upgrade for nothing.
    if (locked) {
      requestUpgrade('pdfExport');
      return;
    }
    if (view.kind !== 'ready') return;
    setExporting(true);
    setExportLabel('Starting…');
    try {
      await exportProgressReportPdf({
        report: view.report,
        filename: progressReportFilename(view.report),
        pageSize,
        onToast: showToast,
        onProgress: (_fraction, label) => setExportLabel(label),
      });
    } catch {
      // The exporter has already toasted the stage that failed.
    } finally {
      setExporting(false);
      setExportLabel('');
    }
  };

  // --- Copy ---------------------------------------------------------------------

  const statusText = ((): string => {
    switch (view.kind) {
      case 'loading':
        return isStudent ? 'Loading your answers…' : 'Loading the report…';
      case 'error':
        return isStudent
          ? 'Your answers could not be loaded. Check your connection, then try again.'
          : 'This report could not be loaded. Check your connection, then try again.';
      case 'unavailable':
        return 'Class and school reports need a database update before they can be built. Course filtering is off until then.';
      case 'local':
        return 'Class and school reports come from the shared database, which this copy of the app is not connected to.';
      case 'blocked':
        return `${selectedCourse?.name ?? 'This course'} is not in the shared library yet, so a school report cannot be filtered to it. Choose another course, or all courses.`;
      case 'empty':
        return allTimeEmpty ? EMPTY_ALL_TIME_MESSAGE : EMPTY_SCOPE_MESSAGE;
      case 'ready':
        return summaryLine(view.report);
    }
  })();

  const downloadDisabled = exporting || view.kind !== 'ready';

  return createPortal(
    <div
      className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in motion-reduce:animate-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Shift+Tab from the surface itself would leave the dialog. The trap only
          // corrects that once focus is on a control, so the surface hands it to the last one.
          if (e.key !== 'Tab' || !e.shiftKey || e.target !== e.currentTarget) return;
          const controls = e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled])'
          );
          const last = controls[controls.length - 1];
          if (last) {
            e.preventDefault();
            last.focus();
          }
        }}
        className="w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-surface bg-[rgb(var(--color-bg-base))] dark:bg-[rgb(var(--color-bg-surface))] border border-slate-300 dark:border-white/10 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] animate-fade-in-up motion-reduce:animate-none focus:outline-none"
      >
        {/* Paper head, washed with the accent the way the profile's head is washed
            with its band. The desk body and paper foot frame the choices. */}
        <header className="shrink-0 flex items-start gap-4 px-5 sm:px-8 pt-5 sm:pt-7 pb-5 bg-surface bg-gradient-to-r from-accent/10 to-accent/0 border-b border-slate-300 dark:border-white/10">
          <div
            aria-hidden="true"
            className="w-11 h-11 shrink-0 rounded-tile bg-accent/15 text-accent flex items-center justify-center"
          >
            <FileDown className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-lg font-black tracking-tight text-primary leading-tight"
            >
              {REPORT_TITLES[audience]}
            </h2>
            <p className="text-sm text-secondary mt-1 break-words">
              {subject.name} · {subject.roleLabel}
              {subject.school ? ` · ${subject.school}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`ml-auto shrink-0 flex items-center justify-center min-w-11 sm:min-w-0 p-2 rounded-xl text-muted can-hover:hover:text-primary can-hover:hover:bg-surface-inset transition-colors ${TOUCH} ${FOCUS_RING}`}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-5 sm:px-8 py-5 space-y-5 bg-[rgb(var(--color-bg-base))] dark:bg-transparent">
          <section aria-label="Scope" className={`${CARD} grid gap-4 sm:grid-cols-2`}>
            {showClassPicker && (
              <div className="min-w-0">
                <label htmlFor={classSelectId} className="t-label block text-muted mb-2">
                  Class
                </label>
                <select
                  id={classSelectId}
                  value={classId ?? ''}
                  onChange={(e) => setClassId(e.target.value || null)}
                  disabled={!remote}
                  className={SELECT_CLASS}
                >
                  <option value="">
                    {audience === 'school' ? 'Every class' : 'All my classes'}
                  </option>
                  {classList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {classLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="min-w-0">
              <label htmlFor={courseSelectId} className="t-label block text-muted mb-2">
                Course
              </label>
              <select
                id={courseSelectId}
                value={effectiveCourse?.id ?? ''}
                onChange={(e) => {
                  if (!totalsOnly) setCourseId(e.target.value || null);
                }}
                disabled={unavailable || (isRoster && !remote)}
                aria-disabled={totalsOnly || undefined}
                aria-describedby={scopeReason ? scopeReasonId : undefined}
                className={SELECT_CLASS}
              >
                <option value="">All courses</option>
                {courseOptions.map((c) => {
                  const state = isRoster ? courseRows[c.id] : undefined;
                  const missing = state?.status === 'missing';
                  const failed = state?.status === 'error';
                  return (
                    <option key={c.id} value={c.id} disabled={missing || failed}>
                      {c.name}
                      {missing ? ' (not in the shared library yet)' : ''}
                      {failed ? ' (could not be checked)' : ''}
                    </option>
                  );
                })}
              </select>
              {isRoster && courseOptions.some((c) => courseRows[c.id]?.status === 'missing') && (
                <p className="text-xs text-muted mt-1.5">
                  Courses not in the shared library cannot filter a school or class report.
                </p>
              )}
              {unavailable && (
                <p className="text-xs text-muted mt-1.5">
                  Course filtering needs a database update.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Segmented
                legend="Period"
                options={periodChoicesFor(audience)}
                value={effectivePeriod}
                onChange={(next: ReportPeriod) => setPeriod(next)}
                locked={scopeReason !== null}
                describedBy={scopeReason ? scopeReasonId : undefined}
              />
            </div>
            {scopeReason && (
              <p id={scopeReasonId} className="text-xs text-muted sm:col-span-2 -mt-2">
                {scopeReason}
              </p>
            )}
          </section>

          <div className={CARD}>
            <fieldset className="min-w-0 border-0 p-0 m-0">
              <legend className="t-label text-muted mb-2 p-0">Include in the report</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {sectionChoicesFor(audience).map((choice) => {
                  // The school's class table is one row per class, so it has nothing to
                  // list once the report is narrowed to a single class.
                  const off = choice.key === 'classes' && selectedClass !== null;
                  return (
                    <ReportCheck
                      key={choice.key}
                      label={choice.label}
                      hint={off ? 'Shown when every class is included' : choice.hint}
                      checked={sections[choice.key]}
                      disabled={off}
                      onChange={(on) => setSection(choice.key, on)}
                    />
                  );
                })}
              </div>
            </fieldset>

            {isRoster && (
              <fieldset className="mt-5 min-w-0 border-0 p-0 m-0">
                <legend className="t-label text-muted mb-2 p-0">Names</legend>
                <ReportCheck
                  label="Include student names"
                  hint="Names are personal information. Off prints each student as a number."
                  checked={includeNames}
                  onChange={setIncludeNames}
                />
              </fieldset>
            )}
          </div>

          <div className={CARD}>
            <Segmented
              legend="Paper"
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
              ]}
              value={pageSize}
              onChange={choosePageSize}
            />
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-300 dark:border-white/10 bg-surface px-5 sm:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <p
                id={statusId}
                role="status"
                aria-live="polite"
                className="text-sm text-primary break-words text-balance flex items-start gap-2"
              >
                {view.kind === 'loading' && (
                  <Loader2
                    className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-muted motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                <span className={view.kind === 'ready' ? 'font-medium' : 'text-secondary'}>
                  {statusText}
                </span>
              </p>
              {totalsOnly && (
                <p className="text-xs text-muted mt-1">
                  Your report will use your saved totals only.
                </p>
              )}
              {view.kind === 'error' && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold text-accent bg-accent/15 border border-accent/30 can-hover:hover:bg-accent/25 transition-colors inline-flex items-center gap-1.5 ${TOUCH} ${FOCUS_RING}`}
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Try again
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloadDisabled}
              aria-busy={exporting}
              aria-describedby={statusId}
              className={`shrink-0 ${TOUCH} px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-[rgb(var(--color-accent))] text-white dark:text-slate-950 shadow-sm transition-colors can-hover:hover:bg-[rgb(var(--color-accent-dark))] dark:can-hover:hover:bg-[rgb(var(--color-accent-glow))] disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              {exporting ? (
                <>
                  <Loader2
                    className="w-4 h-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span role="status" aria-live="polite">
                    {exportLabel || 'Exporting…'}
                  </span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" aria-hidden="true" />
                  Download PDF
                  {locked && <PlusLockChip feature="pdfExport" />}
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

/**
 * The progress report dialog. Renders nothing while closed, and nothing for a role
 * with no report (a guest).
 */
const ProgressReportModal: React.FC<ProgressReportModalProps> = (props) => {
  const audience = reportAudienceFor(props.user.role);
  if (!props.isOpen || audience === null || typeof document === 'undefined') return null;
  return <ReportDialog {...props} audience={audience} />;
};

export default ProgressReportModal;
