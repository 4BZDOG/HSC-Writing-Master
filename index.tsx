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
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/700.css';
import '@fontsource/newsreader/400-italic.css';
import './index.css';

const rootElement = document.getElementById('root');

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
  } catch (e) {
    console.error('Error during React mounting:', e);
  }
}
