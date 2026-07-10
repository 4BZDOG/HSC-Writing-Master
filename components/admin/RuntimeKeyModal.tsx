import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  KeyRound,
  Eye,
  EyeOff,
  Trash2,
  Check,
  ShieldAlert,
  Cpu,
  ExternalLink,
} from 'lucide-react';
import {
  getRuntimeKeys,
  setRuntimeKeys,
  clearRuntimeKeys,
  subscribeRuntimeKeys,
} from '../../services/runtimeKeys';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import AiEngineSelector from './AiEngineSelector';

interface RuntimeKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const maskKey = (key?: string): string => {
  if (!key) return 'not set';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
};

/**
 * Admin-only modal to paste AI provider keys at RUNTIME for local testing,
 * without editing `.env.local` and restarting. The keys ride along as a
 * per-request override to the proxy (services/runtimeKeys.ts) and are held in
 * sessionStorage only — they never replace the server key for other users and
 * never bypass the proxy's auth/quota gates. The "AI Engine" selector — which
 * MODEL each key drives — is rendered here too (and mirrored in the API
 * telemetry widget), so keys and engine choice live in one place.
 */
const RuntimeKeyModal: React.FC<RuntimeKeyModalProps> = ({ isOpen, onClose, showToast }) => {
  const current = useSyncExternalStore(subscribeRuntimeKeys, getRuntimeKeys, getRuntimeKeys);
  const [gemini, setGemini] = useState('');
  const [anthropic, setAnthropic] = useState('');
  const [openrouter, setOpenrouter] = useState('');
  const [groq, setGroq] = useState('');
  const [reveal, setReveal] = useState(false);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!gemini.trim() && !anthropic.trim() && !openrouter.trim() && !groq.trim()) {
      showToast('Enter at least one key, or use Clear to remove the current keys.', 'error');
      return;
    }
    setRuntimeKeys({
      gemini: gemini.trim() || current.gemini,
      anthropic: anthropic.trim() || current.anthropic,
      openrouter: openrouter.trim() || current.openrouter,
      groq: groq.trim() || current.groq,
    });
    setGemini('');
    setAnthropic('');
    setOpenrouter('');
    setGroq('');
    showToast('Runtime keys saved for this browser tab.', 'success');
  };

  const handleClear = () => {
    clearRuntimeKeys();
    setGemini('');
    setAnthropic('');
    setOpenrouter('');
    setGroq('');
    showToast('Runtime keys cleared — the server key applies again.', 'info');
  };

  const inputType = reveal ? 'text' : 'password';
  const fieldClass =
    'w-full text-sm rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 px-3 py-2 pr-10 font-mono outline-none focus:border-[rgb(var(--color-accent))]/60';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 shadow-lg flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                Runtime AI Keys
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                Paste a provider key to test the models without a restart
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
          {/* Warning */}
          <div className="flex gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 light:text-amber-700">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              For <strong>local testing only</strong>. The key is held in this browser tab
              (sessionStorage, cleared when the tab closes) and sent to the proxy per request — less
              safe than <code className="font-mono">.env.local</code>, which stays server-side. It
              does not lift the sign-in or daily-quota limits.
            </p>
          </div>

          {/* Gemini */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
              Gemini API key
            </span>
            <span className="ml-2 text-[10px] font-mono text-[rgb(var(--color-text-dim))] light:text-slate-400">
              current: {maskKey(current.gemini)}
            </span>
            <div className="relative mt-1">
              <input
                type={inputType}
                autoComplete="off"
                aria-label="Gemini API key"
                placeholder={current.gemini ? 'leave blank to keep current' : 'AIza…'}
                value={gemini}
                onChange={(e) => setGemini(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide keys' : 'Show keys'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]"
              >
                {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          {/* Anthropic */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
              Anthropic (Claude) API key
            </span>
            <span className="ml-2 text-[10px] font-mono text-[rgb(var(--color-text-dim))] light:text-slate-400">
              optional · current: {maskKey(current.anthropic)}
            </span>
            <div className="relative mt-1">
              <input
                type={inputType}
                autoComplete="off"
                aria-label="Anthropic API key"
                placeholder={current.anthropic ? 'leave blank to keep current' : 'sk-ant-…'}
                value={anthropic}
                onChange={(e) => setAnthropic(e.target.value)}
                className={fieldClass}
              />
            </div>
          </label>

          {/* OpenRouter */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
              OpenRouter API key
            </span>
            <span className="ml-2 text-[10px] font-mono text-[rgb(var(--color-text-dim))] light:text-slate-400">
              optional · current: {maskKey(current.openrouter)}
            </span>
            <div className="relative mt-1">
              <input
                type={inputType}
                autoComplete="off"
                aria-label="OpenRouter API key"
                placeholder={current.openrouter ? 'leave blank to keep current' : 'sk-or-…'}
                value={openrouter}
                onChange={(e) => setOpenrouter(e.target.value)}
                className={fieldClass}
              />
            </div>
            <span className="mt-1 flex items-center gap-1 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
              One key runs GLM, DeepSeek, Qwen, Llama and more —
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[rgb(var(--color-accent))] hover:underline"
              >
                get one at openrouter.ai <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </label>

          {/* Groq */}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
              Groq API key
            </span>
            <span className="ml-2 text-[10px] font-mono text-[rgb(var(--color-text-dim))] light:text-slate-400">
              optional · current: {maskKey(current.groq)}
            </span>
            <div className="relative mt-1">
              <input
                type={inputType}
                autoComplete="off"
                aria-label="Groq API key"
                placeholder={current.groq ? 'leave blank to keep current' : 'gsk_…'}
                value={groq}
                onChange={(e) => setGroq(e.target.value)}
                className={fieldClass}
              />
            </div>
            <span className="mt-1 flex items-center gap-1 text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
              Free tier with ultra-fast inference on Llama, Gemma and more —
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[rgb(var(--color-accent))] hover:underline"
              >
                get one at console.groq.com <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </label>

          {/* AI Engine selector — the natural home for choosing which model each
              key drives. Also mirrored in the API telemetry widget (bottom-right). */}
          <div className="pt-4 border-t border-[rgb(var(--color-border-secondary))]/40 light:border-slate-200">
            <AiEngineSelector />
            <p className="mt-2 flex gap-1.5 items-start text-[10px] text-[rgb(var(--color-text-dim))] light:text-slate-400">
              <Cpu className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Gemini, Claude, Groq and the OpenRouter open models all appear here once their key
                is set. The same selector lives in the API usage widget (bottom-right).
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-slate-100 text-[rgb(var(--color-text-muted))] border border-[rgb(var(--color-border-secondary))]/40 light:border-slate-300 hover:text-[rgb(var(--color-text-primary))] text-xs font-bold transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 text-xs font-bold uppercase tracking-wider transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            Save Keys
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RuntimeKeyModal;
