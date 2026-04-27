import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App.jsx';

const settingsKey = 'cli-in-one.settings.v3';
const appZoomDefaultFactor = 1;
const appZoomMinFactor = 0.75;
const appZoomMaxFactor = 1.75;

function normalizeAppZoomFactor(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return appZoomDefaultFactor;
  }

  const clamped = Math.min(appZoomMaxFactor, Math.max(appZoomMinFactor, parsed));
  return Math.round(clamped * 100) / 100;
}

function resolveInitialTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return saved.theme === 'light' ? 'light' : 'dark';
  } catch {
    localStorage.removeItem(settingsKey);
    return 'dark';
  }
}

function resolveInitialAppZoomFactor() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return normalizeAppZoomFactor(saved.appZoomFactor);
  } catch {
    localStorage.removeItem(settingsKey);
    return appZoomDefaultFactor;
  }
}

document.documentElement.classList.toggle('dark', resolveInitialTheme() === 'dark');
const initialZoomRequest = window.cliBridge?.setAppZoomFactor?.(resolveInitialAppZoomFactor());
initialZoomRequest?.catch?.(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
