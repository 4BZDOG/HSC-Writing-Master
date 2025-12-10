
import { useState, useEffect } from 'react';
import { apiMonitor, ApiMonitorStatus } from '../services/geminiService';

const INITIAL_STATUS: ApiMonitorStatus = {
  sessionCalls: 0,
  sessionTokens: 0,
  totalCalls: 0,
  totalTokens: 0,
};

export const useApiMonitor = (): ApiMonitorStatus => {
  const [status, setStatus] = useState<ApiMonitorStatus>(INITIAL_STATUS);

  useEffect(() => {
    const unsubscribe = apiMonitor.subscribe((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return status;
};
