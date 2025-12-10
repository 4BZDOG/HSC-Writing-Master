import { useState, useEffect } from 'react';
import { apiGuard, ApiStatus } from '../services/geminiService';

const INITIAL_STATUS: ApiStatus = {
  state: 'HEALTHY',
  errorCount: 0,
  isBlocked: false,
  blockedUntil: 0,
};

export const useApiStatus = (): ApiStatus => {
  const [status, setStatus] = useState<ApiStatus>(INITIAL_STATUS);

  useEffect(() => {
    const unsubscribe = apiGuard.subscribe((newStatus) => {
      setStatus(newStatus);
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []); // Empty dependency array means this effect runs only once on mount

  return status;
};
