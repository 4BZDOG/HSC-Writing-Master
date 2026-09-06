import React, { useEffect, useState, useRef } from 'react';
import type { ToastType } from '../hooks/useToast';
import { CheckCircle, XCircle, Info, X, AlertTriangle } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  type?: ToastType;
  duration?: number;
  /** Something to do about what this says. Dismisses the toast when taken. */
  action?: { label: string; onClick: () => void };
}

/*
 * The light-theme shade is 700, not 600, and all four move together.
 *
 * `iconColor` paints the icon AND the toast's own title (an `h4.t-label`), so
 * it is body-sized text on a near-white surface and owes 4.5:1. Measured
 * against rgb(254,255,255): emerald-600 3.76, amber-600 3.18, sky-600 4.09 —
 * three of the four titles were below AA, and only red-600 (4.82) cleared it,
 * barely. At 700 they read 5.47, 5.01, 5.92 and 6.46.
 *
 * Red moves with them although it passed. The four are one set of chrome and a
 * student meets them in the same corner of the same screen; leaving one a step
 * lighter than its siblings makes the error toast look quieter than the
 * warning, which is backwards.
 *
 * The dark-theme 400s are untouched — they sit on a near-black surface and
 * already measure 8:1 and better. Gated by tests/e2e/light-theme.spec.ts,
 * which is what caught the sky one.
 */
const toastConfig = {
  success: {
    containerClass: 'bg-[rgb(var(--color-bg-surface))]/90 border-emerald-500/30',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    progressBar: 'bg-emerald-500',
    icon: <CheckCircle className="h-5 w-5" />,
    title: 'Success',
  },
  error: {
    containerClass: 'bg-[rgb(var(--color-bg-surface))]/90 border-red-500/30',
    iconColor: 'text-red-700 dark:text-red-400',
    iconBg: 'bg-red-500/10',
    progressBar: 'bg-red-500',
    icon: <XCircle className="h-5 w-5" />,
    title: 'Error',
  },
  warning: {
    containerClass: 'bg-[rgb(var(--color-bg-surface))]/90 border-amber-500/30',
    iconColor: 'text-amber-700 dark:text-amber-400',
    iconBg: 'bg-amber-500/10',
    progressBar: 'bg-amber-500',
    icon: <AlertTriangle className="h-5 w-5" />,
    title: 'Warning',
  },
  info: {
    containerClass: 'bg-[rgb(var(--color-bg-surface))]/90 border-sky-500/30',
    iconColor: 'text-sky-700 dark:text-sky-400',
    iconBg: 'bg-sky-500/10',
    progressBar: 'bg-sky-500',
    icon: <Info className="h-5 w-5" />,
    title: 'Information',
  },
};

const Toast: React.FC<ToastProps> = ({
  message,
  onClose,
  type = 'info',
  duration = 5000,
  action,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [remaining, setRemaining] = useState(duration);
  const lastUpdateRef = useRef(Date.now());

  const config = toastConfig[type] || toastConfig.info;

  // Errors and warnings interrupt (assertive/alert); routine success and info
  // announce politely so they never cut across what a screen reader is saying.
  const isUrgent = type === 'error' || type === 'warning';

  // Timer logic that supports pausing
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused) {
        const now = Date.now();
        const delta = now - lastUpdateRef.current;
        setRemaining((prev) => Math.max(0, prev - delta));
        lastUpdateRef.current = now;
      } else {
        // While paused, just update the reference timestamp so we don't jump when unpaused
        lastUpdateRef.current = Date.now();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isPaused]);

  // Dismiss from an effect, never from inside the setRemaining updater —
  // React may run updaters during render, and calling onClose (a parent
  // setState) there triggers "Cannot update a component while rendering".
  useEffect(() => {
    if (remaining <= 0) onClose();
  }, [remaining, onClose]);

  const progressPercent = Math.max(0, (remaining / duration) * 100);

  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`
        relative w-full sm:w-[380px] max-w-full sm:max-w-[90vw] overflow-hidden rounded-xl
        backdrop-blur-xl border shadow-lg shadow-black/20
        animate-toast-entry
        ${config.containerClass}
        group
      `}
    >
      <div className="p-4 flex items-start gap-3 relative z-10">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${config.iconBg} ${config.iconColor}`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-grow pt-0.5 min-w-0">
          <h4 className={`t-label ${config.iconColor} mb-1`}>{config.title}</h4>
          <p className="text-sm font-medium text-[rgb(var(--color-text-primary))] leading-relaxed break-words">
            {message}
          </p>
          {action && (
            <button
              type="button"
              onClick={() => {
                // Taken, so the toast has done its job — leaving it counting
                // down over whatever the action just opened is only noise.
                onClose();
                action.onClick();
              }}
              className={`mt-2.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${config.iconBg} ${config.iconColor} border-current/25 hover:brightness-125`}
            >
              {action.label}
            </button>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close notification"
          className="
            flex-shrink-0 p-1.5 rounded-lg -mt-1 -mr-1
            text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]
            hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-200
          "
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-[rgb(var(--color-bg-surface-inset))]">
        <div
          className={`h-full transition-all duration-100 ease-linear ${config.progressBar}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default Toast;
