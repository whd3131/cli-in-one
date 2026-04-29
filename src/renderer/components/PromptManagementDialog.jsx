import React from 'react';
import { PencilLine, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
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
    prompt
  };
}

export function PromptManagementDialog({
  loading = false,
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
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [statusTone, setStatusTone] = React.useState('');
  const busy = loading || saving;

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
    if (!open || dirty) {
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
  }, [dirty, fallbackTitle, normalizedPrompts, open, selectedPrompt]);

  const confirmDiscardDirty = React.useCallback(() => (
    !dirty || window.confirm(t('promptManagerDiscardConfirm'))
  ), [dirty, t]);

  const handleOpenChange = React.useCallback((nextOpen) => {
    if (!nextOpen && !confirmDiscardDirty()) {
      return;
    }

    if (!nextOpen) {
      setDirty(false);
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
    setDirty(false);
    setStatusMessage('');
  }, [confirmDiscardDirty, fallbackTitle, setStatusMessage]);

  const startNewPrompt = React.useCallback(() => {
    if (!confirmDiscardDirty()) {
      return;
    }

    setSelectedId('');
    setDraft(createQuickPromptDraft(null, fallbackTitle));
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
        prompt
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
  }, [draft.id, draft.prompt, draft.title, fallbackTitle, getPromptTitle, onSave, setStatusMessage, showToast, t]);

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

          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-card/70 p-3">
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

            <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{selectedId ? selectedId : t('promptManagerNew')}</span>
              <span className="shrink-0 tabular-nums">{draft.prompt.length}</span>
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
