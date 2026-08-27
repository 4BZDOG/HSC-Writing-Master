import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// Self-hosted fonts (bundled by Vite) — no Google Fonts request at runtime,
// so the app renders its real typography on restrictive school networks and
// offline. Weights mirror the former fonts.googleapis.com import.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
// Real Inter italics for the weights the UI actually sets `italic` on (display
// headings at 900, marker emphasis at 400–700). Without these the browser
// synthesises a slanted upright — a cramped faux italic — so the marking
// feedback's emphasised prose and headings looked pinched. The @font-face rules
// ship eagerly in the critical CSS; the woff2 files themselves are fetched per
// subset only when italic text is shown (font-display: swap).
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/500-italic.css';
import '@fontsource/inter/600-italic.css';
import '@fontsource/inter/700-italic.css';
import '@fontsource/inter/900-italic.css';
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
