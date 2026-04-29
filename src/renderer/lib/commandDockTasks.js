export function normalizeCommandDockDispatchTaskLine(line) {
  return String(line || '')
    .trim()
    .replace(/^(?:[-*+]\s*)?\[[ xX]\]\s*/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .trim();
}

function normalizeCommandDockDispatchValue(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function isCommandDockDispatchTaskStart(line) {
  return /^(?:(?:[-*+]\s*)?\[[ xX]\]|[-*+]|\d+[.)])\s+\S/.test(String(line || '').trim());
}

function splitCommandDockDispatchTaskList(value) {
  const lines = value.split('\n');
  const firstNonEmptyLine = lines.find((line) => line.trim());
  const taskStartCount = lines.filter(isCommandDockDispatchTaskStart).length;
  if (!firstNonEmptyLine || !isCommandDockDispatchTaskStart(firstNonEmptyLine) || taskStartCount < 2) {
    return null;
  }

  const tasks = [];
  let current = [];

  for (const line of lines) {
    if (isCommandDockDispatchTaskStart(line)) {
      if (current.some((item) => item.trim())) {
        tasks.push(current.join('\n'));
      }
      current = [normalizeCommandDockDispatchTaskLine(line)];
      continue;
    }

    if (current.length > 0 || line.trim()) {
      current.push(line);
    }
  }

  if (current.some((line) => line.trim())) {
    tasks.push(current.join('\n'));
  }

  return tasks
    .map((task) => task.trim())
    .filter(Boolean);
}

export function parseCommandDockDispatchTasks(value) {
  const normalizedValue = normalizeCommandDockDispatchValue(value);
  if (!normalizedValue) {
    return [];
  }

  const taskList = splitCommandDockDispatchTaskList(normalizedValue);
  if (taskList && taskList.length > 0) {
    return taskList;
  }

  const singleTask = normalizeCommandDockDispatchTaskLine(normalizedValue);
  return singleTask ? [singleTask] : [];
}

export function formatCommandDockTaskTitle(task, fallback) {
  const normalizedTask = String(task || '').replace(/\s+/g, ' ').trim();
  if (!normalizedTask) {
    return fallback;
  }

  return normalizedTask.length > 46 ? `${normalizedTask.slice(0, 46)}...` : normalizedTask;
}
