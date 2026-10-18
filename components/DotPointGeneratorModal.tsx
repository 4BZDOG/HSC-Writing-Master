import React, { useState, useEffect } from 'react';
import { generateDotPointsForSubTopic } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import { X, ListChecks } from 'lucide-react';
import AiErrorNotice from './AiErrorNotice';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
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
} from '../utils/creatorChrome';

interface DotPointGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDotPointsGenerated: (dotPoints: string[]) => void;
  courseName: string;
  topicName: string;
  subTopicName: string;
}

const DotPointGeneratorModal: React.FC<DotPointGeneratorModalProps> = ({
  isOpen,
  onClose,
  onDotPointsGenerated,
  courseName,
  topicName,
  subTopicName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  // Escape closes this modal like every other modal surface (but never mid-operation).
  useEscapeKey(isOpen && !isLoading, onClose);
  useScrollLock(isOpen);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dotPoints = await generateDotPointsForSubTopic(courseName, topicName, subTopicName);
      if (!dotPoints || dotPoints.length === 0) {
        setError(
          'The AI could not produce dot points for this sub-topic. Try again, or add them manually.'
        );
        return;
      }
      onDotPointsGenerated(dotPoints);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={CREATOR_BACKDROP} onClick={handleClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dot-point-generator-title"
        className={`${CREATOR_SHELL} max-w-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <ListChecks className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>{subTopicName}</p>
            <h2 id="dot-point-generator-title" className={CREATOR_TITLE}>
              Generate dot points
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={CREATOR_BODY}>
          <p className="t-body text-[rgb(var(--color-text-secondary))]">
            Draft suggested dot points for this sub-topic with AI. For NESA’s exact wording, paste
            the syllabus text into Add from syllabus on the topic instead.
          </p>
          {error && !isLoading && (
            <div className="mt-4">
              <AiErrorNotice
                title="No dot points were drafted"
                message={error}
                onRetry={handleGenerate}
                onDismiss={() => setError(null)}
              />
            </div>
          )}
        </div>

        <div className={CREATOR_FOOTER}>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className={CREATOR_SECONDARY_BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className={CREATOR_PRIMARY_BUTTON}
          >
            <ListChecks className="w-4 h-4" aria-hidden="true" />
            Generate dot points
          </button>
        </div>

        <AiBusyOverlay show={isLoading}>
          <LoadingIndicator
            task="generation"
            message="Generating dot points"
            messages={['Reading the course and topic', 'Drafting 3 to 5 syllabus dot points']}
            duration={8}
            band={3}
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default DotPointGeneratorModal;
