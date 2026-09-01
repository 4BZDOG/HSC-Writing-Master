import React from 'react';
import { Wifi, AlertTriangle } from 'lucide-react';
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
      content: <span className="text-[9px] font-bold text-amber-950">{errorCount}</span>,
      animation: 'animate-pulse',
    },
    // The BLOCKED state is deliberately absent: the guard sets `state: 'BLOCKED'`
    // and `isBlocked: true` together (services/aiCore.ts), so whenever the
    // connection is blocked the full ApiStatusIndicator banner is already on
    // screen — assertive, with the reason and a resume countdown. This corner
    // dot rendering "Blocked. See banner for details." only duplicated it, and
    // that hint lived in a `title` tooltip no touch user could reach. So the
    // banner owns BLOCKED; the dot covers HEALTHY and DEGRADED only.
  }[state];

  if (!config) return null;

  return (
    <div
      className={`
        fixed bottom-4 left-4 z-overlay-status
        flex items-center justify-center w-9 h-9 rounded-full
        backdrop-blur-md border
        transition-all duration-300
        ${config.bgColor} ${config.borderColor} ${config.shadow} ${config.animation}
      `}
      title={config.title}
      aria-label={config.title}
      role="status"
    >
      <config.Icon className={`w-4 h-4 ${config.color}`} />

      {config.content && (
        <div
          className="
            absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full shadow-sm border border-white/10
            bg-amber-500
        "
        >
          {config.content}
        </div>
      )}
    </div>
  );
};

export default ApiHealthIndicator;
