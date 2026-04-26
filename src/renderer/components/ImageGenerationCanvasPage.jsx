import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  ExternalLink,
  ImagePlus,
  Minus,
  Move,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  ZoomIn
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const modelOptions = ['gpt-image-2', 'gpt-image-1'];
const countOptions = [1, 2, 3, 4];
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

function getDefaultLayout(slot) {
  const columns = 3;
  const columnWidth = 340;
  const rowHeight = 520;
  return {
    slot,
    x: (slot % columns) * columnWidth,
    y: imageGenerationResultStartY + Math.floor(slot / columns) * rowHeight
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
  prompt,
  results,
  t
}) {
  const viewportRef = useRef(null);
  const [view, setView] = useState(createDefaultImageCanvasView);
  const [panning, setPanning] = useState(false);
  const [itemLayout, setItemLayout] = useState({});
  const [toolLayout, setToolLayout] = useState(getDefaultToolPanelLayout);
  const [model, setModel] = useState('gpt-image-2');
  const [size, setSize] = useState('1024x1024');
  const [count, setCount] = useState(1);

  const visibleResults = Array.isArray(results) ? results : [];
  const trimmedPrompt = String(prompt || '').trim();
  const normalizedModel = String(model || '').trim() || 'gpt-image-2';
  const normalizedSize = normalizeSize(size);
  const normalizedCount = normalizeCount(count);
  const currentZoomPercent = Math.round(view.scale * 100);
  const activeAspect = getAspectOption(normalizedSize);
  const activeAspectLabel = activeAspect
    ? (activeAspect.labelKey ? t(activeAspect.labelKey) : activeAspect.label)
    : getReducedRatioLabel(normalizedSize);
  const hasPendingResults = visibleResults.some((item) => getItemFlags(item).pending);
  const modelChoices = useMemo(() => (
    modelOptions.includes(normalizedModel)
      ? modelOptions
      : [normalizedModel, ...modelOptions]
  ), [normalizedModel]);

  useEffect(() => {
    setModel(String(config?.model || 'gpt-image-2').trim() || 'gpt-image-2');
    setSize(normalizeSize(config?.size));
    setCount(normalizeCount(config?.n));
  }, [config?.model, config?.n, config?.size]);

  useEffect(() => {
    setItemLayout((current) => {
      const activeIds = new Set(visibleResults.map((item) => item.id));
      const next = {};
      let changed = Object.keys(current).some((id) => !activeIds.has(id));
      let maxSlot = -1;

      for (const item of visibleResults) {
        const existing = current[item.id];
        if (existing) {
          const slot = Number.isFinite(existing.slot) ? existing.slot : maxSlot + 1;
          maxSlot = Math.max(maxSlot, slot);
          next[item.id] = { ...existing, slot };
        }
      }

      for (const item of visibleResults) {
        if (next[item.id]) {
          continue;
        }

        const slot = maxSlot + 1;
        maxSlot = slot;
        next[item.id] = getDefaultLayout(slot);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [visibleResults]);

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
    setItemLayout((current) => {
      const next = {};
      visibleResults.forEach((item, index) => {
        next[item.id] = getDefaultLayout(index);
      });
      return next;
    });
    setView(createDefaultImageCanvasView());
  }, [visibleResults]);

  const submitPrompt = (event) => {
    event.preventDefault();
    if (!trimmedPrompt || generating) {
      return;
    }

    onGenerate?.({
      prompt: trimmedPrompt,
      model: normalizedModel,
      n: normalizedCount,
      size: normalizedSize
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
        <form className="image-generation-controls" onSubmit={submitPrompt}>
          <div className="image-generation-controls-header">
            <div className="image-generation-controls-title">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>{t('imageGenerationControls')}</span>
            </div>
            <div className="image-generation-summary">
              {configLoading
                ? t('imageGenerationConfigLoading')
                : t('imageGenerationCount', { count: visibleResults.length })}
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
          {visibleResults.map((item) => (
            <ImageGenerationResultCard
              key={item.id}
              item={item}
              position={itemLayout[item.id]}
              scale={view.scale}
              onCopyReference={onCopyReference}
              onMove={moveItem}
              onOpenFile={onOpenFile}
              t={t}
            />
          ))}
        </div>
      </main>
    </section>
  );
}
