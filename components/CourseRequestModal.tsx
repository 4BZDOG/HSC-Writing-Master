import React, { useState, useEffect } from 'react';
import { Compass, X, Check, Loader2, Users } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { requestCourse, type CourseRequestResult } from '../services/courseDemandService';

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
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CourseRequestModal: React.FC<CourseRequestModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  showToast,
}) => {
  useEscapeKey(isOpen, onClose);
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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-request-title"
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50">
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2
                  id="course-request-title"
                  className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900"
                >
                  Request a course
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Tell us what to build next.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {result ? (
          /* Confirmation. The headcount is the point: it turns a suggestion box
             into a queue with a visible length. */
          <div className="p-6 bg-[rgb(var(--color-bg-surface))] light:bg-white">
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-500" />
              </div>
              {/* A course already marked `available` is a different answer
                  entirely: it is here, and the person is looking for it under a
                  name we don't recognise. Queueing them behind a request that
                  is already satisfied would leave them waiting for something
                  they could open now. */}
              {result.status === 'available' ? (
                <>
                  <p className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    “{result.name}” is already available.
                  </p>
                  <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                    It may be listed under a slightly different name — close this and check the
                    course list. If you still can’t see it, ask your administrator: your request has
                    been recorded either way.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    {result.alreadyAsked
                      ? `You had already asked for “${result.name}”.`
                      : `“${result.name}” is on the list.`}
                  </p>
                  <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-600 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                    {result.requesters === 1
                      ? 'You are the first person to ask for this one.'
                      : `${result.requesters} people are waiting for this course.`}
                  </p>
                  {result.status === 'planned' && (
                    <p className="text-xs font-bold text-indigo-400 light:text-indigo-600">
                      Good news — this one is already planned.
                    </p>
                  )}
                  <p className="text-[11px] text-[rgb(var(--color-text-muted))] light:text-slate-400 leading-relaxed">
                    Requests are reviewed by an administrator. Courses are added for everyone at
                    once, so there is nothing else to do.
                  </p>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleDone}
                className="py-2 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-[rgb(var(--color-bg-surface))] light:bg-white"
          >
            <div className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="course-request-name"
                  className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 mb-2"
                >
                  Course name
                </label>
                <input
                  type="text"
                  id="course-request-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] transition"
                  placeholder="e.g., Software Engineering"
                  autoFocus
                />
              </div>
              <div>
                <label
                  htmlFor="course-request-note"
                  className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 mb-2"
                >
                  Anything else?{' '}
                  <span className="font-normal text-[rgb(var(--color-text-muted))] light:text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="course-request-note"
                  value={note}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setNote(e.target.value)}
                  className="block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg shadow-sm py-3 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] transition resize-none"
                  placeholder="Which year group, and when do you start it?"
                />
              </div>
              {error && (
                <p className="text-red-400 light:text-red-600 text-xs font-bold">{error}</p>
              )}
            </div>

            <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSending}
                className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-2"
              >
                {isSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
