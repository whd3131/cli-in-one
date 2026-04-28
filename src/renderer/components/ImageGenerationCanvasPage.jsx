import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  ImagePlus,
  Images,
  Minus,
  Move,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  ZoomIn
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const modelOptions = ['gpt-image-2', 'gpt-image-1'];
const countOptions = [1, 2, 3, 4];
const upscaleOptions = ['', '2k', '4k'];
const aspectOptions = [
  { id: 'auto', size: 'auto', labelKey: 'imageGenerationAspectAuto', ratio: 1 },
  { id: '1:1', size: '1024x1024', label: '1:1', ratio: 1 },
  { id: '3:2', size: '1536x1024', label: '3:2', ratio: 3 / 2 },
  { id: '2:3', size: '1024x1536', label: '2:3', ratio: 2 / 3 },
  { id: '4:3', size: '1024x768', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', size: '768x1024', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', size: '1792x1024', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', size: '1024x1792', label: '9:16', ratio: 9 / 16 }
];

const imageGenerationToolFrames = [
  { id: 'remove-bg', title: 'remove.bg', url: 'https://www.remove.bg/zh' },
  { id: 'tinypng', title: 'TinyPNG', url: 'https://tinypng.com/cn/' },
  { id: 'png-to-webp', title: 'PNG to WebP', url: 'https://picflow.com/convert/png-to-webp' },
  { id: 'png-to-ico', title: 'PNG to ICO', url: 'https://picflow.com/convert/png-to-ico' }
];

const imageGenerationToolPanelHeight = 260;
const imageGenerationResultStartY = imageGenerationToolPanelHeight + 60;
const imageGenerationReferenceImageMaxCount = 6;

const failedStatuses = new Set([
  'cancelled',
  'canceled',
  'error',
  'failed',
  'rejected',
  'timeout',
  'timed_out'
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = String(file.type || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  return /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(String(file.name || '').trim());
}

function extractImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return [];
  }

  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item?.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file) => file && isImageFile(file));
  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(dataTransfer.files || []).filter((file) => isImageFile(file));
}

function normalizeReferenceImageItem(item) {
  const path = String(item?.path || item?.normalizedPath || '').trim();
  const normalizedPath = String(item?.normalizedPath || path).replace(/\\/g, '/');
  if (!path && !normalizedPath) {
    return null;
  }

  const name = String(
    item?.name
    || normalizedPath.split('/').filter(Boolean).pop()
    || path.split(/[\\/]/).filter(Boolean).pop()
    || ''
  ).trim();

  return {
    id: String(item?.id || `${normalizedPath || path}-${Date.now()}`).trim(),
    name,
    normalizedPath,
    path: path || normalizedPath,
    url: String(item?.url || '').trim()
  };
}

function bindPointerSession(onPointerMove, onPointerEnd) {
  let active = true;

  const handlePointerMove = (event) => {
    if (active) {
      onPointerMove(event);
    }
  };

  const finish = () => {
    if (!active) {
      return;
    }

    active = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    onPointerEnd?.();
  };

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);

  return finish;
}

function createDefaultImageCanvasView() {
  return { x: 430, y: 96, scale: 1 };
}

function normalizeCount(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? clamp(count, 1, 4) : 1;
}

function normalizeUpscale(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '2k' || normalized === '4k' ? normalized : '';
}

function normalizeSize(value) {
  return String(value || '1024x1024').trim() || '1024x1024';
}

function getAspectOption(size) {
  const normalizedSize = normalizeSize(size).toLowerCase();
  return aspectOptions.find((option) => option.size.toLowerCase() === normalizedSize) || null;
}

function getAspectRatioFromSize(size) {
  const option = getAspectOption(size);
  if (option) {
    return option.ratio;
  }

  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(normalizeSize(size));
  if (!match) {
    return 1;
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  return width > 0 && height > 0 ? clamp(width / height, 0.45, 2.4) : 1;
}

function getReducedRatioLabel(size) {
  const option = getAspectOption(size);
  if (option) {
    return option.label || option.id;
  }

  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(normalizeSize(size));
  if (!match) {
    return normalizeSize(size);
  }

  let width = Number.parseInt(match[1], 10);
  let height = Number.parseInt(match[2], 10);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  width /= divisor;
  height /= divisor;
  return `${width}:${height}`;
}

function getItemStatus(item) {
  return String(item?.status || (item?.kind === 'task' ? 'queued' : 'success')).trim().toLowerCase();
}

function getItemFlags(item) {
  const status = getItemStatus(item);
  const failed = failedStatuses.has(status);
  return {
    failed,
    pending: item?.kind === 'task' && !failed && status !== 'success'
  };
}

function getItemTimestamp(item) {
  const candidates = [item?.updatedAt, item?.finishedAt, item?.createdAt];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function compareImageGenerationHistoryItems(left, right) {
  const timeDiff = getItemTimestamp(right) - getItemTimestamp(left);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const rightPending = getItemFlags(right).pending ? 1 : 0;
  const leftPending = getItemFlags(left).pending ? 1 : 0;
  if (rightPending !== leftPending) {
    return rightPending - leftPending;
  }

  const rightImage = right?.kind === 'image' ? 1 : 0;
  const leftImage = left?.kind === 'image' ? 1 : 0;
  if (rightImage !== leftImage) {
    return rightImage - leftImage;
  }

  return String(right?.id || '').localeCompare(String(left?.id || ''));
}

function getHistoryGroupId(item) {
  return String(item?.taskId || item?.id || '').trim();
}

function formatHistoryTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  return new Date(timestamp).toLocaleString(undefined, {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatHistoryPayload(payload) {
  if (payload === null || typeof payload === 'undefined') {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function hasTaskDebugDetails(taskItem) {
  if (!taskItem) {
    return false;
  }

  return Boolean(
    String(taskItem.taskId || '').trim()
    || String(taskItem.error || '').trim()
    || (Array.isArray(taskItem.pollEvents) && taskItem.pollEvents.length > 0)
    || taskItem.successPayload !== null
    || taskItem.failurePayload !== null
  );
}

function buildImageGenerationHistoryGroups(items = []) {
  const groups = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = getHistoryGroupId(item);
    if (!id) {
      return;
    }

    const prompt = String(item?.prompt || '').trim();
    const createdAt = Number(item?.createdAt);
    const timestamp = getItemTimestamp(item);
    const existing = groups.get(id) || {
      id,
      items: [],
      prompt: '',
      latestAt: 0,
      createdAt: Number.POSITIVE_INFINITY
    };

    existing.items.push(item);
    existing.latestAt = Math.max(existing.latestAt, timestamp);
    if (Number.isFinite(createdAt) && createdAt > 0) {
      existing.createdAt = Math.min(existing.createdAt, createdAt);
    }
    if (!existing.prompt && prompt) {
      existing.prompt = prompt;
    }

    groups.set(id, existing);
  });

  return Array.from(groups.values())
    .map((group) => {
      const sortedItems = [...group.items].sort(compareImageGenerationHistoryItems);
      const imageItems = sortedItems.filter((item) => item?.kind === 'image');
      const taskItem = sortedItems.find((item) => item?.kind === 'task') || null;
      const primaryItem = imageItems[0] || taskItem || sortedItems[0] || null;
      const taskFlags = taskItem ? getItemFlags(taskItem) : { failed: false, pending: false };
      let status = 'success';
      if (taskFlags.pending) {
        status = 'pending';
      } else if (taskFlags.failed && imageItems.length === 0) {
        status = 'failed';
      }

      return {
        id: group.id,
        createdAt: Number.isFinite(group.createdAt) ? group.createdAt : group.latestAt,
        imageCount: imageItems.length,
        imageItems,
        items: sortedItems,
        latestAt: group.latestAt,
        model: String(primaryItem?.model || '').trim(),
        prompt: group.prompt,
        referenceImageCount: Number.isFinite(Number.parseInt(primaryItem?.referenceImageCount, 10))
          ? Number.parseInt(primaryItem.referenceImageCount, 10)
          : 0,
        requestedCount: Number.isFinite(Number.parseInt(primaryItem?.n, 10))
          ? Number.parseInt(primaryItem.n, 10)
          : 0,
        size: String(primaryItem?.size || '').trim(),
        status,
        taskItem,
        title: String(
          group.prompt
          || primaryItem?.name
          || primaryItem?.normalizedPath
          || primaryItem?.path
          || ''
        ).trim(),
        upscale: String(primaryItem?.upscale || '').trim()
      };
    })
    .sort((left, right) => {
      const timeDiff = right.latestAt - left.latestAt;
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return String(right.id).localeCompare(String(left.id));
    });
}

function getDefaultLayout(slot) {
  const columns = 3;
  const columnWidth = 340;
  const rowHeight = 520;
  return {
    slot,
    x: (slot % columns) * columnWidth,
    y: imageGenerationResultStartY + Math.floor(slot / columns) * rowHeight,
    manual: false
  };
}

function getDefaultToolPanelLayout() {
  return {
    x: 0,
    y: 0
  };
}

function ImageGenerationIconButton({ children, label, ...props }) {
  return (
    <Button size="icon" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}

function ImageGenerationResultCard({
  item,
  position,
  scale,
  onCopyReference,
  onMove,
  onOpenFile,
  onUseAsReference,
  t
}) {
  const [failedPreview, setFailedPreview] = useState(false);

  useEffect(() => {
    setFailedPreview(false);
  }, [item.url]);

  const { failed, pending } = getItemFlags(item);
  const titleText = item.name
    || (failed ? t('imageGenerationTaskFailedTitle') : '')
    || (pending ? t('imageGenerationTaskPending') : '')
    || item.normalizedPath
    || t('imageGenerationResult');
  const detailText = item.normalizedPath
    || (failed ? item.error : '')
    || item.taskId
    || item.prompt;
  const ratioLabel = item.size ? getReducedRatioLabel(item.size) : '';
  const metaItems = [
    item.model,
    ratioLabel ? t('imageGenerationAspectSummary', { ratio: ratioLabel }) : '',
    item.upscale ? t('imageGenerationUpscaleSummary', { value: String(item.upscale).toUpperCase() }) : '',
    item.referenceImageCount ? t('imageGenerationReferenceSummary', { count: item.referenceImageCount }) : '',
    item.kind === 'task' && item.n ? t('imageGenerationRequestedCount', { count: item.n }) : ''
  ].filter(Boolean);
  const title = [titleText, detailText, ...metaItems].filter(Boolean).join('\n');
  const aspectRatio = getAspectRatioFromSize(item.size);

  const startDrag = (event) => {
    if (
      event.button !== 0 ||
      closestElement(event.target, 'button, input, textarea, select, a')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: position?.x || 0,
      y: position?.y || 0
    };

    bindPointerSession((moveEvent) => {
      onMove?.(item.id, {
        x: start.x + (moveEvent.clientX - start.clientX) / scale,
        y: start.y + (moveEvent.clientY - start.clientY) / scale
      });
    });
  };

  return (
    <article
      className={cn('image-generation-card', pending && 'is-pending', failed && 'is-failed')}
      style={{
        '--image-generation-card-x': `${position?.x || 0}px`,
        '--image-generation-card-y': `${position?.y || 0}px`,
        '--image-generation-card-ratio': aspectRatio
      }}
      title={title || undefined}
      onPointerDown={startDrag}
    >
      <div className="image-generation-card-grip" aria-hidden="true">
        <Move className="h-3.5 w-3.5" />
      </div>
      <div className={cn('image-generation-preview', failedPreview && 'is-missing')}>
        {item.url && !failedPreview && !failed ? (
          <img
            alt=""
            draggable="false"
            src={item.url}
            onError={() => setFailedPreview(true)}
          />
        ) : pending ? (
          <div className="image-generation-preview-empty">
            <RefreshCw className="image-generation-preview-icon h-4 w-4 animate-spin" />
            <span>{t('imageGenerationTaskPending')}</span>
          </div>
        ) : failed ? (
          <div className="image-generation-preview-empty">
            {t('imageGenerationTaskFailedTitle')}
          </div>
        ) : (
          <div className="image-generation-preview-empty">
            {t('imageGenerationFileUnavailable')}
          </div>
        )}
      </div>

      <div className="image-generation-card-body">
        <div className="image-generation-card-title">{titleText}</div>
        {detailText && (
          <div className="image-generation-card-path" title={detailText}>
            {detailText}
          </div>
        )}
        {metaItems.length > 0 && (
          <div className="image-generation-card-meta">
            {metaItems.map((meta) => (
              <span key={meta}>{meta}</span>
            ))}
          </div>
        )}
      </div>

      <div className="image-generation-card-actions">
        <ImageGenerationIconButton
          label={t('imageGenerationUseAsReference')}
          variant="ghost"
          className="h-8 w-8"
          disabled={!item.path || pending || failed}
          onClick={() => onUseAsReference?.(item)}
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </ImageGenerationIconButton>
        <ImageGenerationIconButton
          label={t('imageGenerationCopyReference')}
          variant="ghost"
          className="h-8 w-8"
          disabled={!item.normalizedPath}
          onClick={() => onCopyReference?.(item)}
        >
          <Copy className="h-3.5 w-3.5" />
        </ImageGenerationIconButton>
        <ImageGenerationIconButton
          label={t('imageGenerationOpenFile')}
          variant="ghost"
          className="h-8 w-8"
          disabled={!item.path}
          onClick={() => onOpenFile?.(item)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </ImageGenerationIconButton>
      </div>
    </article>
  );
}

function ImageGenerationToolPanel({
  position,
  scale,
  tools,
  onMove,
  t
}) {
  const openImageToolsPage = () => {
    if (window.cliBridge?.openImageToolsPage) {
      window.cliBridge.openImageToolsPage().catch(() => {});
      return;
    }

    window.open('/image-tools.html', '_blank', 'noopener,noreferrer');
  };

  const openExternalToolUrl = (targetUrl) => {
    if (window.cliBridge?.openExternalUrl) {
      window.cliBridge.openExternalUrl(targetUrl).catch(() => {});
      return;
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const startDrag = (event) => {
    if (
      event.button !== 0 ||
      closestElement(event.target, 'button, input, textarea, select, a')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: position?.x || 0,
      y: position?.y || 0
    };

    bindPointerSession((moveEvent) => {
      onMove?.({
        x: start.x + (moveEvent.clientX - start.clientX) / scale,
        y: start.y + (moveEvent.clientY - start.clientY) / scale
      });
    });
  };

  return (
    <article
      className="image-generation-tool-card"
      style={{
        '--image-generation-tool-x': `${position?.x || 0}px`,
        '--image-generation-tool-y': `${position?.y || 0}px`
      }}
    >
      <div className="image-generation-tool-header" onPointerDown={startDrag}>
        <div className="image-generation-tool-title">
          <Move className="h-3.5 w-3.5" />
          <span>{t('imageGenerationToolsTitle')}</span>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="h-7 gap-1.5 px-2"
          title={t('imageGenerationOpenToolsPage')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={openImageToolsPage}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('imageGenerationOpenToolsPage')}
        </Button>
      </div>
      <div className="image-generation-tool-body">
        <div className="image-generation-tool-list">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="image-generation-tool-row"
              title={tool.url}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => openExternalToolUrl(tool.url)}
            >
              <span className="image-generation-tool-row-copy">
                <span className="image-generation-tool-row-title">{tool.title}</span>
                <span className="image-generation-tool-row-url">{tool.url}</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function ImageGenerationReferencePanel({
  disabled,
  inputRef,
  referenceImages,
  onAddFiles,
  onClear,
  onRemove,
  t
}) {
  const [dragOver, setDragOver] = useState(false);
  const images = Array.isArray(referenceImages) ? referenceImages : [];
  const hasImages = images.length > 0;
  const referenceLimitReached = images.length >= imageGenerationReferenceImageMaxCount;

  const openFilePicker = () => {
    if (disabled || referenceLimitReached) {
      return;
    }

    inputRef?.current?.click();
  };

  const handleInputChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) {
      void onAddFiles?.(files);
    }
  };

  const handleDragOver = (event) => {
    if (disabled || referenceLimitReached || !Array.from(event.dataTransfer?.types || []).includes('Files')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (event) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    setDragOver(false);
  };

  const handleDrop = (event) => {
    if (disabled || referenceLimitReached) {
      return;
    }

    const files = extractImageFilesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) {
      setDragOver(false);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    void onAddFiles?.(files);
  };

  return (
    <div
      className={cn('image-generation-reference-panel', dragOver && 'is-drag-over')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={handleInputChange}
      />

      {hasImages ? (
        <div className="image-generation-reference-list">
          {images.map((image) => (
            <div
              key={image.id}
              className="image-generation-reference-item"
              title={image.normalizedPath || image.path || image.name}
            >
              <div className="image-generation-reference-thumb">
                {image.url ? (
                  <img alt="" draggable="false" src={image.url} />
                ) : (
                  <Images className="h-4 w-4" />
                )}
              </div>
              <div className="image-generation-reference-copy">
                <span>{image.name || t('imageGenerationReferenceImage')}</span>
                <span>{image.normalizedPath || image.path}</span>
              </div>
              <ImageGenerationIconButton
                label={t('imageGenerationReferenceRemove')}
                type="button"
                variant="ghost"
                className="h-7 w-7"
                disabled={disabled}
                onClick={() => onRemove?.(image.id)}
              >
                <X className="h-3.5 w-3.5" />
              </ImageGenerationIconButton>
            </div>
          ))}
        </div>
      ) : (
        <div className="image-generation-reference-empty">
          <Images className="h-4 w-4" />
          <span>{t('imageGenerationReferenceEmpty')}</span>
        </div>
      )}

      <div className="image-generation-reference-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1 gap-1.5 px-2"
          disabled={disabled || referenceLimitReached}
          onClick={openFilePicker}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('imageGenerationReferenceAdd')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2"
          disabled={disabled || !hasImages}
          onClick={onClear}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('imageGenerationReferenceClear')}
        </Button>
      </div>
    </div>
  );
}

function getHistoryGroupStatusLabel(group, t) {
  if (group?.status === 'pending') {
    return t('imageGenerationTaskPending');
  }
  if (group?.status === 'failed') {
    return t('imageGenerationTaskFailedTitle');
  }

  return t('imageGenerationHistoryImageCount', { count: group?.imageCount || 0 });
}

function ImageGenerationHistorySection({
  collapsedGroups,
  groups,
  onCopyReference,
  onOpenFile,
  onToggleGroup,
  onUseAsReference,
  t
}) {
  if (groups.length === 0) {
    return (
      <div className="image-generation-history">
        <div className="image-generation-controls-header">
          <div className="image-generation-controls-title">
            <Images className="h-4 w-4 text-primary" />
            <span>{t('imageGenerationHistoryTitle')}</span>
          </div>
        </div>
        <div className="image-generation-history-empty">{t('imageGenerationHistoryEmpty')}</div>
      </div>
    );
  }

  return (
    <div className="image-generation-history">
      <div className="image-generation-controls-header">
        <div className="image-generation-controls-title">
          <Images className="h-4 w-4 text-primary" />
          <span>{t('imageGenerationHistoryTitle')}</span>
        </div>
        <div className="image-generation-summary">
          {t('imageGenerationHistoryTaskCount', { count: groups.length })}
        </div>
      </div>
      <div className="image-generation-history-list">
        {groups.map((group, index) => {
          const collapsed = Boolean(collapsedGroups[group.id]);
          const taskItem = group.taskItem;
          const showTaskDetails = hasTaskDebugDetails(taskItem);
          const pollEvents = Array.isArray(taskItem?.pollEvents) ? taskItem.pollEvents : [];
          const successPayloadText = formatHistoryPayload(taskItem?.successPayload);
          const failurePayloadText = formatHistoryPayload(taskItem?.failurePayload);
          const metaItems = [
            group.model,
            group.size,
            group.upscale ? t('imageGenerationUpscaleSummary', { value: String(group.upscale).toUpperCase() }) : '',
            group.referenceImageCount ? t('imageGenerationReferenceSummary', { count: group.referenceImageCount }) : '',
            group.imageCount > 0
              ? t('imageGenerationHistoryImageCount', { count: group.imageCount })
              : (group.requestedCount ? t('imageGenerationRequestedCount', { count: group.requestedCount }) : '')
          ].filter(Boolean);

          return (
            <section
              key={group.id}
              className={cn(
                'image-generation-history-group',
                group.status === 'pending' && 'is-pending',
                group.status === 'failed' && 'is-failed'
              )}
            >
              <button
                type="button"
                className="image-generation-history-toggle"
                title={group.title || t('imageGenerationHistoryUntitled')}
                onClick={() => onToggleGroup?.(group.id)}
              >
                <span className="image-generation-history-chevron" aria-hidden="true">
                  {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
                <div className="image-generation-history-copy">
                  <div className="image-generation-history-headline">
                    <span className="image-generation-history-prompt">
                      {group.title || t('imageGenerationHistoryUntitled')}
                    </span>
                    {index === 0 ? (
                      <span className="image-generation-history-badge">{t('imageGenerationHistoryLatest')}</span>
                    ) : null}
                  </div>
                  <div className="image-generation-history-subline">
                    <span>{formatHistoryTimestamp(group.latestAt)}</span>
                    <span className={cn('image-generation-history-status', `is-${group.status}`)}>
                      {getHistoryGroupStatusLabel(group, t)}
                    </span>
                  </div>
                  {metaItems.length > 0 && (
                    <div className="image-generation-history-meta">
                      {metaItems.map((meta) => (
                        <span key={meta}>{meta}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              {!collapsed && (
                <div className="image-generation-history-body">
                  {group.prompt && (
                    <div className="image-generation-history-prompt-detail">{group.prompt}</div>
                  )}
                  {showTaskDetails && (
                    <div className="image-generation-history-task">
                      {group.status === 'pending' ? (
                        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                      ) : group.status === 'failed' ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <Images className="h-4 w-4 text-primary" />
                      )}
                      <div className="min-w-0">
                        <div className="image-generation-history-task-title">
                          {getHistoryGroupStatusLabel(group, t)}
                        </div>
                        {taskItem?.taskId && (
                          <div className="image-generation-history-task-meta">
                            <span>{t('imageGenerationTaskIdLabel')}</span>
                            <code>{taskItem.taskId}</code>
                          </div>
                        )}
                        {taskItem?.error && (
                          <div className="image-generation-history-task-error">
                            <span>{t('imageGenerationFailureReason')}</span>
                            <span>{taskItem.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {pollEvents.length > 0 && (
                    <div className="image-generation-history-debug-block">
                      <div className="image-generation-history-debug-title">
                        {t('imageGenerationPollHistory')}
                      </div>
                      <div className="image-generation-history-poll-list">
                        {pollEvents.map((event) => (
                          <div
                            key={`${group.id}-poll-${event.index}-${event.receivedAt}`}
                            className="image-generation-history-poll-item"
                          >
                            <div className="image-generation-history-poll-head">
                              <span>{t('imageGenerationPollResult', { index: event.index })}</span>
                              <span>{formatHistoryTimestamp(event.receivedAt)}</span>
                              <span className="image-generation-history-poll-status">
                                {String(event.status || '').trim() || 'running'}
                              </span>
                            </div>
                            <pre className="image-generation-history-payload">
                              {formatHistoryPayload(event.payload) || t('imageGenerationNoPayload')}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {failurePayloadText && (
                    <div className="image-generation-history-debug-block">
                      <div className="image-generation-history-debug-title">
                        {t('imageGenerationFailurePayload')}
                      </div>
                      <pre className="image-generation-history-payload">{failurePayloadText}</pre>
                    </div>
                  )}
                  {successPayloadText && (
                    <div className="image-generation-history-debug-block">
                      <div className="image-generation-history-debug-title">
                        {t('imageGenerationSuccessPayload')}
                      </div>
                      <pre className="image-generation-history-payload">{successPayloadText}</pre>
                    </div>
                  )}
                  {group.imageItems.length > 0 && (
                    <div className="image-generation-history-images">
                      {group.imageItems.map((item) => (
                        <div key={item.id} className="image-generation-history-image">
                          <div className="image-generation-history-thumb">
                            {item.url ? (
                              <img alt="" draggable="false" src={item.url} />
                            ) : (
                              <Images className="h-4 w-4" />
                            )}
                          </div>
                          <div className="image-generation-history-image-copy">
                            <span>{item.name || t('imageGenerationResult')}</span>
                            <span>{item.normalizedPath || item.path}</span>
                          </div>
                          <div className="image-generation-history-actions">
                            <ImageGenerationIconButton
                              type="button"
                              label={t('imageGenerationUseAsReference')}
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={!item.path}
                              onClick={() => onUseAsReference?.(item)}
                            >
                              <ImagePlus className="h-3.5 w-3.5" />
                            </ImageGenerationIconButton>
                            <ImageGenerationIconButton
                              type="button"
                              label={t('imageGenerationCopyReference')}
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={!item.normalizedPath}
                              onClick={() => onCopyReference?.(item)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </ImageGenerationIconButton>
                            <ImageGenerationIconButton
                              type="button"
                              label={t('imageGenerationOpenFile')}
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={!item.path}
                              onClick={() => onOpenFile?.(item)}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </ImageGenerationIconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ImageGenerationCanvasPage({
  config,
  configLoading,
  generating,
  onClear,
  onClose,
  onCopyReference,
  onGenerate,
  onOpenFile,
  onOpenSettings,
  onPromptChange,
  onReferenceImagesAdd,
  prompt,
  results,
  t
}) {
  const viewportRef = useRef(null);
  const referenceInputRef = useRef(null);
  const [view, setView] = useState(createDefaultImageCanvasView);
  const [panning, setPanning] = useState(false);
  const [itemLayout, setItemLayout] = useState({});
  const [toolLayout, setToolLayout] = useState(getDefaultToolPanelLayout);
  const [referenceImages, setReferenceImages] = useState([]);
  const [model, setModel] = useState('gpt-image-2');
  const [size, setSize] = useState('1024x1024');
  const [count, setCount] = useState(1);
  const [upscale, setUpscale] = useState('');
  const [collapsedHistoryGroups, setCollapsedHistoryGroups] = useState({});
  const latestHistoryGroupIdRef = useRef('');

  const visibleResults = useMemo(() => (
    [...(Array.isArray(results) ? results : [])].sort(compareImageGenerationHistoryItems)
  ), [results]);
  const historyGroups = useMemo(() => buildImageGenerationHistoryGroups(visibleResults), [visibleResults]);
  const canvasResults = useMemo(() => (
    visibleResults.filter((item) => item?.kind !== 'task' || getItemFlags(item).pending || getItemFlags(item).failed)
  ), [visibleResults]);
  const generatedImageCount = useMemo(() => (
    visibleResults.filter((item) => item?.kind === 'image').length
  ), [visibleResults]);
  const trimmedPrompt = String(prompt || '').trim();
  const normalizedModel = String(model || '').trim() || 'gpt-image-2';
  const normalizedSize = normalizeSize(size);
  const normalizedCount = normalizeCount(count);
  const normalizedUpscale = normalizeUpscale(upscale);
  const currentZoomPercent = Math.round(view.scale * 100);
  const activeAspect = getAspectOption(normalizedSize);
  const activeAspectLabel = activeAspect
    ? (activeAspect.labelKey ? t(activeAspect.labelKey) : activeAspect.label)
    : getReducedRatioLabel(normalizedSize);
  const hasPendingResults = canvasResults.some((item) => getItemFlags(item).pending);
  const referenceImagePaths = referenceImages
    .map((image) => image.path || image.normalizedPath)
    .filter(Boolean);
  const modelChoices = useMemo(() => (
    modelOptions.includes(normalizedModel)
      ? modelOptions
      : [normalizedModel, ...modelOptions]
  ), [normalizedModel]);

  useEffect(() => {
    setModel(String(config?.model || 'gpt-image-2').trim() || 'gpt-image-2');
    setSize(normalizeSize(config?.size));
    setCount(normalizeCount(config?.n));
    setUpscale(normalizeUpscale(config?.upscale));
  }, [config?.model, config?.n, config?.size, config?.upscale]);

  useEffect(() => {
    setItemLayout((current) => {
      const next = {};
      let changed = false;
      let autoSlot = 0;

      if (Object.keys(current).some((id) => !canvasResults.some((item) => item.id === id))) {
        changed = true;
      }

      for (const item of canvasResults) {
        const existing = current[item.id];
        if (existing?.manual) {
          next[item.id] = existing;
          continue;
        }

        const layout = getDefaultLayout(autoSlot);
        autoSlot += 1;
        next[item.id] = layout;
        if (
          !existing ||
          existing.manual ||
          existing.slot !== layout.slot ||
          existing.x !== layout.x ||
          existing.y !== layout.y
        ) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [canvasResults]);

  useEffect(() => {
    const latestGroupId = historyGroups[0]?.id || '';
    setCollapsedHistoryGroups((current) => {
      if (historyGroups.length === 0) {
        return Object.keys(current).length > 0 ? {} : current;
      }

      const latestChanged = latestGroupId !== latestHistoryGroupIdRef.current;
      const next = {};
      let changed = latestChanged || Object.keys(current).some((id) => !historyGroups.some((group) => group.id === id));

      historyGroups.forEach((group, index) => {
        const fallbackCollapsed = index > 0;
        const collapsed = latestChanged
          ? fallbackCollapsed
          : (typeof current[group.id] === 'boolean' ? current[group.id] : fallbackCollapsed);
        next[group.id] = collapsed;
        if (current[group.id] !== collapsed) {
          changed = true;
        }
      });

      return changed ? next : current;
    });
    latestHistoryGroupIdRef.current = latestGroupId;
  }, [historyGroups]);

  const getViewportRect = useCallback(() => {
    return viewportRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }, []);

  const zoomAt = useCallback((clientX, clientY, nextScale) => {
    const rect = getViewportRect();
    setView((current) => {
      const before = {
        x: (clientX - rect.left - current.x) / current.scale,
        y: (clientY - rect.top - current.y) / current.scale
      };
      const scale = clamp(nextScale, 0.35, 2.5);
      return {
        scale,
        x: clientX - rect.left - before.x * scale,
        y: clientY - rect.top - before.y * scale
      };
    });
  }, [getViewportRect]);

  const zoomViewportCenter = useCallback((nextScale) => {
    const rect = getViewportRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextScale);
  }, [getViewportRect, zoomAt]);

  const startViewportPan = (event) => {
    if (
      event.button !== 0 ||
      closestElement(event.target, '.image-generation-controls') ||
      closestElement(event.target, '.image-generation-card') ||
      closestElement(event.target, '.image-generation-tool-card') ||
      closestElement(event.target, '.image-generation-canvas-toolbar')
    ) {
      return;
    }

    event.preventDefault();
    setPanning(true);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: view.x,
      y: view.y
    };

    bindPointerSession((moveEvent) => {
      setView((current) => ({
        ...current,
        x: start.x + moveEvent.clientX - start.clientX,
        y: start.y + moveEvent.clientY - start.clientY
      }));
    }, () => setPanning(false));
  };

  const handleWheel = (event) => {
    if (
      closestElement(event.target, '.image-generation-controls') ||
      closestElement(event.target, '.image-generation-card') ||
      closestElement(event.target, '.image-generation-tool-card')
    ) {
      return;
    }

    event.preventDefault();
    if (event.ctrlKey) {
      zoomAt(event.clientX, event.clientY, view.scale * (event.deltaY > 0 ? 0.92 : 1.08));
      return;
    }

    setView((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
  };

  const moveItem = useCallback((id, patch) => {
    setItemLayout((current) => {
      const existing = current[id];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [id]: {
          ...existing,
          manual: true,
          x: Number.isFinite(patch?.x) ? patch.x : existing.x,
          y: Number.isFinite(patch?.y) ? patch.y : existing.y
        }
      };
    });
  }, []);

  const moveToolPanel = useCallback((patch) => {
    setToolLayout((current) => {
      return {
        ...current,
        x: Number.isFinite(patch?.x) ? patch.x : current.x,
        y: Number.isFinite(patch?.y) ? patch.y : current.y
      };
    });
  }, []);

  const resetLayout = useCallback(() => {
    setToolLayout(getDefaultToolPanelLayout());
    setItemLayout(() => {
      const next = {};
      canvasResults.forEach((item, index) => {
        next[item.id] = getDefaultLayout(index);
      });
      return next;
    });
    setView(createDefaultImageCanvasView());
  }, [canvasResults]);

  const appendReferenceImages = useCallback((items) => {
    const normalizedItems = (Array.isArray(items) ? items : [])
      .map((item) => normalizeReferenceImageItem(item))
      .filter(Boolean);
    if (normalizedItems.length === 0) {
      return;
    }

    setReferenceImages((current) => {
      const seen = new Set();
      const next = [];
      const addItem = (item) => {
        const key = item.path || item.normalizedPath || item.id;
        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);
        next.push(item);
      };

      current.forEach(addItem);
      normalizedItems.forEach(addItem);
      return next.slice(0, imageGenerationReferenceImageMaxCount);
    });
  }, []);

  const addReferenceFiles = useCallback(async (files) => {
    const availableSlots = imageGenerationReferenceImageMaxCount - referenceImages.length;
    if (availableSlots <= 0) {
      return;
    }

    const imageFiles = Array.from(files || [])
      .filter((file) => isImageFile(file))
      .slice(0, availableSlots);
    if (imageFiles.length === 0 || typeof onReferenceImagesAdd !== 'function') {
      return;
    }

    const savedImages = await onReferenceImagesAdd(imageFiles);
    appendReferenceImages(savedImages);
  }, [appendReferenceImages, onReferenceImagesAdd, referenceImages.length]);

  const removeReferenceImage = useCallback((id) => {
    setReferenceImages((current) => current.filter((image) => image.id !== id));
  }, []);

  const clearReferenceImages = useCallback(() => {
    setReferenceImages([]);
  }, []);

  const useImageAsReference = useCallback((item) => {
    appendReferenceImages([item]);
  }, [appendReferenceImages]);

  const toggleHistoryGroup = useCallback((id) => {
    setCollapsedHistoryGroups((current) => ({
      ...current,
      [id]: !current[id]
    }));
  }, []);

  const handleControlsPaste = useCallback((event) => {
    if (generating) {
      return;
    }

    const imageFiles = extractImageFilesFromDataTransfer(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void addReferenceFiles(imageFiles);
  }, [addReferenceFiles, generating]);

  const submitPrompt = (event) => {
    event.preventDefault();
    if (!trimmedPrompt || generating) {
      return;
    }

    onGenerate?.({
      prompt: trimmedPrompt,
      model: normalizedModel,
      n: normalizedCount,
      size: normalizedSize,
      upscale: normalizedUpscale,
      referenceImageUrls: referenceImagePaths
    });
  };

  const minorGrid = 48 * view.scale;
  const majorGrid = minorGrid * 4;

  return (
    <section className="image-generation-page">
      <header className="image-generation-page-header">
        <div className="min-w-0">
          <div className="image-generation-page-title">
            <ImagePlus className="h-5 w-5 text-primary" />
            <span>{t('imageGenerationTitle')}</span>
          </div>
          <div className="image-generation-page-subtitle">{t('imageGenerationDescription')}</div>
        </div>

        <div className="image-generation-page-actions">
          <ImageGenerationIconButton label={t('zoomOut')} variant="ghost" onClick={() => zoomViewportCenter(view.scale / 1.16)}>
            <Minus className="h-4 w-4" />
          </ImageGenerationIconButton>
          <div className="image-generation-zoom-label" title={t('zoomLevel')}>{currentZoomPercent}%</div>
          <ImageGenerationIconButton label={t('zoomIn')} variant="ghost" onClick={() => zoomViewportCenter(view.scale * 1.16)}>
            <ZoomIn className="h-4 w-4" />
          </ImageGenerationIconButton>
          <ImageGenerationIconButton label={t('resetView')} variant="ghost" onClick={resetLayout}>
            <RotateCcw className="h-4 w-4" />
          </ImageGenerationIconButton>
          <ImageGenerationIconButton label={t('imageGenerationOpenSettings')} variant="ghost" onClick={onOpenSettings}>
            <Settings2 className="h-4 w-4" />
          </ImageGenerationIconButton>
          <Button type="button" variant="outline" className="h-9 gap-1.5 px-3" onClick={onClose}>
            <PanelLeft className="h-4 w-4" />
            {t('imageGenerationBackToWorkspace')}
          </Button>
        </div>
      </header>

      <main
        ref={viewportRef}
        className={cn('image-generation-viewport', panning && 'is-panning')}
        style={{
          backgroundSize: `${majorGrid}px ${majorGrid}px, ${majorGrid}px ${majorGrid}px, ${minorGrid}px ${minorGrid}px, ${minorGrid}px ${minorGrid}px`,
          backgroundPosition: `${view.x}px ${view.y}px`
        }}
        onPointerDown={startViewportPan}
        onWheel={handleWheel}
      >
        <form className="image-generation-controls" onPaste={handleControlsPaste} onSubmit={submitPrompt}>
          <div className="image-generation-controls-header">
            <div className="image-generation-controls-title">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>{t('imageGenerationControls')}</span>
            </div>
            <div className="image-generation-summary">
              {configLoading
                ? t('imageGenerationConfigLoading')
                : t('imageGenerationCount', { count: generatedImageCount })}
            </div>
          </div>

          <div className="image-generation-field">
            <Label htmlFor="imageGenerationPrompt" className="text-xs font-medium text-muted-foreground">
              {t('imageGenerationPrompt')}
            </Label>
            <Textarea
              id="imageGenerationPrompt"
              rows={6}
              spellCheck={false}
              value={prompt}
              placeholder={t('imageGenerationPlaceholder')}
              className="min-h-[140px] resize-none font-mono text-sm leading-6"
              onChange={(event) => onPromptChange?.(event.target.value)}
            />
          </div>

          <div className="image-generation-field">
            <Label htmlFor="imageGenerationModel" className="text-xs font-medium text-muted-foreground">
              {t('imageGenerationModel')}
            </Label>
            <div className="image-generation-button-grid is-models">
              {modelChoices.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={normalizedModel === option ? 'primary' : 'outline'}
                  onClick={() => setModel(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            <Input
              id="imageGenerationModel"
              value={model}
              list="imageGenerationModelOptions"
              spellCheck={false}
              placeholder="gpt-image-2"
              onChange={(event) => setModel(event.target.value)}
            />
            <datalist id="imageGenerationModelOptions">
              {modelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <div className="image-generation-field">
            <div className="image-generation-label-row">
              <Label className="text-xs font-medium text-muted-foreground">
                {t('imageGenerationReferenceImages')}
              </Label>
              <span>{t('imageGenerationReferenceCount', { count: referenceImages.length })}</span>
            </div>
            <ImageGenerationReferencePanel
              disabled={generating}
              inputRef={referenceInputRef}
              referenceImages={referenceImages}
              onAddFiles={addReferenceFiles}
              onClear={clearReferenceImages}
              onRemove={removeReferenceImage}
              t={t}
            />
          </div>

          <div className="image-generation-field">
            <div className="image-generation-label-row">
              <Label className="text-xs font-medium text-muted-foreground">
                {t('imageGenerationAspectRatio')}
              </Label>
              <span>{t('imageGenerationCurrentSize', { size: normalizedSize })}</span>
            </div>
            <div className="image-generation-button-grid is-aspects">
              {aspectOptions.map((option) => {
                const label = option.labelKey ? t(option.labelKey) : option.label;
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={normalizedSize.toLowerCase() === option.size.toLowerCase() ? 'primary' : 'outline'}
                    onClick={() => setSize(option.size)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            {!activeAspect && (
              <div className="image-generation-custom-aspect">
                {t('imageGenerationCustomAspect', { ratio: activeAspectLabel })}
              </div>
            )}
          </div>

          <div className="image-generation-field">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('imageGenerationCountLabel')}
            </Label>
            <div className="image-generation-button-grid is-counts">
              {countOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={normalizedCount === option ? 'primary' : 'outline'}
                  onClick={() => setCount(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="image-generation-field">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('imageGenerationUpscale')}
            </Label>
            <div className="image-generation-button-grid is-counts">
              {upscaleOptions.map((option) => (
                <Button
                  key={option || 'default'}
                  type="button"
                  size="sm"
                  variant={normalizedUpscale === option ? 'primary' : 'outline'}
                  onClick={() => setUpscale(option)}
                >
                  {option ? option.toUpperCase() : t('imageGenerationUpscaleDefault')}
                </Button>
              ))}
            </div>
          </div>

          <div className="image-generation-form-actions">
            <Button
              type="submit"
              variant="primary"
              className="h-9 flex-1 gap-1.5 px-3"
              disabled={!trimmedPrompt || generating}
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {generating ? t('imageGenerationSubmitting') : t('imageGenerationGenerate')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 px-3"
              disabled={visibleResults.length === 0 || generating || hasPendingResults}
              onClick={onClear}
            >
              <Trash2 className="h-4 w-4" />
              {t('imageGenerationClear')}
            </Button>
          </div>

          <ImageGenerationHistorySection
            collapsedGroups={collapsedHistoryGroups}
            groups={historyGroups}
            onCopyReference={onCopyReference}
            onOpenFile={onOpenFile}
            onToggleGroup={toggleHistoryGroup}
            onUseAsReference={useImageAsReference}
            t={t}
          />
        </form>

        <div className="image-generation-canvas-toolbar">
          <Button type="button" variant="outline" className="h-8 gap-1.5 px-2" onClick={resetLayout}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t('imageGenerationResetCanvas')}
          </Button>
        </div>

        <div
          className="image-generation-stage"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <ImageGenerationToolPanel
            tools={imageGenerationToolFrames}
            position={toolLayout}
            scale={view.scale}
            onMove={moveToolPanel}
            t={t}
          />
          {canvasResults.map((item) => (
            <ImageGenerationResultCard
              key={item.id}
              item={item}
              position={itemLayout[item.id]}
              scale={view.scale}
              onCopyReference={onCopyReference}
              onMove={moveItem}
              onOpenFile={onOpenFile}
              onUseAsReference={useImageAsReference}
              t={t}
            />
          ))}
        </div>
      </main>
    </section>
  );
}
