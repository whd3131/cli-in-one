export const sessionReviewTailMaxChars = 24000;
export const sessionReviewPreviewLineCount = 22;

export function stripSessionReviewControlSequences(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Za-z0-9]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '')
    .replace(/[\x00\x07\x0B\x0C\x0E-\x1F]/g, (char) => (
      char === '\n' || char === '\r' || char === '\t' || char === '\b' ? char : ''
    ));
}

export function normalizeSessionReviewText(value) {
  let text = stripSessionReviewControlSequences(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  while (/[^\n]\x08/.test(text)) {
    text = text.replace(/[^\n]\x08/g, '');
  }

  return text.replace(/\x08/g, '');
}

export function appendSessionReviewOutput(record, data, timestamp = Date.now()) {
  const chunk = normalizeSessionReviewText(data);
  if (!chunk) {
    return record || { text: '', updatedAt: timestamp };
  }

  const previousText = String(record?.text || '');
  const nextText = `${previousText}${chunk}`;
  return {
    text: nextText.length > sessionReviewTailMaxChars
      ? nextText.slice(-sessionReviewTailMaxChars)
      : nextText,
    updatedAt: timestamp
  };
}

export function getSessionReviewPreviewText(record, maxLines = sessionReviewPreviewLineCount) {
  const text = String(record?.text || '').trimEnd();
  if (!text) {
    return '';
  }

  return text
    .split('\n')
    .slice(-maxLines)
    .join('\n')
    .trim();
}

export function getSessionReviewStatusCounts(panels, runtimeNow, getPanelState) {
  return (Array.isArray(panels) ? panels : []).reduce((counts, panel) => {
    const state = typeof getPanelState === 'function'
      ? getPanelState(panel, runtimeNow)
      : 'idle';
    return {
      ...counts,
      total: counts.total + 1,
      [state]: (counts[state] || 0) + 1
    };
  }, {
    total: 0,
    running: 0,
    idle: 0,
    completed: 0,
    error: 0
  });
}

export function formatSessionReviewTime(ms, language) {
  if (!Number.isFinite(ms)) {
    return '';
  }

  return new Date(ms).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function buildSessionReviewSummaryText({
  panels,
  records,
  runtimeNow,
  language,
  t,
  getPanelProviderLabel,
  getPanelState,
  getStateLabel
}) {
  const sourcePanels = Array.isArray(panels) ? panels : [];
  const counts = getSessionReviewStatusCounts(sourcePanels, runtimeNow, getPanelState);
  const lines = [
    t('sessionReviewTitle'),
    t('sessionReviewSummaryLine', counts),
    ''
  ];

  sourcePanels.forEach((panel, index) => {
    const state = getPanelState(panel, runtimeNow);
    const provider = getPanelProviderLabel(panel, language);
    const record = records?.[panel.id] || null;
    const output = getSessionReviewPreviewText(record, sessionReviewPreviewLineCount)
      || t('sessionReviewNoOutput');
    const updatedAt = formatSessionReviewTime(record?.updatedAt, language);

    lines.push(`${index + 1}. ${panel.title}`);
    lines.push(`${getStateLabel(state, t)} / ${provider}`);
    lines.push(`CWD: ${panel.cwd}`);
    lines.push(updatedAt ? t('sessionReviewUpdatedAt', { time: updatedAt }) : t('sessionReviewNeverUpdated'));
    lines.push('---');
    lines.push(output);
    lines.push('');
  });

  return lines.join('\n').trim();
}
