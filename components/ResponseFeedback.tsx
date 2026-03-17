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
    if (!rating) return;
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
        <div className="flex items-center gap-2 text-emerald-400">
          <div className="p-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
            <Check className="w-3 h-3" />
          </div>
          <span className="text-sm font-medium">Thanks for your feedback!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 p-5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/20 border border-[rgb(var(--color-border-secondary))]/50 backdrop-blur-sm transition-all duration-300 hover:bg-[rgb(var(--color-bg-surface-inset))]/30 no-print">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Rate this evaluation
          </h4>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleRating('positive')}
              className={`
                p-2 rounded-lg transition-all duration-200 flex items-center gap-2
                ${
                  rating === 'positive'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : 'text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-bg-surface-light))] hover:text-emerald-400'
                }
              `}
              title="Helpful"
            >
              <ThumbsUp className={`w-5 h-5 ${rating === 'positive' ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={() => handleRating('negative')}
              className={`
                p-2 rounded-lg transition-all duration-200 flex items-center gap-2
                ${
                  rating === 'negative'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                    : 'text-[rgb(var(--color-text-muted))] hover:bg-[rgb(var(--color-bg-surface-light))] hover:text-red-400'
                }
              `}
              title="Not Helpful"
            >
              <ThumbsDown className={`w-5 h-5 ${rating === 'negative' ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Comment Box - Appears on rating select */}
        {showCommentBox && (
          <div className="space-y-3 animate-fade-in-up-sm">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                rating === 'positive'
                  ? 'What did the AI do well?'
                  : 'How could this response be improved?'
              }
              className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-3 text-sm text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 placeholder:text-[rgb(var(--color-text-dim))] resize-none min-h-[80px]"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={`
                  px-4 py-2 rounded-lg text-xs font-bold text-white 
                  bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))]
                  hover:shadow-lg active:scale-95 transition-all flex items-center gap-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isSubmitting ? (
                  'Sending...'
                ) : (
                  <>
                    Submit Feedback <Send className="w-3 h-3" />
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
