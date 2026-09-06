import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// Self-hosted fonts (bundled by Vite) — no Google Fonts request at runtime,
// so the app renders its real typography on restrictive school networks and
// offline.
//
// The interface face is IBM Plex Sans, taken as its variable font rather than a
// stack of static weights. One file carries the whole 100-700 axis, which is
// both fewer requests and less weight than the twelve Inter faces it replaces:
// 96KB of latin against 289KB. The italic axis is a second file, fetched only
// when italic text is shown, because the marking feedback's emphasis and the
// display headings need real italics rather than a slanted upright.
//
// The axis stops at 700. See `tailwind.config.js` for what that costs and how
// the weight ladder absorbs it.
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource-variable/ibm-plex-sans/wght-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/700.css';
import '@fontsource/newsreader/400-italic.css';
import './index.css';

/**
 * A chunk that fails to load is almost always a stale `index.html`: the browser
 * cached it from an earlier deploy, so it asks for hashed filenames the server
 * no longer has. Vite raises `vite:preloadError` for exactly this. Reload once,
 * cache-busted — a second attempt would loop, so the flag in sessionStorage
 * makes sure the boot watchdog in index.html gets to explain instead.
 */
const RELOAD_FLAG = 'band6:stale-chunk-reload';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  let alreadyTried = true;
  try {
    alreadyTried = window.sessionStorage.getItem(RELOAD_FLAG) === '1';
    if (!alreadyTried) window.sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* sessionStorage unavailable — do not reload, or it could loop forever. */
  }
  if (!alreadyTried) {
    const base = window.location.pathname.replace(/index\.html$/, '');
    window.location.replace(`${base}?fresh=${Date.now()}`);
  }
});

const rootElement = document.getElementById('root');

/** Tells the boot watchdog in index.html that React really did render. */
const signalBootOk = () => {
  try {
    (window as unknown as { __band6BootOk?: () => void }).__band6BootOk?.();
    window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* nothing to do — the watchdog only ever adds a message, never removes UI */
  }
};

if (!rootElement) {
  console.error("Fatal Error: 'root' element not found in DOM. Cannot mount React application.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    // After paint: a synchronous call here would fire before React has
    // committed, so a render that throws would still count as a good boot.
    requestAnimationFrame(() => requestAnimationFrame(signalBootOk));
  } catch (e) {
    console.error('Error during React mounting:', e);
  }
}
