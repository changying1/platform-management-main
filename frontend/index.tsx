import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { API_BASE_URL } from './src/api/config';

declare global {
  interface Window {
    __frontendErrorReporterInstalled?: boolean;
  }
}

const shouldReportFrontendErrors = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('systemSettings') || '{}');
    return settings.logErrorReport !== false;
  } catch {
    return true;
  }
};

const reportFrontendError = (payload: Record<string, unknown>) => {
  if (!shouldReportFrontendErrors()) return;
  const url = `${API_BASE_URL.replace(/\/$/, '')}/logs/frontend-error`;
  const body = JSON.stringify({
    ...payload,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    // Error reporting must never break the app.
  }
};

if (!window.__frontendErrorReporterInstalled) {
  window.__frontendErrorReporterInstalled = true;
  window.addEventListener('error', (event) => {
    reportFrontendError({
      type: 'error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportFrontendError({
      type: 'unhandledrejection',
      message: String(event.reason?.message || event.reason || 'Unhandled promise rejection'),
      stack: event.reason?.stack,
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
