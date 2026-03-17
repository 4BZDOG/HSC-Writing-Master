import React from 'react';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { useApiStatus } from '../hooks/useApiStatus';
import { ERROR_THRESHOLD } from '../services/geminiService';

const ApiHealthIndicator: React.FC = () => {
  const { state, errorCount } = useApiStatus();

  const config = {
    HEALTHY: {
      Icon: Wifi,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/5',
      borderColor: 'border-emerald-500/20',
      shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.05)]',
      title: 'API Connection: Healthy',
      content: null,
      animation: 'hover:scale-105',
    },
    DEGRADED: {
      Icon: AlertTriangle,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20',
      shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.05)]',
      title: `API Connection: Unstable. ${errorCount}/${ERROR_THRESHOLD} recent errors.`,
      content: <span className="text-[9px] font-bold">{errorCount}</span>,
      animation: 'animate-pulse',
    },
    BLOCKED: {
      Icon: WifiOff,
      color: 'text-red-400',
      bgColor: 'bg-red-500/5',
      borderColor: 'border-red-500/20',
      shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.05)]',
      title: 'API Connection: Blocked. See banner for details.',
      content: <span className="text-[9px] font-bold">!</span>,
      animation: '',
    },
  }[state];

  if (!config) return null;

  return (
    <div
      className={`
        fixed bottom-4 left-4 z-[500] 
        flex items-center justify-center w-9 h-9 rounded-full 
        backdrop-blur-md border 
        transition-all duration-300 
        ${config.bgColor} ${config.borderColor} ${config.shadow} ${config.animation}
      `}
      title={config.title}
      role="status"
    >
      <config.Icon className={`w-4 h-4 ${config.color}`} />

      {config.content && (
        <div
          className={`
            absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full text-white shadow-sm border border-white/10
            ${state === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500'}
        `}
        >
          {config.content}
        </div>
      )}
    </div>
  );
};

export default ApiHealthIndicator;
