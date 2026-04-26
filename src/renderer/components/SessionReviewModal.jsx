import React from 'react';
import {
  Copy,
  Download,
  Maximize2,
  MessageSquarePlus,
  SquareTerminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  formatSessionReviewTime,
  getSessionReviewPreviewText,
  getSessionReviewStatusCounts
} from '@/lib/sessionReview';

function ReviewIconButton({ children, label, ...props }) {
  return (
    <Button size="icon" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}

export function SessionReviewModal({
  activeId,
  commandTargetId,
  getPanelState,
  language,
  onClose,
  onCopyAll,
  onCopySession,
  onExportAll,
  onExportSession,
  onFocusSession,
  onSetCommandTarget,
  open,
  panels,
  records,
  renderProviderBadge,
  renderRuntimeTag,
  renderStatusTag,
  runtimeNow,
  t
}) {
  const visiblePanels = Array.isArray(panels) ? panels : [];
  const counts = getSessionReviewStatusCounts(visiblePanels, runtimeNow, getPanelState);
  const summary = t('sessionReviewSummaryLine', counts);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onClose?.();
      }
    }}>
      <DialogContent
        id="sessionReviewDialog"
        className="session-review-dialog p-0"
      >
        <DialogHeader className="session-review-header pr-12">
          <DialogTitle className="session-review-title">
            <SquareTerminal className="h-4 w-4 text-primary" />
            <span>{t('sessionReviewTitle')}</span>
          </DialogTitle>
          <DialogDescription className="session-review-description">
            {t('sessionReviewDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="session-review-toolbar">
          <div className="session-review-summary" title={summary}>{summary}</div>
          <div className="session-review-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2"
              disabled={visiblePanels.length === 0}
              onClick={onCopyAll}
            >
              <Copy className="h-3.5 w-3.5" />
              {t('sessionReviewCopyAll')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2"
              disabled={visiblePanels.length === 0}
              onClick={onExportAll}
            >
              <Download className="h-3.5 w-3.5" />
              {t('sessionReviewExportAll')}
            </Button>
          </div>
        </div>

        <div className="session-review-body">
          {visiblePanels.length === 0 ? (
            <div className="session-review-empty">{t('sessionReviewEmpty')}</div>
          ) : (
            <div className="session-review-list">
              {visiblePanels.map((panel) => {
                const state = getPanelState(panel, runtimeNow);
                const record = records?.[panel.id] || null;
                const output = getSessionReviewPreviewText(record);
                const updatedAt = formatSessionReviewTime(record?.updatedAt, language);
                const active = panel.id === activeId;
                const commandTargeted = panel.id === commandTargetId;

                return (
                  <article
                    key={panel.id}
                    className={cn(
                      'session-review-card',
                      active && 'is-active',
                      commandTargeted && 'is-command-target'
                    )}
                  >
                    <div className="session-review-card-header">
                      <span className={cn('terminal-endpoint-dot', `is-${state}`)} aria-hidden="true" />
                      <div className="session-review-card-title-wrap">
                        <div className="session-review-card-title" title={panel.title}>{panel.title}</div>
                        <div className="session-review-card-subtitle" title={panel.cwd}>{panel.cwd}</div>
                      </div>
                      <div className="session-review-card-tags">
                        {renderProviderBadge(panel)}
                        {renderStatusTag(panel, state)}
                      </div>
                    </div>

                    <div className="session-review-card-meta">
                      {renderRuntimeTag(panel)}
                      <span className="session-review-updated">
                        {updatedAt ? t('sessionReviewUpdatedAt', { time: updatedAt }) : t('sessionReviewNeverUpdated')}
                      </span>
                    </div>

                    <div className="session-review-output-label">{t('sessionReviewLatestOutput')}</div>
                    <pre className={cn('session-review-output', !output && 'is-empty')}>
                      {output || t('sessionReviewNoOutput')}
                    </pre>

                    <div className="session-review-card-actions">
                      <ReviewIconButton
                        label={t('sessionReviewOpenSession')}
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onFocusSession(panel.id)}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </ReviewIconButton>
                      <ReviewIconButton
                        label={t('sessionReviewSetQuickTarget')}
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onSetCommandTarget(panel.id)}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </ReviewIconButton>
                      <ReviewIconButton
                        label={t('sessionReviewCopyOne')}
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onCopySession(panel.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </ReviewIconButton>
                      <ReviewIconButton
                        label={t('exportSession')}
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onExportSession(panel.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </ReviewIconButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
