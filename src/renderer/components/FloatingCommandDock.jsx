import React from 'react';
import {
  Check,
  ChevronDown,
  Download,
  File,
  FolderOpen,
  GripHorizontal,
  History,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Play,
  RefreshCw,
  Save,
  Search,
  SquareTerminal,
  Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { parseCommandDockDispatchTasks } from '@/lib/commandDockTasks';

function CommandDockIconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" aria-label={label} title={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CommandDockTooltipButton({ children, tooltip, tooltipClassName, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button title={tooltip} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className={cn('max-w-[260px] whitespace-normal leading-5', tooltipClassName)}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

const commandDockViewportMargin = 10;

function isCommandDockPosition(position) {
  return Number.isFinite(position?.left) && Number.isFinite(position?.top);
}

function areCommandDockPositionsEqual(a, b) {
  return isCommandDockPosition(a)
    && isCommandDockPosition(b)
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.top - b.top) < 0.5;
}

function clampCommandDockPosition(position, rect) {
  if (!isCommandDockPosition(position) || typeof window === 'undefined') {
    return null;
  }

  const width = Number.isFinite(rect?.width)
    ? rect.width
    : Math.min(980, Math.max(0, window.innerWidth - 20));
  const height = Number.isFinite(rect?.height) ? rect.height : 72;
  const maxLeft = Math.max(commandDockViewportMargin, window.innerWidth - width - commandDockViewportMargin);
  const maxTop = Math.max(commandDockViewportMargin, window.innerHeight - height - commandDockViewportMargin);

  return {
    left: Math.min(Math.max(position.left, commandDockViewportMargin), maxLeft),
    top: Math.min(Math.max(position.top, commandDockViewportMargin), maxTop)
  };
}

function CommandDockSkillMentionMenu({
  activeIndex,
  hasAnyItems,
  items,
  loading,
  onSelect,
  position,
  t
}) {
  const left = Number.isFinite(position?.left) ? position.left : 12;
  const top = Number.isFinite(position?.top) ? position.top : 12;
  const bottom = Number.isFinite(position?.bottom) ? position.bottom : null;
  const maxHeight = Number.isFinite(position?.maxHeight) ? position.maxHeight : null;
  const showLoading = loading && items.length === 0;
  const emptyMessage = hasAnyItems ? t('floatingComposerSkillNoMatch') : t('floatingComposerSkillEmpty');

  return (
    <div
      id="commandDockSkillMentionList"
      className="command-dock-skill-menu"
      role="listbox"
      style={{
        left: `${left}px`,
        ...(maxHeight === null ? {} : { maxHeight: `${maxHeight}px` }),
        ...(bottom === null ? { top: `${top}px` } : { bottom: `${bottom}px` })
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="command-dock-skill-menu-header">
        <span>{t('skills')}</span>
        {items.length > 0 && (
          <Badge variant="outline" className="command-dock-skill-count">
            {items.length}
          </Badge>
        )}
      </div>

      {showLoading ? (
        <div className="command-dock-skill-empty">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>{t('loading')}</span>
        </div>
      ) : items.length > 0 ? (
        <div className="command-dock-skill-list">
          {items.map((item, index) => {
            const active = index === activeIndex;
            const ItemIcon = item.kind === 'directory' ? FolderOpen : File;
            const kindLabel = item.kind === 'directory'
              ? t('floatingComposerSkillDirectory')
              : t('floatingComposerSkillFile');

            return (
              <button
                key={item.id}
                id={`commandDockSkillMentionItem-${index}`}
                type="button"
                className={cn('command-dock-skill-item', active && 'is-active')}
                role="option"
                aria-selected={active}
                title={[item.insertPath, item.title].filter(Boolean).join('\n')}
                onClick={() => onSelect(item)}
              >
                <ItemIcon className="command-dock-skill-item-icon h-3.5 w-3.5" />
                <span className="command-dock-skill-item-copy">
                  <span className="command-dock-skill-item-title">
                    <span className="truncate">{item.label}</span>
                    <span className="command-dock-skill-kind">{kindLabel}</span>
                  </span>
                  <span className="command-dock-skill-item-path">{item.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="command-dock-skill-empty">{emptyMessage}</div>
      )}
    </div>
  );
}

function formatCommandDockHistoryPreview(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function FloatingCommandDock({
  activeId,
  canPanelReceiveInput,
  collapsed,
  commandHistory = [],
  dispatchMode = 'reuse',
  dispatchingTasks,
  dispatchShortcutLabel = 'Ctrl+Enter',
  getExecutionStateLabel,
  getPanelExecutionState,
  getPanelProviderLabel,
  getQuickPromptTitle,
  inputRef,
  message,
  position,
  onDispatchModeChange,
  onDispatchTasks,
  onExport,
  onExportCustom,
  onHistorySelect,
  onInputChange,
  onInputCompositionEnd,
  onInputCompositionStart,
  onInputDragOver,
  onInputDrop,
  onInputKeyDown,
  onInputPaste,
  onInputScroll,
  onInputSelect,
  onQuickPromptDelete,
  onQuickPromptSave,
  onQuickPromptSelect,
  onPositionChange,
  onSend,
  onSkillMentionSelect,
  onTargetChange,
  onToggleCollapsed,
  onToggleSessionReview,
  panels,
  quickPrompts = [],
  quickPromptsLoading = false,
  quickPromptsPath = '',
  renderProviderBadge,
  sendShortcutLabel = 'Enter',
  skillMention,
  skillMentionHasAnyItems,
  skillMentionItems,
  skillMentionLoading,
  sessionReviewOpen = false,
  targetId,
  t
}) {
  const dockRef = React.useRef(null);
  const dragCleanupRef = React.useRef(null);
  const historyRootRef = React.useRef(null);
  const targetMenuRootRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [targetMenuOpen, setTargetMenuOpen] = React.useState(false);
  const [targetFilter, setTargetFilter] = React.useState('');
  const [targetMenuLayout, setTargetMenuLayout] = React.useState({
    maxHeight: 342,
    placement: 'up'
  });
  const targetPanel = panels.find((panel) => panel.id === targetId) || null;
  const targetReady = canPanelReceiveInput?.(targetPanel);
  const canExport = Boolean(targetPanel);
  const canSend = Boolean(targetReady && String(message || '').trim());
  const canDispatchTasks = parseCommandDockDispatchTasks(message).length > 0 && !dispatchingTasks;
  const canSaveQuickPrompt = Boolean(String(message || '').trim() && !quickPromptsLoading);
  const normalizedDispatchMode = dispatchMode === 'new' ? 'new' : 'reuse';
  const dispatchTasksTitle = t(
    normalizedDispatchMode === 'new'
      ? 'floatingComposerDispatchTasksTitleNew'
      : 'floatingComposerDispatchTasksTitleReuse',
    { dispatchShortcut: dispatchShortcutLabel }
  );
  const dispatchModeOptions = [
    {
      id: 'reuse',
      label: t('floatingComposerDispatchModeReuse'),
      tooltip: t('floatingComposerDispatchModeReuseTooltip'),
      Icon: RefreshCw
    },
    {
      id: 'new',
      label: t('floatingComposerDispatchModeNew'),
      tooltip: t('floatingComposerDispatchModeNewTooltip'),
      Icon: MessageSquarePlus
    }
  ];
  const normalizedQuickPrompts = Array.isArray(quickPrompts)
    ? quickPrompts.filter((record) => String(record?.prompt || '').trim())
    : [];
  const normalizedCommandHistory = Array.isArray(commandHistory)
    ? commandHistory.map((item) => String(item || '')).filter((item) => item.trim()).slice(0, 10)
    : [];
  const hasCommandHistory = normalizedCommandHistory.length > 0;
  const targetSummary = targetPanel
    ? t('floatingComposerSubtitle', { name: targetPanel.title })
    : t('floatingComposerUnavailable');
  const buildTargetOption = (panel) => {
    const executionState = getPanelExecutionState?.(panel) || 'idle';
    const providerLabel = getPanelProviderLabel?.(panel) || '';
    const stateLabel = getExecutionStateLabel?.(executionState, t) || executionState;
    const current = panel.id === activeId;
    const targeted = panel.id === targetId;
    const sendDisabled = !canPanelReceiveInput?.(panel);
    const title = String(panel.title || '').trim() || t('sessionFallbackTitle');
    const cwd = String(panel.cwd || '').trim();
    const searchText = [
      title,
      providerLabel,
      stateLabel,
      cwd,
      current ? t('floatingComposerCurrent') : ''
    ].join(' ').toLocaleLowerCase();

    return {
      cwd,
      current,
      executionState,
      panel,
      providerLabel,
      searchText,
      sendDisabled,
      stateLabel,
      targeted,
      title
    };
  };
  const targetOptions = panels.map(buildTargetOption);
  const targetPanelOption = targetPanel ? buildTargetOption(targetPanel) : null;
  const normalizedTargetFilter = targetFilter.trim().toLocaleLowerCase();
  const visibleTargetOptions = normalizedTargetFilter
    ? targetOptions.filter((option) => option.searchText.includes(normalizedTargetFilter))
    : targetOptions;
  const targetSelectorTitle = targetPanelOption
    ? [
      t('floatingComposerTargetSelector'),
      targetPanelOption.title,
      targetPanelOption.providerLabel,
      targetPanelOption.stateLabel,
      targetPanelOption.cwd
    ].filter(Boolean).join('\n')
    : t('floatingComposerUnavailable');
  const dockPosition = isCommandDockPosition(position) ? position : null;
  const dockStyle = dockPosition
    ? { left: `${dockPosition.left}px`, top: `${dockPosition.top}px` }
    : undefined;

  const clampCurrentDockPosition = React.useCallback((nextPosition) => {
    const rect = dockRef.current?.getBoundingClientRect();
    return clampCommandDockPosition(nextPosition, rect);
  }, []);

  const updateTargetMenuLayout = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const rect = targetMenuRootRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const menuGap = 6;
    const maxMenuHeight = 342;
    const minMenuHeight = 96;
    const spaceAbove = Math.max(0, rect.top - commandDockViewportMargin - menuGap);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - commandDockViewportMargin - menuGap);
    const placement = spaceAbove >= spaceBelow ? 'up' : 'down';
    const availableHeight = placement === 'up' ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(minMenuHeight, Math.min(maxMenuHeight, availableHeight));

    setTargetMenuLayout((current) => (
      current.placement === placement && Math.abs(current.maxHeight - maxHeight) < 1
        ? current
        : { maxHeight, placement }
    ));
  }, []);

  React.useLayoutEffect(() => {
    if (!dockPosition || typeof onPositionChange !== 'function') {
      return;
    }

    const nextPosition = clampCurrentDockPosition(dockPosition);
    if (nextPosition && !areCommandDockPositionsEqual(nextPosition, dockPosition)) {
      onPositionChange(nextPosition);
    }
  }, [clampCurrentDockPosition, collapsed, dockPosition, onPositionChange]);

  React.useEffect(() => {
    if (!dockPosition || typeof onPositionChange !== 'function') {
      return undefined;
    }

    const handleWindowResize = () => {
      const nextPosition = clampCurrentDockPosition(dockPosition);
      if (nextPosition && !areCommandDockPositionsEqual(nextPosition, dockPosition)) {
        onPositionChange(nextPosition);
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [clampCurrentDockPosition, dockPosition, onPositionChange]);

  React.useEffect(() => () => {
    dragCleanupRef.current?.(false);
  }, []);

  React.useEffect(() => {
    if (!historyOpen) {
      return undefined;
    }

    const closeOnPointerDown = (event) => {
      if (!historyRootRef.current?.contains(event.target)) {
        setHistoryOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setHistoryOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [historyOpen]);

  React.useEffect(() => {
    if (!targetMenuOpen) {
      return undefined;
    }

    const closeOnPointerDown = (event) => {
      if (!targetMenuRootRef.current?.contains(event.target)) {
        setTargetMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setTargetMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [targetMenuOpen]);

  React.useLayoutEffect(() => {
    if (targetMenuOpen) {
      updateTargetMenuLayout();
    }
  }, [dockPosition, targetMenuOpen, updateTargetMenuLayout]);

  React.useEffect(() => {
    if (!targetMenuOpen) {
      return undefined;
    }

    window.addEventListener('resize', updateTargetMenuLayout);
    return () => window.removeEventListener('resize', updateTargetMenuLayout);
  }, [targetMenuOpen, updateTargetMenuLayout]);

  React.useEffect(() => {
    if (collapsed && historyOpen) {
      setHistoryOpen(false);
    }
  }, [collapsed, historyOpen]);

  React.useEffect(() => {
    if (collapsed && targetMenuOpen) {
      setTargetMenuOpen(false);
    }
  }, [collapsed, targetMenuOpen]);

  React.useEffect(() => {
    if (panels.length === 0 && targetMenuOpen) {
      setTargetMenuOpen(false);
    }
  }, [panels.length, targetMenuOpen]);

  React.useEffect(() => {
    if (!targetMenuOpen && targetFilter) {
      setTargetFilter('');
    }
  }, [targetFilter, targetMenuOpen]);

  const handleDockDragStart = (event) => {
    if (event.button !== 0 || typeof onPositionChange !== 'function') {
      return;
    }

    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.(false);

    const startPosition = clampCommandDockPosition({
      left: dockPosition?.left ?? rect.left,
      top: dockPosition?.top ?? rect.top
    }, rect);

    if (!startPosition) {
      return;
    }

    onPositionChange(startPosition);
    setDragging(true);

    const dragOffset = {
      left: event.clientX - startPosition.left,
      top: event.clientY - startPosition.top
    };
    const previousBodyUserSelect = document.body.style.userSelect;
    const previousBodyCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    let dragActive = true;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }

      moveEvent.preventDefault();
      const nextPosition = clampCommandDockPosition({
        left: moveEvent.clientX - dragOffset.left,
        top: moveEvent.clientY - dragOffset.top
      }, dockRef.current?.getBoundingClientRect());

      if (nextPosition) {
        onPositionChange(nextPosition);
      }
    };

    const cleanupDrag = (updateState = true) => {
      if (!dragActive) {
        return;
      }

      dragActive = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      document.body.style.userSelect = previousBodyUserSelect;
      document.body.style.cursor = previousBodyCursor;
      dragCleanupRef.current = null;
      if (updateState) {
        setDragging(false);
      }
    };

    const stopDrag = (upEvent) => {
      if (upEvent.pointerId !== event.pointerId) {
        return;
      }

      cleanupDrag();
    };

    dragCleanupRef.current = cleanupDrag;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  };

  const handleDockPositionReset = (event) => {
    if (typeof onPositionChange !== 'function') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onPositionChange(null);
  };

  const handleInputKeyDown = (event) => {
    onInputKeyDown?.(event);
  };

  const handleHistorySelect = (entry) => {
    setHistoryOpen(false);
    onHistorySelect?.(entry);
  };

  const handleTargetSelect = (id) => {
    onTargetChange?.(id);
    setTargetMenuOpen(false);
  };

  return (
    <div
      ref={dockRef}
      className={cn(
        'pointer-events-none fixed z-[7000] w-[calc(100vw-20px)] max-w-[980px] md:w-[calc(100vw-32px)]',
        dockPosition ? '' : 'bottom-3 left-1/2 -translate-x-1/2 md:bottom-[18px]',
        dragging && 'command-dock-is-dragging'
      )}
      style={dockStyle}
    >
      <Card
        className="pointer-events-auto overflow-visible shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onDragOver={onInputDragOver}
        onDrop={onInputDrop}
      >
        <CardHeader className={cn('px-3', collapsed ? 'gap-1 py-2.5' : 'gap-2 py-3')}>
          <div className="flex items-center justify-between gap-3">
            <div
              className="command-dock-drag-handle min-w-0 flex flex-1 items-center gap-2"
              title={t('floatingComposerDrag')}
              onDoubleClick={handleDockPositionReset}
              onPointerDown={handleDockDragStart}
            >
              <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="shrink-0 text-sm">{t('floatingComposerTitle')}</CardTitle>
              <CardDescription className="truncate text-xs" title={targetPanel?.cwd || undefined}>
                {targetSummary}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {targetPanel && renderProviderBadge?.(targetPanel)}
              <CommandDockIconButton
                label={t(collapsed ? 'floatingComposerExpand' : 'floatingComposerCollapse')}
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-expanded={!collapsed}
                onClick={onToggleCollapsed}
              >
                {collapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </CommandDockIconButton>
            </div>
          </div>
          {!collapsed && (
            <div className="command-dock-target-root" ref={targetMenuRootRef}>
              <button
                type="button"
                className="command-dock-target-trigger"
                aria-controls={targetMenuOpen ? 'commandDockTargetMenu' : undefined}
                aria-expanded={targetMenuOpen}
                aria-haspopup="listbox"
                aria-label={t('floatingComposerTargetSelector')}
                title={targetSelectorTitle}
                onClick={() => setTargetMenuOpen((current) => !current)}
                disabled={panels.length === 0}
              >
                {targetPanelOption ? (
                  <>
                    <span className={cn('terminal-endpoint-dot', `is-${targetPanelOption.executionState}`)} />
                    <span className="command-dock-target-copy">
                      <span className="command-dock-target-title-row">
                        <span className="command-dock-target-title">{targetPanelOption.title}</span>
                        {targetPanelOption.current && (
                          <span className="command-dock-target-current">{t('floatingComposerCurrent')}</span>
                        )}
                      </span>
                      <span className="command-dock-target-meta">
                        {[targetPanelOption.providerLabel, targetPanelOption.stateLabel].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <SquareTerminal className="h-4 w-4 text-muted-foreground" />
                    <span className="command-dock-target-copy">
                      <span className="command-dock-target-title-row">
                        <span className="command-dock-target-title">{t('floatingComposerUnavailable')}</span>
                      </span>
                      <span className="command-dock-target-meta">{t('floatingComposerTarget')}</span>
                    </span>
                  </>
                )}
                <span className="command-dock-target-count">
                  {t('floatingComposerTargetCount', { count: panels.length })}
                </span>
                <ChevronDown className={cn('command-dock-target-chevron h-4 w-4', targetMenuOpen && 'is-open')} />
              </button>

              {targetMenuOpen && (
                <div
                  id="commandDockTargetMenu"
                  className={cn(
                    'command-dock-target-menu',
                    targetMenuLayout.placement === 'up' ? 'is-above' : 'is-below'
                  )}
                  role="dialog"
                  aria-label={t('floatingComposerTargetMenu')}
                  style={{ maxHeight: `${targetMenuLayout.maxHeight}px` }}
                >
                  <label className="command-dock-target-search">
                    <Search className="h-3.5 w-3.5" />
                    <input
                      type="search"
                      value={targetFilter}
                      placeholder={t('floatingComposerTargetSearch')}
                      aria-label={t('floatingComposerTargetSearch')}
                      autoFocus
                      onChange={(event) => setTargetFilter(event.target.value)}
                    />
                  </label>

                  {visibleTargetOptions.length > 0 ? (
                    <div
                      className="command-dock-target-list"
                      role="listbox"
                      aria-label={t('floatingComposerTarget')}
                    >
                      {visibleTargetOptions.map((option) => {
                        const detail = [
                          option.providerLabel,
                          option.stateLabel,
                          option.cwd
                        ].filter(Boolean).join(' · ');
                        const optionTitle = [
                          option.title,
                          option.providerLabel,
                          option.stateLabel,
                          option.current ? t('floatingComposerCurrent') : '',
                          option.cwd
                        ].filter(Boolean).join('\n');

                        return (
                          <button
                            key={option.panel.id}
                            type="button"
                            className={cn(
                              'command-dock-target-option',
                              option.targeted && 'is-selected',
                              option.current && 'is-current',
                              option.sendDisabled && 'is-unavailable'
                            )}
                            role="option"
                            aria-selected={option.targeted}
                            title={optionTitle}
                            onClick={() => handleTargetSelect(option.panel.id)}
                          >
                            <span className={cn('terminal-endpoint-dot', `is-${option.executionState}`)} />
                            <span className="command-dock-target-option-copy">
                              <span className="command-dock-target-option-title-row">
                                <span className="command-dock-target-option-title">{option.title}</span>
                                {option.current && (
                                  <span className="command-dock-target-current">{t('floatingComposerCurrent')}</span>
                                )}
                              </span>
                              <span className="command-dock-target-option-meta">{detail}</span>
                            </span>
                            {option.targeted && <Check className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="command-dock-target-empty">{t('floatingComposerTargetNoMatch')}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardHeader>

        {!collapsed && (
          <>
            <CardContent className="grid gap-2 px-3 pb-3 pt-0">
              {normalizedQuickPrompts.length > 0 && (
                <div className="command-dock-prompt-bar" title={quickPromptsPath || undefined}>
                  <div className="command-dock-prompt-label">
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    <span>{t('quickPrompts')}</span>
                  </div>
                  <div
                    className="command-dock-prompt-list"
                    role="list"
                    aria-label={t('quickPrompts')}
                  >
                    {normalizedQuickPrompts.map((record) => {
                      const title = String(record.title || '').trim()
                        || getQuickPromptTitle?.(record)
                        || t('quickPromptDefaultName');

                      return (
                        <div key={record.id || `${title}-${record.createdAt || record.updatedAt || 0}`} className="command-dock-prompt-item" role="listitem">
                          <button
                            type="button"
                            className="command-dock-prompt-chip"
                            title={`${title}\n${record.prompt}`}
                            onClick={() => onQuickPromptSelect?.(record)}
                            disabled={quickPromptsLoading}
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{title}</span>
                          </button>
                          <CommandDockIconButton
                            label={t('quickPromptDelete')}
                            variant="ghost"
                            className="command-dock-prompt-delete h-7 w-7"
                            onClick={() => onQuickPromptDelete?.(record)}
                            disabled={quickPromptsLoading}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </CommandDockIconButton>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="relative">
                <Textarea
                  ref={inputRef}
                  rows={1}
                  spellCheck={false}
                  value={message}
                  placeholder={targetPanel
                    ? t('floatingComposerPlaceholder', { name: targetPanel.title })
                    : t('floatingComposerUnavailable')}
                  className="min-h-[108px] max-h-[260px] resize-none pb-12 pr-36 font-mono text-sm leading-6"
                  aria-autocomplete="list"
                  aria-controls={skillMention?.open ? 'commandDockSkillMentionList' : undefined}
                  aria-expanded={Boolean(skillMention?.open)}
                  aria-activedescendant={
                    skillMention?.open && skillMentionItems.length > 0
                      ? `commandDockSkillMentionItem-${skillMention.selectedIndex || 0}`
                      : undefined
                  }
                  onChange={onInputChange}
                  onCompositionEnd={onInputCompositionEnd}
                  onCompositionStart={onInputCompositionStart}
                  onDragOver={onInputDragOver}
                  onDrop={onInputDrop}
                  onKeyDown={handleInputKeyDown}
                  onPaste={onInputPaste}
                  onScroll={onInputScroll}
                  onSelect={onInputSelect}
                />
                <div ref={historyRootRef} className="command-dock-history-root">
                  <CommandDockIconButton
                    label={hasCommandHistory ? t('floatingComposerHistory') : t('floatingComposerHistoryEmpty')}
                    variant={historyOpen ? 'primary' : 'outline'}
                    className="absolute bottom-2 right-[72px] h-8 w-8 shadow-sm"
                    aria-controls={historyOpen ? 'commandDockHistoryList' : undefined}
                    aria-expanded={historyOpen}
                    aria-haspopup="menu"
                    onClick={() => setHistoryOpen((current) => !current)}
                    disabled={!hasCommandHistory}
                  >
                    <History className="h-4 w-4" />
                  </CommandDockIconButton>
                  {historyOpen && (
                    <div
                      id="commandDockHistoryList"
                      className="command-dock-history-menu"
                      role="menu"
                      aria-label={t('floatingComposerHistory')}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      <div className="command-dock-history-menu-header">
                        <span>{t('floatingComposerHistory')}</span>
                        <Badge variant="outline" className="command-dock-history-count">
                          {normalizedCommandHistory.length}/10
                        </Badge>
                      </div>
                      <div className="command-dock-history-list">
                        {normalizedCommandHistory.length > 0 ? (
                          normalizedCommandHistory.map((entry, index) => {
                            const preview = formatCommandDockHistoryPreview(entry);

                            return (
                              <button
                                key={`${entry}-${index}`}
                                type="button"
                                className="command-dock-history-item"
                                role="menuitem"
                                title={entry}
                                onClick={() => handleHistorySelect(entry)}
                              >
                                <span className="command-dock-history-index">{index + 1}</span>
                                <span className="command-dock-history-text">
                                  {preview || t('floatingComposerHistoryUntitled')}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="command-dock-history-empty">{t('floatingComposerHistoryEmpty')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {skillMention?.open && (
                  <CommandDockSkillMentionMenu
                    activeIndex={skillMention.selectedIndex || 0}
                    hasAnyItems={skillMentionHasAnyItems}
                    items={skillMentionItems}
                    loading={skillMentionLoading}
                    onSelect={onSkillMentionSelect}
                    position={skillMention.position}
                    t={t}
                  />
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="absolute bottom-2 right-2 h-8 px-3 shadow-sm"
                  onClick={onSend}
                  disabled={!canSend}
                >
                  {t('floatingComposerSend')}
                </Button>
              </div>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={targetPanel?.cwd || undefined}>
                {targetPanel?.cwd
                  ? `${targetPanel.cwd} · ${t('floatingComposerHint', {
                    sendShortcut: sendShortcutLabel,
                    dispatchShortcut: dispatchShortcutLabel
                  })}`
                  : t('floatingComposerUnavailable')}
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  title={quickPromptsPath || t('quickPromptSave')}
                  aria-label={t('quickPromptSave')}
                  onClick={onQuickPromptSave}
                  disabled={!canSaveQuickPrompt}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t('quickPromptSave')}
                </Button>
                <div
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background p-0.5"
                  role="group"
                  aria-label={t('floatingComposerDispatchMode')}
                >
                  {dispatchModeOptions.map((option) => {
                    const active = option.id === normalizedDispatchMode;
                    const OptionIcon = option.Icon;

                    return (
                      <CommandDockTooltipButton
                        key={option.id}
                        type="button"
                        variant={active ? 'primary' : 'ghost'}
                        size="sm"
                        className={cn(
                          'h-6 rounded-sm px-2 text-[11px]',
                          !active && 'text-muted-foreground'
                        )}
                        tooltip={option.tooltip}
                        aria-label={`${t('floatingComposerDispatchMode')}: ${option.label}`}
                        aria-pressed={active}
                        onClick={() => onDispatchModeChange?.(option.id)}
                      >
                        <OptionIcon className="h-3.5 w-3.5" />
                        {option.label}
                      </CommandDockTooltipButton>
                    );
                  })}
                </div>
                <CommandDockTooltipButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  tooltip={dispatchTasksTitle}
                  aria-label={t('floatingComposerDispatchTasks')}
                  onClick={onDispatchTasks}
                  disabled={!canDispatchTasks}
                >
                  <Play className="h-3.5 w-3.5" />
                  {dispatchingTasks ? t('floatingComposerDispatchingTasks') : t('floatingComposerDispatchTasks')}
                </CommandDockTooltipButton>
                <Button
                  type="button"
                  variant={sessionReviewOpen ? 'primary' : 'outline'}
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  title={t(sessionReviewOpen ? 'sessionReviewClose' : 'sessionReviewOpen')}
                  aria-label={t(sessionReviewOpen ? 'sessionReviewClose' : 'sessionReviewOpen')}
                  aria-pressed={sessionReviewOpen}
                  onClick={onToggleSessionReview}
                >
                  <SquareTerminal className="h-3.5 w-3.5" />
                  {t('sessionReview')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  title={t('exportSession')}
                  aria-label={t('exportSession')}
                  onClick={() => canExport && onExport(targetPanel.id)}
                  disabled={!canExport}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('exportSession')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  title={t('exportSessionCustom')}
                  aria-label={t('exportSessionCustom')}
                  onClick={() => canExport && onExportCustom(targetPanel.id)}
                  disabled={!canExport}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t('exportSessionCustom')}
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
