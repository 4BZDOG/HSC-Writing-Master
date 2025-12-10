import { useState, useCallback } from 'react';

const TOAST_DURATION = 5000;

// Generate ID with fallback for environments without crypto.randomUUID
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const toastId = generateId();
    setToast({ id: toastId, message, type });

    setTimeout(() => {
      setToast(prev => (prev?.id === toastId ? null : prev));
    }, TOAST_DURATION);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
};
