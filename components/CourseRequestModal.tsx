import React, { useState, useEffect } from 'react';
import type { ToastType } from '../hooks/useToast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { BookPlus, X, Check, Loader2, Users } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { requestCourse, type CourseRequestResult } from '../services/courseDemandService';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_FIELD_LABEL,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

/**
 * "The course I teach isn't here" — the one route out of the dead end that
 * admin-only course creation leaves for everyone else.
 *
 * The design intent is that this feels like joining a queue rather than posting
 * into a void, which is why the confirmation states how many people are already
 * waiting for the same course (the RPC returns the headcount) instead of a bare
 * "thanks". A teacher who learns they are the twelfth person asking for
 * Software Engineering has been told something true and useful; "we'll consider
 * it" has not.
 *
 * Duplicate handling is the server's job: `log_course_request` normalises the
 * name, so this modal never has to ask "did you mean…".
 */

interface CourseRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fills the name — the search text that found nothing. */
  initialName?: string;
  showToast: (message: string, type: ToastType) => void;
}

const CourseRequestModal: React.FC<CourseRequestModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  showToast,
}) => {
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  const [name, setName] = useState(initialName);
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<CourseRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open so a second request doesn't start from the first one's
  // answer, and so a prefilled name from a new search actually lands.
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setNote('');
      setResult(null);
      setError(null);
      setIsSending(false);
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      setResult(await requestCourse(trimmed, note));
    } catch (err) {
      // CourseDemandUnavailableError already carries a sentence written for a
      // person ("this deployment is not connected to…"); anything else is a
      // server message meant for the user, or a fallback.
      setError(err instanceof Error ? err.message : 'Could not send that request.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDone = () => {
    if (result) {
      showToast(
        result.alreadyAsked
          ? `Your note on “${result.name}” has been updated.`
          : `“${result.name}” has been added to the request list.`,
        'success'
      );
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={CREATOR_BACKDROP} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-request-title"
        className={`${CREATOR_SHELL} max-w-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <BookPlus className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>Not in the course list yet</p>
            <h2 id="course-request-title" className={CREATOR_TITLE}>
              Request a course
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {result ? (
          <>
            {/* Confirmation. The headcount is the point: it turns a suggestion box
                into a queue with a visible length. */}
            <div className={CREATOR_BODY}>
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-500 light:text-emerald-700" />
                </div>
                {/* A course already marked `available` is a different answer
                    entirely: it is here, and the person is looking for it under a
                    name we don't recognise. Queueing them behind a request that
                    is already satisfied would leave them waiting for something
                    they could open now. */}
                {result.status === 'available' ? (
                  <>
                    <p className="text-sm text-[rgb(var(--color-text-primary))]">
                      “{result.name}” is already available.
                    </p>
                    <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))]">
                      It may be listed under a slightly different name — close this and check the
                      course list. If you still can’t see it, ask your administrator: your request
                      has been recorded either way.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[rgb(var(--color-text-primary))]">
                      {result.alreadyAsked
                        ? `You had already asked for “${result.name}”.`
                        : `“${result.name}” is on the list.`}
                    </p>
                    <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 shrink-0 text-indigo-400 light:text-indigo-700" />
                      {result.requesters === 1
                        ? 'You are the first person to ask for this one.'
                        : `${result.requesters} people are waiting for this course.`}
                    </p>
                    {result.status === 'planned' && (
                      <p className="text-xs text-indigo-400 light:text-indigo-700">
                        Good news — this one is already planned.
                      </p>
                    )}
                    <p className="text-xs text-[rgb(var(--color-text-muted))] leading-relaxed">
                      Requests are reviewed by an administrator. Courses are added for everyone at
                      once, so there is nothing else to do.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className={CREATOR_FOOTER}>
              <button type="button" onClick={handleDone} className={CREATOR_PRIMARY_BUTTON}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className={`${CREATOR_BODY} space-y-5`}>
              <div>
                <label htmlFor="course-request-name" className={CREATOR_FIELD_LABEL}>
                  Course name
                </label>
                <input
                  type="text"
                  id="course-request-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  className={CREATOR_INPUT}
                  placeholder="e.g., Software Engineering"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="course-request-note" className={CREATOR_FIELD_LABEL}>
                  Anything else?{' '}
                  <span className="font-normal text-[rgb(var(--color-text-muted))]">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="course-request-note"
                  value={note}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${CREATOR_INPUT} resize-none`}
                  placeholder="Which year group, and when do you start it?"
                />
              </div>
              {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
            </div>

            <div className={CREATOR_FOOTER}>
              <button type="button" onClick={onClose} className={CREATOR_SECONDARY_BUTTON}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSending}
                className={CREATOR_PRIMARY_BUTTON}
              >
                {isSending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                {isSending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CourseRequestModal;
