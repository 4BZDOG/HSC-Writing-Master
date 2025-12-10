
import React, { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useApiStatus } from '../hooks/useApiStatus';

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const ApiStatusIndicator: React.FC = () => {
  const { isBlocked, blockedUntil, blockReason } = useApiStatus();
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (isBlocked) {
      const calculateTimeLeft = () => {
        const remaining = Math.max(0, Math.round((blockedUntil - Date.now()) / 1000));
        setTimeLeft(remaining);
      };

      calculateTimeLeft();
      const interval = setInterval(calculateTimeLeft, 1000);

      return () => clearInterval(interval);
    }
  }, [isBlocked, blockedUntil]);

  if (!isBlocked) {
    return null;
  }

  return (
    <div
      className="
        fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] 
        w-full max-w-lg mx-4
        bg-red-950/80 backdrop-blur-xl 
        border border-red-500/40 rounded-2xl 
        shadow-[0_0_30px_rgba(220,38,38,0.3)] 
        flex items-center gap-5 p-5 
        animate-fade-in-up
      "
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-shrink-0 p-3 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
          <ShieldAlert className="w-6 h-6" />
      </div>
      
      <div className="flex-grow min-w-0">
        <h3 className="font-bold text-base text-red-200">API Temporarily Paused</h3>
        <p className="text-xs text-red-300/80 mt-1 leading-relaxed">
          {blockReason || "High error rate detected. Cooling down to prevent API lockout."}
        </p>
      </div>
      
      <div className="flex-shrink-0 text-center pl-4 border-l border-red-500/20">
        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">Resuming</p>
        <p className="font-mono text-xl font-black text-white tracking-tight">
          {formatTime(timeLeft)}
        </p>
      </div>
    </div>
  );
};

export default ApiStatusIndicator;
