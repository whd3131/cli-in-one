export const workspaceTreeFileDragType = 'application/x-cli-in-one-workspace-file';

export function getWorkspaceTreeInsertPath(node, normalizePath) {
  if (!node || (node.type !== 'file' && node.type !== 'link')) {
    return '';
  }

  const rawPath = node.relativePath || node.path || '';
  return normalizePath ? normalizePath(rawPath) : String(rawPath || '').replace(/\\/g, '/');
}

export function getWorkspaceTreeDragPath(node, normalizePath) {
  if (!node || (node.type !== 'file' && node.type !== 'link' && node.type !== 'directory')) {
    return '';
  }

  const rawPath = node.relativePath || node.path || '';
  return normalizePath ? normalizePath(rawPath) : String(rawPath || '').replace(/\\/g, '/');
}

export function formatWorkspaceTreeSummary(snapshot, t) {
  if (!snapshot) {
    return '';
  }

  if (!snapshot.directoryCount && !snapshot.fileCount) {
    return t('workspaceTreeEmpty');
  }

  if (snapshot.omittedCount > 0) {
    return t('workspaceTreeSummaryWithOmitted', {
      directories: snapshot.directoryCount,
      files: snapshot.fileCount,
      omitted: snapshot.omittedCount
    });
  }

  return t('workspaceTreeSummary', {
    directories: snapshot.directoryCount,
    files: snapshot.fileCount
  });
}
