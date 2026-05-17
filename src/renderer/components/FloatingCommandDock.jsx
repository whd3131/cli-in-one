import React from 'react';
import {
  Check,
  Clipboard,
  Download,
  File,
  FolderOpen,
  Image,
  Link2,
  MessageSquarePlus,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  SquareTerminal,
  Trash2,
  X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

function CommandDockMenuButton({ active = false, children, className, Icon, ...props }) {
  return (
    <button
      type="button"
      className={cn('command-dock-menu-item', active && 'is-active', className)}
      {...props}
    >
      {Icon && <Icon className="command-dock-menu-icon" />}
      <span>{children}</span>
      {active && <Check className="command-dock-menu-check" />}
    </button>
  );
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
            const ItemIcon = item.kind === 'directory'
              ? FolderOpen
              : (item.kind === 'skill' ? Sparkles : File);
            const kindLabel = item.kind === 'directory'
              ? t('floatingComposerSkillDirectory')
              : (item.kind === 'skill' ? t('floatingComposerSkillCommand') : t('floatingComposerSkillFile'));

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

function getCommandDockContextIcon(kind) {
  switch (kind) {
    case 'file':
    case 'attachment':
      return File;
    case 'image':
      return Image;
    case 'url':
      return Link2;
    case 'terminal-selection':
    case 'terminal-output':
      return SquareTerminal;
    default:
      return Clipboard;
  }
}

function getCommandDockContextLabel(kind, t) {
  switch (kind) {
    case 'file':
      return t('floatingComposerContextFile');
    case 'attachment':
      return t('floatingComposerContextAttachment');
    case 'image':
      return t('floatingComposerContextImage');
    case 'url':
      return t('floatingComposerContextUrl');
    case 'terminal-selection':
      return t('floatingComposerContextTerminalSelection');
    case 'terminal-output':
      return t('floatingComposerContextTerminalOutput');
    default:
      return t('floatingComposerContextSelectedText');
  }
}

function getCommandDockContextTitle(item, t) {
  return String(
    item?.title
    || item?.path
    || item?.url
    || getCommandDockContextLabel(item?.kind, t)
  ).trim();
}

export function FloatingCommandDock({
  activeId,
  canPanelReceiveInput,
  commandHistory = [],
  contextItems = [],
  contextLoading = false,
  dispatchMode = 'reuse',
  dispatchingTasks,
  dispatchShortcutLabel = 'Ctrl+Enter',
  getExecutionStateLabel,
  getPanelExecutionState,
  getPanelProviderLabel,
  getQuickPromptTitle,
  inputRef,
  message,
  onDispatchModeChange,
  onDispatchTasks,
  onExport,
  onExportCustom,
  onHistorySelect,
  onAddLatestOutputContext,
  onAddSelectedTextContext,
  onAddTerminalSelectionContext,
  onAddUrlContext,
  onClearContext,
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
  onOpenWorkspaceTree,
  onRemoveContextItem,
  onSend,
  onSkillMentionSelect,
  onTargetChange,
  onToggleSessionReview,
  panels,
  quickPrompts = [],
  quickPromptsLoading = false,
  quickPromptsPath = '',
  skillMention,
  skillMentionHasAnyItems,
  skillMentionItems,
  skillMentionLoading,
  sessionReviewOpen = false,
  targetId,
  t
}) {
  const dockRef = React.useRef(null);
  const dockActionsRootRef = React.useRef(null);
  const historyRootRef = React.useRef(null);
  const [actionsMenuOpen, setActionsMenuOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [contextExpanded, setContextExpanded] = React.useState(false);
  const [targetFilter, setTargetFilter] = React.useState('');
  const targetPanel = panels.find((panel) => panel.id === targetId) || null;
  const targetReady = canPanelReceiveInput?.(targetPanel);
  const normalizedContextItems = Array.isArray(contextItems)
    ? contextItems
      .filter((item) => item && typeof item === 'object')
      .slice(0, 24)
    : [];
  const hasContextItems = normalizedContextItems.length > 0;
  const canExport = Boolean(targetPanel);
  const canSend = Boolean(targetReady && (String(message || '').trim() || hasContextItems));
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
  const quickPromptOptions = normalizedQuickPrompts.map((record, index) => {
    const label = String(record.title || '').trim()
      || getQuickPromptTitle?.(record)
      || t('quickPromptDefaultName');

    return {
      label,
      record,
      value: String(record.id || `${label}-${record.createdAt || record.updatedAt || index}`)
    };
  });
  const normalizedCommandHistory = Array.isArray(commandHistory)
    ? commandHistory.map((item) => String(item || '')).filter((item) => item.trim()).slice(0, 10)
    : [];
  const hasCommandHistory = normalizedCommandHistory.length > 0;
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
  const normalizedTargetFilter = targetFilter.trim().toLocaleLowerCase();
  const visibleTargetOptions = normalizedTargetFilter
    ? targetOptions.filter((option) => option.searchText.includes(normalizedTargetFilter))
    : targetOptions;

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
    if (!actionsMenuOpen) {
      return undefined;
    }

    const closeOnPointerDown = (event) => {
      if (!dockActionsRootRef.current?.contains(event.target)) {
        setActionsMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setActionsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionsMenuOpen]);

  React.useEffect(() => {
    if (!actionsMenuOpen) {
      setHistoryOpen(false);
    }
  }, [actionsMenuOpen]);

  React.useEffect(() => {
    if (!actionsMenuOpen && targetFilter) {
      setTargetFilter('');
    }
  }, [actionsMenuOpen, targetFilter]);

  const handleInputKeyDown = (event) => {
    onInputKeyDown?.(event);
  };

  const handleHistorySelect = (entry) => {
    setHistoryOpen(false);
    setActionsMenuOpen(false);
    onHistorySelect?.(entry);
  };

  const handleTargetSelect = (id) => {
    onTargetChange?.(id);
    setActionsMenuOpen(false);
  };

  const handleQuickPromptOptionSelect = (nextValue) => {
    const option = quickPromptOptions.find((item) => item.value === String(nextValue || ''));
    if (!option) {
      return;
    }

    setActionsMenuOpen(false);
    onQuickPromptSelect?.(option.record);
  };

  const handleQuickPromptDeleteClick = (option) => {
    if (!option) {
      return;
    }

    onQuickPromptDelete?.(option.record);
  };

  const runActionMenuHandler = (handler, ...args) => {
    setActionsMenuOpen(false);
    handler?.(...args);
  };

  const plusButtonLabel = hasContextItems
    ? `${t('floatingComposerMoreActions')} · ${t('floatingComposerContextCount', { count: normalizedContextItems.length })}`
    : t('floatingComposerMoreActions');

  return (
    <div
      ref={dockRef}
      className="pointer-events-none fixed bottom-3 left-1/2 z-[7000] w-[calc(100vw-20px)] max-w-[980px] -translate-x-1/2 md:bottom-[18px] md:w-[calc(100vw-32px)]"
    >
      <Card
        className="command-dock-card command-dock-simple pointer-events-auto overflow-visible shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onDragOver={onInputDragOver}
        onDrop={onInputDrop}
      >
        <div className="command-dock-simple-row">
          <div className="command-dock-actions-menu-root command-dock-plus-root" ref={dockActionsRootRef}>
            <CommandDockIconButton
              label={plusButtonLabel}
              variant={actionsMenuOpen ? 'primary' : 'outline'}
              className="command-dock-plus-button"
              aria-controls={actionsMenuOpen ? 'commandDockActionsMenu' : undefined}
              aria-expanded={actionsMenuOpen}
              aria-haspopup="dialog"
              onClick={() => setActionsMenuOpen((current) => !current)}
            >
              <Plus className="h-4 w-4" />
            </CommandDockIconButton>

            {actionsMenuOpen && (
              <div
                id="commandDockActionsMenu"
                className="command-dock-actions-menu command-dock-plus-menu"
                role="dialog"
                aria-label={t('floatingComposerMoreActions')}
              >
                <div className="command-dock-plus-section">
                  <div className="command-dock-menu-label">{t('floatingComposerTarget')}</div>
                  <label className="command-dock-target-search command-dock-plus-search">
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
                      className="command-dock-target-list command-dock-plus-target-list"
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

                {quickPromptOptions.length > 0 && (
                  <div className="command-dock-plus-section">
                    <div className="command-dock-menu-label">{t('quickPrompts')}</div>
                    <div className="command-dock-plus-prompt-list">
                      {quickPromptOptions.map((option) => (
                        <div className="command-dock-plus-prompt-row" key={option.value}>
                          <button
                            type="button"
                            className="command-dock-plus-prompt-button"
                            title={option.label}
                            onClick={() => handleQuickPromptOptionSelect(option.value)}
                          >
                            {option.label}
                          </button>
                          <CommandDockIconButton
                            label={`${t('quickPromptDelete')}: ${option.label}`}
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleQuickPromptDeleteClick(option)}
                            disabled={quickPromptsLoading}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </CommandDockIconButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasCommandHistory && (
                  <div className="command-dock-plus-section" ref={historyRootRef}>
                    <button
                      type="button"
                      className="command-dock-plus-section-header"
                      aria-expanded={historyOpen}
                      onClick={() => setHistoryOpen((current) => !current)}
                    >
                      <span>{t('floatingComposerHistory')}</span>
                      <Badge variant="outline" className="command-dock-history-count">
                        {normalizedCommandHistory.length}/10
                      </Badge>
                    </button>
                    {historyOpen && (
                      <div className="command-dock-history-list command-dock-plus-history-list">
                        {normalizedCommandHistory.map((entry, index) => {
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
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="command-dock-plus-section">
                  <div className="command-dock-menu-label">{t('floatingComposerContextPack')}</div>
                  <div className="command-dock-plus-action-grid">
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={FolderOpen}
                      disabled={typeof onOpenWorkspaceTree !== 'function'}
                      onClick={() => runActionMenuHandler(onOpenWorkspaceTree)}
                    >
                      {t('floatingComposerContextAddFile')}
                    </CommandDockMenuButton>
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={Clipboard}
                      disabled={typeof onAddSelectedTextContext !== 'function'}
                      onClick={() => runActionMenuHandler(onAddSelectedTextContext)}
                    >
                      {t('floatingComposerContextAddSelectedText')}
                    </CommandDockMenuButton>
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={SquareTerminal}
                      disabled={typeof onAddTerminalSelectionContext !== 'function'}
                      onClick={() => runActionMenuHandler(onAddTerminalSelectionContext)}
                    >
                      {t('floatingComposerContextAddTerminalSelection')}
                    </CommandDockMenuButton>
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={RefreshCw}
                      disabled={typeof onAddLatestOutputContext !== 'function' || !targetPanel}
                      onClick={() => runActionMenuHandler(onAddLatestOutputContext)}
                    >
                      {t('floatingComposerContextAddLatestOutput')}
                    </CommandDockMenuButton>
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={Link2}
                      disabled={typeof onAddUrlContext !== 'function' || contextLoading}
                      onClick={() => runActionMenuHandler(onAddUrlContext)}
                    >
                      {t('floatingComposerContextAddUrl')}
                    </CommandDockMenuButton>
                    <CommandDockMenuButton
                      role="menuitem"
                      Icon={X}
                      disabled={!hasContextItems || typeof onClearContext !== 'function'}
                      onClick={() => runActionMenuHandler(onClearContext)}
                    >
                      {t('floatingComposerContextClear')}
                    </CommandDockMenuButton>
                  </div>
                </div>

                {hasContextItems && (
                  <div className="command-dock-plus-section">
                    <button
                      type="button"
                      className="command-dock-plus-section-header"
                      aria-expanded={contextExpanded}
                      onClick={() => setContextExpanded((current) => !current)}
                    >
                      <span>{t('floatingComposerContextPack')}</span>
                      <Badge variant="outline" className="command-dock-context-count">
                        {t('floatingComposerContextCount', { count: normalizedContextItems.length })}
                      </Badge>
                    </button>
                    {contextExpanded && (
                      <div className="command-dock-context-list command-dock-plus-context-list">
                        {normalizedContextItems.map((item) => {
                          const Icon = getCommandDockContextIcon(item.kind);
                          const label = getCommandDockContextLabel(item.kind, t);
                          const title = getCommandDockContextTitle(item, t);
                          const detail = [
                            label,
                            item.path,
                            item.url,
                            item.panelTitle,
                            item.truncated ? 'truncated' : ''
                          ].filter(Boolean).join('\n');

                          return (
                            <div
                              key={item.id || `${item.kind}:${title}`}
                              className="command-dock-context-chip"
                              title={detail || title}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="command-dock-context-kind">{label}</span>
                              <span className="command-dock-context-title">{title}</span>
                              <button
                                type="button"
                                className="command-dock-context-remove"
                                aria-label={`${t('floatingComposerContextRemove')}: ${title}`}
                                title={t('floatingComposerContextRemove')}
                                onClick={() => onRemoveContextItem?.(item.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="command-dock-plus-section">
                  <div className="command-dock-menu-label">{t('floatingComposerDispatchMode')}</div>
                  {dispatchModeOptions.map((option) => {
                    const active = option.id === normalizedDispatchMode;
                    const OptionIcon = option.Icon;

                    return (
                      <CommandDockMenuButton
                        key={option.id}
                        role="menuitemradio"
                        Icon={OptionIcon}
                        active={active}
                        aria-pressed={active}
                        title={option.tooltip}
                        onClick={() => runActionMenuHandler(onDispatchModeChange, option.id)}
                      >
                        {option.label}
                      </CommandDockMenuButton>
                    );
                  })}
                  <div className="command-dock-menu-separator" />
                  <CommandDockMenuButton
                    role="menuitem"
                    Icon={Play}
                    title={dispatchTasksTitle}
                    disabled={!canDispatchTasks}
                    onClick={() => runActionMenuHandler(onDispatchTasks)}
                  >
                    {dispatchingTasks ? t('floatingComposerDispatchingTasks') : t('floatingComposerDispatchTasks')}
                  </CommandDockMenuButton>
                  <CommandDockMenuButton
                    role="menuitem"
                    Icon={Save}
                    title={quickPromptsPath || t('quickPromptSave')}
                    disabled={!canSaveQuickPrompt}
                    onClick={() => runActionMenuHandler(onQuickPromptSave)}
                  >
                    {t('quickPromptSave')}
                  </CommandDockMenuButton>
                  <CommandDockMenuButton
                    role="menuitem"
                    Icon={SquareTerminal}
                    active={sessionReviewOpen}
                    onClick={() => runActionMenuHandler(onToggleSessionReview)}
                  >
                    {t('sessionReview')}
                  </CommandDockMenuButton>
                  <CommandDockMenuButton
                    role="menuitem"
                    Icon={Download}
                    disabled={!canExport}
                    onClick={() => canExport && runActionMenuHandler(onExport, targetPanel.id)}
                  >
                    {t('exportSession')}
                  </CommandDockMenuButton>
                  <CommandDockMenuButton
                    role="menuitem"
                    Icon={FolderOpen}
                    disabled={!canExport}
                    onClick={() => canExport && runActionMenuHandler(onExportCustom, targetPanel.id)}
                  >
                    {t('exportSessionCustom')}
                  </CommandDockMenuButton>
                </div>
              </div>
            )}
          </div>

          <div className="command-dock-simple-input-wrap">
            <Textarea
              ref={inputRef}
              rows={1}
              spellCheck={false}
              value={message}
              placeholder={targetPanel
                ? t('floatingComposerPlaceholder', { name: targetPanel.title })
                : t('floatingComposerUnavailable')}
              className="command-dock-simple-textarea resize-none font-mono text-sm leading-5"
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
          </div>

          <Button
            type="button"
            variant="primary"
            className="command-dock-simple-send"
            onClick={onSend}
            disabled={!canSend}
          >
            {t('floatingComposerSend')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
