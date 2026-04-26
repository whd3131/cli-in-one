export function normalizeCommandDockDispatchTaskLine(line) {
  return String(line || '')
    .trim()
    .replace(/^(?:[-*+]\s*)?\[[ xX]\]\s*/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .trim();
}

export function parseCommandDockDispatchTasks(value) {
  return String(value || '')
    .split(/\r\n|\r|\n/g)
    .map(normalizeCommandDockDispatchTaskLine)
    .filter(Boolean);
}

export function formatCommandDockTaskTitle(task, fallback) {
  const normalizedTask = String(task || '').replace(/\s+/g, ' ').trim();
  if (!normalizedTask) {
    return fallback;
  }

  return normalizedTask.length > 46 ? `${normalizedTask.slice(0, 46)}...` : normalizedTask;
}
