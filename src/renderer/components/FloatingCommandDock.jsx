import React from 'react';
import {
  Download,
  File,
  FolderOpen,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Play,
  RefreshCw,
  Save,
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

function isCommandDockDispatchShortcut(event) {
  if (!event?.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return false;
  }

  return event.key === 'Enter'
    || event.code === 'Enter'
    || event.nativeEvent?.key === 'Enter'
    || event.nativeEvent?.code === 'Enter'
    || event.keyCode === 13
    || event.which === 13;
}

function isCommandDockComposing(event) {
  return Boolean(
    event?.nativeEvent?.isComposing
      || event?.keyCode === 229
      || event?.which === 229
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

export function FloatingCommandDock({
  activeId,
  canPanelReceiveInput,
  collapsed,
  dispatchingTasks,
  getExecutionStateLabel,
  getPanelExecutionState,
  getPanelProviderLabel,
  getQuickPromptTitle,
  inputRef,
  message,
  onDispatchTasks,
  onExport,
  onExportCustom,
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
  onSend,
  onSkillMentionSelect,
  onTargetChange,
  onToggleCollapsed,
  panels,
  quickPrompts = [],
  quickPromptsLoading = false,
  quickPromptsPath = '',
  renderProviderBadge,
  skillMention,
  skillMentionHasAnyItems,
  skillMentionItems,
  skillMentionLoading,
  targetId,
  t
}) {
  const targetPanel = panels.find((panel) => panel.id === targetId) || null;
  const targetReady = canPanelReceiveInput?.(targetPanel);
  const canExport = Boolean(targetPanel);
  const canSend = Boolean(targetReady && String(message || '').trim());
  const canDispatchTasks = parseCommandDockDispatchTasks(message).length > 0 && !dispatchingTasks;
  const canSaveQuickPrompt = Boolean(String(message || '').trim() && !quickPromptsLoading);
  const normalizedQuickPrompts = Array.isArray(quickPrompts)
    ? quickPrompts.filter((record) => String(record?.prompt || '').trim())
    : [];
  const targetSummary = targetPanel
    ? t('floatingComposerSubtitle', { name: targetPanel.title })
    : t('floatingComposerUnavailable');
  const handleInputKeyDown = (event) => {
    if (isCommandDockDispatchShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (!isCommandDockComposing(event)) {
        onDispatchTasks?.();
      }
      return;
    }

    onInputKeyDown?.(event);
  };

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-[7000] w-[calc(100%-20px)] max-w-[980px] -translate-x-1/2 md:bottom-[18px] md:w-[calc(100%-32px)]">
      <Card
        className="pointer-events-auto overflow-visible shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onDragOver={onInputDragOver}
        onDrop={onInputDrop}
      >
        <CardHeader className={cn('px-3', collapsed ? 'gap-1 py-2.5' : 'gap-2 py-3')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-center gap-2">
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
            <div
              className="flex max-h-32 flex-wrap gap-2 overflow-x-hidden overflow-y-auto pr-1"
              role="group"
              aria-label={t('floatingComposerTarget')}
            >
              {panels.map((panel) => {
                const executionState = getPanelExecutionState?.(panel) || 'idle';
                const sendDisabled = !canPanelReceiveInput?.(panel);
                const current = panel.id === activeId;
                const targeted = panel.id === targetId;
                const providerLabel = getPanelProviderLabel?.(panel) || '';
                const stateLabel = getExecutionStateLabel?.(executionState, t) || executionState;
                const summary = [
                  panel.title,
                  providerLabel,
                  stateLabel,
                  current ? t('floatingComposerCurrent') : ''
                ].filter(Boolean).join(', ');

                return (
                  <Button
                    key={panel.id}
                    type="button"
                    variant={targeted ? 'primary' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-8 min-w-0 max-w-full basis-[220px] justify-start gap-1.5 px-2.5 text-[11px]',
                      current && !targeted && 'border-primary/35',
                      sendDisabled && 'opacity-60'
                    )}
                    aria-pressed={targeted}
                    title={`${summary}\n${panel.cwd}`}
                    onClick={() => onTargetChange(panel.id)}
                  >
                    <span className={cn('shrink-0 terminal-endpoint-dot', `is-${executionState}`)} />
                    <span className={cn(
                      'min-w-0 truncate whitespace-nowrap',
                      targeted ? 'text-primary-foreground' : 'text-foreground'
                    )}>
                      {summary}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </CardHeader>

        {!collapsed && (
          <>
            <CardContent className="grid gap-2 px-3 pb-3 pt-0">
              <div className="command-dock-prompt-bar" title={quickPromptsPath || undefined}>
                {normalizedQuickPrompts.length > 0 && (
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
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 px-2"
                  title={quickPromptsPath || t('quickPromptSave')}
                  aria-label={t('quickPromptSave')}
                  onClick={onQuickPromptSave}
                  disabled={!canSaveQuickPrompt}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t('quickPromptSave')}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  ref={inputRef}
                  rows={1}
                  spellCheck={false}
                  value={message}
                  placeholder={targetPanel
                    ? t('floatingComposerPlaceholder', { name: targetPanel.title })
                    : t('floatingComposerUnavailable')}
                  className="min-h-[108px] max-h-[260px] resize-none pb-12 pr-24 font-mono text-sm leading-6"
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
                  ? `${targetPanel.cwd} · ${t('floatingComposerHint')}`
                  : t('floatingComposerUnavailable')}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  title={t('floatingComposerDispatchTasksTitle')}
                  aria-label={t('floatingComposerDispatchTasks')}
                  onClick={onDispatchTasks}
                  disabled={!canDispatchTasks}
                >
                  <Play className="h-3.5 w-3.5" />
                  {dispatchingTasks ? t('floatingComposerDispatchingTasks') : t('floatingComposerDispatchTasks')}
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
