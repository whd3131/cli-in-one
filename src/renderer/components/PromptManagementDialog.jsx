import React from 'react';
import { Copy, FileText, Image, PencilLine, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function trimTrailingLineBreaks(value) {
  return String(value || '').replace(/(?:\r\n|\r|\n)+$/g, '');
}

function deriveQuickPromptTitle(prompt, fallback) {
  const firstLine = String(prompt || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || fallback).slice(0, 48);
}

function createQuickPromptDraft(record, fallbackTitle = '') {
  const prompt = String(record?.prompt || '');
  const title = String(record?.title || '').trim()
    || (prompt ? deriveQuickPromptTitle(prompt, fallbackTitle) : '');

  return {
    id: String(record?.id || '').trim(),
    title,
    prompt,
    attachments: normalizeQuickPromptAttachments(record?.attachments)
  };
}

function createAttachmentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAttachmentTitle(record) {
  const path = String(record?.path || '').trim().replace(/\\/g, '/');
  return String(record?.title || record?.name || '').trim()
    || path.split('/').filter(Boolean).pop()
    || '';
}

function normalizeQuickPromptAttachments(value) {
  return (Array.isArray(value) ? value : [])
    .map((record) => {
      if (!record || typeof record !== 'object') {
        return null;
      }

      const path = String(record.path || '').trim();
      const content = String(record.content || '');
      const title = getAttachmentTitle(record);
      if (!path && !content.trim()) {
        return null;
      }

      return {
        id: String(record.id || '').trim() || createAttachmentId(),
        kind: record.kind === 'image' ? 'image' : 'file',
        title,
        path,
        content,
        size: Number.isFinite(record.size) ? record.size : null,
        mimeType: String(record.mimeType || '').trim(),
        truncated: Boolean(record.truncated),
        binary: Boolean(record.binary)
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function formatAttachmentSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) {
    return '';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function PromptManagementDialog({
  loading = false,
  onChooseAttachments,
  onCopy,
  onDelete,
  onOpenChange,
  onReload,
  onSave,
  open,
  prompts = [],
  promptsPath = '',
  showToast,
  t
}) {
  const fallbackTitle = t('quickPromptDefaultName');
  const normalizedPrompts = React.useMemo(() => (
    Array.isArray(prompts)
      ? prompts.filter((record) => String(record?.prompt || '').trim())
      : []
  ), [prompts]);
  const [selectedId, setSelectedId] = React.useState('');
  const [draft, setDraft] = React.useState(() => createQuickPromptDraft(null, fallbackTitle));
  const [dirty, setDirty] = React.useState(false);
  const [creatingNew, setCreatingNew] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [statusTone, setStatusTone] = React.useState('');
  const busy = loading || saving;
  const draftAttachments = normalizeQuickPromptAttachments(draft.attachments);

  const setStatusMessage = React.useCallback((message, tone = '') => {
    setStatus(message);
    setStatusTone(tone);
  }, []);

  const selectedPrompt = React.useMemo(() => (
    normalizedPrompts.find((record) => String(record.id || '') === selectedId) || null
  ), [normalizedPrompts, selectedId]);

  const getPromptTitle = React.useCallback((record) => {
    const prompt = String(record?.prompt || '');
    return String(record?.title || '').trim()
      || deriveQuickPromptTitle(prompt, fallbackTitle);
  }, [fallbackTitle]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    onReload?.().catch((error) => {
      const message = error?.message || String(error);
      setStatusMessage(message, 'error');
      showToast?.(t('quickPromptLoadFailed', { message }));
    });
  }, [onReload, open, setStatusMessage, showToast, t]);

  React.useEffect(() => {
    if (!open || dirty || creatingNew) {
      return;
    }

    if (selectedPrompt) {
      setDraft(createQuickPromptDraft(selectedPrompt, fallbackTitle));
      return;
    }

    if (normalizedPrompts.length > 0) {
      const firstPrompt = normalizedPrompts[0];
      setSelectedId(String(firstPrompt.id || ''));
      setDraft(createQuickPromptDraft(firstPrompt, fallbackTitle));
      return;
    }

    setSelectedId('');
    setDraft(createQuickPromptDraft(null, fallbackTitle));
  }, [creatingNew, dirty, fallbackTitle, normalizedPrompts, open, selectedPrompt]);

  const confirmDiscardDirty = React.useCallback(() => (
    !dirty || window.confirm(t('promptManagerDiscardConfirm'))
  ), [dirty, t]);

  const handleOpenChange = React.useCallback((nextOpen) => {
    if (!nextOpen && !confirmDiscardDirty()) {
      return;
    }

    if (!nextOpen) {
      setDirty(false);
      setCreatingNew(false);
      setStatusMessage('');
    }
    onOpenChange?.(nextOpen);
  }, [confirmDiscardDirty, onOpenChange, setStatusMessage]);

  const selectPrompt = React.useCallback((record) => {
    if (!record || !confirmDiscardDirty()) {
      return;
    }

    setSelectedId(String(record.id || ''));
    setDraft(createQuickPromptDraft(record, fallbackTitle));
    setCreatingNew(false);
    setDirty(false);
    setStatusMessage('');
  }, [confirmDiscardDirty, fallbackTitle, setStatusMessage]);

  const startNewPrompt = React.useCallback(() => {
    if (!confirmDiscardDirty()) {
      return;
    }

    setSelectedId('');
    setDraft(createQuickPromptDraft(null, fallbackTitle));
    setCreatingNew(true);
    setDirty(false);
    setStatusMessage('');
  }, [confirmDiscardDirty, fallbackTitle, setStatusMessage]);

  const updateDraft = React.useCallback((field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
    setDirty(true);
    setStatusMessage('');
  }, [setStatusMessage]);

  const addAttachments = React.useCallback(async (kind) => {
    if (typeof onChooseAttachments !== 'function') {
      return;
    }

    setSaving(true);
    try {
      const attachments = normalizeQuickPromptAttachments(await onChooseAttachments({ kind }));
      if (attachments.length === 0) {
        return;
      }

      setDraft((current) => ({
        ...current,
        attachments: normalizeQuickPromptAttachments([
          ...(Array.isArray(current.attachments) ? current.attachments : []),
          ...attachments
        ])
      }));
      setDirty(true);
      setStatusMessage('');
    } catch (error) {
      const message = error?.message || String(error);
      setStatusMessage(message, 'error');
      showToast?.(t('promptManagerAttachmentAddFailed', { message }));
    } finally {
      setSaving(false);
    }
  }, [onChooseAttachments, setStatusMessage, showToast, t]);

  const removeAttachment = React.useCallback((id) => {
    const attachmentId = String(id || '').trim();
    if (!attachmentId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      attachments: normalizeQuickPromptAttachments(current.attachments)
        .filter((attachment) => attachment.id !== attachmentId)
    }));
    setDirty(true);
    setStatusMessage('');
  }, [setStatusMessage]);

  const copyPrompt = React.useCallback(() => {
    const prompt = trimTrailingLineBreaks(draft.prompt);
    if (!prompt.trim()) {
      setStatusMessage(t('quickPromptContentRequired'), 'error');
      showToast?.(t('quickPromptContentRequired'));
      return;
    }

    if (onCopy?.(prompt)) {
      setStatusMessage(t('quickPromptCopied'), 'ok');
      showToast?.(t('quickPromptCopied'));
    }
  }, [draft.prompt, onCopy, setStatusMessage, showToast, t]);

  const reloadPrompts = React.useCallback(async () => {
    if (!confirmDiscardDirty()) {
      return;
    }

    setStatusMessage(t('loading'));
    try {
      await onReload?.();
      setDirty(false);
      setStatusMessage(t('quickConfigLoaded'), 'ok');
    } catch (error) {
      const message = error?.message || String(error);
      setStatusMessage(message, 'error');
      showToast?.(t('quickPromptLoadFailed', { message }));
    }
  }, [confirmDiscardDirty, onReload, setStatusMessage, showToast, t]);

  const savePrompt = React.useCallback(async () => {
    const prompt = trimTrailingLineBreaks(draft.prompt);
    if (!prompt.trim()) {
      setStatusMessage(t('quickPromptContentRequired'), 'error');
      showToast?.(t('quickPromptContentRequired'));
      return;
    }

    const title = String(draft.title || '').trim() || deriveQuickPromptTitle(prompt, fallbackTitle);
    setSaving(true);
    try {
      const store = await onSave?.({
        ...(draft.id ? { id: draft.id } : {}),
        title,
        prompt,
        attachments: normalizeQuickPromptAttachments(draft.attachments)
      });
      const savedPrompt = store?.savedPrompt
        || (Array.isArray(store?.prompts) ? store.prompts.find((record) => record.id === draft.id) : null)
        || (Array.isArray(store?.prompts)
          ? store.prompts.find((record) => record.title === title && record.prompt === prompt)
          : null)
        || { id: draft.id, title, prompt };
      const savedTitle = getPromptTitle(savedPrompt);

      setSelectedId(String(savedPrompt.id || ''));
      setDraft(createQuickPromptDraft(savedPrompt, fallbackTitle));
      setCreatingNew(false);
      setDirty(false);
      setStatusMessage(t('promptManagerSaved', { name: savedTitle }), 'ok');
      showToast?.(t('quickPromptSaved', { name: savedTitle }));
    } catch (error) {
      const message = error?.message || String(error);
      setStatusMessage(message, 'error');
      showToast?.(t('quickPromptSaveFailed', { message }));
    } finally {
      setSaving(false);
    }
  }, [draft.attachments, draft.id, draft.prompt, draft.title, fallbackTitle, getPromptTitle, onSave, setStatusMessage, showToast, t]);

  const deletePrompt = React.useCallback(async () => {
    const promptId = String(draft.id || '').trim();
    if (!promptId) {
      startNewPrompt();
      return;
    }

    const title = String(draft.title || '').trim()
      || deriveQuickPromptTitle(draft.prompt, fallbackTitle);
    if (!window.confirm(t('quickPromptDeleteConfirm', { name: title }))) {
      return;
    }

    setSaving(true);
    try {
      const store = await onDelete?.(promptId);
      const nextPrompts = Array.isArray(store?.prompts) ? store.prompts : [];
      const nextPrompt = nextPrompts[0] || null;
      const deletedTitle = store?.deletedPrompt ? getPromptTitle(store.deletedPrompt) : title;

      setSelectedId(String(nextPrompt?.id || ''));
      setDraft(createQuickPromptDraft(nextPrompt, fallbackTitle));
      setDirty(false);
      setStatusMessage(t('promptManagerDeleted', { name: deletedTitle }), 'ok');
      showToast?.(t('quickPromptDeleted', { name: deletedTitle }));
    } catch (error) {
      const message = error?.message || String(error);
      setStatusMessage(message, 'error');
      showToast?.(t('quickPromptDeleteFailed', { message }));
    } finally {
      setSaving(false);
    }
  }, [draft.id, draft.prompt, draft.title, fallbackTitle, getPromptTitle, onDelete, setStatusMessage, showToast, startNewPrompt, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id="promptManagerDialog"
        className="left-4 bottom-4 right-auto top-auto grid h-[min(720px,calc(100vh-96px))] max-h-[calc(100vh-96px)] w-[min(900px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="h-4 w-4" />
            {t('promptManagerTitle')}
          </DialogTitle>
          <DialogDescription title={promptsPath || undefined}>
            {promptsPath || t('promptManagerDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 p-3 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 rounded-md border border-border bg-muted/35 p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t('quickPrompts')}</div>
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="outline" className="shrink-0 text-[11px]">
                  {t('promptManagerCount', { count: normalizedPrompts.length })}
                </Badge>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              {normalizedPrompts.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-8 text-center text-sm text-muted-foreground">
                  {loading ? t('loading') : t('promptManagerEmpty')}
                </div>
              ) : (
                <div className="grid gap-1">
                  {normalizedPrompts.map((record) => {
                    const title = getPromptTitle(record);
                    const active = String(record.id || '') === selectedId;
                    const preview = String(record.prompt || '').replace(/\s+/g, ' ').trim();

                    return (
                      <button
                        key={record.id || title}
                        type="button"
                        className={cn(
                          'grid min-w-0 gap-1 rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active && 'border-primary/45 bg-primary/5'
                        )}
                        title={[title, preview].filter(Boolean).join('\n')}
                        onClick={() => selectPrompt(record)}
                      >
                        <span className="truncate font-medium">{title}</span>
                        <span className="truncate text-xs text-muted-foreground">{preview}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-3 rounded-md border border-border bg-card/70 p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-semibold">
                {draft.id ? getPromptTitle(draft) : t('promptManagerNew')}
              </div>
              <div
                className={cn(
                  'min-h-5 shrink-0 text-xs text-muted-foreground',
                  statusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
                  statusTone === 'error' && 'text-red-700 dark:text-red-200'
                )}
              >
                {status}
              </div>
            </div>

            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="promptManagerTitleInput" className="text-xs font-medium text-muted-foreground">
                {t('promptManagerTitleLabel')}
              </Label>
              <Input
                id="promptManagerTitleInput"
                value={draft.title}
                placeholder={t('promptManagerTitlePlaceholder')}
                disabled={busy}
                spellCheck={false}
                onChange={(event) => updateDraft('title', event.target.value)}
              />
            </div>

            <div className="grid min-h-0 gap-1.5">
              <Label htmlFor="promptManagerContentInput" className="text-xs font-medium text-muted-foreground">
                {t('promptManagerContentLabel')}
              </Label>
              <Textarea
                id="promptManagerContentInput"
                className="h-full min-h-[260px] resize-none font-mono text-sm leading-6"
                value={draft.prompt}
                placeholder={t('promptManagerContentPlaceholder')}
                disabled={busy}
                spellCheck={false}
                onChange={(event) => updateDraft('prompt', event.target.value)}
              />
            </div>

            <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background/60 p-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">{t('promptManagerAttachments')}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('promptManagerAttachmentCount', { count: draftAttachments.length })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button type="button" size="sm" variant="outline" onClick={() => addAttachments('image')} disabled={busy}>
                    <Image className="h-3.5 w-3.5" />
                    {t('promptManagerAddImage')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addAttachments('file')} disabled={busy}>
                    <FileText className="h-3.5 w-3.5" />
                    {t('promptManagerAddDocument')}
                  </Button>
                </div>
              </div>

              {draftAttachments.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-2.5 py-3 text-xs text-muted-foreground">
                  {t('promptManagerAttachmentEmpty')}
                </div>
              ) : (
                <div className="grid max-h-28 gap-1 overflow-y-auto pr-1">
                  {draftAttachments.map((attachment) => {
                    const title = getAttachmentTitle(attachment) || t('floatingComposerContextAttachment');
                    const Icon = attachment.kind === 'image' ? Image : FileText;
                    const meta = [
                      attachment.kind === 'image' ? t('floatingComposerContextImage') : t('floatingComposerContextFile'),
                      formatAttachmentSize(attachment.size),
                      attachment.truncated ? t('promptManagerAttachmentTruncated') : '',
                      !attachment.content && attachment.path ? t('promptManagerAttachmentBinary') : ''
                    ].filter(Boolean).join(' · ');

                    return (
                      <div
                        key={attachment.id}
                        className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card/70 px-2 py-1.5 text-xs"
                        title={[title, attachment.path, meta].filter(Boolean).join('\n')}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                        <span className="hidden max-w-[180px] shrink-0 truncate text-[11px] text-muted-foreground sm:block">{meta}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          title={t('promptManagerRemoveAttachment')}
                          onClick={() => removeAttachment(attachment.id)}
                          disabled={busy}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{selectedId ? selectedId : t('promptManagerNew')}</span>
              <span className="shrink-0 tabular-nums">
                {draft.prompt.length}
                {draftAttachments.length > 0 ? ` / ${draftAttachments.length}` : ''}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap">
          <Button type="button" onClick={reloadPrompts} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {t('reload')}
          </Button>
          <Button type="button" onClick={startNewPrompt} disabled={busy}>
            <Plus className="h-4 w-4" />
            {t('promptManagerNew')}
          </Button>
          <Button type="button" onClick={copyPrompt} disabled={busy || !String(draft.prompt || '').trim()}>
            <Copy className="h-4 w-4" />
            {t('copy')}
          </Button>
          <Button type="button" variant="destructive" onClick={deletePrompt} disabled={busy || !draft.id}>
            <Trash2 className="h-4 w-4" />
            {t('quickPromptDelete')}
          </Button>
          <Button type="button" variant="primary" onClick={savePrompt} disabled={busy || !String(draft.prompt || '').trim()}>
            <Save className="h-4 w-4" />
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
