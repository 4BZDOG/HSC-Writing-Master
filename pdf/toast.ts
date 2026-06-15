// pdf/toast.ts
//
// Minimal self-contained toast used only when the host app does not supply its
// own `showToast`. Keeps the PDF module from ever failing silently.

import { ToastFn } from './types';

const COLORS: Record<string, string> = {
  success: '#059669',
  error: '#dc2626',
  info: '#4f46e5',
};

/** A DOM-injecting toast that degrades to console in non-DOM environments. */
export const domToast: ToastFn = (message, type = 'info') => {
  if (typeof document === 'undefined') {
    // eslint-disable-next-line no-console
    console[type === 'error' ? 'error' : 'log'](`[PDF] ${message}`);
    return;
  }
  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '99999',
    padding: '12px 18px',
    borderRadius: '12px',
    background: COLORS[type] ?? COLORS.info,
    color: '#fff',
    font: '600 13px/1.4 Inter, system-ui, sans-serif',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    maxWidth: '90vw',
    transition: 'opacity .3s ease',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  }, 4200);
};
