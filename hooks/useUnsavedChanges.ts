import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage unsaved changes warnings before navigation or page unload
 *
 * @param isDirty - Whether there are unsaved changes
 * @param warningMessage - Custom message for unsaved changes dialog
 * @param onBeforeUnload - Optional callback before unload
 *
 * @example
 * const [isDirty, setIsDirty] = useState(false);
 * useUnsavedChanges(isDirty, 'You have unsaved changes. Are you sure you want to leave?');
 */
export const useUnsavedChanges = (
  isDirty: boolean,
  warningMessage: string = 'You have unsaved changes. Are you sure you want to leave?',
  onBeforeUnload?: () => void
) => {
  const isNavigatingRef = useRef(false);

  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty && !isNavigatingRef.current) {
        e.preventDefault();
        // Different browsers require different properties
        e.returnValue = '';
        return '';
      }
    },
    [isDirty]
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  /**
   * Call this function before navigating to show a confirmation dialog
   * Returns true if the user confirms navigation
   */
  const checkUnsavedChanges = useCallback(
    (customMessage?: string): boolean => {
      if (!isDirty) {
        return true;
      }

      const message = customMessage || warningMessage;
      const userConfirmed = window.confirm(message);

      if (userConfirmed) {
        isNavigatingRef.current = true;
        onBeforeUnload?.();
      }

      return userConfirmed;
    },
    [isDirty, warningMessage, onBeforeUnload]
  );

  return {
    checkUnsavedChanges,
    isDirty,
  };
};

/**
 * Hook to detect changes in form data
 * Compares current form data with initial data
 */
export const useFormDirty = <T extends Record<string, any>>(
  formData: T,
  initialData: T
): boolean => {
  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialData);
  return isDirty;
};
