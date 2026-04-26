import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatWorkspaceTreeSummary,
  getWorkspaceTreeInsertPath
} from '@/lib/workspaceTree';

function TreeIconButton({ label, children, ...props }) {
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

function getWorkspaceTreeNodeLabel(node, t) {
  if (!node) {
    return '';
  }

  if (node.type === 'omitted') {
    return t('workspaceTreeOmitted', { count: node.omittedCount || 0 });
  }

  if (node.type === 'depth-limit') {
    return t('workspaceTreeDepthLimit');
  }

  if (node.type === 'unreadable') {
    return t('workspaceTreeUnreadable', { message: node.message || 'error' });
  }

  return node.name || node.relativePath || node.path || '';
}

function WorkspaceTreeNode({
  depth = 0,
  expandedIds,
  node,
  normalizeInsertPath,
  onInsert,
  onSelect,
  onToggle,
  selectedNodeId,
  t
}) {
  const children = Array.isArray(node?.children) ? node.children : [];
  const directory = node?.type === 'directory';
  const notice = node?.type === 'omitted' || node?.type === 'depth-limit' || node?.type === 'unreadable';
  const canExpand = directory && children.length > 0;
  const expanded = canExpand && expandedIds.has(node.id);
  const label = getWorkspaceTreeNodeLabel(node, t);
  const insertPath = getWorkspaceTreeInsertPath(node, normalizeInsertPath);
  const selectable = Boolean(insertPath);
  const selected = selectable && node?.id === selectedNodeId;
  const title = [node?.relativePath || label, node?.path].filter(Boolean).join('\n');
  const rowClassName = cn(
    'workspace-tree-row',
    directory && 'is-directory',
    notice && 'is-notice',
    selected && 'is-selected',
    node?.type === 'unreadable' && 'is-error'
  );
  const rowStyle = { '--tree-indent': `${depth * 14}px` };
  const fileIcon = node?.type === 'link' ? ExternalLink : File;
  const NodeIcon = directory ? (expanded ? FolderOpen : Folder) : fileIcon;
  const rowChildren = (
    <>
      <span className="workspace-tree-expander" aria-hidden="true">
        {canExpand ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
        ) : null}
      </span>
      <NodeIcon className="workspace-tree-node-icon h-3.5 w-3.5" />
      <span className="workspace-tree-node-name">{label}</span>
      {node?.ignored && <span className="workspace-tree-node-tag">{t('workspaceTreeIgnored')}</span>}
      {node?.link && <span className="workspace-tree-node-tag">{t('workspaceTreeLink')}</span>}
    </>
  );
  const interactive = canExpand || selectable;
  const handleClick = () => {
    if (canExpand) {
      onToggle(node.id);
      return;
    }

    if (selectable) {
      onSelect?.(node);
    }
  };
  const handleDoubleClick = () => {
    if (selectable) {
      onInsert?.(node);
    }
  };

  return (
    <li
      role="treeitem"
      aria-expanded={canExpand ? expanded : undefined}
      aria-level={depth + 1}
      aria-selected={selectable ? selected : undefined}
    >
      {interactive ? (
        <button
          type="button"
          className={rowClassName}
          style={rowStyle}
          title={title || undefined}
          aria-pressed={selectable ? selected : undefined}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          {rowChildren}
        </button>
      ) : (
        <div className={rowClassName} style={rowStyle} title={title || undefined}>
          {rowChildren}
        </div>
      )}

      {canExpand && expanded && (
        <ul className="workspace-tree-children" role="group">
          {children.map((child) => (
            <WorkspaceTreeNode
              key={child.id || `${node.id}:${child.name}`}
              depth={depth + 1}
              expandedIds={expandedIds}
              node={child}
              normalizeInsertPath={normalizeInsertPath}
              onInsert={onInsert}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedNodeId={selectedNodeId}
              t={t}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function WorkspaceTreeView({ normalizeInsertPath, onInsert, onSelect, root, selectedNodeId, t }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    setExpandedIds(root?.id ? new Set([root.id]) : new Set());
  }, [root?.id]);

  const toggleNode = useCallback((nodeId) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  if (!root) {
    return null;
  }

  return (
    <ul className="workspace-tree-list" role="tree">
      <WorkspaceTreeNode
        expandedIds={expandedIds}
        node={root}
        normalizeInsertPath={normalizeInsertPath}
        onInsert={onInsert}
        onSelect={onSelect}
        onToggle={toggleNode}
        selectedNodeId={selectedNodeId}
        t={t}
      />
    </ul>
  );
}

function WorkspaceTreeContent({ normalizeInsertPath, onInsert, onSelect, selectedNodeId, state, t }) {
  const snapshot = state.snapshot;
  const root = snapshot?.root || null;

  if (state.status === 'loading' && !root) {
    return (
      <div className="workspace-tree-placeholder">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>{t('workspaceTreeLoading')}</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="workspace-tree-placeholder is-error">
        {state.error || t('workspaceTreeNoData')}
      </div>
    );
  }

  if (!root) {
    return (
      <div className="workspace-tree-placeholder">
        {t('workspaceTreeNoData')}
      </div>
    );
  }

  return (
    <WorkspaceTreeView
      normalizeInsertPath={normalizeInsertPath}
      onInsert={onInsert}
      onSelect={onSelect}
      root={root}
      selectedNodeId={selectedNodeId}
      t={t}
    />
  );
}

export function WorkspaceTreeSidebar({
  canInsertToComposer,
  currentPath,
  normalizeInsertPath,
  onClose,
  onCopy,
  onInsertNode,
  onInsertSelected,
  onOpen,
  onRefresh,
  onSelectNode,
  open,
  selectedNodeId,
  selectedPath,
  state,
  t
}) {
  const snapshot = state.snapshot;
  const currentTreePath = snapshot?.cwd || state.requestedPath || currentPath || '';
  const summary = state.status === 'error'
    ? state.error || t('workspaceTreeNoData')
    : formatWorkspaceTreeSummary(snapshot, t);
  const loading = state.status === 'loading';
  const selectionSummary = selectedPath
    ? t('workspaceTreeSelectedFile', { path: selectedPath })
    : t('workspaceTreeSelectFileHint');

  return (
    <aside className={cn('workspace-tree-sidebar', open && 'is-open')} aria-label={t('workspaceTreeTitle')}>
      {!open && (
        <div className="workspace-tree-rail">
          <TreeIconButton
            id="openWorkspaceTree"
            label={t('workspaceTreeOpen')}
            disabled={!currentPath}
            onClick={onOpen}
          >
            <PanelRightOpen className="h-4 w-4" />
          </TreeIconButton>
        </div>
      )}

      {open && (
        <section className="workspace-tree-panel">
          <header className="workspace-tree-panel-header">
            <div className="min-w-0">
              <div className="workspace-tree-panel-title">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span>{t('workspaceTree')}</span>
              </div>
              <div className="workspace-tree-path" title={currentTreePath || undefined}>
                {currentTreePath || t('workspaceTreeUnavailable')}
              </div>
            </div>
            <TreeIconButton label={t('workspaceTreeClose')} variant="ghost" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </TreeIconButton>
          </header>

          <div className="workspace-tree-panel-meta">
            <div className="min-w-0 flex-1">
              <div className={cn('workspace-tree-summary', state.status === 'error' && 'is-error')}>
                {loading ? t('workspaceTreeLoading') : (summary || t('workspaceTreeNoData'))}
              </div>
              <div
                className={cn('workspace-tree-selection', !selectedPath && 'is-empty')}
                title={selectedPath || undefined}
              >
                {selectionSummary}
              </div>
            </div>
            <div className="workspace-tree-actions">
              <TreeIconButton
                label={t('reload')}
                variant="ghost"
                disabled={!currentPath || loading}
                onClick={onRefresh}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </TreeIconButton>
              <TreeIconButton
                label={t('workspaceTreeInsertToComposer')}
                variant="ghost"
                disabled={!selectedPath || !canInsertToComposer}
                onClick={onInsertSelected}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </TreeIconButton>
              <TreeIconButton
                label={t('copy')}
                variant="ghost"
                disabled={!snapshot?.root || loading}
                onClick={onCopy}
              >
                <Copy className="h-4 w-4" />
              </TreeIconButton>
            </div>
          </div>

          <div className="workspace-tree-panel-body">
            <WorkspaceTreeContent
              normalizeInsertPath={normalizeInsertPath}
              onInsert={canInsertToComposer ? onInsertNode : undefined}
              onSelect={onSelectNode}
              selectedNodeId={selectedNodeId}
              state={state}
              t={t}
            />
          </div>
        </section>
      )}
    </aside>
  );
}
