import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useUpdateAvailable } from '../hooks/useUpdateAvailable';

/**
 * Quiet "a newer version is available" notice. Renders nothing until the
 * server reports a different build than the one this tab loaded, so it is safe
 * to mount unconditionally. Drafts autosave to the device, which the copy says
 * outright: the worry on a writing app is losing work, not seeing a spinner.
 */
const UpdateAvailableBanner: React.FC = () => {
  const { updateAvailable, dismiss } = useUpdateAvailable();
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="relative z-40 flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-sky-500/10 light:bg-sky-50 border border-sky-500/40 light:border-sky-400 shadow-lg animate-fade-in"
    >
      <div className="w-8 h-8 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
        <RefreshCw className="w-4 h-4 text-sky-400 light:text-sky-700" aria-hidden="true" />
      </div>
      <p className="flex-1 min-w-[200px] text-sm text-sky-100 light:text-sky-900 leading-relaxed">
        A new version of HSC AI Evaluator is available. Your drafts are saved on this device, so
        refreshing won't lose any writing.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 sm:min-h-0 t-label flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-slate-950 shadow-sm hover:brightness-110 active:scale-[0.98] transition-all"
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        Refresh now
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss update notice"
        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg text-sky-200 light:text-sky-800 hover:bg-sky-500/20 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default UpdateAvailableBanner;
