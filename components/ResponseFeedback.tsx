import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, Check, Send } from 'lucide-react';
import { UserFeedback } from '../types';

interface ResponseFeedbackProps {
  onFeedbackSubmit: (feedback: UserFeedback) => void;
  existingFeedback?: UserFeedback;
}

const ResponseFeedback: React.FC<ResponseFeedbackProps> = ({
  onFeedbackSubmit,
  existingFeedback,
}) => {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(
    existingFeedback?.rating || null
  );
  const [reason, setReason] = useState(existingFeedback?.reason || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(!!existingFeedback);
  const [showCommentBox, setShowCommentBox] = useState(false);

  const handleRating = (selectedRating: 'positive' | 'negative') => {
    setRating(selectedRating);
    setShowCommentBox(true);
    // If they just click a rating without comment, we can submit immediately or wait
    // Let's wait for comment if they want, but allow quick submission
  };

  const handleSubmit = () => {
    if (!rating || isSubmitting) return;
    setIsSubmitting(true);

    // Simulate network delay for feeling of "sending"
    setTimeout(() => {
      onFeedbackSubmit({
        rating,
        reason: reason.trim(),
        timestamp: Date.now(),
      });
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 600);
  };

  if (isSubmitted) {
    return (
      <div className="flex items-center justify-center p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))]/30 animate-fade-in">
        {/* Emerald-600 measured 3.8:1 on the light desk; -800 clears AA with the same hue. */}
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
          <div className="p-1 rounded-full bg-emerald-100 border border-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/30">
            <Check className="w-3 h-3" />
          </div>
          <span className="text-sm font-medium">Thanks for your feedback!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-panel bg-surface border border-slate-300 dark:border-white/10 shadow-sm no-print">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-[rgb(var(--color-text-muted))] flex items-center gap-2">
            <MessageSquare className="w-4 h-4" aria-hidden="true" /> Rate this evaluation
          </h4>

          <div className="flex items-center gap-2">
            {/* 44px on a phone, the touch target. `aria-pressed` says which one is
                selected, which the colour alone did not. Selected colours are the
                notice pairs: emerald-400 was 1.9:1 on white. */}
            <button
              type="button"
              onClick={() => handleRating('positive')}
              aria-label="Helpful"
              aria-pressed={rating === 'positive'}
              title="Helpful"
              className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-2 rounded-lg transition-all duration-200 flex items-center justify-center border ${
                rating === 'positive'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
                  : 'border-transparent text-[rgb(var(--color-text-muted))] hover:bg-slate-100 hover:text-emerald-800 dark:hover:bg-white/10 dark:hover:text-emerald-400'
              }`}
            >
              <ThumbsUp
                className={`w-5 h-5 ${rating === 'positive' ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              onClick={() => handleRating('negative')}
              aria-label="Not helpful"
              aria-pressed={rating === 'negative'}
              title="Not Helpful"
              className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-2 rounded-lg transition-all duration-200 flex items-center justify-center border ${
                rating === 'negative'
                  ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30'
                  : 'border-transparent text-[rgb(var(--color-text-muted))] hover:bg-slate-100 hover:text-red-800 dark:hover:bg-white/10 dark:hover:text-red-400'
              }`}
            >
              <ThumbsDown
                className={`w-5 h-5 ${rating === 'negative' ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Comment Box - Appears on rating select */}
        {showCommentBox && (
          <div className="space-y-3 animate-fade-in-up-sm">
            {/* 16px on a phone: a smaller field makes iOS Safari zoom on focus. It has
                a name too, since the placeholder vanishes as soon as anything is typed. */}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={
                rating === 'positive'
                  ? 'What did the AI do well?'
                  : 'How could this response be improved?'
              }
              placeholder={
                rating === 'positive'
                  ? 'What did the AI do well?'
                  : 'How could this response be improved?'
              }
              className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-3 text-base sm:text-sm text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 placeholder:text-[rgb(var(--color-text-dim))] resize-none min-h-[80px]"
            />
            <div className="flex justify-end">
              {/* White on the accent gradient measured 2.8:1 (4.0:1 at its darkest). A
                  neutral ink primary clears AA in both themes and is not a band colour. */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="min-h-11 sm:min-h-0 px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white hover:shadow-lg active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  'Sending…'
                ) : (
                  <>
                    Submit Feedback <Send className="w-3 h-3" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponseFeedback;
