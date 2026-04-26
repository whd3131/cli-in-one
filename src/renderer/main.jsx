import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App.jsx';

const settingsKey = 'cli-in-one.settings.v3';

function resolveInitialTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return saved.theme === 'light' ? 'light' : 'dark';
  } catch {
    localStorage.removeItem(settingsKey);
    return 'dark';
  }
}

document.documentElement.classList.toggle('dark', resolveInitialTheme() === 'dark');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
