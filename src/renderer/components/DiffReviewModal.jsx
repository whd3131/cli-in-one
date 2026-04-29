import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  FileDiff,
  RefreshCw,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const bridge = window.cliBridge;

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function getAgentName(agent) {
  return String(agent?.name || '').trim();
}

function getDefaultAgentId(agents, preferredAgentId) {
  const normalizedPreferredId = String(preferredAgentId || '').trim();
  if (normalizedPreferredId && agents.some((agent) => agent.id === normalizedPreferredId)) {
    return normalizedPreferredId;
  }

  const interactiveReviewAgent = agents.find((agent) => {
    const haystack = [
      agent.id,
      agent.name,
      agent.instructions
    ].map((value) => String(value || '').toLowerCase()).join('\n');

    return haystack.includes('interactive-code-review')
      || haystack.includes('interactive code review')
      || haystack.includes('code review')
      || haystack.includes('代码审查');
  });

  return interactiveReviewAgent?.id || agents[0]?.id || '';
}

function formatSnapshotTime(value, language) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return new Date(value).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getDiffLineKind(line) {
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
    return 'meta';
  }
  if (line.startsWith('@@')) {
    return 'hunk';
  }
  if (line.startsWith('+')) {
    return 'added';
  }
  if (line.startsWith('-')) {
    return 'removed';
  }
  return 'context';
}

function DiffCode({ emptyMessage, text }) {
  const lines = useMemo(() => {
    const normalized = normalizeText(text);
    return normalized ? normalized.split('\n') : [];
  }, [text]);

  if (lines.length === 0) {
    return <div className="diff-review-diff-empty">{emptyMessage}</div>;
  }

  return (
    <div className="diff-review-code" role="region" aria-label="Git diff">
      {lines.map((line, index) => (
        <div
          className={cn('diff-review-code-line', `is-${getDiffLineKind(line)}`)}
          key={`${index}-${line.slice(0, 32)}`}
        >
          <span className="diff-review-code-line-number">{index + 1}</span>
          <code>{line || ' '}</code>
        </div>
      ))}
    </div>
  );
}

export function DiffReviewModal({
  agents,
  cwd,
  defaultAgentId,
  language,
  onClose,
  onOpenAgents,
  onSubmitReview,
  open,
  t
}) {
  const safeAgents = useMemo(
    () => (Array.isArray(agents) ? agents.filter((agent) => agent?.id) : []),
    [agents]
  );
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [comments, setComments] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const selectedAgent = useMemo(
    () => safeAgents.find((agent) => agent.id === selectedAgentId) || null,
    [safeAgents, selectedAgentId]
  );
  const agentOptions = useMemo(() => safeAgents.map((agent) => ({
    label: getAgentName(agent) || agent.id,
    value: agent.id
  })), [safeAgents]);
  const diffText = snapshot?.text || '';
  const statusText = normalizeText(snapshot?.status);
  const stagedStat = normalizeText(snapshot?.stagedStat);
  const unstagedStat = normalizeText(snapshot?.unstagedStat);
  const hasChanges = Boolean(statusText || stagedStat || unstagedStat || normalizeText(snapshot?.stagedDiff) || normalizeText(snapshot?.unstagedDiff));
  const generatedAt = formatSnapshotTime(snapshot?.generatedAt, language);
  const canSubmit = Boolean(selectedAgent && comments.trim());

  const loadDiff = useCallback(async () => {
    const requestedCwd = String(cwd || '').trim();
    if (!requestedCwd) {
      setSnapshot(null);
      setStatus('error');
      setError(t('diffReviewNoWorkspace'));
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const nextSnapshot = await bridge.readWorkspaceDiff({ cwd: requestedCwd });
      setSnapshot(nextSnapshot || null);
      setStatus('ready');
    } catch (loadError) {
      setSnapshot(null);
      setStatus('error');
      setError(loadError?.message || t('diffReviewLoadFailed'));
    }
  }, [cwd, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setComments('');
    setSelectedAgentId((current) => {
      const currentStillValid = current && safeAgents.some((agent) => agent.id === current);
      return currentStillValid ? current : getDefaultAgentId(safeAgents, defaultAgentId);
    });
  }, [defaultAgentId, open, safeAgents]);

  useEffect(() => {
    if (open) {
      void loadDiff();
    }
  }, [loadDiff, open]);

  const copyDiff = useCallback(() => {
    const text = normalizeText(diffText);
    if (!text) {
      return;
    }

    bridge.writeClipboardText(text);
  }, [diffText]);

  const submitReview = useCallback(() => {
    if (!selectedAgent || !comments.trim()) {
      return;
    }

    onSubmitReview?.({
      agent: selectedAgent,
      comments: comments.trim(),
      snapshot
    });
  }, [comments, onSubmitReview, selectedAgent, snapshot]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onClose?.();
      }
    }}>
      <DialogContent id="diffReviewDialog" className="diff-review-dialog p-0">
        <DialogHeader className="diff-review-header pr-12">
          <DialogTitle className="diff-review-title">
            <FileDiff className="h-4 w-4 text-primary" />
            <span>{t('diffReviewTitle')}</span>
          </DialogTitle>
          <DialogDescription className="diff-review-description">
            {t('diffReviewDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="diff-review-toolbar">
          <div className="diff-review-path" title={snapshot?.repositoryRoot || cwd || ''}>
            {snapshot?.repositoryRoot || cwd || t('diffReviewNoWorkspace')}
          </div>
          <div className="diff-review-toolbar-actions">
            {generatedAt && <span className="diff-review-generated">{t('diffReviewUpdatedAt', { time: generatedAt })}</span>}
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2" onClick={loadDiff} disabled={status === 'loading'}>
              <RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} />
              {t('refresh')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2" onClick={copyDiff} disabled={!diffText}>
              <Copy className="h-3.5 w-3.5" />
              {t('diffReviewCopyDiff')}
            </Button>
          </div>
        </div>

        <div className="diff-review-body">
          <section className="diff-review-main" aria-label={t('diffReviewDiffLabel')}>
            {status === 'loading' ? (
              <div className="diff-review-state">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{t('diffReviewLoading')}</span>
              </div>
            ) : status === 'error' ? (
              <div className="diff-review-state is-error">
                <AlertCircle className="h-4 w-4" />
                <span>{error || t('diffReviewLoadFailed')}</span>
              </div>
            ) : hasChanges ? (
              <DiffCode emptyMessage={t('diffReviewNoDiffBody')} text={diffText} />
            ) : (
              <div className="diff-review-state">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t('diffReviewClean')}</span>
              </div>
            )}
          </section>

          <aside className="diff-review-side" aria-label={t('diffReviewCommentsLabel')}>
            <div className="diff-review-summary">
              <div className="diff-review-summary-title">{t('diffReviewSummary')}</div>
              <pre className={cn('diff-review-summary-block', !statusText && 'is-empty')}>
                {statusText || t('diffReviewStatusEmpty')}
              </pre>
              {(stagedStat || unstagedStat) && (
                <pre className="diff-review-summary-block">
                  {[stagedStat && `${t('diffReviewStaged')}\n${stagedStat}`, unstagedStat && `${t('diffReviewUnstaged')}\n${unstagedStat}`].filter(Boolean).join('\n\n')}
                </pre>
              )}
            </div>

            <div className="diff-review-agent-field">
              <label className="diff-review-field-label" htmlFor="diffReviewAgent">
                <Bot className="h-3.5 w-3.5" />
                {t('diffReviewAgent')}
              </label>
              <Select
                id="diffReviewAgent"
                disabled={safeAgents.length === 0}
                onValueChange={setSelectedAgentId}
                options={agentOptions}
                placeholder={t('diffReviewAgentPlaceholder')}
                value={selectedAgentId}
              />
              {safeAgents.length === 0 && (
                <Button type="button" variant="outline" size="sm" className="h-8 justify-start" onClick={onOpenAgents}>
                  <Bot className="h-3.5 w-3.5" />
                  {t('diffReviewOpenAgents')}
                </Button>
              )}
            </div>

            <div className="diff-review-comments-field">
              <label className="diff-review-field-label" htmlFor="diffReviewComments">
                {t('diffReviewCommentsLabel')}
              </label>
              <Textarea
                id="diffReviewComments"
                className="diff-review-comments"
                onChange={(event) => setComments(event.target.value)}
                placeholder={t('diffReviewCommentsPlaceholder')}
                value={comments}
              />
            </div>
          </aside>
        </div>

        <DialogFooter className="diff-review-footer">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" variant="primary" onClick={submitReview} disabled={!canSubmit}>
            <Send className="h-4 w-4" />
            {t('diffReviewSend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
